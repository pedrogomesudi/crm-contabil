# Reajuste anual de honorários em lote (BACEN) — Design (Fatia C)

> **Status:** design aprovado · **Data:** 2026-07-10
> **Contexto:** terceira e última fatia do RF-021. Fecha o requisito. Apoia-se na **Fatia B** (vigências,
> `v5.9.0`): o reajuste apenas grava o honorário, e a vigência de janeiro nasce sozinha pelo trigger.

## 1. Objetivo

Reajustar os honorários em lote uma vez ao ano (janeiro), pelo índice de cada cliente — padrão **salário
mínimo**, com opção de IPCA/IGP-M/INPC, percentual fixo ou "sem reajuste". O percentual é **buscado no
BACEN** e pré-preenchido, mas editável antes de aplicar. Cada reajuste é registrado, protegido contra
duplicidade e reversível.

## 2. Decisões do brainstorming

- **Índice por cliente:** campo em `clientes_financeiro`, padrão `SALARIO_MINIMO`, com IPCA/IGP-M/INPC,
  `PERCENTUAL_FIXO` e `SEM_REAJUSTE` (fora do lote).
- **Fluxo simular → revisar → aplicar:** a tela mostra `valor atual → índice → % → valor novo`,
  pré-preenchido do BACEN e **editável por linha**; desmarca-se quem não entra; nada muda antes do
  "Aplicar". É o padrão do lote de NFS-e.
- **Trava por ano-base + histórico auditado + desfazer:** um cliente já reajustado no ano-base fica fora
  do lote; o histórico permite ver e **desfazer** um reajuste.
- **Desfazer limpa o rastro:** volta o honorário ao valor anterior **e** remove a vigência daquele mês —
  a linha do tempo fica como se o reajuste nunca tivesse ocorrido.

## 3. Fatos do BACEN (séries SGS, confirmadas)

| Índice | Série SGS | Formato do dado | Cálculo do percentual anual |
|---|---|---|---|
| Salário mínimo | **1619** | valor absoluto (R$) | `jan/N ÷ dez/(N−1) − 1` |
| IPCA | **433** | variação mensal (%) | produtório de `(1 + var/100)` das 12 do ano − 1 |
| IGP-M | **189** | variação mensal (%) | idem (pode ser negativo) |
| INPC | **188** | variação mensal (%) | idem |

Reajuste 2026 pelo salário mínimo, confirmado na API: `1518 → 1621` = **6,7852%**.

API pública: `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json&dataInicial=DD/MM/AAAA&dataFinal=DD/MM/AAAA`.

## 4. Modelo de dados

Duas migrations (o enum precisa de uma própria):

### 4.1 `0074_indice_salario_minimo.sql`

`SALARIO_MINIMO` não existe no enum `indice_reajuste`. Adicionar em migration isolada — `ALTER TYPE ...
ADD VALUE` não pode conviver com o uso do valor na mesma transação (pitfall já conhecido do projeto,
migrations 0033/0034):

```sql
alter type indice_reajuste add value if not exists 'SALARIO_MINIMO';
```

O runner (`scripts/db-migrate.mjs`) faz `begin`/`commit` **por arquivo**, então `0074` commita antes de
`0075` começar — é isso que torna o novo valor utilizável na `0075`. **Não juntar as duas** num só
arquivo: `ADD VALUE` e o `default 'SALARIO_MINIMO'` na mesma transação falham
(*"unsafe use of new value of enum type"*).

### 4.2 `0075_reajuste.sql`

Estende `clientes_financeiro`:

```sql
alter table clientes_financeiro
  add column if not exists indice_reajuste indice_reajuste not null default 'SALARIO_MINIMO',
  add column if not exists percentual_reajuste numeric(6,3);  -- só para PERCENTUAL_FIXO
```

Tabela de histórico/trava:

```sql
create table if not exists reajuste_item (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  ano_base int not null,
  indice indice_reajuste not null,
  percentual numeric(6,3) not null,
  valor_anterior numeric(15,2) not null,
  valor_novo numeric(15,2) not null,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id),
  unique (cliente_id, ano_base)   -- a trava contra reajuste duplicado
);
```

RLS: `admin`/`financeiro` (espelha `podeGerenciarFinanceiro`). Sem tabela de "lote": o `ano_base` é o
identificador da rodada.

## 5. BACEN isolado — `src/lib/reajuste/bacen.ts`

Só I/O, trocável, no padrão do `src/lib/receita/brasilapi.ts` (fetch com `AbortSignal.timeout`):

```ts
export const SERIE_SGS = { SALARIO_MINIMO: 1619, IPCA: 433, IGPM: 189, INPC: 188 } as const;
export type PontoSerie = { data: string; valor: string }; // "01/01/2026", "1621.00"
export async function buscarSerie(codigo: number, dataInicial: string, dataFinal: string): Promise<PontoSerie[]>;
```

Nenhum cálculo aqui — traz os números crus. Erro de rede/timeout → lança; o chamador degrada (§8).

## 6. Cálculo puro — `src/lib/reajuste/indice.ts`

Onde o erro mora, então tudo determinístico e testável:

```ts
// jan/N ÷ dez/(N-1) - 1, em %. Recebe a série 1619 cobrindo dez/(N-1) e jan/N.
export function variacaoSalarioMinimo(serie: PontoSerie[], ano: number): number;

// Produtório de (1 + var/100) das 12 variações mensais do ano, -1, em %. IPCA/IGP-M/INPC.
export function variacaoAcumulada(serie: PontoSerie[]): number;

// round(valorAtual * (1 + percentual/100), 2)
export function aplicarPercentual(valorAtual: number, percentual: number): number;
```

O percentual vem do BACEN, mas a tela permite editar cada linha — então o valor novo é sempre
`aplicarPercentual`, com o % do BACEN ou o ajustado.

## 7. Simulação e aplicação — `src/lib/reajuste/simulacao.ts` + actions

### 7.1 Simulação (pura + action)

`montarSimulacao(clientes, percentuaisPorIndice, anoBase)` (pura) monta as linhas. A action
`simularReajuste(anoBase)`:

1. Carrega clientes ativos com honorário, `indice_reajuste ≠ 'SEM_REAJUSTE'`, **sem `reajuste_item`
   naquele `ano_base`**.
2. Busca no BACEN **uma vez por índice** presente (não por cliente); `PERCENTUAL_FIXO` usa
   `percentual_reajuste` e **não** chama o BACEN.
3. Devolve as linhas: `{ clienteId, nome, valorAtual, indice, percentual, valorNovo, marcada }`.

`type LinhaReajuste = { clienteId: string; nome: string; valorAtual: number; indice: string;
percentual: number; valorNovo: number; marcada: boolean }`.

### 7.2 Tela `/financeiro/reajuste`

Tabela editável (padrão do lote de NFS-e): desmarcar cliente, ajustar `%` ou `valor novo` por linha,
total dos reajustados no rodapé, botão **"Aplicar"**. Nada muda antes disso.

### 7.3 Aplicação

`aplicarReajusteLote(anoBase, itens)` (action) — para cada linha **marcada**:

- `update clientes_financeiro set honorario_mensal = <valorNovo>` → o **trigger da Fatia B** grava a
  vigência de janeiro (nenhum código de vigência aqui);
- `insert into reajuste_item (...)`.

Idempotente pela trava `(cliente_id, ano_base)`: reaplicar não duplica.

## 8. Histórico e desfazer

Na ficha do cliente, junto à linha do tempo de vigências, os reajustes: `2026 · IPCA 6,79% · R$ 500 →
534`, com botão **Desfazer**.

`desfazer_reajuste(p_item_id)` — **função SQL `SECURITY DEFINER`**, a operação mais delicada da fatia:

1. Lê o `reajuste_item` (valor anterior, cliente, mês da vigência criada).
2. **Suprime o trigger de vigência** no escopo (`set local session_replication_role = replica`) para
   que voltar o honorário **não** recrie uma vigência.
3. `update clientes_financeiro set honorario_mensal = valor_anterior`.
4. `delete from honorario_vigencia where cliente_id = ... and vigente_de = date_trunc('month', criado_em)`.
5. `delete from reajuste_item where id = p_item_id`.

Resultado: honorário volta, a vigência do reajuste some, o `reajuste_item` some — a linha do tempo fica
idêntica a antes do reajuste. A action `desfazerReajuste(itemId)` (gate `podeGerenciarFinanceiro`)
chama a função.

> **Por que `session_replication_role = replica` e não `disable trigger`:** `disable trigger` exige lock
> de DDL na tabela e afeta **todas** as sessões; `session_replication_role` é **local à transação** da
> função e só desliga triggers de usuário no escopo dela. É a ferramenta correta para "escrever sem
> disparar o trigger, só aqui".

## 9. Permissões e erros

- Tudo gated por **`podeGerenciarFinanceiro`** (admin/financeiro); RLS idem.
- **BACEN fora do ar:** `simularReajuste` não quebra — captura o erro por índice e devolve `percentual =
  0` para as linhas daquele índice, deixando a tela permitir digitar. O reajuste nunca depende
  exclusivamente da API.
- **Índice do ano ainda não publicado** (ex.: consulta antes de janeiro fechar): percentual 0, linha
  **desmarcada** por padrão.
- **Trava:** cliente já reajustado no `ano_base` não aparece na simulação; concorrência é barrada pelo
  índice único.
- **Percentual negativo** (IGP-M já teve meses negativos no acumulado): permitido, mas a tela **destaca**
  — reduzir honorário é raro e merece conferência.
- **Cliente sem honorário** ou `SEM_REAJUSTE`: fora do lote.

## 10. Testes

- **Unit `indice.ts`:** `variacaoSalarioMinimo` com a série real (dez/2025 1518 → jan/2026 1621) =
  **6,7852%**; `variacaoAcumulada` de 12 variações (produtório); `aplicarPercentual(500, 6.7852)` =
  533,93. Fronteiras: série incompleta (menos de 12 meses → lança ou 0), variação zero, negativa.
- **Unit `simulacao.ts`:** monta as linhas; exclui `SEM_REAJUSTE` e quem já tem `reajuste_item` no ano;
  `PERCENTUAL_FIXO` usa o percentual do cadastro.
- **Integração mockada `bacen.ts`:** `fetch` mockado (como o teste de `envio.ts` da NFS-e) — parse do
  JSON, timeout, erro de rede.
- **DB (`rls.test.sql`):**
  - a trava `(cliente_id, ano_base)` barra o segundo reajuste;
  - aplicar um reajuste grava `reajuste_item` **e** cria a vigência de janeiro (via trigger da Fatia B);
  - `desfazer_reajuste` volta o honorário, **remove a vigência daquele mês** e apaga o `reajuste_item` —
    a contagem de vigências volta ao que era antes.

## 11. Fora de escopo (consciente)

- **Reajuste retroativo de títulos já gerados** — o reajuste vale para as competências futuras.
- **Agendamento automático** do reajuste em janeiro — é uma ação manual anual (diferente da geração de
  mensalidades, que é mensal e automática).
- Índices além dos quatro; reajuste de contratos formais (a tabela `contrato` segue vazia).
