# RF-083 — Automação (Make/n8n/Zapier): maturidade de integração (design)

## Objetivo

Fechar as lacunas de integração para consumidores externos, sobre a base já entregue pelo
RF-080 (API REST com API key Bearer + escopos, webhooks de saída assinados por HMAC + outbox,
OpenAPI + `/docs`). São melhorias de maturidade, não de arquitetura.

## Contexto (o que o RF-080 já cobre)

- API `/api/v1` com **API Key Bearer + escopos** — compatível nativamente com Zapier ("API Key"),
  Make e n8n (Header Auth / HTTP genérico).
- `GET /api/v1/ping` como "test connection" (devolve os escopos).
- Webhooks de saída assinados por HMAC (`X-Assinatura`), com outbox (`webhook_entrega`), retry +
  backoff, cron a cada 5 min.
- OpenAPI gerado (`/api/v1/openapi.json`) + página `/docs`.

## Decisões (do brainstorm)

Escopo v1 = as quatro melhorias versionáveis no repo. Publicar apps de marca nos portais
Zapier/Make/n8n fica **fora do repo** (contas de developer + aprovação).

## Arquitetura por bloco

### A. Deduplicação — envelope + headers (sem migration)

`webhook_entrega.id` e `criado_em` já existem; só não são propagados.

- O corpo enviado passa a ser o envelope `{ id, evento, criado_em, dados }`, onde `id` é o
  `webhook_entrega.id` e `dados` é o recurso serializado (o que hoje vai em `payload.dados`).
- Headers novos no `POST`: `X-Webhook-Id` (= id da entrega), `X-Webhook-Timestamp` (= `criado_em`
  ISO), `X-Webhook-Tentativa` (= tentativa atual). `X-Assinatura` continua, mas agora sobre o
  **corpo final** (envelope).
- No retry, o **mesmo `id`** é reenviado (dedup pelo consumidor); `X-Webhook-Tentativa` incrementa.
- Mudança concentrada em `src/lib/webhooks/drenar.ts` (compõe o envelope e os headers a partir da
  linha da outbox). `emitir.ts` segue armazenando `{ evento, dados }` — o `id`/`criado_em` vêm da
  própria linha no momento do envio.

### B. Evento de teste + log de entregas (UI de webhooks)

- **Helper compartilhado** `enviarWebhook(url, secret, envelope): Promise<{ ok: boolean; status?: number; erro?: string }>`
  em `src/lib/webhooks/enviar.ts` — extrai o `fetch` + `comTimeout` + assinatura + headers hoje
  embutidos no `drenar`. `drenar` e o teste passam a usá-lo.
- **Enviar teste** — `enviarTeste(endpointId)` (action, gate admin): monta um envelope
  `webhook.teste` (`dados: { mensagem: "Evento de teste do SALDO" }`), faz o `POST` **imediato**
  (não passa pela outbox) e devolve `{ ok, status, erro }` para feedback na hora. Botão por
  endpoint no `GestaoWebhooks.tsx`.
- **Log de entregas** — `listarEntregas(endpointId?)` (action, gate admin) lê `webhook_entrega`
  (id, evento, status, tentativas, proximo_retry, criado_em, url do endpoint) das últimas ~100,
  numa tabela. **Reenvio manual** `reenviarEntrega(id)` → `status='pendente'`, `proximo_retry=agora`
  (o cron reentrega no próximo ciclo).

### C. Endpoint de eventos + guia

- `GET /api/v1/eventos` — rota autenticada (sem escopo específico, molde do `/ping`) que devolve
  `{ eventos: EVENTOS_WEBHOOK }`. Entra no OpenAPI (bloco D).
- **Guia** `docs/INTEGRACAO.md` (padrão dos guias `docs/ATIVAR-BOLETOS-INTER.md`): autenticar com
  `Authorization: Bearer`, importar o `openapi.json` (Make), cadastrar webhook e escolher eventos,
  **verificar a assinatura** (exemplo de HMAC-SHA256 sobre o corpo cru comparado ao `X-Assinatura`),
  deduplicar pelo `X-Webhook-Id`. Uma **seção de webhooks** é adicionada à página `/docs`
  (lista de eventos + formato do envelope + verificação da assinatura).

### D. Enriquecer o OpenAPI

- `components.schemas` para os 5 recursos de resposta — `Cliente`, `Titulo`, `Boleto`, `Obrigacao`,
  `Documento` — modelados a partir dos serializadores (`src/lib/api/serializar.ts`), e um schema de
  **envelope de lista** `{ dados: [ ... ], paginacao: { limit, offset, total } }` e de **erro**
  `{ erro: { codigo, mensagem } }`.
- `content: { "application/json": { schema } }` nas respostas 200 (lista → array do recurso com
  paginação; item → recurso) e nos request bodies de escrita (derivados dos schemas zod de
  `api-escrita`/`clienteSchema`). Multipart segue como `type: object` com as propriedades nomeadas.
- `documentoOpenApi()` passa a montar isso a partir de um mapa recurso→schema, mantendo a lib pura
  e testável.

## Testes

- `enviarWebhook` — a parte pura (montagem de headers/assinatura) é testável; o `fetch` é o efeito.
- `drenar` — o envelope/headers compostos (verificar que `X-Webhook-Id` = id e a assinatura bate
  com o corpo final) via um teste do compositor puro extraído (`montarEnvelope(entrega)` +
  `cabecalhos(envelope, secret, tentativa)`).
- `documentoOpenApi` — os testes existentes seguem; acrescentar que há `components.schemas` e que as
  respostas 200 têm `content`.
- Rota `/api/v1/eventos` — coberta por build + fumaça.

## Fora de escopo (v1)

Publicação de apps nos portais (Zapier/Make/n8n) — trabalho externo; OAuth2 (a API Key basta);
assinatura por timestamp/replay-window além do dedup por id; reprocessamento em massa de entregas
`falhou` (o reenvio é individual).

## Sequência de entrega (2 ondas → 2 releases)

| Onda | Entrega | Migration |
|---|---|---|
| 1 | Dedup (envelope + headers) + evento de teste/log de entregas na UI + `GET /api/v1/eventos` | — |
| 2 | OpenAPI enriquecido (schemas) + guia de integração (`docs/` + seção no `/docs`) | — |

Cada onda é uma release; a spec é a fonte comum e cada onda ganha seu plano na hora de executar.
