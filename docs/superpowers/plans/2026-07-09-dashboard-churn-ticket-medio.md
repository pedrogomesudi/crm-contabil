# Dashboard de Churn / Ticket médio (RF-070) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Painel `/financeiro/indicadores` com MRR, ticket médio, nº de clientes ativos, churn (clientes % e receita R$) e crescimento (novos × saídas), mês a mês, mais os números do momento.

**Architecture:** Uma trigger no banco captura a saída do cliente (data + honorário fotografado) ao inativar. Um helper puro reconstrói a série mensal a partir da lista de clientes; uma action carrega os dados e chama o helper; uma página server renderiza cartões + tabela (com CSV e imprimir).

**Tech Stack:** Next.js 16 (App Router, RSC + Server Actions), TypeScript, Supabase (Postgres/RLS), Tailwind 4, Vitest.

## Global Constraints

- Migrations: aplicar com `npm run db:migrate` (runner próprio, tabela `app_migrations`). **NÃO** usar `supabase db push`. Migrations aplicadas são **imutáveis**; idempotentes quando possível (`add column if not exists`, `create or replace`, `drop ... if exists`).
- Banco compartilhado de produção: cada migration atinge prod na hora.
- Papel/permissão: gate `podeGerenciarFinanceiro` (admin/financeiro) de `@/lib/financeiro/permissoes`. Leitura sempre via `createServerSupabase` (RLS ativa).
- Data "hoje" em SP: `new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })` (YYYY-MM-DD). Não há helper `hojeSP`.
- Dinheiro: `formatarMoeda` de `@/lib/format`; arredondar centavos com `Math.round(x*100)/100`.
- CSV: `paraCSV(cabecalhos: string[], linhas: string[][])` de `@/lib/financeiro/csv`; download com Blob + BOM `"﻿"` (helper `baixar`, ver Task 4).
- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`. Build final: `npm run build`.
- Alias de import: `@/*` → `./src/*`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `supabase/migrations/0068_metricas_churn.sql` — coluna `honorario_saida` + trigger de captura de saída.
- `src/lib/financeiro/metricas.ts` — helper puro (tipos + `mesesJanela` + `calcularMetricas`).
- `src/tests/financeiro/metricas.test.ts` — testes do helper.
- `src/app/(app)/financeiro/indicadores/actions.ts` — `carregarIndicadores`.
- `src/app/(app)/financeiro/indicadores/Indicadores.tsx` — tabela client (CSV + imprimir).
- `src/app/(app)/financeiro/indicadores/page.tsx` — página server (cartões + Voltar + PageHeader).
- `src/tests/financeiro/indicadores-render.test.tsx` — smoke render.
- `src/app/(app)/financeiro/cadastros/page.tsx` — adicionar card "Indicadores" no hub.

---

## Task 1: Migration — captura de saída (honorario_saida + trigger)

**Files:**
- Create: `supabase/migrations/0068_metricas_churn.sql`

**Interfaces:**
- Produces: coluna `clientes_financeiro.honorario_saida numeric(12,2)`; trigger `trg_capturar_saida` em `clientes` que, ao mudar `status`, preenche/limpa `clientes_financeiro.data_saida` e `honorario_saida`.

- [ ] **Step 1: Escrever a migration**

Create `supabase/migrations/0068_metricas_churn.sql`:

```sql
-- Métricas/churn: fotografa o MRR na saída e captura a data de saída ao inativar.
alter table clientes_financeiro add column if not exists honorario_saida numeric(12, 2);

create or replace function capturar_saida_cliente() returns trigger
  language plpgsql security definer set search_path = public as $$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if new.status = 'inativo' and old.status is distinct from 'inativo' then
    update clientes_financeiro
      set data_saida = coalesce(data_saida, hoje),
          honorario_saida = coalesce(honorario_saida, honorario_mensal)
      where cliente_id = new.id;
  elsif new.status = 'ativo' and old.status = 'inativo' then
    update clientes_financeiro
      set data_saida = null, honorario_saida = null
      where cliente_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_capturar_saida on clientes;
create trigger trg_capturar_saida after update of status on clientes
  for each row execute function capturar_saida_cliente();
```

- [ ] **Step 2: Aplicar a migration**

Run: `npm run db:migrate`
Expected: `+ aplicando:   0068_metricas_churn.sql` e `OK — 1 migration(s) nova(s) aplicada(s).`

- [ ] **Step 3: Verificar a trigger sem mutar produção (transação com ROLLBACK)**

Create `scripts/_verif_saida.mjs` (arquivo temporário, apagar no fim):

```js
import { makeClient } from "./_db.mjs";
const c = makeClient();
await c.connect();
await c.query("begin");
const { rows: [cli] } = await c.query("select id from clientes where excluido_em is null and status='ativo' limit 1");
await c.query("update clientes_financeiro set honorario_mensal = 500 where cliente_id = $1", [cli.id]);
await c.query("update clientes set status='inativo' where id = $1", [cli.id]);
const apos = await c.query("select data_saida, honorario_saida from clientes_financeiro where cliente_id=$1", [cli.id]);
console.log("apos inativar:", apos.rows[0]); // data_saida = hoje, honorario_saida = 500
await c.query("update clientes set status='ativo' where id = $1", [cli.id]);
const volta = await c.query("select data_saida, honorario_saida from clientes_financeiro where cliente_id=$1", [cli.id]);
console.log("apos reativar:", volta.rows[0]); // data_saida = null, honorario_saida = null
await c.query("rollback");
await c.end();
```

Run: `node --env-file=.env.local scripts/_verif_saida.mjs && rm -f scripts/_verif_saida.mjs`
Expected: primeira linha com `data_saida` = data de hoje e `honorario_saida: '500.00'`; segunda linha com ambos `null`. (O `rollback` desfaz tudo — nada muda em produção.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0068_metricas_churn.sql
git commit -m "feat(metricas): trigger captura saída do cliente (data + honorário fotografado)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Helper puro de métricas (TDD)

**Files:**
- Create: `src/lib/financeiro/metricas.ts`
- Test: `src/tests/financeiro/metricas.test.ts`

**Interfaces:**
- Produces:
  - `type ClienteMetrica = { dataInicio: string | null; dataSaida: string | null; honorario: number; honorarioSaida: number | null }`
  - `type MesMetrica = { mes: string; base: number; novos: number; churn: number; liquido: number; ativosFim: number; churnPct: number; churnReceita: number; mrr: number; ticketMedio: number }`
  - `type ResumoMetricas = { serie: MesMetrica[]; atual: { mrr: number; ticketMedio: number; ativos: number; churnPct: number; churnReceita: number } }`
  - `function mesesJanela(refAnoMes: string, n: number): string[]`
  - `function calcularMetricas(clientes: ClienteMetrica[], meses: string[]): ResumoMetricas`

- [ ] **Step 1: Escrever os testes que falham**

Create `src/tests/financeiro/metricas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mesesJanela, calcularMetricas, type ClienteMetrica } from "@/lib/financeiro/metricas";

describe("mesesJanela", () => {
  it("gera N meses em ordem cronológica terminando no ref", () => {
    expect(mesesJanela("2026-03", 3)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
  it("cruza a virada de ano", () => {
    expect(mesesJanela("2026-01", 3)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

describe("calcularMetricas", () => {
  const clientes: ClienteMetrica[] = [
    { dataInicio: null, dataSaida: null, honorario: 300, honorarioSaida: null },          // A: sempre ativo
    { dataInicio: "2026-02-10", dataSaida: null, honorario: 200, honorarioSaida: null },   // B: novo em fev
    { dataInicio: "2025-12-01", dataSaida: "2026-02-15", honorario: 0, honorarioSaida: 100 }, // C: saiu em fev
  ];
  const meses = mesesJanela("2026-03", 3); // jan, fev, mar
  const { serie, atual } = calcularMetricas(clientes, meses);
  const [jan, fev, mar] = serie;

  it("janeiro: base 2, sem novos/churn, MRR 400", () => {
    expect(jan).toMatchObject({ mes: "2026-01", base: 2, novos: 0, churn: 0, ativosFim: 2, mrr: 400, ticketMedio: 200, churnPct: 0, churnReceita: 0 });
  });
  it("fevereiro: 1 novo, 1 churn (50%), churn receita 100 (honorário fotografado)", () => {
    expect(fev).toMatchObject({ mes: "2026-02", base: 2, novos: 1, churn: 1, liquido: 0, ativosFim: 2, mrr: 500, ticketMedio: 250, churnPct: 50, churnReceita: 100 });
  });
  it("março: base 2 (A,B), sem eventos, MRR 500", () => {
    expect(mar).toMatchObject({ mes: "2026-03", base: 2, novos: 0, churn: 0, ativosFim: 2, mrr: 500, ticketMedio: 250, churnPct: 0 });
  });
  it("atual = último mês da série", () => {
    expect(atual).toEqual({ mrr: 500, ticketMedio: 250, ativos: 2, churnPct: 0, churnReceita: 0 });
  });
  it("churn % é 0 quando a base do mês é 0", () => {
    const r = calcularMetricas([{ dataInicio: "2026-03-05", dataSaida: null, honorario: 100, honorarioSaida: null }], ["2026-03"]);
    expect(r.serie[0]).toMatchObject({ base: 0, novos: 1, churnPct: 0 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- metricas`
Expected: FALHA (`Cannot find module '@/lib/financeiro/metricas'`).

- [ ] **Step 3: Implementar o helper**

Create `src/lib/financeiro/metricas.ts`:

```ts
// Métricas de carteira (RF-070): série mensal de MRR, ticket médio, churn e crescimento.
// Puro e testável — datas ISO (YYYY-MM-DD) comparadas por string (ordenáveis lexicograficamente).

export type ClienteMetrica = {
  dataInicio: string | null;     // entrada (null = presente desde antes da janela)
  dataSaida: string | null;      // saída (null = ativo)
  honorario: number;             // honorario_mensal atual (0 se ausente)
  honorarioSaida: number | null; // honorário fotografado na saída
};

export type MesMetrica = {
  mes: string;         // "YYYY-MM"
  base: number;        // ativos no início do mês
  novos: number;       // entradas no mês
  churn: number;       // saídas no mês
  liquido: number;     // novos - churn
  ativosFim: number;   // ativos ao fim do mês
  churnPct: number;    // churn / base, em % (1 casa)
  churnReceita: number;// R$ de honorário perdido no mês
  mrr: number;         // Σ honorário dos ativos ao fim do mês
  ticketMedio: number; // mrr / ativosFim
};

export type ResumoMetricas = {
  serie: MesMetrica[];
  atual: { mrr: number; ticketMedio: number; ativos: number; churnPct: number; churnReceita: number };
};

const cent = (n: number) => Math.round(n * 100) / 100;
const pct1 = (n: number) => Math.round(n * 1000) / 10; // fração → % com 1 casa

// N meses em ordem cronológica, terminando em refAnoMes ("YYYY-MM").
export function mesesJanela(refAnoMes: string, n: number): string[] {
  const [a, m] = refAnoMes.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const total = a * 12 + (m - 1) - i;
    const ano = Math.floor(total / 12);
    const mes = (total % 12) + 1;
    out.push(`${ano}-${String(mes).padStart(2, "0")}`);
  }
  return out;
}

export function calcularMetricas(clientes: ClienteMetrica[], meses: string[]): ResumoMetricas {
  const serie: MesMetrica[] = meses.map((mes) => {
    const [a, m] = mes.split("-").map(Number);
    const ini = `${mes}-01`;
    const prox = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
    let base = 0, novos = 0, churn = 0, churnReceita = 0, mrr = 0, ativosFim = 0;
    for (const c of clientes) {
      const hon = c.dataSaida ? (c.honorarioSaida ?? c.honorario) : c.honorario;
      const entrouAntes = !c.dataInicio || c.dataInicio < ini;
      const entrouNoMes = !!c.dataInicio && c.dataInicio >= ini && c.dataInicio < prox;
      const naoSaiuAteIni = !c.dataSaida || c.dataSaida >= ini;
      const saiuNoMes = !!c.dataSaida && c.dataSaida >= ini && c.dataSaida < prox;
      const ativoFim = (entrouAntes || entrouNoMes) && (!c.dataSaida || c.dataSaida >= prox);
      if (entrouAntes && naoSaiuAteIni) base += 1;
      if (entrouNoMes) novos += 1;
      if (saiuNoMes) { churn += 1; churnReceita += hon; }
      if (ativoFim) { ativosFim += 1; mrr += hon; }
    }
    mrr = cent(mrr);
    churnReceita = cent(churnReceita);
    const churnPct = base > 0 ? pct1(churn / base) : 0;
    const ticketMedio = ativosFim > 0 ? cent(mrr / ativosFim) : 0;
    return { mes, base, novos, churn, liquido: novos - churn, ativosFim, churnPct, churnReceita, mrr, ticketMedio };
  });
  const u = serie[serie.length - 1];
  const atual = u
    ? { mrr: u.mrr, ticketMedio: u.ticketMedio, ativos: u.ativosFim, churnPct: u.churnPct, churnReceita: u.churnReceita }
    : { mrr: 0, ticketMedio: 0, ativos: 0, churnPct: 0, churnReceita: 0 };
  return { serie, atual };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- metricas`
Expected: PASSA (todos os casos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/financeiro/metricas.ts src/tests/financeiro/metricas.test.ts
git commit -m "feat(metricas): helper puro de churn/ticket médio/MRR (TDD)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Action — carregarIndicadores

**Files:**
- Create: `src/app/(app)/financeiro/indicadores/actions.ts`

**Interfaces:**
- Consumes: `mesesJanela`, `calcularMetricas`, `ClienteMetrica`, `ResumoMetricas` (Task 2); `podeGerenciarFinanceiro`, `getPerfilAtual`, `createServerSupabase`.
- Produces: `async function carregarIndicadores(): Promise<ResumoMetricas | null>`.

- [ ] **Step 1: Implementar a action**

Create `src/app/(app)/financeiro/indicadores/actions.ts`:

```ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { mesesJanela, calcularMetricas, type ClienteMetrica, type ResumoMetricas } from "@/lib/financeiro/metricas";

export async function carregarIndicadores(): Promise<ResumoMetricas | null> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeGerenciarFinanceiro(perfil.papel)) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("clientes")
    .select("data_inicio, clientes_financeiro(honorario_mensal, data_saida, honorario_saida)")
    .is("excluido_em", null);
  const clientes: ClienteMetrica[] = (data ?? []).map((c) => {
    const fin = Array.isArray(c.clientes_financeiro) ? c.clientes_financeiro[0] : c.clientes_financeiro;
    return {
      dataInicio: (c.data_inicio as string | null) ?? null,
      dataSaida: (fin?.data_saida as string | null) ?? null,
      honorario: Number(fin?.honorario_mensal ?? 0),
      honorarioSaida: fin?.honorario_saida != null ? Number(fin.honorario_saida) : null,
    };
  });
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return calcularMetricas(clientes, mesesJanela(hoje.slice(0, 7), 12));
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/financeiro/indicadores/actions.ts"
git commit -m "feat(indicadores): action carregarIndicadores (12m, gate financeiro)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Tabela client (Indicadores) com CSV e imprimir + smoke test

**Files:**
- Create: `src/app/(app)/financeiro/indicadores/Indicadores.tsx`
- Test: `src/tests/financeiro/indicadores-render.test.tsx`

**Interfaces:**
- Consumes: `ResumoMetricas`/`MesMetrica` (Task 2); `formatarMoeda` (`@/lib/format`); `paraCSV` (`@/lib/financeiro/csv`).
- Produces: `function Indicadores({ resumo }: { resumo: ResumoMetricas }): JSX.Element`.

- [ ] **Step 1: Escrever o smoke test que falha**

Create `src/tests/financeiro/indicadores-render.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Indicadores } from "@/app/(app)/financeiro/indicadores/Indicadores";
import type { ResumoMetricas } from "@/lib/financeiro/metricas";

const resumo: ResumoMetricas = {
  serie: [{ mes: "2026-07", base: 99, novos: 1, churn: 0, liquido: 1, ativosFim: 100, churnPct: 0, churnReceita: 0, mrr: 36000, ticketMedio: 360 }],
  atual: { mrr: 36000, ticketMedio: 360, ativos: 100, churnPct: 0, churnReceita: 0 },
};

describe("Indicadores", () => {
  it("mostra o cabeçalho da tabela e a linha do mês", () => {
    const html = renderToStaticMarkup(<Indicadores resumo={resumo} />);
    expect(html).toContain("Churn %");
    expect(html).toContain("2026-07");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- indicadores-render`
Expected: FALHA (módulo `Indicadores` não existe).

- [ ] **Step 3: Implementar o componente**

Create `src/app/(app)/financeiro/indicadores/Indicadores.tsx`:

```tsx
"use client";
import { formatarMoeda } from "@/lib/format";
import { paraCSV } from "@/lib/financeiro/csv";
import type { ResumoMetricas } from "@/lib/financeiro/metricas";

function baixar(nome: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

const pct = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;

export function Indicadores({ resumo }: { resumo: ResumoMetricas }) {
  const { serie } = resumo;
  function exportar() {
    const csv = paraCSV(
      ["Mês", "Base", "Novos", "Churn", "Líquido", "Ativos fim", "Churn %", "Churn R$", "MRR", "Ticket médio"],
      serie.map((m) => [m.mes, String(m.base), String(m.novos), String(m.churn), String(m.liquido), String(m.ativosFim), pct(m.churnPct), formatarMoeda(m.churnReceita), formatarMoeda(m.mrr), formatarMoeda(m.ticketMedio)]),
    );
    baixar("indicadores-carteira.csv", csv);
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-end print:hidden">
        <button type="button" onClick={exportar} className="rounded-lg border border-linha bg-white px-3 py-1.5 text-sm font-medium text-texto hover:bg-creme">Exportar CSV</button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-left text-xs text-cinza">
              <th className="px-3 py-2 font-medium">Mês</th>
              <th className="px-3 py-2 text-right font-medium">Base</th>
              <th className="px-3 py-2 text-right font-medium">Novos</th>
              <th className="px-3 py-2 text-right font-medium">Churn</th>
              <th className="px-3 py-2 text-right font-medium">Líquido</th>
              <th className="px-3 py-2 text-right font-medium">Ativos</th>
              <th className="px-3 py-2 text-right font-medium">Churn %</th>
              <th className="px-3 py-2 text-right font-medium">Churn R$</th>
              <th className="px-3 py-2 text-right font-medium">MRR</th>
              <th className="px-3 py-2 text-right font-medium">Ticket médio</th>
            </tr>
          </thead>
          <tbody>
            {serie.map((m) => (
              <tr key={m.mes} className="border-b border-linha/60">
                <td className="px-3 py-1.5 tabular-nums">{m.mes}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{m.base}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-verde">{m.novos ? `+${m.novos}` : "0"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-negativo">{m.churn ? `-${m.churn}` : "0"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{m.liquido > 0 ? `+${m.liquido}` : m.liquido}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{m.ativosFim}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{pct(m.churnPct)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatarMoeda(m.churnReceita)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatarMoeda(m.mrr)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatarMoeda(m.ticketMedio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-cinza">O MRR histórico usa o honorário atual (clientes ativos) e o valor fotografado na saída (clientes que saíram) — aproximação, pois não há histórico de honorário.</p>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- indicadores-render`
Expected: PASSA.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/financeiro/indicadores/Indicadores.tsx" "src/tests/financeiro/indicadores-render.test.tsx"
git commit -m "feat(indicadores): tabela mês a mês com CSV (smoke test)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Página + cartões + card no hub

**Files:**
- Create: `src/app/(app)/financeiro/indicadores/page.tsx`
- Modify: `src/app/(app)/financeiro/cadastros/page.tsx` (array `ITENS`)

**Interfaces:**
- Consumes: `carregarIndicadores` (Task 3); `Indicadores` (Task 4); `Voltar` (`@/components/ui/Voltar`); `PageHeader` (`@/components/ui/PageHeader`); `formatarMoeda`.

- [ ] **Step 1: Implementar a página**

Create `src/app/(app)/financeiro/indicadores/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { formatarMoeda } from "@/lib/format";
import { Indicadores } from "./Indicadores";
import { carregarIndicadores } from "./actions";

function Cartao({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-2xl border border-linha bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-cinza">{titulo}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-texto">{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-cinza">{detalhe}</p>}
    </div>
  );
}

export default async function IndicadoresPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const resumo = await carregarIndicadores();
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4">
      <Voltar href="/financeiro/cadastros" />
      <PageHeader titulo="Indicadores" subtitulo="Ticket médio, MRR, churn e crescimento da carteira" />
      {!resumo ? (
        <p className="rounded-2xl border border-linha bg-white px-3 py-4 text-sm text-cinza">Sem dados para exibir.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Cartao titulo="MRR" valor={formatarMoeda(resumo.atual.mrr)} />
            <Cartao titulo="Ticket médio" valor={formatarMoeda(resumo.atual.ticketMedio)} />
            <Cartao titulo="Clientes ativos" valor={String(resumo.atual.ativos)} />
            <Cartao titulo="Churn do mês" valor={`${resumo.atual.churnPct.toFixed(1).replace(".", ",")}%`} detalhe={`${formatarMoeda(resumo.atual.churnReceita)} em receita`} />
          </div>
          <Indicadores resumo={resumo} />
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Adicionar o card "Indicadores" no hub Financeiro**

Modify `src/app/(app)/financeiro/cadastros/page.tsx` — no array `ITENS`, adicionar a linha logo após a entrada de `dashboard`:

```ts
  { href: "/financeiro/dashboard", label: "Dashboard financeiro" },
  { href: "/financeiro/indicadores", label: "Indicadores" },
```

- [ ] **Step 3: Verificar tudo**

Run: `npm run lint && npm run typecheck && npm test`
Expected: lint limpo, sem erros de tipo, todos os testes passam.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build conclui; rota `/financeiro/indicadores` aparece na listagem.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/financeiro/indicadores/page.tsx" "src/app/(app)/financeiro/cadastros/page.tsx"
git commit -m "feat(indicadores): página /financeiro/indicadores + card no hub

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Deploy

**Files:** nenhum (fluxo de deploy).

- [ ] **Step 1: Merge develop → main e push**

```bash
git checkout main && git merge develop --no-edit && git push origin main && git push origin develop && git checkout develop
```

- [ ] **Step 2: Implantar no EasyPanel**

Disparar "Implantar" no EasyPanel (builda o ramo `main`). Confirmar pela entrada do topo do histórico ficar **verde** e pelo curl da nova rota:

Run: `curl -s -o /dev/null -w "%{http_code}\n" https://app.seusaldo.ai/financeiro/indicadores`
Expected: `307` (redirect de auth) — a rota existe (não é 404).

---

## Self-Review

**Spec coverage:**
- Migration `honorario_saida` + trigger → Task 1. ✓
- Definições de métricas (base/novos/churn/líquido/churn%/churn receita/MRR/ticket) → Task 2 (helper + testes). ✓
- Reconstrução histórica com honorário atual + fotografado; base sem data_inicio → Task 2 (`entrouAntes` quando `dataInicio` nulo; MRR usa `honorarioSaida ?? honorario`). ✓
- Action com gate `podeGerenciarFinanceiro`, janela 12m → Task 3. ✓
- Página: 4 cartões + tabela + CSV + Voltar + nota de rodapé → Tasks 4 e 5. ✓
- Card no hub → Task 5. ✓
- Testes: unitários do helper + smoke da tabela → Tasks 2 e 4. ✓
- Deploy → Task 6. ✓

**Placeholder scan:** nenhum TBD/TODO; todo passo com código ou comando concreto. ✓

**Type consistency:** `ClienteMetrica`/`MesMetrica`/`ResumoMetricas`, `mesesJanela`, `calcularMetricas`, `carregarIndicadores`, `Indicadores({ resumo })` usados de forma idêntica entre as tasks 2→3→4→5. Campos `churnPct`, `churnReceita`, `ativosFim`, `ticketMedio` consistentes. ✓

**Nota de risco:** o teste de smoke `indicadores-render` importa `Indicadores` (client component puro, sem server-only) — não precisa de mock; se no futuro passar a importar a action, mockar `./actions` (padrão do projeto).
