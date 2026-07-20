# Conciliação: casamento parcial + tolerância — Design

**O que é:** permitir que **um título seja pago por vários movimentos bancários** (1 título ↔ N movimentos) —
cada movimento quita **parte** do saldo — e tornar a **tolerância de valor** (arredondamento/tarifas)
**configurável**. Fecha a parte "casamento parcial + tolerância" da conciliação. A **conferência de saldo
extrato × sistema** fica para uma fatia seguinte. **Uma fatia; tem migration.**

## O estado de hoje (medido)

- Conciliação 1:1 exata: `candidatosMovimento`/`autoCasar` (`src/lib/conciliacao/casar.ts`) casam um movimento a
  uma baixa/título só quando o valor **bate exatamente** (`igual = |x−y| < 0,005`, fixo).
- Vínculo: `movimento_bancario.baixa_id` (→ `baixa`), com `uq_movimento_baixa` (unique em `baixa_id`) — **1
  movimento ↔ 1 baixa**; um título pode ter **N baixas** (o índice não impede).
- `conciliarComTitulo(movimentoId, tituloId)` (`conciliar-actions.ts`) **já cria a baixa com
  `valor_recebido = |mov.valor|`**, mas tem um guard que **exige `saldo do título == |mov|`** (`>= 0,005 →
  erro`) e só aceita título em `ABERTO`/`VENCIDO`. `titulosAbertos` filtra `.eq("valor", |mov|)`.
- **Trigger `recalcular_status_titulo`** (`0029`) recalcula `titulo.status` a cada `insert/delete` de baixa:
  `ABERTO` (0 baixado), `BAIXADO` (baixado ≥ valor+acréscimo), **`BAIXADO_PARCIAL`** (parcial). **O status de
  pagamento parcial já é automático.**
- `escritorio_config` é o config singleton (`id=1`, admin).

## Escopo (decidido no brainstorm)

- **Casamento parcial** (1 título ↔ N movimentos) + **tolerância de valor configurável**.
- **Fora**: conferência de saldo extrato × sistema (próxima fatia).

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Status parcial | reusa o trigger (`BAIXADO_PARCIAL`) | Já calculado; a fatia não gere status. |
| Tolerância | `escritorio_config.tolerancia_conciliacao` (default 0,01) | Um valor global; arredondamento/tarifas. |
| Candidatos parciais | título com `saldo ≥ |mov| − tol` | Cabe exato ou parcial; overpayment fica fora. |
| Auto-casamento | **só exato** (não auto-aplica parcial) | Parcial é escolha do operador (ambíguo). |
| Config | campo na própria tela de conciliação (admin) | Contextual; sem tela nova. |

## Arquitetura

### Modelo de dados (migration 0116)

```sql
alter table escritorio_config add column if not exists tolerancia_conciliacao numeric(15,2) not null default 0.01;
```

### Lógica pura (`src/lib/conciliacao/casar.ts`)

- A comparação de valor passa a receber a **tolerância**: `casaValor(x, y, tol) = |x − y| <= tol` (substitui o
  `igual` fixo).
- `candidatosMovimento(mov, baixas, titulos, tol)`:
  - **baixas**: mantém o casamento exato (dentro da tolerância) — inalterado no sentido.
  - **títulos**: em vez de `saldo == |mov|`, oferece os do tipo-alvo com **`saldoTitulo(t) >= |mov| − tol`**;
    cada candidato ganha `parcial: boolean` (`saldoTitulo(t) > |mov| + tol`). Ordena **exatos primeiro**, depois
    parciais, por proximidade de data; limita a lista (ex.: 20).
- `autoCasar(movimentos, baixas, titulos, tol)`: **só exato** (o `parcial` nunca entra no automático).

### Ações (`conciliacao/conciliar-actions.ts`)

- Carrega `escritorio_config.tolerancia_conciliacao` (fallback 0,01) e passa `tol` às funções puras.
- **`titulosAbertos(supabase, tipo, valorAbs, tol)`**: em vez de `.eq("valor", valorAbs)`, carrega os títulos do
  tipo em `ABERTO`/`VENCIDO`/**`BAIXADO_PARCIAL`** (com as baixas), calcula o `baixado`/`saldo`, e devolve os que
  têm `saldo >= valorAbs − tol` (o `candidatosMovimento` faz o rank/flag). Limite razoável.
- **`conciliarComTitulo`**: aceita `tit.status ∈ {ABERTO, VENCIDO, BAIXADO_PARCIAL}`; o guard vira
  **`if (|mov| > saldo + tol) return erro("O valor supera o saldo do título.")`**; abaixo/igual, cria a baixa de
  `|mov|` (parcial). O trigger recalcula o status (`BAIXADO_PARCIAL` ou `BAIXADO`).

### Config (tela de conciliação)

Um campo **"Tolerância de valor (R$)"** no topo da conciliação (admin), `escritorio_config.tolerancia_conciliacao`
— action `salvarTolerancia(formData)` (admin), server-action form, com `revalidatePath`.

### UI (conciliação)

Na lista de candidatos de um movimento, o título com `parcial === true` aparece com o rótulo **"pagamento
parcial"** e o **saldo**. Ao conciliar, a baixa parcial entra e o título vira `BAIXADO_PARCIAL` — pronto para o
próximo movimento até zerar.

## Fatia de implementação

Uma fatia: migration 0116 + `casaValor`/`candidatosMovimento`/`autoCasar` com tolerância e parcial (com testes)
+ `titulosAbertos`/`conciliarComTitulo` (parcial + tolerância) + o campo de tolerância na tela + o rótulo
"parcial" na lista + release.

## Verificação

- **Lógica testável:** `candidatosMovimento` — casamento exato (dentro da tolerância); título com saldo maior
  vira candidato **parcial**; título com saldo menor que `|mov| − tol` é excluído; a ordem põe exatos antes de
  parciais. `autoCasar` — não aplica parcial. `casaValor` — respeita a tolerância.
- **Fluxo:** conciliar um movimento menor que o saldo cria a baixa parcial; o título fica `BAIXADO_PARCIAL`; um
  segundo movimento fecha o saldo → `BAIXADO`; um movimento acima do saldo (> saldo + tol) é recusado.
- **Não-regressão:** o casamento exato e o `autoCasar` seguem; `uq_movimento_baixa` intacto; guard `divida-ui`;
  `lint`/`typecheck`/`test`/`format:check`/`build`; migration idempotente e **aplicada em produção antes do
  deploy**.

## Fora de escopo

| O quê | Por quê |
|---|---|
| Conferência de saldo extrato × sistema | Próxima fatia da conciliação. |
| Vários títulos ↔ 1 movimento | O RF pede 1 título ↔ N movimentos. |
| Tolerância por conta/cliente | Global nesta fatia. |
| Gestão de status do título | O trigger já faz (`BAIXADO_PARCIAL`/`BAIXADO`). |

## Riscos

| Risco | Mitigação |
|---|---|
| Lista de candidatos poluída por muitos parciais | Exatos primeiro + limite (ex.: 20); ordenação por data. |
| Overpayment (movimento > saldo) | Guard `|mov| > saldo + tol` recusa. |
| Tolerância alta casar demais | É global e explícita (admin define); default conservador (0,01). |
| `uq_movimento_baixa` bloquear N baixas | Cada baixa ↔ 1 movimento; N baixas por título é permitido (o índice é sobre `baixa_id`). |
