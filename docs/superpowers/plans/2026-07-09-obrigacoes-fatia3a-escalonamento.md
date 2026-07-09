# Obrigações — Fatia 3A (Escalonamento hierárquico) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Escalar obrigações muito atrasadas do responsável para o líder e o sócio (hierarquia de usuários), configurável e visível numa página dedicada com badge.

**Architecture:** `usuarios.superior_id` (cadeia responsável→líder→sócio) + config singleton (toggle + limiares); helper puro de escalonamento (TDD); leitura via `createAdminSupabase` contornando a RLS por-cliente e filtrando pela cadeia; página `/obrigacoes/escalonamento` + badge; toggle em Configurações → Matriz. Spec: `docs/superpowers/specs/2026-07-09-obrigacoes-fatia3a-escalonamento-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase, Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`.
- Gate: config/superior = **admin**; página/consultas de escalonamento = `podeCriarCliente`.
- Escalonamento **contorna a RLS por-cliente** de propósito (via `createAdminSupabase`), filtrando pela cadeia no código.
- `nivelEscalonamento` assume `diasSocio ≥ diasLider`.
- Migration idempotente; imutável após aplicada (`npm run db:migrate` atinge produção).
- Branch: `git checkout -b feat/obrigacoes-fatia3a develop`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Deploy (pós-merge):** `develop → main → Implantar` + validar por `curl` (307).

---

## File Structure

- `supabase/migrations/0063_obrigacao_escalonamento.sql` — **novo**: `usuarios.superior_id` + `obrigacao_config`.
- `src/lib/obrigacoes/escalonamento.ts` (+ test) — **novo**: helper puro.
- `src/app/(app)/obrigacoes/escalonamento-actions.ts` — **novo**: `listarEscalonamento`/`contarEscalonamento`/`escalonamentoAtivo`.
- `src/app/(app)/obrigacoes/escalonamento/page.tsx` + `EscalonamentoView.tsx` (+ smoke) — **novo**: página.
- `src/app/(app)/configuracoes/obrigacoes/actions.ts` — **modificar**: config actions.
- `src/app/(app)/configuracoes/obrigacoes/ConfigEscalonamento.tsx` (+ smoke) + `page.tsx` — **novo/modificar**: toggle.
- `src/app/(app)/usuarios/actions.ts` + `page.tsx` — **modificar**: `definirSuperior` + seletor.
- `src/components/Sidebar.tsx` + `src/app/(app)/layout.tsx` — **modificar**: item + badge.

---

## Task 1: Migration — superior_id + config

**Files:**
- Create: `supabase/migrations/0063_obrigacao_escalonamento.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Obrigações Fatia 3A: hierarquia de usuários (escalonamento) + config (toggle + limiares).
alter table usuarios add column if not exists superior_id uuid references usuarios(id);

create table if not exists obrigacao_config (
  id int primary key default 1,
  escalonamento_ativo boolean not null default false,
  dias_lider int not null default 7,
  dias_socio int not null default 15,
  atualizado_em timestamptz not null default now(),
  constraint obrigacao_config_singleton check (id = 1)
);
alter table obrigacao_config enable row level security;
drop policy if exists obrigacao_config_sel on obrigacao_config;
create policy obrigacao_config_sel on obrigacao_config for select using (true);
drop policy if exists obrigacao_config_upd on obrigacao_config;
create policy obrigacao_config_upd on obrigacao_config for update
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
insert into obrigacao_config (id) values (1) on conflict (id) do nothing;
```

- [ ] **Step 2: Aplicar** — `npm run db:migrate` (esperado: `0063_obrigacao_escalonamento` aplicada). ⚠️ Produção; imutável depois.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/0063_obrigacao_escalonamento.sql
git commit -m "feat(obrigacoes): migration de escalonamento (superior_id + config)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Helper de escalonamento (TDD)

**Files:**
- Create: `src/lib/obrigacoes/escalonamento.ts`
- Test: `src/tests/obrigacoes/escalonamento.test.ts`

**Interfaces:**
- Produces: `type NivelEscalonamento`, `nivelEscalonamento`, `type Cadeia`, `escaladoParaUsuario`.

- [ ] **Step 1: Testes**

```ts
import { describe, it, expect } from "vitest";
import { nivelEscalonamento, escaladoParaUsuario, type Cadeia } from "@/lib/obrigacoes/escalonamento";

describe("nivelEscalonamento", () => {
  it("classifica pelos limiares (7/15)", () => {
    expect(nivelEscalonamento(6, 7, 15)).toBe(0);
    expect(nivelEscalonamento(7, 7, 15)).toBe(1);
    expect(nivelEscalonamento(14, 7, 15)).toBe(1);
    expect(nivelEscalonamento(15, 7, 15)).toBe(2);
  });
});

describe("escaladoParaUsuario", () => {
  const cadeia: Cadeia = { liderId: "L", socioId: "S" };
  it("líder vê nível >= 1", () => {
    expect(escaladoParaUsuario(1, cadeia, "L")).toBe(true);
    expect(escaladoParaUsuario(2, cadeia, "L")).toBe(true);
    expect(escaladoParaUsuario(0, cadeia, "L")).toBe(false);
  });
  it("sócio só vê nível 2", () => {
    expect(escaladoParaUsuario(2, cadeia, "S")).toBe(true);
    expect(escaladoParaUsuario(1, cadeia, "S")).toBe(false);
  });
  it("sócio nulo não quebra; fora da cadeia não vê", () => {
    expect(escaladoParaUsuario(2, { liderId: "L", socioId: null }, "L")).toBe(true);
    expect(escaladoParaUsuario(2, { liderId: "L", socioId: null }, "X")).toBe(false);
    expect(escaladoParaUsuario(2, cadeia, "X")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- obrigacoes/escalonamento` → FAIL.

- [ ] **Step 3: Implementar `escalonamento.ts`**

```ts
export type NivelEscalonamento = 0 | 1 | 2; // 0 nenhum · 1 líder · 2 sócio
export function nivelEscalonamento(diasAtraso: number, diasLider: number, diasSocio: number): NivelEscalonamento {
  if (diasAtraso >= diasSocio) return 2;
  if (diasAtraso >= diasLider) return 1;
  return 0;
}

export type Cadeia = { liderId: string | null; socioId: string | null };
export function escaladoParaUsuario(nivel: NivelEscalonamento, cadeia: Cadeia, usuarioId: string): boolean {
  if (nivel >= 1 && cadeia.liderId === usuarioId) return true;
  if (nivel >= 2 && cadeia.socioId === usuarioId) return true;
  return false;
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- obrigacoes/escalonamento` (PASS), `npm run lint`, `npm run typecheck`.

- [ ] **Step 5: Commit**
```bash
git add src/lib/obrigacoes/escalonamento.ts src/tests/obrigacoes/escalonamento.test.ts
git commit -m "feat(obrigacoes): helper de escalonamento (nível + destinatário) TDD

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Actions de escalonamento

**Files:**
- Create: `src/app/(app)/obrigacoes/escalonamento-actions.ts`

**Interfaces:**
- Consumes: `nivelEscalonamento`, `escaladoParaUsuario`, `Cadeia` (Task 2); `podeCriarCliente`; `createAdminSupabase`.
- Produces: `type ItemEscalado`, `listarEscalonamento`, `contarEscalonamento`, `escalonamentoAtivo`.

- [ ] **Step 1: Criar `escalonamento-actions.ts`**

```ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { nivelEscalonamento, escaladoParaUsuario, type Cadeia } from "@/lib/obrigacoes/escalonamento";

export type ItemEscalado = { id: string; clienteNome: string; obrigacaoNome: string; vencimentoInterno: string; diasAtraso: number; nivel: 1 | 2; responsavelNome: string | null };

const diffDias = (a: string, b: string) => Math.floor((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const um = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return null;
  return p;
}

async function coletar(perfilId: string): Promise<ItemEscalado[]> {
  const admin = createAdminSupabase();
  const { data: cfg } = await admin.from("obrigacao_config").select("escalonamento_ativo, dias_lider, dias_socio").eq("id", 1).maybeSingle();
  if (!cfg?.escalonamento_ativo) return [];
  const diasLider = cfg.dias_lider as number;
  const diasSocio = cfg.dias_socio as number;
  const { data: users } = await admin.from("usuarios").select("id, nome, superior_id");
  const supMap = new Map<string, string | null>();
  const nomeMap = new Map<string, string>();
  for (const u of users ?? []) {
    supMap.set(u.id as string, (u.superior_id as string | null) ?? null);
    nomeMap.set(u.id as string, u.nome as string);
  }
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const { data } = await admin.from("obrigacao_instancia").select("id, vencimento_interno, responsavel_id, obrigacao(nome), clientes(razao_social)").eq("status", "pendente").is("entregue_em", null).lt("vencimento_interno", hoje);
  const out: ItemEscalado[] = [];
  for (const r of data ?? []) {
    const respId = (r.responsavel_id as string | null) ?? null;
    if (!respId) continue;
    const liderId = supMap.get(respId) ?? null;
    const socioId = liderId ? (supMap.get(liderId) ?? null) : null;
    const cadeia: Cadeia = { liderId, socioId };
    const diasAtraso = diffDias(r.vencimento_interno as string, hoje);
    const nivel = nivelEscalonamento(diasAtraso, diasLider, diasSocio);
    if (nivel === 0 || !escaladoParaUsuario(nivel, cadeia, perfilId)) continue;
    const o = um(r.obrigacao as { nome?: string } | { nome?: string }[] | null);
    const cl = um(r.clientes as { razao_social?: string } | { razao_social?: string }[] | null);
    out.push({ id: r.id as string, clienteNome: cl?.razao_social ?? "—", obrigacaoNome: o?.nome ?? "—", vencimentoInterno: r.vencimento_interno as string, diasAtraso, nivel: nivel as 1 | 2, responsavelNome: nomeMap.get(respId) ?? null });
  }
  out.sort((a, b) => b.diasAtraso - a.diasAtraso);
  return out;
}

export async function listarEscalonamento(): Promise<ItemEscalado[]> {
  const p = await gate();
  if (!p) return [];
  return coletar(p.id);
}

export async function contarEscalonamento(): Promise<number> {
  const p = await gate();
  if (!p) return 0;
  return (await coletar(p.id)).length;
}

export async function escalonamentoAtivo(): Promise<boolean> {
  if (!(await gate())) return false;
  const admin = createAdminSupabase();
  const { data } = await admin.from("obrigacao_config").select("escalonamento_ativo").eq("id", 1).maybeSingle();
  return !!data?.escalonamento_ativo;
}
```

- [ ] **Step 2: Verificar + commit** — `npm run lint && npm run typecheck && npm run build`.
```bash
git add "src/app/(app)/obrigacoes/escalonamento-actions.ts"
git commit -m "feat(obrigacoes): actions de escalonamento (lista/contagem/ativo)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Toggle + limiares (config admin)

**Files:**
- Modify: `src/app/(app)/configuracoes/obrigacoes/actions.ts`
- Create: `src/app/(app)/configuracoes/obrigacoes/ConfigEscalonamento.tsx`
- Modify: `src/app/(app)/configuracoes/obrigacoes/page.tsx`
- Test: `src/tests/obrigacoes/config-escalonamento-render.test.tsx`

**Interfaces:**
- Produces: `obterConfigEscalonamento`, `salvarConfigEscalonamento`, `type ConfigEscalonamentoView`.

- [ ] **Step 1: Actions** — em `configuracoes/obrigacoes/actions.ts` acrescentar (o arquivo já importa `getPerfilAtual`, `createServerSupabase`, `revalidatePath` e tem `gate` = admin):

```ts
export type ConfigEscalonamentoView = { ativo: boolean; diasLider: number; diasSocio: number };

export async function obterConfigEscalonamento(): Promise<ConfigEscalonamentoView> {
  const p = await getPerfilAtual();
  if (!p?.ativo) return { ativo: false, diasLider: 7, diasSocio: 15 };
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("obrigacao_config").select("escalonamento_ativo, dias_lider, dias_socio").eq("id", 1).maybeSingle();
  return { ativo: !!data?.escalonamento_ativo, diasLider: (data?.dias_lider as number) ?? 7, diasSocio: (data?.dias_socio as number) ?? 15 };
}

export async function salvarConfigEscalonamento(input: ConfigEscalonamentoView): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const diasLider = Math.max(1, Math.trunc(input.diasLider));
  const diasSocio = Math.max(diasLider, Math.trunc(input.diasSocio));
  const { error } = await supabase.from("obrigacao_config").update({ escalonamento_ativo: input.ativo, dias_lider: diasLider, dias_socio: diasSocio }).eq("id", 1);
  if (error) return { erro: error.message };
  revalidatePath("/configuracoes/obrigacoes");
  return { ok: true };
}
```

- [ ] **Step 2: Smoke**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/obrigacoes/actions", () => ({ salvarConfigEscalonamento: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { ConfigEscalonamento } from "@/app/(app)/configuracoes/obrigacoes/ConfigEscalonamento";

describe("ConfigEscalonamento", () => {
  it("renderiza o checkbox e os limiares", () => {
    const html = renderToStaticMarkup(<ConfigEscalonamento inicial={{ ativo: true, diasLider: 7, diasSocio: 15 }} />);
    expect(html).toContain("Escalonamento de atrasos");
    expect(html).toContain("líder");
    expect(html).toContain("sócio");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar** — `npm test -- config-escalonamento-render` → FAIL.

- [ ] **Step 4: `ConfigEscalonamento.tsx`**

```tsx
"use client";
import { useState } from "react";
import { salvarConfigEscalonamento, type ConfigEscalonamentoView } from "./actions";

export function ConfigEscalonamento({ inicial }: { inicial: ConfigEscalonamentoView }) {
  const [ativo, setAtivo] = useState(inicial.ativo);
  const [diasLider, setDiasLider] = useState(inicial.diasLider);
  const [diasSocio, setDiasSocio] = useState(inicial.diasSocio);
  const [msg, setMsg] = useState("");

  async function salvar() {
    const r = await salvarConfigEscalonamento({ ativo, diasLider, diasSocio });
    setMsg(r.ok ? "Salvo." : r.erro ?? "Erro");
  }
  const num = "w-16 rounded-lg border border-linha px-2 py-1 text-sm";
  return (
    <section className="space-y-2 rounded-2xl border border-linha bg-white p-3">
      <h2 className="font-display text-lg font-semibold text-texto">Escalonamento de atrasos</h2>
      <label className="flex items-center gap-2 text-sm text-texto"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />Ativar escalonamento</label>
      <div className="flex flex-wrap items-center gap-2 text-sm text-cinza">
        <label>escala ao <strong>líder</strong> após <input type="number" min={1} value={diasLider} onChange={(e) => setDiasLider(Number(e.target.value))} className={num} /> dias de atraso</label>
        <label>ao <strong>sócio</strong> após <input type="number" min={1} value={diasSocio} onChange={(e) => setDiasSocio(Number(e.target.value))} className={num} /> dias</label>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={salvar} className="rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white">Salvar</button>
        {msg && <span className="text-sm text-cinza">{msg}</span>}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Renderizar no topo da matriz** — em `configuracoes/obrigacoes/page.tsx`: importar `ConfigEscalonamento` e `obterConfigEscalonamento`; carregar `const config = await obterConfigEscalonamento();` e renderizar `<ConfigEscalonamento inicial={config} />` **antes** de `<EditorMatriz .../>`.

- [ ] **Step 6: Rodar tudo** — `npm test -- config-escalonamento-render` (PASS), `npm run lint && npm run typecheck && npm run build`.

- [ ] **Step 7: Commit**
```bash
git add "src/app/(app)/configuracoes/obrigacoes/actions.ts" "src/app/(app)/configuracoes/obrigacoes/ConfigEscalonamento.tsx" "src/app/(app)/configuracoes/obrigacoes/page.tsx" src/tests/obrigacoes/config-escalonamento-render.test.tsx
git commit -m "feat(obrigacoes): toggle e limiares do escalonamento (admin)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Hierarquia na gestão de usuários

**Files:**
- Modify: `src/app/(app)/usuarios/actions.ts`
- Modify: `src/app/(app)/usuarios/page.tsx`

**Interfaces:**
- Consumes: `exigirAdmin` (existente no arquivo), `createAdminSupabase`.
- Produces: `definirSuperior(usuarioId, formData)`.

- [ ] **Step 1: `definirSuperior`** — em `usuarios/actions.ts` (mirrorando `alterarPapel`; usa `exigirAdmin` e `createAdminSupabase` já importados):

```ts
export async function definirSuperior(usuarioId: string, formData: FormData) {
  await exigirAdmin();
  const bruto = String(formData.get("superior_id") ?? "");
  const superiorId = bruto === "" ? null : bruto;
  if (superiorId === usuarioId) return; // não pode ser superior de si mesmo
  const admin = createAdminSupabase();
  // proteção contra ciclo: sobe a partir do superior escolhido
  if (superiorId) {
    let cur: string | null = superiorId;
    const visto = new Set<string>();
    while (cur) {
      if (cur === usuarioId) return; // fecharia um ciclo — rejeita silenciosamente
      if (visto.has(cur)) break;
      visto.add(cur);
      const { data } = await admin.from("usuarios").select("superior_id").eq("id", cur).maybeSingle();
      cur = (data?.superior_id as string | null) ?? null;
    }
  }
  await admin.from("usuarios").update({ superior_id: superiorId }).eq("id", usuarioId);
  revalidatePath("/usuarios");
}
```
(Confirmar que `revalidatePath` já está importado no arquivo; se não, `import { revalidatePath } from "next/cache";`.)

- [ ] **Step 2: Seletor "Superior" na tabela** — em `usuarios/page.tsx`: no `.select(...)` de usuários trocar para incluir `superior_id` (`.select("id, nome, email, papel, ativo, superior_id")`); importar `definirSuperior`; adicionar um `<th>Superior</th>` no cabeçalho e, em cada linha (dentro do `map`, quando `!ehProprio`), uma célula:

```tsx
                    <td className="p-2">
                      <form action={definirSuperior.bind(null, u.id)} className="flex gap-1">
                        <select name="superior_id" defaultValue={(u as { superior_id: string | null }).superior_id ?? ""} aria-label={`Superior de ${u.nome}`} className="rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto focus:border-verde">
                          <option value="">— nenhum —</option>
                          {usuarios!.filter((o) => o.id !== u.id).map((o) => (
                            <option key={o.id} value={o.id}>{o.nome}</option>
                          ))}
                        </select>
                        <BotaoAcao className="rounded-lg border border-linha px-3 py-2 text-sm text-cinza hover:bg-creme" rotulo={`Salvar superior de ${u.nome}`}>Salvar</BotaoAcao>
                      </form>
                    </td>
```
(Para `ehProprio`, renderizar uma célula vazia `<td className="p-2" />` para manter as colunas alinhadas.)

- [ ] **Step 3: Rodar tudo** — `npm run lint && npm run typecheck && npm test && npm run build`.

- [ ] **Step 4: Commit**
```bash
git add "src/app/(app)/usuarios/actions.ts" "src/app/(app)/usuarios/page.tsx"
git commit -m "feat(usuarios): definir superior (hierarquia p/ escalonamento)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Página de escalonamento + badge no menu

**Files:**
- Create: `src/app/(app)/obrigacoes/escalonamento/page.tsx`
- Create: `src/app/(app)/obrigacoes/escalonamento/EscalonamentoView.tsx`
- Modify: `src/components/Sidebar.tsx`, `src/app/(app)/layout.tsx`
- Modify: `src/app/(app)/obrigacoes/Calendario.tsx` (link)
- Test: `src/tests/obrigacoes/escalonamento-render.test.tsx`

**Interfaces:**
- Consumes: `listarEscalonamento`, `escalonamentoAtivo`, `contarEscalonamento`, `ItemEscalado` (Task 3).

- [ ] **Step 1: Smoke**

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EscalonamentoView } from "@/app/(app)/obrigacoes/escalonamento/EscalonamentoView";
import type { ItemEscalado } from "@/app/(app)/obrigacoes/escalonamento-actions";

const itens: ItemEscalado[] = [{ id: "1", clienteNome: "ACME LTDA", obrigacaoNome: "PGDAS-D", vencimentoInterno: "2026-07-01", diasAtraso: 20, nivel: 2, responsavelNome: "Maria" }];

describe("EscalonamentoView", () => {
  it("lista o item escalado com responsável e nível", () => {
    const html = renderToStaticMarkup(<EscalonamentoView itens={itens} ativo={true} />);
    expect(html).toContain("ACME LTDA");
    expect(html).toContain("Maria");
    expect(html).toContain("sócio");
  });
  it("avisa quando desativado", () => {
    const html = renderToStaticMarkup(<EscalonamentoView itens={[]} ativo={false} />);
    expect(html).toContain("desativado");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- obrigacoes/escalonamento-render` → FAIL.

- [ ] **Step 3: `EscalonamentoView.tsx`** (componente simples, sem estado — não precisa de "use client")

```tsx
import type { ItemEscalado } from "../escalonamento-actions";

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const SELO_NIVEL: Record<1 | 2, string> = { 1: "bg-negativo/10 text-negativo", 2: "bg-negativo text-white" };
const ROTULO: Record<1 | 2, string> = { 1: "líder", 2: "sócio" };

export function EscalonamentoView({ itens, ativo }: { itens: ItemEscalado[]; ativo: boolean }) {
  if (!ativo) return <p className="rounded-2xl border border-linha bg-white px-3 py-4 text-sm text-cinza">Escalonamento desativado nas configurações.</p>;
  if (itens.length === 0) return <p className="rounded-2xl border border-linha bg-white px-3 py-4 text-sm text-cinza">Nada escalado para você.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-linha text-left text-xs text-cinza">
            <th className="px-3 py-2 font-medium">Cliente</th>
            <th className="px-3 py-2 font-medium">Obrigação</th>
            <th className="px-3 py-2 font-medium">Vencimento</th>
            <th className="px-3 py-2 font-medium">Atraso</th>
            <th className="px-3 py-2 font-medium">Responsável</th>
            <th className="px-3 py-2 font-medium">Nível</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((it) => (
            <tr key={it.id} className="border-b border-linha/60">
              <td className="px-3 py-1.5 text-texto">{it.clienteNome}</td>
              <td className="px-3 py-1.5">{it.obrigacaoNome}</td>
              <td className="px-3 py-1.5">{dataBR(it.vencimentoInterno)}</td>
              <td className="px-3 py-1.5 tabular-nums">{it.diasAtraso} dias</td>
              <td className="px-3 py-1.5">{it.responsavelNome ?? "—"}</td>
              <td className="px-3 py-1.5"><span className={`rounded px-1.5 py-0.5 text-xs ${SELO_NIVEL[it.nivel]}`}>{ROTULO[it.nivel]}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar** — `npm test -- obrigacoes/escalonamento-render` → PASS.

- [ ] **Step 5: `escalonamento/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { EscalonamentoView } from "./EscalonamentoView";
import { listarEscalonamento, escalonamentoAtivo } from "../escalonamento-actions";

export default async function EscalonamentoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const [itens, ativo] = await Promise.all([listarEscalonamento(), escalonamentoAtivo()]);
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4">
      <PageHeader titulo="Escalonamento" subtitulo="Obrigações atrasadas que subiram para você (líder/sócio)" />
      <EscalonamentoView itens={itens} ativo={ativo} />
    </main>
  );
}
```

- [ ] **Step 6: Badge + item no Sidebar** — `layout.tsx`: `import { contarEscalonamento } from "@/app/(app)/obrigacoes/escalonamento-actions";` e `const escalonamento = podeCriarCliente(perfil.papel) ? await contarEscalonamento() : 0;`, passar `escalonamento={escalonamento}` ao `<Sidebar>`. Em `Sidebar.tsx`: add `escalonamento = 0` às props (`{ ..., escalonamento?: number }`) e um item após "Obrigações":
```tsx
    ...(podeCriarCliente(papel) ? [{ href: "/obrigacoes/escalonamento", label: "Escalonamento", badge: escalonamento || undefined }] : []),
```

- [ ] **Step 7: Link no calendário** — em `Calendario.tsx`, ao lado de "Ver riscos": `<a href="/obrigacoes/escalonamento" className="rounded-lg border border-linha px-3 py-1.5 text-sm">Escalonamento</a>`.

- [ ] **Step 8: Rodar tudo** — `npm run lint && npm run typecheck && npm test && npm run build`.

- [ ] **Step 9: Commit**
```bash
git add "src/app/(app)/obrigacoes/escalonamento" src/components/Sidebar.tsx "src/app/(app)/layout.tsx" "src/app/(app)/obrigacoes/Calendario.tsx" src/tests/obrigacoes/escalonamento-render.test.tsx
git commit -m "feat(obrigacoes): página de escalonamento + badge no menu

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Obrigações e Compliance (Fatia 3A — escalonamento):** hierarquia de usuários (campo Superior em
  Usuários) e **escalonamento** das obrigações muito atrasadas do responsável para o líder e o sócio,
  com limiares configuráveis e liga/desliga (Configurações → Matriz de obrigações); página
  **Escalonamento** (`/obrigacoes/escalonamento`) e badge no menu com o que subiu para você.
```

- [ ] **Step 2: Commit + finalizar**
```bash
git add CHANGELOG.md
git commit -m "docs: changelog da Fatia 3A de Obrigações (escalonamento)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois: `superpowers:finishing-a-development-branch`. **Deploy:** `develop → main` + push + Implantar + validar `/obrigacoes/escalonamento` por curl (307).

---

## Self-Review

- **Cobertura do spec:** `superior_id` + config (T1) ✓; helper (T2) ✓; actions de escalonamento com bypass de RLS + filtro por cadeia (T3) ✓; toggle/limiares admin (T4) ✓; hierarquia em Usuários com proteção de ciclo (T5) ✓; página + badge + link (T6) ✓; changelog (T7) ✓. Unit (T2) + smoke (T4, T6).
- **Placeholders:** nenhum — todo passo tem código.
- **Consistência de tipos:** `NivelEscalonamento`/`Cadeia` (T2) usados em `escalonamento-actions` (T3); `ItemEscalado` (T3) em `EscalonamentoView`/página/smoke (T6); `ConfigEscalonamentoView` (T4) em `ConfigEscalonamento` e no page da matriz. `contarEscalonamento` (T3) no layout/Sidebar (T6).
- **Segurança:** config/superior só admin; página gate `podeCriarCliente`; o bypass de RLS é deliberado e filtrado pela cadeia no servidor (nunca expõe além de quem está acima do responsável).
- **Escopo:** só escalonamento (RF-035). Suspensão/retroativos (RF-036) e relatório (RF-037) ficam na Fatia 3B.
