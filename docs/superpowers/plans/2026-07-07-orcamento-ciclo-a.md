# Financeiro — Orçamento (Ciclo A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela para o admin/financeiro definir o orçado por categoria em cada mês de um ano, com totais e atalhos (replicar/copiar ano anterior).

**Architecture:** Tabela `orcamento` (categoria×ano×mês); helpers puros de agregação; actions listar/salvar; grade editável (categorias × 12 meses) com totais. Spec: `docs/superpowers/specs/2026-07-07-orcamento-ciclo-a-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase (Postgres/RLS), Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Todos passam.
- Migration nova em `supabase/migrations/`, aplicada por `npm run db:migrate` (NUNCA `supabase db push`). Idempotente. Atinge produção.
- Gate: `podeGerenciarFinanceiro` (admin/financeiro); RLS por `auth_papel() in ('admin','financeiro')`.
- Tokens SALDO na UI. Branch: `git checkout -b feat/orcamento develop`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `supabase/migrations/0047_orcamento.sql` — **novo**: tabela `orcamento` + RLS.
- `src/lib/financeiro/orcamento.ts` — **novo**: tipos + helpers puros.
- `src/tests/financeiro/orcamento.test.ts` — **novo**: testes dos helpers.
- `src/app/(app)/financeiro/orcamento/actions.ts` — **novo**: `listarOrcamento`, `salvarOrcamento`.
- `src/app/(app)/financeiro/orcamento/GradeOrcamento.tsx` — **novo**: grade cliente.
- `src/app/(app)/financeiro/orcamento/page.tsx` — **novo**: página (gate + carga).
- `src/tests/financeiro/grade-orcamento-render.test.tsx` — **novo**: smoke.
- `src/app/(app)/financeiro/cadastros/page.tsx` — **modificar**: link "Orçamento" no hub.

---

## Task 1: Migration — tabela `orcamento`

**Files:**
- Create: `supabase/migrations/0047_orcamento.sql`

- [ ] **Step 1: Criar a migration**

```sql
create table if not exists orcamento (
  id             uuid primary key default gen_random_uuid(),
  categoria_id   uuid not null references categoria(id) on delete cascade,
  ano            int not null,
  mes            smallint not null check (mes between 1 and 12),
  valor          numeric(14,2) not null default 0,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references usuarios(id),
  unique (categoria_id, ano, mes)
);
create index if not exists idx_orcamento_ano on orcamento(ano);
alter table orcamento enable row level security;
do $$ begin
  drop policy if exists orcamento_all on orcamento;
  create policy orcamento_all on orcamento for all to authenticated
    using (auth_papel() in ('admin','financeiro'))
    with check (auth_papel() in ('admin','financeiro'));
end $$;
```

- [ ] **Step 2: Aplicar + verificar**

Run: `npm run db:migrate`
Then:
```bash
node --env-file=.env.local -e "import('./scripts/_db.mjs').then(async({makeClient})=>{const c=makeClient();await c.connect();const t=await c.query(\"select 1 from information_schema.tables where table_name='orcamento'\");const p=await c.query(\"select policyname from pg_policies where tablename='orcamento'\");console.log('tabela:',t.rowCount,'| policy:',p.rows.map(r=>r.policyname));await c.end();});"
```
Expected: `tabela: 1 | policy: [ 'orcamento_all' ]`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0047_orcamento.sql
git commit -m "feat(financeiro): tabela orcamento (categoria x ano x mes) + RLS

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Helpers puros de agregação (TDD)

**Files:**
- Create: `src/lib/financeiro/orcamento.ts`
- Test: `src/tests/financeiro/orcamento.test.ts`

**Interfaces:**
- Produces:
  - `type CelulaOrcamento = { categoriaId: string; mes: number; valor: number }`.
  - `type MapaValores = Record<string, Record<number, number>>`.
  - `achatarValores(valores: MapaValores): CelulaOrcamento[]`.
  - `somaLinha(valores: MapaValores, categoriaId: string): number`.
  - `somaColuna(valores: MapaValores, categoriaIds: string[], mes: number): number`.

- [ ] **Step 1: Escrever os testes**

Criar `src/tests/financeiro/orcamento.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { achatarValores, somaLinha, somaColuna } from "@/lib/financeiro/orcamento";

describe("achatarValores", () => {
  it("emite uma célula por mês definido (1-12)", () => {
    expect(achatarValores({ a: { 1: 10, 3: 20.005 }, b: { 12: 5 } })).toEqual([
      { categoriaId: "a", mes: 1, valor: 10 },
      { categoriaId: "a", mes: 3, valor: 20.01 },
      { categoriaId: "b", mes: 12, valor: 5 },
    ]);
  });
  it("ignora meses fora de 1-12", () => {
    expect(achatarValores({ a: { 0: 9, 13: 9 } })).toEqual([]);
  });
});

describe("somaLinha", () => {
  it("soma os 12 meses (ausente = 0)", () => {
    expect(somaLinha({ a: { 1: 100, 2: 50 } }, "a")).toBe(150);
    expect(somaLinha({}, "x")).toBe(0);
  });
});

describe("somaColuna", () => {
  it("soma o mês sobre as categorias", () => {
    expect(somaColuna({ a: { 1: 10 }, b: { 1: 5 }, c: {} }, ["a", "b", "c"], 1)).toBe(15);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- orcamento`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/lib/financeiro/orcamento.ts`**

```ts
export type CelulaOrcamento = { categoriaId: string; mes: number; valor: number };
export type MapaValores = Record<string, Record<number, number>>;

const r2 = (n: number) => Math.round(n * 100) / 100;

// Achata o mapa da grade em células para upsert (só meses 1–12 com valor definido).
export function achatarValores(valores: MapaValores): CelulaOrcamento[] {
  const out: CelulaOrcamento[] = [];
  for (const [categoriaId, meses] of Object.entries(valores)) {
    for (let mes = 1; mes <= 12; mes++) {
      const v = meses?.[mes];
      if (v !== undefined && v !== null && !Number.isNaN(v)) out.push({ categoriaId, mes, valor: r2(v) });
    }
  }
  return out;
}

// Soma dos 12 meses de uma categoria (total da linha).
export function somaLinha(valores: MapaValores, categoriaId: string): number {
  let s = 0;
  const meses = valores[categoriaId] ?? {};
  for (let m = 1; m <= 12; m++) s += meses[m] ?? 0;
  return r2(s);
}

// Soma de uma coluna (mês) sobre um conjunto de categorias (total da coluna).
export function somaColuna(valores: MapaValores, categoriaIds: string[], mes: number): number {
  let s = 0;
  for (const id of categoriaIds) s += valores[id]?.[mes] ?? 0;
  return r2(s);
}
```

- [ ] **Step 4: Rodar e ver passar + lint/typecheck**

Run: `npm test -- orcamento && npm run lint && npm run typecheck`
Expected: PASS, sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/financeiro/orcamento.ts src/tests/financeiro/orcamento.test.ts
git commit -m "feat(financeiro): helpers de agregação do orçamento

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Actions `listarOrcamento` / `salvarOrcamento`

**Files:**
- Create: `src/app/(app)/financeiro/orcamento/actions.ts`

**Interfaces:**
- Consumes: `type CelulaOrcamento`, `type MapaValores` (Task 2).
- Produces:
  - `type CategoriaOrc = { id: string; nome: string; natureza: "RECEITA"|"DESPESA"; ordem_dre: number }`.
  - `listarOrcamento(ano: number): Promise<{ categorias: CategoriaOrc[]; valores: MapaValores }>`.
  - `salvarOrcamento(ano: number, celulas: CelulaOrcamento[]): Promise<{ ok?: boolean; erro?: string }>`.

- [ ] **Step 1: Criar `actions.ts`**

```ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import type { CelulaOrcamento, MapaValores } from "@/lib/financeiro/orcamento";

export type CategoriaOrc = { id: string; nome: string; natureza: "RECEITA" | "DESPESA"; ordem_dre: number };

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeGerenciarFinanceiro(p.papel) ? p : null;
}

export async function listarOrcamento(ano: number): Promise<{ categorias: CategoriaOrc[]; valores: MapaValores }> {
  if (!(await gate())) return { categorias: [], valores: {} };
  const supabase = await createServerSupabase();
  const { data: cats } = await supabase
    .from("categoria")
    .select("id, nome, natureza, ordem_dre")
    .eq("ativa", true)
    .order("natureza", { ascending: true }) // RECEITA antes de DESPESA (ordem do enum)
    .order("ordem_dre", { ascending: true });
  const { data: orc } = await supabase.from("orcamento").select("categoria_id, mes, valor").eq("ano", ano);
  const valores: MapaValores = {};
  for (const r of orc ?? []) {
    const cid = r.categoria_id as string;
    (valores[cid] ??= {})[r.mes as number] = Number(r.valor);
  }
  const categorias = (cats ?? []).map((c) => ({
    id: c.id as string,
    nome: c.nome as string,
    natureza: c.natureza as "RECEITA" | "DESPESA",
    ordem_dre: c.ordem_dre as number,
  }));
  return { categorias, valores };
}

export async function salvarOrcamento(ano: number, celulas: CelulaOrcamento[]): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  if (celulas.length === 0) return { ok: true };
  const supabase = await createServerSupabase();
  const linhas = celulas.map((c) => ({
    categoria_id: c.categoriaId,
    ano,
    mes: c.mes,
    valor: c.valor,
    atualizado_em: new Date().toISOString(),
  }));
  const { error } = await supabase.from("orcamento").upsert(linhas, { onConflict: "categoria_id,ano,mes" });
  return error ? { erro: "Falha ao salvar." } : { ok: true };
}
```

- [ ] **Step 2: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: sem erros.

```bash
git add "src/app/(app)/financeiro/orcamento/actions.ts"
git commit -m "feat(financeiro): actions listarOrcamento + salvarOrcamento

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: UI — grade + página + link no hub

**Files:**
- Create: `src/app/(app)/financeiro/orcamento/GradeOrcamento.tsx`
- Create: `src/app/(app)/financeiro/orcamento/page.tsx`
- Modify: `src/app/(app)/financeiro/cadastros/page.tsx`
- Test: `src/tests/financeiro/grade-orcamento-render.test.tsx`

**Interfaces:**
- Consumes: `listarOrcamento`, `salvarOrcamento`, `type CategoriaOrc` (Task 3); `achatarValores`, `somaLinha`, `somaColuna`, `type MapaValores` (Task 2).

- [ ] **Step 1: Smoke test (mockando as actions server-only)**

Criar `src/tests/financeiro/grade-orcamento-render.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/(app)/financeiro/orcamento/actions", () => ({
  listarOrcamento: vi.fn(),
  salvarOrcamento: vi.fn(),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { GradeOrcamento } from "@/app/(app)/financeiro/orcamento/GradeOrcamento";

const cats = [
  { id: "a", nome: "Honorários", natureza: "RECEITA" as const, ordem_dre: 1 },
  { id: "b", nome: "Folha", natureza: "DESPESA" as const, ordem_dre: 1 },
];

describe("GradeOrcamento", () => {
  it("renderiza os grupos e categorias sem lançar", () => {
    const html = renderToStaticMarkup(<GradeOrcamento ano={2026} categorias={cats} valores={{ a: { 1: 100 } }} />);
    expect(html).toContain("RECEITAS");
    expect(html).toContain("Honorários");
    expect(html).toContain("Folha");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- grade-orcamento-render`
Expected: FAIL (componente inexistente).

- [ ] **Step 3: Criar `GradeOrcamento.tsx`**

```tsx
"use client";
import { useState } from "react";
import { listarOrcamento, salvarOrcamento, type CategoriaOrc } from "./actions";
import { achatarValores, somaLinha, somaColuna, type MapaValores } from "@/lib/financeiro/orcamento";
import { formatarMoeda } from "@/lib/format";
import { Botao } from "@/components/ui/Botao";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const inputCls = "w-20 rounded border border-linha px-1.5 py-1 text-right text-xs tabular-nums focus:border-verde";

export function GradeOrcamento({
  ano: anoInicial,
  categorias,
  valores: valoresIniciais,
}: {
  ano: number;
  categorias: CategoriaOrc[];
  valores: MapaValores;
}) {
  const [ano, setAno] = useState(anoInicial);
  const [valores, setValores] = useState<MapaValores>(valoresIniciais);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(null);

  const receitas = categorias.filter((c) => c.natureza === "RECEITA");
  const despesas = categorias.filter((c) => c.natureza === "DESPESA");
  const anos = [anoInicial - 2, anoInicial - 1, anoInicial, anoInicial + 1];

  function setCel(cid: string, mes: number, raw: string) {
    setValores((v) => {
      const n: MapaValores = { ...v, [cid]: { ...(v[cid] ?? {}) } };
      if (raw === "") delete n[cid][mes];
      else n[cid][mes] = Number(raw);
      return n;
    });
  }
  function replicar(cid: string) {
    setValores((v) => {
      const base = v[cid]?.[1] ?? 0;
      const meses: Record<number, number> = {};
      for (let m = 1; m <= 12; m++) meses[m] = base;
      return { ...v, [cid]: meses };
    });
  }
  async function trocarAno(novo: number) {
    setOcupado(true);
    setMsg(null);
    const r = await listarOrcamento(novo);
    setAno(novo);
    setValores(r.valores);
    setOcupado(false);
  }
  async function copiarAnterior() {
    setOcupado(true);
    setMsg(null);
    const r = await listarOrcamento(ano - 1);
    setValores(r.valores);
    setOcupado(false);
    setMsg({ ok: true, txt: `Valores de ${ano - 1} carregados (não salvos).` });
  }
  async function salvar() {
    setOcupado(true);
    setMsg(null);
    const r = await salvarOrcamento(ano, achatarValores(valores));
    setOcupado(false);
    setMsg(r.erro ? { ok: false, txt: r.erro } : { ok: true, txt: "Salvo ✓" });
  }

  const grupo = (titulo: string, cats: CategoriaOrc[]) => (
    <>
      <tr>
        <td colSpan={14} className="bg-creme px-2 py-1 font-display text-xs font-semibold text-texto">
          {titulo}
        </td>
      </tr>
      {cats.map((cat) => (
        <tr key={cat.id} className="border-b border-linha/60">
          <td className="sticky left-0 z-10 bg-white px-2 py-1">
            <div className="flex items-center gap-1">
              <span className="truncate">{cat.nome}</span>
              <button type="button" onClick={() => replicar(cat.id)} title="Replicar Jan nos 12 meses" className="text-cinza-claro hover:text-verde">
                ⇉
              </button>
            </div>
          </td>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((mes) => (
            <td key={mes} className="px-0.5 py-0.5">
              <input
                type="number"
                step="0.01"
                min="0"
                value={valores[cat.id]?.[mes] ?? ""}
                onChange={(e) => setCel(cat.id, mes, e.target.value)}
                className={inputCls}
              />
            </td>
          ))}
          <td className="px-2 py-1 text-right font-mono text-xs tabular-nums text-texto">{formatarMoeda(somaLinha(valores, cat.id))}</td>
        </tr>
      ))}
      <tr className="border-b-2 border-linha bg-white font-medium">
        <td className="sticky left-0 bg-white px-2 py-1 text-xs">Total {titulo.toLowerCase()}</td>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((mes) => (
          <td key={mes} className="px-1 py-1 text-right font-mono text-[11px] tabular-nums">
            {formatarMoeda(somaColuna(valores, cats.map((c) => c.id), mes))}
          </td>
        ))}
        <td className="px-2 py-1 text-right font-mono text-xs">{formatarMoeda(cats.reduce((s, c) => s + somaLinha(valores, c.id), 0))}</td>
      </tr>
    </>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-cinza">
          Ano
          <select value={ano} onChange={(e) => trocarAno(Number(e.target.value))} disabled={ocupado} className="ml-2 rounded-lg border border-linha bg-white px-2 py-1 text-sm">
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <Botao variante="secundario" onClick={copiarAnterior} disabled={ocupado}>
          Copiar do ano anterior
        </Botao>
        <Botao variante="primario" onClick={salvar} disabled={ocupado}>
          Salvar
        </Botao>
        {msg && <span className={msg.ok ? "text-sm text-verde" : "text-sm text-negativo"}>{msg.txt}</span>}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-xs text-cinza">
              <th className="sticky left-0 z-10 bg-white px-2 py-2 text-left">Categoria</th>
              {MESES.map((m) => (
                <th key={m} className="px-1 py-2 text-right font-medium">
                  {m}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {grupo("RECEITAS", receitas)}
            {grupo("DESPESAS", despesas)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Criar `page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { GradeOrcamento } from "./GradeOrcamento";
import { listarOrcamento } from "./actions";

export default async function OrcamentoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const ano = new Date().getFullYear();
  const { categorias, valores } = await listarOrcamento(ano);
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4">
      <PageHeader titulo="Orçamento" subtitulo="Orçado por categoria em cada mês" />
      <GradeOrcamento ano={ano} categorias={categorias} valores={valores} />
    </main>
  );
}
```

- [ ] **Step 5: Link "Orçamento" no hub do financeiro**

Em `src/app/(app)/financeiro/cadastros/page.tsx`, adicionar ao array `ITENS` (após o Dashboard):
```ts
  { href: "/financeiro/orcamento", label: "Orçamento" },
```

- [ ] **Step 6: Suite completa**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tudo verde; smoke passa; rota `/financeiro/orcamento` compila.

- [ ] **Step 7: Verificação visual (opcional)**

`npm run dev` → `/financeiro/orcamento`: grade com RECEITAS/DESPESAS × 12 meses; editar células atualiza os totais; "replicar" copia Jan nos 12; "copiar do ano anterior" popula; "Salvar" persiste (recarregar mantém).

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/financeiro/orcamento" "src/app/(app)/financeiro/cadastros/page.tsx" src/tests/financeiro/grade-orcamento-render.test.tsx
git commit -m "feat(financeiro): tela de Orçamento (grade categoria x 12 meses) + link no hub

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: CHANGELOG + finalizar branch

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG**

Sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Financeiro — Orçamento:** tela para definir o orçado por categoria em cada mês do ano (grade
  editável Receitas/Despesas × 12 meses, com totais e atalhos "replicar nos 12 meses" e "copiar do ano
  anterior"). Base do dashboard Orçado × Realizado (próxima etapa).
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog do Orçamento (Ciclo A)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: Finalizar a branch**

Usar `superpowers:finishing-a-development-branch`.

---

## Self-Review

- **Cobertura do spec:** tabela `orcamento`+RLS (T1) ✓; helpers `achatarValores`/`somaLinha`/`somaColuna` (T2) ✓; actions `listarOrcamento`/`salvarOrcamento` (T3) ✓; grade editável + totais + atalhos + página + link no hub (T4) ✓; testes unit (T2) + smoke (T4) ✓; CHANGELOG (T5) ✓.
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Consistência de tipos:** `MapaValores`/`CelulaOrcamento` (T2) usados em T3/T4; `CategoriaOrc` (T3) consumido pela grade (T4); `achatarValores`/`somaLinha`/`somaColuna` idênticos entre T2/T4. `podeGerenciarFinanceiro`, `formatarMoeda`, `Botao`, `PageHeader` já existem.
- **Escopo:** só o Ciclo A (sem dashboard/realizado). Nota: `salvarOrcamento` grava só as células enviadas; apagar um valor no cliente remove a célula do mapa e ela não é enviada — o valor antigo permanece no banco. Para o Ciclo A isso é aceitável (zerar = digitar 0); um "limpar célula → 0" pode ser refinado depois se necessário.
```
