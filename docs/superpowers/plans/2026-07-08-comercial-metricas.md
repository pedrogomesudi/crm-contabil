# Comercial — métricas/relatórios do funil Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard do funil comercial — pipeline atual e fechamentos por período (mês/trimestre/semestre/ano) com taxa de conversão, por responsável e motivos de perda.

**Architecture:** Coluna `fechado_em` data os fechamentos; a tela carrega todas as oportunidades e calcula tudo em helpers puros no cliente (navegação de período sem re-fetch). Spec: `docs/superpowers/specs/2026-07-08-comercial-metricas-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase, Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`. Todos passam.
- Migration idempotente via `npm run db:migrate` (banco compartilhado, atinge prod). Imutável após aplicada.
- Gate `podeCriarCliente`; RLS de `oportunidade` por papel. Tokens SALDO na UI.
- Datas puras/bounds via `Date.UTC`; `hoje` em SP (`toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })`).
- Branch: `git checkout -b feat/comercial-metricas develop`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `supabase/migrations/0056_comercial_fechado_em.sql` — **novo**: coluna + backfill.
- `src/app/(app)/comercial/actions.ts` — **modificar**: `fechado_em` em `definirEtapa`; `criadoEm`/`fechadoEm` na view.
- `src/lib/comercial/metricas.ts` — **novo**: `periodoBounds`, `metricasFunil`.
- `src/tests/comercial/metricas.test.ts` — **novo**.
- `src/app/(app)/comercial/MetricasFunil.tsx` — **novo**: dashboard (client).
- `src/app/(app)/comercial/metricas/page.tsx` — **novo**: página (server).
- `src/app/(app)/comercial/QuadroComercial.tsx` — **modificar**: link "Métricas".
- `src/tests/comercial/metricas-render.test.tsx` — **novo**: smoke.
- `src/tests/comercial/quadro-render.test.tsx` — **modificar**: fixture ganha `criadoEm`/`fechadoEm`.

---

## Task 1: Migration — coluna fechado_em

**Files:**
- Create: `supabase/migrations/0056_comercial_fechado_em.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Métricas do funil: data de fechamento (ganho/perdido) para filtrar por período.
alter table oportunidade add column if not exists fechado_em timestamptz;
update oportunidade set fechado_em = atualizado_em
  where etapa in ('ganho','perdido') and fechado_em is null;
```

- [ ] **Step 2: Aplicar e verificar**

Run: `npm run db:migrate`
Expected: "1 migration(s) nova(s) aplicada(s)."
```bash
node --env-file=.env.local -e "import('./scripts/_db.mjs').then(async({makeClient})=>{const c=makeClient();await c.connect();const r=await c.query(\"select column_name from information_schema.columns where table_name='oportunidade' and column_name='fechado_em'\");console.log('coluna:', r.rows[0]?.column_name ?? 'FALTANDO');await c.end();});"
```
Expected: `coluna: fechado_em`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0056_comercial_fechado_em.sql
git commit -m "feat(comercial): coluna fechado_em na oportunidade (métricas)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: definirEtapa data o fechamento + view ganha datas

**Files:**
- Modify: `src/app/(app)/comercial/actions.ts`
- Test: `src/tests/comercial/quadro-render.test.tsx`

**Interfaces:**
- Consumes: `oportunidade.fechado_em` (Task 1).
- Produces: `OportunidadeView` com `criadoEm: string; fechadoEm: string | null`.

- [ ] **Step 1: `OportunidadeView` ganha as datas**

Na definição de `OportunidadeView`, acrescentar antes do `}` final: `; criadoEm: string; fechadoEm: string | null`.
Concretamente, trocar `...clienteId: string | null; meu: boolean };` por
`...clienteId: string | null; meu: boolean; criadoEm: string; fechadoEm: string | null };`.

- [ ] **Step 2: `listarOportunidades` — trazer e mapear**

No `SELECT` de `listarOportunidades`, acrescentar `criado_em, fechado_em` (após `cliente_id`).
No `.map(...)`, acrescentar ao objeto (após `meu: r.responsavel_id === p.id,`):
```ts
    criadoEm: r.criado_em as string,
    fechadoEm: (r.fechado_em as string | null) ?? null,
```

- [ ] **Step 3: `definirEtapa` grava/limpa `fechado_em`**

No corpo de `definirEtapa`, logo após `const patch: Record<string, unknown> = { etapa, atualizado_em: new Date().toISOString() };`, acrescentar:
```ts
  patch.fechado_em = etapa === "ganho" || etapa === "perdido" ? new Date().toISOString() : null;
```

- [ ] **Step 4: Atualizar o fixture do smoke do quadro**

Em `src/tests/comercial/quadro-render.test.tsx`, nos dois objetos de `ops`, acrescentar antes do `}` de cada um: `, criadoEm: "2026-07-01T12:00:00.000Z", fechadoEm: null`. (No item `etapa: "ganho"`, usar `fechadoEm: "2026-07-05T12:00:00.000Z"`.)

- [ ] **Step 5: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde).
```bash
git add "src/app/(app)/comercial/actions.ts" src/tests/comercial/quadro-render.test.tsx
git commit -m "feat(comercial): definirEtapa data o fechamento + datas na view

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Helpers puros de métricas (TDD)

**Files:**
- Create: `src/lib/comercial/metricas.ts`
- Test: `src/tests/comercial/metricas.test.ts`

**Interfaces:**
- Consumes: `EtapaOportunidade` (`@/lib/comercial/funil`).
- Produces: `type Granularidade`; `periodoBounds(g, hojeIso, offset)`; `type MetricasFunil`; `type OpMetrica`; `metricasFunil(ops, inicio, fim)`.

- [ ] **Step 1: Testes**

```ts
import { describe, it, expect } from "vitest";
import { periodoBounds, metricasFunil } from "@/lib/comercial/metricas";

describe("periodoBounds", () => {
  it("mês atual", () => {
    const r = periodoBounds("mes", "2026-07-08", 0);
    expect(r.inicio).toBe("2026-07-01T00:00:00.000Z");
    expect(r.fim).toBe("2026-08-01T00:00:00.000Z");
    expect(r.rotulo).toBe("Julho 2026");
  });
  it("mês anterior cruza o ano", () => {
    const r = periodoBounds("mes", "2026-01-10", -1);
    expect(r.inicio).toBe("2025-12-01T00:00:00.000Z");
    expect(r.rotulo).toBe("Dezembro 2025");
  });
  it("trimestre", () => {
    const r = periodoBounds("trimestre", "2026-07-08", 0);
    expect(r.inicio).toBe("2026-07-01T00:00:00.000Z");
    expect(r.fim).toBe("2026-10-01T00:00:00.000Z");
    expect(r.rotulo).toBe("3º trimestre 2026");
  });
  it("semestre", () => {
    const r = periodoBounds("semestre", "2026-07-08", 0);
    expect(r.inicio).toBe("2026-07-01T00:00:00.000Z");
    expect(r.fim).toBe("2027-01-01T00:00:00.000Z");
    expect(r.rotulo).toBe("2º semestre 2026");
  });
  it("ano com offset", () => {
    const r = periodoBounds("ano", "2026-07-08", -1);
    expect(r.inicio).toBe("2025-01-01T00:00:00.000Z");
    expect(r.fim).toBe("2026-01-01T00:00:00.000Z");
    expect(r.rotulo).toBe("2025");
  });
});

describe("metricasFunil", () => {
  const ops = [
    { etapa: "novo" as const, valorEstimado: 300, responsavelNome: "Ana", motivoPerda: null, fechadoEm: null },
    { etapa: "proposta" as const, valorEstimado: 500, responsavelNome: "Ana", motivoPerda: null, fechadoEm: null },
    { etapa: "ganho" as const, valorEstimado: 1000, responsavelNome: "Ana", motivoPerda: null, fechadoEm: "2026-07-10T00:00:00.000Z" },
    { etapa: "perdido" as const, valorEstimado: 200, responsavelNome: "Beto", motivoPerda: "Preço", fechadoEm: "2026-07-12T00:00:00.000Z" },
    { etapa: "ganho" as const, valorEstimado: 400, responsavelNome: "Beto", motivoPerda: null, fechadoEm: "2026-06-30T00:00:00.000Z" },
  ];
  const m = metricasFunil(ops, "2026-07-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z");
  it("pipeline ignora período", () => {
    expect(m.pipeline.total).toEqual({ qtd: 2, total: 800 });
    expect(m.pipeline.porEtapa.proposta).toEqual({ qtd: 1, total: 500 });
    expect(m.pipeline.porEtapa.negociacao).toEqual({ qtd: 0, total: 0 });
  });
  it("fechados no período + taxa", () => {
    expect(m.periodo.ganhos).toEqual({ qtd: 1, valor: 1000 });
    expect(m.periodo.perdidos).toEqual({ qtd: 1, valor: 200 });
    expect(m.periodo.taxaConversao).toBeCloseTo(0.5);
  });
  it("por responsável e motivos", () => {
    const ana = m.periodo.porResponsavel.find((r) => r.nome === "Ana");
    expect(ana).toEqual({ nome: "Ana", ganhos: 1, perdidos: 0, valorGanho: 1000 });
    expect(m.periodo.motivosPerda).toEqual([{ motivo: "Preço", qtd: 1 }]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- comercial/metricas` → FAIL.

- [ ] **Step 3: Implementar `metricas.ts`**

```ts
import type { EtapaOportunidade } from "./funil";

export type Granularidade = "mes" | "trimestre" | "semestre" | "ano";
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function periodoBounds(g: Granularidade, hojeIso: string, offset: number): { inicio: string; fim: string; rotulo: string } {
  const partes = hojeIso.split("-");
  const y = Number(partes[0]);
  const mes0 = Number(partes[1]) - 1;
  let inicioY: number, inicioM0: number, meses: number, rotulo: string;
  if (g === "mes") {
    const tot = y * 12 + mes0 + offset;
    inicioY = Math.floor(tot / 12); inicioM0 = ((tot % 12) + 12) % 12; meses = 1;
    rotulo = `${MESES[inicioM0]!} ${inicioY}`;
  } else if (g === "trimestre") {
    const tot = y * 12 + Math.floor(mes0 / 3) * 3 + offset * 3;
    inicioY = Math.floor(tot / 12); inicioM0 = ((tot % 12) + 12) % 12; meses = 3;
    rotulo = `${Math.floor(inicioM0 / 3) + 1}º trimestre ${inicioY}`;
  } else if (g === "semestre") {
    const tot = y * 12 + Math.floor(mes0 / 6) * 6 + offset * 6;
    inicioY = Math.floor(tot / 12); inicioM0 = ((tot % 12) + 12) % 12; meses = 6;
    rotulo = `${Math.floor(inicioM0 / 6) + 1}º semestre ${inicioY}`;
  } else {
    inicioY = y + offset; inicioM0 = 0; meses = 12;
    rotulo = `${inicioY}`;
  }
  const inicio = new Date(Date.UTC(inicioY, inicioM0, 1)).toISOString();
  const fim = new Date(Date.UTC(inicioY, inicioM0 + meses, 1)).toISOString();
  return { inicio, fim, rotulo };
}

export type OpMetrica = { etapa: EtapaOportunidade; valorEstimado: number | null; responsavelNome: string | null; motivoPerda: string | null; fechadoEm: string | null };
export type MetricasFunil = {
  pipeline: { total: { qtd: number; total: number }; porEtapa: Record<string, { qtd: number; total: number }> };
  periodo: {
    ganhos: { qtd: number; valor: number };
    perdidos: { qtd: number; valor: number };
    taxaConversao: number;
    porResponsavel: { nome: string; ganhos: number; perdidos: number; valorGanho: number }[];
    motivosPerda: { motivo: string; qtd: number }[];
  };
};

const ATIVAS = ["novo", "contato", "proposta", "negociacao"];

export function metricasFunil(ops: OpMetrica[], inicio: string, fim: string): MetricasFunil {
  const porEtapa: Record<string, { qtd: number; total: number }> = {};
  for (const e of ATIVAS) porEtapa[e] = { qtd: 0, total: 0 };
  let totQ = 0, totV = 0;
  for (const o of ops) {
    if (o.etapa === "ganho" || o.etapa === "perdido") continue;
    if (porEtapa[o.etapa]) { porEtapa[o.etapa]!.qtd += 1; porEtapa[o.etapa]!.total += o.valorEstimado ?? 0; }
    totQ += 1; totV += o.valorEstimado ?? 0;
  }
  const fechados = ops.filter((o) => (o.etapa === "ganho" || o.etapa === "perdido") && o.fechadoEm != null && o.fechadoEm >= inicio && o.fechadoEm < fim);
  const soma = (arr: OpMetrica[]) => arr.reduce((s, o) => s + (o.valorEstimado ?? 0), 0);
  const ganhosArr = fechados.filter((o) => o.etapa === "ganho");
  const perdidosArr = fechados.filter((o) => o.etapa === "perdido");
  const ganhos = { qtd: ganhosArr.length, valor: soma(ganhosArr) };
  const perdidos = { qtd: perdidosArr.length, valor: soma(perdidosArr) };
  const den = ganhos.qtd + perdidos.qtd;
  const taxaConversao = den > 0 ? ganhos.qtd / den : 0;
  const rmap = new Map<string, { nome: string; ganhos: number; perdidos: number; valorGanho: number }>();
  for (const o of fechados) {
    const nome = o.responsavelNome ?? "—";
    const r = rmap.get(nome) ?? { nome, ganhos: 0, perdidos: 0, valorGanho: 0 };
    if (o.etapa === "ganho") { r.ganhos += 1; r.valorGanho += o.valorEstimado ?? 0; } else r.perdidos += 1;
    rmap.set(nome, r);
  }
  const porResponsavel = [...rmap.values()].sort((a, b) => b.valorGanho - a.valorGanho);
  const mmap = new Map<string, number>();
  for (const o of perdidosArr) { const mo = o.motivoPerda ?? "Sem motivo"; mmap.set(mo, (mmap.get(mo) ?? 0) + 1); }
  const motivosPerda = [...mmap.entries()].map(([motivo, qtd]) => ({ motivo, qtd })).sort((a, b) => b.qtd - a.qtd);
  return { pipeline: { total: { qtd: totQ, total: totV }, porEtapa }, periodo: { ganhos, perdidos, taxaConversao, porResponsavel, motivosPerda } };
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- comercial/metricas` (PASS), `npm run lint`, `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comercial/metricas.ts src/tests/comercial/metricas.test.ts
git commit -m "feat(comercial): helpers de métricas do funil (periodoBounds, metricasFunil)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Tela de métricas + link

**Files:**
- Create: `src/app/(app)/comercial/MetricasFunil.tsx`
- Create: `src/app/(app)/comercial/metricas/page.tsx`
- Modify: `src/app/(app)/comercial/QuadroComercial.tsx`
- Test: `src/tests/comercial/metricas-render.test.tsx`

**Interfaces:**
- Consumes: `periodoBounds`, `metricasFunil`, `Granularidade` (Task 3); `ETAPAS_ATIVAS`, `rotuloEtapa` (funil); `listarOportunidades`, `OportunidadeView` (actions, com datas da Task 2).

- [ ] **Step 1: Smoke test**

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MetricasFunil } from "@/app/(app)/comercial/MetricasFunil";
import type { OportunidadeView } from "@/app/(app)/comercial/actions";

const ops: OportunidadeView[] = [
  { id: "1", prospectNome: "A", contatoNome: null, contatoTelefone: null, contatoEmail: null, origem: null, servicoInteresse: null, valorEstimado: 500, responsavelId: "u1", responsavelNome: "Ana", etapa: "proposta", observacoes: null, motivoPerda: null, clienteId: null, meu: true, criadoEm: "2026-07-01T00:00:00.000Z", fechadoEm: null },
  { id: "2", prospectNome: "B", contatoNome: null, contatoTelefone: null, contatoEmail: null, origem: null, servicoInteresse: null, valorEstimado: 1000, responsavelId: "u1", responsavelNome: "Ana", etapa: "ganho", observacoes: null, motivoPerda: null, clienteId: null, meu: true, criadoEm: "2026-07-01T00:00:00.000Z", fechadoEm: "2026-07-10T00:00:00.000Z" },
];

describe("MetricasFunil", () => {
  it("renderiza pipeline e período", () => {
    const html = renderToStaticMarkup(<MetricasFunil oportunidades={ops} hoje="2026-07-08" />);
    expect(html).toContain("Pipeline");
    expect(html).toContain("Taxa de conversão");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- metricas-render` → FAIL.

- [ ] **Step 3: `MetricasFunil.tsx`**

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { ETAPAS_ATIVAS, rotuloEtapa } from "@/lib/comercial/funil";
import { periodoBounds, metricasFunil, type Granularidade } from "@/lib/comercial/metricas";
import type { OportunidadeView } from "./actions";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const GRANS: { v: Granularidade; l: string }[] = [{ v: "mes", l: "Mês" }, { v: "trimestre", l: "Trimestre" }, { v: "semestre", l: "Semestre" }, { v: "ano", l: "Ano" }];

export function MetricasFunil({ oportunidades, hoje }: { oportunidades: OportunidadeView[]; hoje: string }) {
  const [gran, setGran] = useState<Granularidade>("mes");
  const [offset, setOffset] = useState(0);
  const { inicio, fim, rotulo } = periodoBounds(gran, hoje, offset);
  const m = metricasFunil(oportunidades, inicio, fim);
  const pct = `${Math.round(m.periodo.taxaConversao * 100)}%`;

  return (
    <div className="space-y-5">
      <Link href="/comercial" className="text-sm text-verde underline">← Funil</Link>

      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold text-texto">Pipeline atual</h2>
        <div className="rounded-2xl border border-linha bg-white p-4">
          <p className="text-sm text-cinza">Em aberto: <span className="font-medium text-texto tabular-nums">{m.pipeline.total.qtd}</span> · <span className="font-medium text-texto tabular-nums">{brl(m.pipeline.total.total)}</span></p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ETAPAS_ATIVAS.map((e) => (
              <div key={e.chave} className="rounded-lg bg-creme px-2 py-1.5">
                <div className="text-[11px] uppercase tracking-wide text-cinza">{e.rotulo}</div>
                <div className="text-sm text-texto tabular-nums">{m.pipeline.porEtapa[e.chave]!.qtd} · {brl(m.pipeline.porEtapa[e.chave]!.total)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-sm font-semibold text-texto">Fechamentos</h2>
          <select value={gran} onChange={(e) => { setGran(e.target.value as Granularidade); setOffset(0); }} className="rounded-lg border border-linha px-2 py-1 text-sm">
            {GRANS.map((g) => <option key={g.v} value={g.v}>{g.l}</option>)}
          </select>
          <div className="flex items-center gap-2 text-sm">
            <button type="button" onClick={() => setOffset((o) => o - 1)} className="rounded border border-linha px-2">←</button>
            <span className="min-w-[9rem] text-center text-texto">{rotulo}</span>
            <button type="button" onClick={() => setOffset((o) => o + 1)} className="rounded border border-linha px-2">→</button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-linha bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-cinza">Ganhos</div>
            <div className="font-display text-lg text-verde tabular-nums">{m.periodo.ganhos.qtd}</div>
            <div className="text-xs text-cinza tabular-nums">{brl(m.periodo.ganhos.valor)}</div>
          </div>
          <div className="rounded-2xl border border-linha bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-cinza">Perdidos</div>
            <div className="font-display text-lg text-negativo tabular-nums">{m.periodo.perdidos.qtd}</div>
            <div className="text-xs text-cinza tabular-nums">{brl(m.periodo.perdidos.valor)}</div>
          </div>
          <div className="rounded-2xl border border-linha bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-cinza">Taxa de conversão</div>
            <div className="font-display text-lg text-texto tabular-nums">{pct}</div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-linha text-xs text-cinza">
                <th className="px-3 py-2 text-left font-medium">Responsável</th>
                <th className="px-3 py-2 text-right font-medium">Ganhos</th>
                <th className="px-3 py-2 text-right font-medium">Perdidos</th>
                <th className="px-3 py-2 text-right font-medium">R$ ganho</th>
              </tr>
            </thead>
            <tbody>
              {m.periodo.porResponsavel.length === 0 && <tr><td colSpan={4} className="px-3 py-2 text-cinza">Sem fechamentos no período.</td></tr>}
              {m.periodo.porResponsavel.map((r) => (
                <tr key={r.nome} className="border-b border-linha/60">
                  <td className="px-3 py-2 text-texto">{r.nome}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.ganhos}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.perdidos}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{brl(r.valorGanho)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-linha bg-white p-3">
          <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-texto">Motivos de perda</h3>
          {m.periodo.motivosPerda.length === 0 ? (
            <p className="mt-1 text-xs text-cinza">Nenhum.</p>
          ) : (
            <ul className="mt-1 space-y-0.5 text-sm">
              {m.periodo.motivosPerda.map((mo) => (
                <li key={mo.motivo} className="flex justify-between"><span className="text-texto">{mo.motivo}</span><span className="tabular-nums text-cinza">{mo.qtd}</span></li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar** — `npm test -- metricas-render` → PASS.

- [ ] **Step 5: `metricas/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricasFunil } from "../MetricasFunil";
import { listarOportunidades } from "../actions";

export default async function MetricasPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const oportunidades = await listarOportunidades();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4">
      <PageHeader titulo="Métricas do funil" subtitulo="Pipeline e fechamentos" />
      <MetricasFunil oportunidades={oportunidades} hoje={hoje} />
    </main>
  );
}
```

- [ ] **Step 6: Link "Métricas" no `QuadroComercial`**

Na barra de topo (o `<div className="flex flex-wrap items-center gap-3">` com "Nova oportunidade" e "Só as minhas"), acrescentar ao final, dentro do mesmo `div`:
```tsx
        <Link href="/comercial/metricas" className="ml-auto text-sm text-verde underline">Métricas</Link>
```
(`Link` já está importado no arquivo.)

- [ ] **Step 7: Suite completa** — `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde; rota `/comercial/metricas` compila).

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/comercial/MetricasFunil.tsx" "src/app/(app)/comercial/metricas" "src/app/(app)/comercial/QuadroComercial.tsx" src/tests/comercial/metricas-render.test.tsx
git commit -m "feat(comercial): dashboard de métricas do funil + link

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Comercial — métricas do funil:** tela `/comercial/metricas` com o pipeline atual (total e por etapa) e
  os fechamentos por período (mês/trimestre/semestre/ano, navegável): ganhos, perdidos, **taxa de
  conversão**, desempenho por responsável e motivos de perda. Link "Métricas" no quadro.
```

- [ ] **Step 2: Commit + finalizar**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog das métricas do comercial

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois usar `superpowers:finishing-a-development-branch`. (Migration 0056 já aplicada; sem novos segredos.)

---

## Self-Review

- **Cobertura do spec:** coluna `fechado_em` + backfill (T1) ✓; `definirEtapa` data/limpa + datas na view (T2) ✓; `periodoBounds`/`metricasFunil` (T3) ✓; tela pipeline+período+conversão+responsável+motivos + seletor + link (T4) ✓; CHANGELOG (T5) ✓. Unit (T3) + smoke (T4) ✓.
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Consistência de tipos:** `OportunidadeView` ganha `criadoEm`/`fechadoEm` (T2), consumido por `MetricasFunil` (T4) e satisfaz `OpMetrica` (T3) estruturalmente (etapa/valorEstimado/responsavelNome/motivoPerda/fechadoEm); `Granularidade`/`periodoBounds`/`metricasFunil` (T3) → T4; `ETAPAS_ATIVAS`/`rotuloEtapa` reutilizados. Fixture do quadro atualizado no T2 (evita quebra de tipo).
- **Sequência sem quebra:** T1 antes de T2 (coluna); T2 adiciona datas e conserta o smoke do quadro no mesmo commit; T3 puro; T4 usa tudo.
- **Escopo:** só o dashboard. Propostas/exportação/metas fora.
