# RF-080 Fatia D — Webhooks de saída Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O app empurra eventos (título pago/criado, obrigação entregue, cliente criado/atualizado, documento enviado) para URLs cadastradas pelo cliente, assinados por HMAC, com outbox + retry por cron.

**Architecture:** `emitir(evento, id)` (chamado nos núcleos da Fatia C + 2 pontos fora do núcleo) enfileira uma linha por endpoint ativo em `webhook_entrega`. Um cron a cada 5 min drena a outbox: `POST` assinado por HMAC com `comTimeout`, marca `ok`/`falhou`, backoff exponencial. UI admin cadastra endpoints.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (service_role), `node:crypto`, pg_cron, Vitest.

## Global Constraints

- Alias `@/*` → `./src/*`. **Fatia D** de 5 (spec `docs/superpowers/specs/2026-07-21-api-publica-webhooks-design.md`).
- **Migration** `0127_webhooks.sql` idempotente, aplicada antes do deploy. **Cron novo** aplicado pós-deploy (`bootstrap-cron.mjs`).
- `emitir` é **best-effort**: nunca lança para o chamador (uma falha ao enfileirar não pode derrubar a escrita principal). Se **nenhum** endpoint casa o evento, retorna cedo (sem re-select nem custo).
- Payload reusa os serializadores da API (`serializarCliente/Titulo/Obrigacao/Documento` + `COLS_*`) — mesmo formato da API pública.
- Enfileiramento e drenagem usam **service_role** (as tabelas têm RLS admin).
- **Assinatura de saída:** `createHmac("sha256", endpoint.secret).update(corpo).digest("hex")` sobre a **string exata** enviada; header `X-Assinatura: sha256=<hex>`.
- **Deferido no v1:** `titulo.criado` de mensalidade gerada por SQL (`gerar_mensalidades`) — exigiria trigger; documentado. Só o título **avulso** emite `titulo.criado`.
- Rodar `npm run lint/typecheck/test/format`; `git add -A` **depois** do `format`.

---

### Task 1: Migration `0127_webhooks.sql`

**Files:**
- Create: `supabase/migrations/0127_webhooks.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- RF-080 (Fatia D): webhooks de saída — endpoints do cliente + outbox de entregas.
create table if not exists webhook_endpoint (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  secret text not null,                 -- chave HMAC (compartilhada com o consumidor)
  eventos text[] not null default '{}', -- ex.: {'titulo.pago','obrigacao.entregue'}
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists webhook_entrega (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references webhook_endpoint(id) on delete cascade,
  evento text not null,
  payload jsonb not null,
  status text not null default 'pendente', -- 'pendente' | 'ok' | 'falhou'
  tentativas int not null default 0,
  proximo_retry timestamptz not null default now(),
  criado_em timestamptz not null default now()
);
create index if not exists ix_webhook_entrega_fila on webhook_entrega(proximo_retry) where status = 'pendente';

alter table webhook_endpoint enable row level security;
drop policy if exists webhook_endpoint_admin on webhook_endpoint;
create policy webhook_endpoint_admin on webhook_endpoint for all
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');

alter table webhook_entrega enable row level security;
drop policy if exists webhook_entrega_admin on webhook_entrega;
create policy webhook_entrega_admin on webhook_entrega for all
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
```

- [ ] **Step 2: Sanidade** — `ls supabase/migrations/ | tail -2` → `0126_api_keys.sql` como última anterior.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(rf080): migration 0127 (webhook_endpoint + webhook_entrega)"
```

---

### Task 2: Libs puras `sinal` (assinatura + backoff + roteamento) + testes

**Files:**
- Create: `src/lib/webhooks/sinal.ts`
- Test: `src/tests/webhooks/sinal.test.ts`

**Interfaces:**
- Produces: `assinar(secret, corpo): string`; `proximoRetry(tentativas): number` (segundos); `endpointsParaEvento(endpoints, evento)`.

- [ ] **Step 1: Testes que falham**

```ts
// src/tests/webhooks/sinal.test.ts
import { describe, it, expect } from "vitest";
import { assinar, proximoRetry, endpointsParaEvento } from "@/lib/webhooks/sinal";

describe("assinar", () => {
  it("é determinístico e hex de 64 chars", () => {
    const a = assinar("segredo", '{"x":1}');
    expect(a).toBe(assinar("segredo", '{"x":1}'));
    expect(a).toHaveLength(64);
    expect(assinar("outro", '{"x":1}')).not.toBe(a);
  });
});

describe("proximoRetry", () => {
  it("cresce exponencialmente e satura", () => {
    expect(proximoRetry(1)).toBe(60);
    expect(proximoRetry(2)).toBe(300);
    expect(proximoRetry(3)).toBe(1800);
    expect(proximoRetry(99)).toBe(3600); // teto
  });
});

describe("endpointsParaEvento", () => {
  const eps = [
    { id: "a", eventos: ["titulo.pago", "cliente.criado"], ativo: true },
    { id: "b", eventos: ["titulo.pago"], ativo: false },
    { id: "c", eventos: ["obrigacao.entregue"], ativo: true },
  ];
  it("retorna só os ativos que assinam o evento", () => {
    expect(endpointsParaEvento(eps, "titulo.pago").map((e) => e.id)).toEqual(["a"]);
    expect(endpointsParaEvento(eps, "documento.enviado")).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/tests/webhooks/sinal.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/lib/webhooks/sinal.ts
import { createHmac } from "node:crypto";

export function assinar(secret: string, corpo: string): string {
  return createHmac("sha256", secret).update(corpo).digest("hex");
}

// Backoff exponencial (segundos), com teto de 1h. tentativas começa em 1.
export function proximoRetry(tentativas: number): number {
  const escala = [60, 300, 1800, 3600];
  return escala[Math.min(tentativas, escala.length) - 1] ?? 3600;
}

export type EndpointRoteavel = { id: string; eventos: string[]; ativo: boolean };
export function endpointsParaEvento<T extends EndpointRoteavel>(endpoints: T[], evento: string): T[] {
  return endpoints.filter((e) => e.ativo && e.eventos.includes(evento));
}
```

- [ ] **Step 4: Passar** — `npx vitest run src/tests/webhooks/sinal.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): libs puras de webhook (assinar/backoff/roteamento) + testes"
```

---

### Task 3: `emitir(evento, id)` — enfileira o evento

**Files:**
- Create: `src/lib/webhooks/emitir.ts`

**Interfaces:**
- Produces: `emitir(evento: string, id: string): Promise<void>` (best-effort, service_role).

- [ ] **Step 1: Implementar**

```ts
// src/lib/webhooks/emitir.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { endpointsParaEvento } from "./sinal";
import {
  serializarCliente,
  serializarTitulo,
  serializarObrigacao,
  serializarDocumento,
  COLS_CLIENTE,
  COLS_TITULO,
  COLS_OBRIGACAO,
  COLS_DOCUMENTO,
} from "@/lib/api/serializar";

type Fonte = { tabela: string; cols: string; serializar: (r: Record<string, unknown>) => unknown };
const FONTE: Record<string, Fonte> = {
  cliente: { tabela: "clientes", cols: COLS_CLIENTE, serializar: serializarCliente },
  titulo: { tabela: "titulo", cols: COLS_TITULO, serializar: serializarTitulo },
  obrigacao: { tabela: "obrigacao_instancia", cols: COLS_OBRIGACAO, serializar: serializarObrigacao },
  documento: { tabela: "documentos", cols: COLS_DOCUMENTO, serializar: serializarDocumento },
};

// Enfileira o evento para cada endpoint ativo que o assina. Best-effort: qualquer falha aqui
// só afeta o webhook, nunca a operação principal. Barato quando não há endpoints.
export async function emitir(evento: string, id: string): Promise<void> {
  try {
    const admin = createAdminSupabase();
    const { data: eps } = await admin.from("webhook_endpoint").select("id, eventos, ativo");
    const alvos = endpointsParaEvento((eps ?? []) as { id: string; eventos: string[]; ativo: boolean }[], evento);
    if (alvos.length === 0) return; // nada a fazer — não re-seleciona o recurso

    const fonte = FONTE[evento.split(".")[0] ?? ""];
    if (!fonte) return;
    const { data: row } = await admin.from(fonte.tabela).select(fonte.cols).eq("id", id).maybeSingle();
    if (!row) return;
    const payload = { evento, dados: fonte.serializar(row as Record<string, unknown>) };

    await admin
      .from("webhook_entrega")
      .insert(alvos.map((e) => ({ endpoint_id: e.id, evento, payload })));
  } catch (e) {
    console.error("emitir webhook:", e instanceof Error ? e.message : e);
  }
}
```

- [ ] **Step 2: Verificar** — `npm run typecheck && npm run lint`.

- [ ] **Step 3: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): emitir(evento,id) — enfileira webhooks na outbox"
```

---

### Task 4: Instrumentar os pontos de emissão

**Files:**
- Modify: `src/lib/clientes/gravar.ts`, `src/lib/financeiro/gravar-titulo.ts`, `src/lib/financeiro/gravar-baixa.ts`, `src/lib/obrigacoes/gravar-baixa.ts`, `src/lib/documentos/gravar.ts` (núcleos)
- Modify: `src/lib/boleto/baixar.ts` (baixa por boleto — fora do núcleo)
- Modify: `src/app/(app)/documentos/actions.ts` (`anexarNovaVersao` — fora do núcleo)

**Interfaces:**
- Consumes: `emitir` (Task 3).

- [ ] **Step 1: Núcleos** — antes de cada `return { ok: true, ... }` de sucesso, `await emitir("<evento>", <id>)`:
  - `gravar.ts` (cliente): após criar → `await emitir("cliente.criado", data[0]!.id as string)`; após atualizar → precisa do id (já é `clienteId` parâmetro) → `await emitir("cliente.atualizado", clienteId)`.
  - `gravar-titulo.ts`: `await emitir("titulo.criado", data.id as string)` antes do `return { ok: true, tituloId }`.
  - `gravar-baixa.ts` (título): `await emitir("titulo.pago", input.tituloId)` antes do `return { ok: true }`.
  - `obrigacoes/gravar-baixa.ts`: `await emitir("obrigacao.entregue", input.instanciaId)` antes do `return { ok: true, clienteId }`.
  - `documentos/gravar.ts`: `await emitir("documento.enviado", novo.id as string)` antes do `return { ok: true, id }`.

- [ ] **Step 2: Pontos fora do núcleo**
  - `src/lib/boleto/baixar.ts`: no `return true` de sucesso (após marcar o boleto pago), `await emitir("titulo.pago", <titulo_id do boleto>)`. (Ler o `titulo_id` do boleto no escopo; se necessário, incluí-lo no select existente.)
  - `src/app/(app)/documentos/actions.ts` (`anexarNovaVersao`): após `await indexarConteudo(admin, novo.id, file)`, `await emitir("documento.enviado", novo.id as string)`.

- [ ] **Step 3: Verificar** — `npm run typecheck && npm run lint && npm test` (o comportamento das operações não muda; `emitir` é best-effort).

- [ ] **Step 4: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): emitir eventos nos núcleos + baixa por boleto + nova versão"
```

---

### Task 5: Drenador `drenarWebhooks` + rota cron + job

**Files:**
- Create: `src/lib/webhooks/drenar.ts`
- Create: `src/app/api/cron/entregar-webhooks/route.ts`
- Modify: `scripts/bootstrap-cron.mjs` (job `*/5 * * * *`)

**Interfaces:**
- Produces: `drenarWebhooks(): Promise<{ entregues: number; falhas: number }>`.

- [ ] **Step 1: Drenador**

```ts
// src/lib/webhooks/drenar.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { assinar, proximoRetry } from "./sinal";

const MAX_TENTATIVAS = 4;
const comTimeout = async <T>(fn: (s: AbortSignal) => Promise<T>): Promise<T> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
};

export async function drenarWebhooks(): Promise<{ entregues: number; falhas: number }> {
  const admin = createAdminSupabase();
  const agora = new Date().toISOString();
  const { data: fila } = await admin
    .from("webhook_entrega")
    .select("id, evento, payload, tentativas, webhook_endpoint(url, secret, ativo)")
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
    const corpo = JSON.stringify(e.payload);
    let ok = false;
    try {
      ok = await comTimeout(async (signal) => {
        const res = await fetch(ep.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Assinatura": `sha256=${assinar(ep.secret, corpo)}` },
          body: corpo,
          signal,
        });
        return res.ok;
      });
    } catch {
      ok = false;
    }
    if (ok) {
      await admin.from("webhook_entrega").update({ status: "ok" }).eq("id", e.id);
      entregues += 1;
    } else {
      const tentativas = (e.tentativas as number) + 1;
      const falhou = tentativas >= MAX_TENTATIVAS;
      await admin
        .from("webhook_entrega")
        .update({
          tentativas,
          status: falhou ? "falhou" : "pendente",
          proximo_retry: new Date(Date.now() + proximoRetry(tentativas) * 1000).toISOString(),
        })
        .eq("id", e.id);
      falhas += 1;
    }
  }
  return { entregues, falhas };
}
```

- [ ] **Step 2: Rota cron**

```ts
// src/app/api/cron/entregar-webhooks/route.ts
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { drenarWebhooks } from "@/lib/webhooks/drenar";

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(segredo);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  return NextResponse.json(await drenarWebhooks());
}
```

- [ ] **Step 3: Job no bootstrap-cron**

Em `scripts/bootstrap-cron.mjs`, adicionar ao array `JOBS`:

```js
  {
    nome: "entregar-webhooks",
    agenda: "*/5 * * * *",
    comando: httpPost("entregar-webhooks", true),
    nota: "entrega webhooks de saída pendentes com retry (RF-080 Fatia D)",
  },
```

- [ ] **Step 4: Verificar** — `npm run typecheck && npm run lint && node --check scripts/bootstrap-cron.mjs`.

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): drenador de webhooks (HMAC + retry) + rota cron + job 5min"
```

---

### Task 6: UI admin `/configuracoes/webhooks`

**Files:**
- Create: `src/app/(app)/configuracoes/webhooks/actions.ts`
- Create: `src/app/(app)/configuracoes/webhooks/page.tsx`
- Create: `src/app/(app)/configuracoes/webhooks/GestaoWebhooks.tsx`
- Modify: `src/app/(app)/configuracoes/page.tsx` (item no hub)

**Interfaces:**
- Produces: `listarEndpoints()`, `criarEndpoint(url, eventos)`, `alternarEndpoint(id, ativo)`, `removerEndpoint(id)`. Eventos válidos: constante `EVENTOS_WEBHOOK`.

- [ ] **Step 1: Constante de eventos** — em `src/lib/webhooks/sinal.ts`, exportar:

```ts
export const EVENTOS_WEBHOOK = [
  "cliente.criado",
  "cliente.atualizado",
  "titulo.criado",
  "titulo.pago",
  "obrigacao.entregue",
  "documento.enviado",
] as const;
```

- [ ] **Step 2: Actions** (molde de `configuracoes/api/actions.ts`; gate admin; `secret` gerado e mostrado uma vez na criação)

```ts
// src/app/(app)/configuracoes/webhooks/actions.ts
"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { EVENTOS_WEBHOOK } from "@/lib/webhooks/sinal";

export type EndpointView = { id: string; url: string; eventos: string[]; ativo: boolean };

async function admOk() {
  const p = await getPerfilAtual();
  return !!p?.ativo && p.papel === "admin";
}

export async function listarEndpoints(): Promise<EndpointView[]> {
  if (!(await admOk())) return [];
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("webhook_endpoint")
    .select("id, url, eventos, ativo")
    .order("criado_em", { ascending: false });
  return (data ?? []).map((e) => ({
    id: e.id as string,
    url: e.url as string,
    eventos: (e.eventos as string[] | null) ?? [],
    ativo: !!e.ativo,
  }));
}

export async function criarEndpoint(url: string, eventos: string[]): Promise<{ secret?: string; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || p.papel !== "admin") return { erro: "Sem permissão." };
  if (!/^https:\/\/.+/.test(url.trim())) return { erro: "Informe uma URL https válida." };
  const validos = eventos.filter((e) => (EVENTOS_WEBHOOK as readonly string[]).includes(e));
  if (validos.length === 0) return { erro: "Selecione ao menos um evento." };
  const secret = randomBytes(24).toString("hex");
  const admin = createAdminSupabase();
  const { error } = await admin.from("webhook_endpoint").insert({ url: url.trim(), secret, eventos: validos });
  if (error) return { erro: "Falha ao criar o endpoint." };
  revalidatePath("/configuracoes/webhooks");
  return { secret }; // mostrado uma vez (o consumidor usa para verificar a assinatura)
}

export async function alternarEndpoint(id: string, ativo: boolean): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || p.papel !== "admin") return { erro: "Sem permissão." };
  const admin = createAdminSupabase();
  const { error } = await admin.from("webhook_endpoint").update({ ativo }).eq("id", id);
  if (error) return { erro: "Falha ao atualizar." };
  revalidatePath("/configuracoes/webhooks");
  return { ok: true };
}

export async function removerEndpoint(id: string): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || p.papel !== "admin") return { erro: "Sem permissão." };
  const admin = createAdminSupabase();
  const { error } = await admin.from("webhook_endpoint").delete().eq("id", id);
  if (error) return { erro: "Falha ao remover." };
  revalidatePath("/configuracoes/webhooks");
  return { ok: true };
}
```

- [ ] **Step 3: Página + componente cliente** (molde de `configuracoes/api/`: `GestaoWebhooks` com form de criação — url + checkboxes de `EVENTOS_WEBHOOK` — mostra o secret uma vez; tabela com ativar/desativar e remover). Gate admin no `page.tsx` (`redirect("/")`).

```tsx
// src/app/(app)/configuracoes/webhooks/page.tsx
import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { GestaoWebhooks } from "./GestaoWebhooks";
import { listarEndpoints } from "./actions";

export const metadata = { title: "Webhooks" };

export default async function WebhooksConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const endpoints = await listarEndpoints();
  return (
    <Container largura="larga" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="Webhooks de saída" subtitulo="URLs que recebem eventos do CRM, assinados por HMAC" />
      <GestaoWebhooks endpoints={endpoints} />
    </Container>
  );
}
```

O `GestaoWebhooks.tsx` segue o `GestaoChaves.tsx` (mesma estrutura: aviso do secret uma vez, form com checkboxes de `EVENTOS_WEBHOOK`, tabela com Ativar/Desativar e Remover). Item no hub `configuracoes/page.tsx`:

```ts
  { href: "/configuracoes/webhooks", label: "Webhooks de saída", desc: "URLs que recebem eventos do CRM (título pago, obrigação entregue etc.)." },
```

- [ ] **Step 4: Suite completa + build**

Run: `npm test && npm run build`
Expected: testes passam; build lista `/configuracoes/webhooks` e `/api/cron/entregar-webhooks`.

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): UI admin de webhooks de saída (endpoints + eventos + secret)"
```

> **Release da Fatia D:** bump minor + CHANGELOG, PR, `verify` verde, aplicar `0127` em produção **antes** do deploy, Implantar, health, **aplicar o cron** (`bootstrap-cron.mjs`), tag, sync. Fumaça: cadastrar um endpoint (ex.: webhook.site), criar um título e ver a entrega em ~5 min.

---

## Self-Review

- **Cobertura (Fatia D da spec):** tabelas endpoint+outbox (Task 1); assinatura/backoff/roteamento puros (Task 2); `emitir` enfileira reusando serializadores (Task 3); instrumentação nos núcleos + baixa-boleto + nova-versão (Task 4); drenador HMAC+retry + cron 5min (Task 5); UI admin (Task 6).
- **Placeholders:** os passos trazem código; a instrumentação (Task 4) e o componente cliente (Task 6 §3) descrevem a inserção exata espelhando um componente existente.
- **Consistência:** `assinar`/`proximoRetry`/`endpointsParaEvento`/`EVENTOS_WEBHOOK` (Task 2) consumidos por `emitir` (3), `drenar` (5) e a UI (6); `emitir` reusa `serializar*`/`COLS_*` da Fatia B.
- **Riscos:** `emitir` best-effort (try/catch, retorno cedo sem endpoints) — nunca derruba a escrita; HMAC sobre a string exata enviada; retry com backoff e teto de tentativas; deferido `titulo.criado` de mensalidade (SQL) — documentado.
- **Escopo respeitado:** só saída; a doc OpenAPI é a Fatia E.
