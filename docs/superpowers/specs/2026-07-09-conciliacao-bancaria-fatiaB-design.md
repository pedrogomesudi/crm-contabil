# Conciliação bancária — Fatia B (Casamento + baixas) — Design

**Data:** 2026-07-09
**Marco:** fecha a conciliação bancária. Casa as movimentações importadas (Fatia A) com o financeiro:
marca baixas existentes como conciliadas, cria baixas a partir de títulos em aberto, e permite lançar
avulsos para movimentos sem título. Objetivo "os dois" definido no brainstorming do módulo.

**Contexto:** Fatia A entregue — `movimento_bancario` (conta_bancaria_id, data, valor **com sinal**,
descricao, `status` pendente/conciliada/ignorada, `baixa_id`), tela `/financeiro/conciliacao`.
Financeiro: `titulo` (RECEBER/PAGAR, status ABERTO/VENCIDO/BAIXADO/BAIXADO_PARCIAL/CANCELADO, valor,
competencia, categoria_id), `baixa` (titulo_id, data_recebimento, valor_recebido, juros/multa/desconto,
conta_bancaria_id, forma_pagamento PIX/BOLETO/CARTAO/TRANSFERENCIA/DINHEIRO, estornada, criado_por —
trigger `trg_status_titulo` marca o título BAIXADO). `registrarBaixa` insere na `baixa`. `categoria`
(nome, natureza). Gate `podeGerenciarFinanceiro`.

**Decisões de brainstorming:**
- **Casamento por valor exato com sinal** (data não exigida; só desempate). Crédito (mov>0) → RECEBER;
  débito (mov<0) → PAGAR.
- **Auto-casar em lote** — botão que concilia os movimentos com casamento **1:1 inequívoco**.
- **Sem correspondência:** "Ignorar" **ou** "Criar lançamento" avulso (título + baixa).
- **Reabrir não apaga a baixa** — só desvincula o movimento e limpa `conciliado_em`.

**Escopo (Fatia B):** motor de casamento + actions (conciliar com baixa/título, criar lançamento,
ignorar, reabrir, auto) + UI acionável. **Fora:** casamento parcial (1 título ↔ vários movimentos ou
vice-versa); tolerância de valor; saldo extrato × sistema.

## 1. Modelo de dados — migration `0065_baixa_conciliado.sql` (idempotente)

```sql
alter table baixa add column if not exists conciliado_em date;
```
`movimento_bancario` já tem `status` e `baixa_id` (Fatia A). Sem outras mudanças de schema.

## 2. Motor de casamento — `src/lib/conciliacao/casar.ts` (helper puro, TDD)

```ts
export function valorAssinadoBaixa(b: { valorRecebido: number; tipoTitulo: "RECEBER" | "PAGAR" }): number;
export function saldoTitulo(t: { valor: number; baixado: number }): number;

export type MovPendente = { id: string; valor: number; data: string };
export type BaixaDisp = { baixaId: string; valorRecebido: number; tipoTitulo: "RECEBER" | "PAGAR"; data: string; clienteNome: string };
export type TituloAberto = { tituloId: string; valor: number; baixado: number; tipo: "RECEBER" | "PAGAR"; vencimento: string; descricao: string };
export type CandBaixa = { baixaId: string; data: string; clienteNome: string };
export type CandTitulo = { tituloId: string; vencimento: string; descricao: string; tipo: "RECEBER" | "PAGAR"; saldo: number };
export function candidatosMovimento(mov: MovPendente, baixas: BaixaDisp[], titulos: TituloAberto[]): { baixas: CandBaixa[]; titulos: CandTitulo[] };

export type Casamento = { movimentoId: string; alvo: "baixa" | "titulo"; alvoId: string };
export function autoCasar(movimentos: MovPendente[], baixas: BaixaDisp[], titulos: TituloAberto[]): Casamento[];
```

- **`valorAssinadoBaixa`** — `tipoTitulo === "RECEBER" ? +valorRecebido : −valorRecebido`.
- **`saldoTitulo`** — `valor − baixado`.
- **`candidatosMovimento`** — baixas com `valorAssinadoBaixa == mov.valor` (mapeadas para `CandBaixa`);
  títulos ABERTO/VENCIDO com `saldoTitulo == Math.abs(mov.valor)` **e** tipo coerente com o sinal
  (`mov.valor > 0 → RECEBER`, `< 0 → PAGAR`). Ambas as listas **ordenadas por proximidade de data**
  (`|Date(mov.data) − Date(ref)|`, ref = `data` da baixa / `vencimento` do título).
- **`autoCasar`** — para cada movimento calcula os candidatos; considera apenas os que têm **exatamente
  um** candidato total (1 baixa e 0 títulos, ou 0 baixas e 1 título). Depois filtra para **mutualidade**:
  um alvo (baixaId/tituloId) só é casado se **um único** movimento o reivindica (senão é ambíguo → ambos
  ficam de fora). Retorna a lista de `Casamento`. Determinístico (sem `Date.now`; datas recebidas
  prontas).

## 3. Actions — `src/app/(app)/financeiro/conciliacao/conciliar-actions.ts`

Gate `podeGerenciarFinanceiro`. `hoje` em timezone SP.
```ts
export type CandidatosView = { baixas: (CandBaixa & { valor: number })[]; titulos: (CandTitulo)[] };
export async function candidatosDoMovimento(movimentoId: string): Promise<CandidatosView>;
export async function conciliarComBaixa(movimentoId: string, baixaId: string): Promise<{ ok?: boolean; erro?: string }>;
export async function conciliarComTitulo(movimentoId: string, tituloId: string): Promise<{ ok?: boolean; erro?: string }>;
export async function criarLancamento(movimentoId: string, categoriaId: string, descricao: string): Promise<{ ok?: boolean; erro?: string }>;
export async function ignorarMovimento(movimentoId: string): Promise<{ ok?: boolean; erro?: string }>;
export async function reabrirMovimento(movimentoId: string): Promise<{ ok?: boolean; erro?: string }>;
export async function conciliarAutomaticos(contaId: string): Promise<{ conciliados: number } | { erro: string }>;
export async function listarCategoriasLancamento(): Promise<{ id: string; nome: string; natureza: string }[]>;
```

- **`candidatosDoMovimento`** — lê o movimento (valor/data/conta); carrega baixas da conta não estornadas
  e **não vinculadas** a nenhum movimento (subconsulta), com o `tipo` do título e nome do cliente; e
  títulos ABERTO/VENCIDO da competência-ish (todos abertos) com `baixado` agregado. Passa por
  `candidatosMovimento` e devolve.
- **`conciliarComBaixa`** — valida o valor assinado da baixa == movimento.valor (defesa); grava
  `movimento.status='conciliada'`, `baixa_id`; `baixa.conciliado_em = hoje`.
- **`conciliarComTitulo`** — carrega o título; cria a baixa (`valor_recebido = |mov.valor|`,
  `data_recebimento = mov.data`, `conta_bancaria_id = mov.conta`, `forma_pagamento = 'TRANSFERENCIA'`,
  `criado_por = perfil.id`, `conciliado_em = hoje`); depois `movimento.status='conciliada'` + `baixa_id`
  = a nova baixa. (Trigger marca o título BAIXADO.)
- **`criarLancamento`** — cria um `titulo` (`tipo = mov.valor > 0 ? 'RECEBER' : 'PAGAR'`,
  `valor = |mov.valor|`, `competencia = ${mov.data.slice(0,7)}-01`, `categoria_id`, `descricao`,
  `status='ABERTO'`, `vencimento = mov.data`), depois cria a `baixa` do valor total (conta/data do
  movimento, `conciliado_em`) e vincula o movimento. Requer `categoriaId`.
- **`ignorarMovimento`** — `status='ignorada'`.
- **`reabrirMovimento`** — `status='pendente'`, `baixa_id = null`; **não** apaga a baixa; limpa
  `conciliado_em` da baixa que estava vinculada (se houver) — o lançamento permanece, só deixa de estar
  conciliado.
- **`conciliarAutomaticos`** — carrega pendentes + baixas disponíveis + títulos abertos da conta; roda
  `autoCasar`; aplica cada casamento (baixa → `conciliarComBaixa`; título → `conciliarComTitulo`); retorna
  a contagem.

## 4. UI — estende `Conciliacao.tsx` (Fatia A)

Cada **linha da lista** de movimentações ganha uma coluna de **ação** conforme o status/candidatos:
- **Pendente:** ao expandir/abrir, chama `candidatosDoMovimento`:
  - **1 candidato** → sugestão inline ("↔ baixa ACME · 20/08" ou "↔ título Mensalidade · R$300") +
    **"Conciliar"** (chama `conciliarComBaixa`/`conciliarComTitulo`).
  - **Vários** → **"Escolher…"** lista os candidatos para o usuário selecionar.
  - **Nenhum** → **"Criar lançamento"** (mini-form: `<select>` categoria + descrição opcional →
    `criarLancamento`) e **"Ignorar"** (`ignorarMovimento`).
- **Conciliada / ignorada:** rótulo do status + **"Reabrir"** (`reabrirMovimento`).
- Botão no topo **"Conciliar automáticos"** → `conciliarAutomaticos(conta)` → recarrega + `"{n}
  conciliada(s)"`.
- Reaproveita o selo de status e os totais crédito/débito já existentes.

> Para não sobrecarregar a lista, os candidatos de cada movimento pendente são carregados **sob demanda**
> (ao clicar "Conciliar…"/expandir a linha), não todos de uma vez.

## 5. Erros / bordas
- Movimento já conciliado/ignorado → ações de conciliar retornam erro suave (recarrega mostra o estado).
- Valor da baixa escolhida ≠ valor do movimento → `conciliarComBaixa` rejeita (defesa).
- `criarLancamento` sem categoria → erro "Selecione a categoria".
- `conciliarAutomaticos` sem casamentos → `{ conciliados: 0 }`.
- Sem permissão → `redirect`/`[]`/erro.

## 6. Testes
- **Unit `casar.test.ts`:** `valorAssinadoBaixa`/`saldoTitulo`; `candidatosMovimento` (filtra por valor
  assinado + tipo pelo sinal; ordena por proximidade de data); `autoCasar` (casa o 1:1 inequívoco; NÃO
  casa quando o movimento tem 2 candidatos, nem quando 2 movimentos disputam o mesmo alvo).
- **Smoke:** a tela renderiza uma linha pendente com a ação de conciliar e o botão "Conciliar
  automáticos" (mock das actions).

## 7. Migrations
`0065_baixa_conciliado.sql` — `baixa.conciliado_em date`. Sem novas tabelas.
