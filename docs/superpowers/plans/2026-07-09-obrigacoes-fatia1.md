# Obrigações — Fatia 1 (Matriz + geração do calendário) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada cliente passa a ter um calendário de obrigações gerado automaticamente a partir de uma matriz curável, com prazos legal/interno calculados em dias úteis.

**Architecture:** Tabelas novas (`obrigacao`, `obrigacao_instancia`) + helpers puros de prazo (feriados/dia útil) e de incidência/geração + motor (lib) chamado por action (RLS) e por cron (admin) + UI (matriz admin, calendário global, seção na ficha). Padrão onboarding/financeiro. Spec: `docs/superpowers/specs/2026-07-09-obrigacoes-fatia1-design.md`.

**Tech Stack:** Next.js 16 (Server Actions + route handler), TypeScript, Supabase (Postgres/RLS + pg_cron), Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`.
- Gate: matriz = **admin**; instâncias/geração = `podeCriarCliente`. RLS de `obrigacao_instancia` escopada por cliente via `EXISTS (clientes)`.
- Helpers puros sem `Date.now()`/`new Date()` sem argumento (usar `Date.UTC`/componentes).
- Migration idempotente; **imutável após aplicada** (`npm run db:migrate` atinge o banco de produção compartilhado).
- Branch: `git checkout -b feat/obrigacoes-fatia1 develop`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `supabase/migrations/0061_obrigacoes.sql` — **novo**: enums + tabelas + RLS + índices.
- `src/lib/obrigacoes/prazo.ts` (+ test) — **novo**: feriados, dia útil, cálculo de vencimento.
- `src/lib/obrigacoes/geracao.ts` (+ test) — **novo**: incidência + instâncias por competência.
- `src/lib/obrigacoes/seed.ts` — **novo**: matriz starter.
- `src/lib/obrigacoes/permissoes.ts` — **novo**: `podeGerenciarMatriz`.
- `src/lib/obrigacoes/motor.ts` — **novo**: `gerarInstancias(supabase, ano, mes, clienteId?)`.
- `src/app/(app)/obrigacoes/actions.ts` — **novo**: `gerarCompetencia`, `gerarCompetenciaCliente`, `listarInstancias`.
- `src/app/(app)/obrigacoes/page.tsx` + `Calendario.tsx` (+ smoke) — **novo**: calendário global.
- `src/app/api/cron/gerar-obrigacoes/route.ts` — **novo**: cron.
- `src/app/(app)/configuracoes/obrigacoes/actions.ts` + `page.tsx` + `EditorMatriz.tsx` (+ smoke) — **novo**: matriz admin.
- `src/app/(app)/clientes/[id]/...` — **modificar**: seção Obrigações na ficha.
- Sidebar + hub de Configurações — **modificar**: links.

---

## Task 1: Migration — tabelas de obrigações

**Files:**
- Create: `supabase/migrations/0061_obrigacoes.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Obrigações e Compliance — Fatia 1: matriz + instâncias por competência.
do $$ begin create type obrigacao_esfera as enum ('federal','estadual','municipal','trabalhista'); exception when duplicate_object then null; end $$;
do $$ begin create type obrigacao_periodicidade as enum ('mensal','trimestral','anual'); exception when duplicate_object then null; end $$;
do $$ begin create type obrigacao_instancia_status as enum ('pendente','dispensada'); exception when duplicate_object then null; end $$;

create table if not exists obrigacao (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  descricao text,
  esfera obrigacao_esfera not null,
  periodicidade obrigacao_periodicidade not null,
  aplicavel_a text[] not null default '{}',
  condicao_flags text[] not null default '{}',
  condicao_modo text not null default 'any',
  ufs text[] not null default '{}',
  cnae_prefixos text[] not null default '{}',
  venc_dia int not null,
  venc_mes_offset int not null default 1,
  venc_mes int,
  venc_ano_offset int not null default 1,
  prazo_interno_dias_uteis int not null default 0,
  antecipa boolean not null default true,
  ativa boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  constraint chk_condicao_modo check (condicao_modo in ('any','all'))
);

create table if not exists obrigacao_instancia (
  id uuid primary key default gen_random_uuid(),
  obrigacao_id uuid not null references obrigacao(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  competencia date not null,
  vencimento_legal date not null,
  vencimento_interno date not null,
  status obrigacao_instancia_status not null default 'pendente',
  responsavel_id uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  constraint uq_obrigacao_instancia unique (obrigacao_id, cliente_id, competencia)
);
create index if not exists idx_obrigacao_instancia_cliente on obrigacao_instancia (cliente_id);
create index if not exists idx_obrigacao_instancia_venc on obrigacao_instancia (vencimento_legal);

alter table obrigacao enable row level security;
alter table obrigacao_instancia enable row level security;

drop policy if exists obrigacao_sel on obrigacao;
create policy obrigacao_sel on obrigacao for select using (true);
drop policy if exists obrigacao_ins on obrigacao;
create policy obrigacao_ins on obrigacao for insert with check (auth_papel() = 'admin');
drop policy if exists obrigacao_upd on obrigacao;
create policy obrigacao_upd on obrigacao for update using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
drop policy if exists obrigacao_del on obrigacao;
create policy obrigacao_del on obrigacao for delete using (auth_papel() = 'admin');

drop policy if exists obrigacao_inst_sel on obrigacao_instancia;
create policy obrigacao_inst_sel on obrigacao_instancia for select
  using (exists (select 1 from clientes c where c.id = cliente_id));
drop policy if exists obrigacao_inst_ins on obrigacao_instancia;
create policy obrigacao_inst_ins on obrigacao_instancia for insert
  with check (exists (select 1 from clientes c where c.id = cliente_id));
drop policy if exists obrigacao_inst_upd on obrigacao_instancia;
create policy obrigacao_inst_upd on obrigacao_instancia for update
  using (exists (select 1 from clientes c where c.id = cliente_id))
  with check (exists (select 1 from clientes c where c.id = cliente_id));
```

- [ ] **Step 2: Aplicar** — `npm run db:migrate` (esperado: `0061_obrigacoes` aplicada; sem erro). ⚠️ Atinge o banco de produção; a migration é imutável depois disso.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0061_obrigacoes.sql
git commit -m "feat(obrigacoes): migration da matriz e instâncias

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Helper de prazo (TDD)

**Files:**
- Create: `src/lib/obrigacoes/prazo.ts`
- Test: `src/tests/obrigacoes/prazo.test.ts`

**Interfaces:**
- Produces: `feriadosNacionais`, `ehDiaUtil`, `diaUtilAnterior`, `subtraiDiasUteis`, `type RegraPrazo`, `calcularVencimento`.

- [ ] **Step 1: Testes**

```ts
import { describe, it, expect } from "vitest";
import { feriadosNacionais, ehDiaUtil, diaUtilAnterior, subtraiDiasUteis, calcularVencimento, type RegraPrazo } from "@/lib/obrigacoes/prazo";

describe("feriadosNacionais", () => {
  it("inclui fixos e móveis (2026: Páscoa 05/04)", () => {
    const f = feriadosNacionais(2026);
    expect(f.has("2026-01-01")).toBe(true);
    expect(f.has("2026-12-25")).toBe(true);
    expect(f.has("2026-04-03")).toBe(true); // Sexta-feira Santa
    expect(f.has("2026-02-17")).toBe(true); // Carnaval (terça)
    expect(f.has("2026-06-04")).toBe(true); // Corpus Christi
  });
});

describe("dias úteis", () => {
  const f = feriadosNacionais(2026);
  it("ehDiaUtil ignora fds e feriado", () => {
    expect(ehDiaUtil("2026-07-04", f)).toBe(false); // sábado
    expect(ehDiaUtil("2026-07-06", f)).toBe(true); // segunda
    expect(ehDiaUtil("2026-12-25", f)).toBe(false); // feriado
  });
  it("diaUtilAnterior recua fds/feriado", () => {
    expect(diaUtilAnterior("2026-07-05", f)).toBe("2026-07-03"); // domingo → sexta
    expect(diaUtilAnterior("2026-07-06", f)).toBe("2026-07-06"); // já útil
  });
  it("subtraiDiasUteis conta só dias úteis", () => {
    expect(subtraiDiasUteis("2026-07-06", 1, f)).toBe("2026-07-03"); // segunda −1 útil = sexta
    expect(subtraiDiasUteis("2026-07-06", 2, f)).toBe("2026-07-02");
  });
});

describe("calcularVencimento", () => {
  const base: RegraPrazo = { periodicidade: "mensal", vencDia: 20, vencMesOffset: 1, vencMes: null, vencAnoOffset: 1, prazoInternoDiasUteis: 0, antecipa: true };
  it("mensal: dia 20 do mês seguinte à competência", () => {
    expect(calcularVencimento(base, "2026-07-01").legal).toBe("2026-08-20");
  });
  it("antecipa quando cai em fds/feriado", () => {
    // competência 04/2026 → vence 20/05/2026 (quarta, útil): checa um caso que cai no fim de semana
    const r = { ...base };
    expect(calcularVencimento(r, "2026-09-01").legal).toBe("2026-10-20"); // 20/10 é terça
    // competência 12/2026 → 20/01/2027 (quarta)
    expect(calcularVencimento(r, "2026-12-01").legal).toBe("2027-01-20");
  });
  it("clampa o dia ao fim do mês", () => {
    const r: RegraPrazo = { ...base, vencDia: 31, vencMesOffset: 0 };
    // competência 02/2026 (fev tem 28) → 28/02/2026 é sábado → antecipa p/ 27 (sexta)
    expect(calcularVencimento(r, "2026-02-01").legal).toBe("2026-02-27");
  });
  it("anual: 31/05 do ano seguinte", () => {
    const r: RegraPrazo = { periodicidade: "anual", vencDia: 31, vencMesOffset: 1, vencMes: 5, vencAnoOffset: 1, prazoInternoDiasUteis: 0, antecipa: true };
    // exercício 2026 → 31/05/2027 (segunda, útil)
    expect(calcularVencimento(r, "2026-01-01").legal).toBe("2027-05-31");
  });
  it("prazo interno = N dias úteis antes do legal", () => {
    const r: RegraPrazo = { ...base, prazoInternoDiasUteis: 2 };
    const v = calcularVencimento(r, "2026-07-01"); // legal 20/08/2026 (quinta)
    expect(v.legal).toBe("2026-08-20");
    expect(v.interno).toBe("2026-08-18"); // −2 úteis = terça
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- obrigacoes/prazo` → FAIL.

- [ ] **Step 3: Implementar `prazo.ts`**

```ts
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const ultimoDia = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m 1-based
const diaSemana = (s: string) => new Date(`${s}T00:00:00Z`).getUTCDay(); // 0 dom .. 6 sáb
const somaDias = (s: string, n: number) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export type RegraPrazo = { periodicidade: "mensal" | "trimestral" | "anual"; vencDia: number; vencMesOffset: number; vencMes: number | null; vencAnoOffset: number; prazoInternoDiasUteis: number; antecipa: boolean };

export function feriadosNacionais(ano: number): Set<string> {
  const f = new Set<string>();
  for (const [m, d] of [[1, 1], [4, 21], [5, 1], [9, 7], [10, 12], [11, 2], [11, 15], [12, 25]] as const) f.add(iso(ano, m, d));
  // Páscoa (Meeus/Jones/Butcher)
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const g = Math.floor((8 * b + 13) / 25), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * mm + 114) / 31), dia = ((h + l - 7 * mm + 114) % 31) + 1;
  const pascoa = iso(ano, mes, dia);
  f.add(somaDias(pascoa, -2)); // Sexta-feira Santa
  f.add(somaDias(pascoa, -47)); // Carnaval (terça)
  f.add(somaDias(pascoa, 60)); // Corpus Christi
  return f;
}

export function ehDiaUtil(s: string, feriados: Set<string>): boolean {
  const dw = diaSemana(s);
  return dw !== 0 && dw !== 6 && !feriados.has(s);
}

export function diaUtilAnterior(s: string, feriados: Set<string>): string {
  let cur = s;
  while (!ehDiaUtil(cur, feriados)) cur = somaDias(cur, -1);
  return cur;
}

export function subtraiDiasUteis(s: string, n: number, feriados: Set<string>): string {
  let cur = s;
  let restam = n;
  while (restam > 0) {
    cur = somaDias(cur, -1);
    if (ehDiaUtil(cur, feriados)) restam--;
  }
  return cur;
}

export function calcularVencimento(regra: RegraPrazo, competencia: string): { legal: string; interno: string } {
  const cy = Number(competencia.slice(0, 4));
  const cm = Number(competencia.slice(5, 7));
  let ano: number;
  let mes: number;
  if (regra.periodicidade === "anual") {
    ano = cy + regra.vencAnoOffset;
    mes = regra.vencMes ?? 1;
  } else {
    const mesRef = regra.periodicidade === "trimestral" ? cm + 2 : cm; // mês final do trimestre
    const t = new Date(Date.UTC(cy, mesRef - 1 + regra.vencMesOffset, 1));
    ano = t.getUTCFullYear();
    mes = t.getUTCMonth() + 1;
  }
  const dia = Math.min(regra.vencDia, ultimoDia(ano, mes));
  const feriados = new Set<string>([...feriadosNacionais(ano - 1), ...feriadosNacionais(ano), ...feriadosNacionais(ano + 1)]);
  let legal = iso(ano, mes, dia);
  if (regra.antecipa) legal = diaUtilAnterior(legal, feriados);
  const interno = regra.prazoInternoDiasUteis > 0 ? subtraiDiasUteis(legal, regra.prazoInternoDiasUteis, feriados) : legal;
  return { legal, interno };
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- obrigacoes/prazo` (PASS), `npm run lint`, `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/obrigacoes/prazo.ts src/tests/obrigacoes/prazo.test.ts
git commit -m "feat(obrigacoes): helper de prazo (feriados, dia útil, vencimento) TDD

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Helper de incidência + geração (TDD)

**Files:**
- Create: `src/lib/obrigacoes/geracao.ts`
- Test: `src/tests/obrigacoes/geracao.test.ts`

**Interfaces:**
- Consumes: `RegraPrazo`, `calcularVencimento` (Task 2); `PerfilCliente` (`@/lib/onboarding/processo`).
- Produces: `type ObrigacaoMatriz`, `type ClienteFiscal`, `type InstanciaSeed`, `obrigacaoAplica`, `instanciasDaCompetencia`.

- [ ] **Step 1: Testes**

```ts
import { describe, it, expect } from "vitest";
import { obrigacaoAplica, instanciasDaCompetencia, type ObrigacaoMatriz, type ClienteFiscal } from "@/lib/obrigacoes/geracao";
import type { RegraPrazo } from "@/lib/obrigacoes/prazo";

const regra: RegraPrazo = { periodicidade: "mensal", vencDia: 20, vencMesOffset: 1, vencMes: null, vencAnoOffset: 1, prazoInternoDiasUteis: 0, antecipa: true };
const base: ObrigacaoMatriz = { id: "o1", periodicidade: "mensal", aplicavelA: ["simples_sem_func", "simples_com_func"], condicaoFlags: [], condicaoModo: "any", ufs: [], cnaePrefixos: [], regra };
const cli = (p: ClienteFiscal["perfil"], extra: Partial<ClienteFiscal> = {}): ClienteFiscal => ({ perfil: p, uf: "SP", cnae: "6201500", flags: {}, ...extra });

describe("obrigacaoAplica", () => {
  it("casa por perfil", () => {
    expect(obrigacaoAplica(base, cli("simples_sem_func"))).toBe(true);
    expect(obrigacaoAplica(base, cli("mei"))).toBe(false);
  });
  it("flags any/all", () => {
    const o = { ...base, aplicavelA: ["*"], condicaoFlags: ["tem_folha"], condicaoModo: "any" as const };
    expect(obrigacaoAplica(o, cli("mei", { flags: { tem_folha: true } }))).toBe(true);
    expect(obrigacaoAplica(o, cli("mei", { flags: { tem_folha: false } }))).toBe(false);
  });
  it("filtra por UF (vazio = todas; restrito exclui outra)", () => {
    expect(obrigacaoAplica({ ...base, ufs: ["RJ"] }, cli("simples_sem_func", { uf: "SP" }))).toBe(false);
    expect(obrigacaoAplica({ ...base, ufs: ["SP"] }, cli("simples_sem_func", { uf: "SP" }))).toBe(true);
  });
  it("filtra por prefixo de CNAE", () => {
    expect(obrigacaoAplica({ ...base, cnaePrefixos: ["62"] }, cli("simples_sem_func", { cnae: "6201-5/00" }))).toBe(true);
    expect(obrigacaoAplica({ ...base, cnaePrefixos: ["47"] }, cli("simples_sem_func", { cnae: "6201-5/00" }))).toBe(false);
  });
});

describe("instanciasDaCompetencia", () => {
  const anual: ObrigacaoMatriz = { ...base, id: "a1", periodicidade: "anual", regra: { ...regra, periodicidade: "anual", vencDia: 31, vencMes: 3 } };
  const trimestral: ObrigacaoMatriz = { ...base, id: "t1", periodicidade: "trimestral", regra: { ...regra, periodicidade: "trimestral" } };
  it("mensal gera todo mês", () => {
    const r = instanciasDaCompetencia([base], cli("simples_sem_func"), 2026, 7);
    expect(r.map((x) => x.competencia)).toEqual(["2026-07-01"]);
    expect(r[0]!.vencimentoLegal).toBe("2026-08-20");
  });
  it("anual só em janeiro, competência do exercício anterior", () => {
    expect(instanciasDaCompetencia([anual], cli("simples_sem_func"), 2026, 7)).toEqual([]);
    const jan = instanciasDaCompetencia([anual], cli("simples_sem_func"), 2027, 1);
    expect(jan[0]!.competencia).toBe("2026-01-01");
  });
  it("trimestral só em 3/6/9/12", () => {
    expect(instanciasDaCompetencia([trimestral], cli("simples_sem_func"), 2026, 7)).toEqual([]);
    const set = instanciasDaCompetencia([trimestral], cli("simples_sem_func"), 2026, 9);
    expect(set[0]!.competencia).toBe("2026-07-01"); // início do 3º trimestre
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- obrigacoes/geracao` → FAIL.

- [ ] **Step 3: Implementar `geracao.ts`**

```ts
import type { PerfilCliente } from "@/lib/onboarding/processo";
import { calcularVencimento, type RegraPrazo } from "./prazo";

export type ObrigacaoMatriz = { id: string; periodicidade: "mensal" | "trimestral" | "anual"; aplicavelA: string[]; condicaoFlags: string[]; condicaoModo: "any" | "all"; ufs: string[]; cnaePrefixos: string[]; regra: RegraPrazo };
export type ClienteFiscal = { perfil: PerfilCliente; uf: string | null; cnae: string | null; flags: Record<string, boolean> };
export type InstanciaSeed = { obrigacaoId: string; competencia: string; vencimentoLegal: string; vencimentoInterno: string };

const soDigitos = (s: string) => s.replace(/\D/g, "");

export function obrigacaoAplica(o: ObrigacaoMatriz, c: ClienteFiscal): boolean {
  if (!o.aplicavelA.includes("*") && !o.aplicavelA.includes(c.perfil)) return false;
  if (o.condicaoFlags.length > 0) {
    const ok = o.condicaoModo === "any" ? o.condicaoFlags.some((f) => c.flags[f] === true) : o.condicaoFlags.every((f) => c.flags[f] === true);
    if (!ok) return false;
  }
  if (o.ufs.length > 0 && (!c.uf || !o.ufs.includes(c.uf))) return false;
  if (o.cnaePrefixos.length > 0) {
    const cnae = soDigitos(c.cnae ?? "");
    if (!o.cnaePrefixos.some((p) => cnae.startsWith(soDigitos(p)))) return false;
  }
  return true;
}

export function instanciasDaCompetencia(obrigacoes: ObrigacaoMatriz[], c: ClienteFiscal, ano: number, mes: number): InstanciaSeed[] {
  const out: InstanciaSeed[] = [];
  for (const o of obrigacoes) {
    if (!obrigacaoAplica(o, c)) continue;
    let competencia: string | null = null;
    if (o.periodicidade === "mensal") competencia = `${ano}-${String(mes).padStart(2, "0")}-01`;
    else if (o.periodicidade === "trimestral") {
      if ([3, 6, 9, 12].includes(mes)) competencia = `${ano}-${String(mes - 2).padStart(2, "0")}-01`;
    } else if (mes === 1) competencia = `${ano - 1}-01-01`;
    if (!competencia) continue;
    const v = calcularVencimento(o.regra, competencia);
    out.push({ obrigacaoId: o.id, competencia, vencimentoLegal: v.legal, vencimentoInterno: v.interno });
  }
  return out;
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- obrigacoes/geracao` (PASS), `npm run lint`, `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/obrigacoes/geracao.ts src/tests/obrigacoes/geracao.test.ts
git commit -m "feat(obrigacoes): helper de incidência e geração por competência (TDD)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Seed da matriz + permissões

**Files:**
- Create: `src/lib/obrigacoes/seed.ts`
- Create: `src/lib/obrigacoes/permissoes.ts`
- Test: `src/tests/obrigacoes/seed.test.ts`

**Interfaces:**
- Produces: `type ObrigacaoSeed`, `MATRIZ_PADRAO`; `podeGerenciarMatriz`.

- [ ] **Step 1: Teste do seed**

```ts
import { describe, it, expect } from "vitest";
import { MATRIZ_PADRAO } from "@/lib/obrigacoes/seed";

describe("MATRIZ_PADRAO", () => {
  it("tem códigos únicos e campos coerentes", () => {
    const codigos = MATRIZ_PADRAO.map((o) => o.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    for (const o of MATRIZ_PADRAO) {
      expect(o.vencDia).toBeGreaterThanOrEqual(1);
      expect(o.vencDia).toBeLessThanOrEqual(31);
      if (o.periodicidade === "anual") expect(o.vencMes).not.toBeNull();
    }
  });
  it("inclui PGDAS-D mensal para Simples", () => {
    const p = MATRIZ_PADRAO.find((o) => o.codigo === "PGDAS-D");
    expect(p?.periodicidade).toBe("mensal");
    expect(p?.aplicavelA).toContain("simples_sem_func");
  });
});
```

- [ ] **Step 2: Implementar `seed.ts`**

```ts
export type ObrigacaoSeed = { codigo: string; nome: string; descricao: string | null; esfera: "federal" | "estadual" | "municipal" | "trabalhista"; periodicidade: "mensal" | "trimestral" | "anual"; aplicavelA: string[]; condicaoFlags: string[]; condicaoModo: "any" | "all"; ufs: string[]; cnaePrefixos: string[]; vencDia: number; vencMesOffset: number; vencMes: number | null; vencAnoOffset: number; prazoInternoDiasUteis: number; antecipa: boolean; ordem: number };

const SIMPLES = ["simples_sem_func", "simples_com_func"];

export const MATRIZ_PADRAO: ObrigacaoSeed[] = [
  { codigo: "DASN-SIMEI", nome: "DASN-SIMEI", descricao: "Declaração anual do MEI.", esfera: "federal", periodicidade: "anual", aplicavelA: ["mei"], condicaoFlags: [], condicaoModo: "any", ufs: [], cnaePrefixos: [], vencDia: 31, vencMesOffset: 1, vencMes: 5, vencAnoOffset: 1, prazoInternoDiasUteis: 0, antecipa: true, ordem: 10 },
  { codigo: "PGDAS-D", nome: "PGDAS-D", descricao: "Apuração mensal do Simples Nacional.", esfera: "federal", periodicidade: "mensal", aplicavelA: SIMPLES, condicaoFlags: [], condicaoModo: "any", ufs: [], cnaePrefixos: [], vencDia: 20, vencMesOffset: 1, vencMes: null, vencAnoOffset: 1, prazoInternoDiasUteis: 0, antecipa: true, ordem: 20 },
  { codigo: "DEFIS", nome: "DEFIS", descricao: "Declaração de Informações Socioeconômicas e Fiscais.", esfera: "federal", periodicidade: "anual", aplicavelA: SIMPLES, condicaoFlags: [], condicaoModo: "any", ufs: [], cnaePrefixos: [], vencDia: 31, vencMesOffset: 1, vencMes: 3, vencAnoOffset: 1, prazoInternoDiasUteis: 0, antecipa: true, ordem: 30 },
  { codigo: "DCTFWEB", nome: "DCTFWeb", descricao: "Declaração de débitos previdenciários.", esfera: "federal", periodicidade: "mensal", aplicavelA: ["*"], condicaoFlags: ["tem_folha"], condicaoModo: "any", ufs: [], cnaePrefixos: [], vencDia: 20, vencMesOffset: 1, vencMes: null, vencAnoOffset: 1, prazoInternoDiasUteis: 0, antecipa: true, ordem: 40 },
  { codigo: "FGTS-DIGITAL", nome: "FGTS Digital", descricao: "Recolhimento do FGTS.", esfera: "trabalhista", periodicidade: "mensal", aplicavelA: ["*"], condicaoFlags: ["tem_folha"], condicaoModo: "any", ufs: [], cnaePrefixos: [], vencDia: 20, vencMesOffset: 1, vencMes: null, vencAnoOffset: 1, prazoInternoDiasUteis: 0, antecipa: true, ordem: 50 },
  { codigo: "EFD-CONTRIB", nome: "EFD-Contribuições", descricao: "PIS/COFINS.", esfera: "federal", periodicidade: "mensal", aplicavelA: ["presumido_real"], condicaoFlags: [], condicaoModo: "any", ufs: [], cnaePrefixos: [], vencDia: 15, vencMesOffset: 2, vencMes: null, vencAnoOffset: 1, prazoInternoDiasUteis: 0, antecipa: true, ordem: 60 },
  { codigo: "EFD-REINF", nome: "EFD-Reinf", descricao: "Retenções e informações da contribuição previdenciária.", esfera: "federal", periodicidade: "mensal", aplicavelA: ["presumido_real"], condicaoFlags: [], condicaoModo: "any", ufs: [], cnaePrefixos: [], vencDia: 15, vencMesOffset: 1, vencMes: null, vencAnoOffset: 1, prazoInternoDiasUteis: 0, antecipa: true, ordem: 70 },
  { codigo: "ECD", nome: "ECD", descricao: "Escrituração Contábil Digital.", esfera: "federal", periodicidade: "anual", aplicavelA: ["presumido_real"], condicaoFlags: [], condicaoModo: "any", ufs: [], cnaePrefixos: [], vencDia: 31, vencMesOffset: 1, vencMes: 5, vencAnoOffset: 1, prazoInternoDiasUteis: 0, antecipa: true, ordem: 80 },
  { codigo: "ECF", nome: "ECF", descricao: "Escrituração Contábil Fiscal.", esfera: "federal", periodicidade: "anual", aplicavelA: ["presumido_real"], condicaoFlags: [], condicaoModo: "any", ufs: [], cnaePrefixos: [], vencDia: 31, vencMesOffset: 1, vencMes: 7, vencAnoOffset: 1, prazoInternoDiasUteis: 0, antecipa: true, ordem: 90 },
];
```

- [ ] **Step 3: Implementar `permissoes.ts`**

```ts
import type { Papel } from "@/lib/auth/perfil";

export function podeGerenciarMatriz(papel: Papel | undefined): boolean {
  return papel === "admin";
}
```

> Se `Papel` não vier de `@/lib/auth/perfil`, usar o mesmo import de `src/lib/clientes/permissoes.ts` (confira o caminho real do tipo `Papel` nesse arquivo e replique).

- [ ] **Step 4: Rodar + verificar** — `npm test -- obrigacoes/seed` (PASS), `npm run lint`, `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/obrigacoes/seed.ts src/lib/obrigacoes/permissoes.ts src/tests/obrigacoes/seed.test.ts
git commit -m "feat(obrigacoes): matriz starter (seed) + permissão da matriz

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Motor + actions de geração/leitura + cron

**Files:**
- Create: `src/lib/obrigacoes/motor.ts`
- Create: `src/app/(app)/obrigacoes/actions.ts`
- Create: `src/app/api/cron/gerar-obrigacoes/route.ts`

**Interfaces:**
- Consumes: `instanciasDaCompetencia`, `ObrigacaoMatriz`, `ClienteFiscal` (Task 3); `sugerirPerfil` (`@/lib/onboarding/processo`); `podeCriarCliente` (`@/lib/clientes/permissoes`).
- Produces: `gerarInstancias(supabase, ano, mes, clienteId?)`; actions `gerarCompetencia`, `gerarCompetenciaCliente`, `listarInstancias`; `type InstanciaView`.

- [ ] **Step 1: `motor.ts`** (recebe o client Supabase — server ou admin)

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { sugerirPerfil } from "@/lib/onboarding/processo";
import { instanciasDaCompetencia, type ObrigacaoMatriz, type ClienteFiscal } from "./geracao";

type Row = Record<string, unknown>;

function matrizDaLinha(r: Row): ObrigacaoMatriz {
  return {
    id: r.id as string,
    periodicidade: r.periodicidade as ObrigacaoMatriz["periodicidade"],
    aplicavelA: (r.aplicavel_a as string[] | null) ?? [],
    condicaoFlags: (r.condicao_flags as string[] | null) ?? [],
    condicaoModo: (r.condicao_modo as "any" | "all") ?? "any",
    ufs: (r.ufs as string[] | null) ?? [],
    cnaePrefixos: (r.cnae_prefixos as string[] | null) ?? [],
    regra: { periodicidade: r.periodicidade as ObrigacaoMatriz["periodicidade"], vencDia: r.venc_dia as number, vencMesOffset: r.venc_mes_offset as number, vencMes: (r.venc_mes as number | null) ?? null, vencAnoOffset: r.venc_ano_offset as number, prazoInternoDiasUteis: r.prazo_interno_dias_uteis as number, antecipa: r.antecipa as boolean },
  };
}

export async function gerarInstancias(supabase: SupabaseClient, ano: number, mes: number, clienteId?: string): Promise<{ candidatas: number; clientes: number }> {
  const { data: obrigRows } = await supabase.from("obrigacao").select("*").eq("ativa", true);
  const obrigacoes = (obrigRows ?? []).map(matrizDaLinha);
  if (obrigacoes.length === 0) return { candidatas: 0, clientes: 0 };

  let q = supabase.from("clientes").select("id, tipo_pessoa, regime_tributario, cnae, inscricao_estadual, inscricao_municipal, contador_id, endereco, clientes_financeiro(qtd_funcionarios)").is("excluido_em", null);
  if (clienteId) q = q.eq("id", clienteId);
  const { data: clientes } = await q;

  const linhas: Row[] = [];
  for (const cl of clientes ?? []) {
    const finRaw = (cl as Row).clientes_financeiro;
    const fin = (Array.isArray(finRaw) ? finRaw[0] : finRaw) as { qtd_funcionarios?: number | null } | null;
    const qtd = fin?.qtd_funcionarios ?? null;
    const perfil = sugerirPerfil(cl.tipo_pessoa as string, cl.regime_tributario as string, qtd);
    const endereco = ((cl.endereco as { uf?: string } | null) ?? {});
    const c: ClienteFiscal = { perfil, uf: endereco.uf ?? null, cnae: (cl.cnae as string | null) ?? null, flags: { tem_folha: (qtd ?? 0) > 0, contribui_icms: !!cl.inscricao_estadual, contribui_iss: !!cl.inscricao_municipal } };
    for (const inst of instanciasDaCompetencia(obrigacoes, c, ano, mes)) {
      linhas.push({ obrigacao_id: inst.obrigacaoId, cliente_id: cl.id, competencia: inst.competencia, vencimento_legal: inst.vencimentoLegal, vencimento_interno: inst.vencimentoInterno, responsavel_id: (cl.contador_id as string | null) ?? null });
    }
  }
  if (linhas.length > 0) {
    const { error } = await supabase.from("obrigacao_instancia").upsert(linhas, { onConflict: "obrigacao_id,cliente_id,competencia", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  return { candidatas: linhas.length, clientes: (clientes ?? []).length };
}
```

- [ ] **Step 2: `actions.ts`**

```ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { gerarInstancias } from "@/lib/obrigacoes/motor";

export type InstanciaView = { id: string; clienteNome: string; obrigacaoNome: string; obrigacaoCodigo: string; periodicidade: string; competencia: string; vencimentoLegal: string; vencimentoInterno: string; status: string; responsavelNome: string | null; meu: boolean };

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return null;
  return p;
}

export async function gerarCompetencia(ano: number, mes: number): Promise<{ candidatas: number; clientes: number } | null> {
  if (!(await gate())) return null;
  const supabase = await createServerSupabase();
  return gerarInstancias(supabase, ano, mes);
}

export async function gerarCompetenciaCliente(clienteId: string, ano: number, mes: number): Promise<{ candidatas: number; clientes: number } | null> {
  if (!(await gate())) return null;
  const supabase = await createServerSupabase();
  return gerarInstancias(supabase, ano, mes, clienteId);
}

export async function listarInstancias(ano: number, mes: number, opts?: { clienteId?: string }): Promise<InstanciaView[]> {
  const perfil = await gate();
  if (!perfil) return [];
  const supabase = await createServerSupabase();
  const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(new Date(Date.UTC(ano, mes, 0)).getUTCDate()).padStart(2, "0")}`;
  let q = supabase
    .from("obrigacao_instancia")
    .select("id, competencia, vencimento_legal, vencimento_interno, status, responsavel_id, obrigacao(nome, codigo, periodicidade), clientes(razao_social), usuarios:responsavel_id(nome)")
    .gte("vencimento_legal", ini)
    .lte("vencimento_legal", fim)
    .order("vencimento_legal");
  if (opts?.clienteId) q = q.eq("cliente_id", opts.clienteId);
  const { data } = await q;
  const um = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  return (data ?? []).map((r) => {
    const o = um(r.obrigacao as { nome?: string; codigo?: string; periodicidade?: string } | { nome?: string; codigo?: string; periodicidade?: string }[] | null);
    const cl = um(r.clientes as { razao_social?: string } | { razao_social?: string }[] | null);
    const resp = um(r.usuarios as { nome?: string } | { nome?: string }[] | null);
    return { id: r.id as string, clienteNome: cl?.razao_social ?? "—", obrigacaoNome: o?.nome ?? "—", obrigacaoCodigo: o?.codigo ?? "", periodicidade: o?.periodicidade ?? "mensal", competencia: r.competencia as string, vencimentoLegal: r.vencimento_legal as string, vencimentoInterno: r.vencimento_interno as string, status: r.status as string, responsavelNome: resp?.nome ?? null, meu: (r.responsavel_id as string | null) === perfil.id };
  });
}
```

> Confirme os nomes reais das relações no seu Supabase: `obrigacao(...)`, `clientes(razao_social)` e o alias `usuarios:responsavel_id(nome)`. Ajuste `perfil.id` para o campo de id do perfil retornado por `getPerfilAtual` (ver `dre-actions`/`alertas-actions` para o shape real).

- [ ] **Step 3: Cron route**

```ts
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { gerarInstancias } from "@/lib/obrigacoes/motor";

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(segredo);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const resumo = await gerarInstancias(createAdminSupabase(), ano, mes);
  return NextResponse.json(resumo);
}
```

- [ ] **Step 4: Verificar + commit** — `npm run lint && npm run typecheck && npm run build`.
```bash
git add src/lib/obrigacoes/motor.ts "src/app/(app)/obrigacoes/actions.ts" src/app/api/cron/gerar-obrigacoes/route.ts
git commit -m "feat(obrigacoes): motor de geração, actions e cron

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Matriz (admin) — actions + UI + seed

**Files:**
- Create: `src/app/(app)/configuracoes/obrigacoes/actions.ts`
- Create: `src/app/(app)/configuracoes/obrigacoes/page.tsx`
- Create: `src/app/(app)/configuracoes/obrigacoes/EditorMatriz.tsx`
- Modify: `src/app/(app)/configuracoes/page.tsx` (link)
- Test: `src/tests/obrigacoes/matriz-render.test.tsx`

**Interfaces:**
- Consumes: `MATRIZ_PADRAO` (Task 4), `podeGerenciarMatriz` (Task 4).
- Produces: `listarMatriz`, `salvarObrigacao`, `excluirObrigacao`, `semearMatrizPadrao`; `type ObrigacaoRow`.

- [ ] **Step 1: `actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarMatriz } from "@/lib/obrigacoes/permissoes";
import { MATRIZ_PADRAO } from "@/lib/obrigacoes/seed";

export type ObrigacaoRow = { id: string; codigo: string; nome: string; esfera: string; periodicidade: string; aplicavelA: string[]; condicaoFlags: string[]; condicaoModo: string; ufs: string[]; cnaePrefixos: string[]; vencDia: number; vencMesOffset: number; vencMes: number | null; vencAnoOffset: number; prazoInternoDiasUteis: number; antecipa: boolean; ativa: boolean; ordem: number };

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarMatriz(p.papel)) return null;
  return p;
}

export async function listarMatriz(): Promise<ObrigacaoRow[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("obrigacao").select("*").order("ordem");
  return (data ?? []).map((r) => ({ id: r.id as string, codigo: r.codigo as string, nome: r.nome as string, esfera: r.esfera as string, periodicidade: r.periodicidade as string, aplicavelA: (r.aplicavel_a as string[]) ?? [], condicaoFlags: (r.condicao_flags as string[]) ?? [], condicaoModo: r.condicao_modo as string, ufs: (r.ufs as string[]) ?? [], cnaePrefixos: (r.cnae_prefixos as string[]) ?? [], vencDia: r.venc_dia as number, vencMesOffset: r.venc_mes_offset as number, vencMes: (r.venc_mes as number | null) ?? null, vencAnoOffset: r.venc_ano_offset as number, prazoInternoDiasUteis: r.prazo_interno_dias_uteis as number, antecipa: r.antecipa as boolean, ativa: r.ativa as boolean, ordem: r.ordem as number }));
}

export async function salvarObrigacao(input: Omit<ObrigacaoRow, "id"> & { id?: string }): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const row = { codigo: input.codigo, nome: input.nome, esfera: input.esfera, periodicidade: input.periodicidade, aplicavel_a: input.aplicavelA, condicao_flags: input.condicaoFlags, condicao_modo: input.condicaoModo, ufs: input.ufs, cnae_prefixos: input.cnaePrefixos, venc_dia: input.vencDia, venc_mes_offset: input.vencMesOffset, venc_mes: input.vencMes, venc_ano_offset: input.vencAnoOffset, prazo_interno_dias_uteis: input.prazoInternoDiasUteis, antecipa: input.antecipa, ativa: input.ativa, ordem: input.ordem };
  const { error } = input.id ? await supabase.from("obrigacao").update(row).eq("id", input.id) : await supabase.from("obrigacao").insert(row);
  if (error) return { erro: error.message };
  revalidatePath("/configuracoes/obrigacoes");
  return { ok: true };
}

export async function excluirObrigacao(id: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("obrigacao").delete().eq("id", id);
  if (error) return { erro: error.message };
  revalidatePath("/configuracoes/obrigacoes");
  return { ok: true };
}

export async function semearMatrizPadrao(): Promise<{ ok?: boolean; erro?: string; inseridas?: number }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: existentes } = await supabase.from("obrigacao").select("codigo");
  const jaTem = new Set((existentes ?? []).map((e) => e.codigo as string));
  const novas = MATRIZ_PADRAO.filter((o) => !jaTem.has(o.codigo)).map((o) => ({ codigo: o.codigo, nome: o.nome, descricao: o.descricao, esfera: o.esfera, periodicidade: o.periodicidade, aplicavel_a: o.aplicavelA, condicao_flags: o.condicaoFlags, condicao_modo: o.condicaoModo, ufs: o.ufs, cnae_prefixos: o.cnaePrefixos, venc_dia: o.vencDia, venc_mes_offset: o.vencMesOffset, venc_mes: o.vencMes, venc_ano_offset: o.vencAnoOffset, prazo_interno_dias_uteis: o.prazoInternoDiasUteis, antecipa: o.antecipa, ordem: o.ordem }));
  if (novas.length > 0) {
    const { error } = await supabase.from("obrigacao").insert(novas);
    if (error) return { erro: error.message };
  }
  revalidatePath("/configuracoes/obrigacoes");
  return { ok: true, inseridas: novas.length };
}
```

- [ ] **Step 2: Smoke test**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/obrigacoes/actions", () => ({ salvarObrigacao: vi.fn(), excluirObrigacao: vi.fn(), semearMatrizPadrao: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { EditorMatriz } from "@/app/(app)/configuracoes/obrigacoes/EditorMatriz";
import type { ObrigacaoRow } from "@/app/(app)/configuracoes/obrigacoes/actions";

const linhas: ObrigacaoRow[] = [{ id: "1", codigo: "PGDAS-D", nome: "PGDAS-D", esfera: "federal", periodicidade: "mensal", aplicavelA: ["simples_sem_func"], condicaoFlags: [], condicaoModo: "any", ufs: [], cnaePrefixos: [], vencDia: 20, vencMesOffset: 1, vencMes: null, vencAnoOffset: 1, prazoInternoDiasUteis: 0, antecipa: true, ativa: true, ordem: 20 }];

describe("EditorMatriz", () => {
  it("lista obrigações e o botão de semear", () => {
    const html = renderToStaticMarkup(<EditorMatriz linhas={linhas} />);
    expect(html).toContain("PGDAS-D");
    expect(html).toContain("Semear matriz padrão");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar** — `npm test -- obrigacoes/matriz-render` → FAIL.

- [ ] **Step 4: `EditorMatriz.tsx`** (client) — lista + formulário de edição/criação + botão semear.

```tsx
"use client";
import { useState } from "react";
import { salvarObrigacao, excluirObrigacao, semearMatrizPadrao, type ObrigacaoRow } from "./actions";

const PERFIS = ["mei", "simples_sem_func", "simples_com_func", "presumido_real", "pf", "*"];
const vazio: Omit<ObrigacaoRow, "id"> & { id?: string } = { codigo: "", nome: "", esfera: "federal", periodicidade: "mensal", aplicavelA: [], condicaoFlags: [], condicaoModo: "any", ufs: [], cnaePrefixos: [], vencDia: 20, vencMesOffset: 1, vencMes: null, vencAnoOffset: 1, prazoInternoDiasUteis: 0, antecipa: true, ativa: true, ordem: 0 };

export function EditorMatriz({ linhas }: { linhas: ObrigacaoRow[] }) {
  const [form, setForm] = useState<(Omit<ObrigacaoRow, "id"> & { id?: string }) | null>(null);
  const [msg, setMsg] = useState("");
  const csv = (a: string[]) => a.join(", ");
  const parse = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  async function salvar() {
    if (!form) return;
    const r = await salvarObrigacao(form);
    setMsg(r.ok ? "Salvo." : r.erro ?? "Erro");
    if (r.ok) { setForm(null); location.reload(); }
  }
  async function semear() {
    const r = await semearMatrizPadrao();
    setMsg(r.ok ? `Semeadas ${r.inseridas ?? 0} obrigação(ões).` : r.erro ?? "Erro");
    if (r.ok) location.reload();
  }
  async function excluir(id: string) {
    const r = await excluirObrigacao(id);
    if (r.ok) location.reload();
    else setMsg(r.erro ?? "Erro");
  }

  const inp = "rounded-lg border border-linha px-2 py-1 text-sm";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setForm({ ...vazio })} className="rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white">Nova obrigação</button>
        <button type="button" onClick={semear} className="rounded-lg border border-linha px-3 py-1.5 text-sm">Semear matriz padrão</button>
        {msg && <span className="text-sm text-cinza">{msg}</span>}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead><tr className="border-b border-linha text-left text-xs text-cinza">
            <th className="px-3 py-2 font-medium">Código</th><th className="px-3 py-2 font-medium">Nome</th><th className="px-3 py-2 font-medium">Periodicidade</th><th className="px-3 py-2 font-medium">Incidência</th><th className="px-3 py-2 font-medium">Ativa</th><th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>
            {linhas.length === 0 && <tr><td colSpan={6} className="px-3 py-3 text-cinza">Nenhuma obrigação. Use “Semear matriz padrão”.</td></tr>}
            {linhas.map((o) => (
              <tr key={o.id} className="border-b border-linha/60">
                <td className="px-3 py-1.5 font-medium text-texto">{o.codigo}</td>
                <td className="px-3 py-1.5">{o.nome}</td>
                <td className="px-3 py-1.5">{o.periodicidade}</td>
                <td className="px-3 py-1.5 text-cinza">{[...o.aplicavelA, ...o.condicaoFlags].join(", ") || "—"}</td>
                <td className="px-3 py-1.5">{o.ativa ? "Sim" : "Não"}</td>
                <td className="px-3 py-1.5 text-right">
                  <button type="button" onClick={() => setForm({ ...o })} className="text-verde underline">Editar</button>
                  <button type="button" onClick={() => excluir(o.id)} className="ml-3 text-negativo underline">Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="space-y-2 rounded-2xl border border-linha bg-white p-3">
          <div className="flex flex-wrap gap-2">
            <input placeholder="Código" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className={inp} />
            <input placeholder="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={inp} />
            <select value={form.periodicidade} onChange={(e) => setForm({ ...form, periodicidade: e.target.value })} className={inp}>
              <option value="mensal">mensal</option><option value="trimestral">trimestral</option><option value="anual">anual</option>
            </select>
            <select value={form.esfera} onChange={(e) => setForm({ ...form, esfera: e.target.value })} className={inp}>
              <option value="federal">federal</option><option value="estadual">estadual</option><option value="municipal">municipal</option><option value="trabalhista">trabalhista</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <select multiple value={form.aplicavelA} onChange={(e) => setForm({ ...form, aplicavelA: Array.from(e.target.selectedOptions, (o) => o.value) })} className={inp}>
              {PERFIS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input placeholder="Flags (csv: tem_folha)" value={csv(form.condicaoFlags)} onChange={(e) => setForm({ ...form, condicaoFlags: parse(e.target.value) })} className={inp} />
            <select value={form.condicaoModo} onChange={(e) => setForm({ ...form, condicaoModo: e.target.value })} className={inp}><option value="any">any</option><option value="all">all</option></select>
            <input placeholder="UFs (csv)" value={csv(form.ufs)} onChange={(e) => setForm({ ...form, ufs: parse(e.target.value) })} className={inp} />
            <input placeholder="CNAE prefixos (csv)" value={csv(form.cnaePrefixos)} onChange={(e) => setForm({ ...form, cnaePrefixos: parse(e.target.value) })} className={inp} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-cinza">Dia<input type="number" value={form.vencDia} onChange={(e) => setForm({ ...form, vencDia: Number(e.target.value) })} className={`${inp} ml-1 w-16`} /></label>
            <label className="text-sm text-cinza">Offset mês<input type="number" value={form.vencMesOffset} onChange={(e) => setForm({ ...form, vencMesOffset: Number(e.target.value) })} className={`${inp} ml-1 w-16`} /></label>
            <label className="text-sm text-cinza">Mês (anual)<input type="number" value={form.vencMes ?? ""} onChange={(e) => setForm({ ...form, vencMes: e.target.value ? Number(e.target.value) : null })} className={`${inp} ml-1 w-16`} /></label>
            <label className="text-sm text-cinza">Interno (d.úteis)<input type="number" value={form.prazoInternoDiasUteis} onChange={(e) => setForm({ ...form, prazoInternoDiasUteis: Number(e.target.value) })} className={`${inp} ml-1 w-16`} /></label>
            <label className="flex items-center gap-1 text-sm text-cinza"><input type="checkbox" checked={form.antecipa} onChange={(e) => setForm({ ...form, antecipa: e.target.checked })} />antecipa</label>
            <label className="flex items-center gap-1 text-sm text-cinza"><input type="checkbox" checked={form.ativa} onChange={(e) => setForm({ ...form, ativa: e.target.checked })} />ativa</label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={salvar} className="rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white">Salvar</button>
            <button type="button" onClick={() => setForm(null)} className="rounded-lg border border-linha px-3 py-1.5 text-sm">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: `page.tsx`** (server, admin)

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarMatriz } from "@/lib/obrigacoes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditorMatriz } from "./EditorMatriz";
import { listarMatriz } from "./actions";

export default async function MatrizPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarMatriz(perfil.papel)) redirect("/");
  const linhas = await listarMatriz();
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4">
      <PageHeader titulo="Matriz de obrigações" subtitulo="Obrigações e critérios de incidência usados na geração do calendário" />
      <EditorMatriz linhas={linhas} />
    </main>
  );
}
```

- [ ] **Step 6: Link no hub de Configurações** — em `src/app/(app)/configuracoes/page.tsx`, acrescentar o cartão/link para `/configuracoes/obrigacoes` (rótulo "Matriz de obrigações", desc "Obrigações e critérios de incidência."), seguindo o padrão dos itens existentes.

- [ ] **Step 7: Rodar tudo** — `npm test -- obrigacoes/matriz-render` (PASS), `npm run lint && npm run typecheck && npm run build`.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/configuracoes/obrigacoes" "src/app/(app)/configuracoes/page.tsx" src/tests/obrigacoes/matriz-render.test.tsx
git commit -m "feat(obrigacoes): matriz (admin) — CRUD, seed e link em Configurações

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Calendário global + link no Sidebar

**Files:**
- Create: `src/app/(app)/obrigacoes/page.tsx`
- Create: `src/app/(app)/obrigacoes/Calendario.tsx`
- Modify: Sidebar (link "Obrigações", gate `podeCriarCliente`)
- Test: `src/tests/obrigacoes/calendario-render.test.tsx`

**Interfaces:**
- Consumes: `listarInstancias`, `gerarCompetencia`, `InstanciaView` (Task 5); `classificarAlerta` (`@/lib/onboarding/alertas`).

- [ ] **Step 1: Smoke test**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/obrigacoes/actions", () => ({ listarInstancias: vi.fn(), gerarCompetencia: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { Calendario } from "@/app/(app)/obrigacoes/Calendario";
import type { InstanciaView } from "@/app/(app)/obrigacoes/actions";

const inst: InstanciaView[] = [{ id: "1", clienteNome: "ACME LTDA", obrigacaoNome: "PGDAS-D", obrigacaoCodigo: "PGDAS-D", periodicidade: "mensal", competencia: "2026-07-01", vencimentoLegal: "2026-08-20", vencimentoInterno: "2026-08-20", status: "pendente", responsavelNome: "Maria", meu: true }];

describe("Calendario", () => {
  it("renderiza filtros, instância e o botão de gerar", () => {
    const html = renderToStaticMarkup(<Calendario ano={2026} mes={8} instancias={inst} podeGerar={true} />);
    expect(html).toContain("ACME LTDA");
    expect(html).toContain("PGDAS-D");
    expect(html).toContain("Gerar competência");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- obrigacoes/calendario-render` → FAIL.

- [ ] **Step 3: `Calendario.tsx`** (client)

```tsx
"use client";
import { useState } from "react";
import { classificarAlerta } from "@/lib/onboarding/alertas";
import { listarInstancias, gerarCompetencia, type InstanciaView } from "./actions";

const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const rotuloComp = (iso: string, per: string) => {
  const a = iso.slice(0, 4);
  const m = Number(iso.slice(5, 7));
  if (per === "anual") return a;
  if (per === "trimestral") return `${Math.floor((m - 1) / 3) + 1}º tri/${a}`;
  return `${String(m).padStart(2, "0")}/${a}`;
};
const SELO: Record<string, string> = { em_breve: "bg-creme text-texto", vencido: "bg-negativo/10 text-negativo", critico: "bg-negativo text-white" };

export function Calendario({ ano: anoIni, mes: mesIni, instancias: iniList, podeGerar }: { ano: number; mes: number; instancias: InstanciaView[]; podeGerar: boolean }) {
  const [ano, setAno] = useState(anoIni);
  const [mes, setMes] = useState(mesIni);
  const [lista, setLista] = useState<InstanciaView[]>(iniList);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [soMeus, setSoMeus] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const anos = Array.from({ length: 5 }, (_, i) => anoIni + 1 - i);

  async function recarregar(a: number, m: number) {
    setAno(a); setMes(m); setCarregando(true);
    setLista(await listarInstancias(a, m));
    setCarregando(false);
  }
  async function gerar() {
    setCarregando(true);
    await gerarCompetencia(ano, mes);
    await recarregar(ano, mes);
  }

  const q = busca.trim().toLowerCase();
  const filtradas = lista.filter((r) => (!q || r.clienteNome.toLowerCase().includes(q) || r.obrigacaoNome.toLowerCase().includes(q)) && (!status || r.status === status) && (!soMeus || r.meu));
  const inp = "rounded-lg border border-linha px-2 py-1 text-sm";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={mes} onChange={(e) => recarregar(ano, Number(e.target.value))} className={inp}>{MES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
        <select value={ano} onChange={(e) => recarregar(Number(e.target.value), mes)} className={inp}>{anos.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inp}><option value="">Todos status</option><option value="pendente">Pendente</option><option value="dispensada">Dispensada</option></select>
        <label className="flex items-center gap-1 text-sm text-cinza"><input type="checkbox" checked={soMeus} onChange={(e) => setSoMeus(e.target.checked)} />só os meus</label>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente/obrigação" className={inp} />
        {podeGerar && <button type="button" onClick={gerar} className="ml-auto rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white">Gerar competência</button>}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead><tr className="border-b border-linha text-left text-xs text-cinza">
            <th className="px-3 py-2 font-medium">Cliente</th><th className="px-3 py-2 font-medium">Obrigação</th><th className="px-3 py-2 font-medium">Competência</th><th className="px-3 py-2 font-medium">Interno</th><th className="px-3 py-2 font-medium">Legal</th><th className="px-3 py-2 font-medium">Responsável</th><th className="px-3 py-2 font-medium">Status</th>
          </tr></thead>
          <tbody>
            {filtradas.length === 0 && <tr><td colSpan={7} className="px-3 py-3 text-cinza">{carregando ? "Carregando…" : "Nada a vencer neste mês. Use “Gerar competência”."}</td></tr>}
            {filtradas.map((r) => {
              const sev = classificarAlerta(r.vencimentoInterno, hoje);
              return (
                <tr key={r.id} className="border-b border-linha/60">
                  <td className="px-3 py-1.5 text-texto">{r.clienteNome}</td>
                  <td className="px-3 py-1.5">{r.obrigacaoNome}</td>
                  <td className="px-3 py-1.5">{rotuloComp(r.competencia, r.periodicidade)}</td>
                  <td className="px-3 py-1.5">{dataBR(r.vencimentoInterno)}</td>
                  <td className="px-3 py-1.5">{dataBR(r.vencimentoLegal)}</td>
                  <td className="px-3 py-1.5">{r.responsavelNome ?? "—"}</td>
                  <td className="px-3 py-1.5">{sev ? <span className={`rounded px-1.5 py-0.5 text-xs ${SELO[sev]}`}>{sev.replace("_", " ")}</span> : r.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `page.tsx`** (server, gate `podeCriarCliente`)

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { podeGerenciarMatriz } from "@/lib/obrigacoes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { Calendario } from "./Calendario";
import { listarInstancias } from "./actions";

export default async function ObrigacoesPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const instancias = await listarInstancias(ano, mes);
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4">
      <PageHeader titulo="Obrigações" subtitulo="Calendário de obrigações a vencer no mês" />
      <Calendario ano={ano} mes={mes} instancias={instancias} podeGerar={podeGerenciarMatriz(perfil.papel)} />
    </main>
  );
}
```

- [ ] **Step 5: Link no Sidebar** — localizar o componente de Sidebar (onde estão os links de `/onboarding`, `/atendimento`, etc.) e acrescentar item **"Obrigações"** → `/obrigacoes`, protegido pelo mesmo gate `podeCriarCliente`, no padrão dos itens existentes.

- [ ] **Step 6: Rodar tudo** — `npm test -- obrigacoes/calendario-render` (PASS), `npm run lint && npm run typecheck && npm run build`.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/obrigacoes/page.tsx" "src/app/(app)/obrigacoes/Calendario.tsx" src/tests/obrigacoes/calendario-render.test.tsx
git add -A   # inclui a modificação do Sidebar
git commit -m "feat(obrigacoes): calendário global + link no menu

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Seção Obrigações na ficha do cliente

**Files:**
- Create: `src/app/(app)/clientes/[id]/ObrigacoesCliente.tsx`
- Modify: `src/app/(app)/clientes/[id]/page.tsx` (renderizar a seção + carregar dados)

**Interfaces:**
- Consumes: `listarInstancias({ clienteId })`, `gerarCompetenciaCliente` (Task 5).

- [ ] **Step 1: `ObrigacoesCliente.tsx`** (client)

```tsx
"use client";
import { useState } from "react";
import { listarInstancias, gerarCompetenciaCliente, type InstanciaView } from "@/app/(app)/obrigacoes/actions";

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function ObrigacoesCliente({ clienteId, ano, mes, instancias: iniList, podeGerar }: { clienteId: string; ano: number; mes: number; instancias: InstanciaView[]; podeGerar: boolean }) {
  const [lista, setLista] = useState<InstanciaView[]>(iniList);
  const [carregando, setCarregando] = useState(false);
  async function gerar() {
    setCarregando(true);
    await gerarCompetenciaCliente(clienteId, ano, mes);
    setLista(await listarInstancias(ano, mes, { clienteId }));
    setCarregando(false);
  }
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-texto">Obrigações do mês</h2>
        {podeGerar && <button type="button" onClick={gerar} className="rounded-lg border border-linha px-3 py-1.5 text-sm">Gerar para este cliente</button>}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead><tr className="border-b border-linha text-left text-xs text-cinza"><th className="px-3 py-2 font-medium">Obrigação</th><th className="px-3 py-2 font-medium">Interno</th><th className="px-3 py-2 font-medium">Legal</th><th className="px-3 py-2 font-medium">Status</th></tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={4} className="px-3 py-3 text-cinza">{carregando ? "Carregando…" : "Sem obrigações a vencer neste mês."}</td></tr>}
            {lista.map((r) => (
              <tr key={r.id} className="border-b border-linha/60"><td className="px-3 py-1.5 text-texto">{r.obrigacaoNome}</td><td className="px-3 py-1.5">{dataBR(r.vencimentoInterno)}</td><td className="px-3 py-1.5">{dataBR(r.vencimentoLegal)}</td><td className="px-3 py-1.5">{r.status}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Renderizar na ficha** — em `src/app/(app)/clientes/[id]/page.tsx`, quando `podeCriarCliente(perfil.papel)`, calcular ano/mes (timezone SP), carregar `listarInstancias(ano, mes, { clienteId: id })` e renderizar `<ObrigacoesCliente clienteId={id} ano={ano} mes={mes} instancias={...} podeGerar={podeCriarCliente(perfil.papel)} />` numa seção da ficha (seguir onde a antiga `ProcessoSection`/link de onboarding é montado).

- [ ] **Step 3: Rodar tudo** — `npm run lint && npm run typecheck && npm test && npm run build`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/clientes/[id]/ObrigacoesCliente.tsx" "src/app/(app)/clientes/[id]/page.tsx"
git commit -m "feat(obrigacoes): seção de obrigações na ficha do cliente

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Obrigações e Compliance (Fatia 1):** matriz de obrigações parametrizável (Configurações → Matriz de
  obrigações, admin) com critérios de incidência (perfil/regime, flags, UF, CNAE) e regras de prazo
  (dia útil + feriados nacionais, prazo interno); **geração automática do calendário** por cliente e
  competência (mensal/trimestral/anual), via botão e cron mensal (idempotente); tela **Obrigações**
  (calendário do mês, filtros e selo de severidade) e seção na ficha do cliente.
```

- [ ] **Step 2: Commit + finalizar**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog da Fatia 1 de Obrigações

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois: `superpowers:finishing-a-development-branch`. **Passo operacional pós-merge:** agendar o pg_cron mensal (dia 1) chamando `POST /api/cron/gerar-obrigacoes` com Bearer `CRON_SECRET` — **manter desligado** até a matriz ser revisada.

---

## Self-Review

- **Cobertura do spec:** modelo de dados (T1) ✓; prazo com feriados/dia útil/interno (T2) ✓; incidência híbrida + geração por periodicidade (T3) ✓; seed starter (T4) ✓; motor + actions + cron (T5) ✓; matriz admin CRUD+seed (T6) ✓; calendário global + sidebar (T7) ✓; seção na ficha (T8) ✓; changelog + pg_cron operacional (T9) ✓. Unit (T2/T3/T4) + smoke (T6/T7).
- **Placeholders:** nenhum — todo passo tem código. Dois pontos exigem conferência do padrão real da casa (marcados com `>`): shape do `perfil` de `getPerfilAtual` (campo `id`/`papel`/`ativo`) e nomes das relações embutidas no Supabase (`obrigacao(...)`, alias `usuarios:responsavel_id`).
- **Consistência de tipos:** `RegraPrazo` (T2) usado em `ObrigacaoMatriz.regra` (T3), `seed` (T4), `motor` (T5). `InstanciaSeed`→linhas do upsert (T5). `InstanciaView` (T5) consumido por `Calendario` (T7) e `ObrigacoesCliente` (T8). `ObrigacaoRow` (T6) no `EditorMatriz`. `podeGerenciarMatriz` (T4) em T6/T7.
- **Segurança:** matriz só admin (gate + RLS); instâncias escopadas por cliente na RLS; cron por `CRON_SECRET` + `createAdminSupabase`; pg_cron desligado até revisão da matriz.
- **Escopo:** Fatia 1 (matriz + geração + visualização). Baixa/comprovante, painel de riscos e F2 ficam de fora.
