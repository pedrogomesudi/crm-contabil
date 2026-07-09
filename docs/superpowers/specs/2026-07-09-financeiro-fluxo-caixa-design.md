# Financeiro — Fluxo de caixa detalhado — Design

**Data:** 2026-07-09
**Marco:** terceiro (e último previsto) relatório do hub financeiro — a DRE e o Extrato/CSV já existem.
Um **fluxo de caixa detalhado**: matriz categoria × 12 meses do ano, combinando **realizado** (baixas
já ocorridas) e **projetado** (títulos em aberto por vencimento), com **saldo acumulado** ao fim de
cada mês.

**Decisões de brainstorming:**
- **Foco:** realizado + projetado na mesma linha do tempo.
- **Período:** mensal, 12 meses do ano selecionado.
- **Detalhe:** matriz por categoria (linhas) × meses (colunas).
- **Saldo acumulado:** parte da soma de `saldo_inicial` das contas ativas + fluxo acumulado do ano
  (aproximação; ignora movimentação de anos anteriores).
- **Cálculo:** helper puro em TS + duas queries planas (padrão DRE/Orçado×Realizado). Sem migration.

**Contexto:** `titulo` (`tipo` RECEBER/PAGAR, `categoria_id`, `valor`, `vencimento`, `status`
titulo_status = ABERTO/VENCIDO/BAIXADO/BAIXADO_PARCIAL/CANCELADO); `baixa` (`titulo_id`,
`data_recebimento`, `valor_recebido`, `estornada`); `categoria` (`nome`, `natureza`
RECEITA/DESPESA, `ordem_dre`, `ativa`); `conta_bancaria` (`saldo_inicial`, `ativa`). Gate
`podeGerenciarFinanceiro`. Hub em `/financeiro/relatorios`. Helper de CSV: `paraCSV` em
`src/lib/financeiro/csv.ts`. Padrão de UI de relatório: `RelatorioDRE.tsx`.

## Escopo

- Helper puro `montarFluxoCaixa`.
- Action `relatorioFluxo(ano)`.
- UI `/financeiro/relatorios/fluxo` (matriz + seletor de ano + CSV + imprimir) + cartão no hub.

**Fora:** granularidade diária; janela móvel; quebra por conta bancária; saldo real de anos anteriores.

## Dados — action `src/app/(app)/financeiro/relatorios/fluxo/fluxo-actions.ts`

```ts
export async function relatorioFluxo(ano: number): Promise<{ fluxo: FluxoCaixa; mesAtual: number } | null>;
```
Gate `podeGerenciarFinanceiro` (senão `null`). Busca (janela `${ano}-01-01` … `${ano}-12-31`):

- **Categorias ativas:** `id, nome, natureza, ordem_dre` (`ativa = true`).
- **Realizado:** `baixa` com `estornada = false` e `data_recebimento` no ano, join
  `titulo(tipo, categoria_id)`. Cada baixa → item `{ categoriaId, mes: mês de data_recebimento,
  tipo: titulo.tipo, valor: valor_recebido }`.
- **Projetado:** `titulo` em aberto (`status in ('ABERTO','VENCIDO','BAIXADO_PARCIAL')`) com
  `vencimento` no ano, join das baixas não estornadas do próprio título para o saldo. Item
  `{ categoriaId, mes: mês do vencimento, tipo, valor: valor − Σ baixas não estornadas }`. Só entra
  se saldo `> 0`. Vencidos e abertos permanecem no mês do vencimento (aging trata inadimplência).
- **Saldo inicial:** `Σ saldo_inicial` das contas ativas (0 se nenhuma).

Realizado ∪ projetado são unidos numa única lista `ItemFluxo[]` passada ao helper — a origem não
importa para o cálculo; a distinção realizado × projetado aparece **por mês** na UI.

`mesAtual`: mês corrente (1–12) se `ano` = ano atual (timezone America/Sao_Paulo); `0` se `ano` já
passou (tudo realizado); `13` se `ano` é futuro (tudo projetado). Usado só para destaque visual.

Itens de categorias nulas (`categoria_id is null`) são ignorados.

## Cálculo — helper puro `src/lib/financeiro/fluxo-caixa.ts` (TDD)

```ts
export type NaturezaFC = "RECEITA" | "DESPESA";
export type CategoriaFC = { id: string; nome: string; natureza: NaturezaFC; ordem_dre: number };
export type ItemFluxo = { categoriaId: string; mes: number; tipo: "RECEBER" | "PAGAR"; valor: number };
export type LinhaFluxo = { categoriaId: string; nome: string; valores: number[]; total: number }; // valores tem 12 posições (jan..dez)
export type GrupoFluxo = { titulo: "Entradas" | "Saídas"; linhas: LinhaFluxo[]; totais: number[]; total: number };
export type FluxoCaixa = {
  entradas: GrupoFluxo;
  saidas: GrupoFluxo;
  resultadoMes: number[];   // 12 posições: entradas.totais[m] − saidas.totais[m]
  saldoAcumulado: number[]; // 12 posições: saldoInicial + Σ resultadoMes[0..m]
  saldoInicial: number;
};
export function montarFluxoCaixa(categorias: CategoriaFC[], itens: ItemFluxo[], saldoInicial: number): FluxoCaixa;
```

- **Entradas** = itens `tipo === "RECEBER"`; **Saídas** = itens `tipo === "PAGAR"`. Agrupa por
  `categoriaId`; nome vem de `categorias`. Linhas ordenadas por `ordem_dre` (empate por nome).
- Categorias **sem nenhum movimento no ano** (todos os 12 meses zero) são **omitidas**.
- `valores[m]` (m = 0..11) = soma dos itens da categoria no mês `m+1`.
- `totais[m]` do grupo = soma das `linhas[].valores[m]`; `total` do grupo = soma de `totais`.
- `linha.total` = soma dos 12 `valores`.
- `resultadoMes[m]` = `entradas.totais[m] − saidas.totais[m]`.
- `saldoAcumulado[m]` = `saldoInicial + Σ resultadoMes[0..m]`.
- Todos os valores arredondados a 2 casas (`Math.round(n*100)/100`).

## UI — `/financeiro/relatorios/fluxo/page.tsx` (server) + `FluxoCaixa.tsx` (client)

**Página** (server): gate `podeGerenciarFinanceiro` → `redirect("/")` se negado. Ano atual via
`toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })`. Chama `relatorioFluxo(ano)`,
passa `fluxo`, `ano`, `mesAtual` ao componente. `PageHeader titulo="Fluxo de caixa detalhado"
subtitulo="Realizado e projetado, mês a mês, com saldo acumulado"`.

**`FluxoCaixa`** (client), espelhando `RelatorioDRE.tsx`:
- Estado `ano`, `fluxo`, `mesAtual`, `carregando`. **Seletor de ano** (ano atual e ~4 anteriores);
  ao trocar, chama `relatorioFluxo` e atualiza (se retornar `null`, mantém e ignora).
- **Controles** (`print:hidden`): **Exportar CSV** e **Imprimir** (`window.print()`).
- **Tabela matriz** (`overflow-x-auto rounded-2xl border`): coluna 1 = categoria; 12 colunas de
  meses (`Jan`…`Dez`); coluna final **Total**. Seção **Entradas** (linhas por categoria + subtotal
  do grupo), seção **Saídas** (idem), e no rodapé **Resultado do mês** e **Saldo acumulado**.
- **Destaque realizado × projetado:** colunas com mês `> mesAtual` (quando `1 ≤ mesAtual ≤ 12`)
  recebem fundo `bg-creme`; o cabeçalho do primeiro mês projetado leva o rótulo "projetado". Se
  `mesAtual = 0` (ano passado) nada é destacado; se `13` (ano futuro) todas as 12 colunas destacadas.
- Valores com `formatarMoeda`, `tabular-nums`. Saldo acumulado/resultado negativos em `text-negativo`.
- Ano sem movimento (Entradas e Saídas vazias) → aviso "Sem movimentações no período."

**CSV** (reusa `paraCSV`): cabeçalho `["Categoria", "Jan", …, "Dez", "Total"]`; linhas de Entradas
(cada categoria + subtotal "Total de entradas"), linhas de Saídas (+ "Total de saídas"), e linhas
"Resultado do mês" e "Saldo acumulado". Dinheiro como `valor.toFixed(2).replace(".", ",")` (sem
"R$"). Download via `Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })` +
`<a download="fluxo-caixa-<ano>.csv">`.

**Hub** — `/financeiro/relatorios/page.tsx`: acrescentar 3º cartão **"Fluxo de caixa detalhado"** →
`/financeiro/relatorios/fluxo`.

## Tratamento de erros
- Sem permissão → `redirect` (página) / `null` (action).
- Ano sem dados → tabela vazia com aviso; `saldoInicial` = 0 se não há contas.
- `relatorioFluxo` retornando `null` na troca de ano → componente ignora e mantém o estado atual.

## Testes
- **Unit (Vitest) — `montarFluxoCaixa`:** (a) bucketing por categoria/mês/tipo separando
  Entradas/Saídas; (b) `totais`/`total` por grupo e `linha.total`; (c) `resultadoMes` =
  entradas−saídas; (d) `saldoAcumulado` correndo a partir do `saldoInicial`, com ao menos um mês de
  resultado negativo; (e) categorias sem movimento omitidas; (f) ordenação por `ordem_dre`.
- **Smoke — `FluxoCaixa`:** renderiza o seletor de ano, uma categoria com valores, a linha "Saldo
  acumulado" e o botão "Exportar CSV" (mock da action + `renderToStaticMarkup`).

## Migrations
Nenhuma.
