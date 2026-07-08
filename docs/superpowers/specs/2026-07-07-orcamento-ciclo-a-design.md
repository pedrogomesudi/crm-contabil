# Financeiro — Orçamento (Ciclo A) — Design

**Data:** 2026-07-07
**Marco:** base do Orçado × Realizado. Ciclo A = definir/armazenar o orçado (por categoria × mês).
O Ciclo B (dashboard comparativo com gráficos) consome esta base e vem depois.
**Contexto:** O financeiro já tem `categoria` (natureza RECEITA/DESPESA, hierarquia, `ordem_dre`, 11
ativas) e `titulo.categoria_id` (base do realizado, no Ciclo B). Gate `podeGerenciarFinanceiro`
(admin/financeiro); RLS por `auth_papel() in ('admin','financeiro')`.

## Objetivo

Uma tela onde o admin/financeiro define o **orçado por categoria em cada mês** de um ano, com atalhos
para agilizar (replicar nos 12 meses, copiar do ano anterior). Os dados ficam prontos para o dashboard
comparativo (Ciclo B), que agregará por mês/trimestre/semestre/ano.

## Escopo (Ciclo A)

- Tabela `orcamento` (categoria × ano × mês → valor) + RLS.
- Tela `/financeiro/orcamento`: grade editável (categorias × 12 meses) por ano, com totais e atalhos.
- Actions `listarOrcamento` / `salvarOrcamento`.

Fora de escopo (Ciclo B): dashboard comparativo, gráficos, realizado, agregação por período.

## Dados

### Migration `0047_orcamento.sql`

```sql
create table if not exists orcamento (
  id             uuid primary key default gen_random_uuid(),
  categoria_id   uuid not null references categoria(id) on delete cascade,
  ano            int not null,
  mes            smallint not null check (mes between 1 and 12),
  valor          numeric(14,2) not null default 0,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references usuarios(id),
  unique (categoria_id, ano, mes)
);
create index if not exists idx_orcamento_ano on orcamento(ano);
alter table orcamento enable row level security;
do $$ begin
  drop policy if exists orcamento_all on orcamento;
  create policy orcamento_all on orcamento for all to authenticated
    using (auth_papel() in ('admin','financeiro'))
    with check (auth_papel() in ('admin','financeiro'));
end $$;
```

`unique (categoria_id, ano, mes)` sustenta o upsert. `valor` em reais.

## Helper puro — `src/lib/financeiro/orcamento.ts` (TDD)

```ts
export type CelulaOrcamento = { categoriaId: string; mes: number; valor: number };
export type MapaValores = Record<string, Record<number, number>>; // categoriaId → { mes → valor }

// Achata o mapa da grade em células para upsert (só meses 1–12 com valor definido).
export function achatarValores(valores: MapaValores): CelulaOrcamento[];

// Soma dos 12 meses de uma categoria (total da linha).
export function somaLinha(valores: MapaValores, categoriaId: string): number;

// Soma de uma coluna (mês) sobre um conjunto de categorias (total da coluna).
export function somaColuna(valores: MapaValores, categoriaIds: string[], mes: number): number;
```

Regras:
- `achatarValores`: para cada categoria e cada mês 1–12 presente no mapa, emite `{categoriaId, mes,
  valor: valor ?? 0}` (arredondado a 2 casas). Ignora meses fora de 1–12.
- `somaLinha`: soma `valores[categoriaId]?.[m]` para m=1..12 (0 se ausente).
- `somaColuna`: soma `valores[id]?.[mes]` para os `categoriaIds` (0 se ausente).

## Actions — `src/app/(app)/financeiro/orcamento/actions.ts`

```ts
export type CategoriaOrc = { id: string; nome: string; natureza: "RECEITA" | "DESPESA"; ordem_dre: number };

// Categorias ativas (ordenadas por natureza + ordem_dre) + valores do ano.
export async function listarOrcamento(ano: number): Promise<{ categorias: CategoriaOrc[]; valores: MapaValores }>;

// Upsert das células (grava o valor de cada categoria/mês). Gate podeGerenciarFinanceiro.
export async function salvarOrcamento(ano: number, celulas: CelulaOrcamento[]): Promise<{ ok?: boolean; erro?: string }>;
```

- `listarOrcamento`: gate `podeGerenciarFinanceiro` (senão `{categorias:[], valores:{}}`). Lê
  `categoria` (ativa) ordenada por `natureza desc` (RECEITA antes de DESPESA) + `ordem_dre`; lê
  `orcamento` do `ano` e monta `valores[categoria_id][mes] = valor`.
- `salvarOrcamento`: gate. Faz `upsert` em `orcamento` (`onConflict: 'categoria_id,ano,mes'`) para cada
  célula, com `ano` e `atualizado_em`. (Chunk se necessário; volume é 11 categorias × 12 = 132 linhas.)
  `atualizado_por` fica nulo (via service? não — usa o cliente da sessão, RLS aplica; `atualizado_por`
  opcional). Retorna `{ ok }` ou `{ erro }`.

## UI — `src/app/(app)/financeiro/orcamento/`

### Página `page.tsx` (server)
Gate `podeGerenciarFinanceiro` (senão `redirect('/')`). Carrega o ano corrente e passa
`listarOrcamento(anoAtual)` para o componente cliente. `PageHeader` "Orçamento".

### `GradeOrcamento.tsx` (client)
- **Seletor de ano** (ex.: `<select>` com alguns anos ao redor do atual) → ao trocar, chama
  `listarOrcamento(ano)` e recarrega a grade.
- **Grade** (rolagem horizontal, `overflow-x-auto`):
  - Cabeçalho: `Categoria | Jan | Fev | … | Dez | Total`.
  - Linhas agrupadas por natureza: um subcabeçalho **RECEITAS** e **DESPESAS**; dentro, as categorias
    na ordem. Cada célula de mês é um `<input type="number" step="0.01">` ligado a `valores`.
  - Coluna **Total** por linha (`somaLinha`) e uma **linha de totais** por mês (`somaColuna` sobre as
    categorias do grupo) + total geral. Receitas e despesas somadas por grupo; e um **Resultado**
    (receitas − despesas) por mês, opcional.
  - Formatação: os totais com `formatarMoeda`; as células editáveis mostram o número puro.
- **Atalhos:**
  - **Replicar** por linha: um botão/ícone que copia o valor de Janeiro (ou de um mês escolhido) para
    os 12 meses daquela categoria (estado local).
  - **Copiar do ano anterior:** botão que chama `listarOrcamento(ano-1)` e popula a grade (não salvo até
    o usuário clicar Salvar).
- **Salvar:** botão que chama `salvarOrcamento(ano, achatarValores(valores))`; feedback "Salvo ✓" / erro.
- Estado: `valores: MapaValores` (edições locais). Trocar ano/copiar recarrega/popula o mapa.

### Navegação
Adicionar link **"Orçamento"** no financeiro. O menu lateral hoje aponta para `/financeiro/cadastros`;
o financeiro tem sub-rotas (cadastros, contas-a-pagar, contas-a-receber, dashboard, regua-cobranca).
Adicionar um card/aba "Orçamento" no hub/entrada do financeiro (seguir o padrão de navegação já usado
entre as sub-rotas do financeiro) apontando para `/financeiro/orcamento`.

## Tratamento de erros
- Sem permissão → página redireciona; actions retornam vazio/`{erro}`.
- Célula vazia/inválida → tratada como 0 (não salva lixo). `valor` numérico ≥ 0 (negativos permitidos?
  não — orçamento é valor absoluto por natureza; barra negativos, mínimo 0).
- Salvar sem alterações → no-op benigno (upsert idempotente).

## Testes
- **Unit (Vitest):** `achatarValores`, `somaLinha`, `somaColuna` (casos com meses ausentes, arredondamento).
- **Migration:** aplicar; verificar tabela `orcamento` + unique.
- **Smoke:** `GradeOrcamento` renderiza com categorias/valores mockados sem lançar.

## Migrations
Uma migration nova: `0047_orcamento.sql` (tabela + índice + RLS). Sem enum/`ALTER TYPE`.
