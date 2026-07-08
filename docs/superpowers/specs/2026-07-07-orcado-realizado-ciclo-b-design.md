# Financeiro — Dashboard Orçado × Realizado (Ciclo B) — Design

**Data:** 2026-07-07
**Marco:** consome o Ciclo A ([[orçamento]]) e entrega o dashboard comparativo pedido pelo usuário
(gráficos + tabela DRE + variação), com layout moderno (tokens SALDO). Estrutura do layout aprovada em
mockup navegável.
**Contexto:** `orcamento` (categoria×ano×mês → valor) já existe. Realizado vem de `titulo`
(`categoria_id`, `competencia`, `valor`) para o regime de **competência** e de `baixa`
(`valor_recebido`, `data_recebimento`, `estornada`, `titulo_id`) para o regime de **caixa**.
`categoria` tem `natureza` (RECEITA/DESPESA) e `ordem_dre`. Gate `podeGerenciarFinanceiro`
(admin/financeiro).

## Objetivo

Painel que compara **orçado × realizado** por categoria em um período (mês/trimestre/semestre/ano),
alternando a base entre **competência** e **caixa**, com cartões-resumo, gráfico de barras por categoria,
gráfico de linha (evolução no ano) e tabela estilo DRE com variação (R$ e %).

## Escopo (Ciclo B)

- Helpers puros de período/variação/agregação.
- Action `dashboardOrcadoRealizado` (orçado + realizado do ano, delega aos helpers).
- Tela `/financeiro/orcado-realizado`: controles + 3 cartões + 2 gráficos SVG + tabela DRE. Link no hub.

Fora de escopo: exportar PDF/Excel, filtro por centro de custo, drill-down por cliente. Sem migration.

## Observações de dados

- **Competência:** `titulo` já tem lançamentos; o realizado por competência já traz números.
- **Caixa:** depende de `baixa` registradas; hoje não há baixas → o realizado-caixa vem **zerado** até
  o escritório começar a dar baixa nos títulos. Comportamento correto (não é erro).
- `titulo.competencia` e `baixa.data_recebimento` são `date`; o mês é `getUTCFullYear/Month` da string
  (as datas puras vêm como `YYYY-MM-DD`; usar os 7 primeiros chars evita o bug de fuso).

## Helpers puros — `src/lib/financeiro/orcado-realizado.ts` (TDD)

```ts
export type TipoPeriodo = "mes" | "trimestre" | "semestre" | "ano";
export type MesRef = { ano: number; mes: number };
export type Natureza = "RECEITA" | "DESPESA";
export type CategoriaRef = { id: string; nome: string; natureza: Natureza; ordem_dre: number };
// linha de realizado já reduzida a (categoria, mês, valor) — vinda de titulo OU baixa
export type LancRealizado = { categoriaId: string; ano: number; mes: number; valor: number };

export type LinhaComparativo = { categoriaId: string; nome: string; natureza: Natureza; orcado: number; realizado: number; varAbs: number; varPct: number | null };
export type GrupoComparativo = { natureza: Natureza; linhas: LinhaComparativo[]; totalOrcado: number; totalRealizado: number; varAbs: number; varPct: number | null };
export type PontoSerie = { mes: number; orcado: number; realizado: number };
export type Comparativo = {
  grupos: GrupoComparativo[];             // RECEITA, DESPESA (nessa ordem)
  resultado: { orcado: number; realizado: number; varAbs: number; varPct: number | null };
  serieReceita: PontoSerie[];             // 12 meses do ano (receita orçada × realizada)
};

// Meses cobertos por um período. indice: mês 1–12; trimestre 1–4; semestre 1–2; ano ignora índice.
export function mesesDoPeriodo(tipo: TipoPeriodo, ano: number, indice: number): MesRef[];

// Variação absoluta e percentual. pct = null quando orcado === 0 (evita divisão por zero).
export function variacao(orcado: number, realizado: number): { abs: number; pct: number | null };

// Monta o comparativo do PERÍODO + a série dos 12 meses do ano.
// orcamento: MapaValores (categoriaId → { mes → valor }, do ano inteiro).
// realizado: LancRealizado[] do ano inteiro (já reduzido de titulo OU baixa).
export function montarComparativo(
  categorias: CategoriaRef[],
  orcamento: Record<string, Record<number, number>>,
  realizado: LancRealizado[],
  meses: MesRef[],       // meses do período selecionado
  ano: number,
): Comparativo;
```

Regras:
- `mesesDoPeriodo`:
  - `mes` → `[{ano, mes: indice}]`.
  - `trimestre` → meses `[(indice-1)*3+1 .. +3]` (T1=1–3, T2=4–6, T3=7–9, T4=10–12).
  - `semestre` → S1=1–6, S2=7–12.
  - `ano` → 1–12.
- `variacao`: `abs = round2(realizado - orcado)`; `pct = orcado === 0 ? null : round2((realizado-orcado)/orcado*100)`.
- `montarComparativo`:
  - Para cada categoria: `orcado` = soma de `orcamento[cat][mes]` nos `meses` do período; `realizado` =
    soma de `realizado` cujo `(ano,mes)` está nos `meses` do período e `categoriaId===cat`.
  - `varAbs`/`varPct` via `variacao`. Agrupa por natureza (RECEITA depois DESPESA), na `ordem_dre`.
  - Totais por grupo; `resultado` = (total RECEITA − total DESPESA) para orçado e realizado.
  - `serieReceita`: para m=1..12, `orcado`/`realizado` somando **só categorias RECEITA** naquele mês do
    `ano` (independe do período — dá a tendência anual).

## Action — `src/app/(app)/financeiro/orcado-realizado/actions.ts`

```ts
export type BaseRegime = "competencia" | "caixa";
export async function dashboardOrcadoRealizado(
  ano: number, tipo: TipoPeriodo, indice: number, base: BaseRegime,
): Promise<{ categorias: CategoriaRef[]; comparativo: Comparativo } | null>;
```

- Gate `podeGerenciarFinanceiro` (senão `null`).
- Lê `categoria` ativa (natureza, ordem_dre) e `orcamento` do ano (→ MapaValores).
- Realizado do ano, conforme `base`:
  - **competencia:** `titulo` (`categoria_id, competencia, valor`) com `date_trunc('year', competencia)`
    = ano e `categoria_id not null`. Reduz para `LancRealizado` (mes = mês de `competencia`).
  - **caixa:** `baixa` (`valor_recebido, data_recebimento, estornada, titulo:titulo_id(categoria_id)`)
    com `estornada = false` e `data_recebimento` no ano. Reduz para `LancRealizado`
    (categoriaId = titulo.categoria_id, mes = mês de `data_recebimento`, valor = `valor_recebido`).
- `meses = mesesDoPeriodo(tipo, ano, indice)`; retorna `montarComparativo(...)`.

## UI — `src/app/(app)/financeiro/orcado-realizado/`

### `page.tsx` (server)
Gate `podeGerenciarFinanceiro` (senão `redirect('/')`). Estado inicial: ano corrente, tipo `mes`,
índice = mês corrente, base `competencia`. Carrega `dashboardOrcadoRealizado(...)` e passa ao cliente.
`PageHeader` "Orçado × Realizado".

### `DashboardComparativo.tsx` (client)
Controles (re-buscam via action ao mudar): **ano** (select), **tipo de período** (segmentado
Mês/Trimestre/Semestre/Ano), **índice** (select do período conforme o tipo — meses, T1–T4, S1–S2, ou
oculto no Ano), **base** (toggle Competência/Caixa). Ao alterar qualquer um, chama a action e atualiza.
- **3 cartões:** Receitas, Despesas, Resultado — orçado, realizado e badge de variação (verde quando
  favorável, vermelho quando desfavorável: para despesa, acima do orçado é ruim; para receita/resultado,
  acima é bom). Formatação `formatarMoeda`; `pct` nulo → "—".
- **Barras por categoria** (`BarrasCategoria.tsx`): por linha, barra do orçado (cinza) e do realizado
  (verde; vermelho se despesa estourou o orçado OU receita ficou abaixo). Larguras relativas ao maior
  valor do conjunto.
- **Linha de evolução** (`LinhaEvolucao.tsx`): SVG com 2 polylines (orçado × realizado da receita) sobre
  os 12 meses.
- **Tabela DRE:** grupos Receitas/Despesas com linhas (categoria, orçado, realizado, var R$, var %),
  totais por grupo e linha Resultado; variação colorida (verde favorável / vermelho desfavorável).

### Navegação
Adicionar `{ href: "/financeiro/orcado-realizado", label: "Orçado × Realizado" }` ao array `ITENS` de
`src/app/(app)/financeiro/cadastros/page.tsx` (após "Orçamento").

## Sinal da variação (favorável × desfavorável)
- **Receita e Resultado:** realizado ≥ orçado → favorável (verde); abaixo → vermelho.
- **Despesa:** realizado ≤ orçado → favorável (verde); acima → vermelho.
Helper de cor fica na UI (deriva de `natureza` + sinal de `varAbs`).

## Tratamento de erros
- Sem permissão → redirect / action `null`.
- `orcado === 0` → `varPct = null` → UI mostra "—".
- Realizado-caixa vazio (sem baixas) → barras/valores zerados; sem erro.

## Testes
- **Unit (Vitest):** `mesesDoPeriodo` (4 tipos + índices), `variacao` (normal, orçado 0, negativo),
  `montarComparativo` (agregação por período, totais, resultado, série de 12 meses, sinais de variação).
- **Smoke:** `DashboardComparativo` renderiza com um `Comparativo` mockado (cartões, tabela) sem lançar.

## Migrations
Nenhuma (só leitura de `orcamento`, `titulo`, `baixa`, `categoria`).
