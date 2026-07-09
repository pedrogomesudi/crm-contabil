# Financeiro — Extrato/movimentações (CSV) — Design

**Data:** 2026-07-09
**Marco:** um extrato de movimentações financeiras com filtros e **export CSV**, alternando entre
**Lançamentos (títulos)** e **Recebimentos/pagamentos (baixas)**. Segundo relatório (a DRE já existe;
depois: Fluxo detalhado).

**Contexto:** `titulo` (tipo RECEBER/PAGAR, `descricao`, `valor`, `competencia`, `vencimento`,
`categoria_id`, `status`, `cliente_id`); `baixa` (`data_recebimento`, `valor_recebido`, `forma_pagamento`,
`conta_bancaria_id`, `titulo_id`, `estornada`); `categoria` (nome), `clientes` (razao_social),
`conta_bancaria` (nome). Gate `podeGerenciarFinanceiro`. Hub de relatórios em `/financeiro/relatorios`.
Não há helper de CSV.

## Escopo

- Helper puro `paraCSV`.
- Actions `listarLancamentos`, `listarBaixas`, `listarCategoriasFiltro`.
- UI `/financeiro/relatorios/extrato` (2 visões + filtros + CSV) + cartão no hub.

**Fora:** Fluxo de caixa detalhado (próxima fatia).

## Helper puro — `src/lib/financeiro/csv.ts` (TDD)

```ts
export function paraCSV(cabecalhos: string[], linhas: string[][]): string;
```
- Delimitador `;` (padrão BR/Excel); linhas separadas por `\r\n`.
- Escapa com aspas os campos que contêm `;`, `"` ou quebra de linha; aspas internas viram `""`.

## Actions — `src/app/(app)/financeiro/relatorios/extrato/extrato-actions.ts`

```ts
export type TipoFiltro = "todos" | "RECEBER" | "PAGAR";
export type LancamentoRow = { id: string; cliente: string; tipo: string; descricao: string; categoria: string; competencia: string; vencimento: string; valor: number; baixado: number; status: string };
export type BaixaRow = { id: string; data: string; cliente: string; tipo: string; valor: number; forma: string; conta: string; descricao: string };
export async function listarLancamentos(inicio: string, fim: string, tipo: TipoFiltro, categoriaId: string | null): Promise<LancamentoRow[]>;
export async function listarBaixas(inicio: string, fim: string, tipo: TipoFiltro): Promise<BaixaRow[]>;
export async function listarCategoriasFiltro(): Promise<{ id: string; nome: string }[]>;
```
- Gate `podeGerenciarFinanceiro` (senão `[]`).
- **`listarLancamentos`:** `titulo` com `vencimento` entre `inicio`/`fim`; `tipo` (se ≠ todos);
  `categoria_id` (se informado); join `clientes(razao_social)`, `categoria(nome)`. `baixado` por título =
  soma de `baixa.valor_recebido` (não estornada) — busca as baixas dos títulos do resultado e agrega em
  JS. Ordena por vencimento.
- **`listarBaixas`:** `baixa` `estornada = false`, `data_recebimento` entre `inicio`/`fim`; join
  `conta_bancaria(nome)`, `titulo(tipo, descricao, clientes(razao_social))`. Filtra por `titulo.tipo`
  (se ≠ todos) em JS (join aninhado). Ordena por data.
- **`listarCategoriasFiltro`:** categorias ativas (`id, nome`) ordenadas por nome.

## UI — `/financeiro/relatorios/extrato/page.tsx` (server) + `Extrato.tsx` (client)

Gate `podeGerenciarFinanceiro` (senão redirect). A página carrega as categorias + as linhas iniciais
(Lançamentos do mês atual) e passa ao cliente.
- **`Extrato`**: estado `visao` (`lancamentos`/`baixas`), `inicio`, `fim`, `tipo`, `categoriaId`,
  `buscaCliente`, `linhas`.
  - **Alternador** Lançamentos / Baixas (recarrega ao trocar).
  - **Filtros:** data inicial, data final, tipo (Todos/Receber/Pagar), categoria (dropdown; só em
    Lançamentos), busca por cliente (texto). Ao mudar um filtro do servidor (datas/tipo/categoria/visão) →
    chama a action correspondente e atualiza `linhas`.
  - **Busca por cliente:** filtro client-side sobre `linhas` (nome contém, case-insensitive).
  - **Tabela** com as colunas da visão; valores em `formatarMoeda`.
  - **"Exportar CSV":** monta `paraCSV(cabecalhos, linhasFiltradas)` (valores monetários como `123,45` —
    `toFixed(2).replace(".", ",")` — sem "R$"); download via `Blob(["﻿" + csv], { type:
    "text/csv;charset=utf-8" })` + `<a download="extrato-<visao>-<inicio>-<fim>.csv">`. Exporta as linhas
    **atualmente filtradas** (respeita a busca por cliente).

### Hub — `configuracoes`… `/financeiro/relatorios/page.tsx`
Acrescentar o cartão **"Extrato / movimentações"** → `/financeiro/relatorios/extrato`.

## Tratamento de erros
- Sem permissão → `[]`/redirect.
- Período vazio de dados → tabela vazia ("Sem movimentações no período.").
- Datas em branco → a página usa o mês atual como padrão.

## Testes
- **Unit (Vitest):** `paraCSV` (delimitador `;`, escapa `;`/aspas/quebra; cabeçalho + linhas).
- **Smoke:** `Extrato` renderiza o alternador, a tabela e o botão "Exportar CSV" a partir de linhas de
  exemplo (Lançamentos).

## Migrations
Nenhuma.
