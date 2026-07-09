# Boletos — Fatia 4b: baixa por webhook + envio — Design

**Data:** 2026-07-08
**Marco:** dar **baixa automática** no título quando o cliente paga o boleto (via webhook do provedor) e
**incluir a linha digitável + PIX** do boleto na cobrança por WhatsApp. Fecha o módulo de boletos.

**Contexto:** existe `boleto` (com `provedor_boleto_id`, `status`), `boleto_config` (com `provedor` e
`conta_bancaria_id`), `baixa` (+ trigger `trg_status_titulo` que marca o título BAIXADO ao inserir),
`forma_pagamento` enum (inclui `BOLETO`). Os adaptadores expõem `interpretarWebhookAsaas`/
`interpretarWebhookInter` (funções puras). Padrão de webhook: `/api/webhooks/zapi/[secret]/route.ts`
(valida `secret` vs env com `timingSafeEqual`, usa `createAdminSupabase`). `cobrarViaWhatsapp(tituloId)`
monta o texto com `aplicarTemplate` e envia via `enviarTexto`.

## Escopo (4b)

- Rota de webhook do boleto → baixa automática.
- Helper puro `dadosBaixaBoleto`.
- `cobrarViaWhatsapp` inclui a linha digitável/PIX do boleto ativo.

**Fecha o módulo.** Fora: relatórios de boletos, cancelamento pela UI (podem vir depois).

## Helper puro — `src/lib/boleto/baixa.ts` (TDD)

```ts
import type { EventoPagamento } from "./tipos";
export function dadosBaixaBoleto(evento: EventoPagamento, valorBoleto: number, hoje: string): { dataRecebimento: string; valorRecebido: number };
```
- `dataRecebimento` = `evento.pagoEm.slice(0,10)` se houver (aceita data ou ISO datetime); senão `hoje`.
- `valorRecebido` = `evento.valorPago ?? valorBoleto`.

## Webhook — `src/app/api/webhooks/boleto/[secret]/route.ts`

- `POST(req, ctx)` com `ctx.params.secret`. `segredoOk(secret)` = `timingSafeEqual` vs
  **`BOLETO_WEBHOOK_SECRET`**; inválido → 401.
- `admin = createAdminSupabase()` (sem sessão; RLS bypass). Lê `boleto_config` (`provedor`,
  `conta_bancaria_id`); se `nenhum` → `{ ok: true, motivo: "sem provedor" }`.
- Escolhe a função pura: `provedor === "asaas" ? interpretarWebhookAsaas : interpretarWebhookInter`
  (não decifra credenciais — só interpreta).
- Lê o corpo JSON; normaliza para lista (**Inter** manda array; **Asaas** objeto único).
- Para cada evento: `evento = interpretar(ev)`; se `!evento?.pago` → pula.
  - Acha o `boleto` por `provedor_boleto_id = evento.provedorBoletoId`. Se não existir, ou status já
    `pago`/`cancelado` → pula (**idempotente**, tolera retries).
  - Se `conta_bancaria_id` não configurada → pula (não baixa; nada quebra).
  - `d = dadosBaixaBoleto(evento, Number(boleto.valor), hojeSP)`. Insere em `baixa`
    (`titulo_id`, `data_recebimento = d.dataRecebimento`, `valor_recebido = d.valorRecebido`,
    `conta_bancaria_id`, `forma_pagamento = "BOLETO"`) → o trigger marca o título **BAIXADO**.
  - Atualiza `boleto.status = "pago"`.
- Retorna `{ ok: true, baixados: N }` (sempre 200 para o provedor não reenviar em loop; erros por evento
  são pulados).

**Segurança:** só o `secret` na URL autoriza; cliente admin restrito à rota; não expõe credenciais.

## Envio — `src/app/(app)/financeiro/contas-a-receber/whatsapp.ts`

Em `cobrarViaWhatsapp`, após montar `texto`, buscar o boleto ativo do título
(`status ∉ {cancelado,erro}`, mais recente) e, se houver, **anexar** ao texto:
- `Linha digitável: <linha_digitavel>` (se houver);
- `PIX copia-e-cola:\n<pix_copia_cola>` (se houver).
Enviar o texto final. Sem boleto, comportamento atual inalterado.

## Tratamento de erros
- Secret inválido → 401.
- Sem provedor / sem conta de recebimento / boleto não encontrado / já pago → pula, retorna 200.
- Corpo inválido → 200 (ignora).

## Novo segredo
`BOLETO_WEBHOOK_SECRET` — definir no EasyPanel e cadastrar a URL
`https://app.seusaldo.ai/api/webhooks/boleto/<BOLETO_WEBHOOK_SECRET>` no painel do provedor (Asaas: webhook
de cobrança; Inter: webhook de cobrança v3). Gerado quando ligarmos a conta.

## Testes
- **Unit (Vitest):** `dadosBaixaBoleto` (com `pagoEm` datetime → só a data; sem `pagoEm` → hoje;
  `valorPago` nulo → valor do boleto).
- Rota/envio: `npm run typecheck`/`npm run build` (compila) + os `interpretarWebhook*` já testados nas
  Fatias 2–3.

## Migrations
Nenhuma.
