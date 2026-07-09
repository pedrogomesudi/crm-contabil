# Comercial — propostas formais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar propostas de honorários por oportunidade (itens + valores), com editor, documento imprimível e status que reflete no funil.

**Architecture:** Tabelas `proposta`/`proposta_item` (RLS por papel); helper puro de totais; actions de CRUD/status; UI de lista → editor → documento imprimível; link no card do funil. Spec: `docs/superpowers/specs/2026-07-08-comercial-propostas-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase, Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`. Todos passam.
- Migration idempotente via `npm run db:migrate` (banco compartilhado, atinge prod). Imutável após aplicada.
- Gate `podeCriarCliente`; RLS por papel (`auth_papel() in ('admin','assistente','contador')`). Tokens SALDO na UI.
- Branch: `git checkout -b feat/comercial-propostas develop`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `supabase/migrations/0057_comercial_proposta.sql` — **novo**: enums + sequência + 2 tabelas + RLS.
- `src/lib/comercial/proposta.ts` — **novo**: `totaisProposta`.
- `src/tests/comercial/proposta.test.ts` — **novo**.
- `src/app/(app)/comercial/propostas-actions.ts` — **novo**: actions.
- `src/app/(app)/comercial/propostas/page.tsx` + `PropostasLista.tsx` — **novo**: lista por oportunidade.
- `src/app/(app)/comercial/propostas/[id]/page.tsx` + `EditorProposta.tsx` — **novo**: editor.
- `src/app/(app)/comercial/propostas/[id]/documento/page.tsx` + `DocumentoProposta.tsx` + `ImprimirBtn.tsx` — **novo**: documento.
- `src/app/(app)/comercial/QuadroComercial.tsx` — **modificar**: link "propostas" no card.
- `src/components/Sidebar.tsx` — **modificar**: `print:hidden`.
- Testes de smoke: `editor-proposta-render.test.tsx`, `documento-proposta-render.test.tsx`.

---

## Task 1: Migration — proposta + proposta_item

**Files:**
- Create: `supabase/migrations/0057_comercial_proposta.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Comercial: propostas formais de honorários (por oportunidade).
do $$ begin create type proposta_status as enum ('rascunho','enviada','aceita','recusada'); exception when duplicate_object then null; end $$;
do $$ begin create type proposta_recorrencia as enum ('mensal','unico'); exception when duplicate_object then null; end $$;
create sequence if not exists proposta_numero_seq;

create table if not exists proposta (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references oportunidade(id) on delete cascade,
  numero bigint not null default nextval('proposta_numero_seq'),
  validade date,
  observacoes text,
  status proposta_status not null default 'rascunho',
  criado_por uuid references usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create table if not exists proposta_item (
  id uuid primary key default gen_random_uuid(),
  proposta_id uuid not null references proposta(id) on delete cascade,
  descricao text not null,
  valor numeric(12,2) not null default 0,
  recorrencia proposta_recorrencia not null default 'mensal',
  ordem int not null default 0
);
alter table proposta enable row level security;
alter table proposta_item enable row level security;
drop policy if exists proposta_rw on proposta;
create policy proposta_rw on proposta for all
  using (auth_papel() in ('admin','assistente','contador')) with check (auth_papel() in ('admin','assistente','contador'));
drop policy if exists proposta_item_rw on proposta_item;
create policy proposta_item_rw on proposta_item for all
  using (auth_papel() in ('admin','assistente','contador')) with check (auth_papel() in ('admin','assistente','contador'));
```

- [ ] **Step 2: Aplicar e verificar**

Run: `npm run db:migrate`
Expected: "1 migration(s) nova(s) aplicada(s)."
```bash
node --env-file=.env.local -e "import('./scripts/_db.mjs').then(async({makeClient})=>{const c=makeClient();await c.connect();const r=await c.query(\"select count(*) from proposta\");const i=await c.query(\"select count(*) from proposta_item\");console.log('proposta OK:', r.rows[0].count, '| item OK:', i.rows[0].count);await c.end();});"
```
Expected: `proposta OK: 0 | item OK: 0`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0057_comercial_proposta.sql
git commit -m "feat(comercial): migration de propostas (proposta + proposta_item)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Helper puro totaisProposta (TDD)

**Files:**
- Create: `src/lib/comercial/proposta.ts`
- Test: `src/tests/comercial/proposta.test.ts`

**Interfaces:**
- Produces: `type ItemRecorrencia = "mensal" | "unico"`; `totaisProposta(itens): { mensal: number; unico: number }`.

- [ ] **Step 1: Testes**

```ts
import { describe, it, expect } from "vitest";
import { totaisProposta } from "@/lib/comercial/proposta";

describe("totaisProposta", () => {
  it("soma por recorrência", () => {
    expect(totaisProposta([
      { valor: 300, recorrencia: "mensal" },
      { valor: 200, recorrencia: "mensal" },
      { valor: 1000, recorrencia: "unico" },
    ])).toEqual({ mensal: 500, unico: 1000 });
  });
  it("lista vazia → zeros", () => {
    expect(totaisProposta([])).toEqual({ mensal: 0, unico: 0 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- comercial/proposta` → FAIL.

- [ ] **Step 3: Implementar `proposta.ts`**

```ts
export type ItemRecorrencia = "mensal" | "unico";

export function totaisProposta(itens: { valor: number; recorrencia: ItemRecorrencia }[]): { mensal: number; unico: number } {
  let mensal = 0, unico = 0;
  for (const i of itens) {
    if (i.recorrencia === "mensal") mensal += i.valor;
    else unico += i.valor;
  }
  return { mensal, unico };
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- comercial/proposta` (PASS), `npm run lint`, `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comercial/proposta.ts src/tests/comercial/proposta.test.ts
git commit -m "feat(comercial): helper totaisProposta (mensal/único)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Actions de propostas

**Files:**
- Create: `src/app/(app)/comercial/propostas-actions.ts`

**Interfaces:**
- Consumes: `totaisProposta`, `ItemRecorrencia` (Task 2); `podeCriarCliente`.
- Produces: tipos `PropostaStatus`, `PropostaItemView`, `PropostaResumo`, `Pagamento`, `PropostaView`, `ItemInput`; `listarPropostas`, `obterProposta`, `criarProposta`, `salvarProposta`, `definirStatusProposta`, `excluirProposta`.

- [ ] **Step 1: Criar `propostas-actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { totaisProposta, type ItemRecorrencia } from "@/lib/comercial/proposta";

export type PropostaStatus = "rascunho" | "enviada" | "aceita" | "recusada";
export type PropostaItemView = { id: string; descricao: string; valor: number; recorrencia: ItemRecorrencia; ordem: number };
export type PropostaResumo = { id: string; numero: number; status: PropostaStatus; validade: string | null; totalMensal: number; totalUnico: number };
export type Pagamento = { pixChave: string | null; banco: string | null; agencia: string | null; conta: string | null; titular: string | null; documento: string | null };
export type PropostaView = { id: string; numero: number; status: PropostaStatus; validade: string | null; observacoes: string | null; oportunidadeId: string; prospectNome: string; contatoNome: string | null; itens: PropostaItemView[]; pagamento: Pagamento };
export type ItemInput = { descricao: string; valor: number; recorrencia: ItemRecorrencia };

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return null;
  return p;
}

export async function listarPropostas(oportunidadeId: string): Promise<PropostaResumo[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data: props } = await supabase.from("proposta").select("id, numero, status, validade").eq("oportunidade_id", oportunidadeId).order("numero", { ascending: false });
  const rows = props ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id as string);
  const { data: itens } = await supabase.from("proposta_item").select("proposta_id, valor, recorrencia").in("proposta_id", ids);
  const porProp = new Map<string, { valor: number; recorrencia: ItemRecorrencia }[]>();
  for (const it of itens ?? []) {
    const a = porProp.get(it.proposta_id as string) ?? [];
    a.push({ valor: Number(it.valor), recorrencia: it.recorrencia as ItemRecorrencia });
    porProp.set(it.proposta_id as string, a);
  }
  return rows.map((r) => {
    const t = totaisProposta(porProp.get(r.id as string) ?? []);
    return { id: r.id as string, numero: Number(r.numero), status: r.status as PropostaStatus, validade: (r.validade as string | null) ?? null, totalMensal: t.mensal, totalUnico: t.unico };
  });
}

export async function obterProposta(id: string): Promise<PropostaView | null> {
  if (!(await gate())) return null;
  const supabase = await createServerSupabase();
  const { data: pr } = await supabase.from("proposta").select("id, numero, status, validade, observacoes, oportunidade_id").eq("id", id).maybeSingle();
  if (!pr) return null;
  const { data: itens } = await supabase.from("proposta_item").select("id, descricao, valor, recorrencia, ordem").eq("proposta_id", id).order("ordem");
  const { data: op } = await supabase.from("oportunidade").select("prospect_nome, contato_nome").eq("id", pr.oportunidade_id as string).maybeSingle();
  const { data: db } = await supabase.from("dados_bancarios").select("pix_chave, banco, agencia, conta, titular, documento").eq("id", 1).maybeSingle();
  return {
    id: pr.id as string,
    numero: Number(pr.numero),
    status: pr.status as PropostaStatus,
    validade: (pr.validade as string | null) ?? null,
    observacoes: (pr.observacoes as string | null) ?? null,
    oportunidadeId: pr.oportunidade_id as string,
    prospectNome: (op?.prospect_nome as string) ?? "—",
    contatoNome: (op?.contato_nome as string | null) ?? null,
    itens: (itens ?? []).map((i) => ({ id: i.id as string, descricao: i.descricao as string, valor: Number(i.valor), recorrencia: i.recorrencia as ItemRecorrencia, ordem: i.ordem as number })),
    pagamento: { pixChave: (db?.pix_chave as string | null) ?? null, banco: (db?.banco as string | null) ?? null, agencia: (db?.agencia as string | null) ?? null, conta: (db?.conta as string | null) ?? null, titular: (db?.titular as string | null) ?? null, documento: (db?.documento as string | null) ?? null },
  };
}

export async function criarProposta(oportunidadeId: string): Promise<{ id?: string; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("proposta").insert({ oportunidade_id: oportunidadeId }).select("id").single();
  if (error || !data) return { erro: "Falha ao criar." };
  return { id: data.id as string };
}

export async function salvarProposta(id: string, dados: { validade: string | null; observacoes: string | null; itens: ItemInput[] }): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error: e1 } = await supabase.from("proposta").update({ validade: dados.validade, observacoes: dados.observacoes, atualizado_em: new Date().toISOString() }).eq("id", id);
  if (e1) return { erro: "Falha ao salvar." };
  await supabase.from("proposta_item").delete().eq("proposta_id", id);
  const linhas = dados.itens.filter((i) => i.descricao.trim()).map((i, idx) => ({ proposta_id: id, descricao: i.descricao.trim(), valor: i.valor, recorrencia: i.recorrencia, ordem: idx }));
  if (linhas.length > 0) {
    const { error: e2 } = await supabase.from("proposta_item").insert(linhas);
    if (e2) return { erro: "Falha ao salvar itens." };
  }
  revalidatePath(`/comercial/propostas/${id}`);
  return { ok: true };
}

export async function definirStatusProposta(id: string, status: PropostaStatus): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: pr } = await supabase.from("proposta").select("oportunidade_id").eq("id", id).maybeSingle();
  const { error } = await supabase.from("proposta").update({ status, atualizado_em: new Date().toISOString() }).eq("id", id);
  if (error) return { erro: "Falha ao salvar status." };
  if (pr) {
    const opId = pr.oportunidade_id as string;
    if (status === "aceita") {
      await supabase.from("oportunidade").update({ etapa: "ganho", fechado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq("id", opId);
    } else if (status === "enviada") {
      const { data: op } = await supabase.from("oportunidade").select("etapa").eq("id", opId).maybeSingle();
      if (op && (op.etapa === "novo" || op.etapa === "contato")) {
        await supabase.from("oportunidade").update({ etapa: "proposta", atualizado_em: new Date().toISOString() }).eq("id", opId);
      }
    }
  }
  revalidatePath(`/comercial/propostas/${id}`);
  revalidatePath("/comercial");
  return { ok: true };
}

export async function excluirProposta(id: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: pr } = await supabase.from("proposta").select("oportunidade_id").eq("id", id).maybeSingle();
  const { error } = await supabase.from("proposta").delete().eq("id", id);
  if (error) return { erro: "Falha ao excluir." };
  if (pr) revalidatePath(`/comercial/propostas?op=${pr.oportunidade_id as string}`);
  return { ok: true };
}
```

- [ ] **Step 2: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build` (sem erros).
```bash
git add "src/app/(app)/comercial/propostas-actions.ts"
git commit -m "feat(comercial): actions de propostas (CRUD + status)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Lista de propostas + link no card

**Files:**
- Create: `src/app/(app)/comercial/propostas/PropostasLista.tsx`
- Create: `src/app/(app)/comercial/propostas/page.tsx`
- Modify: `src/app/(app)/comercial/QuadroComercial.tsx`

**Interfaces:**
- Consumes: `listarPropostas`, `criarProposta`, `excluirProposta`, `PropostaResumo` (Task 3).

- [ ] **Step 1: `PropostasLista.tsx`**

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { criarProposta, excluirProposta, type PropostaResumo } from "../propostas-actions";
import { Botao } from "@/components/ui/Botao";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ROTULO: Record<string, string> = { rascunho: "Rascunho", enviada: "Enviada", aceita: "Aceita", recusada: "Recusada" };

export function PropostasLista({ oportunidadeId, prospectNome, propostas }: { oportunidadeId: string; prospectNome: string; propostas: PropostaResumo[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function nova() {
    setOcupado(true);
    const r = await criarProposta(oportunidadeId);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    if (r.id) router.push(`/comercial/propostas/${r.id}`);
  }
  async function excluir(id: string) {
    if (!confirm("Excluir esta proposta?")) return;
    setOcupado(true);
    const r = await excluirProposta(id);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <Link href="/comercial" className="text-sm text-verde underline">← Funil</Link>
      <div className="flex items-center justify-between">
        <p className="text-sm text-cinza">Prospect: <span className="font-medium text-texto">{prospectNome}</span></p>
        <Botao variante="primario" disabled={ocupado} onClick={nova}>Nova proposta</Botao>
      </div>
      {propostas.length === 0 ? (
        <p className="text-sm text-cinza">Nenhuma proposta ainda.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-linha text-xs text-cinza">
                <th className="px-3 py-2 text-left font-medium">Nº</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Validade</th>
                <th className="px-3 py-2 text-right font-medium">Mensal</th>
                <th className="px-3 py-2 text-right font-medium">Único</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {propostas.map((p) => (
                <tr key={p.id} className="border-b border-linha/60">
                  <td className="px-3 py-2 tabular-nums">{p.numero}</td>
                  <td className="px-3 py-2">{ROTULO[p.status]}</td>
                  <td className="px-3 py-2">{p.validade ? `${p.validade.slice(8, 10)}/${p.validade.slice(5, 7)}/${p.validade.slice(0, 4)}` : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{brl(p.totalMensal)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{brl(p.totalUnico)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Link href={`/comercial/propostas/${p.id}`} className="mr-3 text-xs text-verde underline">abrir</Link>
                    <button type="button" onClick={() => excluir(p.id)} className="text-xs text-negativo underline">excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `propostas/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { PropostasLista } from "./PropostasLista";
import { listarPropostas } from "../propostas-actions";

export default async function PropostasPage({ searchParams }: { searchParams: Promise<{ op?: string }> }) {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const op = (await searchParams).op ?? "";
  if (!op) redirect("/comercial");
  const supabase = await createServerSupabase();
  const { data: oport } = await supabase.from("oportunidade").select("prospect_nome").eq("id", op).maybeSingle();
  const propostas = await listarPropostas(op);
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <PageHeader titulo="Propostas" subtitulo="Propostas de honorários da oportunidade" />
      <PropostasLista oportunidadeId={op} prospectNome={(oport?.prospect_nome as string) ?? "—"} propostas={propostas} />
    </main>
  );
}
```

- [ ] **Step 3: Link "propostas" no card do `QuadroComercial`**

Trocar a linha do botão "editar" (a que tem `ml-auto text-cinza underline">editar`):
```tsx
                    <button type="button" onClick={() => setForm({ id: o.id, input: doView(o) })} className="ml-auto text-cinza underline">editar</button>
```
por:
```tsx
                    <Link href={`/comercial/propostas?op=${o.id}`} className="ml-auto text-cinza underline">propostas</Link>
                    <button type="button" onClick={() => setForm({ id: o.id, input: doView(o) })} className="text-cinza underline">editar</button>
```
(`Link` já está importado no arquivo.)

- [ ] **Step 4: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde; rota `/comercial/propostas` compila).
```bash
git add "src/app/(app)/comercial/propostas/PropostasLista.tsx" "src/app/(app)/comercial/propostas/page.tsx" "src/app/(app)/comercial/QuadroComercial.tsx"
git commit -m "feat(comercial): lista de propostas por oportunidade + link no card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Editor da proposta

**Files:**
- Create: `src/app/(app)/comercial/propostas/[id]/EditorProposta.tsx`
- Create: `src/app/(app)/comercial/propostas/[id]/page.tsx`
- Test: `src/tests/comercial/editor-proposta-render.test.tsx`

**Interfaces:**
- Consumes: `salvarProposta`, `definirStatusProposta`, `obterProposta`, `PropostaView`, `PropostaStatus` (Task 3); `totaisProposta`, `ItemRecorrencia` (Task 2).

- [ ] **Step 1: Smoke test**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/comercial/propostas-actions", () => ({ salvarProposta: vi.fn(), definirStatusProposta: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { EditorProposta } from "@/app/(app)/comercial/propostas/[id]/EditorProposta";
import type { PropostaView } from "@/app/(app)/comercial/propostas-actions";

const proposta: PropostaView = {
  id: "p1", numero: 1, status: "rascunho", validade: null, observacoes: null, oportunidadeId: "o1", prospectNome: "ACME", contatoNome: "João",
  itens: [{ id: "i1", descricao: "Honorário mensal", valor: 500, recorrencia: "mensal", ordem: 0 }],
  pagamento: { pixChave: null, banco: null, agencia: null, conta: null, titular: null, documento: null },
};

describe("EditorProposta", () => {
  it("renderiza itens e total", () => {
    const html = renderToStaticMarkup(<EditorProposta proposta={proposta} />);
    expect(html).toContain("Honorário mensal");
    expect(html).toContain("Ver documento");
    expect(html).toContain("Mensal");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- editor-proposta-render` → FAIL.

- [ ] **Step 3: `EditorProposta.tsx`**

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { salvarProposta, definirStatusProposta, type PropostaView, type PropostaStatus } from "../../propostas-actions";
import { totaisProposta, type ItemRecorrencia } from "@/lib/comercial/proposta";
import { Botao } from "@/components/ui/Botao";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type Linha = { descricao: string; valor: number; recorrencia: ItemRecorrencia };
const STATUS: { v: PropostaStatus; l: string }[] = [{ v: "rascunho", l: "Rascunho" }, { v: "enviada", l: "Enviada" }, { v: "aceita", l: "Aceita" }, { v: "recusada", l: "Recusada" }];

export function EditorProposta({ proposta }: { proposta: PropostaView }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [validade, setValidade] = useState(proposta.validade ?? "");
  const [observacoes, setObservacoes] = useState(proposta.observacoes ?? "");
  const [itens, setItens] = useState<Linha[]>(proposta.itens.length ? proposta.itens.map((i) => ({ descricao: i.descricao, valor: i.valor, recorrencia: i.recorrencia })) : [{ descricao: "", valor: 0, recorrencia: "mensal" }]);
  const t = totaisProposta(itens);

  function setItem(idx: number, patch: Partial<Linha>) {
    setItens(itens.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  async function salvar() {
    setOcupado(true);
    const r = await salvarProposta(proposta.id, { validade: validade || null, observacoes: observacoes || null, itens });
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    router.refresh();
  }
  async function status(s: PropostaStatus) {
    setOcupado(true);
    const r = await definirStatusProposta(proposta.id, s);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/comercial/propostas?op=${proposta.oportunidadeId}`} className="text-sm text-verde underline">← Propostas</Link>
        <Link href={`/comercial/propostas/${proposta.id}/documento`} className="text-sm text-verde underline">Ver documento</Link>
      </div>

      <div className="space-y-1">
        <p className="text-sm text-cinza">Proposta nº <span className="font-medium text-texto tabular-nums">{proposta.numero}</span> · {proposta.prospectNome}</p>
        <div className="flex flex-wrap gap-1 text-xs">
          {STATUS.map((s) => (
            <button key={s.v} type="button" disabled={ocupado} onClick={() => status(s.v)} className={`rounded border px-2 py-0.5 ${proposta.status === s.v ? "border-verde bg-verde/10 text-verde" : "border-linha text-cinza"}`}>{s.l}</button>
          ))}
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-linha bg-white p-3">
        <h3 className="font-display text-sm font-semibold text-texto">Itens</h3>
        {itens.map((it, idx) => (
          <div key={idx} className="flex flex-wrap items-center gap-2">
            <input value={it.descricao} onChange={(e) => setItem(idx, { descricao: e.target.value })} placeholder="Descrição" className="flex-1 rounded-lg border border-linha px-2 py-1.5 text-sm" />
            <input type="number" value={it.valor || ""} onChange={(e) => setItem(idx, { valor: e.target.value === "" ? 0 : Number(e.target.value) })} placeholder="Valor" className="w-28 rounded-lg border border-linha px-2 py-1.5 text-sm" />
            <select value={it.recorrencia} onChange={(e) => setItem(idx, { recorrencia: e.target.value as ItemRecorrencia })} className="rounded-lg border border-linha px-2 py-1.5 text-sm">
              <option value="mensal">Mensal</option>
              <option value="unico">Único</option>
            </select>
            <button type="button" onClick={() => setItens(itens.filter((_, i) => i !== idx))} className="text-xs text-negativo underline">remover</button>
          </div>
        ))}
        <button type="button" onClick={() => setItens([...itens, { descricao: "", valor: 0, recorrencia: "mensal" }])} className="text-xs text-verde underline">+ item</button>
        <p className="pt-1 text-sm text-texto">Total: <span className="font-medium tabular-nums">Mensal {brl(t.mensal)}</span> · <span className="font-medium tabular-nums">Único {brl(t.unico)}</span></p>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="text-xs text-cinza">Validade
          <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className="mt-0.5 block rounded-lg border border-linha px-2 py-1.5 text-sm" />
        </label>
        <label className="flex-1 text-xs text-cinza">Observações / condições
          <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} className="mt-0.5 block w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
        </label>
      </div>

      <div className="flex justify-end">
        <Botao variante="primario" disabled={ocupado} onClick={salvar}>Salvar</Botao>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar** — `npm test -- editor-proposta-render` → PASS.

- [ ] **Step 5: `[id]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditorProposta } from "./EditorProposta";
import { obterProposta } from "../../propostas-actions";

export default async function EditarPropostaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const proposta = await obterProposta(id);
  if (!proposta) notFound();
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <PageHeader titulo={`Proposta nº ${proposta.numero}`} subtitulo={proposta.prospectNome} />
      <EditorProposta proposta={proposta} />
    </main>
  );
}
```

- [ ] **Step 6: Suite completa** — `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde; rota `/comercial/propostas/[id]` compila).

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/comercial/propostas/[id]/EditorProposta.tsx" "src/app/(app)/comercial/propostas/[id]/page.tsx" src/tests/comercial/editor-proposta-render.test.tsx
git commit -m "feat(comercial): editor da proposta (itens, validade, status)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Documento imprimível

**Files:**
- Create: `src/app/(app)/comercial/propostas/[id]/documento/DocumentoProposta.tsx`
- Create: `src/app/(app)/comercial/propostas/[id]/documento/ImprimirBtn.tsx`
- Create: `src/app/(app)/comercial/propostas/[id]/documento/page.tsx`
- Modify: `src/components/Sidebar.tsx`
- Test: `src/tests/comercial/documento-proposta-render.test.tsx`

**Interfaces:**
- Consumes: `obterProposta`, `PropostaView` (Task 3); `totaisProposta` (Task 2).

- [ ] **Step 1: Smoke test**

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DocumentoProposta } from "@/app/(app)/comercial/propostas/[id]/documento/DocumentoProposta";
import type { PropostaView } from "@/app/(app)/comercial/propostas-actions";

const proposta: PropostaView = {
  id: "p1", numero: 7, status: "enviada", validade: "2026-08-01", observacoes: "Pagamento até dia 10.", oportunidadeId: "o1", prospectNome: "ACME LTDA", contatoNome: "João",
  itens: [{ id: "i1", descricao: "Honorário mensal", valor: 500, recorrencia: "mensal", ordem: 0 }, { id: "i2", descricao: "Abertura", valor: 900, recorrencia: "unico", ordem: 1 }],
  pagamento: { pixChave: "12345", banco: "Inter", agencia: "0001", conta: "99", titular: "Contabilidade X", documento: "00.000.000/0001-00" },
};

describe("DocumentoProposta", () => {
  it("renderiza cabeçalho, prospect, totais e pagamento", () => {
    const html = renderToStaticMarkup(<DocumentoProposta proposta={proposta} hoje="2026-07-08" />);
    expect(html).toContain("Proposta de Honorários");
    expect(html).toContain("ACME LTDA");
    expect(html).toContain("Contabilidade X");
    expect(html).toContain("Dados para pagamento");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- documento-proposta-render` → FAIL.

- [ ] **Step 3: `DocumentoProposta.tsx`** (componente puro, sem hooks)

```tsx
import { totaisProposta } from "@/lib/comercial/proposta";
import type { PropostaView } from "../../propostas-actions";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function DocumentoProposta({ proposta, hoje }: { proposta: PropostaView; hoje: string }) {
  const t = totaisProposta(proposta.itens);
  const pg = proposta.pagamento;
  return (
    <div className="mx-auto max-w-2xl bg-white p-8 text-texto">
      <header className="border-b border-linha pb-3">
        {pg.titular && <p className="font-display text-lg font-semibold">{pg.titular}</p>}
        <h1 className="mt-1 font-display text-xl font-bold">Proposta de Honorários</h1>
        <p className="mt-1 text-sm text-cinza">Nº {proposta.numero} · Emissão {dataBR(hoje)}{proposta.validade ? ` · Válida até ${dataBR(proposta.validade)}` : ""}</p>
      </header>

      <section className="mt-4 text-sm">
        <p><span className="text-cinza">Para:</span> <span className="font-medium">{proposta.prospectNome}</span>{proposta.contatoNome ? ` — a/c ${proposta.contatoNome}` : ""}</p>
      </section>

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-linha text-left text-xs text-cinza">
            <th className="py-1 font-medium">Descrição</th>
            <th className="py-1 font-medium">Recorrência</th>
            <th className="py-1 text-right font-medium">Valor</th>
          </tr>
        </thead>
        <tbody>
          {proposta.itens.map((i) => (
            <tr key={i.id} className="border-b border-linha/60">
              <td className="py-1.5">{i.descricao}</td>
              <td className="py-1.5">{i.recorrencia === "mensal" ? "Mensal" : "Único"}</td>
              <td className="py-1.5 text-right tabular-nums">{brl(i.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 space-y-0.5 text-right text-sm">
        <p>Total mensal: <span className="font-medium tabular-nums">{brl(t.mensal)}</span></p>
        <p>Total único: <span className="font-medium tabular-nums">{brl(t.unico)}</span></p>
      </div>

      {proposta.observacoes && (
        <section className="mt-4 text-sm">
          <h2 className="font-display text-sm font-semibold">Condições</h2>
          <p className="mt-1 whitespace-pre-wrap text-cinza">{proposta.observacoes}</p>
        </section>
      )}

      <section className="mt-4 rounded-lg bg-creme p-3 text-sm">
        <h2 className="font-display text-sm font-semibold">Dados para pagamento</h2>
        <div className="mt-1 space-y-0.5 text-cinza">
          {pg.pixChave && <p>PIX: {pg.pixChave}</p>}
          {(pg.banco || pg.agencia || pg.conta) && <p>{[pg.banco, pg.agencia && `Ag. ${pg.agencia}`, pg.conta && `Conta ${pg.conta}`].filter(Boolean).join(" · ")}</p>}
          {(pg.titular || pg.documento) && <p>{[pg.titular, pg.documento].filter(Boolean).join(" · ")}</p>}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: `ImprimirBtn.tsx`**

```tsx
"use client";

export function ImprimirBtn() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white print:hidden">
      Imprimir
    </button>
  );
}
```

- [ ] **Step 5: `documento/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { DocumentoProposta } from "./DocumentoProposta";
import { ImprimirBtn } from "./ImprimirBtn";
import { obterProposta } from "../../../propostas-actions";

export default async function DocumentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const proposta = await obterProposta(id);
  if (!proposta) notFound();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return (
    <main className="min-h-screen bg-white p-4">
      <div className="mx-auto mb-3 flex max-w-2xl items-center justify-between print:hidden">
        <Link href={`/comercial/propostas/${id}`} className="text-sm text-verde underline">← Editar</Link>
        <ImprimirBtn />
      </div>
      <DocumentoProposta proposta={proposta} hoje={hoje} />
    </main>
  );
}
```

- [ ] **Step 6: `Sidebar` — `print:hidden` (não sair no papel)**

Em `src/components/Sidebar.tsx`:
- na barra de topo mobile, trocar `className="flex items-center justify-between bg-tinta px-4 py-3 md:hidden"` por `className="flex items-center justify-between bg-tinta px-4 py-3 md:hidden print:hidden"`;
- na sidebar desktop, trocar `className="hidden flex-col gap-4 bg-tinta p-4 md:flex md:h-screen md:w-56 md:shrink-0"` por `className="hidden flex-col gap-4 bg-tinta p-4 md:flex md:h-screen md:w-56 md:shrink-0 print:!hidden"`.

- [ ] **Step 7: Rodar e ver passar** — `npm test -- documento-proposta-render` → PASS.

- [ ] **Step 8: Suite completa** — `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde; rota `/comercial/propostas/[id]/documento` compila).

- [ ] **Step 9: Commit**

```bash
git add "src/app/(app)/comercial/propostas/[id]/documento" src/components/Sidebar.tsx src/tests/comercial/documento-proposta-render.test.tsx
git commit -m "feat(comercial): documento imprimível da proposta

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Comercial — propostas formais:** cada oportunidade pode ter propostas de honorários (itens com valor e
  recorrência mensal/único, validade, condições). Um documento formatado ("Proposta de Honorários", com
  totais e dados de pagamento) abre para impressão/compartilhamento. Marcar a proposta como Enviada/Aceita
  move a oportunidade no funil (Proposta/Ganho).
```

- [ ] **Step 2: Commit + finalizar**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog das propostas do comercial

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois usar `superpowers:finishing-a-development-branch`. (Migration 0057 já aplicada; sem novos segredos.)

---

## Self-Review

- **Cobertura do spec:** tabelas+RLS (T1) ✓; `totaisProposta` (T2) ✓; actions CRUD+status com integração ao funil (T3) ✓; lista por oportunidade + link no card (T4) ✓; editor com itens/validade/obs/status (T5) ✓; documento imprimível + `print:hidden` (T6) ✓; CHANGELOG (T7) ✓. Unit (T2) + smokes (T5/T6) ✓.
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Consistência de tipos:** `ItemRecorrencia`/`totaisProposta` (T2) usados nas actions (T3) e na UI (T5/T6); `PropostaView`/`PropostaResumo`/`PropostaStatus`/`ItemInput`/`Pagamento` (T3) consumidos por PropostasLista (T4), EditorProposta (T5), DocumentoProposta (T6). Caminhos de import relativos conferem: editor/documento importam `propostas-actions` com `../../` e `../../../` conforme a profundidade da rota. `DocumentoProposta` é componente puro (sem hooks) → smoke sem mocks.
- **Segurança:** gate `podeCriarCliente` em todas as actions/páginas; RLS por papel; integração de status atualiza a oportunidade via client de sessão.
- **Sequência sem quebra:** T1 antes de T3 (tabelas); T4 usa T3; T5/T6 usam T3/T2. Cada tarefa fecha verde.
- **Escopo:** editor + documento + status. Link público/PDF/WhatsApp/catálogo/aceite fora.
