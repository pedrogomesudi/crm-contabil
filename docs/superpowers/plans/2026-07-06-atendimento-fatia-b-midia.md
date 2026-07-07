# Atendimento — Fatia B (mídia) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receber imagem/áudio/documento do cliente (baixando e guardando no storage) e enviar imagem/PDF por anexo, renderizando cada tipo na thread do Atendimento.

**Architecture:** Colunas de mídia em `whatsapp_mensagem`; parser `extrairMensagemZapi` devolve `midia`; webhook baixa+guarda no bucket `documentos`; rota autenticada serve o arquivo; action `enviarMidia` sobe o anexo e manda via Z-API (base64). Spec: `docs/superpowers/specs/2026-07-06-atendimento-fatia-b-midia-design.md`.

**Tech Stack:** Next.js 16 (route handlers + Server Actions), TypeScript, Supabase (Postgres/Storage/RLS), Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Todos passam.
- Migration nova em `supabase/migrations/`, aplicada por `npm run db:migrate` (NUNCA `supabase db push`). Idempotente. Atinge produção.
- Sem `ALTER TYPE`/enum novo (colunas `text` nuláveis).
- Storage: bucket **`documentos`** (já existe), prefixo `atendimento/`. Acesso via `createAdminSupabase` (service_role bypassa RLS).
- Limites: receber ≤ 20 MB; enviar ≤ 10 MB.
- Imagens de mídia do usuário usam `<img>` com `eslint-disable-next-line @next/next/no-img-element` (next/image não serve mídia dinâmica de rota sem dimensões).
- Branch: `git checkout -b feat/atendimento-midia develop`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `supabase/migrations/0043_midia_atendimento.sql` — **novo**: 4 colunas de mídia.
- `src/lib/whatsapp/inbox.ts` — **modificar**: `MidiaRecebida`, `extrairMensagemZapi` (+`midia`), `extensaoPorMime`, `MsgConversa` (+`id`+campos de mídia).
- `src/lib/whatsapp/zapi.ts` — **modificar**: `MidiaEnvio`, `montarEnvioMidia`, `enviarMidiaZapi`.
- `src/lib/whatsapp/midia-storage.ts` — **novo**: `baixarEStorearMidia`.
- `src/tests/whatsapp/inbox.test.ts` — **modificar**: testes de parser de mídia + `extensaoPorMime` (+ ajustar literais).
- `src/tests/whatsapp/zapi.test.ts` — **modificar**: testes de `montarEnvioMidia`.
- `src/app/api/webhooks/zapi/[secret]/route.ts` — **modificar**: baixar+guardar mídia recebida.
- `src/app/api/atendimento/midia/[id]/route.ts` — **novo**: servir a mídia.
- `src/app/(app)/atendimento/actions.ts` — **modificar**: `mapMsgs`+selects (id+mídia), `enviarMidia`.
- `src/app/(app)/atendimento/Inbox.tsx` — **modificar**: render de mídia + anexo no composer.

---

## Task 1: Migration — colunas de mídia

**Files:**
- Create: `supabase/migrations/0043_midia_atendimento.sql`

- [ ] **Step 1: Criar a migration**

```sql
-- Fatia B (mídia): mensagem pode ser texto OU mídia (com legenda no texto).
alter table whatsapp_mensagem add column if not exists midia_tipo text;   -- 'image' | 'audio' | 'document'
alter table whatsapp_mensagem add column if not exists midia_path text;   -- caminho no bucket 'documentos'
alter table whatsapp_mensagem add column if not exists midia_nome text;   -- nome do arquivo (document)
alter table whatsapp_mensagem add column if not exists midia_mime text;   -- content-type
```

- [ ] **Step 2: Aplicar**

Run: `npm run db:migrate`
Expected: aplica `0043_midia_atendimento` sem erro.

- [ ] **Step 3: Verificar as colunas**

Run:
```bash
node --env-file=.env.local -e "import('./scripts/_db.mjs').then(async({makeClient})=>{const c=makeClient();await c.connect();const r=await c.query(\"select column_name from information_schema.columns where table_name='whatsapp_mensagem' and column_name like 'midia_%' order by column_name\");console.log(r.rows.map(x=>x.column_name));await c.end();});"
```
Expected: `[ 'midia_mime', 'midia_nome', 'midia_path', 'midia_tipo' ]`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0043_midia_atendimento.sql
git commit -m "feat(atendimento): colunas de mídia em whatsapp_mensagem

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `inbox.ts` — parser de mídia + `extensaoPorMime` + read model (TDD)

**Files:**
- Modify: `src/lib/whatsapp/inbox.ts`
- Modify: `src/app/(app)/atendimento/actions.ts` (mapMsgs + selects)
- Test: `src/tests/whatsapp/inbox.test.ts`

**Interfaces:**
- Produces:
  - `type MidiaRecebida = { tipo: "image"|"audio"|"document"; url: string; mime: string; nome: string|null; caption: string }`.
  - `extrairMensagemZapi(payload): { telefone: string; texto: string; zId: string; midia: MidiaRecebida|null } | null`.
  - `extensaoPorMime(mime: string): string`.
  - `MsgConversa` com `id: string` + `midiaTipo/midiaPath/midiaNome/midiaMime: string|null`.

- [ ] **Step 1: Escrever os testes que falham**

No topo de `src/tests/whatsapp/inbox.test.ts`, adicionar `extensaoPorMime` ao import. Adicionar ao final:

```ts
describe("extrairMensagemZapi mídia", () => {
  it("imagem → midia image com url/mime/caption", () => {
    const r = extrairMensagemZapi({
      phone: "553400",
      messageId: "M1",
      image: { imageUrl: "https://z-api.io/x.jpg", mimeType: "image/jpeg", caption: "olha" },
    });
    expect(r).toEqual({
      telefone: "553400",
      zId: "M1",
      texto: "olha",
      midia: { tipo: "image", url: "https://z-api.io/x.jpg", mime: "image/jpeg", nome: null, caption: "olha" },
    });
  });
  it("áudio → midia audio, texto vazio", () => {
    const r = extrairMensagemZapi({ phone: "553400", messageId: "M2", audio: { audioUrl: "https://z/a.ogg", mimeType: "audio/ogg" } });
    expect(r?.midia).toEqual({ tipo: "audio", url: "https://z/a.ogg", mime: "audio/ogg", nome: null, caption: "" });
  });
  it("documento → midia document com nome", () => {
    const r = extrairMensagemZapi({
      phone: "553400",
      messageId: "M3",
      document: { documentUrl: "https://z/d.pdf", mimeType: "application/pdf", fileName: "nota.pdf" },
    });
    expect(r?.midia).toEqual({ tipo: "document", url: "https://z/d.pdf", mime: "application/pdf", nome: "nota.pdf", caption: "" });
  });
  it("mídia sem url → marcador, midia null", () => {
    const r = extrairMensagemZapi({ phone: "553400", messageId: "M4", image: { caption: "x" } });
    expect(r).toEqual({ telefone: "553400", texto: "[mídia não suportada]", zId: "M4", midia: null });
  });
  it("texto → midia null", () => {
    const r = extrairMensagemZapi({ phone: "553400", messageId: "M5", text: { message: "oi" } });
    expect(r).toEqual({ telefone: "553400", texto: "oi", zId: "M5", midia: null });
  });
});

describe("extensaoPorMime", () => {
  it("mapeia subtipos comuns", () => {
    expect(extensaoPorMime("image/png")).toBe("png");
    expect(extensaoPorMime("image/jpeg")).toBe("jpg");
    expect(extensaoPorMime("application/pdf")).toBe("pdf");
    expect(extensaoPorMime("audio/ogg; codecs=opus")).toBe("ogg");
    expect(extensaoPorMime("image/svg+xml")).toBe("svg");
  });
  it("sem subtipo → bin", () => {
    expect(extensaoPorMime("")).toBe("bin");
  });
});
```

Ajustar os testes existentes de `extrairMensagemZapi` que usam `toEqual` (linhas do `describe("extrairMensagemZapi"...)`): incluir `midia: null` no objeto esperado. Ex.: `expect(r).toEqual({ telefone: "5534999998888", texto: "olá", zId: "M1", midia: null })`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- inbox`
Expected: FAIL (`extensaoPorMime` inexistente; `midia` ausente do retorno).

- [ ] **Step 3: Implementar em `inbox.ts`**

Substituir a função `extrairMensagemZapi` inteira por:

```ts
export type MidiaRecebida = {
  tipo: "image" | "audio" | "document";
  url: string;
  mime: string;
  nome: string | null;
  caption: string;
};

// Extrai uma mensagem RECEBIDA do payload do Z-API. `midia` != null para image/audio/document.
export function extrairMensagemZapi(
  payload: unknown,
): { telefone: string; texto: string; zId: string; midia: MidiaRecebida | null } | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (p.fromMe === true) return null; // eco das nossas próprias saídas
  const telefone = typeof p.phone === "string" ? p.phone : "";
  const zId = typeof p.messageId === "string" ? p.messageId : "";
  if (!telefone || !zId) return null;
  const textoDireto =
    (p.text as { message?: string } | undefined)?.message ?? (typeof p.message === "string" ? p.message : undefined);
  if (typeof textoDireto === "string" && textoDireto.length > 0) {
    return { telefone, texto: textoDireto, zId, midia: null };
  }
  const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
  const img = p.image as Record<string, unknown> | undefined;
  if (img) {
    const url = str(img.imageUrl) ?? str(img.url);
    const caption = str(img.caption) ?? "";
    if (url) return { telefone, zId, texto: caption, midia: { tipo: "image", url, mime: str(img.mimeType) ?? "image/jpeg", nome: null, caption } };
  }
  const aud = p.audio as Record<string, unknown> | undefined;
  if (aud) {
    const url = str(aud.audioUrl) ?? str(aud.url);
    if (url) return { telefone, zId, texto: "", midia: { tipo: "audio", url, mime: str(aud.mimeType) ?? "audio/ogg", nome: null, caption: "" } };
  }
  const doc = p.document as Record<string, unknown> | undefined;
  if (doc) {
    const url = str(doc.documentUrl) ?? str(doc.url);
    const caption = str(doc.caption) ?? "";
    if (url)
      return {
        telefone,
        zId,
        texto: caption,
        midia: { tipo: "document", url, mime: str(doc.mimeType) ?? "application/octet-stream", nome: str(doc.fileName) ?? str(doc.title) ?? "arquivo", caption },
      };
  }
  const temMidia = CHAVES_MIDIA.some((k) => p[k] != null);
  if (temMidia) return { telefone, texto: "[mídia não suportada]", zId, midia: null };
  return null; // status/ack/sem conteúdo
}

// "image/png" → "png"; "image/jpeg" → "jpg"; "application/pdf" → "pdf"; "audio/ogg; codecs=opus" → "ogg".
export function extensaoPorMime(mime: string): string {
  const sub = (mime || "").split("/")[1]?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!sub) return "bin";
  if (sub === "jpeg") return "jpg";
  if (sub === "svg+xml") return "svg";
  const san = sub.replace(/[^a-z0-9]/g, "");
  return san || "bin";
}
```

Estender o tipo `MsgConversa`:

```ts
export type MsgConversa = {
  id: string;
  telefone: string;
  texto: string;
  direcao: "IN" | "OUT";
  lida: boolean;
  criado_em: string;
  cliente?: string | null;
  status: string;
  midiaTipo: string | null;
  midiaPath: string | null;
  midiaNome: string | null;
  midiaMime: string | null;
};
```

- [ ] **Step 4: Ajustar `mapMsgs` e os selects em `actions.ts`**

Em `src/app/(app)/atendimento/actions.ts`, no `mapMsgs`, incluir os campos no tipo do row e no retorno:

```ts
    const m = row as {
      id: string;
      telefone: string;
      texto: string;
      direcao: "IN" | "OUT";
      lida: boolean;
      criado_em: string;
      status?: string;
      midia_tipo?: string | null;
      midia_path?: string | null;
      midia_nome?: string | null;
      midia_mime?: string | null;
      clientes?: { razao_social?: string } | { razao_social?: string }[] | null;
    };
    const cl = Array.isArray(m.clientes) ? m.clientes[0] : m.clientes;
    return {
      id: m.id,
      telefone: m.telefone,
      texto: m.texto,
      direcao: m.direcao,
      lida: m.lida,
      criado_em: m.criado_em,
      status: m.status ?? "",
      midiaTipo: m.midia_tipo ?? null,
      midiaPath: m.midia_path ?? null,
      midiaNome: m.midia_nome ?? null,
      midiaMime: m.midia_mime ?? null,
      cliente: (cl as { razao_social?: string } | null)?.razao_social ?? null,
    };
```

E nos dois `.select(...)` (`listarConversas` e `abrirConversa`), trocar por:

```ts
    .select("id, telefone, texto, direcao, lida, criado_em, status, midia_tipo, midia_path, midia_nome, midia_mime, clientes(razao_social)")
```

- [ ] **Step 5: Rodar tests + lint + typecheck**

Run: `npm test -- inbox && npm run lint && npm run typecheck`
Expected: testes passam. O `tsc` vai acusar os literais `MsgConversa[]` sem `id`/campos de mídia nos testes (blocos `agruparConversas` e `agruparConversas favoritos`). Em cada literal, adicionar: `id: "x"`, `midiaTipo: null, midiaPath: null, midiaNome: null, midiaMime: null`. Rodar `npm run typecheck` de novo até limpar.

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp/inbox.ts "src/app/(app)/atendimento/actions.ts" src/tests/whatsapp/inbox.test.ts
git commit -m "feat(atendimento): parser de mídia + extensaoPorMime + read model com id/mídia

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `zapi.ts` — envio de mídia (TDD)

**Files:**
- Modify: `src/lib/whatsapp/zapi.ts`
- Test: `src/tests/whatsapp/zapi.test.ts`

**Interfaces:**
- Consumes: `extensaoPorMime` (Task 2).
- Produces:
  - `type MidiaEnvio = { tipo: "image"|"document"; base64: string; mime: string; nome: string; caption: string }`.
  - `montarEnvioMidia(cfg, telefone, midia): { url; headers; body }`.
  - `enviarMidiaZapi(cfg, telefone, midia): Promise<{ ok; erro?; resposta? }>`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar em `src/tests/whatsapp/zapi.test.ts` (importar `montarEnvioMidia`):

```ts
describe("montarEnvioMidia", () => {
  const cfg = { instance: "INST", token: "TOK", clientToken: "CT" };
  it("imagem → send-image com data URI e caption", () => {
    const r = montarEnvioMidia(cfg, "5534999998888", { tipo: "image", base64: "AAAA", mime: "image/png", nome: "f.png", caption: "oi" });
    expect(r.url).toBe("https://api.z-api.io/instances/INST/token/TOK/send-image");
    expect(r.headers["Client-Token"]).toBe("CT");
    expect(JSON.parse(r.body)).toEqual({ phone: "5534999998888", image: "data:image/png;base64,AAAA", caption: "oi" });
  });
  it("documento → send-document/{ext} com fileName", () => {
    const r = montarEnvioMidia(cfg, "553400", { tipo: "document", base64: "BBBB", mime: "application/pdf", nome: "nota.pdf", caption: "" });
    expect(r.url).toBe("https://api.z-api.io/instances/INST/token/TOK/send-document/pdf");
    expect(JSON.parse(r.body)).toEqual({ phone: "553400", document: "data:application/pdf;base64,BBBB", fileName: "nota.pdf", caption: "" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- zapi`
Expected: FAIL (`montarEnvioMidia` inexistente).

- [ ] **Step 3: Implementar em `zapi.ts`**

Adicionar o import de `extensaoPorMime` no topo e as funções (após `enviarTexto`):

```ts
import { extensaoPorMime } from "@/lib/whatsapp/inbox";

export type MidiaEnvio = { tipo: "image" | "document"; base64: string; mime: string; nome: string; caption: string };

// Monta a requisição de envio de mídia (puro, testável). image → /send-image; document → /send-document/{ext}.
export function montarEnvioMidia(
  cfg: ZapiConfig,
  telefone: string,
  midia: MidiaEnvio,
): { url: string; headers: Record<string, string>; body: string } {
  const headers = { "Content-Type": "application/json", "Client-Token": cfg.clientToken };
  const dataUri = `data:${midia.mime};base64,${midia.base64}`;
  const base = `${BASE}/instances/${cfg.instance}/token/${cfg.token}`;
  if (midia.tipo === "image") {
    return {
      url: `${base}/send-image`,
      headers,
      body: JSON.stringify({ phone: telefone, image: dataUri, caption: midia.caption }),
    };
  }
  return {
    url: `${base}/send-document/${extensaoPorMime(midia.mime)}`,
    headers,
    body: JSON.stringify({ phone: telefone, document: dataUri, fileName: midia.nome, caption: midia.caption }),
  };
}

export async function enviarMidiaZapi(
  cfg: ZapiConfig,
  telefone: string,
  midia: MidiaEnvio,
): Promise<{ ok: boolean; erro?: string; resposta?: unknown }> {
  const req = montarEnvioMidia(cfg, telefone, midia);
  try {
    return await comTimeout(async (signal) => {
      const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body, signal });
      const corpo = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, erro: `Z-API HTTP ${res.status}`, resposta: corpo };
      return { ok: true, resposta: corpo };
    });
  } catch (e) {
    return { ok: false, erro: e instanceof Error && e.name === "AbortError" ? "Tempo esgotado." : "Erro de rede." };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- zapi && npm run lint && npm run typecheck`
Expected: PASS, sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/zapi.ts src/tests/whatsapp/zapi.test.ts
git commit -m "feat(atendimento): montarEnvioMidia + enviarMidiaZapi (send-image/send-document)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Baixar+guardar mídia recebida + webhook

**Files:**
- Create: `src/lib/whatsapp/midia-storage.ts`
- Modify: `src/app/api/webhooks/zapi/[secret]/route.ts`

**Interfaces:**
- Consumes: `extensaoPorMime` (Task 2); `MidiaRecebida` no `msg.midia` do webhook.
- Produces: `baixarEStorearMidia(admin, url, mime, clientToken): Promise<string | null>`.

- [ ] **Step 1: Criar `src/lib/whatsapp/midia-storage.ts`**

```ts
import "server-only";
import type { createAdminSupabase } from "@/lib/supabase/admin";
import { extensaoPorMime } from "@/lib/whatsapp/inbox";

const MAX_BYTES = 20 * 1024 * 1024;

async function baixar(url: string, clientToken: string | null): Promise<Buffer | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    let res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok && clientToken && /z-?api/i.test(url)) {
      res = await fetch(url, { signal: ctrl.signal, headers: { "Client-Token": clientToken } });
    }
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) return null;
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_BYTES) return null;
    return Buffer.from(ab);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Baixa a mídia (com Client-Token se for host do Z-API) e sobe no bucket 'documentos'.
// Retorna o path salvo ou null em falha. Best-effort.
export async function baixarEStorearMidia(
  admin: ReturnType<typeof createAdminSupabase>,
  url: string,
  mime: string,
  clientToken: string | null,
): Promise<string | null> {
  const buf = await baixar(url, clientToken);
  if (!buf) return null;
  const path = `atendimento/in/${crypto.randomUUID()}.${extensaoPorMime(mime)}`;
  const { error } = await admin.storage.from("documentos").upload(path, buf, { contentType: mime, upsert: false });
  return error ? null : path;
}
```

- [ ] **Step 2: Ajustar o webhook para mídia**

Em `src/app/api/webhooks/zapi/[secret]/route.ts`: adicionar imports:

```ts
import { decifrar } from "@/lib/nfse/cripto";
import { baixarEStorearMidia } from "@/lib/whatsapp/midia-storage";
```

Substituir o insert final de texto (bloco `const { error } = await admin.from("whatsapp_mensagem").insert({ ...RECEBIDO... }); if (error && ...) ...; return NextResponse.json({ ok: true });`) por:

```ts
  if (msg.midia) {
    // Client-Token best-effort (algumas URLs do Z-API exigem o header).
    let clientToken: string | null = null;
    const chave = process.env.WHATSAPP_CRIPTO_KEY;
    if (chave) {
      const { data: cfg } = await admin.from("whatsapp_config").select("client_token_cifrado").eq("id", 1).maybeSingle();
      if (cfg?.client_token_cifrado) {
        try {
          clientToken = decifrar(cfg.client_token_cifrado, chave).toString("utf8");
        } catch {
          clientToken = null;
        }
      }
    }
    const path = await baixarEStorearMidia(admin, msg.midia.url, msg.midia.mime, clientToken);
    const marcador = `[${msg.midia.tipo}${msg.midia.nome ? ": " + msg.midia.nome : ""}]`;
    const { error } = await admin.from("whatsapp_mensagem").insert({
      cliente_id: clienteId,
      telefone: tel,
      texto: path ? msg.midia.caption : marcador,
      status: "RECEBIDO",
      direcao: "IN",
      lida: false,
      z_message_id: msg.zId,
      midia_tipo: path ? msg.midia.tipo : null,
      midia_path: path,
      midia_nome: msg.midia.nome,
      midia_mime: msg.midia.mime,
    });
    if (error && !String(error.message).includes("duplicate")) console.error("webhook zapi midia:", error.message);
    if (!path) console.log("zapi midia payload:", JSON.stringify(payload).slice(0, 400));
    return NextResponse.json({ ok: true });
  }

  const { error } = await admin.from("whatsapp_mensagem").insert({
    cliente_id: clienteId,
    telefone: tel,
    texto: msg.texto,
    status: "RECEBIDO",
    direcao: "IN",
    lida: false,
    z_message_id: msg.zId,
  });
  if (error && !String(error.message).includes("duplicate")) {
    console.error("webhook zapi:", error.message);
  }
  return NextResponse.json({ ok: true });
```

- [ ] **Step 3: Lint + typecheck + build**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: sem erros; a rota do webhook compila.

- [ ] **Step 4: Commit**

```bash
git add src/lib/whatsapp/midia-storage.ts "src/app/api/webhooks/zapi/[secret]/route.ts"
git commit -m "feat(atendimento): webhook baixa e guarda mídia recebida no storage

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Rota para servir a mídia

**Files:**
- Create: `src/app/api/atendimento/midia/[id]/route.ts`

**Interfaces:**
- Consumes: `getPerfilAtual`, `podeAtender`, `createServerSupabase`, `createAdminSupabase`.

- [ ] **Step 1: Criar a rota**

```ts
import { NextResponse } from "next/server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeAtender } from "@/lib/clientes/permissoes";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeAtender(perfil.papel)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const { id } = await ctx.params;
  // RLS garante que só retorna a mensagem se o usuário a vê.
  const supabase = await createServerSupabase();
  const { data: msg } = await supabase
    .from("whatsapp_mensagem")
    .select("midia_path, midia_mime, midia_nome")
    .eq("id", id)
    .maybeSingle();
  if (!msg?.midia_path) return NextResponse.json({ erro: "não encontrado" }, { status: 404 });
  const admin = createAdminSupabase();
  const { data: arquivo, error } = await admin.storage.from("documentos").download(msg.midia_path as string);
  if (error || !arquivo) return NextResponse.json({ erro: "não encontrado" }, { status: 404 });
  const buf = Buffer.from(await arquivo.arrayBuffer());
  const headers: Record<string, string> = {
    "Content-Type": (msg.midia_mime as string) ?? "application/octet-stream",
    "Cache-Control": "private, max-age=3600",
  };
  if (msg.midia_nome) headers["Content-Disposition"] = `inline; filename="${String(msg.midia_nome).replace(/"/g, "")}"`;
  return new NextResponse(buf, { status: 200, headers });
}
```

- [ ] **Step 2: Lint + typecheck + build**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: sem erros; a rota `/api/atendimento/midia/[id]` compila.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/atendimento/midia/[id]/route.ts"
git commit -m "feat(atendimento): rota autenticada para servir a mídia

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Action `enviarMidia`

**Files:**
- Modify: `src/app/(app)/atendimento/actions.ts`

**Interfaces:**
- Consumes: `enviarMidiaZapi` (Task 3), `extensaoPorMime` (Task 2), `decifrar`, `createAdminSupabase`, `normalizarTelefone` (já usados no arquivo).
- Produces: `enviarMidia(formData: FormData): Promise<{ ok?: boolean; erro?: string }>`.

- [ ] **Step 1: Imports**

No topo de `actions.ts`, adicionar:

```ts
import { enviarMidiaZapi } from "@/lib/whatsapp/zapi";
import { extensaoPorMime } from "@/lib/whatsapp/inbox";
```
(`enviarTexto` já é importado de `zapi`; adicionar `enviarMidiaZapi` ao mesmo import ou em linha nova. `extensaoPorMime` vem de `inbox` — juntar ao import existente de inbox.)

- [ ] **Step 2: Adicionar a action ao final de `actions.ts`**

```ts
export async function enviarMidia(formData: FormData): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const telefone = String(formData.get("telefone") ?? "");
  const legenda = String(formData.get("legenda") ?? "").trim();
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Selecione um arquivo." };
  if (arquivo.size > 10 * 1024 * 1024) return { erro: "Arquivo acima de 10 MB." };
  const mime = arquivo.type || "application/octet-stream";
  if (mime.startsWith("video/") || mime.startsWith("audio/")) return { erro: "Tipo não suportado no envio." };
  const tipo: "image" | "document" = mime.startsWith("image/") ? "image" : "document";

  const chave = process.env.WHATSAPP_CRIPTO_KEY;
  const admin = createAdminSupabase();
  const { data: cfg } = await admin
    .from("whatsapp_config")
    .select("instance, token_cifrado, client_token_cifrado")
    .eq("id", 1)
    .maybeSingle();
  if (!chave || !cfg?.instance || !cfg.token_cifrado || !cfg.client_token_cifrado) return { erro: "WhatsApp não configurado." };
  const zapi = {
    instance: cfg.instance,
    token: decifrar(cfg.token_cifrado, chave).toString("utf8"),
    clientToken: decifrar(cfg.client_token_cifrado, chave).toString("utf8"),
  };

  const buf = Buffer.from(await arquivo.arrayBuffer());
  const nome = arquivo.name || "arquivo";
  const r = await enviarMidiaZapi(zapi, telefone, { tipo, base64: buf.toString("base64"), mime, nome, caption: legenda });

  // guarda cópia no storage para a thread renderizar do nosso domínio
  const path = `atendimento/out/${crypto.randomUUID()}.${extensaoPorMime(mime)}`;
  await admin.storage.from("documentos").upload(path, buf, { contentType: mime, upsert: false });

  const { data: cli } = await admin.from("clientes").select("id, telefone");
  const casados = (cli ?? []).filter((c) => normalizarTelefone((c.telefone as string) ?? "") === telefone);
  const clienteId = casados.length === 1 ? (casados[0]!.id as string) : null;
  const resp = (r.resposta ?? {}) as { messageId?: string; id?: string };
  await admin.from("whatsapp_mensagem").insert({
    cliente_id: clienteId,
    telefone,
    texto: legenda,
    status: r.ok ? "ENVIADO" : "ERRO",
    direcao: "OUT",
    lida: true,
    resposta: (r.resposta ?? r.erro) as object,
    criado_por: perfil.id,
    z_message_id: r.ok ? (resp.messageId ?? resp.id ?? null) : null,
    midia_tipo: tipo,
    midia_path: path,
    midia_nome: nome,
    midia_mime: mime,
  });
  return r.ok ? { ok: true } : { erro: r.erro ?? "Falha no envio." };
}
```

- [ ] **Step 3: Lint + typecheck + build**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/atendimento/actions.ts"
git commit -m "feat(atendimento): action enviarMidia (anexo imagem/PDF via Z-API base64)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: UI — render de mídia + anexo no composer

**Files:**
- Modify: `src/app/(app)/atendimento/Inbox.tsx`

**Interfaces:**
- Consumes: `enviarMidia` (Task 6); `MsgConversa` com `id`/`midia*` (Task 2).

- [ ] **Step 1: Import + estado do anexo**

No import de `./actions`, adicionar `enviarMidia`. Dentro do componente `Inbox`, adicionar estados e ref:

```tsx
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviandoMidia, setEnviandoMidia] = useState(false);
  const [erroMidia, setErroMidia] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
```

E a função de envio (perto de `enviar`):

```tsx
  const enviarAnexo = () =>
    start(async () => {
      if (!ativa || !arquivo) return;
      setEnviandoMidia(true);
      setErroMidia(null);
      const fd = new FormData();
      fd.set("telefone", ativa);
      fd.set("arquivo", arquivo);
      fd.set("legenda", texto);
      const r = await enviarMidia(fd);
      setEnviandoMidia(false);
      if (r.erro) {
        setErroMidia(r.erro);
        return;
      }
      setArquivo(null);
      setTexto("");
      if (fileRef.current) fileRef.current.value = "";
      setMsgs(await abrirConversa(ativa));
    });
```

- [ ] **Step 2: Renderizar a mídia no balão**

No conteúdo do balão, antes de `{m.texto}`, inserir a mídia; e só mostrar o texto quando houver. Substituir o trecho `{m.texto}` do balão por:

```tsx
                      <Midia msg={m} />
                      {m.texto && <span className={m.midiaPath ? "mt-1 block" : ""}>{m.texto}</span>}
```

Adicionar o componente `Midia` (junto de `Check`/`Linha`):

```tsx
function Midia({ msg }: { msg: MsgConversa }) {
  if (!msg.midiaTipo || !msg.midiaPath) return null;
  const src = `/api/atendimento/midia/${msg.id}`;
  if (msg.midiaTipo === "image") {
    return (
      <a href={src} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={msg.midiaNome ?? "imagem"} className="max-h-64 rounded-lg" />
      </a>
    );
  }
  if (msg.midiaTipo === "audio") {
    return <audio controls src={src} className="max-w-full" />;
  }
  return (
    <a
      href={src}
      download={msg.midiaNome ?? "arquivo"}
      className="flex items-center gap-2 rounded-lg border border-linha bg-white px-3 py-2 text-texto"
    >
      <span aria-hidden>📎</span>
      <span className="truncate">{msg.midiaNome ?? "arquivo"}</span>
    </a>
  );
}
```

- [ ] **Step 3: Anexo no composer**

Substituir a `<div>` do composer (a que tem o `<input>` de "Responder…" e o botão "Enviar") por uma versão com botão de clipe, input de arquivo escondido, e barra do arquivo selecionado:

```tsx
            <div className="border-t border-linha bg-white px-4 py-3">
              {arquivo && (
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-linha bg-creme px-3 py-2 text-xs">
                  <span aria-hidden>📎</span>
                  <span className="flex-1 truncate">{arquivo.name}</span>
                  <button
                    onClick={enviarAnexo}
                    disabled={enviandoMidia}
                    className="rounded-lg bg-verde px-3 py-1 font-medium text-white disabled:opacity-60"
                  >
                    {enviandoMidia ? "Enviando…" : "Enviar arquivo"}
                  </button>
                  <button onClick={() => setArquivo(null)} className="rounded-lg border border-linha px-2 py-1">
                    ✕
                  </button>
                </div>
              )}
              {erroMidia && <p className="mb-2 text-xs text-negativo">{erroMidia}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-label="Anexar arquivo"
                  onClick={() => fileRef.current?.click()}
                  className="rounded-xl border border-linha px-3 text-cinza hover:bg-creme"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.4 11.05 12.25 20.2a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.48-8.49" />
                  </svg>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                  onChange={(e) => {
                    setErroMidia(null);
                    setArquivo(e.target.files?.[0] ?? null);
                  }}
                />
                <input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (arquivo ? enviarAnexo() : enviar());
                  }}
                  placeholder={arquivo ? "Legenda (opcional)…" : "Responder…"}
                  className="flex-1 rounded-xl border border-linha bg-creme px-4 py-2.5 text-sm focus:border-verde"
                />
                <button
                  onClick={enviar}
                  disabled={pend}
                  className="rounded-xl bg-verde px-5 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60"
                >
                  Enviar
                </button>
              </div>
            </div>
```

- [ ] **Step 4: Suite completa + lint + typecheck + build**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tudo verde; rota `/atendimento` compila; smoke `inbox-render` continua passando.

- [ ] **Step 5: Verificação visual no dev-server (opcional)**

`npm run dev` → abrir `/atendimento`, abrir uma conversa: o composer mostra o clipe; escolher uma imagem/PDF mostra a barra do arquivo. (Envio real e recepção validam-se no deploy.)

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/atendimento/Inbox.tsx"
git commit -m "feat(atendimento): render de mídia na thread + anexo no composer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: CHANGELOG + finalizar branch

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG**

Sob `## [Não lançado]` → `### Adicionado`:

```markdown
- **Atendimento — mídia (Fatia B):** recebe imagem/áudio/documento do cliente (baixados e guardados no
  storage) e envia imagem/PDF por anexo no composer; imagens viram miniatura, áudio vira player e
  documento vira chip com download.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog do Atendimento Fatia B (mídia)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: Finalizar a branch**

Usar `superpowers:finishing-a-development-branch`.

> **Pós-deploy (usuário):** garantir que o webhook "Ao receber" do Z-API está ativo (já está). Testar:
> mandar uma foto/PDF/áudio do celular → deve aparecer renderizado na thread; anexar uma imagem/PDF no
> composer → deve chegar no celular. Se a mídia recebida não baixar (aparece "[image]"/"[document]"),
> ver o log `zapi midia payload` no EasyPanel para calibrar o parser.

---

## Self-Review

- **Cobertura do spec:** colunas de mídia (T1) ✓; parser `extrairMensagemZapi`+`extensaoPorMime`+`MsgConversa` (T2) ✓; `montarEnvioMidia`/`enviarMidiaZapi` (T3) ✓; `baixarEStorearMidia`+webhook (T4) ✓; rota de servir (T5) ✓; `enviarMidia`+mapMsgs+selects (T6, mapMsgs/selects em T2) ✓; UI render+anexo (T7) ✓; testes unit (T2/T3) ✓; CHANGELOG (T8) ✓; risco/log (T4) ✓.
- **Desvio consciente:** o smoke de balão de mídia não é viável (mensagens carregam via `abrirConversa` assíncrono, fora do `renderToStaticMarkup`) — a lógica fica coberta pelos unit tests dos helpers; o visual valida-se no deploy (registrado em T7).
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Consistência de tipos:** `MidiaRecebida`/`MidiaEnvio`/`MsgConversa.{id,midiaTipo,midiaPath,midiaNome,midiaMime}` definidos no T2/T3 e usados no T4/T6/T7; colunas SQL `midia_tipo/midia_path/midia_nome/midia_mime` idênticas em T1 (migration), T2 (mapMsgs/selects), T4 e T6 (inserts) e T5 (select). `extensaoPorMime` usado em T3/T4/T6.
```
