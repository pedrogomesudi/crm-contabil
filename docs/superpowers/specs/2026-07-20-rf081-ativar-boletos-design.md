# RF-081 — Ativar boletos (Banco Inter) — Design

**Data:** 2026-07-20
**Módulo:** Financeiro
**RF:** RF-081 — Ativar boletos

## Contexto

O fluxo de boletos está **inteiramente construído** (migrations 0058/0059; libs `src/lib/boleto/*`;
tela de emissão em Financeiro → Contas a Receber via `BoletoTitulo`; portal em `portal/boletos`;
webhook `/api/webhooks/boleto/[secret]` com baixa automática; anexo de linha digitável/PIX na cobrança
WhatsApp). Dois provedores implementados: **Banco Inter** (OAuth2 client_credentials + mTLS) e **Asaas**
(API key). Credenciais cifradas (AES-256-GCM, `BOLETO_CRIPTO_KEY`).

"Ativar boletos" é, portanto, **operacional + configuração**, não um fluxo novo. O usuário tem conta no
**Banco Inter**. Esta entrega: (1) fecha as pequenas lacunas que impedem uma ativação segura e
auto-explicável; (2) documenta o passo a passo; (3) endurece o único ponto frágil que a revisão do
adaptador encontrou.

## Achados da revisão do adaptador `inter.ts`

- **Sólido no geral:** OAuth2 + mTLS corretos, escopo `boleto-cobranca.read/write`, header
  `x-conta-corrente` presente. A rota de webhook já trata payload em **array** (`Array.isArray(body) ? body : [body]`)
  e é idempotente (`if bol.status === 'pago' continue`). Nenhum bug grave.
- **A (constraint):** `adaptadorAtivo()` passa `"producao"` **fixo** ao criar o adaptador Inter — não há
  coluna `inter_ambiente`. **O Inter só opera em produção.** Consequência de design: o teste de ativação
  é obrigatoriamente em produção com boleto de valor baixo. (Sem mudança de código — corrige o runbook.)
- **B (corrigir):** `emitir()` faz `POST /cobrancas` e imediatamente `GET /cobrancas/{cod}`. A API do
  Inter processa de forma assíncrona; nesse GET imediato `linhaDigitavel`/`pixCopiaECola` podem vir
  **nulos**, e o boleto seria gravado "vazio" (sem linha digitável/PIX). Correção: um **retry curto** no
  GET quando os campos essenciais vierem nulos.
- **C (nota, sem ação):** `valorPago` da baixa usa `valorNominal` do webhook (igual ao nominal para
  boleto quitado; juros/desconto fugiriam — aceitável no MVP); token OAuth refeito a cada emissão
  (adaptador recriado por request — ineficiência, não erro); `Agent` mTLS criado por adaptador.

## Escopo

**Código:**
1. Documentar `BOLETO_WEBHOOK_SECRET` no `.env.local.example`.
2. Painel de prontidão na tela Configurações → Boletos.
3. Retry na emissão do Inter (achado B).

**Documentação:**
4. Runbook de ativação do Inter (`docs/ATIVAR-BOLETOS-INTER.md`), corrigido para produção-only.

**Operacional (o usuário executa; fora de código):** criar aplicação no Inter Empresas com escopo
Cobrança, preencher credenciais na tela, definir `BOLETO_WEBHOOK_SECRET` no EasyPanel, cadastrar o
webhook no Inter, emitir um boleto de teste. Credenciais **nunca** são digitadas pelo assistente.

## Arquitetura

### 1. Documentar a env `BOLETO_WEBHOOK_SECRET`

`.env.local.example` ganha a chave (hoje ausente) com comentário e o formato da URL do webhook:

```
# Segredo do webhook de baixa de boleto. O provedor (Inter/Asaas) chama
# https://<APP_URL>/api/webhooks/boleto/<BOLETO_WEBHOOK_SECRET>. Gere com: openssl rand -hex 32
BOLETO_WEBHOOK_SECRET=
```

### 2. Painel de prontidão (Configurações → Boletos)

Nova função pura `prontidaoBoleto(view, webhookSecretDefinido)` em `src/lib/boleto/config.ts` que
devolve uma lista de itens `{ rotulo, ok }` cobrindo:
- Provedor selecionado (≠ `nenhum`).
- Credenciais completas do provedor ativo (reusa a lógica de `statusConfigBoleto`).
- Conta bancária de **destino da baixa** definida (`contaBancariaId != null`) — sem ela o webhook marca
  "pago" mas **não** gera a baixa.
- `BOLETO_WEBHOOK_SECRET` presente no ambiente (checado server-side na page e passado como boolean).

Componente `PainelProntidao` (server component) renderiza a lista com ✅/❌ e, quando o provedor está
selecionado, mostra a **URL do webhook como template** — `…/api/webhooks/boleto/<BOLETO_WEBHOOK_SECRET>` —
**sem renderizar o segredo** (mantém o princípio da tela de nunca exibir valores sensíveis). A page
`configuracoes/boletos/page.tsx` passa `webhookSecretDefinido = Boolean(process.env.BOLETO_WEBHOOK_SECRET)`
e `appUrl = process.env.APP_URL`.

### 3. Retry na emissão do Inter

Em `src/lib/boleto/inter.ts`, `emitir()`: após o `GET /cobrancas/{cod}`, se `linhaDigitavel` **e**
`pixCopiaECola` vierem ambos nulos, aguardar ~1500ms e refazer o GET **uma vez**. Se ainda vierem nulos,
retorna o que tiver (não falha a emissão — o boleto existe no Inter; os campos podem ser buscados depois).
A espera é extraída para um parâmetro injetável (`esperar = (ms) => Promise`) para o teste não dormir de
verdade. A decisão "precisa refazer?" vira função pura testável `precisaReconsultarInter(boleto)`.

### 4. Runbook `docs/ATIVAR-BOLETOS-INTER.md`

Passo a passo: criar aplicação no Inter Empresas (escopo Cobrança leitura+escrita) → obter
client_id/secret + baixar cert/key PEM + anotar conta corrente → preencher Configurações → Boletos
(provedor Inter + credenciais + conta de destino) → definir `BOLETO_WEBHOOK_SECRET` no EasyPanel e
implantar → cadastrar o webhook no Inter → emitir boleto de teste de valor baixo **em produção** (não há
sandbox para Inter) → confirmar exibição no portal e baixa automática. Deixa explícito que as credenciais
são digitadas pelo usuário.

## Testes

- `src/tests/boleto/prontidao.test.ts` — `prontidaoBoleto`: todos ok; falta conta destino; falta webhook
  secret; provedor `nenhum`; credenciais Inter incompletas.
- `src/tests/boleto/prontidao-render.test.tsx` — `PainelProntidao` renderiza ❌ para o que falta e mostra
  a URL do webhook **como template** (sem o valor do segredo).
- `src/tests/boleto/inter-retry.test.ts` — `precisaReconsultarInter` (true quando linha e PIX nulos; false
  quando qualquer um presente); e `emitir()` com um `req` fake que devolve nulo na 1ª consulta e preenchido
  na 2ª, com `esperar` fake, confirmando que houve reconsulta e o retorno veio preenchido.

## Constraints do projeto (herdadas)

- Next 16 App Router; imports `@/*`; segredos server-only; `next/image`.
- Papel via `auth_papel()`; tela de config é admin/financeiro (`podeGerenciarFinanceiro`).
- Assistente **nunca** digita credenciais/API keys — o usuário preenche na tela/painel do provedor.
- `package.json.version` sobe com o CHANGELOG no mesmo PR (`versao.test.ts`).
- Guard `divida-ui`: sem `border` estático em input escrito à mão; sem `←`/`amber-\d`.

## Fora de escopo

- Suporte a sandbox do Inter (exigiria coluna `inter_ambiente` + UI); a ativação vai direto a produção.
- Ajuste do `valorPago` para valor efetivamente recebido (juros/desconto) — nota C, MVP mantém `valorNominal`.
- Reuso de token OAuth entre requests / pool de `Agent` mTLS — otimizações, não corretude.
