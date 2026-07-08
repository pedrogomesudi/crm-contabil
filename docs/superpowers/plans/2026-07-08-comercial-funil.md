# Módulo Comercial — funil de oportunidades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Funil de vendas — cadastrar oportunidades, movê-las por etapas fixas em um quadro, e ao ganhar converter em cliente com atalho para o onboarding.

**Architecture:** Tabela `oportunidade` (pré-cliente, RLS por papel); helpers puros de etapas; actions de CRUD/mover; quadro `/comercial`; conversão via `criarCliente` parametrizado por `oportunidade_id`. Spec: `docs/superpowers/specs/2026-07-08-comercial-funil-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase (Postgres/RLS), Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`. Todos passam.
- Migration idempotente via `npm run db:migrate` (banco compartilhado, atinge prod). Imutável após aplicada.
- Gate `podeCriarCliente` (admin/assistente/contador) em todas as actions/páginas. RLS **por papel** (`auth_papel() in ('admin','assistente','contador')`) — correto porque a oportunidade é pré-cliente (sem `cliente_id` até converter).
- Tokens SALDO na UI. Branch: `git checkout -b feat/comercial-funil develop`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `supabase/migrations/0054_comercial_oportunidade.sql` — **novo**: enum + tabela + RLS.
- `src/lib/comercial/funil.ts` — **novo**: helpers puros.
- `src/tests/comercial/funil.test.ts` — **novo**.
- `src/app/(app)/comercial/actions.ts` — **novo**: actions.
- `src/app/(app)/comercial/QuadroComercial.tsx` — **novo**: quadro (client).
- `src/app/(app)/comercial/page.tsx` — **novo**: página (server).
- `src/tests/comercial/quadro-render.test.tsx` — **novo**: smoke.
- `src/app/(app)/clientes/actions.ts` — **modificar**: `criarCliente` parametrizado.
- `src/app/(app)/clientes/novo/page.tsx` — **modificar**: pré-preenche da oportunidade.
- `src/components/Sidebar.tsx` — **modificar**: item "Comercial".

---

## Task 1: Migration — tabela oportunidade

**Files:**
- Create: `supabase/migrations/0054_comercial_oportunidade.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Módulo comercial (Fatia A): funil de oportunidades (pré-cliente).
do $$ begin
  create type oportunidade_etapa as enum ('novo','contato','proposta','negociacao','ganho','perdido');
exception when duplicate_object then null; end $$;

create table if not exists oportunidade (
  id uuid primary key default gen_random_uuid(),
  prospect_nome text not null,
  contato_nome text,
  contato_telefone text,
  contato_email text,
  origem text,
  servico_interesse text,
  valor_estimado numeric(12,2),
  responsavel_id uuid references usuarios(id),
  etapa oportunidade_etapa not null default 'novo',
  observacoes text,
  motivo_perda text,
  cliente_id uuid references clientes(id),
  criado_por uuid references usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table oportunidade enable row level security;
drop policy if exists oportunidade_rw on oportunidade;
create policy oportunidade_rw on oportunidade for all
  using (auth_papel() in ('admin','assistente','contador'))
  with check (auth_papel() in ('admin','assistente','contador'));
```

- [ ] **Step 2: Aplicar e verificar**

Run: `npm run db:migrate`
Expected: "1 migration(s) nova(s) aplicada(s)."
Verificar a tabela:
```bash
node --env-file=.env.local -e "import('./scripts/_db.mjs').then(async({makeClient})=>{const c=makeClient();await c.connect();const r=await c.query(\"select count(*) from oportunidade\");console.log('oportunidade OK:', r.rows[0].count);await c.end();});"
```
Expected: `oportunidade OK: 0`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0054_comercial_oportunidade.sql
git commit -m "feat(comercial): migration da tabela oportunidade (funil)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Helpers puros do funil (TDD)

**Files:**
- Create: `src/lib/comercial/funil.ts`
- Test: `src/tests/comercial/funil.test.ts`

**Interfaces:**
- Produces: `type EtapaOportunidade`; `ETAPAS_ATIVAS`; `rotuloEtapa(e)`; `etapaAdjacente(e, dir)`; `resumoFunil(ops)`.

- [ ] **Step 1: Testes**

```ts
import { describe, it, expect } from "vitest";
import { etapaAdjacente, resumoFunil, rotuloEtapa, ETAPAS_ATIVAS } from "@/lib/comercial/funil";

describe("etapaAdjacente", () => {
  it("navega entre ativas", () => {
    expect(etapaAdjacente("contato", "anterior")).toBe("novo");
    expect(etapaAdjacente("proposta", "proxima")).toBe("negociacao");
  });
  it("bordas → null", () => {
    expect(etapaAdjacente("novo", "anterior")).toBe(null);
    expect(etapaAdjacente("negociacao", "proxima")).toBe(null);
  });
  it("terminais → null", () => {
    expect(etapaAdjacente("ganho", "anterior")).toBe(null);
    expect(etapaAdjacente("perdido", "proxima")).toBe(null);
  });
});

describe("resumoFunil", () => {
  it("conta e soma por etapa, null=0", () => {
    const r = resumoFunil([
      { etapa: "novo", valorEstimado: 300 },
      { etapa: "novo", valorEstimado: null },
      { etapa: "proposta", valorEstimado: 500 },
      { etapa: "ganho", valorEstimado: 999 },
    ]);
    expect(r.novo).toEqual({ qtd: 2, total: 300 });
    expect(r.proposta).toEqual({ qtd: 1, total: 500 });
    expect(r.negociacao).toEqual({ qtd: 0, total: 0 });
    expect(r.ganho).toBeUndefined();
  });
});

describe("rotuloEtapa / ETAPAS_ATIVAS", () => {
  it("rótulos", () => {
    expect(rotuloEtapa("negociacao")).toBe("Negociação");
    expect(ETAPAS_ATIVAS.map((e) => e.chave)).toEqual(["novo", "contato", "proposta", "negociacao"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- comercial/funil` → FAIL.

- [ ] **Step 3: Implementar `funil.ts`**

```ts
export type EtapaOportunidade = "novo" | "contato" | "proposta" | "negociacao" | "ganho" | "perdido";

export const ETAPAS_ATIVAS: { chave: EtapaOportunidade; rotulo: string }[] = [
  { chave: "novo", rotulo: "Novo" },
  { chave: "contato", rotulo: "Contato feito" },
  { chave: "proposta", rotulo: "Proposta enviada" },
  { chave: "negociacao", rotulo: "Negociação" },
];

const ROTULOS: Record<EtapaOportunidade, string> = {
  novo: "Novo",
  contato: "Contato feito",
  proposta: "Proposta enviada",
  negociacao: "Negociação",
  ganho: "Ganho",
  perdido: "Perdido",
};

export function rotuloEtapa(e: EtapaOportunidade): string {
  return ROTULOS[e];
}

export function etapaAdjacente(e: EtapaOportunidade, dir: "anterior" | "proxima"): EtapaOportunidade | null {
  const i = ETAPAS_ATIVAS.findIndex((x) => x.chave === e);
  if (i < 0) return null;
  const j = dir === "anterior" ? i - 1 : i + 1;
  if (j < 0 || j >= ETAPAS_ATIVAS.length) return null;
  return ETAPAS_ATIVAS[j]!.chave;
}

export function resumoFunil(ops: { etapa: EtapaOportunidade; valorEstimado: number | null }[]): Record<string, { qtd: number; total: number }> {
  const r: Record<string, { qtd: number; total: number }> = {};
  for (const { chave } of ETAPAS_ATIVAS) r[chave] = { qtd: 0, total: 0 };
  for (const o of ops) {
    if (!r[o.etapa]) continue;
    r[o.etapa]!.qtd += 1;
    r[o.etapa]!.total += o.valorEstimado ?? 0;
  }
  return r;
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- comercial/funil` (PASS), `npm run lint`, `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comercial/funil.ts src/tests/comercial/funil.test.ts
git commit -m "feat(comercial): helpers puros do funil (etapas, adjacência, resumo)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Actions do comercial

**Files:**
- Create: `src/app/(app)/comercial/actions.ts`

**Interfaces:**
- Consumes: `EtapaOportunidade` (Task 2); `podeCriarCliente`.
- Produces: `type OportunidadeView`, `type OportunidadeInput`; `listarOportunidades()`, `criarOportunidade(input)`, `salvarOportunidade(id, input)`, `definirEtapa(id, etapa, motivo?)`.

- [ ] **Step 1: Criar `actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import type { EtapaOportunidade } from "@/lib/comercial/funil";

export type OportunidadeView = { id: string; prospectNome: string; contatoNome: string | null; contatoTelefone: string | null; contatoEmail: string | null; origem: string | null; servicoInteresse: string | null; valorEstimado: number | null; responsavelId: string | null; responsavelNome: string | null; etapa: EtapaOportunidade; observacoes: string | null; motivoPerda: string | null; clienteId: string | null; meu: boolean };
export type OportunidadeInput = { prospectNome: string; contatoNome: string | null; contatoTelefone: string | null; contatoEmail: string | null; origem: string | null; servicoInteresse: string | null; valorEstimado: number | null; responsavelId: string | null; observacoes: string | null };

function paraColunas(input: OportunidadeInput) {
  return {
    prospect_nome: input.prospectNome.trim(),
    contato_nome: input.contatoNome,
    contato_telefone: input.contatoTelefone,
    contato_email: input.contatoEmail,
    origem: input.origem,
    servico_interesse: input.servicoInteresse,
    valor_estimado: input.valorEstimado,
    responsavel_id: input.responsavelId,
    observacoes: input.observacoes,
  };
}

export async function listarOportunidades(): Promise<OportunidadeView[]> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("oportunidade").select("id, prospect_nome, contato_nome, contato_telefone, contato_email, origem, servico_interesse, valor_estimado, responsavel_id, etapa, observacoes, motivo_perda, cliente_id").order("criado_em", { ascending: false });
  const rows = data ?? [];
  const respIds = [...new Set(rows.map((r) => r.responsavel_id as string | null).filter((x): x is string => !!x))];
  const usMap = new Map<string, string>();
  if (respIds.length) {
    const { data: us } = await supabase.from("usuarios").select("id, nome").in("id", respIds);
    for (const u of us ?? []) usMap.set(u.id as string, u.nome as string);
  }
  return rows.map((r) => ({
    id: r.id as string,
    prospectNome: r.prospect_nome as string,
    contatoNome: (r.contato_nome as string | null) ?? null,
    contatoTelefone: (r.contato_telefone as string | null) ?? null,
    contatoEmail: (r.contato_email as string | null) ?? null,
    origem: (r.origem as string | null) ?? null,
    servicoInteresse: (r.servico_interesse as string | null) ?? null,
    valorEstimado: r.valor_estimado != null ? Number(r.valor_estimado) : null,
    responsavelId: (r.responsavel_id as string | null) ?? null,
    responsavelNome: r.responsavel_id ? (usMap.get(r.responsavel_id as string) ?? null) : null,
    etapa: r.etapa as EtapaOportunidade,
    observacoes: (r.observacoes as string | null) ?? null,
    motivoPerda: (r.motivo_perda as string | null) ?? null,
    clienteId: (r.cliente_id as string | null) ?? null,
    meu: r.responsavel_id === p.id,
  }));
}

export async function criarOportunidade(input: OportunidadeInput): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  if (!input.prospectNome.trim()) return { erro: "Informe o prospect." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("oportunidade").insert(paraColunas(input));
  if (error) return { erro: "Falha ao criar." };
  revalidatePath("/comercial");
  return { ok: true };
}

export async function salvarOportunidade(id: string, input: OportunidadeInput): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  if (!input.prospectNome.trim()) return { erro: "Informe o prospect." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("oportunidade").update({ ...paraColunas(input), atualizado_em: new Date().toISOString() }).eq("id", id);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath("/comercial");
  return { ok: true };
}

export async function definirEtapa(id: string, etapa: EtapaOportunidade, motivo?: string | null): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const patch: Record<string, unknown> = { etapa, atualizado_em: new Date().toISOString() };
  if (etapa === "perdido") patch.motivo_perda = motivo ?? null;
  const { error } = await supabase.from("oportunidade").update(patch).eq("id", id);
  if (error) return { erro: "Falha ao mover." };
  revalidatePath("/comercial");
  return { ok: true };
}
```

- [ ] **Step 2: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build` (sem erros).
```bash
git add "src/app/(app)/comercial/actions.ts"
git commit -m "feat(comercial): actions do funil (listar, criar, salvar, definirEtapa)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Conversão — criarCliente parametrizado

**Files:**
- Modify: `src/app/(app)/clientes/actions.ts`
- Modify: `src/app/(app)/clientes/novo/page.tsx`

**Interfaces:**
- Consumes: a tabela `oportunidade` (Task 1); `ClienteDefaults` (`@/components/FormCliente`).
- Produces: `criarCliente(oportunidadeId: string | null, _prev, formData)`.

- [ ] **Step 1: `criarCliente` recebe `oportunidadeId`**

Em `src/app/(app)/clientes/actions.ts`, trocar a assinatura:
```ts
export async function criarCliente(
  oportunidadeId: string | null,
  _prev: EstadoCliente,
  formData: FormData,
): Promise<EstadoCliente> {
```
E trocar o final (o trecho `revalidatePath("/clientes"); redirect("/clientes?ok=1");`) por:
```ts
  const novoId = data[0]!.id as string;
  revalidatePath("/clientes");
  if (oportunidadeId) {
    await supabase.from("oportunidade").update({ cliente_id: novoId, etapa: "ganho", atualizado_em: new Date().toISOString() }).eq("id", oportunidadeId);
    redirect(`/onboarding/${novoId}`);
  }
  redirect("/clientes?ok=1");
```

- [ ] **Step 2: `novo/page.tsx` — pré-preenche e vincula**

Substituir o conteúdo por:
```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { listarContadores } from "@/lib/clientes/contadores";
import { podeCriarCliente, podeAtribuirContador } from "@/lib/clientes/permissoes";
import { FormCliente, type ClienteDefaults } from "@/components/FormCliente";
import { criarCliente } from "../actions";

export const metadata = { title: "Novo cliente" };

export default async function NovoClientePage({ searchParams }: { searchParams: Promise<{ oportunidade?: string }> }) {
  const perfil = await getPerfilAtual();
  if (!perfil) redirect("/login");
  const papel = perfil.papel;
  if (!podeCriarCliente(papel)) redirect("/clientes");

  const contadorEditavel = podeAtribuirContador(papel, "novo");
  const contadores = contadorEditavel ? await listarContadores() : [];

  const oportunidadeId = (await searchParams).oportunidade ?? null;
  let defaults: ClienteDefaults | undefined;
  if (oportunidadeId) {
    const supabase = await createServerSupabase();
    const { data: op } = await supabase.from("oportunidade").select("prospect_nome, contato_nome, contato_telefone, contato_email, origem").eq("id", oportunidadeId).maybeSingle();
    if (op) {
      defaults = {
        razao_social: (op.prospect_nome as string) ?? "",
        responsavel_nome: (op.contato_nome as string | null) ?? "",
        email: (op.contato_email as string | null) ?? "",
        telefone: (op.contato_telefone as string | null) ?? "",
        observacoes: op.origem ? `Origem comercial: ${op.origem as string}` : "",
      };
    }
  }

  return (
    <div>
      <h1 className="mb-4 font-display text-2xl font-bold tracking-tight text-texto">Novo cliente</h1>
      <FormCliente
        action={criarCliente.bind(null, oportunidadeId)}
        contadores={contadores}
        cliente={defaults}
        modo="novo"
        contadorEditavel={contadorEditavel}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build` (sem erros; nenhum outro chamador de `criarCliente` fora do `novo/page.tsx`).
```bash
git add "src/app/(app)/clientes/actions.ts" "src/app/(app)/clientes/novo/page.tsx"
git commit -m "feat(comercial): conversão de oportunidade em cliente (criarCliente parametrizado)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Quadro `/comercial` + Sidebar

**Files:**
- Create: `src/app/(app)/comercial/QuadroComercial.tsx`
- Create: `src/app/(app)/comercial/page.tsx`
- Modify: `src/components/Sidebar.tsx`
- Test: `src/tests/comercial/quadro-render.test.tsx`

**Interfaces:**
- Consumes: `ETAPAS_ATIVAS`, `etapaAdjacente`, `resumoFunil`, `rotuloEtapa`, `EtapaOportunidade` (Task 2); `listarOportunidades`, `criarOportunidade`, `salvarOportunidade`, `definirEtapa`, `OportunidadeView`, `OportunidadeInput` (Task 3).

- [ ] **Step 1: Smoke test**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/comercial/actions", () => ({ criarOportunidade: vi.fn(), salvarOportunidade: vi.fn(), definirEtapa: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { QuadroComercial } from "@/app/(app)/comercial/QuadroComercial";
import type { OportunidadeView } from "@/app/(app)/comercial/actions";

const ops: OportunidadeView[] = [
  { id: "1", prospectNome: "Padaria Sol", contatoNome: "João", contatoTelefone: null, contatoEmail: null, origem: "Indicação", servicoInteresse: "Abertura", valorEstimado: 400, responsavelId: "u1", responsavelNome: "Ana", etapa: "novo", observacoes: null, motivoPerda: null, clienteId: null, meu: true },
  { id: "2", prospectNome: "Tech XY", contatoNome: null, contatoTelefone: null, contatoEmail: null, origem: null, servicoInteresse: null, valorEstimado: 900, responsavelId: null, responsavelNome: null, etapa: "ganho", observacoes: null, motivoPerda: null, clienteId: null, meu: false },
];

describe("QuadroComercial", () => {
  it("renderiza colunas e card ativo", () => {
    const html = renderToStaticMarkup(<QuadroComercial oportunidades={ops} usuarios={[{ id: "u1", nome: "Ana" }]} />);
    expect(html).toContain("Novo");
    expect(html).toContain("Negociação");
    expect(html).toContain("Padaria Sol");
  });
  it("mostra seção de fechados", () => {
    const html = renderToStaticMarkup(<QuadroComercial oportunidades={ops} usuarios={[]} />);
    expect(html).toContain("Fechados");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- quadro-render` → FAIL.

- [ ] **Step 3: `QuadroComercial.tsx`**

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ETAPAS_ATIVAS, etapaAdjacente, resumoFunil, rotuloEtapa } from "@/lib/comercial/funil";
import { criarOportunidade, salvarOportunidade, definirEtapa, type OportunidadeView, type OportunidadeInput } from "./actions";
import { Botao } from "@/components/ui/Botao";

const brl = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const vazio = (): OportunidadeInput => ({ prospectNome: "", contatoNome: null, contatoTelefone: null, contatoEmail: null, origem: null, servicoInteresse: null, valorEstimado: null, responsavelId: null, observacoes: null });
const doView = (o: OportunidadeView): OportunidadeInput => ({ prospectNome: o.prospectNome, contatoNome: o.contatoNome, contatoTelefone: o.contatoTelefone, contatoEmail: o.contatoEmail, origem: o.origem, servicoInteresse: o.servicoInteresse, valorEstimado: o.valorEstimado, responsavelId: o.responsavelId, observacoes: o.observacoes });

export function QuadroComercial({ oportunidades, usuarios }: { oportunidades: OportunidadeView[]; usuarios: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [soMinhas, setSoMinhas] = useState(false);
  const [form, setForm] = useState<{ id: string | null; input: OportunidadeInput } | null>(null);

  const base = soMinhas ? oportunidades.filter((o) => o.meu) : oportunidades;
  const ativas = base.filter((o) => o.etapa !== "ganho" && o.etapa !== "perdido");
  const fechadas = base.filter((o) => o.etapa === "ganho" || o.etapa === "perdido");
  const resumo = resumoFunil(ativas.map((o) => ({ etapa: o.etapa, valorEstimado: o.valorEstimado })));

  async function chamar(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if (r?.erro) return alert(r.erro);
    router.refresh();
  }
  async function salvar() {
    if (!form) return;
    if (!form.input.prospectNome.trim()) return alert("Informe o prospect.");
    setOcupado(true);
    const r = await (form.id ? salvarOportunidade(form.id, form.input) : criarOportunidade(form.input));
    setOcupado(false);
    if (r?.erro) return alert(r.erro);
    setForm(null);
    router.refresh();
  }
  function perder(id: string) {
    const motivo = window.prompt("Motivo da perda:");
    if (motivo === null) return;
    void chamar(() => definirEtapa(id, "perdido", motivo));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Botao variante="primario" onClick={() => setForm({ id: null, input: vazio() })}>Nova oportunidade</Botao>
        <label className="flex items-center gap-1 text-sm text-cinza">
          <input type="checkbox" checked={soMinhas} onChange={(e) => setSoMinhas(e.target.checked)} /> Só as minhas
        </label>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {ETAPAS_ATIVAS.map((col) => {
          const doCol = ativas.filter((o) => o.etapa === col.chave);
          const rs = resumo[col.chave]!;
          return (
            <div key={col.chave} className="min-w-[240px] flex-1 space-y-2">
              <div className="rounded-lg bg-creme px-2 py-1.5">
                <div className="font-display text-xs font-semibold uppercase tracking-wide text-texto">{col.rotulo}</div>
                <div className="text-[11px] text-cinza">{rs.qtd} · {brl(rs.total)}</div>
              </div>
              {doCol.map((o) => (
                <div key={o.id} className="space-y-1 rounded-lg border border-linha bg-white px-2.5 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-texto">{o.prospectNome}</span>
                    <span className="tabular-nums text-cinza">{brl(o.valorEstimado)}</span>
                  </div>
                  {(o.servicoInteresse || o.responsavelNome) && (
                    <div className="text-[11px] text-cinza">{o.servicoInteresse ?? ""}{o.servicoInteresse && o.responsavelNome ? " · " : ""}{o.responsavelNome ? `resp. ${o.responsavelNome}` : ""}</div>
                  )}
                  <div className="flex flex-wrap items-center gap-1 pt-0.5 text-[11px]">
                    <button type="button" disabled={ocupado || !etapaAdjacente(o.etapa, "anterior")} onClick={() => { const a = etapaAdjacente(o.etapa, "anterior"); if (a) void chamar(() => definirEtapa(o.id, a)); }} className="rounded border border-linha px-1.5 disabled:opacity-40">←</button>
                    <button type="button" disabled={ocupado || !etapaAdjacente(o.etapa, "proxima")} onClick={() => { const a = etapaAdjacente(o.etapa, "proxima"); if (a) void chamar(() => definirEtapa(o.id, a)); }} className="rounded border border-linha px-1.5 disabled:opacity-40">→</button>
                    <button type="button" onClick={() => void chamar(() => definirEtapa(o.id, "ganho"))} className="rounded border border-verde px-1.5 text-verde">Ganho</button>
                    <button type="button" onClick={() => perder(o.id)} className="rounded border border-negativo px-1.5 text-negativo">Perdido</button>
                    <button type="button" onClick={() => setForm({ id: o.id, input: doView(o) })} className="ml-auto text-cinza underline">editar</button>
                  </div>
                </div>
              ))}
              {doCol.length === 0 && <p className="px-1 text-[11px] text-cinza-claro">—</p>}
            </div>
          );
        })}
      </div>

      <details className="rounded-lg border border-linha bg-white p-3">
        <summary className="cursor-pointer text-sm font-medium text-texto">Fechados ({fechadas.length})</summary>
        <div className="mt-2 space-y-1.5">
          {fechadas.length === 0 && <p className="text-xs text-cinza">Nenhum fechado.</p>}
          {fechadas.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-2 border-b border-linha/60 pb-1 text-sm">
              <span className="font-medium text-texto">{o.prospectNome}</span>
              <span className={o.etapa === "ganho" ? "text-verde" : "text-negativo"}>{rotuloEtapa(o.etapa)}</span>
              <span className="tabular-nums text-cinza">{brl(o.valorEstimado)}</span>
              {o.etapa === "perdido" && o.motivoPerda && <span className="text-[11px] text-cinza">— {o.motivoPerda}</span>}
              {o.etapa === "ganho" && (o.clienteId ? (
                <Link href={`/onboarding/${o.clienteId}`} className="ml-auto text-xs text-verde underline">Ver onboarding</Link>
              ) : (
                <Link href={`/clientes/novo?oportunidade=${o.id}`} className="ml-auto text-xs text-verde underline">Converter em cliente</Link>
              ))}
            </div>
          ))}
        </div>
      </details>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md space-y-2 rounded-2xl bg-white p-5">
            <h3 className="font-display text-sm font-semibold text-texto">{form.id ? "Editar oportunidade" : "Nova oportunidade"}</h3>
            <label className="block text-xs text-cinza">Prospect
              <input value={form.input.prospectNome} onChange={(e) => setForm({ ...form, input: { ...form.input, prospectNome: e.target.value } })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
            </label>
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-cinza">Contato
                <input value={form.input.contatoNome ?? ""} onChange={(e) => setForm({ ...form, input: { ...form.input, contatoNome: e.target.value || null } })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
              </label>
              <label className="flex-1 text-xs text-cinza">Telefone
                <input value={form.input.contatoTelefone ?? ""} onChange={(e) => setForm({ ...form, input: { ...form.input, contatoTelefone: e.target.value || null } })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
              </label>
            </div>
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-cinza">E-mail
                <input value={form.input.contatoEmail ?? ""} onChange={(e) => setForm({ ...form, input: { ...form.input, contatoEmail: e.target.value || null } })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
              </label>
              <label className="w-32 text-xs text-cinza">Valor (R$)
                <input type="number" value={form.input.valorEstimado ?? ""} onChange={(e) => setForm({ ...form, input: { ...form.input, valorEstimado: e.target.value === "" ? null : Number(e.target.value) } })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
              </label>
            </div>
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-cinza">Origem
                <input value={form.input.origem ?? ""} onChange={(e) => setForm({ ...form, input: { ...form.input, origem: e.target.value || null } })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
              </label>
              <label className="flex-1 text-xs text-cinza">Serviço
                <input value={form.input.servicoInteresse ?? ""} onChange={(e) => setForm({ ...form, input: { ...form.input, servicoInteresse: e.target.value || null } })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
              </label>
            </div>
            <label className="block text-xs text-cinza">Responsável
              <select value={form.input.responsavelId ?? ""} onChange={(e) => setForm({ ...form, input: { ...form.input, responsavelId: e.target.value || null } })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm">
                <option value="">—</option>
                {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </label>
            <label className="block text-xs text-cinza">Observações
              <textarea value={form.input.observacoes ?? ""} onChange={(e) => setForm({ ...form, input: { ...form.input, observacoes: e.target.value || null } })} rows={2} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Botao variante="fantasma" onClick={() => setForm(null)}>Cancelar</Botao>
              <Botao variante="primario" disabled={ocupado || !form.input.prospectNome.trim()} onClick={salvar}>Salvar</Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar** — `npm test -- quadro-render` → PASS.

- [ ] **Step 5: `comercial/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { QuadroComercial } from "./QuadroComercial";
import { listarOportunidades } from "./actions";

export default async function ComercialPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const oportunidades = await listarOportunidades();
  const supabase = await createServerSupabase();
  const { data: us } = await supabase.from("usuarios").select("id, nome").eq("ativo", true).order("nome");
  const usuarios = (us as { id: string; nome: string }[] | null) ?? [];
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4">
      <PageHeader titulo="Comercial" subtitulo="Funil de oportunidades" />
      <QuadroComercial oportunidades={oportunidades} usuarios={usuarios} />
    </main>
  );
}
```

- [ ] **Step 6: Sidebar — item "Comercial"**

Em `src/components/Sidebar.tsx`, na linha do Atendimento, inserir o item de Comercial logo antes (entre Onboarding e Atendimento):
```tsx
    ...(podeCriarCliente(papel) ? [{ href: "/comercial", label: "Comercial" }] : []),
    ...(podeAtender(papel) ? [{ href: "/atendimento", label: "Atendimento" }] : []),
```

- [ ] **Step 7: Suite completa** — `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde; rota `/comercial` compila).

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/comercial" src/components/Sidebar.tsx src/tests/comercial/quadro-render.test.tsx
git commit -m "feat(comercial): quadro do funil + item no menu

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Módulo Comercial — funil de oportunidades:** nova área `/comercial` com um quadro de prospects por
  etapa (Novo → Contato feito → Proposta enviada → Negociação), cada coluna somando quantidade e valor.
  Move com ← →, marca **Ganho**/**Perdido** (com motivo) e, ao ganhar, **converte em cliente**
  pré-preenchido que já leva ao onboarding. Item "Comercial" no menu (admin/assistente/contador).
```

- [ ] **Step 2: Commit + finalizar**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog do módulo comercial (funil)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois usar `superpowers:finishing-a-development-branch`. (Migration 0054 já aplicada; sem novos segredos.)

---

## Self-Review

- **Cobertura do spec:** migration enum+tabela+RLS (T1) ✓; helpers funil (T2) ✓; actions listar/criar/salvar/definirEtapa (T3) ✓; conversão criarCliente+novo (T4) ✓; quadro com colunas/resumo/mover/ganho/perdido/fechados/minhas + Sidebar (T5) ✓; CHANGELOG (T6) ✓. Testes unit (T2) + smoke (T5) ✓.
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Consistência de tipos:** `EtapaOportunidade` (T2) usado em `OportunidadeView`/actions (T3) e no quadro (T5); `OportunidadeInput`/`OportunidadeView` (T3) consumidos pelo `QuadroComercial` (T5); `ETAPAS_ATIVAS`/`etapaAdjacente`/`resumoFunil`/`rotuloEtapa` (T2) → T5; `criarCliente(oportunidadeId,_prev,formData)` (T4) chamado via `.bind` no `novo/page`. `FormCliente` aceita `cliente` em modo novo (usa `const c = cliente ?? {}`).
- **Segurança:** RLS por papel justificada (pré-cliente, sem `cliente_id`); gate `podeCriarCliente` em todas as actions/páginas; conversão best-effort (não bloqueia se a oportunidade sumir).
- **Sequência sem quebra:** T4 muda a assinatura de `criarCliente` e atualiza seu único chamador (`novo/page`) no mesmo commit; T1 antes de T3/T4 (dependem da tabela).
- **Escopo:** só Fatia A. Métricas/propostas/atividades/gatilho de consultoria fora.
