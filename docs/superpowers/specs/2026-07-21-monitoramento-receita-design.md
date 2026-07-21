# RF-084 — Monitoramento de fontes públicas (situação cadastral + Simples) (design)

## Objetivo

Persistir a situação cadastral e a opção pelo Simples/MEI de cada cliente, reconsultar
periodicamente e **alertar a equipe quando muda** (ficou INAPTA/SUSPENSA/BAIXADA, ou saiu do
Simples). A consulta pública (`consultarCnpj`, BrasilAPI→ReceitaWS) já existe — hoje o resultado
é descartado; passa a ser persistido e comparado.

## Decisões (do brainstorm)

- **Escopo v1:** situação cadastral **+ opção Simples/MEI** (ambos vêm no mesmo request).
- **CNDs:** fora do v1 — **fatia futura** (greenfield pesado: captcha/certificado, sem provider
  gratuito).
- **Alerta:** badge no menu + tela de alertas. **Não** altera o `status` do cliente
  (inaptidão é sinal para a equipe agir, nunca inativação automática).
- **Gate da tela de alertas:** `podeCriarCliente` (equipe). **Frequência padrão:** 7 dias.
- **Fatiamento:** A = fundação + persistência no botão manual; B = automação (cron + config).

## Arquitetura

### Fatia A — Fundação + persistência manual

#### 1. Migration `0125_monitoramento_receita.sql`

```sql
-- RF-084 (Fatia A): situação cadastral + opção Simples, e alertas de mudança.
alter table clientes add column if not exists situacao_cadastral text;
alter table clientes add column if not exists optante_simples boolean;
alter table clientes add column if not exists situacao_verificada_em timestamptz;

create table if not exists receita_alerta (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  tipo text not null check (tipo in ('situacao', 'simples')),
  de text,
  para text,
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por uuid references usuarios(id)
);
create index if not exists ix_receita_alerta_aberto on receita_alerta(cliente_id) where resolvido_em is null;

alter table receita_alerta enable row level security;
-- Equipe lê; escrita (insert do motor, resolve) é server-side via service_role.
drop policy if exists receita_alerta_sel on receita_alerta;
create policy receita_alerta_sel on receita_alerta for select
  using (auth_papel() in ('admin', 'assistente', 'contador', 'financeiro'));

-- Config singleton (molde de obrigacao_config).
create table if not exists receita_config (
  id smallint primary key default 1 check (id = 1),
  ativo boolean not null default false,
  frequencia_dias int not null default 7,
  badge_ativo boolean not null default true
);
insert into receita_config (id) values (1) on conflict do nothing;
alter table receita_config enable row level security;
drop policy if exists receita_config_sel on receita_config;
create policy receita_config_sel on receita_config for select to authenticated using (true);
drop policy if exists receita_config_wr on receita_config;
create policy receita_config_wr on receita_config for all
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
```

- `ativo`/`frequencia_dias` só são usados pelo cron (Fatia B); na A o botão manual persiste
  independentemente. `badge_ativo` gate o badge desde a A.
- Sem policy de INSERT/UPDATE em `receita_alerta`: motor e resolve usam service_role.

#### 2. Mapear os campos novos — `src/lib/receita/brasilapi.ts`

- `DadosReceita` ganha `optanteSimples: boolean | null`.
- `mapearReceita` (BrasilAPI): `optanteSimples` derivado de `opcao_pelo_simples`/`opcao_pelo_mei`
  (`true` se algum é `true`; `false` se algum é `false`; senão `null`).
- `mapearReceitaWs` (fallback): `optanteSimples` de `d.simples?.optante`/`d.simei?.optante`
  quando presentes, senão `null`.
- `mesclarDados`: `optanteSimples: primario.optanteSimples ?? secundario.optanteSimples`.

Um helper puro `lerOptante(d): boolean | null` concentra a regra (testável).

#### 3. Detecção de mudança — `src/lib/receita/monitoramento.ts` (lib pura)

```ts
export type EstadoReceita = { situacao: string | null; optanteSimples: boolean | null };
export type AlertaDetectado = { tipo: "situacao" | "simples"; de: string; para: string };

export function detectarMudancas(anterior: EstadoReceita, atual: EstadoReceita): AlertaDetectado[];
```

Regras (comparação de situação normalizada — trim + maiúsculas):
- **Situação:** se `anterior.situacao` é `null` (1ª observação), alerta só quando `atual.situacao`
  existe e **não** é `ATIVA` (`de: "—"`). Senão, alerta em qualquer transição
  (`anterior ≠ atual`).
- **Simples:** só com baseline (`anterior.optanteSimples != null`): alerta quando muda
  (`de/para` = "Sim"/"Não"). A perda da opção (`true→false` = exclusão) é o caso-ouro.

#### 4. Persistir no botão manual — `src/app/(app)/integracoes/dominio/receita.ts`

`atualizarViaReceita` passa a, além de razão/endereço:
- Ler o estado atual do cliente (`situacao_cadastral`, `optante_simples`).
- `detectarMudancas(anterior, { situacao, optanteSimples })` → para cada alerta, `insert` em
  `receita_alerta` (service_role).
- `update clientes set situacao_cadastral, optante_simples, situacao_verificada_em = now()`.
- Retorno segue expondo `situacao` para o toast.

#### 5. Tela de alertas + badge — `/clientes/alertas-receita`

- `Badges` (`src/lib/ui/navegacao.ts`) ganha `monitoramentoReceita: number`; `layout.tsx` conta
  `receita_alerta` abertos (via sessão/RLS, no molde de `contarDocsVencidos`), respeitando
  `receita_config.badge_ativo`. Item de menu em "Operação" gated por `podeCriarCliente`.
- Página `/clientes/alertas-receita` (gate `podeCriarCliente`): lista alertas abertos
  (cliente com link, tipo, "de → para", quando) e botão **Resolver** →
  `resolverAlertaReceita(id)` (gate `podeCriarCliente`, service_role: `resolvido_em=now()`,
  `resolvido_por`). A ficha do cliente mostra a situação atual (`situacao_cadastral`).

### Fatia B — Automação (cron + config)

#### 6. Motor de varredura — `src/app/(app)/.../monitorar-receita.ts` (server-only)

`monitorarReceitaCore()` (service_role): se `receita_config.ativo`, seleciona clientes com CNPJ
14 dígitos, `excluido_em is null`, `status='ativo'` e `situacao_verificada_em` nulo ou mais
velho que `frequencia_dias`. Itera **com espaçamento entre chamadas** (`esperar(ms)`, molde do
Inter) para não estourar o 429 da BrasilAPI; para cada, consulta, `detectarMudancas`, grava
alertas + atualiza colunas. Retorna resumo `{ consultados, alertas, erros }`.

#### 7. Rota cron + job — `src/app/api/cron/monitorar-receita/route.ts` + `scripts/bootstrap-cron.mjs`

Rota no molde de `sincronizar-boletos` (auth `CRON_SECRET`, chama o motor, devolve JSON). Job
diário no array `JOBS` (ex.: `"0 8 * * *"`) — o motor decide por cliente pela `frequencia_dias`,
então o cron pode rodar diário e a config controla a cadência real. `npm run cron:bootstrap`.

#### 8. Config UI — `src/app/(app)/configuracoes/receita/`

Página no molde de `configuracoes/obrigacoes/`: liga/desliga (`ativo`), `frequencia_dias`,
`badge_ativo`. Gate admin. Item em `configuracoes/page.tsx`.

## Testes

- `src/tests/receita/monitoramento.test.ts` (`detectarMudancas`): 1ª obs ATIVA → nada; 1ª obs
  INAPTA → alerta; ATIVA→INAPTA → alerta; INAPTA→INAPTA → nada; Simples true→false → alerta;
  Simples null→true (baseline) → nada; Simples true→true → nada.
- `src/tests/receita/brasilapi.test.ts` (ou o existente): `lerOptante` — algum `true` → true;
  algum `false` (sem true) → false; ausentes → null.

## Fora de escopo (v1)

CNDs (federal/estadual/municipal/trabalhista/FGTS — **fatia futura**); auto-alteração do
`status` do cliente; consulta de PF/CPF; `data_situacao_cadastral` (só a situação atual, não a
data em que a Receita mudou); histórico completo além dos alertas.
