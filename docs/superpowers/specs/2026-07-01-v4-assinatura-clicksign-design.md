# V4 — Assinaturas digitais integradas (Clicksign)

> **Status:** design aprovado para implementação · **Data:** 2026-07-01 · **Marco:** V4 do [ROADMAP](../../../ROADMAP.md)

## 1. Contexto e objetivo

A V3 gera o contrato de prestação de serviços contábeis em PDF e o salva nos Documentos do cliente.
A V4 fecha o ciclo: envia esse PDF para **assinatura digital** via **Clicksign**, acompanha o status
em tempo real e traz o **documento assinado** de volta para os Documentos do cliente — sem sair do
CRM.

Plataforma escolhida: **Clicksign** (plano de teste já contratado). Validade jurídica: a Clicksign
oferece assinatura eletrônica avançada (Lei 14.063/2020 + MP 2.200-2/2001, com trilha de auditoria)
e ICP-Brasil; a eletrônica avançada é válida e executável para este contrato (a própria minuta, item
11.7, a aceita).

## 2. Escopo

**Dentro da V4:**

- **Enviar um contrato já gerado** (PDF nos Documentos) para assinatura na Clicksign.
- Signatários: **CONTRATANTE** (cliente, pré-preenchido do cadastro) + **CONTRATADA** (representante
  do escritório, informado no envio) + **opcionalmente 2 testemunhas** (toggle por envio).
- **Webhook** que atualiza o status (por signatário e do envelope) em tempo real.
- Ao finalizar, **baixar o PDF assinado** da Clicksign e salvá-lo nos Documentos do cliente.
- **UI de status** na ficha do cliente (quem assinou, pendências, link do assinado).
- **Sandbox primeiro**, produção depois (só troca de token/URL).

**Fora da V4 (consciente):**

- **Gerar+enviar num passo** — a V4 envia um contrato já gerado (decisão do brainstorming).
- **ICP-Brasil obrigatório / assinatura presencial** — usa-se a eletrônica avançada padrão.
- **Templates de e-mail/marca personalizados na Clicksign** — usa-se o padrão; personalização
  por escritório entra na V7 (whitelabel).
- **Config fixa de signatários do escritório** — informa-se a cada envio (decisão do brainstorming).

## 3. Decisões tomadas no brainstorming

- Provedor: **Clicksign** (plano de teste contratado).
- Signatários: 4 (escritório + cliente + 2 testemunhas), com as **testemunhas opcionais por envio**;
  representante do escritório e testemunhas **informados a cada envio** (sem config fixa).
- Gatilho: **enviar um contrato já gerado** (não gerar+enviar).
- Status: **webhook** (tempo real) — recomendado sobre polling.

## 4. Integração Clicksign (API v3, JSON:API)

- **Auth:** `access_token` no header `Authorization`. Formato **JSON:API**.
- **URLs:** sandbox `https://sandbox.clicksign.com/api/v3` · produção `https://app.clicksign.com/api/v3`
  (definidas por `CLICKSIGN_URL`).
- **Fluxo do envelope:** criar envelope (rascunho) → anexar documento (o PDF) → adicionar signatários
  → criar **requisitos** por signatário (qualificação = papel que assina; autenticação = método,
  ex.: e-mail) → **ativar** (status `draft` → `running`) → a Clicksign notifica os signatários.
- **Webhooks:** POST para uma URL cadastrada, a cada evento (`sign`, `refusal`, `close`/finalização),
  assinados via HMAC (segredo configurável). O documento assinado é baixado após a finalização.

## 5. Modelo de dados

**`0018_assinaturas.sql`** (idempotente):

- **`assinaturas`**: `id` uuid pk; `cliente_id` uuid fk; `documento_id` uuid fk (o contrato enviado);
  `clicksign_envelope_id` text; `status` text (`enviado` · `parcial` · `finalizado` · `recusado` ·
  `cancelado`); `documento_assinado_id` uuid fk null (PDF assinado); `criado_por` uuid fk;
  `criado_em` timestamptz; `finalizado_em` timestamptz null.
- **`assinatura_signatarios`**: `id` uuid pk; `assinatura_id` uuid fk on delete cascade; `nome` text;
  `email` text; `papel` text (`contratada` · `contratante` · `testemunha`); `clicksign_key` text;
  `status` text (`pendente` · `assinado` · `recusado`); `assinado_em` timestamptz null.
- **RLS:** enviar/ler assinatura segue a regra de **documentos** (admin/assistente/contador-dono via
  `podeGerenciarDocumentos` + visibilidade do cliente). O webhook grava via `service_role`
  (createAdminSupabase), fora de sessão — protegido por **HMAC**. Trigger de autoria em
  `assinaturas.criado_por` (não-forjável), espelhando o padrão do projeto.

## 6. Arquitetura

```
Documento (PDF) ─► enviarAssinatura() ─► Clicksign (envelope) ─► e-mails aos signatários
                        │                        │
                    assinaturas +           webhook (HMAC) ─► atualiza status ─► baixa assinado ─► Documentos
                    signatarios
```

- **`src/lib/assinatura/clicksign.ts`** — cliente isolado da API v3. Funções: `criarEnvelope`,
  `anexarPdf`, `adicionarSignatario` (+ requisitos), `ativarEnvelope`, `baixarAssinado`, e a de alto
  nível **`enviarParaAssinatura({ pdf, nome, signatarios }): Promise<{ envelopeId, signatarios }>`**.
  Config por env: `CLICKSIGN_URL`, `CLICKSIGN_TOKEN`.
- **`src/lib/assinatura/webhook.ts`** — `verificarHmac(corpo, header, secret)` e `mapearEvento(payload)`
  (evento Clicksign → atualização de status). Puro e testável. Usa `CLICKSIGN_HMAC_SECRET` (env).
- **`src/app/(app)/clientes/[id]/assinatura.ts`** — server action `enviarAssinatura` (gate
  `podeGerenciarDocumentos`; monta signatários; chama o cliente; grava as tabelas).
- **`src/app/api/webhooks/clicksign/route.ts`** — route handler POST (público): verifica HMAC,
  atualiza status, baixa o assinado e salva nos Documentos. Idempotente.
- **`src/components/assinatura/*`** — botão/dialog de envio (form dos signatários + toggle
  testemunhas) e o indicador de status.

## 7. Fluxo de envio (detalhe)

1. Na aba Documentos, no contrato gerado, botão **"Enviar para assinatura"** → form:
   CONTRATANTE (pré-preenchido, editável) · CONTRATADA representante (nome+e-mail) · toggle
   testemunhas → Testemunha 1/2 (nome+e-mail).
2. `enviarAssinatura(documentoId, formData)`: baixa o PDF do Storage; monta signatários; chama
   `enviarParaAssinatura`; grava `assinaturas` (`enviado`) + `assinatura_signatarios`; `revalidatePath`.
3. Validação: cliente sem e-mail → bloqueia com aviso; e-mails dos signatários obrigatórios.

## 8. Webhook (detalhe)

1. `verificarHmac` — rejeita (401) se inválido.
2. Localiza a `assinatura` por `clicksign_envelope_id`; `mapearEvento` define a atualização:
   - `sign` → marca o signatário como `assinado`; o envelope passa a `parcial` (≥1 assinou, ainda não
     finalizado).
   - `refusal` → signatário `recusado`; envelope `recusado`.
   - `close`/finalização → **baixa o PDF assinado**, salva nos Documentos (service_role), vincula
     `documento_assinado_id`, `status = finalizado`, `finalizado_em = now()`.
3. **Idempotência:** se o evento já foi aplicado (ex.: signatário já `assinado`, ou assinado já
   salvo), não reprocessa.

## 9. Tratamento de erros e casos de borda

- **Erro na Clicksign** (rede/4xx no envio): a action falha limpa com mensagem clara; nada é gravado
  como `enviado` sem envelope válido (grava só após a ativação bem-sucedida).
- **Cliente sem e-mail** (ou signatário sem e-mail): bloqueia o envio.
- **Webhook sem HMAC/ inválido:** 401, não processa.
- **Evento desconhecido:** ignora e loga.
- **Falha ao baixar o assinado:** loga; marca `finalizado` mas registra alerta (arquivo pendente),
  permitindo reprocessar.
- **Sandbox × produção:** `CLICKSIGN_URL`/`CLICKSIGN_TOKEN`/`CLICKSIGN_HMAC_SECRET` por ambiente;
  documenta-se o cadastro do webhook na Clicksign.

## 10. Testes (TDD)

- **`clicksign.ts` (unitário):** `fetch` mockado — sequência de envelope, montagem de signatários,
  erro de API.
- **`webhook.ts` (unitário):** `verificarHmac` (aceita válido / rejeita inválido) e `mapearEvento`
  (sign/refusal/close → status) com payloads mockados; idempotência.
- **Action de envio (unitário/integração):** clicksign mockado — signatários corretos com/sem
  testemunhas; bloqueio sem e-mail.
- **Route do webhook:** teste do handler com HMAC válido/ inválido.
- **E2E (sandbox):** enviar um contrato real → assinar no sandbox → webhook atualiza status → PDF
  assinado salvo nos Documentos.

## 11. Segurança e LGPD

- Segredos (`CLICKSIGN_TOKEN`, `CLICKSIGN_HMAC_SECRET`) só no servidor (runtime, nunca `NEXT_PUBLIC_`).
- Webhook autenticado por **HMAC** (rejeita forjados).
- O contrato tem dados pessoais; a Clicksign é o operador de tratamento para a assinatura — coerente
  com a linha da V8 (registrar a base legal / contrato com operador na adequação futura).

## 12. Evoluções futuras (fora da V4)

- Reenvio/lembrete e cancelamento de envelope pela UI.
- Config de signatários padrão do escritório (reduz digitação) — possivelmente junto da V7.
- Personalização de marca/e-mails na Clicksign por escritório (V7 whitelabel).
- Assinatura da NFS-e / outros documentos além do contrato.

## 13. Decisões em aberto / riscos

- **Shape exato das requisições JSON:API** (envelope/documento/signatário/requisito) e do payload de
  webhook: confirmar na referência da Clicksign durante o plano (endpoints v3). Risco baixo — API
  documentada e com sandbox.
- **Teste local do webhook:** exige URL pública (túnel) ou testar no app publicado; o sandbox não
  tem validade jurídica, ideal para desenvolvimento.
- **Método de autenticação do signatário:** padrão por e-mail na V4; outros métodos (SMS, selfie)
  podem ser adicionados depois.
