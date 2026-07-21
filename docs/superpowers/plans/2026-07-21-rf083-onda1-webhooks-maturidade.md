# RF-083 Onda 1 — Maturidade de webhooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Envelope de webhook com id/timestamp para dedup + headers, evento de teste imediato e log de entregas com reenvio na UI, e `GET /api/v1/eventos`.

**Architecture:** Extrai `enviarWebhook` (fetch+timeout+assinatura+headers) para uma lib compartilhada por `drenar` e pelo teste; o corpo enviado vira o envelope `{ id, evento, criado_em, dados }`. Novas actions expõem `webhook_entrega` (log) e o teste. Rota autenticada lista os tipos de evento.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (service_role), Vitest.

## Global Constraints

- Alias `@/*` → `./src/*`. **Onda 1** de 2 do RF-083 (spec `docs/superpowers/specs/2026-07-21-automacao-integracao-design.md`); reusa a base do RF-080.
- **Sem migration** — `webhook_entrega.id`/`criado_em` já existem.
- HMAC (`X-Assinatura`) assina o **corpo final** (envelope). Retry reenvia o **mesmo `id`** (dedup); `X-Webhook-Tentativa` incrementa.
- `enviarTeste` faz `POST` **imediato** (não passa pela outbox). Gate admin nas actions.
- Guard `divida-ui` (input à mão usa `controleCls`; sem `←`; sem `amber-\d`).
- Rodar `npm run lint/typecheck/test/format`; `git add -A` **depois** do `format`.

---

### Task 1: Lib `enviar.ts` (envelope + headers + envio) + testes

**Files:**
- Create: `src/lib/webhooks/enviar.ts`
- Test: `src/tests/webhooks/enviar.test.ts`

**Interfaces:**
- Produces: `type Envelope = { id: string; evento: string; criado_em: string; dados: unknown }`; `montarEnvelope(e)`; `montarCabecalhos(corpo, secret, env, tentativa)`; `enviarWebhook(url, secret, env, tentativa): Promise<{ ok; status?; erro? }>`.

- [ ] **Step 1: Testes que falham**

```ts
// src/tests/webhooks/enviar.test.ts
import { describe, it, expect } from "vitest";
import { montarEnvelope, montarCabecalhos } from "@/lib/webhooks/enviar";
import { assinar } from "@/lib/webhooks/sinal";

describe("montarEnvelope", () => {
  it("extrai id/evento/criado_em/dados da linha da outbox", () => {
    const env = montarEnvelope({
      id: "e1",
      evento: "titulo.pago",
      criado_em: "2026-07-21T10:00:00Z",
      payload: { evento: "titulo.pago", dados: { valor: 10 } },
    });
    expect(env).toEqual({ id: "e1", evento: "titulo.pago", criado_em: "2026-07-21T10:00:00Z", dados: { valor: 10 } });
  });
});

describe("montarCabecalhos", () => {
  it("inclui id/timestamp/tentativa e assinatura do corpo", () => {
    const env = { id: "e1", evento: "titulo.pago", criado_em: "2026-07-21T10:00:00Z", dados: {} };
    const corpo = JSON.stringify(env);
    const h = montarCabecalhos(corpo, "segredo", env, 2);
    expect(h["X-Webhook-Id"]).toBe("e1");
    expect(h["X-Webhook-Timestamp"]).toBe("2026-07-21T10:00:00Z");
    expect(h["X-Webhook-Tentativa"]).toBe("2");
    expect(h["X-Assinatura"]).toBe(`sha256=${assinar("segredo", corpo)}`);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/tests/webhooks/enviar.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/lib/webhooks/enviar.ts
import { assinar } from "./sinal";

export type Envelope = { id: string; evento: string; criado_em: string; dados: unknown };

export function montarEnvelope(e: { id: string; evento: string; criado_em: string; payload: unknown }): Envelope {
  const p = (e.payload ?? {}) as { dados?: unknown };
  return { id: e.id, evento: e.evento, criado_em: e.criado_em, dados: p.dados ?? null };
}

export function montarCabecalhos(
  corpo: string,
  secret: string,
  env: Envelope,
  tentativa: number,
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Assinatura": `sha256=${assinar(secret, corpo)}`,
    "X-Webhook-Id": env.id,
    "X-Webhook-Timestamp": env.criado_em,
    "X-Webhook-Tentativa": String(tentativa),
  };
}

const comTimeout = async <T>(fn: (s: AbortSignal) => Promise<T>): Promise<T> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
};

export async function enviarWebhook(
  url: string,
  secret: string,
  env: Envelope,
  tentativa: number,
): Promise<{ ok: boolean; status?: number; erro?: string }> {
  const corpo = JSON.stringify(env);
  try {
    return await comTimeout(async (signal) => {
      const res = await fetch(url, {
        method: "POST",
        headers: montarCabecalhos(corpo, secret, env, tentativa),
        body: corpo,
        signal,
      });
      return { ok: res.ok, status: res.status };
    });
  } catch (e) {
    return { ok: false, erro: e instanceof Error && e.name === "AbortError" ? "Tempo esgotado." : "Erro de rede." };
  }
}
```

- [ ] **Step 4: Passar** — `npx vitest run src/tests/webhooks/enviar.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf083): lib enviar.ts (envelope + headers + envio) + testes"
```

---

### Task 2: Refatorar `drenar.ts` para o envelope + headers

**Files:**
- Modify: `src/lib/webhooks/drenar.ts`

- [ ] **Step 1: Usar `enviarWebhook`/`montarEnvelope`**

Trocar o import e o corpo do laço: remover o `comTimeout` local e o `assinar` local; importar `enviarWebhook, montarEnvelope` de `./enviar` e `proximoRetry` de `./sinal`. A seleção passa a incluir `criado_em`:

```ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { proximoRetry } from "./sinal";
import { enviarWebhook, montarEnvelope } from "./enviar";

const MAX_TENTATIVAS = 4;

export async function drenarWebhooks(): Promise<{ entregues: number; falhas: number }> {
  const admin = createAdminSupabase();
  const agora = new Date().toISOString();
  const { data: fila } = await admin
    .from("webhook_entrega")
    .select("id, evento, criado_em, payload, tentativas, webhook_endpoint(url, secret, ativo)")
    .eq("status", "pendente")
    .lte("proximo_retry", agora)
    .limit(50);

  let entregues = 0;
  let falhas = 0;
  for (const e of fila ?? []) {
    const ep = (Array.isArray(e.webhook_endpoint) ? e.webhook_endpoint[0] : e.webhook_endpoint) as {
      url: string;
      secret: string;
      ativo: boolean;
    } | null;
    if (!ep || !ep.ativo) {
      await admin.from("webhook_entrega").update({ status: "falhou" }).eq("id", e.id);
      continue;
    }
    const tentativa = (e.tentativas as number) + 1;
    const env = montarEnvelope({
      id: e.id as string,
      evento: e.evento as string,
      criado_em: e.criado_em as string,
      payload: e.payload,
    });
    const r = await enviarWebhook(ep.url, ep.secret, env, tentativa);
    if (r.ok) {
      await admin.from("webhook_entrega").update({ status: "ok" }).eq("id", e.id);
      entregues += 1;
    } else {
      const falhou = tentativa >= MAX_TENTATIVAS;
      await admin
        .from("webhook_entrega")
        .update({
          tentativas: tentativa,
          status: falhou ? "falhou" : "pendente",
          proximo_retry: new Date(Date.now() + proximoRetry(tentativa) * 1000).toISOString(),
        })
        .eq("id", e.id);
      falhas += 1;
    }
  }
  return { entregues, falhas };
}
```

- [ ] **Step 2: Verificar + suite** — `npm run typecheck && npm run lint && npm test`.

- [ ] **Step 3: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf083): drenar envia envelope {id,evento,criado_em,dados} + headers de dedup"
```

---

### Task 3: Actions de teste + log + reenvio

**Files:**
- Modify: `src/app/(app)/configuracoes/webhooks/actions.ts`

**Interfaces:**
- Produces: `enviarTeste(endpointId): Promise<{ ok?: boolean; status?: number; erro?: string }>`; `type EntregaView`; `listarEntregas(): Promise<EntregaView[]>`; `reenviarEntrega(id): Promise<{ ok?: boolean; erro?: string }>`.

- [ ] **Step 1: Adicionar as actions**

Acrescentar a `src/app/(app)/configuracoes/webhooks/actions.ts` (reusa `admOk`, `createAdminSupabase`):

```ts
import { randomUUID } from "node:crypto";
import { enviarWebhook } from "@/lib/webhooks/enviar";

export async function enviarTeste(endpointId: string): Promise<{ ok?: boolean; status?: number; erro?: string }> {
  if (!(await admOk())) return { erro: "Sem permissão." };
  const admin = createAdminSupabase();
  const { data: ep } = await admin.from("webhook_endpoint").select("url, secret").eq("id", endpointId).maybeSingle();
  if (!ep) return { erro: "Endpoint não encontrado." };
  const env = {
    id: randomUUID(),
    evento: "webhook.teste",
    criado_em: new Date().toISOString(),
    dados: { mensagem: "Evento de teste do SALDO" },
  };
  const r = await enviarWebhook(ep.url as string, ep.secret as string, env, 1);
  return r.ok ? { ok: true, status: r.status } : { erro: r.erro ?? `Falhou (HTTP ${r.status ?? "?"})` };
}

export type EntregaView = {
  id: string;
  url: string;
  evento: string;
  status: string;
  tentativas: number;
  proximoRetry: string;
  criadoEm: string;
};

export async function listarEntregas(): Promise<EntregaView[]> {
  if (!(await admOk())) return [];
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("webhook_entrega")
    .select("id, evento, status, tentativas, proximo_retry, criado_em, webhook_endpoint(url)")
    .order("criado_em", { ascending: false })
    .limit(100);
  return (data ?? []).map((e) => {
    const ep = (Array.isArray(e.webhook_endpoint) ? e.webhook_endpoint[0] : e.webhook_endpoint) as {
      url: string;
    } | null;
    return {
      id: e.id as string,
      url: ep?.url ?? "—",
      evento: e.evento as string,
      status: e.status as string,
      tentativas: (e.tentativas as number) ?? 0,
      proximoRetry: (e.proximo_retry as string) ?? "",
      criadoEm: (e.criado_em as string) ?? "",
    };
  });
}

export async function reenviarEntrega(id: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await admOk())) return { erro: "Sem permissão." };
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("webhook_entrega")
    .update({ status: "pendente", proximo_retry: new Date().toISOString() })
    .eq("id", id);
  if (error) return { erro: "Falha ao reenviar." };
  revalidatePath("/configuracoes/webhooks");
  return { ok: true };
}
```

- [ ] **Step 2: Verificar** — `npm run typecheck && npm run lint`.

- [ ] **Step 3: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf083): actions de teste, log de entregas e reenvio de webhook"
```

---

### Task 4: UI — botão de teste + log de entregas

**Files:**
- Modify: `src/app/(app)/configuracoes/webhooks/GestaoWebhooks.tsx`
- Modify: `src/app/(app)/configuracoes/webhooks/page.tsx` (carregar `listarEntregas`)

- [ ] **Step 1: Passar as entregas para o componente**

Em `page.tsx`, carregar também `listarEntregas()` e passar como prop:

```tsx
import { listarEndpoints, listarEntregas } from "./actions";
// ...
  const [endpoints, entregas] = await Promise.all([listarEndpoints(), listarEntregas()]);
  // ...
      <GestaoWebhooks endpoints={endpoints} entregas={entregas} />
```

- [ ] **Step 2: Botão "Enviar teste" na tabela de endpoints**

Em `GestaoWebhooks.tsx`, aceitar `entregas: EntregaView[]` na prop e, na coluna de ações de cada endpoint, adicionar um botão que chama `enviarTeste(e.id)` e mostra o resultado:

```tsx
                      <button
                        type="button"
                        onClick={async () => {
                          const r = await enviarTeste(e.id);
                          alert(r.ok ? `Teste entregue (HTTP ${r.status}).` : `Falhou: ${r.erro}`);
                        }}
                        className="rounded-lg border border-linha bg-white px-3 py-1.5 text-sm text-texto hover:bg-creme"
                      >
                        Enviar teste
                      </button>
```

(importar `enviarTeste` e `type EntregaView` de `./actions`.)

- [ ] **Step 3: Seção de log de entregas**

Ainda em `GestaoWebhooks.tsx`, após a tabela de endpoints, adicionar uma tabela de entregas (evento, URL, status, tentativas, quando) com botão **Reenviar** nas que não estão `ok`:

```tsx
      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-xs text-cinza">
              <th className="px-3 py-2 text-left font-medium">Evento</th>
              <th className="px-3 py-2 text-left font-medium">URL</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Tent.</th>
              <th className="px-3 py-2 text-right font-medium">Quando</th>
              <th className="px-3 py-2 text-right font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {entregas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-cinza">
                  Nenhuma entrega ainda.
                </td>
              </tr>
            ) : (
              entregas.map((d) => (
                <tr key={d.id} className="border-b border-linha/60">
                  <td className="px-3 py-2 text-texto">{d.evento}</td>
                  <td className="px-3 py-2 break-all text-xs text-cinza">{d.url}</td>
                  <td
                    className={`px-3 py-2 ${d.status === "ok" ? "text-verde" : d.status === "falhou" ? "text-negativo" : "text-cinza"}`}
                  >
                    {d.status}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-cinza">{d.tentativas}</td>
                  <td className="px-3 py-2 text-right text-cinza">{formatarData(d.criadoEm)}</td>
                  <td className="px-3 py-2 text-right">
                    {d.status !== "ok" && (
                      <button
                        type="button"
                        onClick={() => chamar(() => reenviarEntrega(d.id))}
                        className="rounded-lg border border-linha bg-white px-3 py-1.5 text-sm text-texto hover:bg-creme"
                      >
                        Reenviar
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
```

(importar `formatarData` de `@/lib/format`, `reenviarEntrega` de `./actions`; `chamar` já existe no componente.)

- [ ] **Step 4: Verificar** — `npm run typecheck && npm run lint`.

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf083): UI de teste de webhook + log de entregas com reenvio"
```

---

### Task 5: `GET /api/v1/eventos` + fechamento

**Files:**
- Create: `src/app/api/v1/eventos/route.ts`

- [ ] **Step 1: Rota**

```ts
// src/app/api/v1/eventos/route.ts
import { protegerRota } from "@/lib/api/rota";
import { umJson } from "@/lib/api/http";
import { EVENTOS_WEBHOOK } from "@/lib/webhooks/sinal";

export function GET(req: Request) {
  return protegerRota(req, undefined as unknown as string, async () => umJson({ eventos: EVENTOS_WEBHOOK }));
}
```

(Como `protegerRota` recebe `escopo: string`, passar uma string vazia faz o `temEscopo` liberar — confirmar assinatura; se preferir, ajustar `protegerRota`/`autenticarApiKey` para aceitar `escopo?: string`. `autenticarApiKey` já aceita `escopo?` e `temEscopo` libera sem escopo; portanto usar `""`.)

Versão segura (sem gambiarra de tipos), aproveitando que `autenticarApiKey(req, undefined)` já libera:

```ts
import { NextResponse } from "next/server";
import { autenticarApiKey } from "@/lib/api/auth";
import { EVENTOS_WEBHOOK } from "@/lib/webhooks/sinal";

export async function GET(req: Request) {
  const a = await autenticarApiKey(req);
  if (!a.auth) return NextResponse.json({ erro: { codigo: "nao_autorizado", mensagem: a.erro } }, { status: a.status });
  return NextResponse.json({ dados: { eventos: EVENTOS_WEBHOOK } });
}
```

Usar esta segunda versão.

- [ ] **Step 2: Suite completa + build**

Run: `npm test && npm run build`
Expected: testes passam; build lista `/api/v1/eventos` e as rotas existentes.

- [ ] **Step 3: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf083): GET /api/v1/eventos (tipos de evento disponíveis)"
```

> **Release Onda 1:** bump minor + CHANGELOG, PR, `verify` verde, **sem migration**, Implantar, health, tag, sync. Fumaça: cadastrar um endpoint em webhook.site, clicar "Enviar teste" e conferir o header `X-Webhook-Id` + a assinatura; `curl -H "Authorization: Bearer <chave>" .../api/v1/eventos`.

---

## Self-Review

- **Cobertura (Onda 1 da spec):** envelope + headers de dedup (Tasks 1–2); evento de teste + log + reenvio (Tasks 3–4); `/api/v1/eventos` (Task 5).
- **Placeholders:** nenhum — código completo; a Task 4 traz o JSX exato a inserir.
- **Consistência:** `montarEnvelope`/`enviarWebhook` (Task 1) consumidos por `drenar` (2) e pelo teste (3); `EntregaView` definido na Task 3 e consumido na UI (4); `EVENTOS_WEBHOOK` já existe (RF-080).
- **Sem regressão:** `drenar` mantém o contrato de retry/backoff; o único efeito visível é o novo formato de corpo/headers (dedup) — melhoria, não quebra.
- **Escopo:** Onda 1 só; OpenAPI enriquecido + guia são a Onda 2.
