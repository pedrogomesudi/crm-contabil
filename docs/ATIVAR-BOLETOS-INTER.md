# Ativar boletos — Banco Inter

O fluxo de boleto já está implementado. Ativar = configurar credenciais + webhook. **O Inter opera
apenas em produção pelo app** (não há sandbox): o teste é com um boleto de valor baixo, real.

## 1. Criar a aplicação no Inter Empresas

- Internet Banking PJ → **APIs / Integrações** → nova aplicação com escopo **Cobrança (boleto-cobrança)
  leitura + escrita**.
- Guarde: **client_id**, **client_secret**, o **certificado** (`.crt`) e a **chave privada** (`.key`) do
  mTLS, e o número da **conta corrente**.

## 2. Preencher Configurações → Boletos (você digita)

- Provedor: **Banco Inter**.
- Cole client_id, client_secret, conta corrente e o conteúdo dos PEM (certificado e chave).
- Selecione a **conta bancária de destino** da baixa (sem ela o webhook marca "pago" mas não gera baixa).

## 3. Definir o segredo do webhook

- Gere: `openssl rand -hex 32`.
- EasyPanel → app `cursoia/crm-contabil` → variável **BOLETO_WEBHOOK_SECRET** = o valor → Implantar.

## 4. Cadastrar o webhook no Inter

- No Inter, aponte as notificações de cobrança para:
  `https://app.seusaldo.ai/api/webhooks/boleto/<BOLETO_WEBHOOK_SECRET>`
  (o painel de prontidão na tela mostra o template).

## 5. Testar (produção, valor baixo)

- Financeiro → Contas a Receber → num título de ~R$ 5, **Emitir boleto**.
- Confirme linha digitável/PIX na tela e no **portal** do cliente.
- Pague (ou marque como recebido no Inter) e confirme que o **título baixa sozinho** via webhook.

## Prontidão

A tela Configurações → Boletos tem um **painel de prontidão** que mostra o que ainda falta
(provedor, credenciais, conta destino, webhook secret) e a URL do webhook.
