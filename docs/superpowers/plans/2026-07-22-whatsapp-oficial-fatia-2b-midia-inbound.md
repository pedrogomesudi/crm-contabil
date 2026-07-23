# WhatsApp oficial — Fatia 2B: mídia inbound — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** receber **mídia** (imagem, documento, áudio) pela API oficial do WhatsApp — hoje ela chega como o texto marcador `"[mídia]"` — baixando pelo media id e guardando no mesmo destino do Z-API.

**Architecture:** `extrairMensagemOficial` passa a devolver `MidiaOficialRecebida` (o tipo já existe, hoje nunca é preenchido). Um helper novo `baixarEStorearMidiaOficial` resolve o **media id → URL → bytes** na Graph API (Bearer) e sobe no bucket `documentos`, reusando as proteções que o download do Z-API já tem (HTTPS, anti-SSRF, teto de 20 MB em streaming, timeout). O webhook oficial passa a gravar as colunas `midia_*`, igual ao webhook Z-API.

**Tech Stack:** Next 16 (route handler, runtime nodejs), TypeScript, Supabase Storage (bucket `documentos`), vitest.

## Global Constraints

- Migrations: **nenhuma nesta fatia** (as colunas `midia_tipo/midia_path/midia_nome/midia_mime` já existem em `whatsapp_mensagem`, usadas pelo webhook Z-API).
- **Não alterar o comportamento do webhook Z-API** (`src/app/api/webhooks/zapi/[secret]/route.ts`) — está em produção. A decisão da spec de **duplicar a persistência** (em vez de refatorar) permanece.
- O segredo do provedor oficial vive cifrado: `whatsapp_config.oficial_token_cifrado`, lido com `decifrarDominio("whatsapp", …)`. **Nunca** logar token, app secret ou bytes de mídia.
- O `Bearer` só pode ser enviado a hosts oficiais da Meta — mesma regra que o `Client-Token` só vai para hosts `z-api.io` (`ehHostZapi`). Vazar o token para um host arbitrário é o risco real aqui.
- Comandos antes de entregar: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`, `npm run build`.
- Entrega por PR (`main` é protegido): `git push origin develop` → `gh pr create --base main --head develop` → `gh pr checks --watch` → `gh pr merge --merge`. Deploy é manual (Implantar + conferir `/api/health`); **tag só depois** do health.
- `package.json.version` sobe junto com o CHANGELOG **no mesmo PR** (`src/tests/versao.test.ts` exige que batam).

---

### Task 1: `extrairMensagemOficial` devolve a mídia

**Files:**
- Modify: `src/lib/whatsapp/inbox-oficial.ts:46-48` (o ramo `image|document|audio`)
- Test: `src/tests/whatsapp/inbox-oficial.test.ts` (arquivo existente da 2A — adicionar casos)

**Interfaces:**
- Consumes: `MidiaOficialRecebida` (já definido em `inbox-oficial.ts:4-10`).
- Produces: `extrairMensagemOficial` passa a devolver `midia: MidiaOficialRecebida` para `image`/`document`/`audio`; `texto` vira a **caption** quando houver, senão `"[mídia]"`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
  it("extrai imagem com caption", () => {
    const p = { entry: [{ changes: [{ value: { messages: [{
      from: "5511999999999", id: "wamid.1", type: "image",
      image: { id: "MID-1", mime_type: "image/jpeg", caption: "olha a nota" },
    }] } }] }] };
    expect(extrairMensagemOficial(p)).toEqual({
      telefone: "5511999999999", texto: "olha a nota", wamId: "wamid.1",
      midia: { tipo: "image", id: "MID-1", mime: "image/jpeg", nome: null, caption: "olha a nota" },
    });
  });

  it("extrai documento com filename e sem caption", () => {
    const p = { entry: [{ changes: [{ value: { messages: [{
      from: "5511999999999", id: "wamid.2", type: "document",
      document: { id: "MID-2", mime_type: "application/pdf", filename: "nota.pdf" },
    }] } }] }] };
    expect(extrairMensagemOficial(p)).toEqual({
      telefone: "5511999999999", texto: "[mídia]", wamId: "wamid.2",
      midia: { tipo: "document", id: "MID-2", mime: "application/pdf", nome: "nota.pdf", caption: "" },
    });
  });

  it("extrai áudio", () => {
    const p = { entry: [{ changes: [{ value: { messages: [{
      from: "5511999999999", id: "wamid.3", type: "audio",
      audio: { id: "MID-3", mime_type: "audio/ogg" },
    }] } }] }] };
    expect(extrairMensagemOficial(p)?.midia).toEqual({
      tipo: "audio", id: "MID-3", mime: "audio/ogg", nome: null, caption: "",
    });
  });

  it("mídia sem id continua como marcador, sem mídia", () => {
    const p = { entry: [{ changes: [{ value: { messages: [{
      from: "5511999999999", id: "wamid.4", type: "image", image: { mime_type: "image/jpeg" },
    }] } }] }] };
    expect(extrairMensagemOficial(p)).toEqual({
      telefone: "5511999999999", texto: "[mídia]", wamId: "wamid.4", midia: null,
    });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/whatsapp/inbox-oficial.test.ts`
Expected: FAIL — os casos de mídia devolvem `midia: null`.

- [ ] **Step 3: Implementar**

Substituir o ramo de mídia (`inbox-oficial.ts:46-48`) por:

```ts
  if (m.type === "image" || m.type === "document" || m.type === "audio") {
    const bloco = (m[m.type] ?? {}) as { id?: string; mime_type?: string; filename?: string; caption?: string };
    const caption = typeof bloco.caption === "string" ? bloco.caption : "";
    // Sem id não há como baixar: cai no marcador (comportamento da 2A).
    if (typeof bloco.id !== "string" || !bloco.id) {
      return { telefone, texto: caption || "[mídia]", wamId, midia: null };
    }
    return {
      telefone,
      texto: caption || "[mídia]",
      wamId,
      midia: {
        tipo: m.type,
        id: bloco.id,
        mime: typeof bloco.mime_type === "string" ? bloco.mime_type : "application/octet-stream",
        nome: typeof bloco.filename === "string" ? bloco.filename : null,
        caption,
      },
    };
  }
```

Atualizar o comentário de `inbox-oficial.ts:30-31` (ele diz que a 2B ainda não chegou).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/whatsapp/inbox-oficial.test.ts`
Expected: PASS (os casos da 2A seguem verdes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/inbox-oficial.ts src/tests/whatsapp/inbox-oficial.test.ts
git commit -m "feat(whatsapp): extrai midia inbound da Cloud API (id/mime/nome/caption)"
```

---

### Task 2: Download da mídia oficial (media id → URL → bytes → storage)

**Files:**
- Modify: `src/lib/whatsapp/midia-storage.ts` (extrair o downloader por headers; adicionar guarda de host Meta e a função oficial)
- Test: `src/tests/whatsapp/midia-oficial.test.ts` (novo)

**Interfaces:**
- Consumes: `hostInterno`, `extensaoPorMime` (já no arquivo), `createAdminSupabase`.
- Produces: `baixarEStorearMidiaOficial(admin, mediaId, token): Promise<{ path: string; mime: string } | null>` e `ehHostMeta(host: string): boolean` (exportada só para teste).

- [ ] **Step 1: Escrever o teste da guarda de host (falha)**

A guarda é o que impede vazar o Bearer — é a parte que merece teste puro.

```ts
import { describe, it, expect } from "vitest";
import { ehHostMeta } from "@/lib/whatsapp/midia-storage";

describe("ehHostMeta", () => {
  it("aceita os hosts oficiais da Meta", () => {
    expect(ehHostMeta("graph.facebook.com")).toBe(true);
    expect(ehHostMeta("lookaside.fbsbx.com")).toBe(true);
    expect(ehHostMeta("scontent.xx.fbcdn.net")).toBe(true);
  });

  it("recusa host de terceiro (não vaza o Bearer)", () => {
    expect(ehHostMeta("evil.com")).toBe(false);
    expect(ehHostMeta("graph.facebook.com.evil.com")).toBe(false);
    expect(ehHostMeta("fbsbx.com.attacker.io")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/whatsapp/midia-oficial.test.ts`
Expected: FAIL — `ehHostMeta` não é exportada.

- [ ] **Step 3: Implementar**

Em `midia-storage.ts`, generalizar o downloader por headers (a assinatura pública de `baixarEStorearMidia` **não muda**) e acrescentar a via oficial:

```ts
// Só envia o Bearer para hosts oficiais da Meta (evita exfiltração do token), no mesmo
// espírito do Client-Token restrito ao Z-API. Exportada para teste.
export function ehHostMeta(host: string): boolean {
  const h = host.toLowerCase();
  return h === "graph.facebook.com" || h.endsWith(".fbcdn.net") || h.endsWith(".fbsbx.com");
}

// O download com todas as proteções (HTTPS, anti-SSRF, teto em streaming, timeout, sem redirect).
async function baixarComHeaders(url: string, headers: Record<string, string>): Promise<Buffer | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (hostInterno(parsed.hostname)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers, redirect: "error" });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel();
          return null;
        }
        chunks.push(Buffer.from(value));
      }
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Baixa a mídia da Cloud API (media id → URL assinada → bytes) e sobe no bucket 'documentos'.
// Best-effort: null em qualquer falha (a mensagem entra sem anexo).
export async function baixarEStorearMidiaOficial(
  admin: ReturnType<typeof createAdminSupabase>,
  mediaId: string,
  token: string,
): Promise<{ path: string; mime: string } | null> {
  const auth = { Authorization: `Bearer ${token}` };
  // 1) media id → { url, mime_type }
  const metaBuf = await baixarComHeaders(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(mediaId)}`,
    auth,
  );
  if (!metaBuf) return null;
  let url: string;
  let mime: string;
  try {
    const j = JSON.parse(metaBuf.toString("utf8")) as { url?: string; mime_type?: string };
    if (typeof j.url !== "string") return null;
    url = j.url;
    mime = typeof j.mime_type === "string" ? j.mime_type : "application/octet-stream";
  } catch {
    return null;
  }
  // 2) a URL assinada também exige o Bearer — e só pode ser um host da Meta.
  let hostOk = false;
  try {
    hostOk = ehHostMeta(new URL(url).hostname);
  } catch {
    return null;
  }
  if (!hostOk) return null;
  const bytes = await baixarComHeaders(url, auth);
  if (!bytes) return null;
  // 3) mesmo destino do Z-API
  const path = `atendimento/in/${crypto.randomUUID()}.${extensaoPorMime(mime)}`;
  const { error } = await admin.storage.from("documentos").upload(path, bytes, { contentType: mime, upsert: false });
  return error ? null : { path, mime };
}
```

E reescrever o `baixar` existente como casca fina, preservando a regra do Client-Token:

```ts
async function baixar(url: string, clientToken: string | null): Promise<Buffer | null> {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  const headers: Record<string, string> = ehHostZapi(host) && clientToken ? { "Client-Token": clientToken } : {};
  return baixarComHeaders(url, headers);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/whatsapp/midia-oficial.test.ts && npx vitest run src/tests/whatsapp/`
Expected: PASS — inclusive os testes existentes de mídia do Z-API (a refatoração não pode mudar o comportamento dele).

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/midia-storage.ts src/tests/whatsapp/midia-oficial.test.ts
git commit -m "feat(whatsapp): download de midia da Cloud API (media id, Bearer restrito a hosts Meta)"
```

---

### Task 3: O webhook oficial grava a mídia

**Files:**
- Modify: `src/app/api/webhooks/whatsapp-oficial/route.ts:28-33` (carregar também o token) e `:79-87` (insert)

**Interfaces:**
- Consumes: `msg.midia` (Task 1), `baixarEStorearMidiaOficial` (Task 2), `decifrarDominio` (já importado).

- [ ] **Step 1: Carregar o token oficial junto do app secret**

Trocar o select (`route.ts:28-33`) para trazer os dois campos:

```ts
  const { data: cfg } = await admin
    .from("whatsapp_config")
    .select("oficial_app_secret_cifrado, oficial_token_cifrado")
    .eq("id", 1)
    .maybeSingle();
```

- [ ] **Step 2: Baixar a mídia e gravar as colunas**

Substituir o insert (`route.ts:79-87`) por:

```ts
  // Mídia (Fatia 2B): baixa pelo media id com o token oficial. Best-effort — se falhar,
  // a mensagem entra sem anexo (o texto/caption preserva o contexto).
  let midiaPath: string | null = null;
  let midiaMime: string | null = null;
  if (msg.midia && cfg.oficial_token_cifrado) {
    try {
      const token = (await decifrarDominio("whatsapp", cfg.oficial_token_cifrado as string)).toString("utf8");
      const salvo = await baixarEStorearMidiaOficial(admin, msg.midia.id, token);
      if (salvo) {
        midiaPath = salvo.path;
        midiaMime = salvo.mime;
      }
    } catch {
      // cripto indisponível: segue sem anexo
    }
  }

  const { error } = await admin.from("whatsapp_mensagem").insert({
    cliente_id: clienteId,
    telefone: tel,
    texto: msg.texto,
    status: "RECEBIDO",
    direcao: "IN",
    lida: false,
    z_message_id: msg.wamId,
    midia_tipo: midiaPath ? msg.midia?.tipo : null,
    midia_path: midiaPath,
    midia_nome: msg.midia?.nome ?? null,
    midia_mime: midiaPath ? (midiaMime ?? msg.midia?.mime ?? null) : null,
  });
```

Adicionar o import:

```ts
import { baixarEStorearMidiaOficial } from "@/lib/whatsapp/midia-storage";
```

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npx vitest run src/tests/whatsapp/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/webhooks/whatsapp-oficial/route.ts"
git commit -m "feat(whatsapp): webhook oficial grava midia recebida (imagem, documento, audio)"
```

---

### Task 4: Release

- [ ] **Step 1: Suíte completa**

Run: `npm run lint && npm run typecheck && npm test && npm run format && npm run build`
Expected: tudo verde.

- [ ] **Step 2: Versão + CHANGELOG** no mesmo commit/PR (minor: `6.75.0`), citando que a API oficial passa a **receber** mídia — fechando o Sub-projeto 2.

- [ ] **Step 3: Entrega** — REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch. PR `develop`→`main`, `gh pr checks --watch`, merge. **Sem migration nesta fatia.** Implantar no EasyPanel, conferir `/api/health`, **tag depois**.

---

## Self-Review

- **Cobertura da spec (Fatia 2B):** `extrairMensagemOficial` devolvendo `MidiaOficialRecebida` (Task 1); o helper de download media id → URL → bytes (Task 2, nomeado `baixarEStorearMidiaOficial` porque também guarda no storage — a spec previa `baixarMidiaOficial` só para os bytes; a diferença é que reusamos o destino `atendimento/in/…` num passo só, como o Z-API faz); persistência com `midia_*` no webhook (Task 3).
- **Placeholders:** nenhum passo de código sem código; sem migration nesta fatia (verificado: as colunas `midia_*` já existem e são usadas pelo webhook Z-API).
- **Consistência de tipos:** `MidiaOficialRecebida` (campo `id`, não `url`) usado igual em Tasks 1 e 3; `baixarEStorearMidiaOficial` devolve `{path, mime}` e é consumida exatamente assim na Task 3; `baixarEStorearMidia` (Z-API) mantém assinatura e comportamento.

## Riscos

| Risco | Mitigação |
|---|---|
| Vazar o token oficial num host de terceiro | `ehHostMeta` restringe o `Bearer` a `graph.facebook.com` / `*.fbsbx.com` / `*.fbcdn.net`, com teste do caso `graph.facebook.com.evil.com`. |
| A refatoração do `baixar` quebrar a mídia do Z-API | A assinatura pública não muda e a regra do Client-Token é preservada; a suíte de `src/tests/whatsapp/` roda na Task 2. |
| URL assinada da Meta responder via redirect (temos `redirect: "error"`) | Se aparecer na prática, a mídia cai em best-effort (mensagem sem anexo, sem quebrar o webhook) e tratamos num hotfix — não vale relaxar o anti-SSRF preventivamente. |
| Mídia grande (> 20 MB) | O teto em streaming corta e devolve `null`; a mensagem entra sem anexo. |
