# WhatsApp oficial — Fatia 2A (inbound: verificação + assinatura + texto/status) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receber mensagens de texto e status de entrega da API oficial (Cloud API) via webhook — com verificação (GET), validação de assinatura (POST) e persistência no mesmo atendimento do Z-API.

**Architecture:** Libs puras (`inbox-oficial.ts`) para assinatura e parsing; rota `/api/webhooks/whatsapp-oficial` com `GET` (handshake) e `POST` (assinatura → parse → persistência **duplicada** do webhook Z-API); config ganha app secret + verify token. Mídia inbound fica para a Fatia 2B. Migration aditiva.

**Tech Stack:** Next.js 16 (route handler, Node runtime) · TypeScript · Supabase · Vitest · `node:crypto`.

## Global Constraints

- **Assinatura sobre o corpo cru:** ler `await req.text()` **antes** do `JSON.parse` (o HMAC é dos bytes exatos). `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256(rawBody, appSecret); comparar timing-safe. Falha → 401.
- **Verificação (GET):** responder `hub.challenge` (texto, 200) só se `hub.mode === "subscribe"` e `hub.verify_token` bate com o configurado; senão 403.
- **Persistência duplicada** (decisão do spec): copiar a lógica do webhook Z-API (casar cliente + inserir `direcao='IN'`/dedup `z_message_id` + reabrir conversa) — **não** refatorar o webhook Z-API.
- **Status só avança** (nunca rebaixa): `ENVIADO → ENTREGUE → LIDO`, atualizando `direcao='OUT'` por `z_message_id`.
- **Responder 200 rápido** em casos ignorados (a Meta re-tenta em não-2xx).
- **Segredos:** app secret cifrado (`cifrarDominio/decifrarDominio("whatsapp", …)`); nunca em log.
- **Migration aditiva/idempotente**, `npm run db:migrate`; próximo número: **`0131`**.
- **Comandos antes de commitar:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`, `npm run build`.
- **Git:** `develop` → PR para `main` com `verify` verde.

**Fatos verificados:**
- Webhook Z-API (molde da persistência): `src/app/api/webhooks/zapi/[secret]/route.ts`.
- `StatusEntrega = "ENVIADO"|"ENTREGUE"|"LIDO"` (`inbox.ts`); `chaveTelefone`, `chaveDeNumeroCompleto` (`mensagem.ts`).
- Config (Sub-projeto 1): `whatsapp_config` tem `provedor`, `oficial_phone_number_id`, `oficial_token_cifrado`. `salvarConfigWhatsapp` (branch oficial) e `carregarConfigWhatsapp` em `configuracoes/whatsapp/actions.ts`; `FormWhatsapp` em `Formularios.tsx`.
- `process.env.NEXT_PUBLIC_SITE_URL` disponível (client-inlined) para exibir a URL do webhook.
- `whatsapp_mensagem`: colunas `cliente_id, telefone, texto, status, direcao, lida, z_message_id`.

---

## File Structure

- `supabase/migrations/0131_whatsapp_oficial_inbound.sql` (Create) — app secret + verify token.
- `src/lib/whatsapp/inbox-oficial.ts` (Create) — `assinaturaOficialOk`, `extrairMensagemOficial`, `extrairStatusOficial`.
- `src/tests/whatsapp/inbox-oficial.test.ts` (Create) — testes puros.
- `src/app/api/webhooks/whatsapp-oficial/route.ts` (Create) — GET + POST.
- `src/app/(app)/configuracoes/whatsapp/actions.ts` (Modify) — gravar/ler app secret + verify token.
- `src/app/(app)/configuracoes/whatsapp/Formularios.tsx` (Modify) — campos + URL do webhook.
- `src/tests/whatsapp/form-whatsapp-render.test.tsx` (Modify) — render dos campos novos.

**Ordem:** migration+libs → rota → config/UI → release.

---

### Task 1: Migration + libs puras (assinatura + parsing)

**Files:**
- Create: `supabase/migrations/0131_whatsapp_oficial_inbound.sql`
- Create: `src/lib/whatsapp/inbox-oficial.ts`
- Test: `src/tests/whatsapp/inbox-oficial.test.ts`

**Interfaces:**
- Produces:
  - `assinaturaOficialOk(rawBody: string, header: string | null, appSecret: string): boolean`
  - `type MidiaOficialRecebida = { tipo: "image" | "audio" | "document"; id: string; mime: string; nome: string | null; caption: string }`
  - `extrairMensagemOficial(payload): { telefone: string; texto: string; wamId: string; midia: MidiaOficialRecebida | null } | null`
  - `extrairStatusOficial(payload): { status: StatusEntrega; ids: string[] } | null`

- [ ] **Step 1: Migration**

```sql
-- supabase/migrations/0131_whatsapp_oficial_inbound.sql
-- WhatsApp oficial Sub-projeto 2: credenciais do webhook de entrada (Cloud API).
alter table whatsapp_config add column if not exists oficial_app_secret_cifrado text;
alter table whatsapp_config add column if not exists oficial_verify_token text;
```

- [ ] **Step 2: Aplicar no dev**

Run: `npm run db:migrate`
Expected: `0131_whatsapp_oficial_inbound` aplicada.

- [ ] **Step 3: Escrever o teste que falha**

```ts
// src/tests/whatsapp/inbox-oficial.test.ts
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { assinaturaOficialOk, extrairMensagemOficial, extrairStatusOficial } from "@/lib/whatsapp/inbox-oficial";

function payloadMsg(msg: Record<string, unknown>) {
  return { entry: [{ changes: [{ value: { messages: [msg] } }] }] };
}
function payloadStatus(statuses: Record<string, unknown>[]) {
  return { entry: [{ changes: [{ value: { statuses } }] }] };
}

describe("assinaturaOficialOk", () => {
  const raw = JSON.stringify({ a: 1 });
  const secret = "sec";
  const assinatura = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");

  it("aceita a assinatura correta", () => {
    expect(assinaturaOficialOk(raw, assinatura, secret)).toBe(true);
  });
  it("rejeita assinatura errada, ausente ou malformada", () => {
    expect(assinaturaOficialOk(raw, "sha256=deadbeef", secret)).toBe(false);
    expect(assinaturaOficialOk(raw, null, secret)).toBe(false);
    expect(assinaturaOficialOk(raw, "md5=x", secret)).toBe(false);
    expect(assinaturaOficialOk(raw + "x", assinatura, secret)).toBe(false);
  });
});

describe("extrairMensagemOficial", () => {
  it("extrai texto (from/id/body)", () => {
    const m = extrairMensagemOficial(
      payloadMsg({ from: "5511999999999", id: "wamid.X", type: "text", text: { body: "oi" } }),
    );
    expect(m).toMatchObject({ telefone: "5511999999999", texto: "oi", wamId: "wamid.X", midia: null });
  });
  it("mídia vira marcador na 2A (midia null)", () => {
    const m = extrairMensagemOficial(
      payloadMsg({ from: "5511", id: "wamid.Y", type: "image", image: { id: "MID", mime_type: "image/png" } }),
    );
    expect(m?.midia).toBeNull();
    expect(m?.texto).toBe("[mídia]");
  });
  it("sem mensagem → null", () => {
    expect(extrairMensagemOficial(payloadStatus([{ id: "x", status: "sent" }]))).toBeNull();
    expect(extrairMensagemOficial({})).toBeNull();
  });
});

describe("extrairStatusOficial", () => {
  it("mapeia sent/delivered/read", () => {
    expect(extrairStatusOficial(payloadStatus([{ id: "a", status: "sent" }]))).toEqual({
      status: "ENVIADO",
      ids: ["a"],
    });
    expect(extrairStatusOficial(payloadStatus([{ id: "b", status: "delivered" }]))?.status).toBe("ENTREGUE");
    expect(extrairStatusOficial(payloadStatus([{ id: "c", status: "read" }]))?.status).toBe("LIDO");
  });
  it("sem statuses → null", () => {
    expect(extrairStatusOficial(payloadMsg({ from: "x", id: "y", type: "text", text: { body: "z" } }))).toBeNull();
  });
});
```

- [ ] **Step 4: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/whatsapp/inbox-oficial.test.ts`
Expected: FAIL — import não resolve.

- [ ] **Step 5: Implementar**

```ts
// src/lib/whatsapp/inbox-oficial.ts
import { createHmac, timingSafeEqual } from "node:crypto";
import type { StatusEntrega } from "./inbox";

export type MidiaOficialRecebida = {
  tipo: "image" | "audio" | "document";
  id: string;
  mime: string;
  nome: string | null;
  caption: string;
};

// Valida a assinatura X-Hub-Signature-256 (HMAC-SHA256 do corpo cru com o app secret). Timing-safe.
export function assinaturaOficialOk(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const esperado = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

function primeiroValue(payload: unknown): Record<string, unknown> | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  const entry = Array.isArray(p.entry) ? (p.entry[0] as Record<string, unknown> | undefined) : undefined;
  const changes = entry && Array.isArray(entry.changes) ? (entry.changes[0] as Record<string, unknown> | undefined) : undefined;
  const value = changes?.value;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

// Extrai a primeira mensagem RECEBIDA do payload da Cloud API. Na Fatia 2A, mídia vira marcador
// "[mídia]" (midia:null) — a Fatia 2B preenche `midia`.
export function extrairMensagemOficial(
  payload: unknown,
): { telefone: string; texto: string; wamId: string; midia: MidiaOficialRecebida | null } | null {
  const value = primeiroValue(payload);
  const msgs = value && Array.isArray(value.messages) ? value.messages : null;
  const m = msgs?.[0] as Record<string, unknown> | undefined;
  if (!m) return null;
  const telefone = typeof m.from === "string" ? m.from : "";
  const wamId = typeof m.id === "string" ? m.id : "";
  if (!telefone || !wamId) return null;
  if (m.type === "text") {
    const body = (m.text as { body?: string } | undefined)?.body ?? "";
    return { telefone, texto: body, wamId, midia: null };
  }
  if (m.type === "image" || m.type === "document" || m.type === "audio") {
    return { telefone, texto: "[mídia]", wamId, midia: null };
  }
  return { telefone, texto: "[mensagem não suportada]", wamId, midia: null };
}

// Extrai o status de entrega (o primeiro tipo mapeável) e os ids afetados.
export function extrairStatusOficial(payload: unknown): { status: StatusEntrega; ids: string[] } | null {
  const value = primeiroValue(payload);
  const statuses = value && Array.isArray(value.statuses) ? value.statuses : null;
  if (!statuses || statuses.length === 0) return null;
  const MAPA: Record<string, StatusEntrega> = { sent: "ENVIADO", delivered: "ENTREGUE", read: "LIDO" };
  for (const kind of ["read", "delivered", "sent"] as const) {
    const ids = statuses
      .filter((s) => (s as Record<string, unknown>).status === kind)
      .map((s) => (s as Record<string, unknown>).id)
      .filter((id): id is string => typeof id === "string");
    if (ids.length) return { status: MAPA[kind], ids };
  }
  return null;
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/whatsapp/inbox-oficial.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0131_whatsapp_oficial_inbound.sql src/lib/whatsapp/inbox-oficial.ts src/tests/whatsapp/inbox-oficial.test.ts
git commit -m "feat(whatsapp): inbound oficial — migration + assinatura/parsing puros"
```

---

### Task 2: Webhook `/api/webhooks/whatsapp-oficial`

**Files:**
- Create: `src/app/api/webhooks/whatsapp-oficial/route.ts`

**Interfaces:**
- Consumes: `assinaturaOficialOk`, `extrairMensagemOficial`, `extrairStatusOficial` (Task 1); `chaveTelefone`, `chaveDeNumeroCompleto`; `decifrarDominio`; `createAdminSupabase`.

Sem teste unitário (route handler + I/O; parsers já testados). Verificação: typecheck/lint/build + smoke.

- [ ] **Step 1: Criar a rota**

```ts
// src/app/api/webhooks/whatsapp-oficial/route.ts
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { decifrarDominio } from "@/lib/cripto/envelope";
import { assinaturaOficialOk, extrairMensagemOficial, extrairStatusOficial } from "@/lib/whatsapp/inbox-oficial";
import { chaveTelefone, chaveDeNumeroCompleto } from "@/lib/whatsapp/mensagem";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Verificação do webhook (Meta chama uma vez ao cadastrar).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const admin = createAdminSupabase();
  const { data } = await admin.from("whatsapp_config").select("oficial_verify_token").eq("id", 1).maybeSingle();
  const esperado = (data?.oficial_verify_token as string | null) ?? null;
  if (mode === "subscribe" && esperado && token === esperado && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  const admin = createAdminSupabase();
  const { data: cfg } = await admin
    .from("whatsapp_config")
    .select("oficial_app_secret_cifrado")
    .eq("id", 1)
    .maybeSingle();
  if (!cfg?.oficial_app_secret_cifrado) return NextResponse.json({ erro: "não configurado" }, { status: 401 });
  let appSecret: string;
  try {
    appSecret = (await decifrarDominio("whatsapp", cfg.oficial_app_secret_cifrado as string)).toString("utf8");
  } catch {
    return NextResponse.json({ erro: "cripto" }, { status: 401 });
  }
  if (!assinaturaOficialOk(raw, req.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Status de entrega: só AVANÇA o estado (nunca rebaixa).
  const ev = extrairStatusOficial(payload);
  if (ev) {
    const anteriores = ev.status === "ENTREGUE" ? ["ENVIADO"] : ev.status === "LIDO" ? ["ENVIADO", "ENTREGUE"] : [];
    if (anteriores.length) {
      await admin
        .from("whatsapp_mensagem")
        .update({ status: ev.status })
        .in("z_message_id", ev.ids)
        .eq("direcao", "OUT")
        .in("status", anteriores);
    }
    return NextResponse.json({ ok: true, status: ev.status });
  }

  const msg = extrairMensagemOficial(payload);
  if (!msg) return NextResponse.json({ ok: true, ignored: true });

  // msg.telefone já vem completo com DDI (Cloud API) — canonicaliza sem colar 55.
  const tel = chaveDeNumeroCompleto(msg.telefone) ?? msg.telefone.replace(/\D/g, "");

  // resolve cliente por telefone (best-effort): só casa se houver EXATAMENTE um.
  const { data: casadosRaw } = await admin.from("clientes").select("id, telefone, telefone_ddi");
  const casados = (casadosRaw ?? []).filter(
    (c) => chaveTelefone((c.telefone as string) ?? "", (c.telefone_ddi as string) ?? "55") === tel,
  );
  const clienteId = casados.length === 1 ? (casados[0]!.id as string) : null;

  const { error } = await admin.from("whatsapp_mensagem").insert({
    cliente_id: clienteId,
    telefone: tel,
    texto: msg.texto,
    status: "RECEBIDO",
    direcao: "IN",
    lida: false,
    z_message_id: msg.wamId,
  });
  if (error && !String(error.message).includes("duplicate")) console.error("webhook oficial:", error.message);
  await admin.from("conversa").update({ status: "aberta" }).eq("telefone", tel).eq("status", "finalizada");
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verificar (typecheck + lint + build)**

Run: `npm run typecheck && npx eslint src/app/api/webhooks/whatsapp-oficial/route.ts && npm run build`
Expected: sem erros; `/api/webhooks/whatsapp-oficial` no output do build.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhooks/whatsapp-oficial/route.ts
git commit -m "feat(whatsapp): webhook oficial (GET verificacao + POST assinatura/texto/status)"
```

---

### Task 3: Config — app secret + verify token na UI

**Files:**
- Modify: `src/app/(app)/configuracoes/whatsapp/actions.ts`
- Modify: `src/app/(app)/configuracoes/whatsapp/Formularios.tsx`
- Modify: `src/tests/whatsapp/form-whatsapp-render.test.tsx`

- [ ] **Step 1: `carregarConfigWhatsapp` — devolver os campos novos**

No `select`, incluir `oficial_app_secret_cifrado, oficial_verify_token`; no retorno, adicionar:

```ts
    oficialAppSecretConfigurado: Boolean(data?.oficial_app_secret_cifrado),
    oficialVerifyToken: (data?.oficial_verify_token as string) ?? "",
```

E no tipo de retorno da função, acrescentar `oficialAppSecretConfigurado: boolean; oficialVerifyToken: string;`.

- [ ] **Step 2: `salvarConfigWhatsapp` — gravar app secret + verify token (branch oficial)**

No ramo `else` (oficial), após gravar phone/token, adicionar:

```ts
      const appSecret = String(fd.get("oficial_app_secret") ?? "").trim();
      const verifyToken = String(fd.get("oficial_verify_token") ?? "").trim();
      patch.oficial_verify_token = verifyToken || null;
      if (appSecret) patch.oficial_app_secret_cifrado = await cifrarDominio("whatsapp", Buffer.from(appSecret, "utf8"));
```

- [ ] **Step 3: `Formularios.tsx` — campos + URL do webhook (bloco oficial)**

Estender as props: `oficialAppSecretConfigurado: boolean; oficialVerifyToken: string;`.

No bloco oficial (`prov === "oficial"`), após o campo do token permanente, adicionar:

```tsx
            <label className="block text-sm">
              <span className="text-cinza">Verify Token (defina um segredo e cole no App da Meta)</span>
              <input
                name="oficial_verify_token"
                defaultValue={oficialVerifyToken}
                className={`${controleCls()} mt-1 w-full`}
              />
            </label>
            <label className="block text-sm">
              <span className="text-cinza">
                App Secret {oficialAppSecretConfigurado && "(configurado — deixe em branco para manter)"}
              </span>
              <input name="oficial_app_secret" type="password" className={`${controleCls()} mt-1 w-full`} />
            </label>
            <p className="rounded border border-linha bg-creme px-3 py-2 text-xs text-cinza">
              URL do webhook (cole no App da Meta):{" "}
              <code className="break-all">
                {(process.env.NEXT_PUBLIC_SITE_URL ?? "") + "/api/webhooks/whatsapp-oficial"}
              </code>
            </p>
```

E na página (`page.tsx`), nenhum ajuste (já espalha `{...cfg}`); confirmar que `carregarConfigWhatsapp` devolve os novos campos.

- [ ] **Step 4: Atualizar o render test da FormWhatsapp**

Em `form-whatsapp-render.test.tsx`, incluir os novos props no render:

```tsx
      <FormWhatsapp
        provedor="oficial"
        instance=""
        zapiConfigurado={false}
        oficialPhoneNumberId=""
        oficialConfigurado={false}
        oficialAppSecretConfigurado={false}
        oficialVerifyToken=""
      />
```

e checar que o bloco oficial mostra os campos:

```tsx
    expect(html).toContain("Verify Token");
    expect(html).toContain("App Secret");
    expect(html).toContain("/api/webhooks/whatsapp-oficial");
```

(O caso Z-API existente também precisa dos dois props novos — adicionar `oficialAppSecretConfigurado={false}` e `oficialVerifyToken=""` nele.)

- [ ] **Step 5: Verificar (typecheck + lint + testes + build)**

Run: `npm run typecheck && npx eslint "src/app/(app)/configuracoes/whatsapp/actions.ts" "src/app/(app)/configuracoes/whatsapp/Formularios.tsx" && npx vitest run src/tests/whatsapp && npm run build`
Expected: sem erros; render test passa.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/configuracoes/whatsapp/actions.ts" "src/app/(app)/configuracoes/whatsapp/Formularios.tsx" src/tests/whatsapp/form-whatsapp-render.test.tsx
git commit -m "feat(whatsapp): config do webhook oficial (app secret + verify token + URL)"
```

---

### Task 4: Release 6.74.0

**Files:**
- Modify: `package.json`, `package-lock.json`, `CHANGELOG.md`

Produção em 6.73.0. **Tem migration** (`0131`, aditiva) — aplicar em produção **antes** do deploy.

- [ ] **Step 1: Barra completa**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check && npm run build`
Expected: verde. (Se `format:check` falhar → `npm run format` e recommitar.)

- [ ] **Step 2: Bump (incluir lockfile)**

Run: `npm version minor --no-git-tag-version`
Expected: `6.74.0`.

- [ ] **Step 3: CHANGELOG (topo, acima de 6.73.0)**

```markdown
## [6.74.0] — 2026-07-22

### Adicionado

- **WhatsApp oficial: recebimento de mensagens (texto) e status.** Novo webhook para a API oficial
  (WhatsApp Cloud API) com verificação e validação de assinatura; mensagens de texto do cliente e os
  status de entrega (enviado/entregue/lido) passam a alimentar o atendimento. Configuração do App
  Secret e do Verify Token em **Configurações → WhatsApp** (provedor oficial). Recebimento de mídia
  vem em seguida. (Migration `0131`.)
```

- [ ] **Step 4: Teste de versão + suíte**

Run: `npx vitest run src/tests/versao.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Commit da release**

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): 6.74.0 — WhatsApp oficial inbound texto/status (Fatia 2A)"
```

- [ ] **Step 6: Finalizar (PR) — com a ordem migração→deploy**

`git push origin develop` → `gh pr create --base main --head develop` → aguardar as **duas** execuções do `verify` → **não** mergear sem autorização. Após merge:
1. `node --env-file=.env.producao.bak scripts/db-migrate.mjs` (aplicar `0131`) — aditiva.
2. Implantar → `/api/health` = `6.74.0` → `npm run release:tag` + push da tag → sincronizar `develop` com `main`.

---

## Self-Review

**1. Cobertura do spec (Fatia 2A):**
- Migration app secret + verify token → Task 1. ✅
- Libs puras (assinatura, parsing texto/status) → Task 1. ✅
- Rota GET (verificação) + POST (assinatura → parse → persistência duplicada + status) → Task 2. ✅
- Config UI (app secret + verify token + URL do webhook) → Task 3. ✅

**2. Placeholders:** nenhum.

**3. Consistência de tipos:** `assinaturaOficialOk`/`extrairMensagemOficial`/`extrairStatusOficial` (Task 1) consumidos igual na rota (Task 2). `carregarConfigWhatsapp` (Task 3) devolve `oficialAppSecretConfigurado`/`oficialVerifyToken` que `FormWhatsapp` recebe por props. `salvarConfigWhatsapp` lê `oficial_app_secret`/`oficial_verify_token` — os mesmos `name=` dos inputs.

**4. Ordem migração×deploy:** o webhook lê `oficial_app_secret_cifrado`/`oficial_verify_token` — colunas precisam existir antes do 6.74.0 subir. Release aplica a migration antes de Implantar. ✅

**Nota de execução:** smoke (fora de produção): cadastrar o webhook no App da Meta com o Verify Token (a Meta chama o GET → 200 com o challenge); enviar uma mensagem de teste ao número → aparece no atendimento. Mídia inbound = Fatia 2B. Não ligar a oficial em produção antes do Sub-projeto 3 (templates).
