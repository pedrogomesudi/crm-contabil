# Financeiro — Extrato/movimentações (CSV) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um extrato financeiro com filtros e export CSV, alternando entre Lançamentos (títulos) e Baixas.

**Architecture:** Helper puro `paraCSV`; actions `listarLancamentos`/`listarBaixas`/`listarCategoriasFiltro`; UI `/financeiro/relatorios/extrato` (2 visões + filtros + CSV). Spec: `docs/superpowers/specs/2026-07-09-financeiro-extrato-csv-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase, Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`.
- Sem migration. Gate `podeGerenciarFinanceiro`. CSV: delimitador `;`, BOM UTF-8, valores BR (vírgula).
- Reusa `formatarMoeda` (`@/lib/format`). `titulo.tipo` = RECEBER/PAGAR.
- Branch: `git checkout -b feat/financeiro-extrato develop`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `src/lib/financeiro/csv.ts` — **novo**: `paraCSV`.
- `src/tests/financeiro/csv.test.ts` — **novo**.
- `src/app/(app)/financeiro/relatorios/extrato/extrato-actions.ts` — **novo**: actions.
- `src/app/(app)/financeiro/relatorios/extrato/Extrato.tsx` + `page.tsx` — **novo**: UI.
- `src/app/(app)/financeiro/relatorios/page.tsx` — **modificar**: cartão do extrato.
- `src/tests/financeiro/extrato-render.test.tsx` — **novo**: smoke.

---

## Task 1: Helper puro paraCSV (TDD)

**Files:**
- Create: `src/lib/financeiro/csv.ts`
- Test: `src/tests/financeiro/csv.test.ts`

**Interfaces:**
- Produces: `paraCSV(cabecalhos: string[], linhas: string[][]): string`.

- [ ] **Step 1: Testes**

```ts
import { describe, it, expect } from "vitest";
import { paraCSV } from "@/lib/financeiro/csv";

describe("paraCSV", () => {
  it("junta com ; e CRLF", () => {
    expect(paraCSV(["A", "B"], [["1", "2"], ["3", "4"]])).toBe("A;B\r\n1;2\r\n3;4");
  });
  it("escapa ;, aspas e quebra de linha", () => {
    expect(paraCSV(["X"], [['a;b'], ['diz "oi"'], ["linha1\nlinha2"]])).toBe('X\r\n"a;b"\r\n"diz ""oi"""\r\n"linha1\nlinha2"');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- financeiro/csv` → FAIL.

- [ ] **Step 3: Implementar `csv.ts`**

```ts
export function paraCSV(cabecalhos: string[], linhas: string[][]): string {
  const esc = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const linha = (arr: string[]) => arr.map(esc).join(";");
  return [linha(cabecalhos), ...linhas.map(linha)].join("\r\n");
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- financeiro/csv` (PASS), `npm run lint`, `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/financeiro/csv.ts src/tests/financeiro/csv.test.ts
git commit -m "feat(financeiro): helper paraCSV (TDD)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Actions do extrato

**Files:**
- Create: `src/app/(app)/financeiro/relatorios/extrato/extrato-actions.ts`

**Interfaces:**
- Consumes: `podeGerenciarFinanceiro`.
- Produces: `type TipoFiltro`, `type LancamentoRow`, `type BaixaRow`; `listarLancamentos`, `listarBaixas`, `listarCategoriasFiltro`.

- [ ] **Step 1: Criar `extrato-actions.ts`**

```ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";

export type TipoFiltro = "todos" | "RECEBER" | "PAGAR";
export type LancamentoRow = { id: string; cliente: string; tipo: string; descricao: string; categoria: string; competencia: string; vencimento: string; valor: number; baixado: number; status: string };
export type BaixaRow = { id: string; data: string; cliente: string; tipo: string; valor: number; forma: string; conta: string; descricao: string };

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarFinanceiro(p.papel)) return null;
  return p;
}

function um<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export async function listarCategoriasFiltro(): Promise<{ id: string; nome: string }[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("categoria").select("id, nome").eq("ativa", true).order("nome");
  return (data ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string }));
}

export async function listarLancamentos(inicio: string, fim: string, tipo: TipoFiltro, categoriaId: string | null): Promise<LancamentoRow[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  let q = supabase.from("titulo").select("id, tipo, descricao, competencia, vencimento, valor, status, clientes(razao_social), categoria(nome)").gte("vencimento", inicio).lte("vencimento", fim).order("vencimento");
  if (tipo !== "todos") q = q.eq("tipo", tipo);
  if (categoriaId) q = q.eq("categoria_id", categoriaId);
  const { data } = await q;
  const rows = data ?? [];
  const ids = rows.map((r) => r.id as string);
  const baixadoPor = new Map<string, number>();
  if (ids.length) {
    const { data: bs } = await supabase.from("baixa").select("titulo_id, valor_recebido").in("titulo_id", ids).eq("estornada", false);
    for (const b of bs ?? []) baixadoPor.set(b.titulo_id as string, (baixadoPor.get(b.titulo_id as string) ?? 0) + Number(b.valor_recebido));
  }
  return rows.map((r) => {
    const cli = um(r.clientes as { razao_social?: string } | { razao_social?: string }[] | null);
    const cat = um(r.categoria as { nome?: string } | { nome?: string }[] | null);
    return {
      id: r.id as string,
      cliente: (cli?.razao_social as string) ?? "—",
      tipo: r.tipo as string,
      descricao: (r.descricao as string | null) ?? "",
      categoria: (cat?.nome as string) ?? "—",
      competencia: r.competencia as string,
      vencimento: r.vencimento as string,
      valor: Number(r.valor),
      baixado: baixadoPor.get(r.id as string) ?? 0,
      status: r.status as string,
    };
  });
}

export async function listarBaixas(inicio: string, fim: string, tipo: TipoFiltro): Promise<BaixaRow[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("baixa").select("id, data_recebimento, valor_recebido, forma_pagamento, conta:conta_bancaria_id(nome), titulo:titulo_id(tipo, descricao, clientes(razao_social))").eq("estornada", false).gte("data_recebimento", inicio).lte("data_recebimento", fim).order("data_recebimento");
  const rows = data ?? [];
  const out: BaixaRow[] = [];
  for (const b of rows) {
    const tit = um(b.titulo as { tipo?: string; descricao?: string; clientes?: unknown } | Array<{ tipo?: string; descricao?: string; clientes?: unknown }> | null);
    if (tipo !== "todos" && tit?.tipo !== tipo) continue;
    const cli = um(tit?.clientes as { razao_social?: string } | { razao_social?: string }[] | null);
    const conta = um(b.conta as { nome?: string } | { nome?: string }[] | null);
    out.push({
      id: b.id as string,
      data: b.data_recebimento as string,
      cliente: (cli?.razao_social as string) ?? "—",
      tipo: (tit?.tipo as string) ?? "",
      valor: Number(b.valor_recebido),
      forma: b.forma_pagamento as string,
      conta: (conta?.nome as string) ?? "—",
      descricao: (tit?.descricao as string) ?? "",
    });
  }
  return out;
}
```

- [ ] **Step 2: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build` (sem erros).
```bash
git add "src/app/(app)/financeiro/relatorios/extrato/extrato-actions.ts"
git commit -m "feat(financeiro): actions do extrato (lançamentos, baixas, categorias)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: UI — tela do extrato + CSV + cartão

**Files:**
- Create: `src/app/(app)/financeiro/relatorios/extrato/Extrato.tsx`
- Create: `src/app/(app)/financeiro/relatorios/extrato/page.tsx`
- Modify: `src/app/(app)/financeiro/relatorios/page.tsx`
- Test: `src/tests/financeiro/extrato-render.test.tsx`

**Interfaces:**
- Consumes: `listarLancamentos`, `listarBaixas`, `LancamentoRow`, `BaixaRow`, `TipoFiltro` (Task 2); `paraCSV` (Task 1); `formatarMoeda`.

- [ ] **Step 1: Smoke test**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/financeiro/relatorios/extrato/extrato-actions", () => ({ listarLancamentos: vi.fn(), listarBaixas: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { Extrato } from "@/app/(app)/financeiro/relatorios/extrato/Extrato";
import type { LancamentoRow } from "@/app/(app)/financeiro/relatorios/extrato/extrato-actions";

const lanc: LancamentoRow[] = [
  { id: "1", cliente: "ACME LTDA", tipo: "RECEBER", descricao: "Mensalidade", categoria: "Honorários", competencia: "2026-07-01", vencimento: "2026-07-10", valor: 300, baixado: 0, status: "ABERTO" },
];

describe("Extrato", () => {
  it("renderiza alternador, tabela e exportar", () => {
    const html = renderToStaticMarkup(<Extrato categorias={[{ id: "c1", nome: "Honorários" }]} inicio="2026-07-01" fim="2026-07-31" lancamentosIni={lanc} />);
    expect(html).toContain("Lançamentos");
    expect(html).toContain("ACME LTDA");
    expect(html).toContain("Exportar CSV");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- extrato-render` → FAIL.

- [ ] **Step 3: `Extrato.tsx`**

```tsx
"use client";
import { useState } from "react";
import { formatarMoeda } from "@/lib/format";
import { paraCSV } from "@/lib/financeiro/csv";
import { listarLancamentos, listarBaixas, type LancamentoRow, type BaixaRow, type TipoFiltro } from "./extrato-actions";

type Visao = "lancamentos" | "baixas";
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const csvMoeda = (v: number) => v.toFixed(2).replace(".", ",");
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const tipoLabel = (t: string) => (t === "RECEBER" ? "Receber" : "Pagar");

function baixar(nome: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export function Extrato({ categorias, inicio: iniIni, fim: fimIni, lancamentosIni }: { categorias: { id: string; nome: string }[]; inicio: string; fim: string; lancamentosIni: LancamentoRow[] }) {
  const [visao, setVisao] = useState<Visao>("lancamentos");
  const [inicio, setInicio] = useState(iniIni);
  const [fim, setFim] = useState(fimIni);
  const [tipo, setTipo] = useState<TipoFiltro>("todos");
  const [categoriaId, setCategoriaId] = useState("");
  const [busca, setBusca] = useState("");
  const [lancamentos, setLancamentos] = useState<LancamentoRow[]>(lancamentosIni);
  const [baixas, setBaixas] = useState<BaixaRow[]>([]);
  const [carregando, setCarregando] = useState(false);

  async function recarregar(next: { visao?: Visao; inicio?: string; fim?: string; tipo?: TipoFiltro; categoriaId?: string }) {
    const v = next.visao ?? visao;
    const i = next.inicio ?? inicio;
    const f = next.fim ?? fim;
    const t = next.tipo ?? tipo;
    const c = next.categoriaId ?? categoriaId;
    setVisao(v); setInicio(i); setFim(f); setTipo(t); setCategoriaId(c); setCarregando(true);
    if (v === "lancamentos") setLancamentos(await listarLancamentos(i, f, t, c || null));
    else setBaixas(await listarBaixas(i, f, t));
    setCarregando(false);
  }

  const q = busca.trim().toLowerCase();
  const lancFiltrados = lancamentos.filter((r) => !q || r.cliente.toLowerCase().includes(q) || r.descricao.toLowerCase().includes(q));
  const baixasFiltradas = baixas.filter((r) => !q || r.cliente.toLowerCase().includes(q) || r.descricao.toLowerCase().includes(q));

  function exportar() {
    if (visao === "lancamentos") {
      const csv = paraCSV(
        ["Cliente", "Tipo", "Descrição", "Categoria", "Competência", "Vencimento", "Valor", "Baixado", "Status"],
        lancFiltrados.map((r) => [r.cliente, tipoLabel(r.tipo), r.descricao, r.categoria, dataBR(r.competencia), dataBR(r.vencimento), csvMoeda(r.valor), csvMoeda(r.baixado), r.status]),
      );
      baixar(`extrato-lancamentos-${inicio}-${fim}.csv`, csv);
    } else {
      const csv = paraCSV(
        ["Data", "Cliente", "Tipo", "Valor recebido", "Forma", "Conta", "Descrição"],
        baixasFiltradas.map((r) => [dataBR(r.data), r.cliente, tipoLabel(r.tipo), csvMoeda(r.valor), r.forma, r.conta, r.descricao]),
      );
      baixar(`extrato-baixas-${inicio}-${fim}.csv`, csv);
    }
  }

  const inp = "rounded-lg border border-linha px-2 py-1 text-sm";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-linha p-0.5 text-sm">
          <button type="button" onClick={() => recarregar({ visao: "lancamentos" })} className={`rounded px-2 py-0.5 ${visao === "lancamentos" ? "bg-verde text-white" : "text-cinza"}`}>Lançamentos</button>
          <button type="button" onClick={() => recarregar({ visao: "baixas" })} className={`rounded px-2 py-0.5 ${visao === "baixas" ? "bg-verde text-white" : "text-cinza"}`}>Baixas</button>
        </div>
        <input type="date" value={inicio} onChange={(e) => recarregar({ inicio: e.target.value })} className={inp} />
        <input type="date" value={fim} onChange={(e) => recarregar({ fim: e.target.value })} className={inp} />
        <select value={tipo} onChange={(e) => recarregar({ tipo: e.target.value as TipoFiltro })} className={inp}>
          <option value="todos">Todos</option>
          <option value="RECEBER">Receber</option>
          <option value="PAGAR">Pagar</option>
        </select>
        {visao === "lancamentos" && (
          <select value={categoriaId} onChange={(e) => recarregar({ categoriaId: e.target.value })} className={inp}>
            <option value="">Toda categoria</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        )}
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente" className={inp} />
        <button type="button" onClick={exportar} className="ml-auto rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white">Exportar CSV</button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          {visao === "lancamentos" ? (
            <>
              <thead><tr className="border-b border-linha text-left text-xs text-cinza">
                <th className="px-3 py-2 font-medium">Cliente</th><th className="px-3 py-2 font-medium">Tipo</th><th className="px-3 py-2 font-medium">Descrição</th><th className="px-3 py-2 font-medium">Categoria</th><th className="px-3 py-2 font-medium">Vencimento</th><th className="px-3 py-2 text-right font-medium">Valor</th><th className="px-3 py-2 text-right font-medium">Baixado</th><th className="px-3 py-2 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {lancFiltrados.length === 0 && <tr><td colSpan={8} className="px-3 py-3 text-cinza">{carregando ? "Carregando…" : "Sem movimentações no período."}</td></tr>}
                {lancFiltrados.map((r) => (
                  <tr key={r.id} className="border-b border-linha/60">
                    <td className="px-3 py-1.5 text-texto">{r.cliente}</td><td className="px-3 py-1.5">{tipoLabel(r.tipo)}</td><td className="px-3 py-1.5">{r.descricao}</td><td className="px-3 py-1.5">{r.categoria}</td><td className="px-3 py-1.5">{dataBR(r.vencimento)}</td><td className="px-3 py-1.5 text-right tabular-nums">{brl(r.valor)}</td><td className="px-3 py-1.5 text-right tabular-nums">{brl(r.baixado)}</td><td className="px-3 py-1.5">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </>
          ) : (
            <>
              <thead><tr className="border-b border-linha text-left text-xs text-cinza">
                <th className="px-3 py-2 font-medium">Data</th><th className="px-3 py-2 font-medium">Cliente</th><th className="px-3 py-2 font-medium">Tipo</th><th className="px-3 py-2 text-right font-medium">Valor</th><th className="px-3 py-2 font-medium">Forma</th><th className="px-3 py-2 font-medium">Conta</th><th className="px-3 py-2 font-medium">Descrição</th>
              </tr></thead>
              <tbody>
                {baixasFiltradas.length === 0 && <tr><td colSpan={7} className="px-3 py-3 text-cinza">{carregando ? "Carregando…" : "Sem movimentações no período."}</td></tr>}
                {baixasFiltradas.map((r) => (
                  <tr key={r.id} className="border-b border-linha/60">
                    <td className="px-3 py-1.5">{dataBR(r.data)}</td><td className="px-3 py-1.5 text-texto">{r.cliente}</td><td className="px-3 py-1.5">{tipoLabel(r.tipo)}</td><td className="px-3 py-1.5 text-right tabular-nums">{brl(r.valor)}</td><td className="px-3 py-1.5">{r.forma}</td><td className="px-3 py-1.5">{r.conta}</td><td className="px-3 py-1.5">{r.descricao}</td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar** — `npm test -- extrato-render` → PASS.

- [ ] **Step 5: `extrato/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { Extrato } from "./Extrato";
import { listarCategoriasFiltro, listarLancamentos } from "./extrato-actions";

export default async function ExtratoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const inicio = `${hoje.slice(0, 7)}-01`;
  const fim = `${hoje.slice(0, 7)}-${String(ultimo).padStart(2, "0")}`;
  const [categorias, lancamentosIni] = await Promise.all([listarCategoriasFiltro(), listarLancamentos(inicio, fim, "todos", null)]);
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4">
      <PageHeader titulo="Extrato / movimentações" subtitulo="Lançamentos e baixas, com export CSV" />
      <Extrato categorias={categorias} inicio={inicio} fim={fim} lancamentosIni={lancamentosIni} />
    </main>
  );
}
```

- [ ] **Step 6: Cartão no hub** — em `src/app/(app)/financeiro/relatorios/page.tsx`, trocar o array `RELATORIOS` por:
```tsx
const RELATORIOS = [
  { href: "/financeiro/relatorios/dre", label: "DRE", desc: "Demonstração de Resultado por período." },
  { href: "/financeiro/relatorios/extrato", label: "Extrato / movimentações", desc: "Lançamentos e baixas com filtros e export CSV." },
];
```

- [ ] **Step 7: Suite completa** — `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde; rota `/financeiro/relatorios/extrato` compila).

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/financeiro/relatorios/extrato" "src/app/(app)/financeiro/relatorios/page.tsx" src/tests/financeiro/extrato-render.test.tsx
git commit -m "feat(financeiro): tela do extrato (lançamentos/baixas) + CSV + cartão no hub

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Financeiro — Extrato/movimentações:** novo relatório em `/financeiro/relatorios/extrato` (no hub de
  Relatórios) que alterna entre **Lançamentos** (títulos) e **Baixas**, com filtros (período, tipo,
  categoria, busca por cliente) e **exportação em CSV**.
```

- [ ] **Step 2: Commit + finalizar**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog do extrato/CSV

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois usar `superpowers:finishing-a-development-branch`. (Sem migration/segredos.)

---

## Self-Review

- **Cobertura do spec:** `paraCSV` (T1) ✓; actions `listarLancamentos`/`listarBaixas`/`listarCategoriasFiltro` (T2) ✓; UI 2 visões + filtros + busca cliente + CSV + cartão no hub (T3) ✓; CHANGELOG (T4) ✓. Unit (T1) + smoke (T3).
- **Placeholders:** nenhum — todo passo tem código concreto.
- **Consistência de tipos:** `TipoFiltro`/`LancamentoRow`/`BaixaRow` (T2) usados por `Extrato` (T3); `paraCSV` (T1) chamado no export; `formatarMoeda` reutilizado. Página passa `categorias`/`inicio`/`fim`/`lancamentosIni` batendo com as props do `Extrato`. `listarLancamentos(inicio, fim, tipo, categoriaId|null)` — o componente passa `c || null`.
- **Segurança:** gate `podeGerenciarFinanceiro` nas actions; CSV é gerado no cliente a partir de linhas já autorizadas.
- **Escopo:** só o extrato (2 visões + CSV). Fluxo detalhado fora.
