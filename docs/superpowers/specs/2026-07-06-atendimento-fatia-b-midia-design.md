# Atendimento — Fatia B (mídia: imagens / PDF / áudio) — Design

**Data:** 2026-07-06
**Marco:** Fatia B do Atendimento.
**Contexto:** O Atendimento (Fatia A + read receipts) está no ar. Hoje, mensagens com mídia caem no
marcador `"[mídia não suportada]"` (ver `extrairMensagemZapi` em `src/lib/whatsapp/inbox.ts`). Esta
fatia adiciona **receber** imagem/áudio/documento e **enviar** imagem/documento (anexo de arquivo).

## Objetivo

Cliente manda foto/PDF/áudio → aparece renderizado na thread; atendente anexa uma imagem ou PDF e
envia pelo composer. Gravar áudio pelo microfone fica **fora** desta fatia.

## Escopo

- **Receber:** `image`, `audio`, `document`. Demais tipos (`video`, `sticker`, `contact`, `location`)
  continuam como marcador de texto.
- **Enviar:** `image` e `document` (anexo de arquivo do disco). Sem gravação de áudio.
- **Limites:** receber ≤ 20 MB; enviar ≤ 10 MB.

## Arquitetura

Cinco peças:
1. **Colunas de mídia** em `whatsapp_mensagem` (a mensagem é texto **ou** mídia com legenda opcional).
2. **Parser** (`extrairMensagemZapi`) passa a devolver um objeto `midia` para mídia suportada.
3. **Webhook** baixa a mídia do Z-API e guarda no storage (`documentos`), gravando as colunas.
4. **Rota de servir** a mídia, autenticada.
5. **Envio** via server action (upload + Z-API em base64) + UI (anexo no composer, render por tipo).

## Dados

### Migration `0043_midia_atendimento.sql`

```sql
alter table whatsapp_mensagem add column if not exists midia_tipo text;   -- 'image' | 'audio' | 'document'
alter table whatsapp_mensagem add column if not exists midia_path text;   -- caminho no bucket 'documentos'
alter table whatsapp_mensagem add column if not exists midia_nome text;   -- nome do arquivo (document)
alter table whatsapp_mensagem add column if not exists midia_mime text;   -- content-type
```

Nuláveis (mensagens de texto ficam com tudo `null`). `texto` continua `not null` e guarda a **legenda**
(pode ser `""`). Sem enum novo (evita o gotcha do Postgres). Armazenamento no bucket **`documentos`**
(já existe), prefixo `atendimento/`.

## Helpers puros — `src/lib/whatsapp/inbox.ts` (TDD)

### Tipo e parser

```ts
export type MidiaRecebida = { tipo: "image" | "audio" | "document"; url: string; mime: string; nome: string | null; caption: string };

// extrairMensagemZapi passa a devolver `midia` (null para texto/mídia não suportada).
export function extrairMensagemZapi(
  payload: unknown,
): { telefone: string; texto: string; zId: string; midia: MidiaRecebida | null } | null;
```

Regras (defensivo — Z-API não-oficial):
- Texto (como hoje) → `{ ..., midia: null }`.
- `payload.image` presente → `midia.tipo = "image"`, `url` de `image.imageUrl ?? image.url`, `mime` de
  `image.mimeType ?? "image/jpeg"`, `nome = null`, `caption` de `image.caption ?? ""`; `texto` = caption.
- `payload.audio` → `tipo "audio"`, `url` de `audio.audioUrl ?? audio.url`, `mime` de `audio.mimeType ??
  "audio/ogg"`, `nome = null`, `caption ""`; `texto = ""`.
- `payload.document` → `tipo "document"`, `url` de `document.documentUrl ?? document.url`, `mime` de
  `document.mimeType ?? "application/octet-stream"`, `nome` de `document.fileName ?? document.title ??
  "arquivo"`, `caption` de `document.caption ?? ""`; `texto` = caption.
- Se o objeto de mídia existe mas **sem url válida** → trata como não suportada (marcador
  `"[mídia não suportada]"`, `midia: null`).
- Outros tipos de mídia (`video`/`sticker`/`contact`/`location`) → marcador `"[mídia não suportada]"`,
  `midia: null` (como hoje).
- Ordem: texto direto tem prioridade; depois image → audio → document; depois marcador.

### Extensão por mime

```ts
// "image/png" → "png"; "application/pdf" → "pdf"; "audio/ogg; codecs=opus" → "ogg". Fallback "bin".
export function extensaoPorMime(mime: string): string;
```

Regra: pega o subtipo (depois de `/`), corta parâmetros (`;...`), saneia para `[a-z0-9]`. Normaliza
`jpeg→jpg` e `svg+xml→svg`. Sem subtipo válido → fallback `bin`. (Ex.: `application/pdf`→`pdf`,
`image/png`→`png`, `audio/ogg; codecs=opus`→`ogg`.)

## Envio — `src/lib/whatsapp/zapi.ts` (funções puras + envio)

```ts
export type MidiaEnvio = { tipo: "image" | "document"; base64: string; mime: string; nome: string; caption: string };

// Monta a requisição de envio de mídia (puro, testável). image → /send-image; document → /send-document/{ext}.
export function montarEnvioMidia(cfg: ZapiConfig, telefone: string, midia: MidiaEnvio): {
  url: string; headers: Record<string, string>; body: string;
};

// Envia mídia (base64 data URI). Mesma estrutura/timeout de enviarTexto; retorna { ok, erro?, resposta? }.
export async function enviarMidiaZapi(cfg: ZapiConfig, telefone: string, midia: MidiaEnvio): Promise<{ ok: boolean; erro?: string; resposta?: unknown }>;
```

`montarEnvioMidia`:
- `image`: `url = {BASE}/instances/{i}/token/{t}/send-image`, body `{ phone, image: "data:{mime};base64,{b64}", caption }`.
- `document`: `url = {BASE}/.../send-document/{ext}` (ext = `extensaoPorMime(mime)`), body `{ phone,
  document: "data:{mime};base64,{b64}", fileName: nome, caption }`.
- headers iguais a `montarEnvio` (`Content-Type` + `Client-Token`).

## Baixar+guardar a mídia recebida — `src/lib/whatsapp/midia-storage.ts` (novo, server)

```ts
// Baixa a URL da mídia (com Client-Token se for host do Z-API) e sobe no bucket 'documentos'.
// Retorna o path salvo ou null em falha. Best-effort.
export async function baixarEStorearMidia(
  admin: <AdminSupabase>, url: string, mime: string, clientToken: string | null,
): Promise<string | null>;
```

- `path = atendimento/in/{crypto.randomUUID()}.{extensaoPorMime(mime)}`.
- `fetch(url)` com timeout; se `!ok` e `clientToken` e o host contém `z-api`/`zapi` → retry com header
  `Client-Token`. Cap 20 MB (aborta/descarta acima).
- `admin.storage.from("documentos").upload(path, buffer, { contentType: mime, upsert: false })`.
- Qualquer falha → retorna `null` (o webhook grava a mensagem com marcador e sem path).

## Webhook — `src/app/api/webhooks/zapi/[secret]/route.ts`

Após `extrairMensagemZapi` retornar uma mensagem:
- Se `msg.midia`:
  - carrega o `client_token` do `whatsapp_config` (decifrar, como em `responder`) — best-effort (`null` se indisponível).
  - `const path = await baixarEStorearMidia(admin, msg.midia.url, msg.midia.mime, clientToken)`.
  - insert IN com `texto: msg.midia.caption`, `midia_tipo/midia_mime/midia_nome` e `midia_path: path`.
    Se `path === null`, grava `texto: "[" + tipo + (nome? ": "+nome : "") + "]"` e `midia_path: null`
    (mensagem não some; só sem o arquivo).
  - Instrumentação: `console.log("zapi midia payload:", ...)` só quando `path === null` **e** havia
    mídia (captura o formato real p/ calibrar). Remover depois de validado — mantido como safety net.
- Senão: fluxo de texto atual.

O dedup por `z_message_id` e a resolução de cliente continuam iguais.

## Servir a mídia — `src/app/api/atendimento/midia/[id]/route.ts` (novo)

`GET`:
- `createServerSupabase()` (sessão). Gate: `getPerfilAtual` + `podeAtender` → 401 se não.
- `select midia_path, midia_mime, midia_nome from whatsapp_mensagem where id = {id}` **pelo cliente da
  sessão** (RLS garante que só retorna se o usuário vê a mensagem). Sem linha → 404.
- Sem `midia_path` → 404.
- Baixa do storage via **admin** (`download(midia_path)`), responde com `Content-Type: midia_mime` e,
  para documento, `Content-Disposition: inline; filename="{midia_nome}"`. Cache curto.
- URL estável (`/api/atendimento/midia/{id}`) → não pisca no polling.

## Envio — `src/app/(app)/atendimento/actions.ts`

```ts
export async function enviarMidia(formData: FormData): Promise<{ ok?: boolean; erro?: string }>;
```

- Campos: `telefone` (string), `arquivo` (File), `legenda` (string, opcional).
- Gate `podeAtender`. Valida: arquivo presente; tamanho ≤ 10 MB. Tipo permitido no envio:
  `image/*` → tipo `image`; `application/pdf` e documentos office comuns (`application/*`, `text/*`) →
  tipo `document`. `video/*` e `audio/*` anexos → erro `"Tipo não suportado no envio."`.
- Lê o arquivo em base64. Carrega config Z-API (como `responder`). `enviarMidiaZapi(...)`.
- Guarda uma cópia no storage: `atendimento/out/{uuid}.{ext}` (para a thread renderizar do nosso
  domínio, não depender do Z-API). 
- Insert OUT: `texto: legenda`, `midia_tipo`, `midia_path`, `midia_nome`, `midia_mime`,
  `status: ok?"ENVIADO":"ERRO"`, `z_message_id` (messageId da resposta, como texto).
- `mapMsgs` passa a mapear os 4 campos de mídia; os selects de `listarConversas`/`abrirConversa`
  incluem `midia_tipo, midia_path, midia_nome, midia_mime`.

`MsgConversa` ganha: `midiaTipo: string | null; midiaPath: string | null; midiaNome: string | null; midiaMime: string | null`.

## UI — `src/app/(app)/atendimento/Inbox.tsx`

No balão, quando `m.midiaTipo && m.midiaPath` (a src é sempre `/api/atendimento/midia/{id}` — precisa do
`id` da mensagem; **`MsgConversa` ganha também `id: string`** e os selects/`mapMsgs` incluem `id`):
- `image` → `<img src=... />` (miniatura, `max-h-64`, clique abre em nova aba).
- `audio` → `<audio controls src=... />`.
- `document` → chip com ícone + `midiaNome` + link `download` para a rota.
- Abaixo, a legenda (`m.texto`) se houver.
Quando não há mídia → texto normal (como hoje).

Composer ganha um **botão de anexo** (ícone de clipe) → `<input type="file" hidden>`; ao escolher,
mostra o nome + campo de legenda + "Enviar"; dispara `enviarMidia(formData)`; em sucesso, recarrega a
thread. Erros inline.

## Tratamento de erros
- Download da mídia recebida falha → mensagem com marcador, sem arquivo (não perde a mensagem).
- Envio: arquivo grande/tipo inválido → erro inline, não envia. Falha do Z-API → mensagem OUT `ERRO`.
- Rota de servir: sem permissão → 401; mensagem/arquivo inexistente → 404.

## Testes
- **Unit (Vitest):** `extrairMensagemZapi` com image/audio/document (campos e fallbacks) + mídia sem url
  → marcador; `extensaoPorMime` (png/jpg/pdf/ogg/fallback); `montarEnvioMidia` (image e document/{ext},
  data URI e fileName).
- **Migration:** aplicar; verificar as 4 colunas em `whatsapp_mensagem`.
- **Smoke:** `Inbox` renderiza sem lançar (mídia é carregada via `abrirConversa` assíncrono, então o
  render de balão de mídia é coberto pelos unit tests dos helpers; o visual valida-se no deploy).
- Ajustar os testes de `extrairMensagemZapi` existentes que usam `toEqual` para incluir `midia: null`.

## Migrations
Uma migration nova: `0043_midia_atendimento.sql` (4 `add column if not exists`). Sem enum/`ALTER TYPE`.
Aplicada por `npm run db:migrate`.

## Risco declarado
O formato do payload de mídia do Z-API e o esquema de URL (pública temporária × exige `Client-Token`)
são não-oficiais. Trato defensivamente (vários nomes de campo; retry com Client-Token; fallback com
marcador) e deixo o log do primeiro payload de mídia real para calibrar se necessário.
