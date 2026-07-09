# Financeiro — Relatório DRE — Design

**Data:** 2026-07-09
**Marco:** uma **DRE (Demonstração de Resultado)** por período — receitas − despesas por categoria/grupo,
com regime competência/caixa e resultado operacional e líquido. Primeiro de três relatórios (depois:
Extrato/CSV, Fluxo detalhado).

**Contexto:** `categoria` tem `natureza` (RECEITA/DESPESA), `grupo` (OPERACIONAL/NAO_OPERACIONAL) e
`ordem_dre` — modelo já pensado para DRE. `titulo` (RECEBER/PAGAR) tem `categoria_id`, `competencia`,
`valor`; `baixa` tem `valor_recebido`, `data_recebimento`, `estornada`, `titulo_id`. O `orcado-realizado`
já faz a carga competência/caixa e tem os helpers `mesesDoPeriodo(tipo, ano, indice)` e o tipo
`TipoPeriodo` (`mes`/`trimestre`/`semestre`/`ano`) em `src/lib/financeiro/orcado-realizado.ts`. Gate
`podeGerenciarFinanceiro`. O Sidebar já tem `print:hidden`.

## Escopo (DRE)

- Helper puro `montarDRE`.
- Action `relatorioDRE`.
- UI `/financeiro/relatorios/dre` + hub `/financeiro/relatorios` + link no dashboard.

**Fora:** Extrato/CSV, Fluxo detalhado (próximas fatias).

## Helper puro — `src/lib/financeiro/dre.ts` (TDD)

```ts
export type CategoriaDRE = { id: string; nome: string; natureza: "RECEITA" | "DESPESA"; grupo: "OPERACIONAL" | "NAO_OPERACIONAL"; ordem_dre: number };
export type LinhaDRE = { nome: string; valor: number };
export type GrupoDRE = { linhas: LinhaDRE[]; total: number };
export type DRE = {
  receitaOperacional: GrupoDRE;
  despesaOperacional: GrupoDRE;
  resultadoOperacional: number;
  receitaNaoOperacional: GrupoDRE;
  despesaNaoOperacional: GrupoDRE;
  resultadoLiquido: number;
};
export function montarDRE(categorias: CategoriaDRE[], valorPorCategoria: Record<string, number>): DRE;
```
- Para cada bucket `(natureza, grupo)`: pega as categorias, valor = `valorPorCategoria[id] ?? 0`,
  **descarta linhas com valor 0**, ordena por `ordem_dre`, soma → `total`.
- `resultadoOperacional` = `receitaOperacional.total − despesaOperacional.total`.
- `resultadoLiquido` = `resultadoOperacional + receitaNaoOperacional.total − despesaNaoOperacional.total`.

## Action — `src/app/(app)/financeiro/relatorios/dre-actions.ts`

```ts
export async function relatorioDRE(ano: number, tipo: TipoPeriodo, indice: number, base: "competencia" | "caixa"): Promise<{ dre: DRE } | null>;
```
- Gate `podeGerenciarFinanceiro` (senão `null`).
- Carrega `categoria` ativas (`id, nome, natureza, grupo, ordem_dre`) → `CategoriaDRE[]`.
- Lançamentos do ano (mesmo padrão do `orcado-realizado`):
  - **competência:** `titulo` com `categoria_id not null`, `competencia` entre `ano-01-01` e `ano-12-31`
    → `{ categoriaId, ano, mes, valor }` (ano/mes por `slice` da competência).
  - **caixa:** `baixa` `estornada = false`, `data_recebimento` no ano, join `titulo(categoria_id)`
    → `{ categoriaId, ano, mes, valor: valor_recebido }`.
- `meses = mesesDoPeriodo(tipo, ano, indice)`; `chaves = Set(meses.map(m => `${m.ano}-${m.mes}`))`.
- `valorPorCategoria`: soma dos lançamentos cujo `${ano}-${mes}` ∈ `chaves`, por `categoriaId`.
- Retorna `{ dre: montarDRE(categorias, valorPorCategoria) }`.

## UI

### `/financeiro/relatorios/dre/page.tsx` (server) + `RelatorioDRE.tsx` (client)
Gate `podeGerenciarFinanceiro`. A página calcula o período atual (ano/mês em SP), a base `competencia`, o
DRE inicial (`relatorioDRE`) e passa ao cliente.
- **`RelatorioDRE`**: estado `ano/tipo/indice/base`; ao mudar qualquer seletor, chama `relatorioDRE` e
  re-renderiza (padrão do `DashboardComparativo`). Seletores: tipo (mês/trimestre/semestre/ano) + índice
  (mês/trimestre/…) + regime (competência/caixa).
- **Tabela DRE:** grupos com linhas (categoria · valor); despesas exibidas em negativo (`text-negativo`);
  subtotais por grupo; **Resultado operacional** e **Resultado líquido** em destaque (positivo verde /
  negativo negativo). Valores com `formatarMoeda`.
- Botão **Imprimir** (`window.print()`); os seletores/botão com `print:hidden` (só a DRE imprime).

### Hub — `/financeiro/relatorios/page.tsx`
Gate `podeGerenciarFinanceiro`. Cartões dos relatórios; por ora só **DRE** (→ `/financeiro/relatorios/dre`);
Extrato e Fluxo entram nas próximas fatias.

### Link
No dashboard financeiro (`financeiro/dashboard/page.tsx`), um `Link` **"Relatórios"** → `/financeiro/relatorios`.

## Tratamento de erros
- Sem permissão → `null`/redirect.
- Período sem movimento → grupos vazios, resultados 0.

## Testes
- **Unit (Vitest):** `montarDRE` (buckets por natureza/grupo; descarta valor 0; ordena por `ordem_dre`;
  resultado operacional e líquido).
- **Smoke:** `RelatorioDRE` renderiza "Resultado operacional" e "Resultado líquido" a partir de um DRE.

## Migrations
Nenhuma.
