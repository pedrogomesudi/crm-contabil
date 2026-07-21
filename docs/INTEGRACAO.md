# Guia de integração (API + webhooks)

A API pública do SALDO permite ler e escrever dados e receber eventos por webhook. Serve para
automações no Make, n8n, Zapier ou um sistema próprio.

## 1. Autenticação

Gere uma chave em **Configurações → API pública** (escolha os escopos). Envie em toda requisição:

```
Authorization: Bearer sk_sua_chave
```

Teste com `GET /api/v1/ping` (devolve os escopos da chave) e veja os endpoints em
`GET /api/v1/openapi.json` (importável no Make/Insomnia/Postman) ou em `/docs`.

## 2. Ler e escrever

- Listagens paginam por `limit` (máx 200) e `offset`, no envelope `{ dados: [...], paginacao }`.
- Escrita: `POST /clientes`, `POST /titulos`, `POST /titulos/{id}/baixa`,
  `PATCH /obrigacoes/{id}`, `POST /documentos` (multipart). Erros vêm como
  `{ erro: { codigo, mensagem } }`.
- O `PATCH /clientes/{id}` exige `atualizado_em` (controle de concorrência).

## 3. Webhooks de saída

Cadastre uma URL **https pública** em **Configurações → Webhooks de saída** e escolha os eventos
(veja `GET /api/v1/eventos`): `cliente.criado`, `cliente.atualizado`, `titulo.criado`,
`titulo.pago`, `obrigacao.entregue`, `documento.enviado`.

Cada entrega é um `POST` com corpo:

```json
{ "id": "<uuid da entrega>", "evento": "titulo.pago", "criado_em": "2026-07-21T10:00:00Z", "dados": {} }
```

e headers `X-Webhook-Id`, `X-Webhook-Timestamp`, `X-Webhook-Tentativa` e `X-Assinatura`.

### Verificar a assinatura (HMAC-SHA256)

Compare `X-Assinatura` (`sha256=<hex>`) com o HMAC do **corpo cru** usando o segredo do endpoint:

```js
import { createHmac } from "node:crypto";
const esperado = "sha256=" + createHmac("sha256", SEGREDO).update(corpoCru).digest("hex");
if (esperado !== req.headers["x-assinatura"]) rejeitar();
```

### Deduplicar

Use o `X-Webhook-Id` (= `id` do corpo): reentregas por retry repetem o mesmo id. Ignore ids já
processados.

Use o botão **Enviar teste** na tela de webhooks para validar sua URL e a verificação da assinatura.
