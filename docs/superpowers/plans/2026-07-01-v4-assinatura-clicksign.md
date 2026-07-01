# V4 — Assinaturas digitais (Clicksign) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar o contrato PDF já gerado para assinatura na Clicksign, acompanhar o status por webhook e trazer o PDF assinado de volta aos Documentos do cliente.

**Architecture:** Cliente Clicksign isolado (`src/lib/assinatura/`) monta o envelope v3 (JSON:API) a partir do PDF + signatários; uma server action envia e persiste em `assinaturas`/`assinatura_signatarios`; um route handler recebe o webhook (HMAC), atualiza o status e salva o assinado. UI na ficha do cliente.

**Tech Stack:** Next.js 16 (App Router, route handlers) + TypeScript · Supabase · Vitest · Clicksign API v3 (fetch, JSON:API) · `node:crypto` (HMAC).

## Global Constraints

- **Next 16:** route handlers em `src/app/api/.../route.ts`; alias `@/*`; imagens via `next/image`.
- **Segredos runtime (nunca `NEXT_PUBLIC_`):** `CLICKSIGN_URL`, `CLICKSIGN_TOKEN`, `CLICKSIGN_HMAC_SECRET`. Validar com `required(process.env.X, "X")` de `@/lib/env`.
- **RBAC:** enviar/ver assinatura = `podeGerenciarDocumentos(papel)` (admin/contador/assistente), de `@/lib/clientes/permissoes`. Webhook grava via `createAdminSupabase()` (service_role) — protegido por **HMAC**.
- **Documentos:** salvar o assinado reusa o padrão de `src/app/(app)/documentos/actions.ts` (upload no bucket `documentos` via admin + insert na tabela `documentos`: `cliente_id, nome, tipo, caminho_storage, enviado_por`).
- **Banco:** migrations idempotentes em `supabase/migrations/NNNN_*.sql` via `npm run db:migrate`; RLS testada em `supabase/tests/rls.test.sql` via `npm run db:test`.
- **Clicksign API v3:** header `Authorization: <token>`; `Content-Type: application/vnd.api+json`; base em `CLICKSIGN_URL` (sandbox `https://sandbox.clicksign.com/api/v3`). Webhook: header **`x-clicksign-signature`** = HMAC-SHA256(hex) do corpo cru. **Eventos idempotentes** (podem reenviar).
- **Comandos antes de commitar:** `npm run lint && npm run typecheck && npm test`. Rodar da raiz na branch `develop`.

---

## File Structure

- `src/lib/assinatura/tipos.ts` — tipos compartilhados.
- `src/lib/assinatura/clicksign.ts` — cliente da API v3 (`enviarParaAssinatura`, `baixarAssinado`).
- `src/lib/assinatura/webhook.ts` — `verificarHmac`, `mapearEvento` (puro).
- `supabase/migrations/0018_assinaturas.sql` — tabelas + RLS + trigger.
- `src/app/(app)/clientes/[id]/assinatura.ts` — server action `enviarAssinatura` + estado.
- `src/app/api/webhooks/clicksign/route.ts` — POST do webhook.
- `src/components/assinatura/EnviarAssinatura.tsx` — botão + form (signatários + toggle testemunhas).
- `src/components/assinatura/StatusAssinatura.tsx` — indicador de status.
- (modificar) `src/components/documentos/DocumentosSection.tsx` e `src/app/(app)/clientes/[id]/page.tsx` — carregar assinaturas e renderizar ação/status nos contratos.
- (modificar) `.env.local.example`, `docs/DEPLOY.md` — variáveis + registro do webhook.
- Testes: `src/tests/assinatura/clicksign.test.ts`, `webhook.test.ts`.

---

## Task 1: Migration 0018 — tabelas de assinatura

**Files:** Create `supabase/migrations/0018_assinaturas.sql`; Modify `supabase/tests/rls.test.sql`.

**Interfaces:** Produces tabelas `assinaturas`, `assinatura_signatarios`.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/0018_assinaturas.sql
-- Rastreio das assinaturas (Clicksign) — V4. Idempotente.
create table if not exists assinaturas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  documento_id uuid references documentos(id) on delete set null,
  clicksign_envelope_id text not null,
  clicksign_document_id text,
  status text not null default 'enviado', -- enviado|parcial|finalizado|recusado|cancelado
  documento_assinado_id uuid references documentos(id) on delete set null,
  criado_por uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  finalizado_em timestamptz
);
create index if not exists assinaturas_envelope_idx on assinaturas (clicksign_envelope_id);

create table if not exists assinatura_signatarios (
  id uuid primary key default gen_random_uuid(),
  assinatura_id uuid not null references assinaturas(id) on delete cascade,
  nome text not null,
  email text not null,
  papel text not null, -- contratada|contratante|testemunha
  clicksign_key text,
  status text not null default 'pendente', -- pendente|assinado|recusado
  assinado_em timestamptz
);

alter table assinaturas enable row level security;
alter table assinatura_signatarios enable row level security;

-- Gestão de documentos (admin/assistente/contador-dono) enxerga/gerencia.
drop policy if exists assinaturas_rw on assinaturas;
create policy assinaturas_rw on assinaturas for all to authenticated
  using (
    auth_papel() in ('admin', 'assistente')
    or (auth_papel() = 'contador'
        and exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid()))
  )
  with check (
    auth_papel() in ('admin', 'assistente')
    or (auth_papel() = 'contador'
        and exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid()))
  );

drop policy if exists assinatura_signatarios_rw on assinatura_signatarios;
create policy assinatura_signatarios_rw on assinatura_signatarios for all to authenticated
  using (exists (
    select 1 from assinaturas a where a.id = assinatura_id
    and (auth_papel() in ('admin', 'assistente')
      or (auth_papel() = 'contador'
          and exists (select 1 from clientes c where c.id = a.cliente_id and c.contador_id = auth.uid())))
  ))
  with check (exists (
    select 1 from assinaturas a where a.id = assinatura_id
    and (auth_papel() in ('admin', 'assistente')
      or (auth_papel() = 'contador'
          and exists (select 1 from clientes c where c.id = a.cliente_id and c.contador_id = auth.uid())))
  ));

-- Autoria não-forjável (espelha o padrão do projeto).
create or replace function assinaturas_integridade() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  if auth.uid() is not null and tg_op = 'INSERT' then
    new.criado_por := auth.uid();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_assinaturas_integridade on assinaturas;
create trigger trg_assinaturas_integridade
  before insert on assinaturas
  for each row execute function assinaturas_integridade();
```

- [ ] **Step 2: Aplicar** — Run: `npm run db:migrate` · Expected: `0018_assinaturas.sql` aplicada.
- [ ] **Step 3: Reaplicar é no-op** — Run: `npm run db:migrate` · Expected: 0 novas.

- [ ] **Step 4: Assert de RLS** (acrescentar ao final de `supabase/tests/rls.test.sql`)

```sql
-- ===== V4: assinaturas seguem a RLS de gestão de documentos =====
reset role;
insert into assinaturas (id, cliente_id, clicksign_envelope_id, status) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'env_teste', 'enviado')
  on conflict do nothing;

-- ASSERT: financeiro NÃO gerencia assinaturas (não está em admin/assistente/contador-dono)
do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro
  select count(*) into n from assinaturas;
  if n <> 0 then raise exception 'FALHA: financeiro viu % assinaturas (devia ser 0)', n; end if;
  raise notice 'OK: financeiro não acessa assinaturas';
end $$;
```

- [ ] **Step 5: Rodar RLS** — Run: `npm run db:test` · Expected: `✓ TODOS OS ASSERTS PASSARAM` com o novo `OK:`.
- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0018_assinaturas.sql supabase/tests/rls.test.sql
git commit -m "feat(db): tabelas de assinatura (Clicksign) + RLS (0018)"
```

---

## Task 2: Tipos compartilhados

**Files:** Create `src/lib/assinatura/tipos.ts`.

**Interfaces:** Produces os tipos abaixo (consumidos por T3–T7).

- [ ] **Step 1: Escrever `tipos.ts`** (sem teste próprio — exercitado por T3/T4)

```ts
// src/lib/assinatura/tipos.ts
export type PapelSignatario = "contratada" | "contratante" | "testemunha";
export type SignatarioInput = { nome: string; email: string; papel: PapelSignatario };
export type SignatarioEnviado = SignatarioInput & { clicksignKey: string };
export type ResultadoEnvio = {
  envelopeId: string;
  documentId: string;
  signatarios: SignatarioEnviado[];
};
export type EventoAssinatura =
  | { tipo: "assinou"; envelopeId: string; email: string }
  | { tipo: "recusou"; envelopeId: string; email: string }
  | { tipo: "finalizou"; envelopeId: string }
  | { tipo: "ignorar" };
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/assinatura/tipos.ts
git commit -m "feat(assinatura): tipos compartilhados"
```

---

## Task 3: Cliente Clicksign

**Files:** Create `src/lib/assinatura/clicksign.ts`, `src/tests/assinatura/clicksign.test.ts`.

**Interfaces:**
- Consumes: tipos (T2).
- Produces:
  - `export async function enviarParaAssinatura(args: { pdf: Buffer; nome: string; signatarios: SignatarioInput[] }): Promise<ResultadoEnvio>`
  - `export async function baixarAssinado(envelopeId: string, documentId: string): Promise<Buffer | null>`

- [ ] **Step 1: Escrever o teste que falha** (mocka `fetch` e verifica a sequência)

```ts
// src/tests/assinatura/clicksign.test.ts
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { enviarParaAssinatura } from "@/lib/assinatura/clicksign";

beforeEach(() => {
  vi.stubEnv("CLICKSIGN_URL", "https://sandbox.clicksign.com/api/v3");
  vi.stubEnv("CLICKSIGN_TOKEN", "tok_test");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function respJson(obj: unknown, status = 201) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/vnd.api+json" } });
}

describe("enviarParaAssinatura", () => {
  it("cria envelope, documento, signatários, requisitos e ativa", async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, method: init.method!, body: init.body ? JSON.parse(init.body as string) : null });
        if (url.endsWith("/envelopes")) return respJson({ data: { id: "env1" } });
        if (url.endsWith("/documents")) return respJson({ data: { id: "doc1" } });
        if (url.endsWith("/signers")) return respJson({ data: { id: "sig-" + calls.length } });
        if (url.endsWith("/requirements")) return respJson({ data: { id: "req" } });
        if (init.method === "PATCH") return respJson({ data: { id: "env1", attributes: { status: "running" } } }, 200);
        return respJson({}, 200);
      }),
    );
    const out = await enviarParaAssinatura({
      pdf: Buffer.from("%PDF-1.4 fake"),
      nome: "Contrato ACME",
      signatarios: [
        { nome: "Cliente", email: "c@ex.com", papel: "contratante" },
        { nome: "Escritório", email: "e@ex.com", papel: "contratada" },
      ],
    });
    expect(out.envelopeId).toBe("env1");
    expect(out.documentId).toBe("doc1");
    expect(out.signatarios).toHaveLength(2);
    expect(out.signatarios[0]!.clicksignKey).toMatch(/^sig-/);
    // documento vai como content_base64 com data URI
    const docCall = calls.find((c) => c.url.endsWith("/documents"))!;
    expect((docCall.body as any).data.attributes.content_base64).toMatch(/^data:application\/pdf;base64,/);
    // ativou (PATCH status running)
    expect(calls.some((c) => c.method === "PATCH")).toBe(true);
  });

  it("lança erro se a API responder falha", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respJson({ errors: [{ detail: "x" }] }, 422)));
    await expect(
      enviarParaAssinatura({ pdf: Buffer.from("x"), nome: "N", signatarios: [{ nome: "A", email: "a@x.com", papel: "contratante" }] }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha** — Run: `npm test -- src/tests/assinatura/clicksign.test.ts` · Expected: FALHA (módulo inexistente).

- [ ] **Step 3: Implementar `clicksign.ts`**

```ts
// src/lib/assinatura/clicksign.ts
import { required } from "@/lib/env";
import type { SignatarioInput, ResultadoEnvio, SignatarioEnviado } from "./tipos";

const JSONAPI = "application/vnd.api+json";

function cfg() {
  return {
    base: required(process.env.CLICKSIGN_URL, "CLICKSIGN_URL"),
    token: required(process.env.CLICKSIGN_TOKEN, "CLICKSIGN_TOKEN"),
  };
}

async function api(path: string, method: string, body?: unknown): Promise<any> {
  const { base, token } = cfg();
  const resp = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: token, "Content-Type": JSONAPI, Accept: JSONAPI },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Clicksign ${method} ${path} -> ${resp.status} ${txt.slice(0, 300)}`);
  }
  return resp.json();
}

export async function enviarParaAssinatura(args: {
  pdf: Buffer;
  nome: string;
  signatarios: SignatarioInput[];
}): Promise<ResultadoEnvio> {
  // 1) envelope (rascunho)
  const env = await api("/envelopes", "POST", {
    data: { type: "envelopes", attributes: { name: args.nome } },
  });
  const envelopeId: string = env.data.id;

  // 2) documento (PDF em data URI base64)
  const doc = await api(`/envelopes/${envelopeId}/documents`, "POST", {
    data: {
      type: "documents",
      attributes: {
        filename: `${args.nome}.pdf`,
        content_base64: `data:application/pdf;base64,${args.pdf.toString("base64")}`,
      },
    },
  });
  const documentId: string = doc.data.id;

  // 3) signatários + 4) requisitos (qualificação + autenticação e-mail)
  const signatarios: SignatarioEnviado[] = [];
  for (const s of args.signatarios) {
    const sig = await api(`/envelopes/${envelopeId}/signers`, "POST", {
      data: { type: "signers", attributes: { name: s.nome, email: s.email } },
    });
    const signerId: string = sig.data.id;
    const rel = {
      document: { data: { type: "documents", id: documentId } },
      signer: { data: { type: "signers", id: signerId } },
    };
    await api(`/envelopes/${envelopeId}/requirements`, "POST", {
      data: { type: "requirements", attributes: { action: "agree", role: "sign" }, relationships: rel },
    });
    await api(`/envelopes/${envelopeId}/requirements`, "POST", {
      data: { type: "requirements", attributes: { action: "provide_evidence", auth: "email" }, relationships: rel },
    });
    signatarios.push({ ...s, clicksignKey: signerId });
  }

  // 5) ativar (draft -> running): dispara os e-mails
  await api(`/envelopes/${envelopeId}`, "PATCH", {
    data: { id: envelopeId, type: "envelopes", attributes: { status: "running" } },
  });

  return { envelopeId, documentId, signatarios };
}

// Baixa o PDF assinado. Após a finalização, o documento tem uma URL de download
// nos atributos. Campo confirmado no E2E (sandbox); isolado aqui.
export async function baixarAssinado(envelopeId: string, documentId: string): Promise<Buffer | null> {
  try {
    const det = await api(`/envelopes/${envelopeId}/documents/${documentId}`, "GET");
    const url: string | undefined =
      det?.data?.attributes?.signed_file_url ??
      det?.data?.attributes?.finished_url ??
      det?.data?.attributes?.url;
    if (!url) return null;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa** — Run: `npm test -- src/tests/assinatura/clicksign.test.ts` · Expected: PASS (2).
- [ ] **Step 5: Commit**

```bash
npm run lint && npm run typecheck && npm test -- src/tests/assinatura
git add src/lib/assinatura/clicksign.ts src/tests/assinatura/clicksign.test.ts
git commit -m "feat(assinatura): cliente Clicksign v3 (envelope + baixar assinado)"
```

---

## Task 4: Webhook (HMAC + mapeamento de evento)

**Files:** Create `src/lib/assinatura/webhook.ts`, `src/tests/assinatura/webhook.test.ts`.

**Interfaces:**
- Consumes: `EventoAssinatura` (T2).
- Produces: `export function verificarHmac(corpo: string, assinatura: string, segredo: string): boolean`; `export function mapearEvento(payload: unknown): EventoAssinatura`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/tests/assinatura/webhook.test.ts
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verificarHmac, mapearEvento } from "@/lib/assinatura/webhook";

const SEGREDO = "s3cr3t";
const hmac = (corpo: string) => createHmac("sha256", SEGREDO).update(corpo).digest("hex");

describe("verificarHmac", () => {
  it("aceita assinatura válida e rejeita inválida", () => {
    const corpo = '{"event":{"name":"sign"}}';
    expect(verificarHmac(corpo, hmac(corpo), SEGREDO)).toBe(true);
    expect(verificarHmac(corpo, "deadbeef", SEGREDO)).toBe(false);
    expect(verificarHmac(corpo, "", SEGREDO)).toBe(false);
  });
});

describe("mapearEvento", () => {
  it("mapeia sign/refusal/close e ignora desconhecido", () => {
    expect(mapearEvento({ event: { name: "sign", data: { signer: { email: "a@x.com" } } }, envelope: { id: "env1" } })).toEqual({
      tipo: "assinou",
      envelopeId: "env1",
      email: "a@x.com",
    });
    expect(mapearEvento({ event: { name: "refusal", data: { signer: { email: "b@x.com" } } }, envelope: { id: "env1" } })).toMatchObject({
      tipo: "recusou",
      email: "b@x.com",
    });
    expect(mapearEvento({ event: { name: "close" }, envelope: { id: "env1" } })).toEqual({ tipo: "finalizou", envelopeId: "env1" });
    expect(mapearEvento({ event: { name: "add_signer" } })).toEqual({ tipo: "ignorar" });
    expect(mapearEvento({})).toEqual({ tipo: "ignorar" });
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha** — Run: `npm test -- src/tests/assinatura/webhook.test.ts` · Expected: FALHA.

- [ ] **Step 3: Implementar `webhook.ts`**

```ts
// src/lib/assinatura/webhook.ts
import { createHmac, timingSafeEqual } from "node:crypto";
import type { EventoAssinatura } from "./tipos";

export function verificarHmac(corpo: string, assinatura: string, segredo: string): boolean {
  if (!assinatura) return false;
  const esperado = createHmac("sha256", segredo).update(corpo).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(assinatura);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Mapeia o payload do webhook para uma intenção de atualização. O caminho exato
// dos campos é confirmado no E2E (sandbox); qualquer ajuste fica isolado aqui.
export function mapearEvento(payload: unknown): EventoAssinatura {
  const p = payload as {
    event?: { name?: string; data?: { signer?: { email?: string } } };
    envelope?: { id?: string };
  };
  const nome = p?.event?.name;
  const envelopeId = p?.envelope?.id ?? "";
  const email = p?.event?.data?.signer?.email ?? "";
  if (nome === "sign" && envelopeId && email) return { tipo: "assinou", envelopeId, email };
  if (nome === "refusal" && envelopeId && email) return { tipo: "recusou", envelopeId, email };
  if ((nome === "close" || nome === "auto_close" || nome === "finished") && envelopeId)
    return { tipo: "finalizou", envelopeId };
  return { tipo: "ignorar" };
}
```

- [ ] **Step 4: Rodar e confirmar que passa** — Run: `npm test -- src/tests/assinatura/webhook.test.ts` · Expected: PASS.
- [ ] **Step 5: Commit**

```bash
npm run lint && npm run typecheck && npm test -- src/tests/assinatura
git add src/lib/assinatura/webhook.ts src/tests/assinatura/webhook.test.ts
git commit -m "feat(assinatura): verificação HMAC + mapeamento de evento do webhook"
```

---

## Task 5: Server action de envio

**Files:** Create `src/app/(app)/clientes/[id]/assinatura.ts`.

**Interfaces:**
- Consumes: `enviarParaAssinatura` (T3); `createServerSupabase`, `createAdminSupabase`, `getPerfilAtual`, `podeGerenciarDocumentos`.
- Produces: `type EstadoAssinatura = { erro?: string; ok?: boolean }`; `export async function enviarAssinatura(documentoId: string, clienteId: string, _prev: EstadoAssinatura, formData: FormData): Promise<EstadoAssinatura>`.

- [ ] **Step 1: Implementar a action** (lógica de integração já testada em T3; coberta pelo E2E T9)

```ts
// src/app/(app)/clientes/[id]/assinatura.ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeGerenciarDocumentos } from "@/lib/clientes/permissoes";
import { enviarParaAssinatura } from "@/lib/assinatura/clicksign";
import type { SignatarioInput } from "@/lib/assinatura/tipos";

export type EstadoAssinatura = { erro?: string; ok?: boolean };

function sig(formData: FormData, prefixo: string, papel: SignatarioInput["papel"]): SignatarioInput | null {
  const nome = String(formData.get(`${prefixo}_nome`) ?? "").trim();
  const email = String(formData.get(`${prefixo}_email`) ?? "").trim();
  if (!nome || !email) return null;
  return { nome, email, papel };
}

export async function enviarAssinatura(
  documentoId: string,
  clienteId: string,
  _prev: EstadoAssinatura,
  formData: FormData,
): Promise<EstadoAssinatura> {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo) return { erro: "Sessão expirada ou conta inativa." };
  if (!podeGerenciarDocumentos(perfil.papel)) return { erro: "Sem permissão para enviar para assinatura." };

  // Signatários: contratante (cliente) + contratada (escritório) + testemunhas (opcionais)
  const contratante = sig(formData, "contratante", "contratante");
  const contratada = sig(formData, "contratada", "contratada");
  if (!contratante) return { erro: "Informe nome e e-mail do cliente (CONTRATANTE)." };
  if (!contratada) return { erro: "Informe nome e e-mail do representante do escritório." };
  const signatarios: SignatarioInput[] = [contratante, contratada];
  if (formData.get("incluir_testemunhas") === "on") {
    const t1 = sig(formData, "t1", "testemunha");
    const t2 = sig(formData, "t2", "testemunha");
    if (!t1 || !t2) return { erro: "Preencha nome e e-mail das duas testemunhas (ou desmarque)." };
    signatarios.push(t1, t2);
  }

  // Baixa o PDF do contrato (RLS: confirma acesso ao documento).
  const supabase = await createServerSupabase();
  const { data: doc } = await supabase
    .from("documentos")
    .select("nome, caminho_storage")
    .eq("id", documentoId)
    .maybeSingle();
  if (!doc) return { erro: "Documento não encontrado ou sem permissão." };

  const admin = createAdminSupabase();
  const baixado = await admin.storage.from("documentos").download(doc.caminho_storage);
  if (baixado.error || !baixado.data) return { erro: "Falha ao ler o contrato." };
  const pdf = Buffer.from(await baixado.data.arrayBuffer());

  let resultado;
  try {
    resultado = await enviarParaAssinatura({ pdf, nome: doc.nome.replace(/\.pdf$/i, ""), signatarios });
  } catch (e) {
    console.error("enviarAssinatura:", e instanceof Error ? e.message : e);
    return { erro: "Falha ao enviar para a Clicksign. Tente novamente." };
  }

  // Persiste (após o envelope existir): assinaturas + signatários.
  const { data: assinatura, error: aErr } = await supabase
    .from("assinaturas")
    .insert({
      cliente_id: clienteId,
      documento_id: documentoId,
      clicksign_envelope_id: resultado.envelopeId,
      clicksign_document_id: resultado.documentId,
      status: "enviado",
    })
    .select("id")
    .single();
  if (aErr || !assinatura) return { erro: "Enviado, mas falhou ao registrar. Verifique na Clicksign." };

  await supabase.from("assinatura_signatarios").insert(
    resultado.signatarios.map((s) => ({
      assinatura_id: assinatura.id,
      nome: s.nome,
      email: s.email,
      papel: s.papel,
      clicksign_key: s.clicksignKey,
      status: "pendente",
    })),
  );

  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
```

- [ ] **Step 2: Verificar lint/types** — Run: `npm run lint && npm run typecheck` · Expected: verde.
- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/clientes/[id]/assinatura.ts"
git commit -m "feat(assinatura): action de envio do contrato para a Clicksign"
```

---

## Task 6: Route handler do webhook

**Files:** Create `src/app/api/webhooks/clicksign/route.ts`.

**Interfaces:** Consumes `verificarHmac`, `mapearEvento` (T4); `baixarAssinado` (T3); `createAdminSupabase`.

- [ ] **Step 1: Implementar o route handler** (verificação e mapeamento já testados em T4; fluxo coberto pelo E2E T9)

```ts
// src/app/api/webhooks/clicksign/route.ts
import { NextResponse } from "next/server";
import { required } from "@/lib/env";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { verificarHmac, mapearEvento } from "@/lib/assinatura/webhook";
import { baixarAssinado } from "@/lib/assinatura/clicksign";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const corpo = await req.text(); // corpo CRU para o HMAC
  const assinatura = req.headers.get("x-clicksign-signature") ?? "";
  const segredo = required(process.env.CLICKSIGN_HMAC_SECRET, "CLICKSIGN_HMAC_SECRET");
  if (!verificarHmac(corpo, assinatura, segredo)) {
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ erro: "payload inválido" }, { status: 400 });
  }
  const ev = mapearEvento(payload);
  if (ev.tipo === "ignorar") return NextResponse.json({ ok: true });

  const admin = createAdminSupabase();
  const { data: assin } = await admin
    .from("assinaturas")
    .select("id, cliente_id, clicksign_document_id, documento_assinado_id, status")
    .eq("clicksign_envelope_id", ev.envelopeId)
    .maybeSingle();
  if (!assin) return NextResponse.json({ ok: true }); // envelope não é nosso: ignora

  if (ev.tipo === "assinou") {
    await admin
      .from("assinatura_signatarios")
      .update({ status: "assinado", assinado_em: new Date().toISOString() })
      .eq("assinatura_id", assin.id)
      .eq("email", ev.email)
      .neq("status", "assinado"); // idempotente
    if (assin.status === "enviado") await admin.from("assinaturas").update({ status: "parcial" }).eq("id", assin.id);
  } else if (ev.tipo === "recusou") {
    await admin
      .from("assinatura_signatarios")
      .update({ status: "recusado" })
      .eq("assinatura_id", assin.id)
      .eq("email", ev.email);
    await admin.from("assinaturas").update({ status: "recusado" }).eq("id", assin.id);
  } else if (ev.tipo === "finalizou") {
    if (assin.documento_assinado_id) return NextResponse.json({ ok: true }); // já processado
    const pdf = assin.clicksign_document_id
      ? await baixarAssinado(ev.envelopeId, assin.clicksign_document_id)
      : null;
    let docAssinadoId: string | null = null;
    if (pdf) {
      const caminho = `${assin.cliente_id}/contrato-assinado-${Date.now()}.pdf`;
      const up = await admin.storage.from("documentos").upload(caminho, pdf, { contentType: "application/pdf" });
      if (!up.error) {
        const { data: novo } = await admin
          .from("documentos")
          .insert({ cliente_id: assin.cliente_id, nome: "Contrato assinado.pdf", tipo: "Contrato assinado", caminho_storage: caminho })
          .select("id")
          .single();
        docAssinadoId = novo?.id ?? null;
      }
    }
    await admin
      .from("assinaturas")
      .update({ status: "finalizado", finalizado_em: new Date().toISOString(), documento_assinado_id: docAssinadoId })
      .eq("id", assin.id);
  }

  return NextResponse.json({ ok: true });
}
```

> Nota: `documentos.enviado_por` é **nullable** (migration 0005: `uuid references usuarios(id)`, sem `not null`) — o insert do webhook (via service_role, sem usuário) grava `enviado_por = null`, o que é aceito.

- [ ] **Step 2: Verificar lint/types/build** — Run: `npm run lint && npm run typecheck && npm run build` · Expected: verde; rota `/api/webhooks/clicksign` na saída.
- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhooks/clicksign/route.ts
git commit -m "feat(assinatura): webhook Clicksign (HMAC, status, salvar assinado)"
```

---

## Task 7: UI — enviar + status na ficha

**Files:** Create `src/components/assinatura/EnviarAssinatura.tsx`, `src/components/assinatura/StatusAssinatura.tsx`; Modify `src/components/documentos/DocumentosSection.tsx`, `src/app/(app)/clientes/[id]/page.tsx`.

**Interfaces:** Consumes `enviarAssinatura` (T5).

- [ ] **Step 1: `EnviarAssinatura.tsx`** (botão que revela o form)

```tsx
// src/components/assinatura/EnviarAssinatura.tsx
"use client";
import { useActionState, useState } from "react";
import { enviarAssinatura, type EstadoAssinatura } from "@/app/(app)/clientes/[id]/assinatura";

export function EnviarAssinatura({
  documentoId,
  clienteId,
  clienteNome,
  clienteEmail,
}: {
  documentoId: string;
  clienteId: string;
  clienteNome: string;
  clienteEmail: string;
}) {
  const action = enviarAssinatura.bind(null, documentoId, clienteId);
  const [estado, formAction, pending] = useActionState<EstadoAssinatura, FormData>(action, {});
  const [aberto, setAberto] = useState(false);
  const [testemunhas, setTestemunhas] = useState(false);
  if (estado.ok) return <span className="text-xs text-green-700">Enviado para assinatura ✓</span>;
  if (!aberto)
    return (
      <button onClick={() => setAberto(true)} className="rounded border px-2 py-1 text-xs text-slate-700">
        Enviar para assinatura
      </button>
    );
  return (
    <form action={formAction} className="mt-2 space-y-2 rounded border border-slate-200 p-3 text-sm">
      <p className="font-medium">Cliente (CONTRATANTE)</p>
      <input name="contratante_nome" defaultValue={clienteNome} placeholder="Nome" required className="w-full rounded border px-2 py-1" />
      <input name="contratante_email" type="email" defaultValue={clienteEmail} placeholder="E-mail" required className="w-full rounded border px-2 py-1" />
      <p className="font-medium">Representante do escritório (CONTRATADA)</p>
      <input name="contratada_nome" placeholder="Nome" required className="w-full rounded border px-2 py-1" />
      <input name="contratada_email" type="email" placeholder="E-mail" required className="w-full rounded border px-2 py-1" />
      <label className="flex items-center gap-2">
        <input type="checkbox" name="incluir_testemunhas" checked={testemunhas} onChange={(e) => setTestemunhas(e.target.checked)} />
        Incluir 2 testemunhas
      </label>
      {testemunhas && (
        <div className="space-y-2">
          <input name="t1_nome" placeholder="Testemunha 1 — nome" className="w-full rounded border px-2 py-1" />
          <input name="t1_email" type="email" placeholder="Testemunha 1 — e-mail" className="w-full rounded border px-2 py-1" />
          <input name="t2_nome" placeholder="Testemunha 2 — nome" className="w-full rounded border px-2 py-1" />
          <input name="t2_email" type="email" placeholder="Testemunha 2 — e-mail" className="w-full rounded border px-2 py-1" />
        </div>
      )}
      {estado.erro && <p role="alert" className="text-red-600">{estado.erro}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-60">
          {pending ? "Enviando..." : "Enviar"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="rounded border px-3 py-1">
          Cancelar
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: `StatusAssinatura.tsx`** (indicador)

```tsx
// src/components/assinatura/StatusAssinatura.tsx
type Signatario = { nome: string; papel: string; status: string };
export function StatusAssinatura({ status, signatarios }: { status: string; signatarios: Signatario[] }) {
  const assinados = signatarios.filter((s) => s.status === "assinado").length;
  const rotulo =
    status === "finalizado"
      ? "Finalizado ✓"
      : status === "recusado"
        ? "Recusado ✗"
        : `Aguardando (${assinados}/${signatarios.length})`;
  return (
    <div className="text-xs">
      <span className="font-medium">{rotulo}</span>
      <ul className="mt-1 text-slate-600">
        {signatarios.map((s) => (
          <li key={s.nome + s.papel}>
            {s.papel}: {s.nome} — {s.status}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Integrar no `DocumentosSection.tsx`** — carregar as assinaturas do cliente e, para documentos com `tipo` começando por "Contrato", renderizar o envio/status. Alterar a assinatura do componente para receber `clienteNome`/`clienteEmail`, carregar `assinaturas` (com signatários) num mapa por `documento_id`, e na coluna "Ações":

```tsx
// no topo do arquivo:
import { EnviarAssinatura } from "@/components/assinatura/EnviarAssinatura";
import { StatusAssinatura } from "@/components/assinatura/StatusAssinatura";
// props: adicionar clienteNome: string; clienteEmail: string;
// após carregar `documentos`, carregar assinaturas:
const { data: assinaturas } = await supabase
  .from("assinaturas")
  .select("documento_id, status, assinatura_signatarios(nome, papel, status)")
  .eq("cliente_id", clienteId);
const porDoc = new Map((assinaturas ?? []).map((a) => [a.documento_id, a]));
// na coluna Ações, para d.tipo?.startsWith("Contrato") e podeGerenciar:
//   {porDoc.get(d.id)
//     ? <StatusAssinatura status={porDoc.get(d.id)!.status} signatarios={porDoc.get(d.id)!.assinatura_signatarios} />
//     : d.tipo === "Contrato" && podeGerenciar && (
//         <EnviarAssinatura documentoId={d.id} clienteId={clienteId} clienteNome={clienteNome} clienteEmail={clienteEmail} />
//       )}
```

- [ ] **Step 4: Passar `clienteNome`/`clienteEmail` na ficha `page.tsx`** — no `<DocumentosSection .../>`, adicionar `clienteNome={cliente.responsavel_nome ?? cliente.razao_social}` e `clienteEmail={cliente.email ?? ""}`. Garantir que o `.select` da ficha já traz `email` e `responsavel_nome` (traz — ver Task V3).

- [ ] **Step 5: Verificar lint/types/build** — Run: `npm run lint && npm run typecheck && npm run build` · Expected: verde.
- [ ] **Step 6: Commit**

```bash
git add src/components/assinatura "src/components/documentos/DocumentosSection.tsx" "src/app/(app)/clientes/[id]/page.tsx"
git commit -m "feat(assinatura): UI de envio e status na ficha do cliente"
```

---

## Task 8: Configuração e deploy

**Files:** Modify `.env.local.example`, `docs/DEPLOY.md`.

- [ ] **Step 1: Variáveis em `.env.local.example`**

```
# Clicksign (V4 — assinatura digital). Segredos runtime, só no servidor.
CLICKSIGN_URL=https://sandbox.clicksign.com/api/v3
CLICKSIGN_TOKEN=
CLICKSIGN_HMAC_SECRET=
```

- [ ] **Step 2: Guia no `docs/DEPLOY.md`** — acrescentar seção "Clicksign (V4)": (a) gerar o `access_token` no painel (sandbox → produção); (b) definir `CLICKSIGN_URL`/`CLICKSIGN_TOKEN`/`CLICKSIGN_HMAC_SECRET` no app (runtime → restart, sem rebuild); (c) cadastrar o **webhook** apontando para `https://<app>/api/webhooks/clicksign` com o mesmo `CLICKSIGN_HMAC_SECRET`; (d) trocar sandbox→produção só muda URL/token.

- [ ] **Step 3: Commit**

```bash
git add .env.local.example docs/DEPLOY.md
git commit -m "docs(assinatura): variáveis Clicksign + registro do webhook no deploy"
```

---

## Task 9: Verificação E2E (sandbox)

**Files:** nenhuma (verificação).

- [ ] **Step 1:** Definir no `.env.local` `CLICKSIGN_URL` (sandbox), `CLICKSIGN_TOKEN` (sandbox), `CLICKSIGN_HMAC_SECRET`. Subir o app (`npm run dev`).
- [ ] **Step 2:** Cadastrar o webhook do sandbox apontando para a URL pública do app (túnel, ex.: `cloudflared`/`ngrok`) → `/api/webhooks/clicksign`.
- [ ] **Step 3:** Gerar um contrato (V3) para um cliente com e-mail; na aba Documentos, **Enviar para assinatura** (com/sem testemunhas). Conferir na Clicksign (sandbox) que o envelope foi criado com o documento e os signatários corretos.
- [ ] **Step 4:** Assinar como cada signatário no sandbox. Conferir que o webhook chega, o **status** na ficha avança (`parcial` → `finalizado`) e o **PDF assinado** aparece nos Documentos.
- [ ] **Step 5:** Confirmar os campos reais do payload do webhook e da URL do assinado; ajustar `mapearEvento`/`baixarAssinado` **se** divergirem do assumido (isolados nesses dois pontos).
- [ ] **Step 6: Suíte completa** — Run: `npm run lint && npm run typecheck && npm test && npm run db:test` · Expected: verde.
- [ ] **Step 7:** Atualizar `CHANGELOG.md`/`ROADMAP.md` (V4) e finalizar a branch (release `v4.0.0`).

---

## Self-Review (resultado)

- **Cobertura do spec:** §4 API → T3/T4; §5 modelo → T1; §6 arquitetura → T2–T7; §7 envio → T5/T7; §8 webhook → T4/T6; §9 erros → T3/T5/T6; §10 testes → T3/T4 + T9; §11 segurança (HMAC, segredos) → T4/T6/T8.
- **Placeholders:** sem TODO/TBD; código concreto em cada passo. Pontos incertos da API (payload do webhook, URL do assinado) estão isolados em `mapearEvento`/`baixarAssinado`, com confirmação explícita no E2E (T9) — não são placeholders de plano, e sim variação de terceiros validada em ambiente.
- **Consistência de tipos:** `SignatarioInput`/`ResultadoEnvio`/`EventoAssinatura` (T2) usados em T3–T6; `enviarParaAssinatura`/`baixarAssinado` (T3) consumidos em T5/T6; `verificarHmac`/`mapearEvento` (T4) em T6; `EstadoAssinatura` (T5) em T7.
- **Risco resolvido:** `documentos.enviado_por` é nullable (migration 0005) — o insert do webhook grava `null`, sem migration extra.
