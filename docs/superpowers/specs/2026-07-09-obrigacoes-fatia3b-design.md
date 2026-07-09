# Obrigações e Compliance — Fatia 3B (Suspensão/retroativos + Relatório de conformidade) — Design

**Data:** 2026-07-09
**Marco:** RF-036 (suspensão de inativos + geração retroativa) e RF-037 (relatório de conformidade) —
fecha o módulo de Obrigações. Constrói sobre as Fatias 1 (matriz+calendário), 2 (baixa+riscos) e 3A
(escalonamento), todas em produção.

**Contexto:** `obrigacao_instancia` (status pendente/dispensada; entrega derivada de `entregue_em`;
`competencia`, `vencimento_legal`/`interno`, `responsavel_id`, `cliente_id`). `clientes` tem
`status` (`status_cliente` = ativo/inativo) e `excluido_em`. Motor `gerarInstancias(supabase, ano, mes,
clienteId?)` (idempotente, hoje filtra só `excluido_em is null`). Calendário `/obrigacoes` +
riscos + escalonamento. Helper de CSV `paraCSV`; padrão de relatório em `financeiro/relatorios`.

**Decisões de brainstorming:**
- **Suspensão de inativos:** não gera novas para inativos; as pendentes existentes **somem** das telas
  de nag (calendário-geral, riscos, escalonamento), mas **continuam na ficha do cliente** e voltam ao
  reativar (nada é apagado).
- **Retroativos:** **backfill em lote por intervalo** (mês inicial → mês atual), todos os clientes ou um.
- **Relatório de conformidade:** página `/obrigacoes/conformidade`, por competência (mês ou ano),
  **agregado + por cliente**, com **% de conformidade**, CSV e impressão.
- **Sem migration** — tudo usa o schema atual.

**Escopo:** suspensão, retroativos, relatório. **Fora:** nada pendente do módulo após esta fatia.

## 1. Suspensão de inativos (RF-036)

- **Motor** `src/lib/obrigacoes/motor.ts` — a query de clientes passa a incluir `.eq("status",
  "ativo")` (além de `.is("excluido_em", null)`). Inativos não geram novas obrigações.
- **Telas de nag** — filtrar instâncias de clientes inativos (join `clientes!inner(...)` +
  `.eq("clientes.status", "ativo")`):
  - `listarInstancias(ano, mes)` **sem `clienteId`** (calendário geral) — aplica o filtro.
  - `listarInstancias(ano, mes, { clienteId })` (ficha do cliente) — **não** aplica (mostra sempre).
  - `listarRiscos`/`contarRiscos` (painel) e `coletar` (escalonamento) — aplicam o filtro.
- Reativar o cliente (`status = 'ativo'`) faz tudo reaparecer (nada é deletado).

> Nota supabase: filtrar por coluna de recurso aninhado exige embed **`!inner`**. Onde hoje é
> `clientes(razao_social)`, passa a `clientes!inner(razao_social)` + `.eq("clientes.status","ativo")`
> apenas nos casos de agregação (não no escopo por `clienteId`).

## 2. Retroativos — backfill em lote (RF-036)

**Action** em `src/app/(app)/obrigacoes/actions.ts`:
```ts
export async function gerarRetroativo(anoIni: number, mesIni: number, clienteId?: string): Promise<{ meses: number; candidatas: number } | null>;
```
- Gate `podeCriarCliente`. Calcula a competência atual (timezone SP). Itera de `(anoIni, mesIni)` até o
  mês atual **inclusive** (avança mês a mês), chamando `gerarInstancias(supabase, ano, mes, clienteId)`
  em cada um; soma `candidatas` e conta `meses`. Idempotente (`on conflict do nothing`). Se
  `(anoIni, mesIni)` for depois do mês atual, processa só o mês atual.
- **Limite de segurança:** no máximo 24 meses por chamada (evita loop acidental muito longo); se o
  intervalo exceder, processa os últimos 24 meses e retorna assim mesmo.

**UI:**
- **Calendário `/obrigacoes`** (admin — `podeGerenciarMatriz`): botão **"Gerar retroativo"** abre um
  seletor de **mês/ano inicial**; ao confirmar, chama `gerarRetroativo(anoIni, mesIni)` e recarrega.
- **Ficha do cliente** (`ObrigacoesCliente`, admin): mesmo botão, chamando
  `gerarRetroativo(anoIni, mesIni, clienteId)`.

## 3. Relatório de conformidade (RF-037)

**Helper puro `src/lib/obrigacoes/conformidade.ts` (TDD):**
```ts
export type StatusConformidade = "no_prazo" | "com_atraso" | "pendente_vencida" | "pendente_no_prazo" | "dispensada";
export function classificarConformidade(inst: { status: string; entregueEm: string | null; vencimentoLegal: string }, hoje: string): StatusConformidade;
export type ResumoConformidade = { total: number; noPrazo: number; comAtraso: number; pendenteVencida: number; pendenteNoPrazo: number; dispensada: number; pctConformidade: number };
export function resumirConformidade(itens: { status: string; entregueEm: string | null; vencimentoLegal: string }[], hoje: string): ResumoConformidade;
```
- **`classificarConformidade`** — `dispensada` se `status === "dispensada"`; se **entregue**
  (`entregueEm !== null`): `no_prazo` se `entregueEm <= vencimentoLegal`, senão `com_atraso`; senão
  (**pendente**): `pendente_vencida` se `vencimentoLegal < hoje`, senão `pendente_no_prazo`. Usa o
  **vencimento legal** (linha regulatória).
- **`resumirConformidade`** — conta as categorias; `base = total − dispensada`;
  `pctConformidade = base > 0 ? Math.round((noPrazo / base) * 100) : 100`.

**Action** em `src/app/(app)/obrigacoes/conformidade-actions.ts`:
```ts
export type LinhaConformidade = { clienteNome: string; resumo: ResumoConformidade };
export type RelatorioConformidade = { geral: ResumoConformidade; porCliente: LinhaConformidade[] };
export async function relatorioConformidade(ano: number, mes: number | null): Promise<RelatorioConformidade>;
```
- Gate `podeCriarCliente` (RLS escopa o contador aos seus). Filtra `obrigacao_instancia` pela
  **competência**: se `mes` informado, o mês `(ano, mes)`; senão o ano `(ano-01-01 .. ano-12-31)`.
  Select `status, entregue_em, vencimento_legal, clientes(razao_social)`. Deriva o status
  (`entregue_em ? "entregue" : status`) para o helper — mas o helper recebe `status` bruto + `entregueEm`
  (ele mesmo decide entregue). Agrega `geral` (todas) e uma `LinhaConformidade` por cliente, ordenada
  por `resumo.pctConformidade` **ascendente** (pior primeiro). `hoje` em timezone SP.
- **Histórico/auditoria:** inclui todos os clientes com instâncias no período (não aplica o filtro de
  suspensão de inativos).

**UI `/obrigacoes/conformidade/page.tsx` (server, gate `podeCriarCliente` → redirect) +
`RelatorioConformidade.tsx` (client):**
- Estado `ano`, `mes` (0 = ano inteiro), `dados`. Seletores de ano e mês; recarrega via a action.
  Controles em `print:hidden`.
- **Cartões do geral:** **% conformidade** (destaque), total, e as categorias no prazo / com atraso /
  pendente vencida / pendente no prazo / dispensada (atraso e vencida em `text-negativo`).
- **Tabela por cliente:** cliente, total, no prazo, com atraso, pendente vencida, dispensada,
  **% conformidade** (colorida por faixa: <70 vermelho, 70–90 âmbar, ≥90 verde).
- **Exportar CSV** (`paraCSV`: cabeçalho + linha do geral + uma linha por cliente com as contagens e o %)
  e **Imprimir** (`window.print()`).
- Link **"Conformidade"** no calendário (ao lado de "Ver riscos"/"Escalonamento").

## 4. Testes

- **Unit `conformidade.test.ts`:** `classificarConformidade` — entregue no dia do vencimento = `no_prazo`,
  entregue depois = `com_atraso`, pendente com vencimento ontem = `pendente_vencida`, pendente com
  vencimento amanhã = `pendente_no_prazo`, dispensada. `resumirConformidade` — contagens corretas,
  `pctConformidade` com dispensadas fora da base, base zero → 100.
- **Smoke:** `RelatorioConformidade` renderiza os cartões do geral e uma linha por cliente; o botão
  "Gerar retroativo" aparece no calendário (admin).

## 5. Tratamento de erros / bordas
- Sem permissão → `redirect`/`[]`.
- Período sem instâncias → tudo zero, `pctConformidade = 100`.
- `gerarRetroativo` com mês inicial ≥ atual → processa só o mês atual; intervalo > 24 meses → últimos 24.
- Suspensão: cliente reativado volta a aparecer; cliente sem instâncias não afeta nada.

## 6. Migrations
Nenhuma — suspensão (filtros), retroativos (loop sobre o motor) e relatório (leitura) usam o schema
existente.
