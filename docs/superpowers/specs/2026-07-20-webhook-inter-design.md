# Cadastrar webhook de cobrança no Banco Inter — Design

**Data:** 2026-07-20
**Módulo:** Financeiro (Configurações → Boletos)

## Contexto

A baixa automática de boleto está construída e configurada (rota `/api/webhooks/boleto/[secret]` cria a
baixa e o trigger fecha o título; conta de destino e `BOLETO_WEBHOOK_SECRET` prontos). Falta o **Inter
saber para onde enviar** as notificações de pagamento — o adaptador só *recebe* o webhook, nunca o
*registra*. Sem esse cadastro, o Inter não chama o SALDO quando um boleto é pago, e a baixa não dispara.

Esta entrega adiciona: (1) um botão para **cadastrar o webhook no Inter** e (2) um **status** que mostra,
server-side, se o webhook já está cadastrado e apontando para o SALDO.

## Decisões

1. **Registro por API do Inter** (`PUT /cobranca/v3/cobrancas/webhook` com `{ webhookUrl }`), reusando o
   mTLS+OAuth do adaptador. Endpoint/corpo exatos **confirmados no clique real** (integração viva); ajusto
   se o Inter usar outro path/formato.
2. **URL montada server-side** a partir de `APP_URL` + `BOLETO_WEBHOOK_SECRET`. O segredo nunca chega ao
   cliente nem à tela.
3. **Status é um veredito, não a URL.** A URL cadastrada contém o segredo — então o painel mostra
   `ausente` / `ok` (cadastrado e aponta para o SALDO) / `divergente` (aponta para outro lugar) /
   `indisponivel` (sem segredo/provedor ou erro), calculado comparando a URL do Inter com a esperada,
   **sem renderizar nenhuma das duas**.
4. **Só Inter.** Asaas configura o webhook no painel do Asaas — fora de escopo.

## Arquitetura

### Adaptador — `src/lib/boleto/tipos.ts` e `inter.ts`

Interface `ProvedorBoleto` ganha dois métodos opcionais:
```ts
export interface ProvedorBoleto {
  emitir(dados: DadosEmissao): Promise<BoletoEmitido>;
  interpretarWebhook(payload: unknown): EventoPagamento | null;
  pdf?(provedorBoletoId: string): Promise<string | null>;
  registrarWebhook?(url: string): Promise<void>;
  consultarWebhook?(): Promise<string | null>;
}
```
Inter:
- `registrarWebhook(url)`: `PUT /cobrancas/webhook` com `{ webhookUrl: url }` (via `req`; lança em não-2xx, como as outras chamadas).
- `consultarWebhook()`: `GET /cobrancas/webhook` → `extrairWebhookUrlInter(resp)`.

Função pura `extrairWebhookUrlInter(resp: Record<string, unknown>): string | null` — retorna
`resp.webhookUrl` quando string não vazia, senão `null`.

### Lógica pura do veredito — `src/lib/boleto/webhook.ts`

```ts
export type StatusWebhook = "ok" | "divergente" | "ausente";
export function urlWebhookEsperada(appUrl: string, secret: string): string; // `${base}/api/webhooks/boleto/${secret}`
export function verdictWebhook(registrada: string | null, esperada: string): StatusWebhook;
// ausente: registrada null/vazia; ok: registrada === esperada; divergente: registrada != esperada.
```

### Ações — `src/app/(app)/configuracoes/boletos/actions.ts`

- `cadastrarWebhookInter(): Promise<{ ok?: true; erro?: string }>` — gate admin (papel === "admin",
  como o resto da tela de config); lê `APP_URL` + `BOLETO_WEBHOOK_SECRET` (erro claro se faltar);
  `adaptadorAtivo()`; se provedor ≠ inter ou sem `registrarWebhook` → erro; monta a URL com
  `urlWebhookEsperada`, chama `registrarWebhook(url)`; `revalidatePath`. Try/catch devolve o erro do Inter.
- `statusWebhookInter(): Promise<StatusWebhook | "indisponivel">` — gate; sem segredo/provedor inter/erro
  → `"indisponivel"`; senão `consultarWebhook()` + `verdictWebhook(registrada, esperada)`.

### UI — `PainelProntidao` / tela Boletos

A page `configuracoes/boletos/page.tsx` chama `statusWebhookInter()` (server) e passa o veredito ao
painel. O painel mostra:
- Linha de status: ✅ "Webhook cadastrado no Inter" (`ok`) / ⚠️ "Um webhook diferente está cadastrado"
  (`divergente`) / ❌ "Webhook não cadastrado no Inter" (`ausente`) / "—" (`indisponivel`).
- Botão **"Cadastrar webhook no Inter"** (componente cliente) que chama `cadastrarWebhookInter`, mostra
  sucesso/erro e dá refresh. Habilitado quando provedor inter + segredo definido.

## Testes

- `src/tests/boleto/webhook.test.ts` — `urlWebhookEsperada` (monta a URL, trim de barra final),
  `verdictWebhook` (ok / divergente / ausente), `extrairWebhookUrlInter` (string / vazio / ausente).
- Render do painel: mostra a linha de status conforme o veredito; botão presente quando aplicável.
- O `PUT`/`GET` reais ao Inter não rodam em teste local — validados no clique em produção.

## Fatiamento

Fatia única (feature curta): adaptador (`registrarWebhook`/`consultarWebhook`/`extrairWebhookUrlInter`) +
lógica pura do veredito + ações + status e botão na tela.

## Constraints do projeto (herdadas)

- Tela de config Boletos é admin; segredos server-only; **nunca renderizar o segredo nem a URL do webhook**.
- Imports `@/*`. Guard `divida-ui`: sem `border` estático em input; sem `←`/`amber-\d`.
- `package.json.version` sobe com o CHANGELOG no mesmo PR; `versao.test.ts` exige que batam. Sem migration.

## Fora de escopo

- Remover/desativar webhook (DELETE) e consultar histórico de disparos.
- Cadastro de webhook para Asaas (configura-se no painel do Asaas).
- Reenvio/reprocessamento de eventos perdidos.
