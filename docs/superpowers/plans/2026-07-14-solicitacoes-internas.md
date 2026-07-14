# Solicitações internas entre departamentos (RF-045) — Plano de implementação

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.

**Objetivo:** um departamento pede algo a outro, o pedido cai numa **fila** com **SLA do destino**, alguém
**assume**, conversa na thread, converte em tarefa e resolve.

**Arquitetura:** tabela própria (`solicitacao_interna`), **não** a do portal — a de lá gira em torno de
`auth_cliente_id()` e de `cliente_id` obrigatório. Reaproveita as **lições** do RF-054: numeração, SLA no
servidor e **gatilho que sobrescreve campos forjáveis** (a lição da 0088: *default não é validação*).

**Stack:** Postgres/RLS, Next 16 Server Actions, vitest.

## Restrições globais

- **Prazo NUNCA vem do formulário:** é calculado no servidor pelo SLA do **departamento de destino**. Se
  quem abre pudesse escolher, todo pedido nasceria "para ontem".
- **Autoria é forçada por gatilho** (`solicitante_id`, `autor_id` ← `auth.uid()`), não por `default`.
- O papel `cliente` é negado por padrão (nenhuma policy o lista) — o portal não enxerga nada disto.
- Rodar `npm run lint && npm run typecheck && npm test && npm run build` antes de cada commit.

---

### Tarefa 1: Banco — tabelas, gatilho e RLS

**Arquivos:** Criar `supabase/migrations/0095_solicitacoes_internas.sql`

- [ ] **Passo 1: Tabelas**

```sql
-- RF-045: solicitações internas entre departamentos, com SLA e fila.
do $$ begin create type solic_interna_status as enum ('aberta','em_andamento','respondida','resolvida');
exception when duplicate_object then null; end $$;

-- SLA por departamento: Fiscal responde em 2 dias, Pessoal em 1, Contábil em 3.
create table if not exists departamento_sla (
  departamento departamento primary key,
  dias int not null default 3 check (dias between 0 and 60)
);
insert into departamento_sla (departamento, dias) values
  ('contabil', 3), ('fiscal', 2), ('pessoal', 1), ('societario', 5)
on conflict (departamento) do nothing;

-- O departamento do colaborador (a origem do pedido). Null = a pessoa escolhe ao abrir.
alter table usuarios add column if not exists departamento departamento;

create sequence if not exists solic_interna_numero_seq;

create table if not exists solicitacao_interna (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null default nextval('solic_interna_numero_seq'),
  origem departamento not null,
  destino departamento not null,
  cliente_id uuid references clientes(id) on delete set null,
  assunto text not null,
  status solic_interna_status not null default 'aberta',
  prazo date,
  solicitante_id uuid references usuarios(id),
  responsavel_id uuid references usuarios(id),   -- null = na fila do destino
  tarefa_id uuid references tarefa(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  resolvida_em timestamptz
);
create index if not exists ix_solic_int_destino on solicitacao_interna(destino, status);
create index if not exists ix_solic_int_resp on solicitacao_interna(responsavel_id);

create table if not exists solicitacao_interna_mensagem (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references solicitacao_interna(id) on delete cascade,
  autor_id uuid references usuarios(id),
  corpo text not null,
  criado_em timestamptz not null default now()
);
create index if not exists ix_solic_int_msg on solicitacao_interna_mensagem(solicitacao_id, criado_em);
```

- [ ] **Passo 2: Gatilhos** (a lição da 0088 — *default não é validação*)

```sql
create or replace function solic_interna_integridade() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_sla int;
begin
  new.atualizado_em := now();

  if tg_op = 'INSERT' then
    -- Autoria: quem está autenticado (service_role, com auth.uid() nulo, pode definir).
    new.solicitante_id := coalesce(auth.uid(), new.solicitante_id);
    new.numero := nextval('solic_interna_numero_seq');
    new.status := 'aberta';
    new.resolvida_em := null;
    -- PRAZO PELO SLA DO DESTINO — nunca o que veio no formulário.
    select dias into v_sla from departamento_sla where departamento = new.destino;
    new.prazo := current_date + coalesce(v_sla, 3);
  end if;

  if new.status = 'resolvida' and new.resolvida_em is null then new.resolvida_em := now(); end if;
  if new.status <> 'resolvida' then new.resolvida_em := null; end if;
  return new;
end $$;

drop trigger if exists trg_solic_interna_integridade on solicitacao_interna;
create trigger trg_solic_interna_integridade before insert or update on solicitacao_interna
  for each row execute function solic_interna_integridade();

create or replace function solic_interna_msg_integridade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.autor_id := coalesce(auth.uid(), new.autor_id);
  return new;
end $$;

drop trigger if exists trg_solic_interna_msg on solicitacao_interna_mensagem;
create trigger trg_solic_interna_msg before insert on solicitacao_interna_mensagem
  for each row execute function solic_interna_msg_integridade();
```

- [ ] **Passo 3: RLS** — comunicação interna: a equipe toda lê e escreve; `cliente` negado por omissão.

```sql
alter table departamento_sla enable row level security;
alter table solicitacao_interna enable row level security;
alter table solicitacao_interna_mensagem enable row level security;

do $$ begin
  drop policy if exists dep_sla_sel on departamento_sla;
  create policy dep_sla_sel on departamento_sla for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists dep_sla_write on departamento_sla;
  create policy dep_sla_write on departamento_sla for all to authenticated
    using (auth_papel() = 'admin') with check (auth_papel() = 'admin');

  drop policy if exists solic_int_sel on solicitacao_interna;
  create policy solic_int_sel on solicitacao_interna for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists solic_int_ins on solicitacao_interna;
  create policy solic_int_ins on solicitacao_interna for insert to authenticated
    with check (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists solic_int_upd on solicitacao_interna;
  create policy solic_int_upd on solicitacao_interna for update to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'))
    with check (auth_papel() in ('admin','assistente','contador','financeiro'));

  drop policy if exists solic_int_msg_sel on solicitacao_interna_mensagem;
  create policy solic_int_msg_sel on solicitacao_interna_mensagem for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists solic_int_msg_ins on solicitacao_interna_mensagem;
  create policy solic_int_msg_ins on solicitacao_interna_mensagem for insert to authenticated
    with check (auth_papel() in ('admin','assistente','contador','financeiro'));
end $$;
```

- [ ] **Passo 4:** `npm run db:migrate` → `0095` aplicada.

- [ ] **Passo 5: Asserts de RLS** (`supabase/tests/rls.test.sql`):
  - o **prazo forjado** no INSERT é **sobrescrito** pelo SLA do destino (inserir com `prazo = '2030-01-01'`
    e conferir que virou `current_date + sla`);
  - `solicitante_id` **forjado** é sobrescrito por `auth.uid()` (inserir como contador informando o id do
    admin; ler de volta e conferir que ficou o do contador);
  - `autor_id` **forjado** na mensagem é sobrescrito (mesma prova do RF-054);
  - **cliente do portal (…005) não vê nada** (0 linhas nas duas tabelas);
  - `departamento_sla`: assistente **lê**, mas **não altera** (`insufficient_privilege`).
  Rodar `npm run db:test`.

- [ ] **Passo 6: Commit**

```bash
git add supabase/migrations/0095_solicitacoes_internas.sql supabase/tests/rls.test.sql
git commit -m "feat(interno): solicitacoes entre departamentos com SLA, fila e gatilho anti-falsificacao"
```

---

### Tarefa 2: Regras puras + testes

**Arquivos:** Criar `src/lib/solicitacoes/interna.ts`, `src/tests/solicitacoes/interna.test.ts`

**Interfaces produzidas:**

```ts
export type SolicInternaStatus = "aberta" | "em_andamento" | "respondida" | "resolvida";
export const SOLIC_INTERNA_STATUS: { valor: SolicInternaStatus; rotulo: string }[];
export function rotuloStatusInterno(s: SolicInternaStatus): string;
export function estaVencida(status: SolicInternaStatus, prazo: string | null, hoje: string): boolean;
export type ItemFila = { id: string; prazo: string | null; status: SolicInternaStatus; responsavelId: string | null };
export function ordenarFila<T extends ItemFila>(itens: T[], hoje: string): T[];
export function slaDoDepartamento(slas: { departamento: string; dias: number }[], depto: string): { dias: number; padrao: boolean };
```

- [ ] **Passo 1: Testes primeiro**

```ts
import { describe, it, expect } from "vitest";
import { estaVencida, ordenarFila, slaDoDepartamento } from "@/lib/solicitacoes/interna";

describe("estaVencida", () => {
  it("vencida quando o prazo passou e não está resolvida", () => {
    expect(estaVencida("aberta", "2026-07-10", "2026-07-14")).toBe(true);
  });

  it("resolvida NUNCA conta como vencida (o trabalho acabou)", () => {
    expect(estaVencida("resolvida", "2026-07-10", "2026-07-14")).toBe(false);
  });

  it("sem prazo, não vence", () => {
    expect(estaVencida("aberta", null, "2026-07-14")).toBe(false);
  });

  it("no dia do prazo ainda não venceu", () => {
    expect(estaVencida("aberta", "2026-07-14", "2026-07-14")).toBe(false);
  });
});

describe("ordenarFila", () => {
  it("vencidas primeiro; depois por prazo; sem prazo por último", () => {
    const itens = [
      { id: "futura", prazo: "2026-07-20", status: "aberta" as const, responsavelId: null },
      { id: "vencida", prazo: "2026-07-01", status: "aberta" as const, responsavelId: null },
      { id: "sem-prazo", prazo: null, status: "aberta" as const, responsavelId: null },
      { id: "hoje", prazo: "2026-07-14", status: "aberta" as const, responsavelId: null },
    ];
    expect(ordenarFila(itens, "2026-07-14").map((i) => i.id)).toEqual(["vencida", "hoje", "futura", "sem-prazo"]);
  });
});

describe("slaDoDepartamento", () => {
  const slas = [{ departamento: "fiscal", dias: 2 }];

  it("usa o SLA cadastrado", () => {
    expect(slaDoDepartamento(slas, "fiscal")).toEqual({ dias: 2, padrao: false });
  });

  it("sem SLA cadastrado, cai no padrão E SINALIZA (a tela avisa)", () => {
    expect(slaDoDepartamento(slas, "contabil")).toEqual({ dias: 3, padrao: true });
  });
});
```

- [ ] **Passo 2:** `npm test -- interna` → FAIL. Implementar. `npm test -- interna` → PASS.
- [ ] **Passo 3: Commit**

```bash
git add src/lib/solicitacoes/interna.ts src/tests/solicitacoes/interna.test.ts
git commit -m "feat(interno): regras de SLA, vencimento e ordenacao da fila"
```

---

### Tarefa 3: Actions

**Arquivos:** Criar `src/app/(app)/solicitacoes/internas/actions.ts`

Gate: `podeGerenciarTarefas` (toda a equipe — é comunicação interna).

- [ ] **Passo 1:**
  - `listarFila(f: {destino?, origem?, status?, vencidas?, minhas?, semDono?})` — a origem/destino saem do
    banco; a ordenação usa `ordenarFila()`.
  - `abrirSolicitacaoInterna({destino, origem?, assunto, mensagem, clienteId?, responsavelId?})` — a
    **origem** vem de `usuarios.departamento` do solicitante; se estiver vazia, exige a escolhida no
    formulário. **Não envia prazo** (o gatilho calcula). Insere a primeira mensagem.
  - `assumir(id)` — `responsavel_id = perfil.id` e status → `em_andamento`. **Só se estiver sem dono** (a
    action confere antes; dois cliques simultâneos não podem trocar o dono pelas costas).
  - `responderInterna(id, corpo)` — insere mensagem; status → `respondida` se estava aberta/em andamento.
  - `definirStatusInterna(id, status)`, `definirResponsavelInterno(id, usuarioId | null)`.
  - `converterEmTarefaInterna(id)` — cria `tarefa` (cliente, prazo e responsável da solicitação) e guarda
    `tarefa_id`; se já houver, devolve o existente.
  - `contadoresFila()` — `{ minhaFila, vencidas }` para o Início.

- [ ] **Passo 2: Verificar e commitar**

```bash
npm run lint && npm run typecheck && npm test
git add "src/app/(app)/solicitacoes/internas"
git commit -m "feat(interno): actions de fila, assumir, responder e converter em tarefa"
```

---

### Tarefa 4: Telas

**Arquivos:**
- Criar: `src/app/(app)/solicitacoes/internas/page.tsx`, `NovaInterna.tsx`, `[id]/page.tsx`, `[id]/Atendimento.tsx`
- Criar: `src/app/(app)/configuracoes/sla/page.tsx`, `FormSla.tsx`, `actions.ts` (admin)
- Modificar: `src/app/(app)/solicitacoes/page.tsx` (abas **Do cliente** / **Internas**)
- Modificar: `src/app/(app)/page.tsx` (Início: contador da minha fila e vencidas)
- Modificar: `src/app/(app)/usuarios/*` (campo **departamento** do colaborador)
- Modificar: `src/app/(app)/configuracoes/page.tsx` (item "SLA por departamento")

- [ ] **Passo 1: Fila** (`/solicitacoes/internas`) — agrupada por destino, com filtros (destino, origem,
  status, **SLA vencido**, **só as minhas**, **sem responsável**); vencidas em vermelho; botão "Nova".
- [ ] **Passo 2: Detalhe** — thread, **"Assumir"** (só quando está na fila), status, responsável,
  **"Converter em tarefa"**, resolver.
- [ ] **Passo 3: SLA por departamento** (Configurações, admin) — dias por departamento, com o aviso de que o
  prazo é aplicado **no momento da abertura** (mudar o SLA não reescreve solicitações já abertas).
- [ ] **Passo 4: Departamento do usuário** — campo na tela de Usuários; sem ele, o solicitante escolhe a
  origem ao abrir.
- [ ] **Passo 5: Início** — "N na sua fila · M vencidas", com link. **Uma fila que ninguém abre é onde
  pedidos vão morrer.**
- [ ] **Passo 6: Verificar e commitar**

```bash
npm run lint && npm run typecheck && npm test && npm run build
git add -A && git commit -m "feat(interno): fila, detalhe, SLA por departamento e contador no inicio"
```

---

### Tarefa 5: Documentação, entrega e tag

- [ ] **Passo 1:** `docs/DOCUMENTACAO.md` (seção "Solicitações internas" — fila, SLA do destino, gatilho
  anti-falsificação) + `CHANGELOG.md`.
- [ ] **Passo 2:** Commit, merge `develop` → `main`, push.
- [ ] **Passo 3: Pedir ao usuário, explicitamente:** implantar e validar — configurar o SLA de dois
  departamentos, definir o departamento de um usuário, abrir uma solicitação do Fiscal para o Contábil
  (nasce **na fila, sem dono**, com o prazo do **Contábil**), **assumir**, responder, converter em tarefa e
  resolver; conferir o contador no Início.
- [ ] **Passo 4:** Após o "validei, deu certo": tag `v5.29.0`.
