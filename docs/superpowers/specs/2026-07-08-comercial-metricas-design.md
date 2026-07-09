# Comercial — métricas/relatórios do funil — Design

**Data:** 2026-07-08
**Marco:** um dashboard do funil comercial — pipeline atual e fechamentos por período (mês/trimestre/
semestre/ano), com taxa de conversão, desempenho por responsável e motivos de perda.

**Contexto:** o módulo comercial existe (`oportunidade`: etapa, valor_estimado, responsavel_id, origem,
motivo_perda, criado_em, atualizado_em). `listarOportunidades()` já retorna `OportunidadeView` (sem datas).
Helper `resumoFunil` já soma o pipeline por etapa. O funil não data os fechamentos — daí a coluna nova.
Gate comum: `podeCriarCliente`.

## Decisões (do brainstorming)

1. **Com filtro por período** (mês/trimestre/semestre/ano), navegável (← →).
2. Requer datar os fechamentos → coluna `fechado_em`.

## Escopo

- Migration: `oportunidade.fechado_em` + backfill; `definirEtapa` grava/limpa a data.
- `OportunidadeView`/`listarOportunidades` ganham `criadoEm`/`fechadoEm`.
- Helpers puros `periodoBounds` + `metricasFunil`.
- Tela `/comercial/metricas` + link no `/comercial`.

Fora: propostas, exportação CSV, metas/orçamento de vendas.

## Dados — migration `0056_comercial_fechado_em.sql`

```sql
alter table oportunidade add column if not exists fechado_em timestamptz;
update oportunidade set fechado_em = atualizado_em
  where etapa in ('ganho','perdido') and fechado_em is null;
```

## `definirEtapa` — datar o fechamento

Em `src/app/(app)/comercial/actions.ts`, no `patch` de `definirEtapa`:
- se `etapa in ('ganho','perdido')` → `patch.fechado_em = new Date().toISOString()`;
- senão → `patch.fechado_em = null` (voltou a uma etapa ativa).

## View — `OportunidadeView` + `listarOportunidades`

- `OportunidadeView` ganha `criadoEm: string` e `fechadoEm: string | null`.
- O `SELECT` inclui `criado_em, fechado_em`; o map preenche `criadoEm: r.criado_em`, `fechadoEm:
  (r.fechado_em as string | null) ?? null`.

## Helpers puros — `src/lib/comercial/metricas.ts` (TDD)

```ts
export type Granularidade = "mes" | "trimestre" | "semestre" | "ano";
export function periodoBounds(g: Granularidade, hojeIso: string, offset: number): { inicio: string; fim: string; rotulo: string };
export type MetricasFunil = {
  pipeline: { total: { qtd: number; total: number }; porEtapa: Record<string, { qtd: number; total: number }> };
  periodo: {
    ganhos: { qtd: number; valor: number };
    perdidos: { qtd: number; valor: number };
    taxaConversao: number; // 0..1; 0 se nenhum fechado
    porResponsavel: { nome: string; ganhos: number; perdidos: number; valorGanho: number }[];
    motivosPerda: { motivo: string; qtd: number }[];
  };
};
export function metricasFunil(ops: OpMetrica[], inicio: string, fim: string): MetricasFunil;
```
Onde `OpMetrica = { etapa: EtapaOportunidade; valorEstimado: number | null; responsavelNome: string | null; motivoPerda: string | null; fechadoEm: string | null }`.

- **`periodoBounds`** (via `Date.UTC`, `fim` exclusivo):
  - `mes`: início no 1º dia do mês de `hoje` deslocado `offset` meses; fim = +1 mês. Rótulo "Julho 2026".
  - `trimestre`: início no 1º mês do trimestre (jan/abr/jul/out) + `offset` trimestres; fim = +3 meses.
    Rótulo "3º trimestre 2026".
  - `semestre`: início jan ou jul + `offset` semestres; fim = +6 meses. Rótulo "2º semestre 2026".
  - `ano`: início 1º/jan do ano + `offset`; fim = +1 ano. Rótulo "2026".
  - `inicio`/`fim` retornados como ISO (`toISOString()`); comparação com `fechado_em` (UTC). *(Nota: bounds
    em UTC; pode haver ~3h de folga na virada de mês vs. fuso SP — aceitável para o dashboard.)*
- **`metricasFunil`**:
  - `pipeline` (ignora período): `ativas` = etapa ∉ {ganho, perdido}; `total` = {qtd, Σ valorEstimado};
    `porEtapa` = por etapa ativa {qtd, Σ}.
  - `fechados` no período = etapa ∈ {ganho, perdido} com `fechadoEm` não nulo e `inicio ≤ fechadoEm < fim`.
  - `ganhos`/`perdidos` = qtd + Σ valor; `taxaConversao` = ganhosQtd / (ganhosQtd + perdidosQtd) (0 se soma 0).
  - `porResponsavel`: agrupa fechados por `responsavelNome ?? "—"` → {ganhos, perdidos, valorGanho (Σ dos
    ganhos)}, ordenado por valorGanho desc.
  - `motivosPerda`: perdidos agrupados por `motivoPerda ?? "Sem motivo"` → {motivo, qtd}, desc.

## UI

### `/comercial/metricas/page.tsx` (server) + `MetricasFunil.tsx` (client)
Gate `podeCriarCliente` (senão redirect). Carrega `listarOportunidades()` e passa a lista + `hoje`
(YYYY-CA em SP) ao cliente.
- **`MetricasFunil`**: estado `granularidade` (default "mes") e `offset` (default 0). Calcula
  `periodoBounds` + `metricasFunil` localmente (recalcula ao mudar seletor/offset).
- **Pipeline atual:** cards com total (qtd + R$) e uma mini-tabela por etapa (qtd + R$).
- **Seletor de período:** `select` de granularidade + `← {rótulo} →` (offset −1/+1).
- **Fechamentos no período:** cards Ganhos (qtd + R$), Perdidos (qtd + R$), **Taxa de conversão** (%);
  tabela **por responsável** (ganhos / perdidos / R$ ganho); lista **motivos de perda** (motivo · qtd).
- Valores em `R$` (`toLocaleString pt-BR`), percentuais com 0 casas.

### Link
No `QuadroComercial` (barra de topo, junto de "Nova oportunidade"), um `Link` **"Métricas"** →
`/comercial/metricas`. Na tela de métricas, um `Link` **"← Funil"** → `/comercial`.

## Tratamento de erros
- Sem permissão → `[]`/redirect.
- Período sem fechamentos → cards zerados, taxa 0%, tabelas vazias ("—").

## Testes
- **Unit (Vitest):** `periodoBounds` (mês/trimestre/semestre/ano; offset 0 e ±1; rótulos) e `metricasFunil`
  (pipeline, filtro por `fechadoEm`, taxa, por responsável, motivos).
- **Smoke:** `MetricasFunil` renderiza pipeline + seção de período sem lançar.

## Migrations
`0056_comercial_fechado_em.sql` (coluna + backfill).
