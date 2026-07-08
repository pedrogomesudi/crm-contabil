# Onboarding de cliente (RF-010) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Workflow de onboarding de cliente com checklist configurável (modelo editável), acompanhamento por cliente, cofre de credenciais cifradas nos acessos e lista global.

**Architecture:** Migration com modelo + itens por cliente + auditoria; cripto reutilizando o AES-GCM do NFS-e; helpers puros de progresso; actions (modelo, global, por-cliente, revelar-senha) gated por RBAC; UI com aba no cliente, lista global e editor do modelo. Spec: `docs/superpowers/specs/2026-07-07-onboarding-rf010-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase (Postgres/RLS), Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Todos passam.
- Migration nova em `supabase/migrations/`, aplicada por `npm run db:migrate` (NUNCA `supabase db push`). Idempotente. Atinge produção. Enums criados inteiros (sem `ALTER TYPE ADD VALUE`).
- Cofre: senha cifrada com AES-GCM (`src/lib/nfse/cripto.ts`), chave `ONBOARDING_CRIPTO_KEY` (hex 32 bytes). Nunca retornar `acesso_senha_cifrada` na listagem. Revelar senha só admin/contador + auditoria.
- RBAC: modelo → admin (`podeGerenciarModeloOnboarding`); itens do cliente → admin/contador/assistente (`podeCriarCliente`); revelar senha → admin/contador (`podeRevelarCredencial`).
- Tokens SALDO na UI. Branch: `git checkout -b feat/onboarding develop`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `supabase/migrations/0048_onboarding.sql` — **novo**: 2 enums + 3 tabelas + RLS.
- `src/lib/onboarding/credencial.ts` — **novo**: `cifrarSenha`/`decifrarSenha`.
- `src/lib/onboarding/progresso.ts` — **novo**: tipos + helpers puros.
- `src/lib/clientes/permissoes.ts` — **modificar**: 2 gates novos.
- `src/tests/onboarding/credencial.test.ts`, `src/tests/onboarding/progresso.test.ts` — **novos**.
- `src/app/(app)/onboarding/actions.ts` — **novo**: modelo + lista global.
- `src/app/(app)/clientes/[id]/onboarding.ts` — **novo**: actions por cliente.
- `src/components/onboarding/OnboardingSection.tsx` — **novo**: aba do cliente.
- `src/app/(app)/onboarding/page.tsx` + `ListaOnboarding.tsx` — **novos**: lista global.
- `src/app/(app)/configuracoes/onboarding/page.tsx` + `EditorModelo.tsx` — **novos**: editor do modelo.
- `src/app/(app)/clientes/[id]/page.tsx` — **modificar**: renderiza a seção.
- `src/components/Sidebar.tsx`, `src/app/(app)/configuracoes/page.tsx` — **modificar**: links.
- `src/tests/onboarding/onboarding-section-render.test.tsx` — **novo**: smoke.

---

## Task 1: Migration — tabelas de onboarding

**Files:**
- Create: `supabase/migrations/0048_onboarding.sql`

- [ ] **Step 1: Criar a migration**

```sql
do $$ begin create type onboarding_categoria as enum ('documento','procuracao','certificado','acesso','responsavel'); exception when duplicate_object then null; end $$;
do $$ begin create type onboarding_status as enum ('pendente','concluido','dispensado'); exception when duplicate_object then null; end $$;

create table if not exists onboarding_item_modelo (
  id uuid primary key default gen_random_uuid(),
  categoria onboarding_categoria not null,
  nome text not null,
  obrigatorio boolean not null default true,
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists onboarding_item (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  categoria onboarding_categoria not null,
  nome text not null,
  obrigatorio boolean not null default true,
  ordem int not null default 0,
  status onboarding_status not null default 'pendente',
  responsavel_id uuid references usuarios(id),
  prazo date,
  observacao text,
  anexo_path text,
  acesso_url text,
  acesso_login text,
  acesso_senha_cifrada text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
create index if not exists idx_onboarding_item_cliente on onboarding_item(cliente_id);

create table if not exists onboarding_log_credencial (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references onboarding_item(id) on delete cascade,
  usuario_id uuid references usuarios(id),
  em timestamptz not null default now()
);

alter table onboarding_item_modelo enable row level security;
alter table onboarding_item enable row level security;
alter table onboarding_log_credencial enable row level security;

do $$ begin
  drop policy if exists onboarding_modelo_sel on onboarding_item_modelo;
  create policy onboarding_modelo_sel on onboarding_item_modelo for select to authenticated using (auth_papel() in ('admin','contador','assistente'));
  drop policy if exists onboarding_modelo_wr on onboarding_item_modelo;
  create policy onboarding_modelo_wr on onboarding_item_modelo for all to authenticated using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
  drop policy if exists onboarding_item_all on onboarding_item;
  create policy onboarding_item_all on onboarding_item for all to authenticated using (auth_papel() in ('admin','contador','assistente')) with check (auth_papel() in ('admin','contador','assistente'));
  drop policy if exists onboarding_log_ins on onboarding_log_credencial;
  create policy onboarding_log_ins on onboarding_log_credencial for insert to authenticated with check (auth_papel() in ('admin','contador'));
  drop policy if exists onboarding_log_sel on onboarding_log_credencial;
  create policy onboarding_log_sel on onboarding_log_credencial for select to authenticated using (auth_papel() = 'admin');
end $$;
```

- [ ] **Step 2: Aplicar + verificar**

Run: `npm run db:migrate`
Then:
```bash
node --env-file=.env.local -e "import('./scripts/_db.mjs').then(async({makeClient})=>{const c=makeClient();await c.connect();const t=await c.query(\"select table_name from information_schema.tables where table_name like 'onboarding%' order by table_name\");console.log('tabelas:',t.rows.map(r=>r.table_name));const p=await c.query(\"select count(*) n from pg_policies where tablename like 'onboarding%'\");console.log('policies:',p.rows[0].n);await c.end();});"
```
Expected: `tabelas: [ 'onboarding_item', 'onboarding_item_modelo', 'onboarding_log_credencial' ]` e `policies: 6`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0048_onboarding.sql
git commit -m "feat(onboarding): tabelas modelo/item/auditoria + RLS

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Cripto de credencial (TDD) + gates RBAC

**Files:**
- Create: `src/lib/onboarding/credencial.ts`
- Modify: `src/lib/clientes/permissoes.ts`
- Test: `src/tests/onboarding/credencial.test.ts`

**Interfaces:**
- Consumes: `cifrar`/`decifrar` de `@/lib/nfse/cripto`.
- Produces: `cifrarSenha(senha: string): string`, `decifrarSenha(pacote: string): string`; `podeRevelarCredencial(papel)`, `podeGerenciarModeloOnboarding(papel)`.

- [ ] **Step 1: Escrever os testes**

Criar `src/tests/onboarding/credencial.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cifrarSenha, decifrarSenha } from "@/lib/onboarding/credencial";

describe("credencial", () => {
  const orig = process.env.ONBOARDING_CRIPTO_KEY;
  beforeEach(() => {
    process.env.ONBOARDING_CRIPTO_KEY = "a".repeat(64);
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.ONBOARDING_CRIPTO_KEY;
    else process.env.ONBOARDING_CRIPTO_KEY = orig;
  });
  it("round-trip cifra/decifra", () => {
    const pacote = cifrarSenha("s3nh@!Portal");
    expect(pacote).not.toContain("s3nh@");
    expect(decifrarSenha(pacote)).toBe("s3nh@!Portal");
  });
  it("sem chave → erro claro", () => {
    delete process.env.ONBOARDING_CRIPTO_KEY;
    expect(() => cifrarSenha("x")).toThrow(/ONBOARDING_CRIPTO_KEY/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- onboarding/credencial`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/lib/onboarding/credencial.ts`**

```ts
import { cifrar, decifrar } from "@/lib/nfse/cripto";

function chave(): string {
  const k = process.env.ONBOARDING_CRIPTO_KEY;
  if (!k) throw new Error("ONBOARDING_CRIPTO_KEY não configurada");
  return k;
}

// Cifra uma senha de portal (AES-GCM). Retorna o pacote string; nunca sai em texto.
export function cifrarSenha(senha: string): string {
  return cifrar(Buffer.from(senha, "utf8"), chave());
}

// Decifra o pacote (só no servidor, em ação gated + auditada).
export function decifrarSenha(pacote: string): string {
  return decifrar(pacote, chave()).toString("utf8");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- onboarding/credencial`
Expected: PASS (2 testes).

- [ ] **Step 5: Adicionar os gates em `src/lib/clientes/permissoes.ts`**

Adicionar ao final do arquivo (o arquivo já importa `Papel`):
```ts
// Revelar senha de acesso (cofre): só admin e contador.
export function podeRevelarCredencial(papel: Papel | undefined): boolean {
  return papel === "admin" || papel === "contador";
}

// Editar o checklist-modelo de onboarding: só admin.
export function podeGerenciarModeloOnboarding(papel: Papel | undefined): boolean {
  return papel === "admin";
}
```

- [ ] **Step 6: Verificar + commit**

Run: `npm test -- onboarding/credencial && npm run lint && npm run typecheck`
Expected: PASS, sem erros.

```bash
git add src/lib/onboarding/credencial.ts src/tests/onboarding/credencial.test.ts src/lib/clientes/permissoes.ts
git commit -m "feat(onboarding): cofre de senha (cifra/decifra) + gates RBAC

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Helpers puros de progresso (TDD)

**Files:**
- Create: `src/lib/onboarding/progresso.ts`
- Test: `src/tests/onboarding/progresso.test.ts`

**Interfaces:**
- Produces: tipos `CategoriaOnb`, `StatusOnb`, `ItemOnb`; `progressoOnboarding`, `agruparPorCategoria`, `proximoPrazo`.

- [ ] **Step 1: Escrever os testes**

Criar `src/tests/onboarding/progresso.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { progressoOnboarding, agruparPorCategoria, proximoPrazo, type ItemOnb } from "@/lib/onboarding/progresso";

const item = (over: Partial<ItemOnb>): ItemOnb => ({ id: "x", categoria: "documento", nome: "Doc", obrigatorio: true, ordem: 0, status: "pendente", prazo: null, ...over });

describe("progressoOnboarding", () => {
  it("vazio", () => {
    expect(progressoOnboarding([])).toEqual({ total: 0, concluidos: 0, obrigatoriosPendentes: 0, pct: 0, concluido: false });
  });
  it("parcial", () => {
    const p = progressoOnboarding([item({ status: "concluido" }), item({ status: "pendente" })]);
    expect(p).toMatchObject({ total: 2, concluidos: 1, obrigatoriosPendentes: 1, pct: 50, concluido: false });
  });
  it("concluído quando todos obrigatórios ok/dispensado", () => {
    const p = progressoOnboarding([item({ status: "concluido" }), item({ obrigatorio: false, status: "pendente" }), item({ status: "dispensado" })]);
    expect(p.concluido).toBe(true);
  });
});

describe("agruparPorCategoria", () => {
  it("ordem das categorias + ordem interna", () => {
    const g = agruparPorCategoria([item({ categoria: "acesso", ordem: 2 }), item({ categoria: "documento", ordem: 1 }), item({ categoria: "acesso", ordem: 1 })]);
    expect(g.map((x) => x.categoria)).toEqual(["documento", "acesso"]);
    expect(g[1].itens.map((i) => i.ordem)).toEqual([1, 2]);
  });
});

describe("proximoPrazo", () => {
  it("menor prazo entre pendentes", () => {
    expect(proximoPrazo([item({ status: "pendente", prazo: "2026-08-10" }), item({ status: "concluido", prazo: "2026-07-01" }), item({ status: "pendente", prazo: "2026-07-20" })])).toBe("2026-07-20");
  });
  it("sem prazos pendentes → null", () => {
    expect(proximoPrazo([item({ status: "concluido", prazo: "2026-07-01" })])).toBe(null);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- onboarding/progresso`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/lib/onboarding/progresso.ts`**

```ts
export type CategoriaOnb = "documento" | "procuracao" | "certificado" | "acesso" | "responsavel";
export type StatusOnb = "pendente" | "concluido" | "dispensado";
export type ItemOnb = { id: string; categoria: CategoriaOnb; nome: string; obrigatorio: boolean; ordem: number; status: StatusOnb; prazo: string | null };

const ORDEM_CAT: CategoriaOnb[] = ["documento", "procuracao", "certificado", "acesso", "responsavel"];

export function progressoOnboarding(itens: ItemOnb[]): { total: number; concluidos: number; obrigatoriosPendentes: number; pct: number; concluido: boolean } {
  const total = itens.length;
  const concluidos = itens.filter((i) => i.status === "concluido").length;
  const obrigatoriosPendentes = itens.filter((i) => i.obrigatorio && i.status === "pendente").length;
  const pct = total === 0 ? 0 : Math.round((concluidos / total) * 100);
  const concluido = total > 0 && itens.filter((i) => i.obrigatorio).every((i) => i.status === "concluido" || i.status === "dispensado");
  return { total, concluidos, obrigatoriosPendentes, pct, concluido };
}

export function agruparPorCategoria<T extends { categoria: CategoriaOnb; ordem: number }>(itens: T[]): { categoria: CategoriaOnb; itens: T[] }[] {
  return ORDEM_CAT.map((categoria) => ({
    categoria,
    itens: itens.filter((i) => i.categoria === categoria).sort((a, b) => a.ordem - b.ordem),
  })).filter((g) => g.itens.length > 0);
}

export function proximoPrazo(itens: ItemOnb[]): string | null {
  const prazos = itens
    .filter((i) => i.status === "pendente" && i.prazo)
    .map((i) => i.prazo as string)
    .sort();
  return prazos[0] ?? null;
}
```

- [ ] **Step 4: Rodar e ver passar + lint/typecheck**

Run: `npm test -- onboarding/progresso && npm run lint && npm run typecheck`
Expected: PASS, sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding/progresso.ts src/tests/onboarding/progresso.test.ts
git commit -m "feat(onboarding): helpers de progresso/agrupamento/prazo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Actions — modelo + lista global

**Files:**
- Create: `src/app/(app)/onboarding/actions.ts`

**Interfaces:**
- Consumes: `podeCriarCliente`, `podeGerenciarModeloOnboarding`; `progressoOnboarding`, `proximoPrazo`, tipos `CategoriaOnb`, `ItemOnb`.
- Produces:
  - `type ItemModelo = { id: string; categoria: CategoriaOnb; nome: string; obrigatorio: boolean; ordem: number; ativo: boolean }`.
  - `listarModelo()`, `salvarModeloItem(input)`, `removerModeloItem(id)`.
  - `type OnboardingResumo = { clienteId: string; razaoSocial: string; total: number; concluidos: number; pct: number; concluido: boolean; proximoPrazo: string | null }`.
  - `listarOnboardings()`.

- [ ] **Step 1: Criar `actions.ts`**

```ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente, podeGerenciarModeloOnboarding } from "@/lib/clientes/permissoes";
import { progressoOnboarding, proximoPrazo, type CategoriaOnb, type ItemOnb } from "@/lib/onboarding/progresso";

export type ItemModelo = { id: string; categoria: CategoriaOnb; nome: string; obrigatorio: boolean; ordem: number; ativo: boolean };

export async function listarModelo(): Promise<ItemModelo[]> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("onboarding_item_modelo").select("id, categoria, nome, obrigatorio, ordem, ativo").order("ordem");
  return (data ?? []) as ItemModelo[];
}

export async function salvarModeloItem(input: { id?: string; categoria: CategoriaOnb; nome: string; obrigatorio: boolean; ordem: number; ativo: boolean }): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const row = { categoria: input.categoria, nome: input.nome, obrigatorio: input.obrigatorio, ordem: input.ordem, ativo: input.ativo };
  const { error } = input.id
    ? await supabase.from("onboarding_item_modelo").update(row).eq("id", input.id)
    : await supabase.from("onboarding_item_modelo").insert(row);
  return error ? { erro: "Falha ao salvar." } : { ok: true };
}

export async function removerModeloItem(id: string): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("onboarding_item_modelo").delete().eq("id", id);
  return error ? { erro: "Falha ao remover." } : { ok: true };
}

export type OnboardingResumo = { clienteId: string; razaoSocial: string; total: number; concluidos: number; pct: number; concluido: boolean; proximoPrazo: string | null };

export async function listarOnboardings(): Promise<OnboardingResumo[]> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("onboarding_item").select("cliente_id, categoria, nome, obrigatorio, ordem, status, prazo, clientes(razao_social)");
  const porCliente = new Map<string, { razao: string; itens: ItemOnb[] }>();
  for (const r of data ?? []) {
    const cli = Array.isArray(r.clientes) ? r.clientes[0] : r.clientes;
    const e = porCliente.get(r.cliente_id as string) ?? { razao: (cli?.razao_social as string) ?? "—", itens: [] };
    e.itens.push({ id: "", categoria: r.categoria as CategoriaOnb, nome: r.nome as string, obrigatorio: r.obrigatorio as boolean, ordem: r.ordem as number, status: r.status as ItemOnb["status"], prazo: r.prazo as string | null });
    porCliente.set(r.cliente_id as string, e);
  }
  const out: OnboardingResumo[] = [];
  for (const [clienteId, { razao, itens }] of porCliente) {
    const prog = progressoOnboarding(itens);
    out.push({ clienteId, razaoSocial: razao, total: prog.total, concluidos: prog.concluidos, pct: prog.pct, concluido: prog.concluido, proximoPrazo: proximoPrazo(itens) });
  }
  return out.sort((a, b) => a.pct - b.pct);
}
```

- [ ] **Step 2: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: sem erros.

```bash
git add "src/app/(app)/onboarding/actions.ts"
git commit -m "feat(onboarding): actions do modelo + lista global

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Actions — por cliente (incl. revelar senha)

**Files:**
- Create: `src/app/(app)/clientes/[id]/onboarding.ts`

**Interfaces:**
- Consumes: `podeCriarCliente`, `podeRevelarCredencial`; `cifrarSenha`, `decifrarSenha`; `progressoOnboarding`, tipos `CategoriaOnb`, `StatusOnb`, `ItemOnb`.
- Produces:
  - `type ItemClienteView = { id: string; categoria: CategoriaOnb; nome: string; obrigatorio: boolean; ordem: number; status: StatusOnb; responsavelId: string | null; prazo: string | null; observacao: string | null; acessoUrl: string | null; acessoLogin: string | null; temSenha: boolean }`.
  - `listarOnboardingCliente(clienteId)`, `iniciarOnboarding(clienteId)`, `salvarItemOnboarding(input)`, `removerItemOnboarding(id, clienteId)`, `revelarSenha(itemId)`.

- [ ] **Step 1: Criar `onboarding.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente, podeRevelarCredencial } from "@/lib/clientes/permissoes";
import { cifrarSenha, decifrarSenha } from "@/lib/onboarding/credencial";
import { progressoOnboarding, type CategoriaOnb, type StatusOnb, type ItemOnb } from "@/lib/onboarding/progresso";

export type ItemClienteView = {
  id: string;
  categoria: CategoriaOnb;
  nome: string;
  obrigatorio: boolean;
  ordem: number;
  status: StatusOnb;
  responsavelId: string | null;
  prazo: string | null;
  observacao: string | null;
  acessoUrl: string | null;
  acessoLogin: string | null;
  temSenha: boolean;
};

export async function listarOnboardingCliente(clienteId: string): Promise<{ itens: ItemClienteView[]; progresso: ReturnType<typeof progressoOnboarding> } | null> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("onboarding_item")
    .select("id, categoria, nome, obrigatorio, ordem, status, responsavel_id, prazo, observacao, acesso_url, acesso_login, acesso_senha_cifrada")
    .eq("cliente_id", clienteId)
    .order("ordem");
  const itens: ItemClienteView[] = (data ?? []).map((r) => ({
    id: r.id as string,
    categoria: r.categoria as CategoriaOnb,
    nome: r.nome as string,
    obrigatorio: r.obrigatorio as boolean,
    ordem: r.ordem as number,
    status: r.status as StatusOnb,
    responsavelId: (r.responsavel_id as string | null) ?? null,
    prazo: (r.prazo as string | null) ?? null,
    observacao: (r.observacao as string | null) ?? null,
    acessoUrl: (r.acesso_url as string | null) ?? null,
    acessoLogin: (r.acesso_login as string | null) ?? null,
    temSenha: !!r.acesso_senha_cifrada,
  }));
  const itensProg: ItemOnb[] = itens.map((i) => ({ id: i.id, categoria: i.categoria, nome: i.nome, obrigatorio: i.obrigatorio, ordem: i.ordem, status: i.status, prazo: i.prazo }));
  return { itens, progresso: progressoOnboarding(itensProg) };
}

export async function iniciarOnboarding(clienteId: string): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { count } = await supabase.from("onboarding_item").select("id", { count: "exact", head: true }).eq("cliente_id", clienteId);
  if ((count ?? 0) > 0) return { ok: true };
  const { data: modelo } = await supabase.from("onboarding_item_modelo").select("categoria, nome, obrigatorio, ordem").eq("ativo", true).order("ordem");
  if (!modelo || modelo.length === 0) return { erro: "Configure o checklist-modelo primeiro (Configurações → Checklist de onboarding)." };
  const linhas = modelo.map((m) => ({ cliente_id: clienteId, categoria: m.categoria, nome: m.nome, obrigatorio: m.obrigatorio, ordem: m.ordem }));
  const { error } = await supabase.from("onboarding_item").insert(linhas);
  if (error) return { erro: "Falha ao iniciar." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

export async function salvarItemOnboarding(input: {
  id?: string;
  clienteId: string;
  categoria: CategoriaOnb;
  nome: string;
  obrigatorio: boolean;
  status: StatusOnb;
  responsavelId: string | null;
  prazo: string | null;
  observacao: string | null;
  acessoUrl: string | null;
  acessoLogin: string | null;
  novaSenha?: string | null;
}): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const row: Record<string, unknown> = {
    cliente_id: input.clienteId,
    categoria: input.categoria,
    nome: input.nome,
    obrigatorio: input.obrigatorio,
    status: input.status,
    responsavel_id: input.responsavelId,
    prazo: input.prazo || null,
    observacao: input.observacao,
    acesso_url: input.acessoUrl,
    acesso_login: input.acessoLogin,
    atualizado_em: new Date().toISOString(),
    atualizado_por: p.id,
  };
  if (input.novaSenha) {
    try {
      row.acesso_senha_cifrada = cifrarSenha(input.novaSenha);
    } catch {
      return { erro: "Cofre de senhas não configurado (ONBOARDING_CRIPTO_KEY)." };
    }
  }
  const { error } = input.id
    ? await supabase.from("onboarding_item").update(row).eq("id", input.id)
    : await supabase.from("onboarding_item").insert(row);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath(`/clientes/${input.clienteId}`);
  return { ok: true };
}

export async function removerItemOnboarding(id: string, clienteId: string): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("onboarding_item").delete().eq("id", id);
  if (error) return { erro: "Falha ao remover." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

export async function revelarSenha(itemId: string): Promise<{ senha?: string; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeRevelarCredencial(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("onboarding_item").select("acesso_senha_cifrada").eq("id", itemId).maybeSingle();
  if (!data?.acesso_senha_cifrada) return { erro: "Sem senha cadastrada." };
  let senha: string;
  try {
    senha = decifrarSenha(data.acesso_senha_cifrada as string);
  } catch {
    return { erro: "Falha ao decifrar (chave?)." };
  }
  await supabase.from("onboarding_log_credencial").insert({ item_id: itemId, usuario_id: p.id });
  return { senha };
}
```

- [ ] **Step 2: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: sem erros.

```bash
git add "src/app/(app)/clientes/[id]/onboarding.ts"
git commit -m "feat(onboarding): actions por cliente + revelar senha auditado

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: UI — aba do cliente + wire na página + smoke

**Files:**
- Create: `src/components/onboarding/OnboardingSection.tsx`
- Modify: `src/app/(app)/clientes/[id]/page.tsx`
- Test: `src/tests/onboarding/onboarding-section-render.test.tsx`

**Interfaces:**
- Consumes: `iniciarOnboarding`, `salvarItemOnboarding`, `removerItemOnboarding`, `revelarSenha`, `type ItemClienteView` (T5); `agruparPorCategoria`, tipos `CategoriaOnb`, `StatusOnb` (T3); `Botao`.

- [ ] **Step 1: Smoke test (mock das actions)**

Criar `src/tests/onboarding/onboarding-section-render.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/(app)/clientes/[id]/onboarding", () => ({
  iniciarOnboarding: vi.fn(),
  salvarItemOnboarding: vi.fn(),
  removerItemOnboarding: vi.fn(),
  revelarSenha: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { renderToStaticMarkup } from "react-dom/server";
import { OnboardingSection } from "@/components/onboarding/OnboardingSection";
import type { ItemClienteView } from "@/app/(app)/clientes/[id]/onboarding";

const prog = { total: 2, concluidos: 1, obrigatoriosPendentes: 1, pct: 50, concluido: false };
const itens: ItemClienteView[] = [
  { id: "1", categoria: "documento", nome: "Contrato social", obrigatorio: true, ordem: 1, status: "concluido", responsavelId: null, prazo: null, observacao: null, acessoUrl: null, acessoLogin: null, temSenha: false },
  { id: "2", categoria: "acesso", nome: "e-CAC", obrigatorio: true, ordem: 1, status: "pendente", responsavelId: null, prazo: "2026-08-01", observacao: null, acessoUrl: "https://cav.receita.fazenda.gov.br", acessoLogin: "12345", temSenha: true },
];

describe("OnboardingSection", () => {
  it("estado vazio mostra iniciar", () => {
    const html = renderToStaticMarkup(<OnboardingSection clienteId="c1" itens={[]} progresso={{ total: 0, concluidos: 0, obrigatoriosPendentes: 0, pct: 0, concluido: false }} usuarios={[]} podeRevelar={false} />);
    expect(html).toContain("Iniciar onboarding");
  });
  it("com itens mostra categorias e progresso", () => {
    const html = renderToStaticMarkup(<OnboardingSection clienteId="c1" itens={itens} progresso={prog} usuarios={[]} podeRevelar />);
    expect(html).toContain("Contrato social");
    expect(html).toContain("e-CAC");
    expect(html).toContain("50%");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- onboarding-section-render`
Expected: FAIL (componente inexistente).

- [ ] **Step 3: Criar `OnboardingSection.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { iniciarOnboarding, salvarItemOnboarding, removerItemOnboarding, revelarSenha, type ItemClienteView } from "@/app/(app)/clientes/[id]/onboarding";
import { agruparPorCategoria, type CategoriaOnb, type StatusOnb } from "@/lib/onboarding/progresso";
import { Botao } from "@/components/ui/Botao";

const CAT_LABEL: Record<CategoriaOnb, string> = { documento: "Documentos", procuracao: "Procurações", certificado: "Certificados", acesso: "Acessos", responsavel: "Responsáveis" };
const STATUS_LABEL: Record<StatusOnb, string> = { pendente: "Pendente", concluido: "Concluído", dispensado: "Dispensado" };
const STATUS_CLS: Record<StatusOnb, string> = { pendente: "bg-linha text-cinza", concluido: "bg-verde/10 text-verde", dispensado: "bg-cinza/10 text-cinza" };

type Prog = { total: number; concluidos: number; obrigatoriosPendentes: number; pct: number; concluido: boolean };
type Usuario = { id: string; nome: string };
type FormState = Partial<ItemClienteView> & { novaSenha?: string };

export function OnboardingSection({ clienteId, itens, progresso, usuarios, podeRevelar }: { clienteId: string; itens: ItemClienteView[]; progresso: Prog; usuarios: Usuario[]; podeRevelar: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [senhas, setSenhas] = useState<Record<string, string>>({});
  const grupos = agruparPorCategoria(itens);
  const nomeUsuario = (id: string | null) => usuarios.find((u) => u.id === id)?.nome ?? "—";

  async function chamar(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if (r.erro) {
      alert(r.erro);
      return;
    }
    setForm(null);
    router.refresh();
  }

  async function mudarStatus(it: ItemClienteView, status: StatusOnb) {
    await chamar(() =>
      salvarItemOnboarding({ id: it.id, clienteId, categoria: it.categoria, nome: it.nome, obrigatorio: it.obrigatorio, status, responsavelId: it.responsavelId, prazo: it.prazo, observacao: it.observacao, acessoUrl: it.acessoUrl, acessoLogin: it.acessoLogin }),
    );
  }
  async function ver(it: ItemClienteView) {
    setOcupado(true);
    const r = await revelarSenha(it.id);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    setSenhas((s) => ({ ...s, [it.id]: r.senha ?? "" }));
  }
  function salvarForm() {
    if (!form) return;
    void chamar(() =>
      salvarItemOnboarding({
        id: form.id,
        clienteId,
        categoria: (form.categoria ?? "documento") as CategoriaOnb,
        nome: form.nome ?? "",
        obrigatorio: form.obrigatorio ?? true,
        status: (form.status ?? "pendente") as StatusOnb,
        responsavelId: form.responsavelId ?? null,
        prazo: form.prazo ?? null,
        observacao: form.observacao ?? null,
        acessoUrl: form.acessoUrl ?? null,
        acessoLogin: form.acessoLogin ?? null,
        novaSenha: form.novaSenha || null,
      }),
    );
  }

  if (itens.length === 0) {
    return (
      <section className="rounded-2xl border border-linha bg-white p-5">
        <h2 className="font-display text-sm font-semibold text-texto">Onboarding</h2>
        <p className="mt-1 text-sm text-cinza">Nenhum checklist iniciado para este cliente.</p>
        <div className="mt-3">
          <Botao variante="primario" disabled={ocupado} onClick={() => chamar(() => iniciarOnboarding(clienteId))}>
            Iniciar onboarding
          </Botao>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-linha bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-texto">Onboarding</h2>
        <Botao variante="secundario" disabled={ocupado} onClick={() => setForm({ categoria: "documento", obrigatorio: true, status: "pendente" })}>
          + Item
        </Botao>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs text-cinza">
          <span>{progresso.pct}% concluído</span>
          <span>{progresso.obrigatoriosPendentes} obrigatório(s) pendente(s)</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-linha">
          <div className="h-full rounded-full bg-verde" style={{ width: `${progresso.pct}%` }} />
        </div>
      </div>

      {grupos.map((g) => (
        <div key={g.categoria} className="space-y-1.5">
          <h3 className="font-display text-[11px] font-semibold uppercase tracking-wide text-cinza">{CAT_LABEL[g.categoria]}</h3>
          {g.itens.map((it) => (
            <div key={it.id} className="rounded-lg border border-linha/70 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-texto">{it.nome}</span>
                {it.obrigatorio && <span className="text-[10px] text-cinza-claro">obrigatório</span>}
                <select value={it.status} disabled={ocupado} onChange={(e) => mudarStatus(it, e.target.value as StatusOnb)} className={`ml-auto rounded-full px-2 py-0.5 text-xs ${STATUS_CLS[it.status]}`}>
                  {(["pendente", "concluido", "dispensado"] as StatusOnb[]).map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setForm(it)} className="text-xs text-cinza underline">Editar</button>
                <button type="button" onClick={() => chamar(() => removerItemOnboarding(it.id, clienteId))} className="text-xs text-negativo underline">Remover</button>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-cinza">
                <span>Resp.: {nomeUsuario(it.responsavelId)}</span>
                {it.prazo && <span>Prazo: {it.prazo.slice(8, 10)}/{it.prazo.slice(5, 7)}/{it.prazo.slice(0, 4)}</span>}
                {it.observacao && <span>Obs.: {it.observacao}</span>}
              </div>
              {it.categoria === "acesso" && (
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-cinza">
                  {it.acessoUrl && <span>URL: {it.acessoUrl}</span>}
                  {it.acessoLogin && <span>Login: {it.acessoLogin}</span>}
                  {it.temSenha && podeRevelar && (
                    <button type="button" onClick={() => ver(it)} disabled={ocupado} className="text-verde underline">
                      {senhas[it.id] ? `Senha: ${senhas[it.id]}` : "Revelar senha"}
                    </button>
                  )}
                  {it.temSenha && !podeRevelar && <span className="text-cinza-claro">senha protegida</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setForm(null)}>
          <div className="w-full max-w-md space-y-2 rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-sm font-semibold text-texto">{form.id ? "Editar item" : "Novo item"}</h3>
            <label className="block text-xs text-cinza">Nome
              <input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
            </label>
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-cinza">Categoria
                <select value={form.categoria ?? "documento"} onChange={(e) => setForm({ ...form, categoria: e.target.value as CategoriaOnb })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm">
                  {(Object.keys(CAT_LABEL) as CategoriaOnb[]).map((c) => (
                    <option key={c} value={c}>{CAT_LABEL[c]}</option>
                  ))}
                </select>
              </label>
              <label className="flex-1 text-xs text-cinza">Responsável
                <select value={form.responsavelId ?? ""} onChange={(e) => setForm({ ...form, responsavelId: e.target.value || null })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm">
                  <option value="">—</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-cinza">Prazo
                <input type="date" value={form.prazo ?? ""} onChange={(e) => setForm({ ...form, prazo: e.target.value || null })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
              </label>
              <label className="flex items-end gap-1 text-xs text-cinza">
                <input type="checkbox" checked={form.obrigatorio ?? true} onChange={(e) => setForm({ ...form, obrigatorio: e.target.checked })} /> Obrigatório
              </label>
            </div>
            <label className="block text-xs text-cinza">Observação
              <textarea value={form.observacao ?? ""} onChange={(e) => setForm({ ...form, observacao: e.target.value })} rows={2} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
            </label>
            {form.categoria === "acesso" && (
              <div className="space-y-2 rounded-lg bg-creme p-2">
                <label className="block text-xs text-cinza">URL do portal
                  <input value={form.acessoUrl ?? ""} onChange={(e) => setForm({ ...form, acessoUrl: e.target.value || null })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
                </label>
                <label className="block text-xs text-cinza">Login
                  <input value={form.acessoLogin ?? ""} onChange={(e) => setForm({ ...form, acessoLogin: e.target.value || null })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
                </label>
                <label className="block text-xs text-cinza">Senha (deixe vazio para manter)
                  <input type="password" value={form.novaSenha ?? ""} onChange={(e) => setForm({ ...form, novaSenha: e.target.value })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
                </label>
                <p className="text-[10px] text-cinza-claro">A senha é cifrada; só admin/contador podem revelar (auditado).</p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Botao variante="fantasma" onClick={() => setForm(null)}>Cancelar</Botao>
              <Botao variante="primario" disabled={ocupado || !(form.nome ?? "").trim()} onClick={salvarForm}>Salvar</Botao>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- onboarding-section-render`
Expected: PASS (2 testes).

- [ ] **Step 5: Renderizar a seção em `src/app/(app)/clientes/[id]/page.tsx`**

Adicionar os imports no topo:
```ts
import { OnboardingSection } from "@/components/onboarding/OnboardingSection";
import { listarOnboardingCliente } from "./onboarding";
import { podeRevelarCredencial } from "@/lib/clientes/permissoes";
```
No corpo da página (server), após obter `perfil` e o `id` do cliente e antes do `return`, carregar os dados:
```ts
  const onboarding = await listarOnboardingCliente(id);
  const { data: usuariosOnb } = await supabase.from("usuarios").select("id, nome").eq("ativo", true).order("nome");
```
(Use a variável do id do cliente e o `supabase` já existentes na página; se o id se chamar diferente, ajuste.)
E no JSX, junto às demais seções (após `DocumentosSection`), renderizar:
```tsx
      {onboarding && (
        <OnboardingSection
          clienteId={id}
          itens={onboarding.itens}
          progresso={onboarding.progresso}
          usuarios={usuariosOnb ?? []}
          podeRevelar={podeRevelarCredencial(perfil.papel)}
        />
      )}
```

- [ ] **Step 6: Suite completa**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tudo verde; a ficha do cliente compila com a seção.

- [ ] **Step 7: Commit**

```bash
git add src/components/onboarding/OnboardingSection.tsx "src/app/(app)/clientes/[id]/page.tsx" src/tests/onboarding/onboarding-section-render.test.tsx
git commit -m "feat(onboarding): aba de onboarding na ficha do cliente

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: UI — lista global + editor do modelo + navegação

**Files:**
- Create: `src/app/(app)/onboarding/page.tsx`
- Create: `src/app/(app)/onboarding/ListaOnboarding.tsx`
- Create: `src/app/(app)/configuracoes/onboarding/page.tsx`
- Create: `src/app/(app)/configuracoes/onboarding/EditorModelo.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/app/(app)/configuracoes/page.tsx`

**Interfaces:**
- Consumes: `listarOnboardings`, `type OnboardingResumo` (T4); `listarModelo`, `salvarModeloItem`, `removerModeloItem`, `type ItemModelo` (T4); `podeCriarCliente` (existente); `CAT_LABEL` local; `Botao`, `PageHeader`.

- [ ] **Step 1: `ListaOnboarding.tsx` (client)**

```tsx
"use client";
import Link from "next/link";
import type { OnboardingResumo } from "./actions";

export function ListaOnboarding({ itens }: { itens: OnboardingResumo[] }) {
  if (itens.length === 0) return <p className="text-sm text-cinza">Nenhum cliente em onboarding ainda.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-linha text-xs text-cinza">
            <th className="px-3 py-2 text-left font-medium">Cliente</th>
            <th className="px-3 py-2 text-left font-medium">Progresso</th>
            <th className="px-3 py-2 text-right font-medium">Obrig. pendentes</th>
            <th className="px-3 py-2 text-right font-medium">Próximo prazo</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((o) => (
            <tr key={o.clienteId} className="border-b border-linha/60">
              <td className="px-3 py-2">
                <Link href={`/clientes/${o.clienteId}`} className="text-texto underline decoration-linha hover:decoration-verde">
                  {o.razaoSocial}
                </Link>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 overflow-hidden rounded-full bg-linha">
                    <div className={`h-full rounded-full ${o.concluido ? "bg-verde" : "bg-verde/60"}`} style={{ width: `${o.pct}%` }} />
                  </div>
                  <span className="text-xs tabular-nums text-cinza">{o.pct}%</span>
                </div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{o.total - o.concluidos > 0 ? o.total - o.concluidos : 0}</td>
              <td className="px-3 py-2 text-right tabular-nums">{o.proximoPrazo ? `${o.proximoPrazo.slice(8, 10)}/${o.proximoPrazo.slice(5, 7)}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: `onboarding/page.tsx` (server)**

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { ListaOnboarding } from "./ListaOnboarding";
import { listarOnboardings } from "./actions";

export default async function OnboardingPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const itens = await listarOnboardings();
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4">
      <PageHeader titulo="Onboarding" subtitulo="Clientes em processo de entrada" />
      <ListaOnboarding itens={itens} />
    </main>
  );
}
```

- [ ] **Step 3: `configuracoes/onboarding/EditorModelo.tsx` (client)**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { salvarModeloItem, removerModeloItem, type ItemModelo } from "@/app/(app)/onboarding/actions";
import type { CategoriaOnb } from "@/lib/onboarding/progresso";
import { Botao } from "@/components/ui/Botao";

const CAT_LABEL: Record<CategoriaOnb, string> = { documento: "Documentos", procuracao: "Procurações", certificado: "Certificados", acesso: "Acessos", responsavel: "Responsáveis" };
type Form = Partial<ItemModelo>;

export function EditorModelo({ itens }: { itens: ItemModelo[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [form, setForm] = useState<Form | null>(null);

  async function chamar(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    setForm(null);
    router.refresh();
  }
  function salvar() {
    if (!form) return;
    void chamar(() =>
      salvarModeloItem({
        id: form.id,
        categoria: (form.categoria ?? "documento") as CategoriaOnb,
        nome: form.nome ?? "",
        obrigatorio: form.obrigatorio ?? true,
        ordem: form.ordem ?? 0,
        ativo: form.ativo ?? true,
      }),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Botao variante="secundario" onClick={() => setForm({ categoria: "documento", obrigatorio: true, ativo: true, ordem: (itens.at(-1)?.ordem ?? 0) + 1 })}>
          + Item do modelo
        </Botao>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-xs text-cinza">
              <th className="px-3 py-2 text-left font-medium">Ordem</th>
              <th className="px-3 py-2 text-left font-medium">Categoria</th>
              <th className="px-3 py-2 text-left font-medium">Nome</th>
              <th className="px-3 py-2 text-left font-medium">Obrig.</th>
              <th className="px-3 py-2 text-left font-medium">Ativo</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id} className="border-b border-linha/60">
                <td className="px-3 py-2 tabular-nums">{i.ordem}</td>
                <td className="px-3 py-2">{CAT_LABEL[i.categoria]}</td>
                <td className="px-3 py-2 text-texto">{i.nome}</td>
                <td className="px-3 py-2">{i.obrigatorio ? "Sim" : "Não"}</td>
                <td className="px-3 py-2">{i.ativo ? "Sim" : "Não"}</td>
                <td className="px-3 py-2 text-right">
                  <button type="button" onClick={() => setForm(i)} className="mr-3 text-xs text-cinza underline">Editar</button>
                  <button type="button" onClick={() => chamar(() => removerModeloItem(i.id))} className="text-xs text-negativo underline">Remover</button>
                </td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-3 text-cinza-claro">Nenhum item no modelo. Adicione os itens padrão do checklist.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setForm(null)}>
          <div className="w-full max-w-md space-y-2 rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-sm font-semibold text-texto">{form.id ? "Editar item" : "Novo item"}</h3>
            <label className="block text-xs text-cinza">Nome
              <input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
            </label>
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-cinza">Categoria
                <select value={form.categoria ?? "documento"} onChange={(e) => setForm({ ...form, categoria: e.target.value as CategoriaOnb })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm">
                  {(Object.keys(CAT_LABEL) as CategoriaOnb[]).map((c) => (
                    <option key={c} value={c}>{CAT_LABEL[c]}</option>
                  ))}
                </select>
              </label>
              <label className="w-20 text-xs text-cinza">Ordem
                <input type="number" value={form.ordem ?? 0} onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
              </label>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-1 text-xs text-cinza">
                <input type="checkbox" checked={form.obrigatorio ?? true} onChange={(e) => setForm({ ...form, obrigatorio: e.target.checked })} /> Obrigatório
              </label>
              <label className="flex items-center gap-1 text-xs text-cinza">
                <input type="checkbox" checked={form.ativo ?? true} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Ativo
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Botao variante="fantasma" onClick={() => setForm(null)}>Cancelar</Botao>
              <Botao variante="primario" disabled={ocupado || !(form.nome ?? "").trim()} onClick={salvar}>Salvar</Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `configuracoes/onboarding/page.tsx` (server)**

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditorModelo } from "./EditorModelo";
import { listarModelo } from "@/app/(app)/onboarding/actions";

export default async function ConfigOnboardingPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const itens = await listarModelo();
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <PageHeader titulo="Checklist de onboarding" subtitulo="Itens-modelo aplicados a cada novo cliente" />
      <EditorModelo itens={itens} />
    </main>
  );
}
```

- [ ] **Step 5: Link no Sidebar**

Em `src/components/Sidebar.tsx`, adicionar o import:
```ts
import { podeAtender, podeCriarCliente } from "@/lib/clientes/permissoes";
```
(substituindo o import existente `import { podeAtender } from "@/lib/clientes/permissoes";`)
E no array `itens`, após a linha de Clientes:
```ts
    ...(podeCriarCliente(papel) ? [{ href: "/onboarding", label: "Onboarding" }] : []),
```

- [ ] **Step 6: Link em Configurações**

Em `src/app/(app)/configuracoes/page.tsx`, adicionar ao array `ITENS`:
```ts
  { href: "/configuracoes/onboarding", label: "Checklist de onboarding", desc: "Itens-modelo do onboarding de novos clientes." },
```

- [ ] **Step 7: Suite completa**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tudo verde; rotas `/onboarding` e `/configuracoes/onboarding` compilam.

- [ ] **Step 8: Verificação visual (opcional)**

`npm run dev`: Configurações → Checklist de onboarding (adicionar itens-modelo); abrir um cliente → Onboarding → "Iniciar onboarding" → marcar status, adicionar item de acesso com senha, revelar (como admin); `/onboarding` lista o cliente com progresso.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(app)/onboarding/page.tsx" "src/app/(app)/onboarding/ListaOnboarding.tsx" "src/app/(app)/configuracoes/onboarding" src/components/Sidebar.tsx "src/app/(app)/configuracoes/page.tsx"
git commit -m "feat(onboarding): lista global + editor do modelo + navegação

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: CHANGELOG + finalizar branch

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG**

Sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Onboarding de cliente:** workflow de entrada com checklist configurável (modelo editável em
  Configurações → Checklist de onboarding). Cada cliente tem uma aba Onboarding com itens agrupados por
  categoria (documentos, procurações, certificados, acessos, responsáveis), status, responsável, prazo e
  observação, além de barra de progresso. Itens de "acesso" guardam URL/login e senha cifrada (cofre);
  revelar a senha é restrito a admin/contador e auditado. Tela global /onboarding lista os clientes em
  processo com progresso e próximo prazo. Requer a variável ONBOARDING_CRIPTO_KEY.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog do onboarding (RF-010)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: Finalizar a branch**

Usar `superpowers:finishing-a-development-branch`. **Antes do deploy**, lembrar o usuário de definir
`ONBOARDING_CRIPTO_KEY` (hex 32 bytes, ex.: `openssl rand -hex 32`) no ambiente do EasyPanel — sem ela,
salvar/revelar senha de acesso falha (mas o resto do onboarding funciona).

---

## Self-Review

- **Cobertura do spec:** tabelas+RLS (T1) ✓; cripto do cofre + gates (T2) ✓; helpers progresso (T3) ✓; actions modelo/global (T4) ✓; actions por cliente + revelar auditado (T5) ✓; aba do cliente (T6) ✓; lista global + editor do modelo + nav (T7) ✓; testes unit (T2/T3) + smoke (T6) ✓; CHANGELOG + env (T8) ✓. Anexo adiado (coluna reservada) — conforme spec.
- **Placeholders:** nenhum — todo passo tem código/comando concreto. A wire da page do cliente descreve a inserção com o código exato (ajustar o nome da var do id se diferir).
- **Consistência de tipos:** `CategoriaOnb`/`StatusOnb`/`ItemOnb` (T3) usados em T4/T5/T6/T7; `ItemClienteView` (T5) consumido por T6; `ItemModelo`/`OnboardingResumo` (T4) consumidos por T7; `agruparPorCategoria` genérico preserva `ItemClienteView`; gates (`podeCriarCliente`, `podeRevelarCredencial`, `podeGerenciarModeloOnboarding`) coerentes; `cifrarSenha`/`decifrarSenha` (T2) usados em T5. `Botao`, `PageHeader`, `getPerfilAtual`, `createServerSupabase` já existem.
- **Segurança:** listagem por cliente NÃO seleciona `acesso_senha_cifrada` no retorno (só `temSenha`); revelar é server action gated admin/contador + insere auditoria; chave dedicada em env.
- **Escopo:** só RF-010. F2 (órgãos/protocolos/templates/aviso/transferência) fora.
```
