# Competência do mês anterior e vencimento no mês atual — Design (Fatia A)

> **Status:** design aprovado · **Data:** 2026-07-09
> **Contexto:** primeira das três fatias de RF-021. Fatia B = vigências (honorário/regime);
> Fatia C = reajuste em lote via BACEN. Esta fatia é pré-requisito de ambas e corrige um estado
> errado já gravado em produção.

## 1. O problema

O escritório fatura **em regime vencido**: o serviço prestado em um mês é cobrado no mês seguinte.
Na prática, a geração roda nos primeiros dias do mês M, referente ao serviço de **M−1**, com
vencimento em **M**.

O sistema faz outra coisa:

- `gerar_mensalidades(p_competencia)` grava `vencimento = competência + (dia_vencimento − 1)`, ou seja,
  **no mesmo mês da competência**.
- `gerar_mensalidades_automatico()` (pg_cron, dia 1) chama a RPC com **o mês corrente**.

Resultado em produção: 99 títulos com competência `2026-07-01` e vencimento em julho, e 102 NFS-e
com competência `2026-07-01` — todos referentes ao serviço de **junho**.

Nenhum dano ocorreu: a régua de cobrança está **desativada** (`whatsapp_config.regua_ativa = false`,
zero mensagens de régua enviadas) e **nenhum título foi baixado** (todos `ABERTO`).

## 2. A restrição que define a solução

**A competência é a chave de idempotência de duas coisas:**

- **Títulos:** índice único `uq_titulo_honorario (cliente_id, competencia, origem) where contrato_id is null`.
- **NFS-e:** a anti-duplicidade da emissão checa `cliente_id + competencia + status='autorizada' + ambiente + avulsa=false`.

E **a competência é enviada à Sefin**: `dps.ts` grava `<dCompet>` na DPS assinada. As 77 notas
autorizadas em produção carregam `dCompet = 2026-07-01` no XML que está no Fisco. **Esse dado é
imutável.**

Disso decorre que **corrigir apenas o financeiro não funciona**: se as NFS-e continuarem rotuladas
como julho, em agosto — ao emitir as notas do serviço de julho (competência julho, pela regra nova) —
a anti-duplicidade encontraria as 77 notas existentes e **bloquearia a emissão**. O escritório ficaria
sem emitir as notas do mês, com um erro de causa não óbvia.

## 3. A solução: separar "mês do serviço" de "o que a nota diz"

Sem cancelar nem reemitir nenhuma nota, e sem tocar em nenhum XML:

- **`nfse.competencia`** passa a significar o **mês do serviço** (junho). É o que o financeiro, os
  relatórios e a anti-duplicidade usam.
- **Nova coluna `nfse.dcompet`** guarda **o que foi efetivamente enviado à Sefin** (julho, nessas 102
  linhas; igual à competência em todas as futuras).

A divergência entre o nosso rótulo e o documento fiscal fica **explícita numa coluna**, em vez de
escondida. O XML (`dps_xml`, `nfse_xml`) e a nota no Fisco continuam intactos, dizendo julho.

## 4. Regra de geração

Migration `supabase/migrations/0071_competencia_mes_anterior.sql` (idempotente via `create or replace`).

### 4.1 `gerar_mensalidades(p_competencia date)`

Passa a gravar o vencimento da **mensalidade** no mês seguinte à competência:

```sql
v_venc := (v_comp + interval '1 month')::date + (dia_vencimento - 1);
```

O contrato da função vira: *"gera a mensalidade da competência X, vencendo no mês X+1"*. O **13º não
segue essa regra** (ver §4.3).

Não há risco de transbordo de data: `dia_vencimento` tem `CHECK between 1 and 28` tanto em `contrato`
quanto em `clientes_financeiro`, então somar um mês nunca escorrega para o mês seguinte.

### 4.3 O 13º honorário: duas parcelas, vencimentos fixos

**Regra de negócio:** o 13º equivale a **um** honorário mensal, dividido em **duas parcelas de 50%**,
vencendo sempre em **20/11** e **15/12**. Vale para **todos os clientes ativos com honorário**.

**Timing.** As parcelas são geradas na rodada de **1º de novembro** (`p_competencia` = outubro), quando
ambos os vencimentos ainda estão no futuro. Se fossem geradas na rodada de dezembro (competência
novembro), a parcela 1 — que vence 20/11 — **nasceria vencida**.

**Modelo:**

| | Competência | Vencimento | Valor | `parcela` |
|---|---|---|---|---|
| Parcela 1 | `AAAA-11-01` | `AAAA-11-20` | `round(honorario / 2, 2)` | 1 de 2 |
| Parcela 2 | `AAAA-12-01` | `AAAA-12-15` | `honorario − parcela 1` | 2 de 2 |

- As competências precisam ser **distintas** por causa de `uq_titulo_honorario (cliente_id, competencia, origem)`.
- Os vencimentos são **fixos**, não derivados da competência.
- O valor da parcela 2 é o **resto**, não `round(honorario/2, 2)` de novo: para R$ 333,33 isso dá
  166,67 + 166,66 = 333,33 exato. Arredondar as duas metades cria ou destrói um centavo.
- Categoria de receita: **"13º honorário"** (já existe em `categoria`).
- Colunas `parcela` e `total_parcelas` (já existem em `titulo`) recebem 1/2 e 2/2.
- `contrato_id = null`, mesmo para clientes com contrato — o índice aplicável passa a ser
  `uq_titulo_honorario`.

**Remoção deliberada de comportamento:** o 13º **sai do laço de contratos** da RPC. Hoje ele só é
gerado ali (para contratos com `gera_decimo_terceiro`), e como **não existe nenhum contrato cadastrado**,
nenhum cliente jamais receberia 13º. Passa a ser gerado **por cliente**, a partir de
`clientes_financeiro.honorario_mensal` — que já é a soma dos contratos ativos, mantida pelo trigger
`sync_honorario_por_contrato`. Se os dois blocos coexistissem, um cliente com contrato receberia o 13º
**duas vezes** (uma pelo contrato, outra pelo cliente).

### 4.2 `competencia_padrao()` e `gerar_mensalidades_automatico()`

A escolha da competência vira uma função própria — pequena, determinística e **testável isoladamente**,
em vez de ficar embutida no corpo do job (onde só daria para testá-la gerando títulos de verdade):

```sql
-- A competência corrente é sempre o mês anterior: fatura-se em regime vencido.
create or replace function competencia_padrao(p_hoje date default current_date) returns date
  language sql immutable set search_path = pg_catalog, public as $$
  select (date_trunc('month', p_hoje) - interval '1 month')::date;
$$;
```

O job `gerar-mensalidades-mensal` (pg_cron, `0 6 1 * *`) passa a usá-la:

```sql
perform gerar_mensalidades(competencia_padrao());
```

Rodando em 1º de agosto → competência **julho**, vencimento **10/agosto**.

## 5. Correção dos dados existentes

Na **mesma migration**, e **nesta ordem** — inverter destrói a informação:

1. `alter table nfse add column if not exists dcompet date;`
2. `update nfse set dcompet = competencia where dcompet is null;` — congela o que foi enviado, **antes**
   de qualquer alteração.
3. `update nfse set competencia = '2026-06-01' where competencia = '2026-07-01';` — as **102** linhas
   (77 autorizadas, 17 rejeitadas, 7 canceladas, 1 de homologação). Todas se referem ao mesmo ciclo.
4. `update titulo set competencia = '2026-06-01' where competencia = '2026-07-01' and origem = 'MENSALIDADE';`
   — as **99** linhas. **O vencimento não é tocado** (segue em julho).

Depois disso: `nfse.competencia = junho` (mês do serviço) e `nfse.dcompet = julho` (o que a nota diz).

Os passos 3 e 4 são **datados** e só existem para acertar este ciclo; a migration é idempotente porque
as condições (`= '2026-07-01'`) não casam mais numa segunda execução.

## 6. Emissão de NFS-e

- `emitirNfseCliente` (V5-A, `clientes/[id]/nfse.ts`) e `emitirNfseDoCliente` (V5-B,
  `clientes/[id]/nfse-emitente.ts`) passam a gravar **`dcompet` = a competência usada na DPS**. Como
  as duas coincidem daqui para frente, é uma cópia; o valor da coluna é histórico.
- A **anti-duplicidade continua usando `competencia`**, que agora significa mês do serviço. Junho fica
  bloqueado (já tem nota); julho fica livre para a emissão de agosto.
- O seletor de competência (ficha e `/nfse/lote`) passa a sugerir **o mês anterior** como padrão.
- A tela de geração de mensalidades (`/financeiro/contas-a-receber`) também sugere o mês anterior.

## 7. Erros e casos de borda

- **Ordem da migration é crítica.** O backfill de `dcompet` precede o `update` da competência. Se
  invertido, perde-se para sempre o registro do que foi enviado à Sefin.
- **Idempotência preservada:** junho está livre em `uq_titulo_honorario`, então o `update` não colide.
- **Sem transbordo:** `dia_vencimento` ∈ [1, 28] por CHECK.
- **XML intocado:** `dps_xml` e `nfse_xml` seguem com `dCompet = julho`. A verdade fiscal é o XML.
- **Reversível:** `dcompet` guarda o valor original de cada linha; dá para reconstruir.
- **Notas avulsas** (`avulsa = true`) também recebem `dcompet` no backfill; a anti-duplicidade já as
  ignora.
- **Janela entre migration e deploy:** `dcompet` é anulável. Uma nota emitida depois da migration e
  antes do deploy do código ficaria com `dcompet = null`. É inofensivo (a coluna é só histórico) e a
  janela é de minutos, mas vale aplicar a migration junto do deploy.

## 8. Testes

Asserts em `supabase/tests/rls.test.sql` (roda em transação com ROLLBACK, sem persistir):

- **Vencimento no mês seguinte:** criar cliente de teste com `dia_vencimento = 10`, chamar
  `gerar_mensalidades('2026-05-01')` e verificar `competencia = 2026-05-01` e
  **`vencimento = 2026-06-10`** — não maio.
- **13º nas rodadas erradas não gera nada:** `gerar_mensalidades('2026-05-01')` não cria nenhum título
  `DECIMO_TERCEIRO`.
- **13º na rodada de outubro gera duas parcelas:** `gerar_mensalidades('2026-10-01')` cria exatamente
  dois títulos `DECIMO_TERCEIRO` para o cliente, com:
  - parcela 1: `competencia = 2026-11-01`, `vencimento = 2026-11-20`, `parcela = 1`, `total_parcelas = 2`;
  - parcela 2: `competencia = 2026-12-01`, `vencimento = 2026-12-15`, `parcela = 2`.
- **A soma das parcelas é exata:** com honorário `333.33`, as parcelas são `166.67` e `166.66`, e
  `sum(valor) = 333.33` — nem um centavo criado nem perdido.
- **Idempotência:** chamar `gerar_mensalidades` duas vezes na mesma competência não duplica nem a
  mensalidade nem as parcelas do 13º (`on conflict do nothing`).
- **`competencia_padrao(data)` devolve o mês anterior**, testada em fronteiras: `2026-01-15 → 2025-12-01`
  (vira o ano), `2026-03-01 → 2026-02-01`, `2026-08-31 → 2026-07-01`. É por ela que o job escolhe a
  competência, então testá-la prova a regra sem precisar gerar títulos reais.

Verificação da migração de dados (script de conferência, não teste automatizado):

- `nfse`: 102 linhas com `dcompet is not null`; zero linhas com `competencia = '2026-07-01'`; 102 com
  `competencia = '2026-06-01'`.
- `titulo`: zero com `competencia = '2026-07-01'` e origem MENSALIDADE; 99 com `2026-06-01`; **vencimento
  inalterado** (23 em `2026-07-03`, 76 em `2026-07-10`).

## 9. Fora de escopo (consciente)

- **Corrigir o `vencimento` dos 76 títulos** que vencem dia 10 enquanto o cliente tem
  `dia_vencimento = 3` (o dia foi alterado depois da geração). É outra inconsistência, e alterar
  cobrança sem pedido explícito seria indevido.
- **Cancelar/reemitir** notas fiscais.
- **Vigências** (Fatia B) e **reajuste em lote via BACEN** (Fatia C).
- Ligar a régua de cobrança.
