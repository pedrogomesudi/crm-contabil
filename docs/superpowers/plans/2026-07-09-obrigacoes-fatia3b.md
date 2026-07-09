# Obrigações — Fatia 3B (Suspensão/retroativos + Conformidade) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suspender obrigações de clientes inativos, permitir gerar meses retroativos em lote, e um relatório de conformidade por competência (agregado + por cliente).

**Architecture:** Filtros `clientes.status='ativo'` nas telas de nag + motor; action de backfill que itera o motor mês a mês; helper puro de conformidade + action + página com CSV. Sem migration. Spec: `docs/superpowers/specs/2026-07-09-obrigacoes-fatia3b-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase, Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`.
- Gate: geração/retroativo/relatório = `podeCriarCliente`; botões de lote = admin (`podeGerenciarMatriz`).
- Suspensão só nas telas de **agregação** (calendário geral, riscos, escalonamento); a ficha do cliente mostra sempre. Conformidade é histórica (não filtra inativos).
- Conformidade mede "no prazo × atraso" pelo **vencimento legal**.
- **Sem migration.**
- Branch: `git checkout -b feat/obrigacoes-fatia3b develop`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Deploy (pós-merge):** `develop → main → Implantar`; confirmar pelo histórico do EasyPanel (entrada azul→verde) e `curl` da rota nova (307).

---

## File Structure

- `src/lib/obrigacoes/motor.ts` — **modificar**: filtro `status='ativo'`.
- `src/app/(app)/obrigacoes/actions.ts` — **modificar**: suspensão em `listarInstancias`/`listarRiscos`/`contarRiscos`; add `gerarRetroativo`.
- `src/app/(app)/obrigacoes/escalonamento-actions.ts` — **modificar**: suspensão em `coletar`.
- `src/lib/obrigacoes/retroativo.ts` (+ test) — **novo**: range de meses.
- `src/app/(app)/obrigacoes/GerarRetroativo.tsx` — **novo**: botão/form de backfill (compartilhado).
- `src/app/(app)/obrigacoes/Calendario.tsx` + `clientes/[id]/ObrigacoesCliente.tsx` — **modificar**: usar `GerarRetroativo` + link Conformidade.
- `src/lib/obrigacoes/conformidade.ts` (+ test) — **novo**: helper.
- `src/app/(app)/obrigacoes/conformidade-actions.ts` — **novo**: action.
- `src/app/(app)/obrigacoes/conformidade/page.tsx` + `RelatorioConformidade.tsx` (+ smoke) — **novo**: UI.

---

## Task 1: Suspensão de inativos

**Files:**
- Modify: `src/lib/obrigacoes/motor.ts`
- Modify: `src/app/(app)/obrigacoes/actions.ts`
- Modify: `src/app/(app)/obrigacoes/escalonamento-actions.ts`

- [ ] **Step 1: Motor pula inativos** — em `motor.ts`, na query de clientes, acrescentar `.eq("status", "ativo")`:
```ts
  let q = supabase.from("clientes").select("id, tipo_pessoa, regime_tributario, cnae, inscricao_estadual, inscricao_municipal, contador_id, endereco, clientes_financeiro(qtd_funcionarios)").is("excluido_em", null).eq("status", "ativo");
```

- [ ] **Step 2: `listarInstancias` esconde inativos (só na agregação)** — em `actions.ts`, no `.select(...)` trocar `clientes(razao_social)` por `clientes!inner(razao_social)`; e o bloco de filtro:
```ts
  if (opts?.clienteId) q = q.eq("cliente_id", opts.clienteId);
  else q = q.eq("clientes.status", "ativo");
```
(quando é a ficha de um cliente específico, mostra sempre; no calendário geral, só ativos.)

- [ ] **Step 3: `listarRiscos` e `contarRiscos` escondem inativos** — em `actions.ts`:
  - `listarRiscos`: no select trocar `clientes(razao_social)` por `clientes!inner(razao_social)` e acrescentar `.eq("clientes.status", "ativo")` à query.
  - `contarRiscos`: trocar `.select("vencimento_interno")` por `.select("vencimento_interno, clientes!inner(id)")` e acrescentar `.eq("clientes.status", "ativo")`.

- [ ] **Step 4: Escalonamento esconde inativos** — em `escalonamento-actions.ts`, na query de instâncias do `coletar`, trocar `clientes(razao_social)` por `clientes!inner(razao_social)` e acrescentar `.eq("clientes.status", "ativo")`.

- [ ] **Step 5: Verificar + commit** — `npm run lint && npm run typecheck && npm test && npm run build`.
```bash
git add src/lib/obrigacoes/motor.ts "src/app/(app)/obrigacoes/actions.ts" "src/app/(app)/obrigacoes/escalonamento-actions.ts"
git commit -m "feat(obrigacoes): suspende inativos (geração + telas de nag)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Retroativo — range de meses (TDD) + action

**Files:**
- Create: `src/lib/obrigacoes/retroativo.ts`
- Test: `src/tests/obrigacoes/retroativo.test.ts`
- Modify: `src/app/(app)/obrigacoes/actions.ts`

**Interfaces:**
- Produces: `mesesAte(anoIni, mesIni, anoFim, mesFim, max?)`; `gerarRetroativo(anoIni, mesIni, clienteId?)`.

- [ ] **Step 1: Testes do helper**

```ts
import { describe, it, expect } from "vitest";
import { mesesAte } from "@/lib/obrigacoes/retroativo";

describe("mesesAte", () => {
  it("lista o intervalo inclusive", () => {
    expect(mesesAte(2026, 4, 2026, 7)).toEqual([
      { ano: 2026, mes: 4 }, { ano: 2026, mes: 5 }, { ano: 2026, mes: 6 }, { ano: 2026, mes: 7 },
    ]);
  });
  it("atravessa a virada de ano", () => {
    expect(mesesAte(2025, 11, 2026, 1)).toEqual([
      { ano: 2025, mes: 11 }, { ano: 2025, mes: 12 }, { ano: 2026, mes: 1 },
    ]);
  });
  it("início depois do fim → só o fim", () => {
    expect(mesesAte(2026, 9, 2026, 7)).toEqual([{ ano: 2026, mes: 7 }]);
  });
  it("limita aos últimos `max` meses", () => {
    const r = mesesAte(2020, 1, 2026, 1, 24);
    expect(r.length).toBe(24);
    expect(r[r.length - 1]).toEqual({ ano: 2026, mes: 1 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- obrigacoes/retroativo` → FAIL.

- [ ] **Step 3: Implementar `retroativo.ts`**

```ts
export function mesesAte(anoIni: number, mesIni: number, anoFim: number, mesFim: number, max = 24): { ano: number; mes: number }[] {
  let a = anoIni;
  let m = mesIni;
  if (a * 12 + m > anoFim * 12 + mesFim) {
    a = anoFim;
    m = mesFim;
  }
  const out: { ano: number; mes: number }[] = [];
  while (a * 12 + m <= anoFim * 12 + mesFim) {
    out.push({ ano: a, mes: m });
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return out.length > max ? out.slice(out.length - max) : out;
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- obrigacoes/retroativo` (PASS), `npm run lint`, `npm run typecheck`.

- [ ] **Step 5: Action `gerarRetroativo`** — em `actions.ts` (usa `gate` e `gerarInstancias` já importados; importar `mesesAte`):
```ts
import { mesesAte } from "@/lib/obrigacoes/retroativo";

export async function gerarRetroativo(anoIni: number, mesIni: number, clienteId?: string): Promise<{ meses: number; candidatas: number } | null> {
  if (!(await gate())) return null;
  const supabase = await createServerSupabase();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const anoAtual = Number(hoje.slice(0, 4));
  const mesAtual = Number(hoje.slice(5, 7));
  const meses = mesesAte(anoIni, mesIni, anoAtual, mesAtual);
  let candidatas = 0;
  for (const { ano, mes } of meses) {
    const r = await gerarInstancias(supabase, ano, mes, clienteId);
    candidatas += r.candidatas;
  }
  return { meses: meses.length, candidatas };
}
```

- [ ] **Step 6: Commit**
```bash
git add src/lib/obrigacoes/retroativo.ts src/tests/obrigacoes/retroativo.test.ts "src/app/(app)/obrigacoes/actions.ts"
git commit -m "feat(obrigacoes): geração retroativa em lote (mesesAte + gerarRetroativo)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: UI do retroativo

**Files:**
- Create: `src/app/(app)/obrigacoes/GerarRetroativo.tsx`
- Modify: `src/app/(app)/obrigacoes/Calendario.tsx`
- Modify: `src/app/(app)/clientes/[id]/ObrigacoesCliente.tsx`

**Interfaces:**
- Consumes: `gerarRetroativo` (Task 2).

- [ ] **Step 1: `GerarRetroativo.tsx`**

```tsx
"use client";
import { useState } from "react";
import { gerarRetroativo } from "./actions";

const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function GerarRetroativo({ clienteId, anoAtual, onDone }: { clienteId?: string; anoAtual: number; onDone: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function gerar() {
    setBusy(true);
    setMsg("");
    const r = await gerarRetroativo(ano, mes, clienteId);
    setBusy(false);
    if (r) {
      setMsg(`${r.meses} mês(es) processado(s).`);
      setAberto(false);
      onDone();
    } else setMsg("Sem permissão.");
  }
  const anos = Array.from({ length: 5 }, (_, i) => anoAtual - i);
  const inp = "rounded-lg border border-linha px-2 py-1 text-sm";
  return (
    <span className="flex items-center gap-2">
      <button type="button" onClick={() => setAberto((v) => !v)} className="rounded-lg border border-linha px-3 py-1.5 text-sm">Gerar retroativo</button>
      {aberto && (
        <span className="flex items-center gap-1">
          <span className="text-xs text-cinza">de</span>
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className={inp}>{MES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className={inp}>{anos.map((a) => <option key={a} value={a}>{a}</option>)}</select>
          <button type="button" disabled={busy} onClick={gerar} className="rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white">Gerar até hoje</button>
        </span>
      )}
      {msg && <span className="text-xs text-cinza">{msg}</span>}
    </span>
  );
}
```

- [ ] **Step 2: Usar no calendário** — em `Calendario.tsx`: importar `GerarRetroativo`; ao lado do botão "Gerar competência" (dentro do bloco `{podeGerar && ...}`), renderizar `<GerarRetroativo anoAtual={ano} onDone={() => recarregar(ano, mes)} />`. (Usa o `ano` do estado como padrão inicial do seletor.)

- [ ] **Step 3: Usar na ficha** — em `ObrigacoesCliente.tsx`: importar `GerarRetroativo`; quando `podeGerar`, ao lado de "Gerar para este cliente", renderizar `<GerarRetroativo clienteId={clienteId} anoAtual={ano} onDone={recarregar} />`.

- [ ] **Step 4: Verificar + commit** — `npm run lint && npm run typecheck && npm test && npm run build`.
```bash
git add "src/app/(app)/obrigacoes/GerarRetroativo.tsx" "src/app/(app)/obrigacoes/Calendario.tsx" "src/app/(app)/clientes/[id]/ObrigacoesCliente.tsx"
git commit -m "feat(obrigacoes): botão de geração retroativa (calendário + ficha)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Conformidade — helper (TDD) + action

**Files:**
- Create: `src/lib/obrigacoes/conformidade.ts`
- Test: `src/tests/obrigacoes/conformidade.test.ts`
- Create: `src/app/(app)/obrigacoes/conformidade-actions.ts`

**Interfaces:**
- Produces: `type StatusConformidade`, `classificarConformidade`, `type ResumoConformidade`, `resumirConformidade`; `type LinhaConformidade`, `type RelatorioConformidade`, `relatorioConformidade`.

- [ ] **Step 1: Testes do helper**

```ts
import { describe, it, expect } from "vitest";
import { classificarConformidade, resumirConformidade } from "@/lib/obrigacoes/conformidade";

const hoje = "2026-07-15";
describe("classificarConformidade", () => {
  it("entregue no dia = no prazo; depois = com atraso", () => {
    expect(classificarConformidade({ status: "pendente", entregueEm: "2026-07-10", vencimentoLegal: "2026-07-10" }, hoje)).toBe("no_prazo");
    expect(classificarConformidade({ status: "pendente", entregueEm: "2026-07-12", vencimentoLegal: "2026-07-10" }, hoje)).toBe("com_atraso");
  });
  it("pendente vencida vs no prazo", () => {
    expect(classificarConformidade({ status: "pendente", entregueEm: null, vencimentoLegal: "2026-07-14" }, hoje)).toBe("pendente_vencida");
    expect(classificarConformidade({ status: "pendente", entregueEm: null, vencimentoLegal: "2026-07-16" }, hoje)).toBe("pendente_no_prazo");
  });
  it("dispensada", () => {
    expect(classificarConformidade({ status: "dispensada", entregueEm: null, vencimentoLegal: "2026-07-01" }, hoje)).toBe("dispensada");
  });
});

describe("resumirConformidade", () => {
  it("conta e calcula % (dispensadas fora da base)", () => {
    const itens = [
      { status: "pendente", entregueEm: "2026-07-10", vencimentoLegal: "2026-07-10" }, // no prazo
      { status: "pendente", entregueEm: "2026-07-12", vencimentoLegal: "2026-07-10" }, // com atraso
      { status: "pendente", entregueEm: null, vencimentoLegal: "2026-07-14" }, // vencida
      { status: "dispensada", entregueEm: null, vencimentoLegal: "2026-07-01" }, // dispensada
    ];
    const r = resumirConformidade(itens, hoje);
    expect(r.total).toBe(4);
    expect(r.noPrazo).toBe(1);
    expect(r.comAtraso).toBe(1);
    expect(r.pendenteVencida).toBe(1);
    expect(r.dispensada).toBe(1);
    expect(r.pctConformidade).toBe(33); // 1 / (4-1) = 33%
  });
  it("base zero → 100", () => {
    expect(resumirConformidade([{ status: "dispensada", entregueEm: null, vencimentoLegal: "2026-01-01" }], hoje).pctConformidade).toBe(100);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- obrigacoes/conformidade` → FAIL.

- [ ] **Step 3: Implementar `conformidade.ts`**

```ts
export type StatusConformidade = "no_prazo" | "com_atraso" | "pendente_vencida" | "pendente_no_prazo" | "dispensada";
type Inst = { status: string; entregueEm: string | null; vencimentoLegal: string };

export function classificarConformidade(inst: Inst, hoje: string): StatusConformidade {
  if (inst.status === "dispensada") return "dispensada";
  if (inst.entregueEm !== null) return inst.entregueEm <= inst.vencimentoLegal ? "no_prazo" : "com_atraso";
  return inst.vencimentoLegal < hoje ? "pendente_vencida" : "pendente_no_prazo";
}

export type ResumoConformidade = { total: number; noPrazo: number; comAtraso: number; pendenteVencida: number; pendenteNoPrazo: number; dispensada: number; pctConformidade: number };

export function resumirConformidade(itens: Inst[], hoje: string): ResumoConformidade {
  const r: ResumoConformidade = { total: itens.length, noPrazo: 0, comAtraso: 0, pendenteVencida: 0, pendenteNoPrazo: 0, dispensada: 0, pctConformidade: 100 };
  for (const it of itens) {
    const c = classificarConformidade(it, hoje);
    if (c === "no_prazo") r.noPrazo += 1;
    else if (c === "com_atraso") r.comAtraso += 1;
    else if (c === "pendente_vencida") r.pendenteVencida += 1;
    else if (c === "pendente_no_prazo") r.pendenteNoPrazo += 1;
    else r.dispensada += 1;
  }
  const base = r.total - r.dispensada;
  r.pctConformidade = base > 0 ? Math.round((r.noPrazo / base) * 100) : 100;
  return r;
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- obrigacoes/conformidade` (PASS), `npm run lint`, `npm run typecheck`.

- [ ] **Step 5: Action `conformidade-actions.ts`**

```ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { resumirConformidade, type ResumoConformidade } from "@/lib/obrigacoes/conformidade";

export type LinhaConformidade = { clienteNome: string; resumo: ResumoConformidade };
export type RelatorioConformidade = { geral: ResumoConformidade; porCliente: LinhaConformidade[] };

type Inst = { status: string; entregueEm: string | null; vencimentoLegal: string };
const um = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return null;
  return p;
}

export async function relatorioConformidade(ano: number, mes: number | null): Promise<RelatorioConformidade> {
  const vazio: RelatorioConformidade = { geral: { total: 0, noPrazo: 0, comAtraso: 0, pendenteVencida: 0, pendenteNoPrazo: 0, dispensada: 0, pctConformidade: 100 }, porCliente: [] };
  if (!(await gate())) return vazio;
  const supabase = await createServerSupabase();
  const ini = mes ? `${ano}-${String(mes).padStart(2, "0")}-01` : `${ano}-01-01`;
  const fim = mes ? `${ano}-${String(mes).padStart(2, "0")}-${String(new Date(Date.UTC(ano, mes, 0)).getUTCDate()).padStart(2, "0")}` : `${ano}-12-31`;
  const { data } = await supabase.from("obrigacao_instancia").select("status, entregue_em, vencimento_legal, clientes(razao_social)").gte("competencia", ini).lte("competencia", fim);
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const todas: Inst[] = [];
  const porClienteMap = new Map<string, Inst[]>();
  for (const r of data ?? []) {
    const cl = um(r.clientes as { razao_social?: string } | { razao_social?: string }[] | null);
    const nome = cl?.razao_social ?? "—";
    const inst: Inst = { status: r.status as string, entregueEm: (r.entregue_em as string | null) ?? null, vencimentoLegal: r.vencimento_legal as string };
    todas.push(inst);
    const arr = porClienteMap.get(nome) ?? [];
    arr.push(inst);
    porClienteMap.set(nome, arr);
  }
  const porCliente: LinhaConformidade[] = [...porClienteMap.entries()].map(([clienteNome, itens]) => ({ clienteNome, resumo: resumirConformidade(itens, hoje) }));
  porCliente.sort((a, b) => a.resumo.pctConformidade - b.resumo.pctConformidade);
  return { geral: resumirConformidade(todas, hoje), porCliente };
}
```

- [ ] **Step 6: Commit**
```bash
git add src/lib/obrigacoes/conformidade.ts src/tests/obrigacoes/conformidade.test.ts "src/app/(app)/obrigacoes/conformidade-actions.ts"
git commit -m "feat(obrigacoes): helper e action de conformidade (TDD)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: UI do relatório de conformidade

**Files:**
- Create: `src/app/(app)/obrigacoes/conformidade/page.tsx`
- Create: `src/app/(app)/obrigacoes/conformidade/RelatorioConformidade.tsx`
- Modify: `src/app/(app)/obrigacoes/Calendario.tsx` (link)
- Test: `src/tests/obrigacoes/conformidade-render.test.tsx`

**Interfaces:**
- Consumes: `relatorioConformidade`, `RelatorioConformidade` (Task 4); `paraCSV`.

- [ ] **Step 1: Smoke**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/obrigacoes/conformidade-actions", () => ({ relatorioConformidade: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { RelatorioConformidade } from "@/app/(app)/obrigacoes/conformidade/RelatorioConformidade";
import type { RelatorioConformidade as Rel } from "@/app/(app)/obrigacoes/conformidade-actions";

const dados: Rel = {
  geral: { total: 4, noPrazo: 1, comAtraso: 1, pendenteVencida: 1, pendenteNoPrazo: 0, dispensada: 1, pctConformidade: 33 },
  porCliente: [{ clienteNome: "ACME LTDA", resumo: { total: 4, noPrazo: 1, comAtraso: 1, pendenteVencida: 1, pendenteNoPrazo: 0, dispensada: 1, pctConformidade: 33 } }],
};

describe("RelatorioConformidade", () => {
  it("mostra o % geral e a linha do cliente", () => {
    const html = renderToStaticMarkup(<RelatorioConformidade ano={2026} mes={7} dados={dados} />);
    expect(html).toContain("33%");
    expect(html).toContain("ACME LTDA");
    expect(html).toContain("Exportar CSV");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- obrigacoes/conformidade-render` → FAIL.

- [ ] **Step 3: `RelatorioConformidade.tsx`**

```tsx
"use client";
import { useState } from "react";
import { paraCSV } from "@/lib/financeiro/csv";
import { relatorioConformidade, type RelatorioConformidade as Rel } from "../conformidade-actions";

const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const corPct = (p: number) => (p < 70 ? "text-negativo" : p < 90 ? "text-texto" : "text-verde");

function baixar(nome: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export function RelatorioConformidade({ ano: anoIni, mes: mesIni, dados: dadosIni }: { ano: number; mes: number; dados: Rel }) {
  const [ano, setAno] = useState(anoIni);
  const [mes, setMes] = useState(mesIni); // 0 = ano inteiro
  const [dados, setDados] = useState(dadosIni);
  const anos = Array.from({ length: 5 }, (_, i) => anoIni + 1 - i);

  async function recarregar(a: number, m: number) {
    setAno(a);
    setMes(m);
    setDados(await relatorioConformidade(a, m === 0 ? null : m));
  }

  function exportar() {
    const linha = (nome: string, r: Rel["geral"]) => [nome, String(r.total), String(r.noPrazo), String(r.comAtraso), String(r.pendenteVencida), String(r.pendenteNoPrazo), String(r.dispensada), `${r.pctConformidade}%`];
    const csv = paraCSV(
      ["Cliente", "Total", "No prazo", "Com atraso", "Pendente vencida", "Pendente no prazo", "Dispensada", "% conformidade"],
      [linha("GERAL", dados.geral), ...dados.porCliente.map((l) => linha(l.clienteNome, l.resumo))],
    );
    baixar(`conformidade-${ano}${mes ? "-" + String(mes).padStart(2, "0") : ""}.csv`, csv);
  }

  const g = dados.geral;
  const card = "rounded-2xl border border-linha bg-white p-3 text-center";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <select value={mes} onChange={(e) => recarregar(ano, Number(e.target.value))} className="rounded-lg border border-linha px-2 py-1 text-sm">
          <option value={0}>Ano inteiro</option>
          {MES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={ano} onChange={(e) => recarregar(Number(e.target.value), mes)} className="rounded-lg border border-linha px-2 py-1 text-sm">
          {anos.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={exportar} className="rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white">Exportar CSV</button>
          <button type="button" onClick={() => window.print()} className="rounded-lg border border-linha px-3 py-1.5 text-sm">Imprimir</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <div className={card}><div className={`text-2xl font-bold ${corPct(g.pctConformidade)}`}>{g.pctConformidade}%</div><div className="text-xs text-cinza">Conformidade</div></div>
        <div className={card}><div className="text-2xl font-bold text-texto">{g.total}</div><div className="text-xs text-cinza">Total</div></div>
        <div className={card}><div className="text-2xl font-bold text-verde">{g.noPrazo}</div><div className="text-xs text-cinza">No prazo</div></div>
        <div className={card}><div className="text-2xl font-bold text-negativo">{g.comAtraso}</div><div className="text-xs text-cinza">Com atraso</div></div>
        <div className={card}><div className="text-2xl font-bold text-negativo">{g.pendenteVencida}</div><div className="text-xs text-cinza">Pend. vencida</div></div>
        <div className={card}><div className="text-2xl font-bold text-cinza">{g.dispensada}</div><div className="text-xs text-cinza">Dispensada</div></div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-left text-xs text-cinza">
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 text-right font-medium">No prazo</th>
              <th className="px-3 py-2 text-right font-medium">Com atraso</th>
              <th className="px-3 py-2 text-right font-medium">Pend. vencida</th>
              <th className="px-3 py-2 text-right font-medium">Dispensada</th>
              <th className="px-3 py-2 text-right font-medium">% conf.</th>
            </tr>
          </thead>
          <tbody>
            {dados.porCliente.length === 0 && <tr><td colSpan={7} className="px-3 py-3 text-cinza">Sem obrigações no período.</td></tr>}
            {dados.porCliente.map((l) => (
              <tr key={l.clienteNome} className="border-b border-linha/60">
                <td className="px-3 py-1.5 text-texto">{l.clienteNome}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{l.resumo.total}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{l.resumo.noPrazo}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{l.resumo.comAtraso}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{l.resumo.pendenteVencida}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{l.resumo.dispensada}</td>
                <td className={`px-3 py-1.5 text-right font-medium tabular-nums ${corPct(l.resumo.pctConformidade)}`}>{l.resumo.pctConformidade}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar** — `npm test -- obrigacoes/conformidade-render` → PASS.

- [ ] **Step 5: `conformidade/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { RelatorioConformidade } from "./RelatorioConformidade";
import { relatorioConformidade } from "../conformidade-actions";

export default async function ConformidadePage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const dados = await relatorioConformidade(ano, mes);
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4">
      <PageHeader titulo="Conformidade" subtitulo="Entregas por competência — no prazo, com atraso, pendentes" />
      <RelatorioConformidade ano={ano} mes={mes} dados={dados} />
    </main>
  );
}
```

- [ ] **Step 6: Link no calendário** — em `Calendario.tsx`, ao lado de "Escalonamento": `<a href="/obrigacoes/conformidade" className="rounded-lg border border-linha px-3 py-1.5 text-sm">Conformidade</a>`.

- [ ] **Step 7: Rodar tudo** — `npm run lint && npm run typecheck && npm test && npm run build`.

- [ ] **Step 8: Commit**
```bash
git add "src/app/(app)/obrigacoes/conformidade" "src/app/(app)/obrigacoes/Calendario.tsx" src/tests/obrigacoes/conformidade-render.test.tsx
git commit -m "feat(obrigacoes): relatório de conformidade (página + CSV + link)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Obrigações e Compliance (Fatia 3B):** clientes **inativos** deixam de gerar obrigações e somem das
  telas de risco/escalonamento/calendário (voltam ao reativar); **geração retroativa em lote** (backfill
  de um mês inicial até o atual, no calendário e na ficha); **relatório de conformidade**
  (`/obrigacoes/conformidade`) por competência, com % de conformidade, quebra por cliente, CSV e impressão.
```

- [ ] **Step 2: Commit + finalizar**
```bash
git add CHANGELOG.md
git commit -m "docs: changelog da Fatia 3B de Obrigações

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois: `superpowers:finishing-a-development-branch`. **Deploy:** `develop → main` + push + Implantar + validar `/obrigacoes/conformidade` (307).

---

## Self-Review

- **Cobertura do spec:** suspensão no motor + telas de nag, ficha exposta (T1) ✓; retroativo range + action (T2) + UI (T3) ✓; conformidade helper+action (T4) + UI/CSV/link (T5) ✓; changelog (T6) ✓. Unit (T2/T4) + smoke (T5).
- **Placeholders:** nenhum — todo passo tem código.
- **Consistência de tipos:** `mesesAte` (T2) usado em `gerarRetroativo` (T2) e `GerarRetroativo` (T3); `StatusConformidade`/`ResumoConformidade` (T4) em `resumirConformidade`/action; `RelatorioConformidade`/`LinhaConformidade` (T4) em `RelatorioConformidade.tsx` e página (T5). `relatorioConformidade(ano, mes|null)` — a UI passa `mes === 0 ? null : mes`.
- **Segurança:** gates `podeCriarCliente` (relatório/retroativo) e `podeGerenciarMatriz` (botões de lote); suspensão via filtro de status; conformidade respeita a RLS (contador vê os seus).
- **Escopo:** fecha o módulo (RF-036 + RF-037). Sem migration.
