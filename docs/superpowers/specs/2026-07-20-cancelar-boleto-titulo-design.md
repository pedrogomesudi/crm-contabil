# Cancelar boleto e cancelar título — Design

**Data:** 2026-07-20
**Módulo:** Financeiro (Contas a Receber)

## Contexto

Não há hoje como cancelar um boleto nem um título. Isso deixa "fantasmas" no a receber — por exemplo o
boleto/título #34, gerado em duplicidade (o #35 foi pago; o #34 ficou em aberto). Os enums já preveem o
estado: `boleto_status='cancelado'`, `titulo_status='CANCELADO'`.

Esta entrega adiciona duas ações complementares: **cancelar boleto** (mantém o título, para reemitir) e
**cancelar título** (cancela a cobrança inteira, incluindo o boleto ativo no Inter).

## Decisões

1. **Duas ações:** cancelar boleto (mantém o título "Em aberto") e cancelar título (título → CANCELADO +
   cancela o boleto ativo no Inter). Botões separados.
2. **Cancelamento lógico** (status), não exclusão física — preserva histórico/auditoria.
3. **Motivo obrigatório** nas duas (mesmo padrão do estorno, via `prompt`, que serve de confirmação).
4. **Só Inter** (`POST /cobranca/v3/cobrancas/{cod}/cancelamento` com `{ motivoCancelamento }`); Asaas fora.
5. **Guardas:** boleto cancelável só se `emitido`; título cancelável só se `ABERTO`/`VENCIDO` e **sem baixa**
   (protege pagos/baixados como o #35). Se o cancelamento no Inter falhar, **não** cancela o título.
6. **Endpoint confirmado ao vivo** com o #34; ajusto se o path/corpo divergir.

## Arquitetura

### Adaptador — `src/lib/boleto/tipos.ts` e `inter.ts`

`ProvedorBoleto` ganha:
```ts
cancelar?(provedorBoletoId: string, motivo: string): Promise<void>;
```
Inter: `POST /cobrancas/{cod}/cancelamento` com corpo `{ motivoCancelamento: motivo }` (via `req`; lança em não-2xx).

### Guardas puras — `src/lib/boleto/cancelamento.ts`

```ts
export function podeCancelarBoleto(status: string): boolean;   // status === "emitido"
export function podeCancelarTitulo(status: string, somaBaixado: number): boolean; // ABERTO|VENCIDO && somaBaixado <= 0
```

### Core compartilhado — `src/lib/boleto/cancelar-exec.ts` (server)

```ts
// Cancela o boleto no Inter (se emitido) e marca status='cancelado'. Idempotente:
// não age em boleto já pago/cancelado. Lança se o cancelamento no Inter falhar.
export async function cancelarBoletoNoInter(admin, boleto: { id; provedor; provedor_boleto_id; status }, motivo): Promise<void>;
```
Usa `adaptadorAtivo()` (já lê a config via admin) e chama `adaptador.cancelar` quando `provedor === 'inter'`.

### Ações — `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts`

- `cancelarBoleto(boletoId, motivo)`: gate `podeGerenciarFinanceiro`; motivo não vazio; carrega o boleto;
  `podeCancelarBoleto(status)` senão erro; `cancelarBoletoNoInter(...)` (via admin); `revalidatePath`.
  O título **não** muda.
- `cancelarTitulo(tituloId, motivo)`: gate; motivo não vazio; carrega o título (status + soma de baixas);
  `podeCancelarTitulo(...)` senão erro; se houver boleto **ativo** (`emitido`) do título, `cancelarBoletoNoInter(...)`
  (se falhar, aborta e devolve o erro — não cancela o título); depois `update titulo set status='CANCELADO'`;
  `revalidatePath`. (O trigger `recalcular_status_titulo` só dispara em mudança de baixa, não conflita.)

### UI — Contas a Receber

- **Cancelar boleto:** botão no `BoletoTitulo.tsx`, visível quando o boleto está `emitido`. `prompt` de motivo
  → `cancelarBoleto` → recarrega.
- **Cancelar título:** botão/ação na linha do título em `ContasReceber.tsx`, visível quando o título está
  ABERTO/VENCIDO e sem baixa. `prompt` de motivo → `cancelarTitulo` → recarrega. Um título CANCELADO some
  ou aparece com o status "Cancelado".

## Testes

- `src/tests/boleto/cancelamento.test.ts` — `podeCancelarBoleto` (emitido sim; pago/cancelado não);
  `podeCancelarTitulo` (ABERTO/VENCIDO sem baixa sim; BAIXADO/parcial/CANCELADO não; com baixa não).
- Render: `BoletoTitulo` mostra "Cancelar boleto" quando `emitido`; some quando `pago`.
- A chamada real ao Inter (cancelamento) valida no clique em produção.

## Fatiamento

Fatia única: adaptador `cancelar` + guardas puras + core `cancelarBoletoNoInter` + ações + botões.

## Constraints do projeto (herdadas)

- Gate = `podeGerenciarFinanceiro`; storage/segredos server-only.
- Guard `divida-ui`: sem `border` estático em input; sem `←`/`amber-\d`.
- `package.json.version` sobe com o CHANGELOG no mesmo PR; `versao.test.ts` exige que batam. Sem migration.

## Fora de escopo

- Cancelamento no Asaas.
- Exclusão física (o cancelamento é lógico, via status).
- Cancelar título já baixado/pago (protegido pelas guardas).
