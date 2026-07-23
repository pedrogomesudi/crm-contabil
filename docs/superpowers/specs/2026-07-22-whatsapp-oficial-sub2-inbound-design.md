# WhatsApp oficial — Sub-projeto 2: inbound (webhook Cloud API) (design)

## Objetivo

Receber mensagens e status de entrega da **API oficial (WhatsApp Cloud API)** via webhook, alimentando
o mesmo atendimento/histórico que o Z-API já alimenta. Sem isto, um escritório na oficial enviaria mas
não receberia respostas. É o Sub-projeto 2 do "WhatsApp oficial como opção por escritório".

## Contexto (do que existe)

- **Webhook Z-API** em `src/app/api/webhooks/zapi/[secret]/route.ts`: autentica pelo segredo na URL;
  parseia com `extrairMensagemZapi`/`extrairStatusZapi` (`src/lib/whatsapp/inbox.ts`); resolve cliente
  por telefone (casa se houver **exatamente um**); insere em `whatsapp_mensagem` (`direcao='IN'`, dedup
  por `z_message_id`); baixa mídia com `baixarEStorearMidia`; reabre a `conversa` finalizada.
- **Tipos/parsers** em `inbox.ts`: `MidiaRecebida = { tipo:"image"|"audio"|"document"; url; mime; nome;
  caption }`; `extrairStatusZapi` → `{ status:"ENVIADO"|"ENTREGUE"|"LIDO"; ids }`.
- **Config** `whatsapp_config` já tem (do Sub-projeto 1): `provedor`, `oficial_phone_number_id`,
  `oficial_token_cifrado`. Cifragem via `cifrarDominio/decifrarDominio("whatsapp", …)`.
- **Storage de mídia:** `baixarEStorearMidia(admin, url, mime, clientToken)` baixa de uma URL e guarda em
  `documentos/atendimento/in/…`.

## API oficial (Cloud API) — o que muda no inbound

- **Verificação (GET):** ao cadastrar o webhook, a Meta chama
  `GET ?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=<n>`. Responder o `challenge` (texto,
  200) se o `verify_token` bater; senão 403.
- **Assinatura (POST):** header `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256 do **corpo cru** com o
  **app secret**. Validar timing-safe; corpo sem assinatura válida → 401. (Ler o corpo como texto antes
  de `JSON.parse`, pois o HMAC é sobre os bytes exatos.)
- **Payload:** `{ object, entry:[{ changes:[{ value:{ messaging_product, metadata, contacts:[{ wa_id,
  profile }], messages:[{ from, id, timestamp, type, text:{ body } | image:{ id, mime_type, caption } |
  document:{ id, mime_type, filename, caption } | … }], statuses:[{ id, status:"sent"|"delivered"|"read",
  recipient_id }] } }] }] }`.
- **Mídia:** vem como **media id**, não URL. Fluxo: `GET https://graph.facebook.com/v21.0/{media_id}`
  (Bearer) → `{ url }` → `GET {url}` (Bearer) → bytes.

## Decisões (do brainstorm)

- **Duplicar a lógica de persistência** no webhook oficial (não refatorar o webhook Z-API, que está em
  produção). Tradeoff aceito: duas cópias a manter em sincronia.
- **Path fixo** `/api/webhooks/whatsapp-oficial` (a assinatura é a autenticação real; o verify_token
  cobre o handshake).
- **verify_token em texto**, **app_secret cifrado** (o app_secret é o segredo forte da assinatura).
- **Duas fatias:** 2A (verificação + assinatura + texto/status) · 2B (mídia inbound).
- **Multi-tenant:** cada escritório tem sua URL de webhook + seu verify_token/app_secret (config por tenant).

## Fatia 2A — verificação + assinatura + texto/status

### Migration `0131_whatsapp_oficial_inbound.sql`

```sql
alter table whatsapp_config add column if not exists oficial_app_secret_cifrado text;
alter table whatsapp_config add column if not exists oficial_verify_token text;
```

### Libs puras — `src/lib/whatsapp/inbox-oficial.ts`

- `assinaturaOficialOk(rawBody: string, header: string | null, appSecret: string): boolean` —
  computa `sha256=` + HMAC(rawBody, appSecret) e compara timing-safe com o header. `false` se header
  ausente/malformado.
- `extrairMensagemOficial(payload): { telefone: string; texto: string; wamId: string; midia:
  MidiaOficialRecebida | null } | null` — extrai a **primeira** mensagem de `entry[0].changes[0].value.
  messages[0]`. `telefone = from`; `wamId = id`; texto de `text.body`; mídia (Fatia 2B) de
  `image`/`document`/`audio` como `{ id, mime, nome, caption, tipo }`. Na 2A, mensagens de mídia
  retornam `midia:null` + texto marcador `"[mídia]"` (persistidas como texto até a 2B).
- `extrairStatusOficial(payload): { status: StatusEntrega; ids: string[] } | null` — de
  `value.statuses[]`, mapeando `sent→ENVIADO`, `delivered→ENTREGUE`, `read→LIDO`; agrupa por status.
- `MidiaOficialRecebida = { tipo:"image"|"audio"|"document"; id; mime; nome; caption }` (id em vez de url).

### Rota `src/app/api/webhooks/whatsapp-oficial/route.ts`

- **`GET`:** lê `hub.mode`/`hub.verify_token`/`hub.challenge` da query; carrega
  `oficial_verify_token` (admin); se `mode==="subscribe"` e o token bate, responde o `challenge`
  (texto puro, 200); senão 403.
- **`POST`:** `const raw = await req.text();` → carrega `oficial_app_secret_cifrado` (decifra) →
  `assinaturaOficialOk(raw, req.headers.get("x-hub-signature-256"), appSecret)`; falha → 401. Parseia
  `JSON.parse(raw)`; se `extrairStatusOficial` → avança OUT (mesma regra do Z-API: só avança, nunca
  rebaixa; `.in("z_message_id", ids).eq("direcao","OUT")`); se `extrairMensagemOficial` → **duplica** a
  persistência do webhook Z-API (casar cliente por telefone via `chaveTelefone`, canonicalizar com
  `chaveDeNumeroCompleto`, inserir `direcao='IN'`, dedup por `z_message_id = wamId`, reabrir conversa).
  Sempre responde 200 rápido (a Meta re-tenta em não-2xx).
- **Runtime nodejs**, `dynamic = "force-dynamic"`.

### Config UI (aba oficial)

- Campos **App Secret** (password, cifrado ao salvar) + **Verify Token** (texto) + exibir a **URL do
  webhook** (`<site>/api/webhooks/whatsapp-oficial`) e uma nota para cadastrar no App da Meta com esse
  verify_token. `salvarConfigWhatsapp` (provedor oficial) passa a gravar os dois campos (secret vazio =
  mantém). `carregarConfigWhatsapp` devolve `oficialAppSecretConfigurado`/`oficialVerifyToken`.

## Fatia 2B — mídia inbound

- `extrairMensagemOficial` passa a devolver `midia: MidiaOficialRecebida` para image/document/audio.
- Helper `baixarMidiaOficial(mediaId, token): Promise<{ bytes: Buffer; mime: string } | null>` —
  `GET /{media_id}` (Bearer) → `{ url, mime_type }` → `GET url` (Bearer) → bytes.
- O webhook, ao receber mídia: baixa via `baixarMidiaOficial` (token oficial decifrado), guarda no
  storage (reusar o mesmo destino `atendimento/in/…` do Z-API) e insere com `midia_tipo/midia_path/
  midia_nome/midia_mime` — igual ao Z-API.

## Testes

- **Puros:** `assinaturaOficialOk` (assinatura válida/ inválida/ausente); `extrairMensagemOficial`
  (texto; sem mensagem → null; mídia → id na 2B); `extrairStatusOficial` (sent/delivered/read →
  mapeados; sem statuses → null).
- **Render:** campos App Secret/Verify Token + URL do webhook na aba oficial.
- **Fluxo real** (Meta chamando): smoke com um número de teste, fora de produção.

## Fora de escopo

- **Templates/HSM** (Sub-projeto 3) — sem eles, proativos na oficial fora das 24h não funcionam; um
  escritório só liga a oficial de verdade após o Sub-projeto 3.
- Refatorar o webhook Z-API (mantido intacto).

## Sequência de entrega

| Fatia | Entrega | Migration |
|---|---|---|
| 2A | verificação (GET) + assinatura (POST) + parsing + texto/status + UI | sim (`0131`) |
| 2B | mídia inbound (media id → URL → download) | — |

Cada fatia é uma release; esta spec é a fonte comum e cada fatia ganha seu plano na hora de executar.
O Sub-projeto 3 (templates) terá brainstorm/spec próprios.
