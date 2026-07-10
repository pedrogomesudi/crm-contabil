# Dashboard de Churn / Ticket médio (RF-070) — Design

**Data:** 2026-07-09
**Status:** Aprovado (aguardando revisão do spec)

## Objetivo

Entregar um painel de saúde da carteira do escritório com os indicadores de
**ticket médio**, **MRR**, **nº de clientes ativos**, **churn** (de clientes e de
receita) e **crescimento** (novos × saídas), mês a mês, além dos números do
momento. Fecha o RF-070 do gap analysis.

## Contexto / dados existentes

- `clientes.status` (`ativo`/`inativo`), `clientes.data_inicio` (entrada),
  `clientes.competencia_inicial`, `clientes.excluido_em` (soft delete).
- `clientes_financeiro.honorario_mensal numeric(12,2)` — mensalidade, sincronizada
  pela trigger `sync_honorario_por_contrato` (0029) = soma dos contratos **ativos**.
- `clientes_financeiro.data_saida date` — já existe, editável na ficha
  (`HonorarioForm`/`extensaoCliente`), hoje **não preenchida em nenhum cliente**.

**Estado atual do banco (2026-07-09):** 99 clientes, todos ativos, todos com
honorário. Ticket médio ≈ R$ 363,15 · MRR ≈ R$ 35.951,60. `data_saida` vazia em
100% → churn começa a acumular a partir da entrada em produção.

**Limitações assumidas:**
- Não há histórico de honorário: a reconstrução histórica de MRR usa o honorário
  **atual** (para ativos) e o **fotografado na saída** (para os que saíram). É uma
  aproximação — documentada na UI.
- Clientes sem `data_inicio` (os 22 sem contrato Domínio) entram como **base
  pré-janela** (ativos desde antes do intervalo), nunca como "novos" de um mês.

## 1. Modelo de dados (migration 0068)

Arquivo: `supabase/migrations/0068_metricas_churn.sql`

- Nova coluna:
  ```sql
  alter table clientes_financeiro
    add column if not exists honorario_saida numeric(12, 2);
  ```
- Trigger em `clientes` que captura a saída em **todos os caminhos** (inativação
  manual e sync do Domínio), rodando `AFTER UPDATE OF status`:
  - `ativo → inativo`: grava `data_saida = coalesce(data_saida, hoje_SP)` e
    `honorario_saida = coalesce(honorario_saida, honorario_mensal)`.
  - `inativo → ativo`: limpa `data_saida` e `honorario_saida` (voltou ⇒ não é
    churn).

  `hoje_SP` = `(now() at time zone 'America/Sao_Paulo')::date`, consistente com o
  `hojeSP()` da aplicação. A trigger só escreve em `clientes_financeiro` (a linha
  sempre existe — criada pela trigger de bootstrap do cliente). Idempotente:
  `create or replace function` + `drop trigger if exists`.

  ```sql
  create or replace function capturar_saida_cliente() returns trigger
    language plpgsql security definer set search_path = public as $$
  declare hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  begin
    if new.status = 'inativo' and old.status is distinct from 'inativo' then
      update clientes_financeiro
        set data_saida = coalesce(data_saida, hoje),
            honorario_saida = coalesce(honorario_saida, honorario_mensal)
        where cliente_id = new.id;
    elsif new.status = 'ativo' and old.status = 'inativo' then
      update clientes_financeiro
        set data_saida = null, honorario_saida = null
        where cliente_id = new.id;
    end if;
    return new;
  end $$;
  drop trigger if exists trg_capturar_saida on clientes;
  create trigger trg_capturar_saida after update of status on clientes
    for each row execute function capturar_saida_cliente();
  ```

O campo manual `data_saida` na ficha continua funcionando para ajuste fino (a
trigger só preenche quando está vazio, via `coalesce`).

## 2. Métricas — definições

Janela padrão: **últimos 12 meses** (inclui o mês corrente), por competência de
calendário (America/Sao_Paulo). Para cada mês *M* (com `ini` = 1º dia de *M*,
`fim` = último dia de *M*):

- **Base(M)** = clientes ativos no início de *M* = `data_inicio < ini` (ou sem
  `data_inicio`) **e** (`data_saida` nula **ou** `data_saida >= ini`).
- **Novos(M)** = clientes com `data_inicio` dentro de *M* (`ini <= data_inicio <= fim`).
- **Churn(M)** = clientes com `data_saida` dentro de *M*.
- **Líquido(M)** = Novos(M) − Churn(M).
- **Ativos ao fim(M)** = Base(M) + Novos(M) − Churn(M).
- **Churn % clientes(M)** = Churn(M) ÷ Base(M); se Base(M) = 0 ⇒ 0.
- **Churn receita(M)** = Σ `honorarioSaida` dos clientes que saíram em *M*.
- **MRR(M)** = Σ honorário dos ativos ao fim de *M*, onde o honorário de um cliente
  "em *M*" é: `honorarioSaida` se ele saiu (tem `dataSaida`), senão `honorario`
  (atual). Só entram os ativos ao fim de *M*.
- **Ticket médio(M)** = MRR(M) ÷ Ativos ao fim(M); se 0 ativos ⇒ 0.

**Cartões do momento** (topo): MRR atual, Ticket médio atual, Clientes ativos
(contagem atual), Churn do mês corrente (% clientes + R$ receita).

Arredondamento monetário: 2 casas (centavos), `Math.round(x*100)/100`.
Percentual: 1 casa.

## 3. Arquitetura

**Helper puro** `src/lib/financeiro/metricas.ts` (TDD, sem I/O):

```ts
export type ClienteMetrica = {
  dataInicio: string | null;   // ISO YYYY-MM-DD
  dataSaida: string | null;    // ISO YYYY-MM-DD
  honorario: number;           // honorario_mensal atual (0 se null)
  honorarioSaida: number | null; // fotografado na saída
};
export type MesMetrica = {
  mes: string;                 // "YYYY-MM"
  base: number;
  novos: number;
  churn: number;
  liquido: number;
  ativosFim: number;
  churnPct: number;            // 0..100, 1 casa
  churnReceita: number;
  mrr: number;
  ticketMedio: number;
};
export type ResumoMetricas = {
  serie: MesMetrica[];         // ordem cronológica
  atual: { mrr: number; ticketMedio: number; ativos: number; churnPct: number; churnReceita: number };
};

// janela = lista de "YYYY-MM" em ordem cronológica (12 meses até refYYYYYMM)
export function mesesJanela(refAnoMes: string, n: number): string[];
export function calcularMetricas(clientes: ClienteMetrica[], meses: string[]): ResumoMetricas;
```

Funções auxiliares puras internas (comparações de data por string ISO, que são
lexicograficamente ordenáveis). `atual` = derivado do último mês da série + a
contagem/MRR calculados sobre "hoje".

**Action** `src/app/(app)/financeiro/indicadores/actions.ts`:
- `carregarIndicadores(): Promise<ResumoMetricas | null>` — gate
  `podeGerenciarFinanceiro`; `createServerSupabase`; lê
  `clientes` (id, data_inicio, status, excluido_em) join `clientes_financeiro`
  (honorario_mensal, data_saida, honorario_saida), filtrando `excluido_em is null`;
  monta `ClienteMetrica[]`; chama `calcularMetricas` com `mesesJanela(hoje, 12)`.

**Página** `src/app/(app)/financeiro/indicadores/page.tsx` (server):
- Gate `podeGerenciarFinanceiro`; `<Voltar href="/financeiro/cadastros" />`;
  `PageHeader titulo="Indicadores"`.
- 4 cartões do momento.
- Componente client `Indicadores.tsx` com a tabela mês a mês (colunas: Mês, Base,
  Novos, Churn, Líquido, Ativos, Churn %, Churn R$, MRR, Ticket) + **exportar CSV**
  (helper `paraCSV`, padrão dos outros relatórios) + **imprimir** (`print:hidden`
  nos controles). Nota de rodapé sobre a aproximação histórica de MRR.

**Navegação:** card "Indicadores" no hub `financeiro/cadastros/page.tsx`
(`ITENS`), apontando para `/financeiro/indicadores`. Sem novo item de sidebar.

## 4. Testes

- `src/tests/financeiro/metricas.test.ts` (Vitest, helper puro):
  - `mesesJanela` gera N meses em ordem, cruzando virada de ano.
  - Base/Novos/Churn/Líquido num cenário com entradas e saídas conhecidas.
  - Churn % = 0 quando base = 0; cliente sem `data_inicio` conta como base, não como
    novo.
  - MRR usa honorário atual para ativos e `honorarioSaida` para os que saíram.
  - Reativação (sem data_saida) não conta churn.
  - Ticket médio = MRR ÷ ativos; 0 ativos ⇒ 0.
- `src/tests/financeiro/indicadores-render.test.tsx` — smoke `renderToStaticMarkup`
  da tabela (`Indicadores`), mockando a action.

## Fora do escopo (YAGNI)

LTV, coortes de retenção, gráfico interativo, histórico real de honorário. A tabela
+ cartões entregam a leitura; visualização gráfica fica para uma iteração futura.

## Segurança / RLS

Leitura via `createServerSupabase` (RLS ativa) + gate `podeGerenciarFinanceiro`
(admin/financeiro) — MRR/honorário do escritório inteiro é dado sensível. A trigger
é `security definer` (precisa escrever em `clientes_financeiro` a partir do update
em `clientes`); não expõe dado — apenas propaga a saída. Migration imutável após
aplicada (padrão do runner `npm run db:migrate`).
