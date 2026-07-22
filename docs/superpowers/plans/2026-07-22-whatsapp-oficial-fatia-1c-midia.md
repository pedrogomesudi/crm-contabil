# WhatsApp oficial — Fatia 1C (mídia pela API oficial) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar o adaptador oficial com **envio de mídia** (imagem/documento) via Cloud API — fechando o Sub-projeto 1: o provedor oficial passa a cobrir texto + mídia + status.

**Architecture:** Na Cloud API, enviar mídia é um fluxo de **2 passos**: (1) **upload** do arquivo (`POST /{phone_number_id}/media`, multipart) → devolve um `media id`; (2) **envio** da mensagem referenciando o `id` (`POST /{phone_number_id}/messages`, `type: image|document`). A parte pura é o builder do passo 2 (`montarEnvioMidiaOficial`); o upload é I/O. Substitui o stub atual de `enviarMidia` no `oficial.ts`. Sem migration.

**Tech Stack:** Next.js 16 (Node runtime) · TypeScript · Vitest.

## Global Constraints

- **Fluxo 2 passos:** upload (multipart, `Authorization: Bearer`, campos `messaging_product=whatsapp`, `type=<mime>`, `file=<bytes>`) → `{ id }`; depois envio referenciando o `id`.
- **Corpo do envio:** `image` → `{ type:"image", image:{ id, caption } }`; `document` → `{ type:"document", document:{ id, caption, filename } }`.
- **Best-effort:** `enviarMidia` **nunca lança**; mapeia falhas de upload/envio para `{ ok:false, erro }`. Timeouts: upload 30s (arquivo maior), envio 15s.
- **Sem segredo em log.** Sem migration.
- **Comandos antes de commitar:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`, `npm run build`.
- **Git:** `develop` → PR para `main` com `verify` verde.

**Fatos verificados:**
- `oficial.ts` (Fatia 1B) tem `OficialConfig`, `baseUrl(cfg)`, `montarEnvioTextoOficial`, `criarAdaptadorOficial`; hoje `enviarMidia` é um stub que devolve erro "ainda não disponível".
- `MidiaEnvio = { tipo:"image"|"document"; base64; mime; nome; caption }` (em `tipos.ts`).
- Node runtime tem `FormData`/`Blob` globais; `Buffer.from(base64,"base64")` para os bytes.
- O teste `src/tests/whatsapp/oficial.test.ts` tem um caso que assere `enviarMidia` retornando `ok:false` ("ainda não disponível") — será atualizado.

---

## File Structure

- `src/lib/whatsapp/oficial.ts` (Modify) — `montarEnvioMidiaOficial` + `enviarMidia` real (2 passos).
- `src/tests/whatsapp/oficial.test.ts` (Modify) — teste do builder de mídia + fluxo mockado; remover o caso "não disponível".

---

### Task 1: Envio de mídia oficial (upload + send)

**Files:**
- Modify: `src/lib/whatsapp/oficial.ts`
- Modify: `src/tests/whatsapp/oficial.test.ts`

**Interfaces:**
- Produces: `montarEnvioMidiaOficial(cfg: OficialConfig, telefone: string, mediaId: string, midia: MidiaEnvio): { url; headers; body }` (puro); `enviarMidia` do adaptador oficial passa a fazer o fluxo de 2 passos.

- [ ] **Step 1: Atualizar o teste (builder + fluxo mockado; remove o "não disponível")**

Em `src/tests/whatsapp/oficial.test.ts`, trocar o `import` para incluir `montarEnvioMidiaOficial`:

```ts
import { montarEnvioTextoOficial, montarEnvioMidiaOficial, criarAdaptadorOficial } from "@/lib/whatsapp/oficial";
```

Substituir o caso `it("satisfaz a interface; enviarMidia ainda não disponível", …)` por:

```ts
  it("satisfaz a interface", () => {
    const a = criarAdaptadorOficial(CFG);
    expect(typeof a.enviarTexto).toBe("function");
    expect(typeof a.enviarMidia).toBe("function");
    expect(typeof a.statusConexao).toBe("function");
  });

  it("montarEnvioMidiaOficial: image e document referenciam o media id", () => {
    const img = montarEnvioMidiaOficial(CFG, "5511", "MID", {
      tipo: "image",
      base64: "",
      mime: "image/png",
      nome: "f.png",
      caption: "leg",
    });
    const bImg = JSON.parse(img.body);
    expect(bImg).toMatchObject({ messaging_product: "whatsapp", to: "5511", type: "image" });
    expect(bImg.image).toMatchObject({ id: "MID", caption: "leg" });

    const doc = montarEnvioMidiaOficial(CFG, "5511", "MID2", {
      tipo: "document",
      base64: "",
      mime: "application/pdf",
      nome: "nota.pdf",
      caption: "leg",
    });
    const bDoc = JSON.parse(doc.body);
    expect(bDoc.type).toBe("document");
    expect(bDoc.document).toMatchObject({ id: "MID2", filename: "nota.pdf", caption: "leg" });
  });

  it("enviarMidia: upload → media id → envio (200 = ok)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "MID" }), { status: 200 })) // upload
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "wamid" }] }), { status: 200 })); // envio
    const r = await criarAdaptadorOficial(CFG).enviarMidia("5511", {
      tipo: "document",
      base64: Buffer.from("pdf").toString("base64"),
      mime: "application/pdf",
      nome: "x.pdf",
      caption: "",
    });
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0]![0]).toContain("/123456/media");
    expect(fetchMock.mock.calls[1]![0]).toContain("/123456/messages");
    fetchMock.mockRestore();
  });

  it("enviarMidia: upload falha → erro (não tenta enviar)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: {} }), { status: 401 }));
    const r = await criarAdaptadorOficial(CFG).enviarMidia("5511", {
      tipo: "image",
      base64: Buffer.from("x").toString("base64"),
      mime: "image/png",
      nome: "f.png",
      caption: "",
    });
    expect(r.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/whatsapp/oficial.test.ts`
Expected: FAIL — `montarEnvioMidiaOficial` não existe / `enviarMidia` ainda é stub.

- [ ] **Step 3: Implementar no `oficial.ts`**

Adicionar o import do tipo no topo (junto do import existente):

```ts
import type { MidiaEnvio, ProvedorWhatsapp } from "./tipos";
```

Adicionar o builder puro (após `montarEnvioTextoOficial`):

```ts
// Monta o envio de mídia da Cloud API referenciando um media id já enviado (puro, testável).
export function montarEnvioMidiaOficial(
  cfg: OficialConfig,
  telefone: string,
  mediaId: string,
  midia: MidiaEnvio,
): { url: string; headers: Record<string, string>; body: string } {
  const conteudo =
    midia.tipo === "image"
      ? { image: { id: mediaId, caption: midia.caption } }
      : { document: { id: mediaId, caption: midia.caption, filename: midia.nome } };
  return {
    url: `${baseUrl(cfg)}/${cfg.phoneNumberId}/messages`,
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: telefone, type: midia.tipo, ...conteudo }),
  };
}
```

Substituir o stub `enviarMidia: async () => ({ ok:false, erro: "…em breve…" })` por:

```ts
    enviarMidia: async (telefone, midia) => {
      try {
        // 1) Upload do arquivo → media id.
        const bytes = new Uint8Array(Buffer.from(midia.base64, "base64"));
        const form = new FormData();
        form.append("messaging_product", "whatsapp");
        form.append("type", midia.mime);
        form.append("file", new Blob([bytes], { type: midia.mime }), midia.nome);
        const up = await fetch(`${baseUrl(cfg)}/${cfg.phoneNumberId}/media`, {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.token}` },
          body: form,
          signal: AbortSignal.timeout(30000),
        });
        const upBody = (await up.json().catch(() => null)) as { id?: string } | null;
        if (!up.ok || !upBody?.id) {
          return { ok: false, erro: `WhatsApp oficial HTTP ${up.status} (upload)`, resposta: upBody };
        }
        // 2) Envio referenciando o media id.
        const req = montarEnvioMidiaOficial(cfg, telefone, upBody.id, midia);
        const res = await fetch(req.url, {
          method: "POST",
          headers: req.headers,
          body: req.body,
          signal: AbortSignal.timeout(15000),
        });
        const corpo = await res.json().catch(() => null);
        if (!res.ok) return { ok: false, erro: `WhatsApp oficial HTTP ${res.status}`, resposta: corpo };
        return { ok: true, resposta: corpo };
      } catch (e) {
        return {
          ok: false,
          erro: e instanceof Error && e.name === "TimeoutError" ? "Tempo esgotado." : "Erro de rede.",
        };
      }
    },
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/whatsapp/oficial.test.ts && npx vitest run src/tests/whatsapp`
Expected: PASS (novo caso de mídia + suíte whatsapp intacta).

- [ ] **Step 5: Verificar (typecheck + lint + build)**

Run: `npm run typecheck && npx eslint src/lib/whatsapp/oficial.ts && npm run build`
Expected: sem erros. (Se o typecheck reclamar de `Blob([bytes])`, o `new Uint8Array(...)` já normaliza o `BlobPart`.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp/oficial.ts src/tests/whatsapp/oficial.test.ts
git commit -m "feat(whatsapp): envio de midia pela API oficial (upload + send)"
```

---

### Task 2: Release 6.73.0

**Files:**
- Modify: `package.json`, `package-lock.json`, `CHANGELOG.md`

Produção em 6.72.0. **Sem migration.**

- [ ] **Step 1: Barra completa**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check && npm run build`
Expected: verde. (Se `format:check` falhar → `npm run format` e recommitar.)

- [ ] **Step 2: Bump (incluir lockfile)**

Run: `npm version minor --no-git-tag-version`
Expected: `6.73.0`.

- [ ] **Step 3: CHANGELOG (topo, acima de 6.72.0)**

```markdown
## [6.73.0] — 2026-07-22

### Adicionado

- **WhatsApp oficial: envio de mídia.** O provedor oficial (WhatsApp Cloud API) passou a enviar
  imagens e documentos (ex.: NFS-e em PDF), completando texto + mídia + status. Com isto, o provedor
  oficial cobre os mesmos envios da Z-API dentro da janela de 24h (proativos ainda dependem de
  templates — em breve).
```

- [ ] **Step 4: Teste de versão + suíte**

Run: `npx vitest run src/tests/versao.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Commit da release**

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): 6.73.0 — WhatsApp oficial envia midia (Fatia 1C)"
```

- [ ] **Step 6: Finalizar (PR)**

`git push origin develop` → `gh pr create --base main --head develop` → aguardar as **duas** execuções do `verify` → **não** mergear sem autorização. Após merge: sem migration → Implantar → `/api/health` = `6.73.0` → `npm run release:tag` + push da tag → sincronizar `develop` com `main`.

---

## Self-Review

**1. Cobertura do spec (Fatia 1C):**
- Envio de mídia pela oficial (upload de media IDs) → Task 1. ✅
- Builder puro testável (`montarEnvioMidiaOficial`) + fluxo mockado → Task 1. ✅
- Fecha o Sub-projeto 1 (oficial cobre texto + mídia + status) → CHANGELOG. ✅

**2. Placeholders:** nenhum.

**3. Consistência de tipos:** `montarEnvioMidiaOficial(cfg, telefone, mediaId, midia)` e `enviarMidia(telefone, midia)` usam `MidiaEnvio` e `OficialConfig` já definidos. `enviarMidia` continua satisfazendo `ProvedorWhatsapp` (mesma assinatura), então os chamadores (nfse/atendimento) funcionam com o provedor oficial sem mudança.

**Nota de execução:** smoke (com credenciais oficiais, fora de produção): configurar a oficial e enviar uma NFS-e/imagem por um número dentro da janela de 24h — conferir upload + envio. Continua valendo: **não ligar a oficial em produção** antes dos Sub-projetos 2 (inbound) e 3 (templates).
