# RF-074 — Pesquisas de satisfação (NPS) (design)

## Objetivo

Coletar, de forma automatizada e de baixo atrito, o NPS dos clientes: o cliente logado no
portal responde *"De 0 a 10, quanto você recomendaria [escritório]?"* + comentário opcional
quando está vencido, e a equipe acompanha o score num painel.

## Decisões (do brainstorm)

- **Onde o cliente responde:** dentro do **portal logado** (reusa a auth existente; sem link
  público por token). RLS por `auth_cliente_id()`.
- **Convite:** **só card no portal** — sem e-mail/WhatsApp. O card aparece no topo de
  `/portal` quando há pesquisa vencida.
- **Agendamento:** **lazy, sem cron** — o portal calcula "está vencido?" na hora; não há
  linhas pendentes pré-criadas nem job.
- **Gate do painel:** `podeCriarCliente` (admin/assistente/contador — a equipe operacional do
  grupo "Relacionamento").
- **Periodicidade padrão:** 90 dias.

## Arquitetura

Duas fatias, cada uma uma release: **A** coleta (portal), **B** painel + config.

### Fatia A — Coleta no portal

#### 1. Migration `0123_nps.sql`

```sql
-- RF-074 (Fatia A): coleta de NPS pelo portal do cliente.
create table if not exists nps_resposta (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  nota int not null check (nota between 0 and 10),
  comentario text,
  criada_em timestamptz not null default now()
);
create index if not exists ix_nps_cliente on nps_resposta(cliente_id, criada_em);

alter table nps_resposta enable row level security;

-- Cliente lê e insere só a própria; equipe lê tudo; ninguém edita/apaga (imutável, como portal_acesso).
drop policy if exists nps_sel_cliente on nps_resposta;
create policy nps_sel_cliente on nps_resposta for select
  using (cliente_id = auth_cliente_id() or auth_papel() in ('admin', 'assistente', 'contador'));
drop policy if exists nps_ins_cliente on nps_resposta;
create policy nps_ins_cliente on nps_resposta for insert
  with check (cliente_id = auth_cliente_id());

-- Config no singleton escritorio_config.
alter table escritorio_config add column if not exists nps_ativo boolean not null default false;
alter table escritorio_config add column if not exists nps_periodicidade_dias int not null default 90;
alter table escritorio_config add column if not exists nps_pergunta text;
```

Notas: idempotente (`if not exists`, `drop policy if exists`). `auth_cliente_id()`
(0085) e `auth_papel()` (0001) já existem. **Sem** policy de UPDATE/DELETE: a resposta é
imutável. Aplicada por `node --env-file=.env.local scripts/db-migrate.mjs` antes do deploy.

#### 2. Lib pura de vencimento — `src/lib/nps/devido.ts`

Função pura testável (recebe dados, não toca Supabase):

```ts
export function npsDevido(args: {
  ativo: boolean;
  periodicidadeDias: number;
  ultimaRespostaIso: string | null; // criada_em da resposta mais recente do cliente
  hojeIso: string;                    // "YYYY-MM-DD" em America/Sao_Paulo
}): boolean;
```

Regra: `false` se `!ativo`. Senão `true` quando `ultimaRespostaIso` é `null` ou a diferença
em dias entre `hojeIso` e a data da última resposta é `>= periodicidadeDias`.

#### 3. Card no portal — `src/app/(portal)/portal/page.tsx` + componente

- Na `PortalInicioPage`, ler config (`escritorio_config`: `nps_ativo`, `nps_periodicidade_dias`,
  `nps_pergunta`) e a resposta mais recente do cliente (`nps_resposta` ordenada por
  `criada_em desc limit 1` — a RLS já restringe ao próprio cliente). Calcular `npsDevido(...)`.
- Se devido, renderizar `<CardNps pergunta={...} />` (client component) no topo: escala 0–10
  clicável, `<textarea>` de comentário, botões **Responder** e **Agora não**.
- **Agora não**: esconde o card via `localStorage` (client-side, chave com timestamp; reaparece
  após alguns dias). Zero código de servidor — o card some de vez ao responder ou quando a
  periodicidade renova.
- Pergunta exibida: `nps_pergunta` se preenchida, senão o texto padrão
  *"De 0 a 10, quanto você recomendaria nosso escritório a um colega?"*.

#### 4. Action — `src/app/(portal)/portal/nps-actions.ts`

```ts
"use server";
export async function responderNps(nota: number, comentario: string): Promise<{ ok: true } | { erro: string }>;
```

- Gate igual ao `gate()` do portal: `getPerfilAtual()` + `ehCliente(p.papel)` + `p.clienteId`.
- Valida `nota` inteira em 0–10 (senão `{ erro }`); `comentario` trim, opcional, corta em 2000.
- Insere via **cliente Supabase do usuário** (`createServerSupabase()`) — a RLS
  (`nps_ins_cliente`) prova a titularidade; `cliente_id` vem de `auth_cliente_id()` no banco,
  não do navegador. `revalidatePath("/portal")` para o card sumir.

### Fatia B — Painel da equipe + config

#### 5. Lib pura de score — `src/lib/nps/score.ts`

```ts
export type ResumoNps = {
  total: number;
  promotores: number; // nota 9-10
  neutros: number;    // nota 7-8
  detratores: number; // nota 0-6
  score: number;      // %promotores - %detratores, arredondado (0 quando total=0)
};
export function resumirNps(notas: number[]): ResumoNps;
```

Regra: classifica cada nota; `score = round(prom/total*100) - round(detr/total*100)` quando
`total > 0`, senão `0`. (NPS varia de -100 a +100.)

#### 6. Action + página `/nps`

- `src/app/(app)/nps/actions.ts` → `relatorioNps(de, ate)`: gate `podeCriarCliente`,
  `createAdminSupabase()`, lê `nps_resposta` no período (`criada_em`), devolve
  `{ resumo: ResumoNps, comentarios: { cliente, nota, comentario, data }[] }` (comentários só
  das linhas com texto, join em `clientes.razao_social`, mais recentes primeiro).
- `src/app/(app)/nps/page.tsx` (server): gate no topo `if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/")`;
  filtro de período (form GET, default mês corrente); **score em destaque** (gauge SVG à mão,
  estilo `financeiro/orcado-realizado/LinhaEvolucao.tsx`, cor `#0FA968`); barra
  promotor/neutro/detrator; contagem de respostas; lista de comentários (nota + cliente + data).
- Estado vazio quando `total = 0` ("Nenhuma resposta no período").

#### 7. Menu — `src/lib/ui/navegacao.ts`

No grupo **"Relacionamento"**, adicionar `{ href: "/nps", label: "NPS" }` condicionado a
`podeCriarCliente(papel)` (mesmo gate dos demais itens de equipe do grupo).

#### 8. Config UI — `src/app/(app)/configuracoes/nps/`

Página no molde de `configuracoes/followup/`: interruptor `nps_ativo`, `nps_periodicidade_dias`
(número) e `nps_pergunta` (texto). Gate admin (as configs de escritório são admin-only). Item
em `configuracoes/page.tsx`.

## Testes

- `src/tests/nps/devido.test.ts`: inativo → nunca devido; sem resposta + ativo → devido;
  resposta há menos de N dias → não devido; resposta há N dias ou mais → devido; N configurável.
- `src/tests/nps/score.test.ts`: classificação 9-10/7-8/0-6; score = %prom − %detr; total 0 →
  score 0; só promotores → 100; só detratores → -100; arredondamento.

## Fora de escopo (YAGNI)

Envio por e-mail/WhatsApp; cron; link público por token; segmentação de quem recebe (todo
cliente ativo que loga e está vencido); série temporal mês a mês do score (o painel filtra
período, sem gráfico de tendência na 1ª versão); resposta editável.
