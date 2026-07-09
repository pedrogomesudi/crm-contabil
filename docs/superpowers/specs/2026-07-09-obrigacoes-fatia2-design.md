# Obrigações e Compliance — Fatia 2 (Baixa com comprovante + Painel de riscos) — Design

**Data:** 2026-07-09
**Marco:** segunda fatia do módulo de Obrigações e Compliance (RF-033 baixa com comprovante obrigatório;
RF-034 painel de riscos). Constrói sobre a Fatia 1 (matriz + geração do calendário, já em produção).

**Contexto (Fatia 1 entregue):** `obrigacao` (matriz curável) e `obrigacao_instancia` (item por
cliente+competência, `status` pendente/dispensada, `responsavel_id` = contador do cliente,
`vencimento_legal`/`vencimento_interno`). Calendário `/obrigacoes` + seção na ficha + geração por
cron/botão. Padrões reaproveitados: anexo do onboarding (`storage.from("documentos").upload(...)` +
`createSignedUrl(path, 60)` via `createAdminSupabase`, caminho `onboarding/{proc}/{item}/...`);
`classificarAlerta(prazo, hoje)` (`@/lib/onboarding/alertas`) → em_breve/vencido/critico; badge no
Sidebar no padrão do `contarAlertas` do onboarding.

**Decisões de brainstorming:**
- **Comprovante configurável por obrigação** — flag `comprovante_obrigatorio` na matriz (padrão true).
- **Painel de riscos = página dedicada** `/obrigacoes/riscos` + badge no menu, agrupada por responsável
  (colaborador), com os baldes Vencendo hoje / Vencidas / Sem responsável, cruzando as competências em
  aberto. **Departamento fora** (não existe no cadastro).
- **Auditoria da entrega** = colunas na própria instância (`entregue_por`/`entregue_em`), sem tabela à
  parte. Risco baseado no **vencimento interno** (prazo operacional do escritório).

**Escopo desta fatia:** baixa/entrega com comprovante (RF-033) + painel de riscos (RF-034).
**Fora (Fatia 3):** alertas escalonados (RF-035), suspensão para inativos/retroativos (RF-036),
relatório de conformidade (RF-037); dimensão por departamento.

## 1. Modelo de dados — migration `0062_obrigacao_baixa.sql` (idempotente)

- **`obrigacao`:** `alter table obrigacao add column if not exists comprovante_obrigatorio boolean not null default true;`
- **Enum:** `alter type obrigacao_instancia_status add value if not exists 'entregue';`
  — **statement isolado, fora de bloco/transação** (Postgres não permite `add value` dentro de
  transação junto com uso; o runner aplica cada arquivo; manter o `add value` como primeiro comando e
  os `alter table` depois. Se o runner envolver o arquivo em transação, quebrar em migration própria só
  para o `add value`).
- **`obrigacao_instancia`:**
  - `add column if not exists comprovante_path text;`
  - `add column if not exists entregue_em date;`
  - `add column if not exists entregue_por uuid references usuarios(id);`
  - `add column if not exists observacao text;`
- RLS existente cobre: as políticas de `obrigacao_instancia` (select/insert/update por
  `exists (clientes)`) já autorizam a atualização de entrega; `obrigacao` (update só admin) cobre o novo
  flag.

## 2. Baixa da obrigação (RF-033) — `src/app/(app)/obrigacoes/baixa-actions.ts`

Gate `podeCriarCliente` (RLS isola por cliente). Uso de `createAdminSupabase()` para o Storage (mesmo
padrão do anexo do onboarding).

```ts
export async function darBaixa(instanciaId: string, formData: FormData): Promise<{ ok?: boolean; erro?: string }>;
export async function reabrir(instanciaId: string): Promise<{ ok?: boolean; erro?: string }>;
export async function alternarDispensa(instanciaId: string, dispensar: boolean): Promise<{ ok?: boolean; erro?: string }>;
export async function urlComprovante(instanciaId: string): Promise<{ url?: string; erro?: string }>;
```

- **`darBaixa`** — lê `comprovante` (File), `observacao` (string) e `data` (ISO, default hoje) do
  FormData. Carrega a instância + `obrigacao.comprovante_obrigatorio`. Se obrigatório e sem arquivo →
  `{ erro: "Comprovante obrigatório." }`. Havendo arquivo: upload em
  `obrigacoes/{cliente_id}/{instancia_id}/{uuid}-{nomeSeguro}` no bucket `documentos`; em falha do
  upload → erro. Atualiza a instância: `status='entregue'`, `comprovante_path`, `entregue_em=data`,
  `entregue_por=perfil.id`, `observacao`. `revalidatePath` do calendário e da ficha.
- **`reabrir`** — volta a `status='pendente'`, zera `entregue_em`/`entregue_por`/`observacao` e **remove
  o arquivo** do Storage (se houver), limpando `comprovante_path`. A mudança de status é a trilha.
- **`alternarDispensa`** — `dispensar=true` → `status='dispensada'`; `false` → `pendente` (só se não
  entregue). Não mexe em comprovante.
- **`urlComprovante`** — resolve `comprovante_path` e retorna `createSignedUrl(path, 60)`.

**Enforcement:** obrigatoriedade do comprovante validada **no servidor** (não confiar na UI).

**UI:** no calendário `/obrigacoes` e na seção da ficha do cliente, cada linha:
- **Pendente:** botões **"Dar baixa"** (abre mini-form inline: input de arquivo + observação + data,
  default hoje; "Dar baixa" desabilitado sem arquivo quando a obrigação exige comprovante) e
  **"Dispensar"**.
- **Entregue:** texto **"✓ entregue em dd/mm por {nome}"** + link **"comprovante"** (via
  `urlComprovante`) + **"Reabrir"**.
- **Dispensada:** **"dispensada"** + **"Reativar"**.
- O selo de status/severidade reflete pendente (com severidade via `classificarAlerta`) / entregue /
  dispensada.

## 3. Painel de riscos (RF-034)

**Helper puro** `src/lib/obrigacoes/risco.ts` (TDD):
```ts
export type RiscoBucket = "vencida" | "vencendo_hoje" | "no_prazo";
export function classificarRisco(vencimentoInterno: string, hoje: string): RiscoBucket;
export type ItemRisco = { id: string; clienteNome: string; obrigacaoNome: string; competencia: string; periodicidade: string; vencimentoInterno: string; vencimentoLegal: string; responsavelId: string | null; responsavelNome: string | null };
export type GrupoRisco = { responsavelId: string | null; responsavelNome: string | null; itens: ItemRisco[] };
export type PainelRiscos = { resumo: { vencendoHoje: number; vencidas: number; semResponsavel: number }; grupos: GrupoRisco[] };
export function montarPainel(itens: ItemRisco[], hoje: string): PainelRiscos;
```
- **`classificarRisco`** — `vencida` se `vencimentoInterno < hoje`; `vencendo_hoje` se `=== hoje`; senão
  `no_prazo` (comparação lexicográfica de ISO `YYYY-MM-DD`, válida).
- **`montarPainel`** — sobre itens **pendentes** (todas as competências): `resumo.vencendoHoje` e
  `resumo.vencidas` por `classificarRisco`; `resumo.semResponsavel` = itens com `responsavelId === null`.
  Agrupa por `responsavelId`; o grupo **sem responsável** (`responsavelId === null`) vem **sempre
  primeiro**, os demais ordenados por `responsavelNome`. Dentro de cada grupo, ordena por
  `vencimentoInterno` ascendente (mais atrasado primeiro).

**Actions** (em `obrigacoes/actions.ts`):
- `listarRiscos(opts?: { soMeus?: boolean }): Promise<PainelRiscos>` — carrega `obrigacao_instancia`
  `status='pendente'` com joins (`obrigacao(nome, periodicidade)`, `clientes(razao_social)`,
  `usuarios:responsavel_id(nome)`); RLS isola o contador aos seus. Se `soMeus`, filtra
  `responsavel_id = perfil.id`. Monta com `montarPainel(itens, hoje)` (hoje em timezone SP).
- `contarRiscos(): Promise<number>` — nº de críticas (vencidas + vencendo hoje) para o badge; retorna 0
  sem permissão.

**UI** `/obrigacoes/riscos/page.tsx` (server, gate `podeCriarCliente` → `redirect("/")`) +
`PainelRiscosView.tsx` (client):
- **Cartões de resumo:** **Vencendo hoje**, **Vencidas** (vermelho/`text-negativo`), **Sem responsável**.
- **Lista por responsável:** grupo **"Sem responsável"** destacado no topo; cada item com cliente,
  obrigação, vencimento interno/legal, selo `classificarAlerta`, link para `/obrigacoes` (ou ficha do
  cliente). Toggle **"todos / só os meus"** (recarrega via `listarRiscos({ soMeus })`).
- **Badge no Sidebar** no item "Obrigações": o layout `(app)/layout.tsx` busca `contarRiscos()` para
  quem tem `podeCriarCliente` e passa ao `Sidebar` (padrão do `alertasOnboarding`/`contarAlertas`).
- Link para `/obrigacoes/riscos` a partir do calendário `/obrigacoes` ("Ver riscos").

## 4. Testes

- **Unit `risco.test.ts`:** `classificarRisco` nas fronteiras (ontem=vencida, hoje=vencendo_hoje,
  amanhã=no_prazo); `montarPainel` — `resumo` correto, grupo sem-responsável no topo, agrupamento por
  responsável, ordenação por atraso dentro do grupo.
- **Smoke:** `PainelRiscosView` renderiza os 3 cartões, o grupo "Sem responsável" e um item; o mini-form
  de baixa (linha do calendário) renderiza o input de arquivo e o botão "Dar baixa".

## 5. Tratamento de erros / bordas
- Baixa sem comprovante quando `comprovante_obrigatorio` → erro no servidor + botão desabilitado na UI.
- Cliente sem contador → instância `sem responsável` (aparece no balde de resumo e no grupo do topo).
- Reabrir remove o arquivo do Storage e limpa os campos de entrega.
- Sem permissão → `redirect`/`[]`/0.
- `alternarDispensa(false)` não reabre uma entregue (só pendente↔dispensada).

## 6. Migrations
`0062_obrigacao_baixa.sql` — `comprovante_obrigatorio` na matriz; `add value 'entregue'` no enum
(isolado, `if not exists`); colunas de entrega na instância. Sem novas políticas RLS.
