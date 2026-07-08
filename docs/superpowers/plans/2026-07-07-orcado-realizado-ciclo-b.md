# Financeiro — Dashboard Orçado × Realizado (Ciclo B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard que compara orçado × realizado por categoria num período (mês/trimestre/semestre/ano), alternando base competência/caixa, com cartões, gráficos SVG e tabela DRE.

**Architecture:** Helpers puros (período/variação/agregação) → action que busca orçamento + realizado (títulos ou baixas) e delega → UI cliente com controles, cartões, barras, linha e tabela. Spec: `docs/superpowers/specs/2026-07-07-orcado-realizado-ciclo-b-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase (leitura), Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Todos passam.
- Sem migration (só leitura de `orcamento`, `titulo`, `baixa`, `categoria`).
- Gate: `podeGerenciarFinanceiro` (admin/financeiro).
- Datas puras (`YYYY-MM-DD`): mês/ano por fatia de string (`.slice(0,4)`/`.slice(5,7)`), nunca `new Date(iso)` (bug de fuso).
- Tokens SALDO na UI. Branch: `git checkout -b feat/orcado-realizado develop`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `src/lib/financeiro/orcado-realizado.ts` — **novo**: tipos + helpers puros.
- `src/tests/financeiro/orcado-realizado.test.ts` — **novo**: testes dos helpers.
- `src/app/(app)/financeiro/orcado-realizado/actions.ts` — **novo**: `dashboardOrcadoRealizado`.
- `src/app/(app)/financeiro/orcado-realizado/BarrasCategoria.tsx` — **novo**: barras por categoria.
- `src/app/(app)/financeiro/orcado-realizado/LinhaEvolucao.tsx` — **novo**: linha SVG do ano.
- `src/app/(app)/financeiro/orcado-realizado/DashboardComparativo.tsx` — **novo**: painel cliente.
- `src/app/(app)/financeiro/orcado-realizado/page.tsx` — **novo**: página (gate + carga inicial).
- `src/tests/financeiro/dashboard-comparativo-render.test.tsx` — **novo**: smoke.
- `src/app/(app)/financeiro/cadastros/page.tsx` — **modificar**: link no hub.

---

## Task 1: Helpers puros (TDD)

**Files:**
- Create: `src/lib/financeiro/orcado-realizado.ts`
- Test: `src/tests/financeiro/orcado-realizado.test.ts`

**Interfaces:**
- Consumes: `type MapaValores` de `@/lib/financeiro/orcamento` (= `Record<string, Record<number, number>>`).
- Produces: tipos `TipoPeriodo`, `MesRef`, `Natureza`, `CategoriaRef`, `LancRealizado`, `LinhaComparativo`, `GrupoComparativo`, `PontoSerie`, `Comparativo`; funções `mesesDoPeriodo`, `variacao`, `montarComparativo` (assinaturas na Interface abaixo).

- [ ] **Step 1: Escrever os testes**

Criar `src/tests/financeiro/orcado-realizado.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mesesDoPeriodo, variacao, montarComparativo } from "@/lib/financeiro/orcado-realizado";

describe("mesesDoPeriodo", () => {
  it("mês / trimestre / semestre / ano", () => {
    expect(mesesDoPeriodo("mes", 2026, 4)).toEqual([{ ano: 2026, mes: 4 }]);
    expect(mesesDoPeriodo("trimestre", 2026, 2).map((m) => m.mes)).toEqual([4, 5, 6]);
    expect(mesesDoPeriodo("semestre", 2026, 2).map((m) => m.mes)).toEqual([7, 8, 9, 10, 11, 12]);
    expect(mesesDoPeriodo("ano", 2026, 1).map((m) => m.mes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe("variacao", () => {
  it("normal", () => expect(variacao(100, 130)).toEqual({ abs: 30, pct: 30 }));
  it("orçado zero → pct null", () => expect(variacao(0, 50)).toEqual({ abs: 50, pct: null }));
  it("abaixo → negativo", () => expect(variacao(100, 80)).toEqual({ abs: -20, pct: -20 }));
});

describe("montarComparativo", () => {
  const categorias = [
    { id: "hon", nome: "Honorários", natureza: "RECEITA" as const, ordem_dre: 1 },
    { id: "folha", nome: "Folha", natureza: "DESPESA" as const, ordem_dre: 1 },
  ];
  const orcamento = { hon: { 4: 100, 5: 100, 6: 100 }, folha: { 4: 50, 5: 50, 6: 50 } };
  const realizado = [
    { categoriaId: "hon", ano: 2026, mes: 4, valor: 120 },
    { categoriaId: "folha", ano: 2026, mes: 4, valor: 60 },
    { categoriaId: "hon", ano: 2026, mes: 7, valor: 999 }, // fora do período (T2), entra só na série
  ];
  const meses = mesesDoPeriodo("trimestre", 2026, 2);
  const comp = montarComparativo(categorias, orcamento, realizado, meses, 2026);

  it("agrega o período por categoria", () => {
    const rec = comp.grupos.find((g) => g.natureza === "RECEITA")!;
    expect(rec.linhas[0]).toMatchObject({ categoriaId: "hon", orcado: 300, realizado: 120, varAbs: -180 });
    expect(rec.totalOrcado).toBe(300);
    expect(rec.totalRealizado).toBe(120);
  });
  it("resultado = receita - despesa", () => {
    expect(comp.resultado.orcado).toBe(150); // 300 - 150
    expect(comp.resultado.realizado).toBe(60); // 120 - 60
  });
  it("série de 12 meses só de receita (inclui mês fora do período)", () => {
    expect(comp.serieReceita).toHaveLength(12);
    expect(comp.serieReceita[3]).toEqual({ mes: 4, orcado: 100, realizado: 120 });
    expect(comp.serieReceita[6]).toEqual({ mes: 7, orcado: 0, realizado: 999 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- financeiro/orcado-realizado`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/lib/financeiro/orcado-realizado.ts`**

```ts
import type { MapaValores } from "@/lib/financeiro/orcamento";

export type TipoPeriodo = "mes" | "trimestre" | "semestre" | "ano";
export type MesRef = { ano: number; mes: number };
export type Natureza = "RECEITA" | "DESPESA";
export type CategoriaRef = { id: string; nome: string; natureza: Natureza; ordem_dre: number };
export type LancRealizado = { categoriaId: string; ano: number; mes: number; valor: number };

export type LinhaComparativo = { categoriaId: string; nome: string; natureza: Natureza; orcado: number; realizado: number; varAbs: number; varPct: number | null };
export type GrupoComparativo = { natureza: Natureza; linhas: LinhaComparativo[]; totalOrcado: number; totalRealizado: number; varAbs: number; varPct: number | null };
export type PontoSerie = { mes: number; orcado: number; realizado: number };
export type Comparativo = {
  grupos: GrupoComparativo[];
  resultado: { orcado: number; realizado: number; varAbs: number; varPct: number | null };
  serieReceita: PontoSerie[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function mesesDoPeriodo(tipo: TipoPeriodo, ano: number, indice: number): MesRef[] {
  let meses: number[];
  if (tipo === "mes") meses = [indice];
  else if (tipo === "trimestre") {
    const s = (indice - 1) * 3 + 1;
    meses = [s, s + 1, s + 2];
  } else if (tipo === "semestre") {
    const s = (indice - 1) * 6 + 1;
    meses = Array.from({ length: 6 }, (_, i) => s + i);
  } else {
    meses = Array.from({ length: 12 }, (_, i) => i + 1);
  }
  return meses.map((mes) => ({ ano, mes }));
}

export function variacao(orcado: number, realizado: number): { abs: number; pct: number | null } {
  const abs = r2(realizado - orcado);
  const pct = orcado === 0 ? null : r2(((realizado - orcado) / orcado) * 100);
  return { abs, pct };
}

export function montarComparativo(
  categorias: CategoriaRef[],
  orcamento: MapaValores,
  realizado: LancRealizado[],
  meses: MesRef[],
  ano: number,
): Comparativo {
  const mesesSet = new Set(meses.filter((m) => m.ano === ano).map((m) => m.mes));
  const realPorCatMes: Record<string, Record<number, number>> = {};
  for (const l of realizado) {
    if (l.ano !== ano) continue;
    const cat = (realPorCatMes[l.categoriaId] ??= {});
    cat[l.mes] = (cat[l.mes] ?? 0) + l.valor;
  }

  const linhaPara = (cat: CategoriaRef): LinhaComparativo => {
    let orcado = 0;
    let real = 0;
    for (const mes of mesesSet) {
      orcado += orcamento[cat.id]?.[mes] ?? 0;
      real += realPorCatMes[cat.id]?.[mes] ?? 0;
    }
    orcado = r2(orcado);
    real = r2(real);
    const v = variacao(orcado, real);
    return { categoriaId: cat.id, nome: cat.nome, natureza: cat.natureza, orcado, realizado: real, varAbs: v.abs, varPct: v.pct };
  };

  const grupoPara = (natureza: Natureza): GrupoComparativo => {
    const linhas = categorias
      .filter((c) => c.natureza === natureza)
      .sort((a, b) => a.ordem_dre - b.ordem_dre)
      .map(linhaPara);
    const totalOrcado = r2(linhas.reduce((s, l) => s + l.orcado, 0));
    const totalRealizado = r2(linhas.reduce((s, l) => s + l.realizado, 0));
    const v = variacao(totalOrcado, totalRealizado);
    return { natureza, linhas, totalOrcado, totalRealizado, varAbs: v.abs, varPct: v.pct };
  };

  const gRec = grupoPara("RECEITA");
  const gDes = grupoPara("DESPESA");
  const resOrc = r2(gRec.totalOrcado - gDes.totalOrcado);
  const resReal = r2(gRec.totalRealizado - gDes.totalRealizado);
  const vRes = variacao(resOrc, resReal);

  const receitaCats = categorias.filter((c) => c.natureza === "RECEITA").map((c) => c.id);
  const serieReceita: PontoSerie[] = Array.from({ length: 12 }, (_, i) => i + 1).map((mes) => {
    let orc = 0;
    let rl = 0;
    for (const id of receitaCats) {
      orc += orcamento[id]?.[mes] ?? 0;
      rl += realPorCatMes[id]?.[mes] ?? 0;
    }
    return { mes, orcado: r2(orc), realizado: r2(rl) };
  });

  return { grupos: [gRec, gDes], resultado: { orcado: resOrc, realizado: resReal, varAbs: vRes.abs, varPct: vRes.pct }, serieReceita };
}
```

- [ ] **Step 4: Rodar e ver passar + lint/typecheck**

Run: `npm test -- financeiro/orcado-realizado && npm run lint && npm run typecheck`
Expected: PASS, sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/financeiro/orcado-realizado.ts src/tests/financeiro/orcado-realizado.test.ts
git commit -m "feat(financeiro): helpers de período/variação/comparativo (orçado x realizado)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Action `dashboardOrcadoRealizado`

**Files:**
- Create: `src/app/(app)/financeiro/orcado-realizado/actions.ts`

**Interfaces:**
- Consumes: `mesesDoPeriodo`, `montarComparativo`, tipos `TipoPeriodo`, `CategoriaRef`, `LancRealizado`, `Comparativo` (Task 1); `type MapaValores` (orçamento).
- Produces:
  - `type BaseRegime = "competencia" | "caixa"`.
  - `dashboardOrcadoRealizado(ano: number, tipo: TipoPeriodo, indice: number, base: BaseRegime): Promise<{ categorias: CategoriaRef[]; comparativo: Comparativo } | null>`.

- [ ] **Step 1: Criar `actions.ts`**

```ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { mesesDoPeriodo, montarComparativo, type TipoPeriodo, type CategoriaRef, type LancRealizado, type Comparativo } from "@/lib/financeiro/orcado-realizado";
import type { MapaValores } from "@/lib/financeiro/orcamento";

export type BaseRegime = "competencia" | "caixa";

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeGerenciarFinanceiro(p.papel) ? p : null;
}

const anoDe = (iso: string) => Number(iso.slice(0, 4));
const mesDe = (iso: string) => Number(iso.slice(5, 7));

export async function dashboardOrcadoRealizado(
  ano: number,
  tipo: TipoPeriodo,
  indice: number,
  base: BaseRegime,
): Promise<{ categorias: CategoriaRef[]; comparativo: Comparativo } | null> {
  if (!(await gate())) return null;
  const supabase = await createServerSupabase();

  const { data: cats } = await supabase.from("categoria").select("id, nome, natureza, ordem_dre").eq("ativa", true);
  const categorias: CategoriaRef[] = (cats ?? []).map((c) => ({
    id: c.id as string,
    nome: c.nome as string,
    natureza: c.natureza as "RECEITA" | "DESPESA",
    ordem_dre: c.ordem_dre as number,
  }));

  const { data: orc } = await supabase.from("orcamento").select("categoria_id, mes, valor").eq("ano", ano);
  const orcamento: MapaValores = {};
  for (const r of orc ?? []) (orcamento[r.categoria_id as string] ??= {})[r.mes as number] = Number(r.valor);

  const ini = `${ano}-01-01`;
  const fim = `${ano}-12-31`;
  const realizado: LancRealizado[] = [];
  if (base === "competencia") {
    const { data } = await supabase
      .from("titulo")
      .select("categoria_id, competencia, valor")
      .not("categoria_id", "is", null)
      .gte("competencia", ini)
      .lte("competencia", fim);
    for (const t of data ?? []) {
      const comp = t.competencia as string;
      realizado.push({ categoriaId: t.categoria_id as string, ano: anoDe(comp), mes: mesDe(comp), valor: Number(t.valor) });
    }
  } else {
    const { data } = await supabase
      .from("baixa")
      .select("valor_recebido, data_recebimento, estornada, titulo:titulo_id(categoria_id)")
      .eq("estornada", false)
      .gte("data_recebimento", ini)
      .lte("data_recebimento", fim);
    for (const b of data ?? []) {
      const tit = Array.isArray(b.titulo) ? b.titulo[0] : b.titulo;
      const cat = tit?.categoria_id as string | undefined;
      if (!cat) continue;
      const d = b.data_recebimento as string;
      realizado.push({ categoriaId: cat, ano: anoDe(d), mes: mesDe(d), valor: Number(b.valor_recebido) });
    }
  }

  const meses = mesesDoPeriodo(tipo, ano, indice);
  return { categorias, comparativo: montarComparativo(categorias, orcamento, realizado, meses, ano) };
}
```

- [ ] **Step 2: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: sem erros.

```bash
git add "src/app/(app)/financeiro/orcado-realizado/actions.ts"
git commit -m "feat(financeiro): action dashboardOrcadoRealizado (orçado + realizado por base)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: UI — gráficos + dashboard + página + hub

**Files:**
- Create: `src/app/(app)/financeiro/orcado-realizado/BarrasCategoria.tsx`
- Create: `src/app/(app)/financeiro/orcado-realizado/LinhaEvolucao.tsx`
- Create: `src/app/(app)/financeiro/orcado-realizado/DashboardComparativo.tsx`
- Create: `src/app/(app)/financeiro/orcado-realizado/page.tsx`
- Modify: `src/app/(app)/financeiro/cadastros/page.tsx`
- Test: `src/tests/financeiro/dashboard-comparativo-render.test.tsx`

**Interfaces:**
- Consumes: `dashboardOrcadoRealizado`, `type BaseRegime` (Task 2); tipos `Comparativo`, `LinhaComparativo`, `PontoSerie`, `CategoriaRef`, `TipoPeriodo` (Task 1); `formatarMoeda`, `Botao`, `PageHeader`, `podeGerenciarFinanceiro`, `getPerfilAtual`.

- [ ] **Step 1: `BarrasCategoria.tsx`**

```tsx
import type { LinhaComparativo } from "@/lib/financeiro/orcado-realizado";

export function BarrasCategoria({ linhas }: { linhas: LinhaComparativo[] }) {
  const max = Math.max(1, ...linhas.flatMap((l) => [l.orcado, l.realizado]));
  if (linhas.length === 0) return <p className="text-xs text-cinza-claro">Sem categorias.</p>;
  return (
    <div className="space-y-2.5">
      {linhas.map((l) => {
        const ruim = l.natureza === "DESPESA" ? l.realizado > l.orcado : l.realizado < l.orcado;
        return (
          <div key={l.categoriaId} className="grid grid-cols-[110px_1fr] items-center gap-2">
            <span className="truncate text-xs text-texto">{l.nome}</span>
            <div className="relative h-5">
              <div className="absolute left-0 top-0 h-2 rounded bg-[#d8d4ca]" style={{ width: `${(l.orcado / max) * 100}%` }} />
              <div className={`absolute left-0 top-2.5 h-2 rounded ${ruim ? "bg-negativo" : "bg-verde"}`} style={{ width: `${(l.realizado / max) * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: `LinhaEvolucao.tsx`**

```tsx
import type { PontoSerie } from "@/lib/financeiro/orcado-realizado";

const MESES = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export function LinhaEvolucao({ serie }: { serie: PontoSerie[] }) {
  const W = 320;
  const H = 170;
  const pad = 28;
  const max = Math.max(1, ...serie.flatMap((p) => [p.orcado, p.realizado]));
  const x = (i: number) => pad + (i * (W - pad - 10)) / 11;
  const y = (v: number) => H - 30 - (v / max) * (H - 60);
  const pts = (key: "orcado" | "realizado") => serie.map((p, i) => `${x(i)},${y(p[key])}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="180" role="img" aria-label="Evolução orçado x realizado">
      <line x1={pad} y1={H - 30} x2={W - 10} y2={H - 30} stroke="#e7e5df" />
      <polyline fill="none" stroke="#d8d4ca" strokeWidth="2.5" points={pts("orcado")} />
      <polyline fill="none" stroke="#0FA968" strokeWidth="2.5" points={pts("realizado")} />
      {serie.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.realizado)} r="2.5" fill="#0FA968" />
      ))}
      {MESES.map((m, i) => (
        <text key={i} x={x(i)} y={H - 12} fontSize="9" fill="#6b7280" textAnchor="middle">
          {m}
        </text>
      ))}
    </svg>
  );
}
```

- [ ] **Step 3: Smoke test (mock da action)**

Criar `src/tests/financeiro/dashboard-comparativo-render.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/(app)/financeiro/orcado-realizado/actions", () => ({
  dashboardOrcadoRealizado: vi.fn(),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { DashboardComparativo } from "@/app/(app)/financeiro/orcado-realizado/DashboardComparativo";
import type { Comparativo } from "@/lib/financeiro/orcado-realizado";

const comparativo: Comparativo = {
  grupos: [
    { natureza: "RECEITA", linhas: [{ categoriaId: "h", nome: "Honorários", natureza: "RECEITA", orcado: 100, realizado: 120, varAbs: 20, varPct: 20 }], totalOrcado: 100, totalRealizado: 120, varAbs: 20, varPct: 20 },
    { natureza: "DESPESA", linhas: [{ categoriaId: "f", nome: "Folha", natureza: "DESPESA", orcado: 50, realizado: 60, varAbs: 10, varPct: 20 }], totalOrcado: 50, totalRealizado: 60, varAbs: 10, varPct: 20 },
  ],
  resultado: { orcado: 50, realizado: 60, varAbs: 10, varPct: 20 },
  serieReceita: Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, orcado: 100, realizado: 120 })),
};

describe("DashboardComparativo", () => {
  it("renderiza cartões, categorias e resultado sem lançar", () => {
    const html = renderToStaticMarkup(
      <DashboardComparativo ano={2026} tipo="mes" indice={7} base="competencia" categorias={[]} comparativo={comparativo} />,
    );
    expect(html).toContain("Receitas");
    expect(html).toContain("Honorários");
    expect(html).toContain("Resultado");
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npm test -- dashboard-comparativo-render`
Expected: FAIL (componente inexistente).

- [ ] **Step 5: `DashboardComparativo.tsx`**

```tsx
"use client";
import { useState } from "react";
import { dashboardOrcadoRealizado, type BaseRegime } from "./actions";
import type { Comparativo, CategoriaRef, TipoPeriodo, LinhaComparativo } from "@/lib/financeiro/orcado-realizado";
import { BarrasCategoria } from "./BarrasCategoria";
import { LinhaEvolucao } from "./LinhaEvolucao";
import { formatarMoeda } from "@/lib/format";

const MESES_NOME = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const TIPOS: { id: TipoPeriodo; label: string }[] = [
  { id: "mes", label: "Mês" },
  { id: "trimestre", label: "Trimestre" },
  { id: "semestre", label: "Semestre" },
  { id: "ano", label: "Ano" },
];

function favoravel(natureza: "RECEITA" | "DESPESA", varAbs: number) {
  return natureza === "DESPESA" ? varAbs <= 0 : varAbs >= 0;
}
function pctTxt(pct: number | null) {
  return pct === null ? "—" : `${pct > 0 ? "+" : ""}${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function opcoesIndice(tipo: TipoPeriodo): { valor: number; label: string }[] {
  if (tipo === "mes") return MESES_NOME.map((m, i) => ({ valor: i + 1, label: m }));
  if (tipo === "trimestre") return [1, 2, 3, 4].map((t) => ({ valor: t, label: `${t}º trimestre` }));
  if (tipo === "semestre") return [1, 2].map((s) => ({ valor: s, label: `${s}º semestre` }));
  return [];
}

export function DashboardComparativo({
  ano: anoIni,
  tipo: tipoIni,
  indice: indiceIni,
  base: baseIni,
  categorias,
  comparativo: compIni,
}: {
  ano: number;
  tipo: TipoPeriodo;
  indice: number;
  base: BaseRegime;
  categorias: CategoriaRef[];
  comparativo: Comparativo;
}) {
  const [ano, setAno] = useState(anoIni);
  const [tipo, setTipo] = useState<TipoPeriodo>(tipoIni);
  const [indice, setIndice] = useState(indiceIni);
  const [base, setBase] = useState<BaseRegime>(baseIni);
  const [comp, setComp] = useState<Comparativo>(compIni);
  const [carregando, setCarregando] = useState(false);

  async function recarregar(next: { ano?: number; tipo?: TipoPeriodo; indice?: number; base?: BaseRegime }) {
    const a = next.ano ?? ano;
    const t = next.tipo ?? tipo;
    let i = next.indice ?? indice;
    if (next.tipo && next.tipo !== "mes" && i > (next.tipo === "trimestre" ? 4 : next.tipo === "semestre" ? 2 : 1)) i = 1;
    const b = next.base ?? base;
    setAno(a);
    setTipo(t);
    setIndice(i);
    setBase(b);
    setCarregando(true);
    const r = await dashboardOrcadoRealizado(a, t, i, b);
    if (r) setComp(r.comparativo);
    setCarregando(false);
  }

  const rec = comp.grupos.find((g) => g.natureza === "RECEITA");
  const des = comp.grupos.find((g) => g.natureza === "DESPESA");
  const todasLinhas: LinhaComparativo[] = comp.grupos.flatMap((g) => g.linhas);
  const anos = [anoIni - 2, anoIni - 1, anoIni, anoIni + 1];
  const idxOpts = opcoesIndice(tipo);

  const Cartao = ({ titulo, natureza, orcado, realizado, varAbs, varPct }: { titulo: string; natureza: "RECEITA" | "DESPESA"; orcado: number; realizado: number; varAbs: number; varPct: number | null }) => {
    const bom = favoravel(natureza, varAbs);
    return (
      <div className="rounded-2xl border border-linha bg-white p-4">
        <div className="text-[11px] uppercase tracking-wide text-cinza">{titulo}</div>
        <div className="my-1 text-2xl font-bold tabular-nums text-texto">{formatarMoeda(realizado)}</div>
        <div className="text-xs text-cinza">orçado {formatarMoeda(orcado)}</div>
        <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${bom ? "bg-verde/10 text-verde" : "bg-negativo/10 text-negativo"}`}>
          {varAbs >= 0 ? "▲" : "▼"} {pctTxt(varPct)} vs orçado
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={ano} onChange={(e) => recarregar({ ano: Number(e.target.value) })} disabled={carregando} className="rounded-lg border border-linha bg-white px-2 py-1.5 text-sm">
          {anos.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <div className="inline-flex overflow-hidden rounded-lg border border-linha">
          {TIPOS.map((t) => (
            <button key={t.id} type="button" onClick={() => recarregar({ tipo: t.id })} disabled={carregando} className={`px-3 py-1.5 text-sm ${tipo === t.id ? "bg-verde font-semibold text-white" : "bg-white text-cinza"}`}>
              {t.label}
            </button>
          ))}
        </div>
        {idxOpts.length > 0 && (
          <select value={indice} onChange={(e) => recarregar({ indice: Number(e.target.value) })} disabled={carregando} className="rounded-lg border border-linha bg-white px-2 py-1.5 text-sm">
            {idxOpts.map((o) => (
              <option key={o.valor} value={o.valor}>{o.label}</option>
            ))}
          </select>
        )}
        <div className="ml-auto inline-flex overflow-hidden rounded-full border border-linha">
          {(["competencia", "caixa"] as BaseRegime[]).map((b) => (
            <button key={b} type="button" onClick={() => recarregar({ base: b })} disabled={carregando} className={`px-3 py-1.5 text-xs ${base === b ? "bg-texto text-white" : "bg-white text-cinza"}`}>
              {b === "competencia" ? "Competência" : "Caixa"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {rec && <Cartao titulo="Receitas" natureza="RECEITA" orcado={rec.totalOrcado} realizado={rec.totalRealizado} varAbs={rec.varAbs} varPct={rec.varPct} />}
        {des && <Cartao titulo="Despesas" natureza="DESPESA" orcado={des.totalOrcado} realizado={des.totalRealizado} varAbs={des.varAbs} varPct={des.varPct} />}
        <Cartao titulo="Resultado" natureza="RECEITA" orcado={comp.resultado.orcado} realizado={comp.resultado.realizado} varAbs={comp.resultado.varAbs} varPct={comp.resultado.varPct} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-linha bg-white p-4">
          <h3 className="mb-3 font-display text-sm font-semibold text-texto">Orçado × Realizado por categoria</h3>
          <BarrasCategoria linhas={todasLinhas} />
        </div>
        <div className="rounded-2xl border border-linha bg-white p-4">
          <h3 className="mb-1 font-display text-sm font-semibold text-texto">Evolução da receita (ano)</h3>
          <p className="mb-1 text-xs text-cinza">Orçado (cinza) × realizado (verde)</p>
          <LinhaEvolucao serie={comp.serieReceita} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-xs text-cinza">
              <th className="px-3 py-2 text-left font-medium">Categoria</th>
              <th className="px-3 py-2 text-right font-medium">Orçado</th>
              <th className="px-3 py-2 text-right font-medium">Realizado</th>
              <th className="px-3 py-2 text-right font-medium">Variação R$</th>
              <th className="px-3 py-2 text-right font-medium">Variação %</th>
            </tr>
          </thead>
          <tbody>
            {comp.grupos.map((g) => (
              <FragmentoGrupo key={g.natureza} grupo={g} />
            ))}
            <tr className="border-t-2 border-linha font-bold">
              <td className="px-3 py-2">Resultado</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(comp.resultado.orcado)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(comp.resultado.realizado)}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${favoravel("RECEITA", comp.resultado.varAbs) ? "text-verde" : "text-negativo"}`}>{formatarMoeda(comp.resultado.varAbs)}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${favoravel("RECEITA", comp.resultado.varAbs) ? "text-verde" : "text-negativo"}`}>{pctTxt(comp.resultado.varPct)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentoGrupo({ grupo }: { grupo: Comparativo["grupos"][number] }) {
  return (
    <>
      <tr className="bg-creme">
        <td colSpan={5} className="px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-wide text-texto">
          {grupo.natureza === "RECEITA" ? "Receitas" : "Despesas"}
        </td>
      </tr>
      {grupo.linhas.map((l) => {
        const bom = favoravel(l.natureza, l.varAbs);
        return (
          <tr key={l.categoriaId} className="border-b border-linha/60">
            <td className="px-3 py-2 text-texto">{l.nome}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(l.orcado)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(l.realizado)}</td>
            <td className={`px-3 py-2 text-right tabular-nums ${bom ? "text-verde" : "text-negativo"}`}>{formatarMoeda(l.varAbs)}</td>
            <td className={`px-3 py-2 text-right tabular-nums ${bom ? "text-verde" : "text-negativo"}`}>{l.varPct === null ? "—" : `${l.varPct > 0 ? "+" : ""}${l.varPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}</td>
          </tr>
        );
      })}
      <tr className="border-b border-linha font-semibold">
        <td className="px-3 py-2">Total {grupo.natureza === "RECEITA" ? "receitas" : "despesas"}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(grupo.totalOrcado)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(grupo.totalRealizado)}</td>
        <td className={`px-3 py-2 text-right tabular-nums ${favoravel(grupo.natureza, grupo.varAbs) ? "text-verde" : "text-negativo"}`}>{formatarMoeda(grupo.varAbs)}</td>
        <td className={`px-3 py-2 text-right tabular-nums ${favoravel(grupo.natureza, grupo.varAbs) ? "text-verde" : "text-negativo"}`}>{grupo.varPct === null ? "—" : `${grupo.varPct > 0 ? "+" : ""}${grupo.varPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}</td>
      </tr>
    </>
  );
}
```

- [ ] **Step 6: `page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { DashboardComparativo } from "./DashboardComparativo";
import { dashboardOrcadoRealizado } from "./actions";

export default async function OrcadoRealizadoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const agora = new Date();
  const ano = agora.getFullYear();
  const indice = agora.getMonth() + 1;
  const dados = await dashboardOrcadoRealizado(ano, "mes", indice, "competencia");
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4">
      <PageHeader titulo="Orçado × Realizado" subtitulo="Comparativo do orçamento com o realizado" />
      {dados ? (
        <DashboardComparativo ano={ano} tipo="mes" indice={indice} base="competencia" categorias={dados.categorias} comparativo={dados.comparativo} />
      ) : (
        <p className="text-sm text-cinza">Sem acesso ao financeiro.</p>
      )}
    </main>
  );
}
```

- [ ] **Step 7: Link no hub**

Em `src/app/(app)/financeiro/cadastros/page.tsx`, no array `ITENS`, após a linha do Orçamento:
```ts
  { href: "/financeiro/orcado-realizado", label: "Orçado × Realizado" },
```

- [ ] **Step 8: Suite completa**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tudo verde; smoke passa; rota `/financeiro/orcado-realizado` compila.

- [ ] **Step 9: Verificação visual (opcional)**

`npm run dev` → `/financeiro/orcado-realizado`: trocar ano/período/base recarrega; cartões, barras, linha e tabela batem com os dados; variação colorida (verde favorável / vermelho desfavorável).

- [ ] **Step 10: Commit**

```bash
git add "src/app/(app)/financeiro/orcado-realizado" "src/app/(app)/financeiro/cadastros/page.tsx" src/tests/financeiro/dashboard-comparativo-render.test.tsx
git commit -m "feat(financeiro): dashboard Orçado x Realizado (cartões, gráficos, tabela DRE) + link no hub

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: CHANGELOG + finalizar branch

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG**

Sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Financeiro — Orçado × Realizado:** dashboard comparativo por categoria, com período ajustável
  (mês/trimestre/semestre/ano) e base competência ou caixa; cartões de resumo (Receitas/Despesas/
  Resultado com variação), gráfico de barras por categoria, linha de evolução da receita no ano e tabela
  estilo DRE com variação colorida.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog do Orçado x Realizado (Ciclo B)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: Finalizar a branch**

Usar `superpowers:finishing-a-development-branch`.

---

## Self-Review

- **Cobertura do spec:** helpers `mesesDoPeriodo`/`variacao`/`montarComparativo` (T1) ✓; action com base competência/caixa (T2) ✓; UI controles + 3 cartões + barras + linha + tabela DRE + hub (T3) ✓; testes unit (T1) + smoke (T3) ✓; CHANGELOG (T4) ✓. Sem migration (correto).
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Consistência de tipos:** `Comparativo`/`LinhaComparativo`/`PontoSerie`/`CategoriaRef`/`TipoPeriodo` (T1) usados em T2/T3; `BaseRegime` (T2) consumido pela UI (T3); `dashboardOrcadoRealizado` assinatura idêntica entre T2 e o uso em T3; `MapaValores` reutilizado do Ciclo A. `favoravel`/`pctTxt` locais da UI. `formatarMoeda`, `Botao`, `PageHeader`, `podeGerenciarFinanceiro`, `getPerfilAtual` já existem.
- **Escopo:** só o Ciclo B (dashboard). Nota: caixa vem zerado até haver baixas (documentado no spec); a série de linha é sempre os 12 meses do ano (evita ponto único no período "mês").
