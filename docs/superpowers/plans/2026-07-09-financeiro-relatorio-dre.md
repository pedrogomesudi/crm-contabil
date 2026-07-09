# Financeiro — Relatório DRE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma DRE (Demonstração de Resultado) por período — receitas − despesas por categoria/grupo, regime competência/caixa, com resultado operacional e líquido.

**Architecture:** Helper puro `montarDRE`; action `relatorioDRE` (reaproveita a carga competência/caixa do orçado×realizado + `mesesDoPeriodo`); UI `/financeiro/relatorios/dre` + hub `/financeiro/relatorios`. Spec: `docs/superpowers/specs/2026-07-09-financeiro-relatorio-dre-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase, Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`.
- Sem migration. Gate `podeGerenciarFinanceiro`. Reusa `mesesDoPeriodo`/`TipoPeriodo` de `@/lib/financeiro/orcado-realizado` e `formatarMoeda` de `@/lib/format`. Sidebar já tem `print:hidden`.
- Branch: `git checkout -b feat/financeiro-dre develop`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `src/lib/financeiro/dre.ts` — **novo**: `montarDRE` + tipos.
- `src/tests/financeiro/dre.test.ts` — **novo**.
- `src/app/(app)/financeiro/relatorios/dre/dre-actions.ts` — **novo**: `relatorioDRE`.
- `src/app/(app)/financeiro/relatorios/dre/RelatorioDRE.tsx` + `page.tsx` — **novo**: UI.
- `src/app/(app)/financeiro/relatorios/page.tsx` — **novo**: hub.
- `src/app/(app)/financeiro/dashboard/page.tsx` — **modificar**: link "Relatórios".
- `src/tests/financeiro/relatorio-dre-render.test.tsx` — **novo**: smoke.

---

## Task 1: Helper puro montarDRE (TDD)

**Files:**
- Create: `src/lib/financeiro/dre.ts`
- Test: `src/tests/financeiro/dre.test.ts`

**Interfaces:**
- Produces: `type CategoriaDRE`, `type LinhaDRE`, `type GrupoDRE`, `type DRE`; `montarDRE(categorias, valorPorCategoria): DRE`.

- [ ] **Step 1: Testes**

```ts
import { describe, it, expect } from "vitest";
import { montarDRE, type CategoriaDRE } from "@/lib/financeiro/dre";

const cats: CategoriaDRE[] = [
  { id: "r1", nome: "Honorários", natureza: "RECEITA", grupo: "OPERACIONAL", ordem_dre: 1 },
  { id: "d2", nome: "Aluguel", natureza: "DESPESA", grupo: "OPERACIONAL", ordem_dre: 3 },
  { id: "d1", nome: "Salários", natureza: "DESPESA", grupo: "OPERACIONAL", ordem_dre: 2 },
  { id: "rn", nome: "Rendimentos", natureza: "RECEITA", grupo: "NAO_OPERACIONAL", ordem_dre: 4 },
  { id: "z", nome: "Zerada", natureza: "DESPESA", grupo: "OPERACIONAL", ordem_dre: 5 },
];

describe("montarDRE", () => {
  const dre = montarDRE(cats, { r1: 10000, d1: 4000, d2: 1000, rn: 200 });
  it("agrupa, ordena por ordem_dre e descarta zeradas", () => {
    expect(dre.receitaOperacional.linhas).toEqual([{ nome: "Honorários", valor: 10000 }]);
    expect(dre.despesaOperacional.linhas.map((l) => l.nome)).toEqual(["Salários", "Aluguel"]);
    expect(dre.despesaOperacional.total).toBe(5000);
  });
  it("resultados", () => {
    expect(dre.resultadoOperacional).toBe(5000);
    expect(dre.receitaNaoOperacional.total).toBe(200);
    expect(dre.despesaNaoOperacional.linhas).toEqual([]);
    expect(dre.resultadoLiquido).toBe(5200);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- financeiro/dre.test` → FAIL.

- [ ] **Step 3: Implementar `dre.ts`**

```ts
export type CategoriaDRE = { id: string; nome: string; natureza: "RECEITA" | "DESPESA"; grupo: "OPERACIONAL" | "NAO_OPERACIONAL"; ordem_dre: number };
export type LinhaDRE = { nome: string; valor: number };
export type GrupoDRE = { linhas: LinhaDRE[]; total: number };
export type DRE = {
  receitaOperacional: GrupoDRE;
  despesaOperacional: GrupoDRE;
  resultadoOperacional: number;
  receitaNaoOperacional: GrupoDRE;
  despesaNaoOperacional: GrupoDRE;
  resultadoLiquido: number;
};

function grupoDRE(categorias: CategoriaDRE[], valorPorCategoria: Record<string, number>, natureza: "RECEITA" | "DESPESA", grupo: "OPERACIONAL" | "NAO_OPERACIONAL"): GrupoDRE {
  const linhas = categorias
    .filter((c) => c.natureza === natureza && c.grupo === grupo)
    .map((c) => ({ nome: c.nome, valor: valorPorCategoria[c.id] ?? 0, ordem: c.ordem_dre }))
    .filter((l) => l.valor !== 0)
    .sort((a, b) => a.ordem - b.ordem)
    .map(({ nome, valor }) => ({ nome, valor }));
  return { linhas, total: linhas.reduce((s, l) => s + l.valor, 0) };
}

export function montarDRE(categorias: CategoriaDRE[], valorPorCategoria: Record<string, number>): DRE {
  const receitaOperacional = grupoDRE(categorias, valorPorCategoria, "RECEITA", "OPERACIONAL");
  const despesaOperacional = grupoDRE(categorias, valorPorCategoria, "DESPESA", "OPERACIONAL");
  const resultadoOperacional = receitaOperacional.total - despesaOperacional.total;
  const receitaNaoOperacional = grupoDRE(categorias, valorPorCategoria, "RECEITA", "NAO_OPERACIONAL");
  const despesaNaoOperacional = grupoDRE(categorias, valorPorCategoria, "DESPESA", "NAO_OPERACIONAL");
  const resultadoLiquido = resultadoOperacional + receitaNaoOperacional.total - despesaNaoOperacional.total;
  return { receitaOperacional, despesaOperacional, resultadoOperacional, receitaNaoOperacional, despesaNaoOperacional, resultadoLiquido };
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- financeiro/dre.test` (PASS), `npm run lint`, `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/financeiro/dre.ts src/tests/financeiro/dre.test.ts
git commit -m "feat(financeiro): helper montarDRE (TDD)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Action relatorioDRE

**Files:**
- Create: `src/app/(app)/financeiro/relatorios/dre/dre-actions.ts`

**Interfaces:**
- Consumes: `montarDRE`, `CategoriaDRE`, `DRE` (Task 1); `mesesDoPeriodo`, `TipoPeriodo` (`@/lib/financeiro/orcado-realizado`); `podeGerenciarFinanceiro`.
- Produces: `relatorioDRE(ano, tipo, indice, base): Promise<{ dre: DRE } | null>`.

- [ ] **Step 1: Criar `dre/dre-actions.ts`**

```ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { mesesDoPeriodo, type TipoPeriodo } from "@/lib/financeiro/orcado-realizado";
import { montarDRE, type CategoriaDRE, type DRE } from "@/lib/financeiro/dre";

const anoDe = (c: string) => Number(c.slice(0, 4));
const mesDe = (c: string) => Number(c.slice(5, 7));

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarFinanceiro(p.papel)) return null;
  return p;
}

export async function relatorioDRE(ano: number, tipo: TipoPeriodo, indice: number, base: "competencia" | "caixa"): Promise<{ dre: DRE } | null> {
  if (!(await gate())) return null;
  const supabase = await createServerSupabase();
  const { data: cats } = await supabase.from("categoria").select("id, nome, natureza, grupo, ordem_dre").eq("ativa", true);
  const categorias: CategoriaDRE[] = (cats ?? []).map((c) => ({
    id: c.id as string, nome: c.nome as string,
    natureza: c.natureza as "RECEITA" | "DESPESA", grupo: c.grupo as "OPERACIONAL" | "NAO_OPERACIONAL",
    ordem_dre: c.ordem_dre as number,
  }));

  const ini = `${ano}-01-01`;
  const fim = `${ano}-12-31`;
  const lanc: { categoriaId: string; ano: number; mes: number; valor: number }[] = [];
  if (base === "competencia") {
    const { data } = await supabase.from("titulo").select("categoria_id, competencia, valor").not("categoria_id", "is", null).gte("competencia", ini).lte("competencia", fim);
    for (const t of data ?? []) {
      const comp = t.competencia as string;
      lanc.push({ categoriaId: t.categoria_id as string, ano: anoDe(comp), mes: mesDe(comp), valor: Number(t.valor) });
    }
  } else {
    const { data } = await supabase.from("baixa").select("valor_recebido, data_recebimento, estornada, titulo:titulo_id(categoria_id)").eq("estornada", false).gte("data_recebimento", ini).lte("data_recebimento", fim);
    for (const b of data ?? []) {
      const tit = Array.isArray(b.titulo) ? b.titulo[0] : b.titulo;
      const cat = tit?.categoria_id as string | undefined;
      if (!cat) continue;
      const d = b.data_recebimento as string;
      lanc.push({ categoriaId: cat, ano: anoDe(d), mes: mesDe(d), valor: Number(b.valor_recebido) });
    }
  }

  const meses = mesesDoPeriodo(tipo, ano, indice);
  const chaves = new Set(meses.map((m) => `${m.ano}-${m.mes}`));
  const valorPorCategoria: Record<string, number> = {};
  for (const l of lanc) {
    if (!chaves.has(`${l.ano}-${l.mes}`)) continue;
    valorPorCategoria[l.categoriaId] = (valorPorCategoria[l.categoriaId] ?? 0) + l.valor;
  }

  return { dre: montarDRE(categorias, valorPorCategoria) };
}
```

- [ ] **Step 2: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build` (sem erros).
```bash
git add "src/app/(app)/financeiro/relatorios/dre/dre-actions.ts"
git commit -m "feat(financeiro): action relatorioDRE (competência/caixa por período)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: UI — tela da DRE + hub + link

**Files:**
- Create: `src/app/(app)/financeiro/relatorios/dre/RelatorioDRE.tsx`
- Create: `src/app/(app)/financeiro/relatorios/dre/page.tsx`
- Create: `src/app/(app)/financeiro/relatorios/page.tsx`
- Modify: `src/app/(app)/financeiro/dashboard/page.tsx`
- Test: `src/tests/financeiro/relatorio-dre-render.test.tsx`

**Interfaces:**
- Consumes: `relatorioDRE` (Task 2); `DRE`, `GrupoDRE` (Task 1); `formatarMoeda`; `TipoPeriodo`.

- [ ] **Step 1: Smoke test**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/financeiro/relatorios/dre/dre-actions", () => ({ relatorioDRE: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { RelatorioDRE } from "@/app/(app)/financeiro/relatorios/dre/RelatorioDRE";
import type { DRE } from "@/lib/financeiro/dre";

const dre: DRE = {
  receitaOperacional: { linhas: [{ nome: "Honorários", valor: 10000 }], total: 10000 },
  despesaOperacional: { linhas: [{ nome: "Salários", valor: 4000 }], total: 4000 },
  resultadoOperacional: 6000,
  receitaNaoOperacional: { linhas: [], total: 0 },
  despesaNaoOperacional: { linhas: [], total: 0 },
  resultadoLiquido: 6000,
};

describe("RelatorioDRE", () => {
  it("renderiza os resultados", () => {
    const html = renderToStaticMarkup(<RelatorioDRE ano={2026} tipo="mes" indice={7} base="competencia" dre={dre} />);
    expect(html).toContain("Resultado operacional");
    expect(html).toContain("Resultado líquido");
    expect(html).toContain("Honorários");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- relatorio-dre-render` → FAIL.

- [ ] **Step 3: `RelatorioDRE.tsx`**

```tsx
"use client";
import { useState } from "react";
import { formatarMoeda } from "@/lib/format";
import { relatorioDRE } from "./dre-actions";
import type { DRE, GrupoDRE } from "@/lib/financeiro/dre";
import type { TipoPeriodo } from "@/lib/financeiro/orcado-realizado";

const TIPOS: { id: TipoPeriodo; label: string }[] = [{ id: "mes", label: "Mês" }, { id: "trimestre", label: "Trimestre" }, { id: "semestre", label: "Semestre" }, { id: "ano", label: "Ano" }];
const MESES_NOME = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function opcoesIndice(tipo: TipoPeriodo): { valor: number; label: string }[] {
  if (tipo === "mes") return MESES_NOME.map((m, i) => ({ valor: i + 1, label: m }));
  if (tipo === "trimestre") return [1, 2, 3, 4].map((t) => ({ valor: t, label: `${t}º trimestre` }));
  if (tipo === "semestre") return [1, 2].map((s) => ({ valor: s, label: `${s}º semestre` }));
  return [{ valor: 1, label: "Ano inteiro" }];
}

function Grupo({ titulo, grupo, negativo }: { titulo: string; grupo: GrupoDRE; negativo?: boolean }) {
  const sinal = negativo ? "-" : "";
  const cls = negativo ? "text-negativo" : "";
  return (
    <>
      <tr><td colSpan={2} className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-wide text-cinza">{titulo}</td></tr>
      {grupo.linhas.length === 0 && (<tr><td colSpan={2} className="px-3 py-1 text-xs text-cinza-claro">—</td></tr>)}
      {grupo.linhas.map((l) => (
        <tr key={l.nome}><td className="px-3 py-1 text-texto">{l.nome}</td><td className={`px-3 py-1 text-right tabular-nums ${cls}`}>{sinal}{formatarMoeda(l.valor)}</td></tr>
      ))}
      <tr className="font-medium"><td className="px-3 py-1 text-texto">Total {titulo.toLowerCase()}</td><td className={`px-3 py-1 text-right tabular-nums ${cls}`}>{sinal}{formatarMoeda(grupo.total)}</td></tr>
    </>
  );
}

export function RelatorioDRE({ ano: anoIni, tipo: tipoIni, indice: indiceIni, base: baseIni, dre: dreIni }: { ano: number; tipo: TipoPeriodo; indice: number; base: "competencia" | "caixa"; dre: DRE | null }) {
  const [ano, setAno] = useState(anoIni);
  const [tipo, setTipo] = useState<TipoPeriodo>(tipoIni);
  const [indice, setIndice] = useState(indiceIni);
  const [base, setBase] = useState<"competencia" | "caixa">(baseIni);
  const [dre, setDre] = useState<DRE | null>(dreIni);
  const [carregando, setCarregando] = useState(false);

  async function recarregar(next: { ano?: number; tipo?: TipoPeriodo; indice?: number; base?: "competencia" | "caixa" }) {
    const a = next.ano ?? ano;
    const t = next.tipo ?? tipo;
    let i = next.indice ?? indice;
    if (next.tipo && next.tipo !== "mes" && i > (next.tipo === "trimestre" ? 4 : next.tipo === "semestre" ? 2 : 1)) i = 1;
    const b = next.base ?? base;
    setAno(a); setTipo(t); setIndice(i); setBase(b); setCarregando(true);
    const r = await relatorioDRE(a, t, i, b);
    setDre(r?.dre ?? null);
    setCarregando(false);
  }

  const sel = "rounded-lg border border-linha px-2 py-1 text-sm";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <select value={tipo} onChange={(e) => recarregar({ tipo: e.target.value as TipoPeriodo })} className={sel}>
          {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <select value={indice} onChange={(e) => recarregar({ indice: Number(e.target.value) })} className={sel} disabled={tipo === "ano"}>
          {opcoesIndice(tipo).map((o) => <option key={o.valor} value={o.valor}>{o.label}</option>)}
        </select>
        <input type="number" value={ano} onChange={(e) => recarregar({ ano: Number(e.target.value) })} className={`${sel} w-24`} />
        <select value={base} onChange={(e) => recarregar({ base: e.target.value as "competencia" | "caixa" })} className={sel}>
          <option value="competencia">Competência</option>
          <option value="caixa">Caixa</option>
        </select>
        <button type="button" onClick={() => window.print()} className="ml-auto rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white">Imprimir</button>
      </div>

      {!dre ? (
        <p className="text-sm text-cinza">{carregando ? "Carregando…" : "Sem dados."}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
          <table className="min-w-full text-sm">
            <tbody>
              <Grupo titulo="Receita operacional" grupo={dre.receitaOperacional} />
              <Grupo titulo="Despesa operacional" grupo={dre.despesaOperacional} negativo />
              <tr className="border-t-2 border-linha font-semibold">
                <td className="px-3 py-2 text-texto">Resultado operacional</td>
                <td className={`px-3 py-2 text-right tabular-nums ${dre.resultadoOperacional >= 0 ? "text-verde" : "text-negativo"}`}>{formatarMoeda(dre.resultadoOperacional)}</td>
              </tr>
              <Grupo titulo="Receita não operacional" grupo={dre.receitaNaoOperacional} />
              <Grupo titulo="Despesa não operacional" grupo={dre.despesaNaoOperacional} negativo />
              <tr className="border-t-2 border-tinta font-bold">
                <td className="px-3 py-2 text-texto">Resultado líquido</td>
                <td className={`px-3 py-2 text-right tabular-nums ${dre.resultadoLiquido >= 0 ? "text-verde" : "text-negativo"}`}>{formatarMoeda(dre.resultadoLiquido)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar** — `npm test -- relatorio-dre-render` → PASS.

- [ ] **Step 5: `dre/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { RelatorioDRE } from "./RelatorioDRE";
import { relatorioDRE } from "./dre-actions";

export default async function DREPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const inicial = await relatorioDRE(ano, "mes", mes, "competencia");
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <PageHeader titulo="DRE" subtitulo="Demonstração de Resultado" />
      <RelatorioDRE ano={ano} tipo="mes" indice={mes} base="competencia" dre={inicial?.dre ?? null} />
    </main>
  );
}
```

- [ ] **Step 6: `relatorios/page.tsx` (hub)**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";

const RELATORIOS = [{ href: "/financeiro/relatorios/dre", label: "DRE", desc: "Demonstração de Resultado por período." }];

export default async function RelatoriosPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <PageHeader titulo="Relatórios" subtitulo="Relatórios financeiros" />
      <ul className="grid gap-3 sm:grid-cols-2">
        {RELATORIOS.map((r) => (
          <li key={r.href}>
            <Link href={r.href} className="block rounded-2xl border border-linha bg-white p-4 transition hover:border-cinza-claro hover:shadow-sm">
              <span className="block font-medium text-texto">{r.label}</span>
              <span className="mt-0.5 block text-xs text-cinza">{r.desc}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 7: Link no dashboard financeiro**

Em `src/app/(app)/financeiro/dashboard/page.tsx`, adicionar `import Link from "next/link";` (se ainda não houver) e, logo após o `<h1 …>Dashboard financeiro</h1>`, inserir:
```tsx
      <Link href="/financeiro/relatorios" className="text-sm text-verde underline">Relatórios</Link>
```

- [ ] **Step 8: Suite completa** — `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde; rotas `/financeiro/relatorios` e `/financeiro/relatorios/dre` compilam).

- [ ] **Step 9: Commit**

```bash
git add "src/app/(app)/financeiro/relatorios" "src/app/(app)/financeiro/dashboard/page.tsx" src/tests/financeiro/relatorio-dre-render.test.tsx
git commit -m "feat(financeiro): tela da DRE + hub de relatórios + link no dashboard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Financeiro — DRE:** novo relatório de Demonstração de Resultado em `/financeiro/relatorios/dre`
  (também no hub `/financeiro/relatorios`, com link no dashboard). Receitas − despesas por categoria e
  grupo (operacional/não), com resultado operacional e líquido, por período (mês/trimestre/semestre/ano) e
  regime competência/caixa. Imprimível.
```

- [ ] **Step 2: Commit + finalizar**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog da DRE

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois usar `superpowers:finishing-a-development-branch`. (Sem migration/segredos.)

---

## Self-Review

- **Cobertura do spec:** `montarDRE` com grupos/subtotais/resultados (T1) ✓; `relatorioDRE` competência/caixa por período (T2) ✓; tela DRE (seletores + tabela + imprimir) + hub + link (T3) ✓; CHANGELOG (T4) ✓. Unit (T1) + smoke (T3).
- **Placeholders:** nenhum — todo passo tem código concreto.
- **Consistência de tipos:** `CategoriaDRE`/`DRE`/`GrupoDRE` (T1) usados por `relatorioDRE` (T2) e `RelatorioDRE` (T3); `mesesDoPeriodo`/`TipoPeriodo` reutilizados; `montarDRE` chamado na action. `dre-actions.ts` fica em `relatorios/dre/` — os imports `./dre-actions` (RelatorioDRE/page) e o mock do smoke (`.../dre/dre-actions`) batem.
- **Escopo:** só a DRE. Extrato/CSV e Fluxo detalhado ficam para as próximas fatias.
