# Financeiro — Fluxo de caixa detalhado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relatório de fluxo de caixa: matriz categoria × 12 meses combinando realizado (baixas) e projetado (títulos em aberto), com saldo acumulado.

**Architecture:** Helper puro `montarFluxoCaixa` + duas queries planas (padrão DRE), action `relatorioFluxo(ano)`, página server + componente client (matriz + seletor de ano + CSV + imprimir), cartão no hub. Spec: `docs/superpowers/specs/2026-07-09-financeiro-fluxo-caixa-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase, Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`.
- Sem migration. Gate `podeGerenciarFinanceiro`. Reusa `paraCSV` (`@/lib/financeiro/csv`) e `formatarMoeda` (`@/lib/format`).
- CSV: dinheiro como `toFixed(2).replace(".", ",")` (sem "R$"), BOM UTF-8, delimitador via `paraCSV`.
- Arredondar valores a 2 casas: `Math.round(n*100)/100`.
- Branch: `git checkout -b feat/financeiro-fluxo develop`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `src/lib/financeiro/fluxo-caixa.ts` — **novo**: helper `montarFluxoCaixa` + tipos.
- `src/tests/financeiro/fluxo-caixa.test.ts` — **novo**.
- `src/app/(app)/financeiro/relatorios/fluxo/fluxo-actions.ts` — **novo**: `relatorioFluxo`.
- `src/app/(app)/financeiro/relatorios/fluxo/FluxoCaixa.tsx` + `page.tsx` — **novo**: UI.
- `src/app/(app)/financeiro/relatorios/page.tsx` — **modificar**: 3º cartão.
- `src/tests/financeiro/fluxo-render.test.tsx` — **novo**: smoke.

---

## Task 1: Helper puro `montarFluxoCaixa` (TDD)

**Files:**
- Create: `src/lib/financeiro/fluxo-caixa.ts`
- Test: `src/tests/financeiro/fluxo-caixa.test.ts`

**Interfaces:**
- Produces: tipos `NaturezaFC`, `CategoriaFC`, `ItemFluxo`, `LinhaFluxo`, `GrupoFluxo`, `FluxoCaixa`; `montarFluxoCaixa(categorias, itens, saldoInicial)`.

- [ ] **Step 1: Testes**

```ts
import { describe, it, expect } from "vitest";
import { montarFluxoCaixa, type CategoriaFC, type ItemFluxo } from "@/lib/financeiro/fluxo-caixa";

const cats: CategoriaFC[] = [
  { id: "r1", nome: "Honorários", natureza: "RECEITA", ordem_dre: 1 },
  { id: "r2", nome: "Consultoria", natureza: "RECEITA", ordem_dre: 2 },
  { id: "d1", nome: "Aluguel", natureza: "DESPESA", ordem_dre: 3 },
  { id: "z9", nome: "Sem movimento", natureza: "DESPESA", ordem_dre: 4 },
];
const itens: ItemFluxo[] = [
  { categoriaId: "r1", mes: 1, tipo: "RECEBER", valor: 1000 },
  { categoriaId: "r1", mes: 2, tipo: "RECEBER", valor: 500 },
  { categoriaId: "r2", mes: 1, tipo: "RECEBER", valor: 300 },
  { categoriaId: "d1", mes: 1, tipo: "PAGAR", valor: 800 },
  { categoriaId: "d1", mes: 2, tipo: "PAGAR", valor: 2000 },
];

describe("montarFluxoCaixa", () => {
  it("separa Entradas/Saídas e agrupa por categoria/mês", () => {
    const f = montarFluxoCaixa(cats, itens, 0);
    expect(f.entradas.linhas.map((l) => l.categoriaId)).toEqual(["r1", "r2"]);
    expect(f.entradas.linhas[0]!.valores[0]).toBe(1000);
    expect(f.entradas.linhas[0]!.valores[1]).toBe(500);
    expect(f.entradas.linhas[0]!.total).toBe(1500);
    expect(f.saidas.linhas.map((l) => l.categoriaId)).toEqual(["d1"]);
  });
  it("calcula totais do grupo por mês", () => {
    const f = montarFluxoCaixa(cats, itens, 0);
    expect(f.entradas.totais[0]).toBe(1300); // 1000 + 300
    expect(f.entradas.total).toBe(1800);
    expect(f.saidas.totais[1]).toBe(2000);
  });
  it("resultado do mês = entradas − saídas", () => {
    const f = montarFluxoCaixa(cats, itens, 0);
    expect(f.resultadoMes[0]).toBe(500); // 1300 − 800
    expect(f.resultadoMes[1]).toBe(-1500); // 500 − 2000
  });
  it("saldo acumulado corre a partir do saldo inicial (com mês negativo)", () => {
    const f = montarFluxoCaixa(cats, itens, 1000);
    expect(f.saldoAcumulado[0]).toBe(1500); // 1000 + 500
    expect(f.saldoAcumulado[1]).toBe(0); // 1500 − 1500
    expect(f.saldoAcumulado[11]).toBe(0); // sem mais movimento
    expect(f.saldoInicial).toBe(1000);
  });
  it("omite categorias sem movimento e ordena por ordem_dre", () => {
    const f = montarFluxoCaixa(cats, itens, 0);
    expect(f.saidas.linhas.find((l) => l.categoriaId === "z9")).toBeUndefined();
    expect(f.entradas.linhas[0]!.nome).toBe("Honorários");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- financeiro/fluxo-caixa` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar `fluxo-caixa.ts`**

```ts
const r2 = (n: number) => Math.round(n * 100) / 100;

export type NaturezaFC = "RECEITA" | "DESPESA";
export type CategoriaFC = { id: string; nome: string; natureza: NaturezaFC; ordem_dre: number };
export type ItemFluxo = { categoriaId: string; mes: number; tipo: "RECEBER" | "PAGAR"; valor: number };
export type LinhaFluxo = { categoriaId: string; nome: string; valores: number[]; total: number };
export type GrupoFluxo = { titulo: "Entradas" | "Saídas"; linhas: LinhaFluxo[]; totais: number[]; total: number };
export type FluxoCaixa = {
  entradas: GrupoFluxo;
  saidas: GrupoFluxo;
  resultadoMes: number[];
  saldoAcumulado: number[];
  saldoInicial: number;
};

export function montarFluxoCaixa(categorias: CategoriaFC[], itens: ItemFluxo[], saldoInicial: number): FluxoCaixa {
  const catPorId = new Map(categorias.map((c) => [c.id, c]));

  function grupo(titulo: "Entradas" | "Saídas", tipo: "RECEBER" | "PAGAR"): GrupoFluxo {
    const porCat = new Map<string, number[]>();
    for (const it of itens) {
      if (it.tipo !== tipo || !catPorId.has(it.categoriaId) || it.mes < 1 || it.mes > 12) continue;
      const arr = porCat.get(it.categoriaId) ?? Array<number>(12).fill(0);
      arr[it.mes - 1] = (arr[it.mes - 1] ?? 0) + it.valor;
      porCat.set(it.categoriaId, arr);
    }
    const linhas: LinhaFluxo[] = [];
    for (const [id, valores] of porCat) {
      const arred = valores.map(r2);
      if (arred.every((v) => v === 0)) continue;
      const cat = catPorId.get(id)!;
      linhas.push({ categoriaId: id, nome: cat.nome, valores: arred, total: r2(arred.reduce((a, b) => a + b, 0)) });
    }
    linhas.sort((a, b) => {
      const ca = catPorId.get(a.categoriaId)!;
      const cb = catPorId.get(b.categoriaId)!;
      return ca.ordem_dre - cb.ordem_dre || a.nome.localeCompare(b.nome);
    });
    const totais = Array.from({ length: 12 }, (_, m) => r2(linhas.reduce((s, l) => s + (l.valores[m] ?? 0), 0)));
    return { titulo, linhas, totais, total: r2(totais.reduce((a, b) => a + b, 0)) };
  }

  const entradas = grupo("Entradas", "RECEBER");
  const saidas = grupo("Saídas", "PAGAR");
  const resultadoMes = Array.from({ length: 12 }, (_, m) => r2((entradas.totais[m] ?? 0) - (saidas.totais[m] ?? 0)));
  const saldoAcumulado: number[] = [];
  let acc = saldoInicial;
  for (let m = 0; m < 12; m++) {
    acc = r2(acc + (resultadoMes[m] ?? 0));
    saldoAcumulado.push(acc);
  }
  return { entradas, saidas, resultadoMes, saldoAcumulado, saldoInicial: r2(saldoInicial) };
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- financeiro/fluxo-caixa` (PASS), `npm run lint`, `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/financeiro/fluxo-caixa.ts src/tests/financeiro/fluxo-caixa.test.ts
git commit -m "feat(financeiro): helper montarFluxoCaixa (TDD)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Action `relatorioFluxo`

**Files:**
- Create: `src/app/(app)/financeiro/relatorios/fluxo/fluxo-actions.ts`

**Interfaces:**
- Consumes: `montarFluxoCaixa`, `CategoriaFC`, `ItemFluxo`, `FluxoCaixa` (Task 1); `podeGerenciarFinanceiro`.
- Produces: `relatorioFluxo(ano: number): Promise<{ fluxo: FluxoCaixa; mesAtual: number } | null>`.

- [ ] **Step 1: Criar `fluxo-actions.ts`**

```ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { montarFluxoCaixa, type CategoriaFC, type ItemFluxo, type FluxoCaixa } from "@/lib/financeiro/fluxo-caixa";

const mesDe = (d: string) => Number(d.slice(5, 7));

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarFinanceiro(p.papel)) return null;
  return p;
}

export async function relatorioFluxo(ano: number): Promise<{ fluxo: FluxoCaixa; mesAtual: number } | null> {
  if (!(await gate())) return null;
  const supabase = await createServerSupabase();
  const ini = `${ano}-01-01`;
  const fim = `${ano}-12-31`;

  const { data: cats } = await supabase.from("categoria").select("id, nome, natureza, ordem_dre").eq("ativa", true);
  const categorias: CategoriaFC[] = (cats ?? []).map((c) => ({
    id: c.id as string,
    nome: c.nome as string,
    natureza: c.natureza as "RECEITA" | "DESPESA",
    ordem_dre: c.ordem_dre as number,
  }));

  const itens: ItemFluxo[] = [];

  // Realizado — baixas não estornadas do ano
  const { data: baixas } = await supabase
    .from("baixa")
    .select("valor_recebido, data_recebimento, titulo:titulo_id(tipo, categoria_id)")
    .eq("estornada", false)
    .gte("data_recebimento", ini)
    .lte("data_recebimento", fim);
  for (const b of baixas ?? []) {
    const tit = Array.isArray(b.titulo) ? b.titulo[0] : b.titulo;
    const cat = tit?.categoria_id as string | undefined;
    const tipo = tit?.tipo as "RECEBER" | "PAGAR" | undefined;
    if (!cat || !tipo) continue;
    itens.push({ categoriaId: cat, mes: mesDe(b.data_recebimento as string), tipo, valor: Number(b.valor_recebido) });
  }

  // Projetado — títulos em aberto por vencimento; saldo = valor − baixas não estornadas
  const { data: titulos } = await supabase
    .from("titulo")
    .select("categoria_id, tipo, valor, vencimento, status, baixa(valor_recebido, estornada)")
    .in("status", ["ABERTO", "VENCIDO", "BAIXADO_PARCIAL"])
    .not("categoria_id", "is", null)
    .gte("vencimento", ini)
    .lte("vencimento", fim);
  for (const t of titulos ?? []) {
    const cat = t.categoria_id as string | undefined;
    const tipo = t.tipo as "RECEBER" | "PAGAR" | undefined;
    if (!cat || !tipo) continue;
    const bxs = (Array.isArray(t.baixa) ? t.baixa : t.baixa ? [t.baixa] : []) as { valor_recebido: number; estornada: boolean }[];
    const baixado = bxs.filter((x) => !x.estornada).reduce((s, x) => s + Number(x.valor_recebido), 0);
    const saldo = Number(t.valor) - baixado;
    if (saldo <= 0) continue;
    itens.push({ categoriaId: cat, mes: mesDe(t.vencimento as string), tipo, valor: saldo });
  }

  const { data: contas } = await supabase.from("conta_bancaria").select("saldo_inicial").eq("ativa", true);
  const saldoInicial = (contas ?? []).reduce((s, c) => s + Number(c.saldo_inicial), 0);

  const fluxo = montarFluxoCaixa(categorias, itens, saldoInicial);

  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const anoAtual = Number(hoje.slice(0, 4));
  const mesAtual = ano < anoAtual ? 0 : ano > anoAtual ? 13 : Number(hoje.slice(5, 7));

  return { fluxo, mesAtual };
}
```

- [ ] **Step 2: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build` (sem erros).
```bash
git add "src/app/(app)/financeiro/relatorios/fluxo/fluxo-actions.ts"
git commit -m "feat(financeiro): action relatorioFluxo (realizado + projetado)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: UI — matriz + seletor de ano + CSV + cartão

**Files:**
- Create: `src/app/(app)/financeiro/relatorios/fluxo/FluxoCaixa.tsx`
- Create: `src/app/(app)/financeiro/relatorios/fluxo/page.tsx`
- Modify: `src/app/(app)/financeiro/relatorios/page.tsx`
- Test: `src/tests/financeiro/fluxo-render.test.tsx`

**Interfaces:**
- Consumes: `relatorioFluxo` (Task 2); `FluxoCaixa` (Task 1); `paraCSV`; `formatarMoeda`.
- Produces: componente client `FluxoCaixaView`.

- [ ] **Step 1: Smoke test**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/financeiro/relatorios/fluxo/fluxo-actions", () => ({ relatorioFluxo: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { FluxoCaixaView } from "@/app/(app)/financeiro/relatorios/fluxo/FluxoCaixa";
import type { FluxoCaixa } from "@/lib/financeiro/fluxo-caixa";

const fluxo: FluxoCaixa = {
  entradas: { titulo: "Entradas", linhas: [{ categoriaId: "r1", nome: "Honorários", valores: [1000, ...Array(11).fill(0)], total: 1000 }], totais: [1000, ...Array(11).fill(0)], total: 1000 },
  saidas: { titulo: "Saídas", linhas: [], totais: Array(12).fill(0), total: 0 },
  resultadoMes: [1000, ...Array(11).fill(0)],
  saldoAcumulado: Array(12).fill(1000),
  saldoInicial: 0,
};

describe("FluxoCaixaView", () => {
  it("renderiza seletor de ano, categoria, saldo acumulado e exportar", () => {
    const html = renderToStaticMarkup(<FluxoCaixaView ano={2026} fluxo={fluxo} mesAtual={7} />);
    expect(html).toContain("2026");
    expect(html).toContain("Honorários");
    expect(html).toContain("Saldo acumulado");
    expect(html).toContain("Exportar CSV");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- fluxo-render` → FAIL.

- [ ] **Step 3: `FluxoCaixa.tsx`**

```tsx
"use client";
import { useState } from "react";
import { formatarMoeda } from "@/lib/format";
import { paraCSV } from "@/lib/financeiro/csv";
import { relatorioFluxo } from "./fluxo-actions";
import type { FluxoCaixa, GrupoFluxo } from "@/lib/financeiro/fluxo-caixa";

const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const csvMoeda = (v: number) => v.toFixed(2).replace(".", ",");
const cor = (v: number) => (v < 0 ? "text-negativo" : "");

function baixar(nome: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export function FluxoCaixaView({ ano: anoIni, fluxo: fluxoIni, mesAtual: mesAtualIni }: { ano: number; fluxo: FluxoCaixa; mesAtual: number }) {
  const [ano, setAno] = useState(anoIni);
  const [fluxo, setFluxo] = useState<FluxoCaixa>(fluxoIni);
  const [mesAtual, setMesAtual] = useState(mesAtualIni);
  const [carregando, setCarregando] = useState(false);

  const anos = Array.from({ length: 6 }, (_, i) => anoIni + 1 - i);

  async function trocarAno(a: number) {
    setAno(a);
    setCarregando(true);
    const r = await relatorioFluxo(a);
    if (r) {
      setFluxo(r.fluxo);
      setMesAtual(r.mesAtual);
    }
    setCarregando(false);
  }

  // mês (1..12) é projetado?
  const projetado = (m: number) => (mesAtual === 0 ? false : mesAtual >= 13 ? true : m > mesAtual);
  const vazio = fluxo.entradas.linhas.length === 0 && fluxo.saidas.linhas.length === 0;
  const resultadoTotal = fluxo.entradas.total - fluxo.saidas.total;

  function exportar() {
    const linhasCSV: string[][] = [];
    const push = (nome: string, valores: number[], total: string) => linhasCSV.push([nome, ...valores.map(csvMoeda), total]);
    for (const l of fluxo.entradas.linhas) push(l.nome, l.valores, csvMoeda(l.total));
    push("Total de entradas", fluxo.entradas.totais, csvMoeda(fluxo.entradas.total));
    for (const l of fluxo.saidas.linhas) push(l.nome, l.valores, csvMoeda(l.total));
    push("Total de saídas", fluxo.saidas.totais, csvMoeda(fluxo.saidas.total));
    push("Resultado do mês", fluxo.resultadoMes, csvMoeda(resultadoTotal));
    linhasCSV.push(["Saldo acumulado", ...fluxo.saldoAcumulado.map(csvMoeda), ""]);
    const csv = paraCSV(["Categoria", ...MES, "Total"], linhasCSV);
    baixar(`fluxo-caixa-${ano}.csv`, csv);
  }

  const cel = "px-2 py-1 text-right tabular-nums whitespace-nowrap";
  const th = (m: number) => `px-2 py-2 text-right font-medium ${projetado(m) ? "bg-creme" : ""}`;
  const tdMes = (m: number, v: number) => `${cel} ${projetado(m) ? "bg-creme" : ""} ${cor(v)}`;

  function Grupo({ grupo }: { grupo: GrupoFluxo }) {
    return (
      <>
        <tr>
          <td colSpan={14} className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-wide text-cinza">{grupo.titulo}</td>
        </tr>
        {grupo.linhas.length === 0 && (
          <tr>
            <td colSpan={14} className="px-3 py-1 text-xs text-cinza">—</td>
          </tr>
        )}
        {grupo.linhas.map((l) => (
          <tr key={l.categoriaId} className="border-b border-linha/40">
            <td className="px-3 py-1 text-texto whitespace-nowrap">{l.nome}</td>
            {l.valores.map((v, i) => (
              <td key={i} className={tdMes(i + 1, v)}>{formatarMoeda(v)}</td>
            ))}
            <td className={`${cel} font-medium`}>{formatarMoeda(l.total)}</td>
          </tr>
        ))}
        <tr className="border-b border-linha font-medium">
          <td className="px-3 py-1 text-texto">Total {grupo.titulo.toLowerCase()}</td>
          {grupo.totais.map((v, i) => (
            <td key={i} className={tdMes(i + 1, v)}>{formatarMoeda(v)}</td>
          ))}
          <td className={cel}>{formatarMoeda(grupo.total)}</td>
        </tr>
      </>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <select value={ano} onChange={(e) => trocarAno(Number(e.target.value))} className="rounded-lg border border-linha px-2 py-1 text-sm">
          {anos.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        {carregando && <span className="text-xs text-cinza">Carregando…</span>}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={exportar} className="rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white">Exportar CSV</button>
          <button type="button" onClick={() => window.print()} className="rounded-lg border border-linha px-3 py-1.5 text-sm">Imprimir</button>
        </div>
      </div>

      {vazio ? (
        <p className="rounded-2xl border border-linha bg-white px-3 py-4 text-sm text-cinza">Sem movimentações no período.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-linha text-xs text-cinza">
                <th className="px-3 py-2 text-left font-medium">Categoria</th>
                {MES.map((m, i) => (
                  <th key={m} className={th(i + 1)}>
                    {m}
                    {(mesAtual >= 1 && mesAtual <= 12 && i + 1 === mesAtual + 1) || (mesAtual >= 13 && i === 0) ? (
                      <span className="block text-[9px] font-normal normal-case text-verde">projetado →</span>
                    ) : null}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              <Grupo grupo={fluxo.entradas} />
              <Grupo grupo={fluxo.saidas} />
              <tr className="border-t-2 border-linha font-medium">
                <td className="px-3 py-1.5 text-texto">Resultado do mês</td>
                {fluxo.resultadoMes.map((v, i) => (
                  <td key={i} className={tdMes(i + 1, v)}>{formatarMoeda(v)}</td>
                ))}
                <td className={`${cel} ${cor(resultadoTotal)}`}>{formatarMoeda(resultadoTotal)}</td>
              </tr>
              <tr className="font-semibold">
                <td className="px-3 py-1.5 text-texto">Saldo acumulado</td>
                {fluxo.saldoAcumulado.map((v, i) => (
                  <td key={i} className={tdMes(i + 1, v)}>{formatarMoeda(v)}</td>
                ))}
                <td className={cel}>—</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar** — `npm test -- fluxo-render` → PASS.

- [ ] **Step 5: `fluxo/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { FluxoCaixaView } from "./FluxoCaixa";
import { relatorioFluxo } from "./fluxo-actions";

export default async function FluxoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const ano = Number(hoje.slice(0, 4));
  const dados = await relatorioFluxo(ano);
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4">
      <PageHeader titulo="Fluxo de caixa detalhado" subtitulo="Realizado e projetado, mês a mês, com saldo acumulado" />
      {dados ? <FluxoCaixaView ano={ano} fluxo={dados.fluxo} mesAtual={dados.mesAtual} /> : <p className="text-sm text-negativo">Não foi possível carregar os dados.</p>}
    </main>
  );
}
```

- [ ] **Step 6: Cartão no hub** — em `src/app/(app)/financeiro/relatorios/page.tsx`, acrescentar o 3º item ao array `RELATORIOS` (após o item do extrato):
```tsx
  { href: "/financeiro/relatorios/fluxo", label: "Fluxo de caixa detalhado", desc: "Realizado e projetado, mês a mês, com saldo acumulado." },
```

- [ ] **Step 7: Suite completa** — `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde; rota `/financeiro/relatorios/fluxo` compila).

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/financeiro/relatorios/fluxo" "src/app/(app)/financeiro/relatorios/page.tsx" src/tests/financeiro/fluxo-render.test.tsx
git commit -m "feat(financeiro): tela do fluxo de caixa detalhado + CSV + cartão no hub

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado` (como primeiro item):
```markdown
- **Financeiro — Fluxo de caixa detalhado:** novo relatório em `/financeiro/relatorios/fluxo` (no hub de
  Relatórios): matriz de categorias × 12 meses combinando **realizado** (baixas) e **projetado**
  (títulos em aberto por vencimento), com **saldo acumulado** ao fim de cada mês, seletor de ano,
  exportação em CSV e impressão.
```

- [ ] **Step 2: Commit + finalizar**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog do fluxo de caixa detalhado

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois usar `superpowers:finishing-a-development-branch`. (Sem migration/segredos.)

---

## Self-Review

- **Cobertura do spec:** helper `montarFluxoCaixa` (T1) ✓; action `relatorioFluxo` com realizado+projetado+saldo inicial+mesAtual (T2) ✓; UI matriz por categoria × 12 meses, seletor de ano, destaque projetado, CSV, imprimir, cartão no hub (T3) ✓; CHANGELOG (T4) ✓. Unit (T1) + smoke (T3).
- **Placeholders:** nenhum — todo passo tem código concreto.
- **Consistência de tipos:** `FluxoCaixa`/`GrupoFluxo`/`CategoriaFC`/`ItemFluxo` definidos em T1 e usados em T2 (action) e T3 (componente/smoke). `relatorioFluxo(ano): { fluxo, mesAtual } | null` (T2) consumido pela página e pelo `trocarAno` (T3). `paraCSV(cabecalhos, linhas)` e `formatarMoeda` reutilizados. Componente exportado como `FluxoCaixaView` (evita colisão com o tipo `FluxoCaixa`) — usado igual em page.tsx e no smoke.
- **Índices seguros:** acessos a arrays usam `?? 0` (compatível com `noUncheckedIndexedAccess`).
- **Segurança:** gate `podeGerenciarFinanceiro` na action e na página; CSV gerado no cliente a partir de dados já autorizados; `paraCSV` já neutraliza injeção de fórmula.
- **Escopo:** só o fluxo mensal do ano (realizado+projetado). Diário/janela móvel/por conta ficam fora.
