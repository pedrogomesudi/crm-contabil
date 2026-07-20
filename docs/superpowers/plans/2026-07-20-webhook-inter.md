# Cadastrar webhook de cobrança no Inter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um botão em Configurações → Boletos que cadastra o webhook de pagamento no Inter (completando a baixa automática), com um status que mostra se já está cadastrado e apontando para o SALDO.

**Architecture:** Adaptador ganha `registrarWebhook`/`consultarWebhook`; veredito calculado por lógica pura (`verdictWebhook`) comparando a URL do Inter com a esperada, sem renderizar segredo/URL. Ações montam a URL server-side a partir de `APP_URL`+`BOLETO_WEBHOOK_SECRET`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, Tailwind 4, vitest + `renderToStaticMarkup`.

## Global Constraints

- Tela de config Boletos: gate `podeGerenciarFinanceiro` (helper `gate()` já existe no arquivo de actions).
- **Nunca renderizar o segredo nem a URL do webhook** — só o veredito (ok/divergente/ausente/indisponivel).
- Endpoint real do Inter (`PUT`/`GET .../cobrancas/webhook`) confirmado no clique em produção; ajusto se divergir.
- Imports `@/*`. Guard `divida-ui`: sem `border` estático em input; sem `←`/`amber-\d`.
- `package.json.version` sobe com o CHANGELOG no mesmo PR; `versao.test.ts` exige que batam. Sem migration.
- Rodar antes de commitar: `npm run lint && npm run typecheck && npm test && npm run format && npm run build`.

---

### Task 1: Lógica pura — veredito e extração

**Files:**
- Create: `src/lib/boleto/webhook.ts`
- Modify: `src/lib/boleto/inter.ts` (adicionar `extrairWebhookUrlInter`)
- Test: `src/tests/boleto/webhook.test.ts`

**Interfaces:**
- Produces:
  - `type StatusWebhook = "ok" | "divergente" | "ausente"`
  - `urlWebhookEsperada(appUrl: string, secret: string): string`
  - `verdictWebhook(registrada: string | null, esperada: string): StatusWebhook`
  - `extrairWebhookUrlInter(resp: Record<string, unknown>): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/boleto/webhook.test.ts
import { describe, it, expect } from "vitest";
import { urlWebhookEsperada, verdictWebhook } from "@/lib/boleto/webhook";
import { extrairWebhookUrlInter } from "@/lib/boleto/inter";

describe("urlWebhookEsperada", () => {
  it("monta a URL e remove barra final do appUrl", () => {
    expect(urlWebhookEsperada("https://app.seusaldo.ai/", "abc")).toBe(
      "https://app.seusaldo.ai/api/webhooks/boleto/abc",
    );
  });
});

describe("verdictWebhook", () => {
  const esperada = "https://app.seusaldo.ai/api/webhooks/boleto/abc";
  it("ausente quando nada cadastrado", () => {
    expect(verdictWebhook(null, esperada)).toBe("ausente");
    expect(verdictWebhook("", esperada)).toBe("ausente");
  });
  it("ok quando bate", () => {
    expect(verdictWebhook(esperada, esperada)).toBe("ok");
  });
  it("divergente quando aponta para outro lugar", () => {
    expect(verdictWebhook("https://outro/hook", esperada)).toBe("divergente");
  });
});

describe("extrairWebhookUrlInter", () => {
  it("lê webhookUrl", () => {
    expect(extrairWebhookUrlInter({ webhookUrl: "https://x/y" })).toBe("https://x/y");
  });
  it("null quando ausente/vazio", () => {
    expect(extrairWebhookUrlInter({})).toBeNull();
    expect(extrairWebhookUrlInter({ webhookUrl: "" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/boleto/webhook.test.ts`
Expected: FAIL (módulos/funções não existem).

- [ ] **Step 3: Implement**

`src/lib/boleto/webhook.ts`:

```ts
export type StatusWebhook = "ok" | "divergente" | "ausente";

export function urlWebhookEsperada(appUrl: string, secret: string): string {
  const base = appUrl.replace(/\/+$/, "");
  return `${base}/api/webhooks/boleto/${secret}`;
}

export function verdictWebhook(registrada: string | null, esperada: string): StatusWebhook {
  if (!registrada) return "ausente";
  return registrada === esperada ? "ok" : "divergente";
}
```

Em `src/lib/boleto/inter.ts`, após `extrairPdfBase64Inter`:

```ts
export function extrairWebhookUrlInter(resp: Record<string, unknown>): string | null {
  const u = resp.webhookUrl;
  return typeof u === "string" && u.length > 0 ? u : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/boleto/webhook.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/boleto/webhook.ts src/lib/boleto/inter.ts src/tests/boleto/webhook.test.ts
git commit -m "feat(webhook): lógica pura de veredito e extração"
```

---

### Task 2: Adaptador — `registrarWebhook` e `consultarWebhook`

**Files:**
- Modify: `src/lib/boleto/tipos.ts` (interface)
- Modify: `src/lib/boleto/inter.ts` (métodos no adaptador)

**Interfaces:**
- Consumes: `extrairWebhookUrlInter` (Task 1); `req`/`obterToken` internos.
- Produces: `ProvedorBoleto.registrarWebhook?(url): Promise<void>` e `consultarWebhook?(): Promise<string | null>`.

- [ ] **Step 1: Add to the interface**

Em `src/lib/boleto/tipos.ts`, `ProvedorBoleto`:

```ts
  registrarWebhook?(url: string): Promise<void>;
  consultarWebhook?(): Promise<string | null>;
```

- [ ] **Step 2: Implement no adaptador do Inter**

Em `src/lib/boleto/inter.ts`, no objeto retornado por `criarAdaptadorInter` (junto de `pdf`):

```ts
    async registrarWebhook(url: string): Promise<void> {
      const tk = await obterToken();
      await req("PUT", "/cobrancas/webhook", tk, { webhookUrl: url });
    },
    async consultarWebhook(): Promise<string | null> {
      const tk = await obterToken();
      const j = await req("GET", "/cobrancas/webhook", tk);
      return extrairWebhookUrlInter(j);
    },
```

> Nota: `req` já cobre GET/POST; PUT segue o mesmo caminho (method genérico). Se o Inter usar outro path
> (ex.: `/webhook` sem `/cobrancas`) ou outro corpo, ajusto após o teste real (Task 4, validação em prod).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sem erros (métodos opcionais; Asaas não implementa).

- [ ] **Step 4: Commit**

```bash
git add src/lib/boleto/tipos.ts src/lib/boleto/inter.ts
git commit -m "feat(webhook): registrarWebhook/consultarWebhook no adaptador do Inter"
```

---

### Task 3: Ações `cadastrarWebhookInter` e `statusWebhookInter`

**Files:**
- Modify: `src/app/(app)/configuracoes/boletos/actions.ts`

**Interfaces:**
- Consumes: `gate()` (já no arquivo); `adaptadorAtivo`; `urlWebhookEsperada`, `verdictWebhook`, `type StatusWebhook`.
- Produces:
  - `cadastrarWebhookInter(): Promise<{ ok?: true; erro?: string }>`
  - `statusWebhookInter(): Promise<StatusWebhook | "indisponivel">`

- [ ] **Step 1: Add imports**

Em `src/app/(app)/configuracoes/boletos/actions.ts`:

```ts
import { adaptadorAtivo } from "@/lib/boleto/ativo";
import { urlWebhookEsperada, verdictWebhook, type StatusWebhook } from "@/lib/boleto/webhook";
```

- [ ] **Step 2: Add the actions**

```ts
export async function cadastrarWebhookInter(): Promise<{ ok?: true; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const appUrl = process.env.APP_URL ?? "";
  const secret = process.env.BOLETO_WEBHOOK_SECRET ?? "";
  if (!appUrl || !secret) return { erro: "APP_URL ou BOLETO_WEBHOOK_SECRET não configurados." };
  const ativo = await adaptadorAtivo();
  if ("erro" in ativo) return { erro: ativo.erro };
  if (ativo.provedor !== "inter" || typeof ativo.adaptador.registrarWebhook !== "function")
    return { erro: "Cadastro de webhook disponível apenas para o Banco Inter." };
  try {
    await ativo.adaptador.registrarWebhook(urlWebhookEsperada(appUrl, secret));
  } catch (e) {
    return { erro: `Falha ao cadastrar no Inter: ${(e as Error).message}` };
  }
  revalidatePath("/configuracoes/boletos");
  return { ok: true };
}

export async function statusWebhookInter(): Promise<StatusWebhook | "indisponivel"> {
  if (!(await gate())) return "indisponivel";
  const appUrl = process.env.APP_URL ?? "";
  const secret = process.env.BOLETO_WEBHOOK_SECRET ?? "";
  if (!appUrl || !secret) return "indisponivel";
  const ativo = await adaptadorAtivo();
  if ("erro" in ativo || ativo.provedor !== "inter" || typeof ativo.adaptador.consultarWebhook !== "function")
    return "indisponivel";
  try {
    const registrada = await ativo.adaptador.consultarWebhook();
    return verdictWebhook(registrada, urlWebhookEsperada(appUrl, secret));
  } catch {
    return "indisponivel";
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/configuracoes/boletos/actions.ts"
git commit -m "feat(webhook): ações cadastrar e status do webhook do Inter"
```

---

### Task 4: UI — status + botão no painel

**Files:**
- Create: `src/app/(app)/configuracoes/boletos/BotaoWebhook.tsx`
- Modify: `src/app/(app)/configuracoes/boletos/PainelProntidao.tsx`
- Modify: `src/app/(app)/configuracoes/boletos/page.tsx`
- Test: `src/tests/boleto/painel-webhook-render.test.tsx`

**Interfaces:**
- Consumes: `cadastrarWebhookInter`, `statusWebhookInter`, `type StatusWebhook`.
- Produces: `PainelProntidao` ganha o prop `statusWebhook: StatusWebhook | "indisponivel"`; `BotaoWebhook` client component.

- [ ] **Step 1: Write the client button**

```tsx
// src/app/(app)/configuracoes/boletos/BotaoWebhook.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { cadastrarWebhookInter } from "./actions";

export function BotaoWebhook() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function cadastrar() {
    setMsg("");
    setBusy(true);
    const r = await cadastrarWebhookInter();
    setBusy(false);
    setMsg(r.ok ? "Webhook cadastrado no Inter." : (r.erro ?? "Erro"));
    if (r.ok) router.refresh();
  }
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={cadastrar}
        className="rounded-lg border border-linha px-3 py-1 text-sm text-cinza hover:bg-creme disabled:opacity-60"
      >
        Cadastrar webhook no Inter
      </button>
      {msg && <span className="text-xs text-cinza">{msg}</span>}
    </span>
  );
}
```

- [ ] **Step 2: Add the status line + button to the panel**

Em `src/app/(app)/configuracoes/boletos/PainelProntidao.tsx`:

(a) imports + prop:

```tsx
import { BotaoWebhook } from "./BotaoWebhook";
import type { StatusWebhook } from "@/lib/boleto/webhook";
```

Estender a assinatura para receber `statusWebhook: StatusWebhook | "indisponivel"`.

(b) dentro do bloco `config.provedor !== "nenhum"` (onde já mostra a URL template), adicionar a linha de status e o botão:

```tsx
      {config.provedor === "inter" && (
        <div className="space-y-2 border-t border-linha pt-3 text-xs">
          <p>
            {statusWebhook === "ok"
              ? "✓ Webhook cadastrado no Inter (aponta para o SALDO)."
              : statusWebhook === "divergente"
                ? "⚠ Um webhook diferente está cadastrado no Inter."
                : statusWebhook === "ausente"
                  ? "✗ Webhook não cadastrado no Inter — a baixa automática não vai disparar."
                  : "Status do webhook indisponível."}
          </p>
          <BotaoWebhook />
        </div>
      )}
```

- [ ] **Step 3: Wire the page**

Em `src/app/(app)/configuracoes/boletos/page.tsx`: importar `statusWebhookInter`, chamá-la e passar ao painel.

```tsx
import { obterConfigBoleto, statusWebhookInter } from "./actions";
```

Antes do `return`:

```tsx
  const statusWebhook = await statusWebhookInter();
```

E no JSX do painel, acrescentar o prop:

```tsx
      <PainelProntidao
        config={config}
        webhookSecretDefinido={webhookSecretDefinido}
        appUrl={appUrl}
        statusWebhook={statusWebhook}
      />
```

- [ ] **Step 4: Write the render test**

```tsx
// src/tests/boleto/painel-webhook-render.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PainelProntidao } from "@/app/(app)/configuracoes/boletos/PainelProntidao";
import type { ConfigBoletoView } from "@/lib/boleto/config";

const cfg: ConfigBoletoView = {
  provedor: "inter",
  asaasAmbiente: "producao",
  interContaCorrente: "123",
  contaBancariaId: "c1",
  asaasApiKeyDefinida: false,
  interClientIdDefinido: true,
  interClientSecretDefinido: true,
  interCertDefinido: true,
  interKeyDefinida: true,
};

describe("PainelProntidao — webhook", () => {
  it("ausente => aviso de não cadastrado + botão", () => {
    const html = renderToStaticMarkup(
      <PainelProntidao config={cfg} webhookSecretDefinido appUrl="https://app.seusaldo.ai" statusWebhook="ausente" />,
    );
    expect(html).toContain("não cadastrado");
    expect(html).toContain("Cadastrar webhook no Inter");
  });
  it("ok => confirma cadastrado", () => {
    const html = renderToStaticMarkup(
      <PainelProntidao config={cfg} webhookSecretDefinido appUrl="https://app.seusaldo.ai" statusWebhook="ok" />,
    );
    expect(html).toContain("cadastrado no Inter");
  });
});
```

- [ ] **Step 5: Run the render test**

Run: `npx vitest run src/tests/boleto/painel-webhook-render.test.tsx`
Expected: PASS. `BotaoWebhook` usa `useRouter` — o teste renderiza o `PainelProntidao` (server component) que inclui o `BotaoWebhook`; se o `renderToStaticMarkup` reclamar do `useRouter`, adicionar no topo do teste `vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }))`.

- [ ] **Step 6: Full gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tudo verde.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/configuracoes/boletos/BotaoWebhook.tsx" "src/app/(app)/configuracoes/boletos/PainelProntidao.tsx" "src/app/(app)/configuracoes/boletos/page.tsx" src/tests/boleto/painel-webhook-render.test.tsx
git commit -m "feat(webhook): status e botão de cadastro do webhook na tela Boletos"
```

---

## Self-Review

**1. Spec coverage:**
- Adaptador `registrarWebhook`/`consultarWebhook` + `extrairWebhookUrlInter` → Tasks 1, 2. ✅
- Lógica pura do veredito (sem renderizar segredo/URL) → Task 1. ✅
- Ações `cadastrarWebhookInter` (URL montada server-side) + `statusWebhookInter` → Task 3. ✅
- Status (ok/divergente/ausente/indisponivel) + botão no painel → Task 4. ✅
- Só Inter; sem migration → coberto. ✅

**2. Placeholder scan:** Nenhum TBD/TODO; todo passo com código. A incerteza do endpoint é passo de validação em prod, não placeholder. ✅

**3. Type consistency:** `StatusWebhook` definido em Task 1, usado nas ações (Task 3) e no painel (Task 4). `urlWebhookEsperada(appUrl, secret)` e `verdictWebhook(registrada, esperada)` idênticos entre ação e testes. `PainelProntidao` ganha `statusWebhook` e a page passa `statusWebhookInter()`. Métodos do adaptador opcionais, checados com `typeof === "function"`. ✅
