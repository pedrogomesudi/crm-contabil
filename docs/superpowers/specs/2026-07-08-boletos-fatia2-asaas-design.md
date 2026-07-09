# Boletos — Fatia 2: adaptador Asaas — Design

**Data:** 2026-07-08
**Marco:** implementar o adaptador do provedor **Asaas** (contrato `ProvedorBoleto`) — emitir boleto
(híbrido boleto+PIX) e interpretar o webhook de pagamento. Construído/testado sem conta; o teste ao vivo
fica para quando houver credenciais.

**Contexto (Fatia 1):** existe o contrato `src/lib/boleto/tipos.ts` (`ProvedorBoleto`, `DadosEmissao`,
`BoletoEmitido`, `EventoPagamento`) e a config `boleto_config` (Asaas: `asaas_api_key_cifrada`,
`asaas_ambiente`). Ainda não há consumidor (UI/webhook são Fatia 4).

**API Asaas (v3), verificada na doc:**
- Auth: header **`access_token: <API_KEY>`**; headers também exigem `Content-Type` e `User-Agent`.
- Base: **produção** `https://api.asaas.com/v3` · **sandbox** `https://api-sandbox.asaas.com/v3`.
- `POST /customers` `{ name, cpfCnpj, email }` → `{ id }`.
- `POST /payments` `{ customer, billingType:"BOLETO", value, dueDate, description, externalReference }` →
  `{ id, bankSlipUrl, invoiceUrl, status }`.
- `GET /payments/{id}/identificationField` → `{ identificationField, nossoNumero, barCode }`.
- `GET /payments/{id}/pixQrCode` → `{ encodedImage, payload, expirationDate }`.
- Webhook: `POST` com `{ event, payment: { id, value, paymentDate, status } }`; `PAYMENT_RECEIVED` /
  `PAYMENT_CONFIRMED` indicam pago.

## Decisões

1. `billingType: "BOLETO"` (boleto Asaas já é híbrido com PIX; o `pixQrCode` traz o copia-e-cola).
2. Cria um cliente no Asaas **a cada emissão** (dedup/cache por cliente fica na Fatia 4).
3. Lógica pura separada da orquestração `fetch` para testar sem rede.

## Escopo (Fatia 2)

- Módulo `src/lib/boleto/asaas.ts` implementando `ProvedorBoleto`.
- Funções puras (montagem de request + parsing + webhook) testadas por unit.

**Fora:** wiring na UI, rota de webhook, emissão a partir do título, tabela `boleto` (Fatia 4); adaptador
Inter (Fatia 3).

## Módulo — `src/lib/boleto/asaas.ts`

### Funções puras (testáveis, sem rede)
```ts
export function baseUrlAsaas(ambiente: "sandbox" | "producao"): string;
export function headersAsaas(apiKey: string): Record<string, string>;
export function corpoClienteAsaas(dados: DadosEmissao): { name: string; cpfCnpj: string; email?: string };
export function corpoCobrancaAsaas(customerId: string, dados: DadosEmissao): { customer: string; billingType: "BOLETO"; value: number; dueDate: string; description: string; externalReference: string };
export function parsearCobrancaAsaas(pagamento: Record<string, unknown>, identif: Record<string, unknown> | null, pix: Record<string, unknown> | null): BoletoEmitido;
export function interpretarWebhookAsaas(payload: unknown): EventoPagamento | null;
```
- `baseUrlAsaas`: `producao` → `https://api.asaas.com/v3`; `sandbox` → `https://api-sandbox.asaas.com/v3`.
- `headersAsaas`: `{ access_token: apiKey, "Content-Type": "application/json", "User-Agent": "SALDO CRM" }`.
- `corpoClienteAsaas`: `name`=pagadorNome, `cpfCnpj`=pagadorDocumento; `email` só se não-nulo.
- `corpoCobrancaAsaas`: `customer`=customerId, `billingType`="BOLETO", `value`=valor, `dueDate`=vencimento,
  `description`=descricao, `externalReference`=seuNumero.
- `parsearCobrancaAsaas` → `BoletoEmitido`:
  - `provedorBoletoId` = `pagamento.id`;
  - `nossoNumero` = `identif?.nossoNumero ?? null`;
  - `linhaDigitavel` = `identif?.identificationField ?? null`;
  - `pixCopiaCola` = `pix?.payload ?? null`;
  - `urlPdf` = `pagamento.bankSlipUrl ?? pagamento.invoiceUrl ?? null`.
- `interpretarWebhookAsaas`: se `payload` é objeto com `event` string e `payment` objeto e `event ∈
  {PAYMENT_RECEIVED, PAYMENT_CONFIRMED}` → `{ provedorBoletoId: payment.id, pago: true, valorPago:
  payment.value ?? null, pagoEm: payment.paymentDate ?? null }`; senão `null`.

### Fábrica (orquestração com `fetch`)
```ts
export function criarAdaptadorAsaas(apiKey: string, ambiente: "sandbox" | "producao"): ProvedorBoleto;
```
- `emitir(dados)`: `POST /customers` → id; `POST /payments`; `GET /payments/{id}/identificationField`
  (best-effort, `null` em erro); `GET /payments/{id}/pixQrCode` (best-effort); retorna
  `parsearCobrancaAsaas(...)`.
- Erro HTTP (status ≥ 400) nas chamadas obrigatórias (customers/payments) → `throw` com a mensagem de erro
  do Asaas (`errors`); o consumidor (Fatia 4) captura.
- `interpretarWebhook` = `interpretarWebhookAsaas`.

## Tratamento de erros
- `POST /customers` ou `/payments` com erro → lança (a emissão falha; Fatia 4 mostra o erro).
- `identificationField`/`pixQrCode` com erro → seguem `null` (boleto emitido mesmo assim; os dados extras
  entram depois ou por reconsulta).

## Testes
- **Unit (Vitest):** `baseUrlAsaas`, `headersAsaas`, `corpoClienteAsaas` (com/sem email),
  `corpoCobrancaAsaas`, `parsearCobrancaAsaas` (com identif+pix e com ambos nulos),
  `interpretarWebhookAsaas` (PAYMENT_RECEIVED → pago; evento irrelevante → null; payload inválido → null).
- **Orquestração:** um teste de `criarAdaptadorAsaas().emitir(...)` com `fetch` mockado (customers →
  payments → identificationField → pixQrCode), conferindo o `BoletoEmitido` montado e a ordem das chamadas.

## Migrations
Nenhuma.
