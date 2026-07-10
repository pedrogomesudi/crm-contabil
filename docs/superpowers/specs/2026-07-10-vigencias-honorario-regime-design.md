# Vigências de honorário e regime tributário — Design (Fatia B)

> **Status:** design aprovado · **Data:** 2026-07-10
> **Contexto:** segunda das três fatias de RF-021. A **Fatia A** (regime vencido + 13º, `v5.8.0`) já foi
> entregue. A **Fatia C** (reajuste em lote via BACEN) depende desta.

## 1. O problema

`calcularMetricas` (`src/lib/financeiro/metricas.ts`) usa **o honorário atual** para todos os meses da
janela de 12 meses. Um cliente que foi de R$ 500 para R$ 800 aparece com 800 no MRR de doze meses
atrás. A própria tela de indicadores admite isso ("MRR histórico é aproximação").

O regime tributário tem o mesmo defeito: `clientes.regime_tributario` é sobrescrito, e a **geração
retroativa de obrigações** aplica o regime de hoje a competências antigas.

## 2. O que esta fatia NÃO faz

**Não corrige o passado.** O dado de quanto cada cliente pagava em meses anteriores não existe em lugar
nenhum — não está em nenhuma tabela, log ou backup. Qualquer reconstrução seria repetir o valor atual
para trás, ou seja, exatamente a aproximação de hoje, porém **disfarçada de fato**.

O que esta fatia faz é **parar de perder o histórico daqui para frente**, e **declarar** o que é
estimativa (ver §4, `estimada`).

## 3. Modelo de dados

Migration `supabase/migrations/0072_vigencias.sql` (idempotente).

### 3.1 `vigente_de` aberto, sem `vigente_ate`

Cada linha diz apenas: *"a partir desta competência, o valor é X"*.

> **Regra de resolução:** o valor vigente na competência **C** é o da linha com o **maior
> `vigente_de <= C`**.

Uma mudança = **uma escrita**. Não existe intervalo para manter, logo não existe buraco nem
sobreposição entre linhas — a classe inteira de bugs de intervalo desaparece.

### 3.2 `honorario_vigencia`

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `cliente_id` | uuid FK → `clientes(id)` on delete cascade | |
| `valor` | `numeric(15,2) not null` | |
| `vigente_de` | `date not null` | sempre o 1º dia do mês (`check`) |
| `estimada` | `boolean not null default false` | `true` só nas linhas do backfill |
| `criado_em`, `criado_por` | | autoria |

`unique (cliente_id, vigente_de)`; índice em `(cliente_id, vigente_de desc)` para a resolução.

### 3.3 `regime_vigencia`

Igual, trocando `valor numeric` por `regime regime_tributario not null` (o enum já existe:
`Simples | Presumido | Real | MEI | Isento/PF`).

### 3.4 Backfill — honesto por construção

Uma linha por cliente ativo, com **`estimada = true`**:

```sql
vigente_de = date_trunc('month', coalesce(c.data_inicio, c.criado_em))::date
valor      = f.honorario_mensal   -- e regime = c.regime_tributario
```

São **99 linhas** de honorário (todos os clientes ativos têm honorário > 0) e 99 de regime. Os 22
clientes sem `data_inicio` usam `criado_em` — todos os 99 o têm. O piso resultante é outubro/2025.

Essas linhas afirmam *"até onde sabemos, era isso"*, não *"era isso"*. `on conflict do nothing` torna o
backfill idempotente.

## 4. Captura por trigger (não no código)

O honorário é escrito por **quatro caminhos**: o formulário da ficha (`salvarHonorario`), as RPCs de
importação do Domínio (`0016`/`0027`), o trigger `sync_honorario_por_contrato` e o
`capturar_saida_cliente`. O regime, por dois (formulário e importação).

Instrumentar cada caminho é garantir esquecer algum. Os triggers pegam todos — é o padrão que o projeto
já usa em `trg_capturar_saida`.

- `AFTER INSERT OR UPDATE OF honorario_mensal ON clientes_financeiro`
- `AFTER INSERT OR UPDATE OF regime_tributario ON clientes`

Regras dos triggers:

- **Só grava se mudou:** no `UPDATE`, `new.valor is distinct from old.valor`. Sem isso, qualquer
  `update` na ficha criaria uma vigência espúria.
- **`OLD` não existe no `INSERT`.** Em `plpgsql`, ler `OLD.honorario_mensal` durante um `INSERT` levanta
  *"record old is not assigned yet"*. O corpo do trigger **precisa** ramificar por `tg_op`:
  ```sql
  if tg_op = 'INSERT' then
    -- grava a vigência se o valor for > 0
  elsif new.honorario_mensal is distinct from old.honorario_mensal then
    -- grava a vigência
  else
    return null;  -- nada mudou
  end if;
  ```
- **`vigente_de = date_trunc('month', now())`** — a mudança vale desde o 1º dia do mês corrente
  (decisão de negócio: mudou em 15/03 → março já cobra o valor novo; o título de março só nasce em 1º
  de abril, então já sai correto).
- **Duas mudanças no mesmo mês:** `on conflict (cliente_id, vigente_de) do update set valor = <novo>,
  estimada = false`. A última vence; o mês nunca tem duas verdades.
- Honorário nulo ou zero **não** gera vigência.

Consequência de projeto: o **reajuste em lote da Fatia C** vai apenas gravar `honorario_mensal`, e a
vigência de janeiro nasce sozinha. Nenhum código novo de vigência lá.

## 5. Os três consumidores

### 5.1 Indicadores (`/financeiro/indicadores`)

`ClienteMetrica.honorario: number` vira `vigencias: VigenciaValor[]`. Nova função pura:

```ts
export type VigenciaValor = { vigenteDe: string; valor: number; estimada: boolean };

// Valor vigente no mês "YYYY-MM": a vigência com maior vigenteDe <= mês.
// Antes da primeira vigência, extrapola a primeira (e devolve estimado = true).
export function honorarioEm(vigencias: VigenciaValor[], mes: string): { valor: number; estimado: boolean };
```

`calcularMetricas` passa a resolver o honorário **de cada mês**. O MRR de março usa o honorário de
março. Meses cujo valor veio de linha `estimada` (ou de extrapolação) são marcados, e a tela passa a
apontar **quais** meses são estimados, em vez de um aviso genérico.

`carregarIndicadores` (`src/app/(app)/financeiro/indicadores/actions.ts`) passa a carregar as vigências
junto dos clientes.

**Relação com `honorario_saida`** (criado na migration `0068`): ele fotografa o honorário no momento em
que o cliente é inativado, e hoje alimenta o *churn de receita*. Com as vigências, o honorário do mês de
saída sai de `honorarioEm(vigencias, mesSaida)` — mais preciso, porque respeita a vigência daquele mês.
`honorario_saida` **permanece** como *fallback* para clientes sem vigência alguma, e o campo continua a
ser preenchido pelo trigger existente. Não há remoção de comportamento nesta fatia.

### 5.2 Geração de mensalidades (SQL)

Nova função:

```sql
create or replace function honorario_vigente(p_cliente uuid, p_competencia date) returns numeric
```

Devolve o valor da vigência com maior `vigente_de <= p_competencia`; se não houver nenhuma, o valor da
**primeira** vigência (extrapolação); se não houver vigência alguma, `clientes_financeiro.honorario_mensal`.

`gerar_mensalidades` passa a usá-la no bloco (2) em vez de `f.honorario_mensal`, e no bloco (3) do 13º.

**Corrige um erro real:** gerar uma competência antiga **depois** de um reajuste hoje cobraria o valor
novo por um serviço velho.

### 5.3 Obrigações (`src/lib/obrigacoes/motor.ts`)

`gerarInstancias(supabase, ano, mes, clienteId?)` lê `clientes.regime_tributario` (atual) e chama
`sugerirPerfil(tipo_pessoa, regime, qtd)`. Passa a resolver o **regime vigente na competência**, via
função pura:

```ts
export type VigenciaRegime = { vigenteDe: string; regime: string };
export function regimeEm(vigencias: VigenciaRegime[], competencia: string): string;
```

A geração **retroativa** (até 24 meses) passa a respeitar o regime da época, em vez de aplicar o de hoje
a competências antigas.

## 6. UI

Na seção de honorário da ficha do cliente, uma **linha do tempo** somente-leitura:

```
Honorário       01/2026 · R$ 500,00
                10/2025 · R$ 450,00   (estimada)

Regime          03/2026 · Presumido
                10/2025 · Simples     (estimada)
```

As vigências **não se digitam** — nascem das mudanças. Não há tela de edição (ver §8).

## 7. Erros e casos de borda

- **Competência anterior à primeira vigência:** usa a **primeira** vigência (extrapolação para trás) e
  devolve `estimado = true`. É o que já acontece hoje, mas agora **declarado**.
- **Cliente sem vigência nenhuma:** cai no `honorario_mensal` atual (só possível entre a migration e o
  backfill, ou para cliente criado sem honorário).
- **Honorário nulo ou zero:** não gera vigência.
- **`update` que não muda o valor:** não gera vigência (`is distinct from`).
- **`vigente_de` sempre no 1º do mês:** garantido por `check (vigente_de = date_trunc('month', vigente_de)::date)`
  e pelo `date_trunc` no trigger.
- **Backfill idempotente:** `on conflict do nothing`.
- **Cliente excluído:** `on delete cascade` remove as vigências junto.

## 8. Testes

- **Unit `honorarioEm` — fronteiras** (é onde este tipo de resolução erra):
  - mês exatamente igual ao `vigente_de` → usa essa vigência;
  - mês entre duas vigências → usa a anterior;
  - mês **antes** da primeira vigência → extrapola a primeira e devolve `estimado = true`;
  - vigência `estimada = true` → `estimado = true` mesmo com mês posterior;
  - lista vazia → `valor = 0`, `estimado = true`.
- **Unit `regimeEm`** — mesmas fronteiras.
- **Unit `calcularMetricas` com vigências:** cliente que foi de 500 → 800 em março de 2026. **MRR de
  fevereiro = 500 e de março = 800.** É o teste que prova que a aproximação acabou; hoje ambos dariam 800.
- **DB (`rls.test.sql`):**
  - **`insert` em `clientes_financeiro` com honorário não explode** (a armadilha do `OLD` inexistente) e
    cria a vigência inicial;
  - alterar `honorario_mensal` cria **uma** vigência com `vigente_de` no 1º do mês corrente e `estimada = false`;
  - `update` que não muda o valor **não** cria vigência;
  - duas alterações no mesmo mês resultam em **uma** linha, com o último valor;
  - alterar `regime_tributario` cria vigência de regime;
  - `honorario_vigente(cliente, '2026-01-01')` devolve o valor da época, não o atual;
  - `gerar_mensalidades` de uma competência antiga usa o honorário daquela competência.

## 9. Fora de escopo (consciente)

- **Edição manual de vigências** (corrigir uma data errada). As vigências nascem das mudanças; se
  precisar corrigir, é caso para uma fatia própria com auditoria.
- Vigência de **`dia_vencimento`**, de **contador responsável** ou de outros campos do cadastro.
- **Reajuste em lote via BACEN** (Fatia C) — que só precisa gravar o honorário; a vigência nasce sozinha.
- Reconstruir o histórico anterior à entrega (§2).
