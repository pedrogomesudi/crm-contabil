# Reajuste anual de honorários em lote (BACEN) — Plano de Implementação (Fatia C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reajustar honorários em lote uma vez ao ano pelo índice de cada cliente (padrão salário mínimo, buscado no BACEN), no fluxo simular → revisar → aplicar, com trava por ano-base, histórico auditado e desfazer que limpa o rastro.

**Architecture:** Módulo `src/lib/reajuste/` com três peças testáveis em separado — `bacen.ts` (só I/O), `indice.ts` (cálculo puro) e `simulacao.ts` (montagem das linhas). O reajuste só grava `honorario_mensal`; a vigência de janeiro nasce sozinha pelo trigger da Fatia B. O desfazer usa `session_replication_role = replica` para não recriar a vigência.

**Tech Stack:** Postgres (Supabase) · Next.js 16 (Server Actions) · TypeScript · Vitest (fetch mockado via `vi.stubGlobal`) · asserts SQL em `supabase/tests/rls.test.sql`.

## Global Constraints

- Migrations via `npm run db:migrate`; **nunca** `supabase db push`. Próximas livres: **0074** e **0075**.
- **`ALTER TYPE ... ADD VALUE` e o uso do valor não podem ficar na MESMA migration** (*"unsafe use of new value of enum type"*). O runner faz `begin`/`commit` por arquivo, então `0074` (adiciona `SALARIO_MINIMO`) precisa ser um arquivo separado de `0075` (usa como `default`).
- **O reajuste não escreve vigência.** Ele grava `honorario_mensal`; o trigger `trg_honorario_vigencia` (Fatia B) cria a vigência de janeiro.
- **Desfazer suprime o trigger** com `set local session_replication_role = replica` (local à transação da função), nunca `disable trigger`.
- Séries SGS: salário mínimo **1619** (valor absoluto), IPCA **433**, IGP-M **189**, INPC **188** (variação mensal %). Reajuste 2026 pelo salário mínimo = **6,7852%** (1518 → 1621).
- `Date.now()` / `new Date()` sem argumento são proibidos **dentro de componentes** (`react-hooks/purity`).
- Rodar antes de cada commit: `npm run lint && npm run typecheck && npm test`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

- **Create** `supabase/migrations/0074_indice_salario_minimo.sql` — só o `ADD VALUE`.
- **Create** `supabase/migrations/0075_reajuste.sql` — colunas em `clientes_financeiro`, `reajuste_item`, RLS, função `desfazer_reajuste`.
- **Create** `src/lib/reajuste/indice.ts` — cálculo puro (+ `src/tests/reajuste/indice.test.ts`).
- **Create** `src/lib/reajuste/bacen.ts` — I/O do BACEN (+ `src/tests/reajuste/bacen.test.ts`, fetch mockado).
- **Create** `src/lib/reajuste/simulacao.ts` — montagem pura das linhas (+ `src/tests/reajuste/simulacao.test.ts`).
- **Create** `src/app/(app)/financeiro/reajuste/actions.ts` — `simularReajuste`, `aplicarReajusteLote`, `desfazerReajuste`.
- **Create** `src/app/(app)/financeiro/reajuste/page.tsx` e `ReajusteLote.tsx` — a tela.
- **Modify** `src/lib/financeiro/extensaoCliente.ts` — `indice_reajuste` e `percentual_reajuste` na extensão.
- **Modify** `src/components/HonorarioForm.tsx` — campos do índice.
- **Modify** `src/components/clientes/LinhaTempoVigencias.tsx` — mostra os reajustes + botão Desfazer.
- **Create** `src/components/clientes/DesfazerReajuste.tsx` — botão com confirmação inline.
- **Modify** `supabase/tests/rls.test.sql` — trava, aplicação e desfazer.
- **Modify** `docs/DOCUMENTACAO.md`.

---

### Task 1: Migration do enum (isolada)

**Files:**
- Create: `supabase/migrations/0074_indice_salario_minimo.sql`

- [ ] **Step 1: Escrever a migration**

Arquivo `supabase/migrations/0074_indice_salario_minimo.sql`:

```sql
-- SALARIO_MINIMO no enum de índice de reajuste. ISOLADO: ADD VALUE não pode conviver com o uso do
-- valor na mesma transação. O runner (db-migrate.mjs) commita por arquivo, então a 0075 já o enxerga.
alter type indice_reajuste add value if not exists 'SALARIO_MINIMO';
```

- [ ] **Step 2: Aplicar**

Run: `npm run db:migrate`
Expected: `+ aplicando: 0074_indice_salario_minimo.sql` sem erro.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0074_indice_salario_minimo.sql
git commit -m "feat(db): SALARIO_MINIMO no enum indice_reajuste (migration isolada)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Migration do schema — colunas, histórico e desfazer

**Files:**
- Create: `supabase/migrations/0075_reajuste.sql`

**Interfaces:**
- Produces: `clientes_financeiro.indice_reajuste`, `.percentual_reajuste`; tabela `reajuste_item`; função `desfazer_reajuste(uuid)`.

- [ ] **Step 1: Escrever a migration**

Arquivo `supabase/migrations/0075_reajuste.sql`:

```sql
-- Reajuste anual em lote. O índice fica no honorário do cliente; o histórico em reajuste_item
-- (único por cliente+ano = trava anti-duplicidade). O reajuste só grava honorario_mensal — a vigência
-- de janeiro nasce pelo trigger da Fatia B.

alter table clientes_financeiro
  add column if not exists indice_reajuste indice_reajuste not null default 'SALARIO_MINIMO',
  add column if not exists percentual_reajuste numeric(6,3);  -- usado só quando indice = PERCENTUAL_FIXO

create table if not exists reajuste_item (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  ano_base int not null,
  indice indice_reajuste not null,
  percentual numeric(6,3) not null,
  valor_anterior numeric(15,2) not null,
  valor_novo numeric(15,2) not null,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id),
  unique (cliente_id, ano_base)
);
create index if not exists reajuste_item_cliente_idx on reajuste_item (cliente_id, ano_base desc);

alter table reajuste_item enable row level security;
drop policy if exists reajuste_item_rw on reajuste_item;
create policy reajuste_item_rw on reajuste_item for all to authenticated
  using (auth_papel() in ('admin','financeiro'))
  with check (auth_papel() in ('admin','financeiro'));

-- Desfazer um reajuste "como se nunca tivesse acontecido": volta o honorário, remove a vigência
-- daquele mês e apaga o registro. session_replication_role = replica desliga os triggers de usuário
-- SÓ nesta transação, para que voltar o honorário não recrie a vigência (trigger da Fatia B).
create or replace function desfazer_reajuste(p_item_id uuid) returns void
  language plpgsql security definer set search_path = pg_catalog, public as $$
declare r reajuste_item; v_mes date;
begin
  select * into r from reajuste_item where id = p_item_id;
  if not found then raise exception 'reajuste não encontrado'; end if;
  v_mes := date_trunc('month', r.criado_em)::date;

  set local session_replication_role = replica;   -- não dispara trg_honorario_vigencia
  update clientes_financeiro set honorario_mensal = r.valor_anterior where cliente_id = r.cliente_id;
  set local session_replication_role = origin;

  delete from honorario_vigencia where cliente_id = r.cliente_id and vigente_de = v_mes;
  delete from reajuste_item where id = p_item_id;
end $$;
revoke all on function desfazer_reajuste(uuid) from public;
grant execute on function desfazer_reajuste(uuid) to authenticated;
```

- [ ] **Step 2: Aplicar e conferir as colunas**

Run: `npm run db:migrate`
Expected: `+ aplicando: 0075_reajuste.sql` sem erro.

Run:
```bash
node --env-file=.env.local --input-type=module -e "
import { makeClient } from './scripts/_db.mjs';
const c = makeClient(); await c.connect();
const r = await c.query(\"select column_default from information_schema.columns where table_name='clientes_financeiro' and column_name='indice_reajuste'\");
console.log('default do índice:', r.rows[0]?.column_default);
await c.end();"
```
Expected: `'SALARIO_MINIMO'::indice_reajuste`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0075_reajuste.sql
git commit -m "feat(db): índice por cliente, histórico de reajuste e desfazer

O desfazer usa session_replication_role = replica para voltar o honorário sem
disparar o trigger de vigência (senão recriaria a vigência que ele quer apagar).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Cálculo puro dos índices

**Files:**
- Create: `src/lib/reajuste/indice.ts`
- Create: `src/tests/reajuste/indice.test.ts`

**Interfaces:**
- Produces:
  - `type PontoSerie = { data: string; valor: string }`
  - `variacaoSalarioMinimo(serie: PontoSerie[], ano: number): number` — em %
  - `variacaoAcumulada(serie: PontoSerie[]): number` — em %
  - `aplicarPercentual(valorAtual: number, percentual: number): number`

- [ ] **Step 1: Escrever o teste que falha**

Arquivo `src/tests/reajuste/indice.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  variacaoSalarioMinimo,
  variacaoAcumulada,
  aplicarPercentual,
  type PontoSerie,
} from "@/lib/reajuste/indice";

const p = (data: string, valor: string): PontoSerie => ({ data, valor });

describe("variacaoSalarioMinimo", () => {
  it("usa a razão jan/N ÷ dez/(N-1) - 1 (dado real: 1518 -> 1621)", () => {
    const serie = [p("01/12/2025", "1518.00"), p("01/01/2026", "1621.00")];
    expect(variacaoSalarioMinimo(serie, 2026)).toBeCloseTo(6.7852, 3);
  });
  it("ignora meses fora de dez/(N-1) e jan/N", () => {
    const serie = [p("01/11/2025", "1500.00"), p("01/12/2025", "1518.00"), p("01/01/2026", "1621.00")];
    expect(variacaoSalarioMinimo(serie, 2026)).toBeCloseTo(6.7852, 3);
  });
  it("lança quando falta o valor de dezembro ou de janeiro", () => {
    expect(() => variacaoSalarioMinimo([p("01/01/2026", "1621.00")], 2026)).toThrow();
  });
});

describe("variacaoAcumulada", () => {
  it("faz o produtório das variações mensais (dois meses de 1% => 2,01%)", () => {
    expect(variacaoAcumulada([p("01/01/2026", "1.00"), p("01/02/2026", "1.00")])).toBeCloseTo(2.01, 4);
  });
  it("lida com variação negativa (0,5% e -0,5% => -0,0025%)", () => {
    expect(variacaoAcumulada([p("01/01/2026", "0.50"), p("01/02/2026", "-0.50")])).toBeCloseTo(-0.0025, 4);
  });
  it("série vazia => 0", () => {
    expect(variacaoAcumulada([])).toBe(0);
  });
});

describe("aplicarPercentual", () => {
  it("aplica e arredonda a 2 casas", () => {
    expect(aplicarPercentual(500, 6.7852)).toBe(533.93);
  });
  it("percentual 0 mantém o valor", () => {
    expect(aplicarPercentual(500, 0)).toBe(500);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/tests/reajuste/indice.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `src/lib/reajuste/indice.ts`**

```ts
// Cálculo puro do percentual de reajuste. Cada índice do BACEN tem uma matemática diferente:
// o salário mínimo vem como valor absoluto (razão de valores); IPCA/IGP-M/INPC vêm como variação
// mensal (produtório). Determinístico e testável — é aqui que o erro moraria.

export type PontoSerie = { data: string; valor: string }; // "01/01/2026", "1621.00"

// mês/ano de "DD/MM/AAAA"
function mesAno(data: string): { mes: number; ano: number } {
  const [, mes, ano] = data.split("/");
  return { mes: Number(mes), ano: Number(ano) };
}

// jan/N ÷ dez/(N-1) - 1, em %.
export function variacaoSalarioMinimo(serie: PontoSerie[], ano: number): number {
  let dez: number | undefined;
  let jan: number | undefined;
  for (const p of serie) {
    const { mes, ano: a } = mesAno(p.data);
    if (mes === 12 && a === ano - 1) dez = Number(p.valor);
    if (mes === 1 && a === ano) jan = Number(p.valor);
  }
  if (dez === undefined || jan === undefined || dez === 0) {
    throw new Error("Série do salário mínimo incompleta para o ano.");
  }
  return (jan / dez - 1) * 100;
}

// Produtório de (1 + var/100), -1, em %.
export function variacaoAcumulada(serie: PontoSerie[]): number {
  let fator = 1;
  for (const p of serie) fator *= 1 + Number(p.valor) / 100;
  return (fator - 1) * 100;
}

export function aplicarPercentual(valorAtual: number, percentual: number): number {
  return Math.round(valorAtual * (1 + percentual / 100) * 100) / 100;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/tests/reajuste/indice.test.ts`
Expected: PASS (10 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reajuste/indice.ts src/tests/reajuste/indice.test.ts
git commit -m "feat: cálculo puro do percentual de reajuste (salário mínimo e índices de preço)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: BACEN isolado

**Files:**
- Create: `src/lib/reajuste/bacen.ts`
- Create: `src/tests/reajuste/bacen.test.ts`

**Interfaces:**
- Consumes: `PontoSerie` (Task 3).
- Produces:
  - `const SERIE_SGS = { SALARIO_MINIMO: 1619, IPCA: 433, IGPM: 189, INPC: 188 }`
  - `buscarSerie(codigo: number, dataInicial: string, dataFinal: string): Promise<PontoSerie[]>`

- [ ] **Step 1: Escrever o teste que falha**

Arquivo `src/tests/reajuste/bacen.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { buscarSerie } from "@/lib/reajuste/bacen";

afterEach(() => vi.unstubAllGlobals());

describe("buscarSerie", () => {
  it("faz o parse do JSON do BACEN", async () => {
    const payload = [{ data: "01/01/2026", valor: "1621.00" }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })));
    const serie = await buscarSerie(1619, "01/12/2025", "01/01/2026");
    expect(serie).toEqual(payload);
  });
  it("lança em HTTP não-ok", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erro", { status: 500 })));
    await expect(buscarSerie(1619, "01/12/2025", "01/01/2026")).rejects.toThrow();
  });
  it("propaga erro de rede", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    await expect(buscarSerie(1619, "01/12/2025", "01/01/2026")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/tests/reajuste/bacen.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `src/lib/reajuste/bacen.ts`**

```ts
// Só I/O: busca séries do SGS/BACEN. Trocável (é a única peça acoplada à API). Sem cálculo aqui.
import type { PontoSerie } from "./indice";

export const SERIE_SGS = { SALARIO_MINIMO: 1619, IPCA: 433, IGPM: 189, INPC: 188 } as const;

const UA = "crm-contabil/1.0 (+integracao-bacen)";

export async function buscarSerie(
  codigo: number,
  dataInicial: string, // DD/MM/AAAA
  dataFinal: string,
): Promise<PontoSerie[]> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados?formato=json&dataInicial=${dataInicial}&dataFinal=${dataFinal}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json", "user-agent": UA } });
    if (!res.ok) throw new Error(`BACEN respondeu HTTP ${res.status}`);
    return (await res.json()) as PontoSerie[];
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/tests/reajuste/bacen.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reajuste/bacen.ts src/tests/reajuste/bacen.test.ts
git commit -m "feat: cliente BACEN isolado (séries SGS), com timeout

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Montagem pura da simulação

**Files:**
- Create: `src/lib/reajuste/simulacao.ts`
- Create: `src/tests/reajuste/simulacao.test.ts`

**Interfaces:**
- Consumes: `aplicarPercentual` (Task 3).
- Produces:
  - `type ClienteReajuste = { clienteId: string; nome: string; valorAtual: number; indice: string; percentualFixo: number | null }`
  - `type LinhaReajuste = { clienteId: string; nome: string; valorAtual: number; indice: string; percentual: number; valorNovo: number; marcada: boolean }`
  - `montarSimulacao(clientes: ClienteReajuste[], percentuais: Record<string, number>): LinhaReajuste[]`

`percentuais` mapeia índice → % (já buscado do BACEN pela action). `PERCENTUAL_FIXO` usa
`percentualFixo`; `SEM_REAJUSTE` já foi filtrado pela action e não chega aqui.

- [ ] **Step 1: Escrever o teste que falha**

Arquivo `src/tests/reajuste/simulacao.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { montarSimulacao, type ClienteReajuste } from "@/lib/reajuste/simulacao";

const clientes: ClienteReajuste[] = [
  { clienteId: "a", nome: "A", valorAtual: 500, indice: "SALARIO_MINIMO", percentualFixo: null },
  { clienteId: "b", nome: "B", valorAtual: 1000, indice: "PERCENTUAL_FIXO", percentualFixo: 10 },
];
const percentuais = { SALARIO_MINIMO: 6.7852 };

describe("montarSimulacao", () => {
  it("resolve o percentual pelo índice e calcula o valor novo", () => {
    const linhas = montarSimulacao(clientes, percentuais);
    expect(linhas[0]).toMatchObject({ clienteId: "a", percentual: 6.7852, valorNovo: 533.93, marcada: true });
  });
  it("PERCENTUAL_FIXO usa o percentual do cadastro, não o BACEN", () => {
    const linhas = montarSimulacao(clientes, percentuais);
    expect(linhas[1]).toMatchObject({ clienteId: "b", percentual: 10, valorNovo: 1100, marcada: true });
  });
  it("percentual 0 (índice indisponível) desmarca a linha", () => {
    const linhas = montarSimulacao(
      [{ clienteId: "c", nome: "C", valorAtual: 500, indice: "IPCA", percentualFixo: null }],
      {}, // IPCA ausente => 0
    );
    expect(linhas[0]).toMatchObject({ percentual: 0, valorNovo: 500, marcada: false });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/tests/reajuste/simulacao.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `src/lib/reajuste/simulacao.ts`**

```ts
import { aplicarPercentual } from "./indice";

export type ClienteReajuste = {
  clienteId: string;
  nome: string;
  valorAtual: number;
  indice: string;
  percentualFixo: number | null;
};

export type LinhaReajuste = {
  clienteId: string;
  nome: string;
  valorAtual: number;
  indice: string;
  percentual: number;
  valorNovo: number;
  marcada: boolean;
};

// Monta as linhas da simulação. `percentuais` traz índice -> % (buscado do BACEN pela action).
// PERCENTUAL_FIXO usa o percentual do cadastro. Percentual 0 (índice indisponível) desmarca a linha.
export function montarSimulacao(
  clientes: ClienteReajuste[],
  percentuais: Record<string, number>,
): LinhaReajuste[] {
  return clientes.map((c) => {
    const pct = c.indice === "PERCENTUAL_FIXO" ? (c.percentualFixo ?? 0) : (percentuais[c.indice] ?? 0);
    return {
      clienteId: c.clienteId,
      nome: c.nome,
      valorAtual: c.valorAtual,
      indice: c.indice,
      percentual: pct,
      valorNovo: aplicarPercentual(c.valorAtual, pct),
      marcada: pct !== 0,
    };
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/tests/reajuste/simulacao.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reajuste/simulacao.ts src/tests/reajuste/simulacao.test.ts
git commit -m "feat: montagem pura da simulação de reajuste

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Actions — simular, aplicar, desfazer

**Files:**
- Create: `src/app/(app)/financeiro/reajuste/actions.ts`

**Interfaces:**
- Consumes: `buscarSerie`, `SERIE_SGS`; `variacaoSalarioMinimo`, `variacaoAcumulada`; `montarSimulacao`, `LinhaReajuste`; `podeGerenciarFinanceiro`.
- Produces:
  - `simularReajuste(anoBase: number): Promise<{ erro?: string; linhas?: LinhaReajuste[]; avisoBacen?: string }>`
  - `aplicarReajusteLote(anoBase: number, itens: LinhaReajuste[]): Promise<{ erro?: string; aplicados?: number }>`
  - `desfazerReajuste(itemId: string, clienteId: string): Promise<{ erro?: string }>`

- [ ] **Step 1: Criar o arquivo**

Arquivo `src/app/(app)/financeiro/reajuste/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { buscarSerie, SERIE_SGS } from "@/lib/reajuste/bacen";
import { variacaoSalarioMinimo, variacaoAcumulada } from "@/lib/reajuste/indice";
import { montarSimulacao, type ClienteReajuste, type LinhaReajuste } from "@/lib/reajuste/simulacao";

async function permitido(): Promise<boolean> {
  const perfil = await getPerfilAtual();
  return Boolean(perfil?.ativo && podeGerenciarFinanceiro(perfil.papel));
}

// Busca o percentual de cada índice usado, uma vez por índice. Falha de rede não derruba a
// simulação: o índice fica com 0 e a tela permite digitar.
async function percentuaisDosIndices(indices: Set<string>, ano: number): Promise<{ mapa: Record<string, number>; aviso?: string }> {
  const mapa: Record<string, number> = {};
  let houveFalha = false;
  const dInicial = `01/12/${ano - 1}`;
  const dFinalSM = `01/01/${ano}`;
  const dInicialAno = `01/01/${ano}`;
  const dFinalAno = `31/12/${ano}`;
  for (const idx of indices) {
    if (idx === "PERCENTUAL_FIXO" || idx === "SEM_REAJUSTE") continue;
    try {
      if (idx === "SALARIO_MINIMO") {
        const serie = await buscarSerie(SERIE_SGS.SALARIO_MINIMO, dInicial, dFinalSM);
        mapa[idx] = Math.round(variacaoSalarioMinimo(serie, ano) * 1000) / 1000;
      } else {
        const codigo = SERIE_SGS[idx as keyof typeof SERIE_SGS];
        if (!codigo) continue;
        const serie = await buscarSerie(codigo, dInicialAno, dFinalAno);
        mapa[idx] = Math.round(variacaoAcumulada(serie) * 1000) / 1000;
      }
    } catch {
      houveFalha = true; // índice fica ausente => 0 na simulação
    }
  }
  return { mapa, aviso: houveFalha ? "Alguns índices não puderam ser buscados no BACEN — informe o percentual manualmente." : undefined };
}

export async function simularReajuste(anoBase: number): Promise<{ erro?: string; linhas?: LinhaReajuste[]; avisoBacen?: string }> {
  if (!(await permitido())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();

  // Clientes elegíveis: ativos, com honorário, índice != SEM_REAJUSTE, e SEM reajuste no ano-base.
  const { data: cli } = await supabase
    .from("clientes")
    .select("id, razao_social, clientes_financeiro!inner(honorario_mensal, indice_reajuste, percentual_reajuste), reajuste_item(ano_base)")
    .is("excluido_em", null)
    .eq("status", "ativo");

  const clientes: ClienteReajuste[] = [];
  for (const c of cli ?? []) {
    const fin = Array.isArray(c.clientes_financeiro) ? c.clientes_financeiro[0] : c.clientes_financeiro;
    const honorario = Number(fin?.honorario_mensal ?? 0);
    const indice = String(fin?.indice_reajuste ?? "SALARIO_MINIMO");
    if (honorario <= 0 || indice === "SEM_REAJUSTE") continue;
    const jaReajustado = ((c.reajuste_item as { ano_base: number }[] | null) ?? []).some((r) => r.ano_base === anoBase);
    if (jaReajustado) continue;
    clientes.push({
      clienteId: c.id,
      nome: c.razao_social,
      valorAtual: honorario,
      indice,
      percentualFixo: fin?.percentual_reajuste != null ? Number(fin.percentual_reajuste) : null,
    });
  }

  const indices = new Set(clientes.map((c) => c.indice));
  const { mapa, aviso } = await percentuaisDosIndices(indices, anoBase);
  return { linhas: montarSimulacao(clientes, mapa), avisoBacen: aviso };
}

export async function aplicarReajusteLote(anoBase: number, itens: LinhaReajuste[]): Promise<{ erro?: string; aplicados?: number }> {
  if (!(await permitido())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  let aplicados = 0;
  for (const it of itens) {
    if (!it.marcada) continue;
    // O update do honorário dispara o trigger da Fatia B, que grava a vigência de janeiro.
    const { error: e1 } = await supabase
      .from("clientes_financeiro")
      .update({ honorario_mensal: it.valorNovo })
      .eq("cliente_id", it.clienteId);
    if (e1) continue;
    const { error: e2 } = await supabase.from("reajuste_item").insert({
      cliente_id: it.clienteId,
      ano_base: anoBase,
      indice: it.indice,
      percentual: it.percentual,
      valor_anterior: it.valorAtual,
      valor_novo: it.valorNovo,
    });
    if (!e2) aplicados += 1; // a trava única barra duplicata: e2 preenchido => já reajustado
  }
  revalidatePath("/financeiro/reajuste");
  return { aplicados };
}

export async function desfazerReajuste(itemId: string, clienteId: string): Promise<{ erro?: string }> {
  if (!(await permitido())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("desfazer_reajuste", { p_item_id: itemId });
  if (error) return { erro: "Não foi possível desfazer o reajuste." };
  revalidatePath(`/clientes/${clienteId}`);
  return {};
}
```

- [ ] **Step 2: Verificar lint/typecheck**

Run: `npm run lint && npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/financeiro/reajuste/actions.ts"
git commit -m "feat: actions de reajuste — simular (BACEN), aplicar em lote, desfazer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Índice no honorário da ficha

**Files:**
- Modify: `src/lib/financeiro/extensaoCliente.ts`
- Modify: `src/components/HonorarioForm.tsx`

**Interfaces:**
- `ExtensaoFinanceira` ganha `indice_reajuste: string | null` e `percentual_reajuste: number | null`.

- [ ] **Step 1: Estender `extensaoCliente.ts`**

Adicionar ao tipo `ExtensaoFinanceira` e ao `normalizarExtensaoFinanceira` os dois campos. No tipo:

```ts
export type ExtensaoFinanceira = {
  dia_vencimento: number | null;
  qtd_funcionarios: number | null;
  faixa_faturamento: string | null;
  indice_reajuste: string | null;
  percentual_reajuste: number | null;
};
```

No `normalizarExtensaoFinanceira`, ler os campos do form (no fim, antes do `return`):

```ts
  const indiceRaw = String(fd.get("indice_reajuste") ?? "").trim();
  const INDICES = ["SALARIO_MINIMO", "IPCA", "IGPM", "INPC", "PERCENTUAL_FIXO", "SEM_REAJUSTE"];
  const indice_reajuste = INDICES.includes(indiceRaw) ? indiceRaw : "SALARIO_MINIMO";
  const pctRaw = String(fd.get("percentual_reajuste") ?? "").trim().replace(",", ".");
  let percentual_reajuste: number | null = null;
  if (indice_reajuste === "PERCENTUAL_FIXO" && pctRaw) {
    const n = Number(pctRaw);
    if (Number.isFinite(n) && n >= 0) percentual_reajuste = n;
  }
```

e incluir `indice_reajuste, percentual_reajuste` no objeto retornado.

- [ ] **Step 2: Campos no `HonorarioForm.tsx`**

O form recebe `extensao: ExtensaoFinanceiraForm`. Adicionar, junto ao campo de dia de vencimento, um
`<select name="indice_reajuste">` e um input de percentual (visível quando `PERCENTUAL_FIXO`):

```tsx
      <label className="block text-sm">
        Índice de reajuste
        <select
          name="indice_reajuste"
          defaultValue={extensao.indice_reajuste ?? "SALARIO_MINIMO"}
          className="mt-1 w-full rounded-lg border border-linha px-3 py-2 text-sm"
        >
          <option value="SALARIO_MINIMO">Salário mínimo</option>
          <option value="IPCA">IPCA</option>
          <option value="IGPM">IGP-M</option>
          <option value="INPC">INPC</option>
          <option value="PERCENTUAL_FIXO">Percentual fixo</option>
          <option value="SEM_REAJUSTE">Sem reajuste</option>
        </select>
      </label>
      <label className="block text-sm">
        Percentual fixo (%) — usado só quando o índice é "Percentual fixo"
        <input
          name="percentual_reajuste"
          inputMode="decimal"
          defaultValue={extensao.percentual_reajuste != null ? String(extensao.percentual_reajuste) : ""}
          className="mt-1 w-full rounded-lg border border-linha px-3 py-2 text-sm"
        />
      </label>
```

**Atenção:** `ExtensaoFinanceiraForm` (em `HonorarioForm.tsx`, com `data_saida`) é um tipo **diferente**
de `ExtensaoFinanceira` (em `extensaoCliente.ts`, sem `data_saida`). Acrescentar `indice_reajuste: string
| null` e `percentual_reajuste: number | null` **aos dois**.

- [ ] **Step 3: Trazer os campos na query da ficha**

Em `src/app/(app)/clientes/[id]/page.tsx`, o `select` atual é
`"honorario_mensal, dia_vencimento, qtd_funcionarios, faixa_faturamento, data_saida, cobranca_whatsapp"`.
Acrescentar `, indice_reajuste, percentual_reajuste` e repassá-los ao objeto `extensaoFinanceira` que é
passado ao `HonorarioForm`.

- [ ] **Step 4: Verificar lint/typecheck/testes**

Run: `npm run lint && npm run typecheck && npm test`
Expected: sem erros. O `extensaoCliente.test.ts` usa `toEqual` (shape exato) em vários casos —
**vai quebrar**; acrescentar `indice_reajuste: "SALARIO_MINIMO", percentual_reajuste: null` a cada objeto
esperado (o default do normalizador é `SALARIO_MINIMO`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/financeiro/extensaoCliente.ts src/components/HonorarioForm.tsx "src/app/(app)/clientes/[id]/page.tsx" src/tests/financeiro/extensaoCliente.test.ts
git commit -m "feat: índice de reajuste por cliente no honorário da ficha

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Tela do lote de reajuste

**Files:**
- Create: `src/app/(app)/financeiro/reajuste/page.tsx`
- Create: `src/app/(app)/financeiro/reajuste/ReajusteLote.tsx`

**Interfaces:**
- Consumes: `simularReajuste`, `aplicarReajusteLote`, `LinhaReajuste` (Task 6).

- [ ] **Step 1: Criar a página (gate + shell)**

Arquivo `src/app/(app)/financeiro/reajuste/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { ReajusteLote } from "./ReajusteLote";

export const metadata = { title: "Reajuste de honorários" };

export default async function ReajustePage() {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo) redirect("/login");
  if (!podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-texto">Reajuste anual de honorários</h1>
      <ReajusteLote />
    </div>
  );
}
```

- [ ] **Step 2: Criar `ReajusteLote.tsx`** (client, orquestra como o lote de NFS-e)

```tsx
"use client";
import { useState } from "react";
import { simularReajuste, aplicarReajusteLote } from "./actions";
import type { LinhaReajuste } from "@/lib/reajuste/simulacao";
import { formatarMoeda } from "@/lib/format";

const ROTULO: Record<string, string> = {
  SALARIO_MINIMO: "Salário mínimo",
  IPCA: "IPCA",
  IGPM: "IGP-M",
  INPC: "INPC",
  PERCENTUAL_FIXO: "% fixo",
};

export function ReajusteLote() {
  const [ano, setAno] = useState("");
  const [linhas, setLinhas] = useState<LinhaReajuste[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [feito, setFeito] = useState<number | null>(null);

  async function simular() {
    const anoNum = Number(ano);
    if (!anoNum) return;
    setCarregando(true);
    setFeito(null);
    const r = await simularReajuste(anoNum);
    setCarregando(false);
    if (r.erro) { setAviso(r.erro); return; }
    setLinhas(r.linhas ?? []);
    setAviso(r.avisoBacen ?? null);
  }

  function editar(id: string, patch: Partial<LinhaReajuste>) {
    setLinhas((ls) => ls.map((l) => (l.clienteId === id ? { ...l, ...patch } : l)));
  }

  async function aplicar() {
    setAplicando(true);
    const r = await aplicarReajusteLote(Number(ano), linhas);
    setAplicando(false);
    if (r.erro) { setAviso(r.erro); return; }
    setFeito(r.aplicados ?? 0);
    setLinhas([]);
  }

  const marcadas = linhas.filter((l) => l.marcada);
  const totalNovo = marcadas.reduce((s, l) => s + l.valorNovo, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm text-cinza">
          Ano-base
          <input
            value={ano}
            onChange={(e) => setAno(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="2027"
            className="ml-2 w-24 rounded-lg border border-linha px-3 py-1.5 text-sm"
          />
        </label>
        <button onClick={simular} disabled={carregando || ano.length !== 4} className="rounded-lg border border-linha bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-60">
          {carregando ? "Simulando…" : "Simular"}
        </button>
      </div>

      {aviso && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{aviso}</p>}
      {feito != null && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{feito} honorário(s) reajustado(s).</p>}

      {linhas.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-linha bg-white">
            <table className="w-full text-sm">
              <thead className="bg-creme text-left text-cinza">
                <tr>
                  <th className="p-2"></th>
                  <th className="p-2 font-medium">Cliente</th>
                  <th className="p-2 font-medium">Índice</th>
                  <th className="p-2 text-right font-medium">%</th>
                  <th className="p-2 text-right font-medium">Atual</th>
                  <th className="p-2 text-right font-medium">Novo</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.clienteId} className="border-t border-linha">
                    <td className="p-2">
                      <input type="checkbox" checked={l.marcada} onChange={(e) => editar(l.clienteId, { marcada: e.target.checked })} />
                    </td>
                    <td className="p-2 text-texto">{l.nome}</td>
                    <td className="p-2 text-cinza">{ROTULO[l.indice] ?? l.indice}</td>
                    <td className="p-2 text-right">
                      <input
                        value={String(l.percentual)}
                        onChange={(e) => {
                          const pct = Number(e.target.value.replace(",", ".")) || 0;
                          editar(l.clienteId, { percentual: pct, valorNovo: Math.round(l.valorAtual * (1 + pct / 100) * 100) / 100 });
                        }}
                        className={`w-20 rounded border px-1 py-0.5 text-right ${l.percentual < 0 ? "border-negativo text-negativo" : "border-linha"}`}
                      />
                    </td>
                    <td className="p-2 text-right tabular-nums text-cinza">{formatarMoeda(l.valorAtual)}</td>
                    <td className="p-2 text-right tabular-nums">{formatarMoeda(l.valorNovo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-cinza">{marcadas.length} marcados · novo total {formatarMoeda(totalNovo)}</span>
            <button onClick={aplicar} disabled={aplicando || marcadas.length === 0} className="rounded-lg bg-verde px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60">
              {aplicando ? "Aplicando…" : `Aplicar ${marcadas.length}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Adicionar o link no hub financeiro**

Em `src/app/(app)/financeiro/cadastros/page.tsx` (ou no hub onde ficam os atalhos financeiros),
acrescentar um card/link para `/financeiro/reajuste` — "Reajuste anual de honorários". Seguir o padrão
dos links já presentes ali.

- [ ] **Step 4: Verificar lint/typecheck/build**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: sem erros; build compila.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/financeiro/reajuste/page.tsx" "src/app/(app)/financeiro/reajuste/ReajusteLote.tsx" "src/app/(app)/financeiro/cadastros/page.tsx"
git commit -m "feat: tela do reajuste anual em lote (simular, revisar, aplicar)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Histórico de reajuste e desfazer na ficha

**Files:**
- Create: `src/components/clientes/DesfazerReajuste.tsx`
- Modify: `src/components/clientes/LinhaTempoVigencias.tsx`

**Interfaces:**
- Consumes: `desfazerReajuste` (Task 6).

- [ ] **Step 1: Criar `DesfazerReajuste.tsx`** (confirmação inline, sem `window.confirm`)

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { desfazerReajuste } from "@/app/(app)/financeiro/reajuste/actions";

export function DesfazerReajuste({ itemId, clienteId }: { itemId: string; clienteId: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();

  if (!confirmando)
    return (
      <button onClick={() => setConfirmando(true)} className="rounded border border-linha px-2 py-0.5 text-xs text-cinza">
        Desfazer
      </button>
    );

  return (
    <span className="flex items-center gap-1 text-xs">
      <button
        disabled={pend}
        onClick={() =>
          start(async () => {
            setErro(null);
            const r = await desfazerReajuste(itemId, clienteId);
            if (r.erro) setErro(r.erro);
            else router.refresh();
          })
        }
        className="rounded bg-negativo px-2 py-0.5 text-white disabled:opacity-60"
      >
        {pend ? "…" : "Confirmar"}
      </button>
      <button onClick={() => setConfirmando(false)} className="rounded border border-linha px-2 py-0.5">
        Voltar
      </button>
      {erro && <span role="alert" className="text-negativo">{erro}</span>}
    </span>
  );
}
```

- [ ] **Step 2: Mostrar os reajustes em `LinhaTempoVigencias.tsx`**

Carregar os reajustes do cliente (o componente já é server e já busca vigências) e listar, com o botão.
Acrescentar a query e um terceiro bloco:

```tsx
    supabase
      .from("reajuste_item")
      .select("id, ano_base, indice, percentual, valor_anterior, valor_novo")
      .eq("cliente_id", clienteId)
      .order("ano_base", { ascending: false }),
```

e, no JSX, abaixo dos dois blocos existentes:

```tsx
      {rej?.length ? (
        <div>
          <h3 className="mb-1 text-xs font-medium text-cinza">Reajustes aplicados</h3>
          <ul className="space-y-1 text-sm">
            {rej.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <span className="tabular-nums text-cinza">{r.ano_base}</span>
                <span className="text-texto">
                  {r.indice} {Number(r.percentual).toFixed(2)}% · {formatarMoeda(Number(r.valor_anterior))} →{" "}
                  {formatarMoeda(Number(r.valor_novo))}
                </span>
                <DesfazerReajuste itemId={r.id} clienteId={clienteId} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
```

(Adicionar o import de `DesfazerReajuste` e incluir `reajuste_item` no `Promise.all`.)

- [ ] **Step 3: Verificar lint/typecheck/build**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/clientes/DesfazerReajuste.tsx src/components/clientes/LinhaTempoVigencias.tsx
git commit -m "feat: histórico de reajustes e desfazer na ficha do cliente

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Asserts SQL — trava, aplicação e desfazer

**Files:**
- Modify: `supabase/tests/rls.test.sql`

- [ ] **Step 1: Acrescentar o bloco ao final de `supabase/tests/rls.test.sql`**

```sql
-- ===== Reajuste: trava por ano, aplicação cria vigência, desfazer limpa o rastro =====
do $$
declare n int; v numeric; v_mes date := date_trunc('month', now())::date; v_item uuid;
begin
  reset role;
  insert into clientes (id, tipo_pessoa, razao_social, cpf_cnpj, regime_tributario)
    values ('aaaaaaaa-0000-0000-0000-0000000000fa','PJ','Cli Reajuste','55000000000888','Simples')
    on conflict do nothing;
  insert into clientes_financeiro (cliente_id, honorario_mensal)
    values ('aaaaaaaa-0000-0000-0000-0000000000fa', 500.00)
    on conflict (cliente_id) do update set honorario_mensal = 500.00;

  -- limpa vigências criadas pelo insert acima, para medir só o efeito do reajuste
  delete from honorario_vigencia where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000fa';

  -- aplica um reajuste: sobe o honorário (cria a vigência via trigger) + registra
  update clientes_financeiro set honorario_mensal = 533.93 where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000fa';
  insert into reajuste_item (cliente_id, ano_base, indice, percentual, valor_anterior, valor_novo)
    values ('aaaaaaaa-0000-0000-0000-0000000000fa', 2027, 'SALARIO_MINIMO', 6.785, 500.00, 533.93)
    returning id into v_item;

  select count(*) into n from honorario_vigencia
    where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000fa' and vigente_de = v_mes;
  if n <> 1 then raise exception 'FALHA: reajuste não criou a vigência (n=%)', n; end if;
  raise notice 'OK: aplicar reajuste cria a vigência (via trigger da Fatia B)';

  -- trava: um segundo reajuste no mesmo ano-base é barrado
  begin
    insert into reajuste_item (cliente_id, ano_base, indice, percentual, valor_anterior, valor_novo)
      values ('aaaaaaaa-0000-0000-0000-0000000000fa', 2027, 'IPCA', 5, 533.93, 560.00);
    raise exception 'FALHA: a trava por ano-base não barrou o segundo reajuste';
  exception when unique_violation then
    raise notice 'OK: trava (cliente, ano_base) barra reajuste duplicado';
  end;

  -- desfazer: volta o honorário, remove a vigência do mês e apaga o registro — sem rastro.
  -- Mede a vigência pelo MESMO mês que a função usa (date_trunc do criado_em do item), robusto
  -- a rodar o teste na virada de mês.
  select date_trunc('month', criado_em)::date into v_mes from reajuste_item where id = v_item;
  perform desfazer_reajuste(v_item);
  select honorario_mensal into v from clientes_financeiro where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000fa';
  if v <> 500.00 then raise exception 'FALHA: desfazer não voltou o honorário (=%)', v; end if;
  select count(*) into n from honorario_vigencia
    where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000fa' and vigente_de = v_mes;
  if n <> 0 then raise exception 'FALHA: desfazer não removeu a vigência (n=%)', n; end if;
  select count(*) into n from reajuste_item where id = v_item;
  if n <> 0 then raise exception 'FALHA: desfazer não removeu o registro'; end if;
  raise notice 'OK: desfazer volta o honorário, remove a vigência e o registro (sem rastro)';
end $$;
```

- [ ] **Step 2: Rodar os testes**

Run: `npm run db:test`
Expected: todos passam, incluindo os três novos `OK:`.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/rls.test.sql
git commit -m "test(db): trava por ano, vigência no reajuste e desfazer sem rastro

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Documentação

**Files:**
- Modify: `docs/DOCUMENTACAO.md`

- [ ] **Step 1: Documentar no módulo Financeiro (seção 3.10)**

Acrescentar depois do bloco de vigências:

```markdown
- **Reajuste anual em lote (`/financeiro/reajuste`):** reajusta os honorários uma vez ao ano pelo índice
  de cada cliente — padrão **salário mínimo**, com IPCA/IGP-M/INPC (buscados no **BACEN**, séries SGS),
  percentual fixo ou "sem reajuste". Fluxo **simular → revisar → aplicar**: o percentual vem
  pré-preenchido e editável por linha; desmarca-se quem não entra. O reajuste só grava o honorário — a
  vigência de janeiro nasce pelo trigger. Um cliente já reajustado no **ano-base** fica fora do lote
  (trava). A ficha mostra os reajustes com **Desfazer**, que volta o honorário e remove a vigência,
  como se não tivesse acontecido.
```

- [ ] **Step 2: Commit**

```bash
git add docs/DOCUMENTACAO.md
git commit -m "docs: reajuste anual em lote via BACEN

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verificação final

- [ ] `npm run lint && npm run typecheck && npm test` — tudo verde.
- [ ] `npm run build` — compila.
- [ ] `npm run db:test` — asserts verdes, incluindo os três novos.
- [ ] **Validação manual** (após deploy): num cliente de teste, deixar índice = Salário mínimo; em
      `/financeiro/reajuste`, ano-base 2026 → o % deve vir **6,79** e o valor novo calculado; aplicar →
      a ficha mostra o reajuste e uma vigência de honorário do mês; **Desfazer** → honorário e linha do
      tempo voltam ao estado anterior.
