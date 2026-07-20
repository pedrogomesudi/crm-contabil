# Aprovação de pagamento com alçada — Design

**O que é:** exigir **aprovação** de uma despesa (título a pagar) quando o valor passa de uma **alçada**
(valor-limite configurável). Acima da alçada, o título fica **pendente de aprovação** e não pode ser pago até
que um **admin diferente de quem lançou** (segregação de funções) aprove. Fecha o item "Aprovação de pagamento
com alçada" do Financeiro. **Uma fatia; tem migration.**

## O estado de hoje (medido)

- `titulo` (`0028`): `id, cliente_id, contrato_id, tipo, descricao, valor numeric(15,2), competencia, vencimento,
  categoria_id, centro_custo_id, status titulo_status ('ABERTO'…), criado_em, criado_por uuid → usuarios`. A
  coluna **`criado_por` já existe** (permite a segregação).
- Contas a pagar (`src/app/(app)/financeiro/contas-a-pagar/actions.ts`): `lancarDespesa(fd)` cria os títulos
  `tipo='PAGAR'`; `registrarPagamento(fd)` faz a baixa; `listarTitulosPagar(competencia)` lista. **Sem** qualquer
  aprovação/alçada hoje.
- `escritorio_config` é o config singleton (`id=1`), usado para marca, retenção etc. (admin).
- `/configuracoes/pagamento` (admin) já existe — hoje edita `dados_bancarios`; é o lar natural da alçada.
- Permissões: `podeGerenciarFinanceiro(papel)` (admin/financeiro).

## Escopo (decidido no brainstorm)

- **Alçada global** (`escritorio_config.alcada_pagamento`), `null` = sem alçada.
- **Aprovação = admin, com segregação** (não o próprio lançador).
- Só **PAGAR**; aprovação simples (pendente/aprovado), sem faixas nem níveis.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Alçada | valor global em `escritorio_config` | Simples; um limite para o escritório. |
| Estado | `titulo.aprovacao` ∈ {null, 'pendente', 'aprovado'} | null = não requer; cobre os três casos. |
| Aprovador | admin **≠** `criado_por` | Segregação de funções (controle interno). |
| Momento | avaliado no **lançamento** (valor vs alçada) | Previsível; alçada nova não reavalia o passado. |
| Bloqueio | a **baixa** (`registrarPagamento`) recusa se pendente | O ponto onde o dinheiro sai. |

## Arquitetura

### Modelo de dados (migration 0115)

```sql
alter table titulo add column if not exists aprovacao text check (aprovacao in ('pendente','aprovado'));
alter table titulo add column if not exists aprovado_por uuid references usuarios(id);
alter table titulo add column if not exists aprovado_em timestamptz;
alter table escritorio_config add column if not exists alcada_pagamento numeric(15,2);  -- null = sem alçada
```

- `aprovacao`: `null` (abaixo da alçada, não requer), `'pendente'` (aguarda), `'aprovado'` (liberado).
- Colunas herdam a RLS de `titulo`/`escritorio_config`.

### Lógica pura (`src/lib/financeiro/aprovacao.ts`)

```ts
// Requer aprovação quando há alçada e o valor a ultrapassa.
export function requerAprovacao(valor: number, alcada: number | null): boolean {
  return alcada != null && valor > alcada;
}
// Segregação: só admin aprova, e nunca a despesa que ele mesmo lançou.
export function podeAprovar(papel: string, perfilId: string, criadoPor: string | null): boolean {
  return papel === "admin" && perfilId !== criadoPor;
}
```

### Ações (`contas-a-pagar/actions.ts`)

- **`lancarDespesa`**: carrega `escritorio_config.alcada_pagamento`; ao inserir cada título PAGAR, define
  `aprovacao = requerAprovacao(valor, alcada) ? 'pendente' : null` e garante `criado_por = <usuário atual>`.
- **`registrarPagamento`**: antes de baixar, carrega o título; se `aprovacao === 'pendente'`, devolve
  `{ erro: "Este pagamento aguarda aprovação." }` (não baixa).
- **`aprovarTitulo(id)`** (nova; gate `podeGerenciarFinanceiro` + a checagem fina): carrega o título
  (`aprovacao`, `criado_por`); se `aprovacao !== 'pendente'` → nada a fazer; se `!podeAprovar(papel, perfilId,
  criado_por)` → `{ erro: "Aprovação exige um admin diferente de quem lançou." }`; senão grava
  `aprovacao='aprovado'`, `aprovado_por=perfilId`, `aprovado_em=now()`; `revalidatePath`.
- `listarTitulosPagar` passa a trazer `aprovacao` e `criado_por` (para a UI decidir o selo/botão).

### Config (`/configuracoes/pagamento`)

A tela de pagamento (admin) ganha o campo **"Alçada de aprovação (R$)"**, que lê/grava
`escritorio_config.alcada_pagamento` (vazio = sem alçada). A action de salvar amplia o update para incluir o
campo (ou uma action dedicada `salvarAlcada`).

### Tela (contas a pagar)

- Cada título com `aprovacao='pendente'` mostra um selo **"pendente de aprovação"**; `'aprovado'` mostra
  **"aprovado"** (discreto).
- Para **admin que não é o `criado_por`**, um botão **"Aprovar"** (chama `aprovarTitulo`).
- Enquanto `aprovacao='pendente'`, o **"Registrar pagamento"** fica desabilitado/oculto, com a dica "aguarda
  aprovação".

## Fatia de implementação

Uma fatia: migration 0115 + `requerAprovacao`/`podeAprovar` (com testes) + as três ações (lançar marca
pendente, baixa bloqueia, `aprovarTitulo`) + o campo de alçada na config + o selo/botão na lista + release.

## Verificação

- **Lógica testável:** `requerAprovacao` (sem alçada / abaixo / acima) e `podeAprovar` (não-admin recusa; admin
  lançador recusa; admin diferente aprova).
- **Fluxo:** lançar acima da alçada → `pendente`; baixa recusada em `pendente`; `aprovarTitulo` recusa o
  próprio lançador e libera para outro admin; após aprovado, a baixa funciona.
- **Config:** salvar a alçada em `escritorio_config`; vazio = sem alçada (nenhum título vira pendente).
- **Não-regressão:** despesas abaixo da alçada e as antigas (`aprovacao=null`) seguem pagáveis; guard
  `divida-ui`; `lint`/`typecheck`/`test`/`format:check`/`build`; migration idempotente e **aplicada em produção
  antes do deploy**.

## Fora de escopo

| O quê | Por quê |
|---|---|
| Faixas/níveis de alçada (aprovador por valor) | Um limite único basta agora. |
| Aprovação de títulos a RECEBER | O controle é sobre o que se paga. |
| Notificação ativa ao aprovador (e-mail/badge) | O selo na lista basta nesta fatia. |
| Alçada por categoria/centro de custo | Global; refina depois se preciso. |
| Reavaliar títulos já lançados quando a alçada muda | Avaliado no lançamento; previsível. |

## Riscos

| Risco | Mitigação |
|---|---|
| Segregação depende de `criado_por` preenchido | `lancarDespesa` garante `criado_por`; `podeAprovar` trata `null` como "não é o lançador" (mas o admin ainda precisa ser admin). |
| Despesa fica presa sem outro admin para aprovar | Requisito de segregação; se o escritório tem um só admin, a alçada deve ficar alta/nula (documentar). |
| Alçada alterada não reavalia pendências | Avaliada no lançamento; comportamento previsível e simples. |
| Título já `'aprovado'` reaberto/estornado | Fora de escopo; o estorno atual não mexe em `aprovacao` (segue aprovado). |
