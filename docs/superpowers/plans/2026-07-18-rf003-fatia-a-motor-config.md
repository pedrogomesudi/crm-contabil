# RF-003 — Fatia A (motor + configuração) — Plano

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.
> Spec: `docs/superpowers/specs/2026-07-18-rf003-precificacao-honorarios-design.md`.

**Objetivo:** a fundação da RF-003 — a função pura `calcularHonorario` (testada), as 6 tabelas de
configuração semeadas, e a tela **Configurações → Precificação** onde o escritório define bases, faixas/
unidade, complexidade, serviços, piso e desconto máximo.

**Arquitetura:** motor puro em `lib/comercial/precificacao.ts` (sem banco/UI). Config em tabelas
normalizadas com RLS; mutações via server actions com gate admin (padrão do funil). A tela é um conjunto de
blocos autocontidos. A calculadora em si é das Fatias B/C — aqui só o motor e a config.

**Stack:** Next.js 16 (Server Actions), Supabase (Postgres + RLS), TypeScript, vitest.

## Global Constraints

- **`ganho`/`perdido` não se aplicam** — isto é precificação, não funil.
- **Regimes** reusam `REGIMES` de `@/lib/tipos` (`Simples`/`Presumido`/`Real`/`MEI`/`Isento/PF`).
- **Ordem do cálculo (verbatim da spec):** base do regime → acréscimos (faixa ou unidade) → × complexidade
  → + serviços mensais → − desconto (limitado ao teto) → **piso depois do desconto**
  (`mensal = max(valorMinimo, recorrente)`). Serviços `unico` ficam à parte, **sem desconto**.
- **Config = tabelas normalizadas**, não `jsonb`. `precificacao_config` é singleton (uma linha).
- **Gate:** a tela e as mutações são **admin** (config de escritório, como Custos/SLA/Funil).
- **Migrations idempotentes** (`create table if not exists`, seeds com `where not exists`,
  `drop policy if exists`); aplicar com `npm run db:migrate`. **Migration em produção antes do deploy.**
- **`main` protegido:** PR `develop → main`, `verify` verde. Release com bump + CHANGELOG no mesmo PR.
  Deploy manual (Implantar + `/api/health`); tag depois.
- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`,
  `npm run build`.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `supabase/migrations/0102_precificacao.sql` | **Criar** — 6 tabelas + seeds + RLS | 1 |
| `src/lib/comercial/precificacao.ts` | **Criar** — motor puro `calcularHonorario` + auxiliares | 2 |
| `src/tests/comercial/precificacao.test.ts` | **Criar** — testes do motor | 2 |
| `src/app/(app)/configuracoes/precificacao/actions.ts` | **Criar** — load + saves (gate admin) | 3 |
| `src/app/(app)/configuracoes/precificacao/page.tsx` | **Criar** — página server | 4 |
| `src/app/(app)/configuracoes/precificacao/FormPrecificacao.tsx` | **Criar** — blocos regime/complexidade/serviços/globais | 4 |
| `src/app/(app)/configuracoes/precificacao/BlocoFatores.tsx` | **Criar** — bloco por fator (faixas/unidade) | 5 |
| `src/tests/comercial/precificacao-render.test.tsx` | **Criar** — render da config | 4 |
| `src/app/(app)/configuracoes/page.tsx` | **Modificar** — item no hub | 6 |
| `CHANGELOG.md` + `package.json` | **Modificar** — release 6.14.0 | 6 |

---

### Task 1: Migration `precificacao`

**Files:**
- Create: `supabase/migrations/0102_precificacao.sql`

**Interfaces:**
- Produces: tabelas `precificacao_regime_base`, `precificacao_fator`, `precificacao_faixa`,
  `precificacao_complexidade`, `precificacao_servico`, `precificacao_config` (semeadas).

- [ ] **Step 1: Escrever a migration**

```sql
-- RF-003 Fatia A: tabelas de configuração da precificação de honorários (um escritório).
-- Leitura para o comercial; a EDIÇÃO fica atrás de gate admin nas actions.

create table if not exists precificacao_regime_base (
  regime text primary key,
  valor_base numeric(12,2) not null default 0
);

create table if not exists precificacao_fator (
  fator text primary key,                 -- 'faturamento' | 'funcionarios' | 'notas'
  modo text not null default 'faixas',    -- 'faixas' | 'unidade'
  valor_unitario numeric(12,2) not null default 0,
  franquia numeric(14,2) not null default 0
);
do $$ begin
  alter table precificacao_fator drop constraint if exists precificacao_fator_modo_chk;
  alter table precificacao_fator add constraint precificacao_fator_modo_chk check (modo in ('faixas','unidade'));
end $$;

create table if not exists precificacao_faixa (
  id uuid primary key default gen_random_uuid(),
  fator text not null references precificacao_fator(fator) on delete cascade,
  ate numeric(14,2),                      -- null = sem teto
  valor numeric(12,2) not null default 0,
  ordem int not null
);

create table if not exists precificacao_complexidade (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  multiplicador numeric(5,3) not null default 1.0,
  ordem int not null
);

create table if not exists precificacao_servico (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  valor numeric(12,2) not null default 0,
  recorrencia text not null default 'mensal',   -- 'mensal' | 'unico'
  ativo boolean not null default true,
  ordem int not null
);
do $$ begin
  alter table precificacao_servico drop constraint if exists precificacao_servico_rec_chk;
  alter table precificacao_servico add constraint precificacao_servico_rec_chk check (recorrencia in ('mensal','unico'));
end $$;

create table if not exists precificacao_config (
  id boolean primary key default true,
  valor_minimo numeric(12,2) not null default 0,
  desconto_maximo_pct numeric(5,2) not null default 0
);
do $$ begin
  alter table precificacao_config drop constraint if exists precificacao_config_id_chk;
  alter table precificacao_config add constraint precificacao_config_id_chk check (id);
end $$;

-- RLS: leitura/escrita para o comercial (a edição é limitada a admin na action).
do $$
declare t text;
begin
  foreach t in array array[
    'precificacao_regime_base','precificacao_fator','precificacao_faixa',
    'precificacao_complexidade','precificacao_servico','precificacao_config'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t||'_rw', t);
    execute format(
      'create policy %I on %I for all using (auth_papel() in (''admin'',''assistente'',''contador'')) with check (auth_papel() in (''admin'',''assistente'',''contador''))',
      t||'_rw', t);
  end loop;
end $$;

-- Seeds idempotentes.
insert into precificacao_regime_base (regime)
select v from (values ('Simples'),('Presumido'),('Real'),('MEI'),('Isento/PF')) as r(v)
where not exists (select 1 from precificacao_regime_base b where b.regime = r.v);

insert into precificacao_fator (fator)
select v from (values ('faturamento'),('funcionarios'),('notas')) as f(v)
where not exists (select 1 from precificacao_fator x where x.fator = f.v);

insert into precificacao_complexidade (nome, multiplicador, ordem)
select v.nome, v.mult, v.ordem from (values ('Baixa',1.0,1),('Média',1.2,2),('Alta',1.5,3)) as v(nome,mult,ordem)
where not exists (select 1 from precificacao_complexidade c where c.nome = v.nome);

insert into precificacao_config (id) select true
where not exists (select 1 from precificacao_config);
```

- [ ] **Step 2: Aplicar no dev**

Run: `npm run db:migrate`
Expected: aplica `0102`. Se `SUPABASE_DB_URL` faltar, avisar o Pedro.

- [ ] **Step 3: Conferir os seeds**

```bash
node --env-file=.env.local -e '
import("@supabase/supabase-js").then(async ({createClient})=>{
  const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
  for (const t of ["precificacao_regime_base","precificacao_fator","precificacao_complexidade","precificacao_config"]) {
    const {count}=await s.from(t).select("*",{count:"exact",head:true});
    console.log(t, count);
  }
});' 2>&1 | grep -v "punycode\|Deprecation\|--trace"
```
Expected: `regime_base 5`, `fator 3`, `complexidade 3`, `config 1`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0102_precificacao.sql
git commit -m "feat(db): tabelas de precificacao de honorarios (RF-003 fatia A)"
```

---

### Task 2: O motor puro `precificacao.ts`

**Files:**
- Create: `src/lib/comercial/precificacao.ts`
- Test: `src/tests/comercial/precificacao.test.ts`

**Interfaces:**
- Produces:
  - `type ModoFator = "faixas" | "unidade"`
  - `type Fator = { modo: ModoFator; valorUnitario: number; franquia: number; faixas: { ate: number | null; valor: number }[] }`
  - `type ConfigPreco = { baseRegime: Record<string, number>; faturamento: Fator; funcionarios: Fator; notas: Fator; complexidades: { id: string; multiplicador: number }[]; servicos: { id: string; valor: number; recorrencia: "mensal" | "unico" }[]; valorMinimo: number; descontoMaximoPct: number }`
  - `type Parametros = { regime: string; faturamento: number; funcionarios: number; notas: number; complexidadeId: string | null; servicoIds: string[]; descontoPct: number }`
  - `type Linha = { rotulo: string; valor: number }`
  - `type Resultado = { mensal: number; unico: number; detalhamento: Linha[] }`
  - `acrescimoFator(fator: Fator, valor: number): number`
  - `multiplicador(complexidades: { id: string; multiplicador: number }[], id: string | null): number`
  - `calcularHonorario(p: Parametros, cfg: ConfigPreco): Resultado`

- [ ] **Step 1: Escrever os testes que falham**

```ts
import { describe, it, expect } from "vitest";
import { acrescimoFator, multiplicador, calcularHonorario, type ConfigPreco } from "@/lib/comercial/precificacao";

const faixas = { modo: "faixas" as const, valorUnitario: 0, franquia: 0, faixas: [
  { ate: 50000, valor: 0 },
  { ate: 200000, valor: 150 },
  { ate: null, valor: 400 },
] };
const unidade = { modo: "unidade" as const, valorUnitario: 25, franquia: 5, faixas: [] };
const semAcrescimo = { modo: "faixas" as const, valorUnitario: 0, franquia: 0, faixas: [{ ate: null, valor: 0 }] };

describe("acrescimoFator", () => {
  it("faixas: pega a primeira faixa cuja 'ate' cobre o valor; a última (∞) é o resto", () => {
    expect(acrescimoFator(faixas, 30000)).toBe(0);
    expect(acrescimoFator(faixas, 120000)).toBe(150);
    expect(acrescimoFator(faixas, 900000)).toBe(400);
  });
  it("unidade: valorUnitario × (valor acima da franquia)", () => {
    expect(acrescimoFator(unidade, 3)).toBe(0); // abaixo da franquia
    expect(acrescimoFator(unidade, 8)).toBe(75); // (8-5)*25
  });
});

describe("multiplicador", () => {
  it("acha pelo id; 1 se não houver", () => {
    const cs = [{ id: "c1", multiplicador: 1.2 }];
    expect(multiplicador(cs, "c1")).toBe(1.2);
    expect(multiplicador(cs, null)).toBe(1);
    expect(multiplicador(cs, "x")).toBe(1);
  });
});

const cfg: ConfigPreco = {
  baseRegime: { Simples: 500, Presumido: 800 },
  faturamento: faixas,
  funcionarios: unidade,
  notas: semAcrescimo,
  complexidades: [{ id: "media", multiplicador: 1.2 }],
  servicos: [
    { id: "folha", valor: 200, recorrencia: "mensal" },
    { id: "abertura", valor: 900, recorrencia: "unico" },
  ],
  valorMinimo: 400,
  descontoMaximoPct: 20,
};

describe("calcularHonorario", () => {
  it("compõe base + acréscimos × complexidade + serviços − desconto, com piso depois", () => {
    const r = calcularHonorario(
      { regime: "Simples", faturamento: 120000, funcionarios: 8, notas: 0, complexidadeId: "media", servicoIds: ["folha", "abertura"], descontoPct: 10 },
      cfg,
    );
    // base 500 + fat 150 + func (8-5)*25=75 + notas 0 = 725; ×1.2 = 870; + folha 200 = 1070;
    // desconto 10% = 107 → 963; piso 400 não incide. unico = 900.
    expect(r.mensal).toBeCloseTo(963);
    expect(r.unico).toBeCloseTo(900);
  });
  it("desconto respeita o teto e o piso é o chão final", () => {
    const r = calcularHonorario(
      { regime: "Simples", faturamento: 10000, funcionarios: 0, notas: 0, complexidadeId: null, servicoIds: [], descontoPct: 90 },
      cfg,
    );
    // base 500; ×1 = 500; desconto limitado a 20% = 100 → 400; piso 400 → 400.
    expect(r.mensal).toBeCloseTo(400);
  });
  it("regime sem base cai em 0 e o piso garante o mínimo", () => {
    const r = calcularHonorario(
      { regime: "Inexistente", faturamento: 0, funcionarios: 0, notas: 0, complexidadeId: null, servicoIds: [], descontoPct: 0 },
      cfg,
    );
    expect(r.mensal).toBeCloseTo(400); // 0 → piso
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/precificacao.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `precificacao.ts`**

```ts
export type ModoFator = "faixas" | "unidade";
export type Fator = { modo: ModoFator; valorUnitario: number; franquia: number; faixas: { ate: number | null; valor: number }[] };
export type ConfigPreco = {
  baseRegime: Record<string, number>;
  faturamento: Fator;
  funcionarios: Fator;
  notas: Fator;
  complexidades: { id: string; multiplicador: number }[];
  servicos: { id: string; valor: number; recorrencia: "mensal" | "unico" }[];
  valorMinimo: number;
  descontoMaximoPct: number;
};
export type Parametros = {
  regime: string;
  faturamento: number;
  funcionarios: number;
  notas: number;
  complexidadeId: string | null;
  servicoIds: string[];
  descontoPct: number;
};
export type Linha = { rotulo: string; valor: number };
export type Resultado = { mensal: number; unico: number; detalhamento: Linha[] };

export function acrescimoFator(fator: Fator, valor: number): number {
  if (fator.modo === "unidade") {
    return fator.valorUnitario * Math.max(0, valor - fator.franquia);
  }
  // faixas: na ordem dada, a primeira cuja 'ate' cobre o valor; a última (ate=null) é o resto.
  for (const f of fator.faixas) {
    if (f.ate == null || valor <= f.ate) return f.valor;
  }
  return 0;
}

export function multiplicador(complexidades: { id: string; multiplicador: number }[], id: string | null): number {
  if (!id) return 1;
  return complexidades.find((c) => c.id === id)?.multiplicador ?? 1;
}

export function calcularHonorario(p: Parametros, cfg: ConfigPreco): Resultado {
  const det: Linha[] = [];
  const base = cfg.baseRegime[p.regime] ?? 0;
  det.push({ rotulo: `Base (${p.regime})`, valor: base });

  const aFat = acrescimoFator(cfg.faturamento, p.faturamento);
  const aFunc = acrescimoFator(cfg.funcionarios, p.funcionarios);
  const aNotas = acrescimoFator(cfg.notas, p.notas);
  if (aFat) det.push({ rotulo: "Faturamento", valor: aFat });
  if (aFunc) det.push({ rotulo: "Funcionários", valor: aFunc });
  if (aNotas) det.push({ rotulo: "Notas", valor: aNotas });

  const mult = multiplicador(cfg.complexidades, p.complexidadeId);
  let recorrente = (base + aFat + aFunc + aNotas) * mult;
  if (mult !== 1) det.push({ rotulo: `Complexidade (×${mult})`, valor: recorrente - (base + aFat + aFunc + aNotas) });

  const marcados = cfg.servicos.filter((s) => p.servicoIds.includes(s.id));
  for (const s of marcados.filter((s) => s.recorrencia === "mensal")) {
    recorrente += s.valor;
    det.push({ rotulo: "Serviço (mensal)", valor: s.valor });
  }
  const unico = marcados.filter((s) => s.recorrencia === "unico").reduce((t, s) => t + s.valor, 0);

  const pct = Math.min(p.descontoPct, cfg.descontoMaximoPct);
  const desconto = recorrente * (pct / 100);
  if (desconto) det.push({ rotulo: `Desconto (${pct}%)`, valor: -desconto });
  recorrente -= desconto;

  const mensal = Math.max(cfg.valorMinimo, recorrente);
  if (mensal !== recorrente) det.push({ rotulo: "Piso aplicado", valor: mensal - recorrente });

  return { mensal, unico, detalhamento: det };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/comercial/precificacao.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comercial/precificacao.ts src/tests/comercial/precificacao.test.ts
git commit -m "feat(comercial): motor puro de precificacao de honorarios (calcularHonorario)"
```

---

### Task 3: Server actions da configuração

**Files:**
- Create: `src/app/(app)/configuracoes/precificacao/actions.ts`

**Interfaces:**
- Produces (load pública ao comercial; **mutações com gate admin**, cada uma com
  `revalidatePath("/configuracoes/precificacao")` + `revalidatePath("/comercial/precificacao")`):
  - `type PrecificacaoView = { regimes: {regime:string; valorBase:number}[]; fatores: {fator:string; modo:string; valorUnitario:number; franquia:number; faixas:{id:string; ate:number|null; valor:number; ordem:number}[]}[]; complexidades: {id:string; nome:string; multiplicador:number; ordem:number}[]; servicos: {id:string; nome:string; valor:number; recorrencia:string; ativo:boolean; ordem:number}[]; global: {valorMinimo:number; descontoMaximoPct:number} }`
  - `carregarPrecificacao(): Promise<PrecificacaoView>`
  - `salvarBaseRegime(regime: string, valor: number): Promise<Resp>`
  - `definirModoFator(fator: string, modo: "faixas"|"unidade"): Promise<Resp>`
  - `salvarUnidadeFator(fator: string, valorUnitario: number, franquia: number): Promise<Resp>`
  - `criarFaixa(fator: string): Promise<Resp>` · `salvarFaixa(id: string, ate: number|null, valor: number): Promise<Resp>` · `removerFaixa(id: string): Promise<Resp>` · `reordenarFaixas(ids: string[]): Promise<Resp>`
  - `criarComplexidade(nome: string): Promise<Resp>` · `salvarComplexidade(id: string, nome: string, multiplicador: number): Promise<Resp>` · `removerComplexidade(id: string): Promise<Resp>` · `reordenarComplexidades(ids: string[]): Promise<Resp>`
  - `criarServico(nome: string): Promise<Resp>` · `salvarServico(id: string, dados: {nome:string; valor:number; recorrencia:"mensal"|"unico"; ativo:boolean}): Promise<Resp>` · `removerServico(id: string): Promise<Resp>` · `reordenarServicos(ids: string[]): Promise<Resp>`
  - `salvarGlobais(valorMinimo: number, descontoMaximoPct: number): Promise<Resp>`
  - `type Resp = { ok?: boolean; erro?: string }`

- [ ] **Step 1: Escrever o cabeçalho + load + os helpers comuns**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";

type Resp = { ok?: boolean; erro?: string };
export type PrecificacaoView = {
  regimes: { regime: string; valorBase: number }[];
  fatores: { fator: string; modo: string; valorUnitario: number; franquia: number; faixas: { id: string; ate: number | null; valor: number; ordem: number }[] }[];
  complexidades: { id: string; nome: string; multiplicador: number; ordem: number }[];
  servicos: { id: string; nome: string; valor: number; recorrencia: string; ativo: boolean; ordem: number }[];
  global: { valorMinimo: number; descontoMaximoPct: number };
};

async function admin() {
  const p = await getPerfilAtual();
  return p?.ativo && p.papel === "admin" ? p : null;
}
function revalidar() {
  revalidatePath("/configuracoes/precificacao");
  revalidatePath("/comercial/precificacao");
}

export async function carregarPrecificacao(): Promise<PrecificacaoView> {
  const s = await createServerSupabase();
  const [rb, ft, fx, cx, sv, cfg] = await Promise.all([
    s.from("precificacao_regime_base").select("regime, valor_base"),
    s.from("precificacao_fator").select("fator, modo, valor_unitario, franquia"),
    s.from("precificacao_faixa").select("id, fator, ate, valor, ordem").order("ordem"),
    s.from("precificacao_complexidade").select("id, nome, multiplicador, ordem").order("ordem"),
    s.from("precificacao_servico").select("id, nome, valor, recorrencia, ativo, ordem").order("ordem"),
    s.from("precificacao_config").select("valor_minimo, desconto_maximo_pct").maybeSingle(),
  ]);
  const faixasDe = (fator: string) =>
    (fx.data ?? [])
      .filter((f) => f.fator === fator)
      .map((f) => ({ id: f.id as string, ate: f.ate != null ? Number(f.ate) : null, valor: Number(f.valor), ordem: f.ordem as number }));
  return {
    regimes: (rb.data ?? []).map((r) => ({ regime: r.regime as string, valorBase: Number(r.valor_base) })),
    fatores: (ft.data ?? []).map((f) => ({
      fator: f.fator as string,
      modo: f.modo as string,
      valorUnitario: Number(f.valor_unitario),
      franquia: Number(f.franquia),
      faixas: faixasDe(f.fator as string),
    })),
    complexidades: (cx.data ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string, multiplicador: Number(c.multiplicador), ordem: c.ordem as number })),
    servicos: (sv.data ?? []).map((v) => ({ id: v.id as string, nome: v.nome as string, valor: Number(v.valor), recorrencia: v.recorrencia as string, ativo: v.ativo as boolean, ordem: v.ordem as number })),
    global: { valorMinimo: Number(cfg.data?.valor_minimo ?? 0), descontoMaximoPct: Number(cfg.data?.desconto_maximo_pct ?? 0) },
  };
}
```

- [ ] **Step 2: Escrever as mutações**

Todas seguem o mesmo esqueleto — gate `admin()`, validação, `update/insert/delete`, `revalidar()`. Escrever
uma de cada tipo por extenso e replicar o padrão para as demais (tabela/colunas indicadas na assinatura):

```ts
// escalar por linha fixa (regime é PK): upsert
export async function salvarBaseRegime(regime: string, valor: number): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!Number.isFinite(valor) || valor < 0) return { erro: "Valor inválido." };
  const s = await createServerSupabase();
  const { error } = await s.from("precificacao_regime_base").upsert({ regime, valor_base: valor }, { onConflict: "regime" });
  if (error) return { erro: "Falha ao salvar." };
  revalidar();
  return { ok: true };
}

// fator: modo
export async function definirModoFator(fator: string, modo: "faixas" | "unidade"): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const s = await createServerSupabase();
  const { error } = await s.from("precificacao_fator").update({ modo }).eq("fator", fator);
  if (error) return { erro: "Falha ao salvar." };
  revalidar();
  return { ok: true };
}

// fator: unidade
export async function salvarUnidadeFator(fator: string, valorUnitario: number, franquia: number): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!Number.isFinite(valorUnitario) || valorUnitario < 0 || !Number.isFinite(franquia) || franquia < 0)
    return { erro: "Valores inválidos." };
  const s = await createServerSupabase();
  const { error } = await s.from("precificacao_fator").update({ valor_unitario: valorUnitario, franquia }).eq("fator", fator);
  if (error) return { erro: "Falha ao salvar." };
  revalidar();
  return { ok: true };
}

// criar linha (faixa): ordem = (max+1) do fator
export async function criarFaixa(fator: string): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const s = await createServerSupabase();
  const { data } = await s.from("precificacao_faixa").select("ordem").eq("fator", fator);
  const ordem = (data ?? []).reduce((m, r) => Math.max(m, r.ordem as number), 0) + 1;
  const { error } = await s.from("precificacao_faixa").insert({ fator, ate: null, valor: 0, ordem });
  if (error) return { erro: "Falha ao criar a faixa." };
  revalidar();
  return { ok: true };
}

// salvar linha (faixa)
export async function salvarFaixa(id: string, ate: number | null, valor: number): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!Number.isFinite(valor) || valor < 0 || (ate != null && (!Number.isFinite(ate) || ate < 0)))
    return { erro: "Valores inválidos." };
  const s = await createServerSupabase();
  const { error } = await s.from("precificacao_faixa").update({ ate, valor }).eq("id", id);
  if (error) return { erro: "Falha ao salvar." };
  revalidar();
  return { ok: true };
}

// remover linha (faixa)
export async function removerFaixa(id: string): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const s = await createServerSupabase();
  const { error } = await s.from("precificacao_faixa").delete().eq("id", id);
  if (error) return { erro: "Falha ao remover." };
  revalidar();
  return { ok: true };
}

// reordenar (grava ordem = índice+1)
export async function reordenarFaixas(ids: string[]): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const s = await createServerSupabase();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await s.from("precificacao_faixa").update({ ordem: i + 1 }).eq("id", ids[i]!);
    if (error) return { erro: "Falha ao reordenar." };
  }
  revalidar();
  return { ok: true };
}

// globais (singleton)
export async function salvarGlobais(valorMinimo: number, descontoMaximoPct: number): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!Number.isFinite(valorMinimo) || valorMinimo < 0 || !Number.isFinite(descontoMaximoPct) || descontoMaximoPct < 0 || descontoMaximoPct > 100)
    return { erro: "Valores inválidos (desconto de 0 a 100)." };
  const s = await createServerSupabase();
  const { error } = await s.from("precificacao_config").update({ valor_minimo: valorMinimo, desconto_maximo_pct: descontoMaximoPct }).eq("id", true);
  if (error) return { erro: "Falha ao salvar." };
  revalidar();
  return { ok: true };
}
```

**Complexidade** e **serviço** repetem os moldes de criar/salvar/remover/reordenar acima, trocando a
tabela e as colunas:
- `criarComplexidade(nome)` → insert `{ nome, multiplicador: 1.0, ordem: max+1 }` (validar `rotuloValido`-like:
  nome não vazio); `salvarComplexidade(id, nome, multiplicador)` → update (validar `multiplicador ≥ 0`);
  `removerComplexidade(id)` → delete; `reordenarComplexidades(ids)` → como `reordenarFaixas`.
- `criarServico(nome)` → insert `{ nome, valor: 0, recorrencia: 'mensal', ativo: true, ordem: max+1 }`;
  `salvarServico(id, {nome, valor, recorrencia, ativo})` → update (validar `valor ≥ 0`,
  `recorrencia ∈ {mensal,unico}`); `removerServico(id)` → delete; `reordenarServicos(ids)` → idem.

- [ ] **Step 3: Verificar tipos**

Run: `npm run typecheck`
Expected: aponta só a página/o client da Task 4/5 (ainda não existem). O actions compila.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/configuracoes/precificacao/actions.ts"
git commit -m "feat(comercial): server actions da configuracao de precificacao (admin)"
```

---

### Task 4: Página + blocos regime/complexidade/serviços/globais

**Files:**
- Create: `src/app/(app)/configuracoes/precificacao/page.tsx`
- Create: `src/app/(app)/configuracoes/precificacao/FormPrecificacao.tsx`
- Test: `src/tests/comercial/precificacao-render.test.tsx`

**Interfaces:**
- Consumes: `carregarPrecificacao` + as actions (Task 3), `REGIMES` (`@/lib/tipos`), `controleCls`, `Botao`.
- Produces: a tela `/configuracoes/precificacao` (gate admin) com os blocos simples. O bloco por fator entra
  na Task 5 (o `FormPrecificacao` deixa um ponto de montagem para ele).

- [ ] **Step 1: Página server (gate admin)**

```tsx
import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { FormPrecificacao } from "./FormPrecificacao";
import { carregarPrecificacao } from "./actions";

export const metadata = { title: "Precificação" };

export default async function PrecificacaoConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const cfg = await carregarPrecificacao();
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="Precificação" subtitulo="Regras de honorários — base, acréscimos, complexidade e serviços" />
      <FormPrecificacao cfg={cfg} />
    </Container>
  );
}
```

- [ ] **Step 2: Teste de render**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/precificacao/actions", () => ({
  salvarBaseRegime: vi.fn(), definirModoFator: vi.fn(), salvarUnidadeFator: vi.fn(),
  criarFaixa: vi.fn(), salvarFaixa: vi.fn(), removerFaixa: vi.fn(), reordenarFaixas: vi.fn(),
  criarComplexidade: vi.fn(), salvarComplexidade: vi.fn(), removerComplexidade: vi.fn(), reordenarComplexidades: vi.fn(),
  criarServico: vi.fn(), salvarServico: vi.fn(), removerServico: vi.fn(), reordenarServicos: vi.fn(),
  salvarGlobais: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { FormPrecificacao } from "@/app/(app)/configuracoes/precificacao/FormPrecificacao";
import type { PrecificacaoView } from "@/app/(app)/configuracoes/precificacao/actions";

const cfg: PrecificacaoView = {
  regimes: [{ regime: "Simples", valorBase: 500 }],
  fatores: [{ fator: "faturamento", modo: "faixas", valorUnitario: 0, franquia: 0, faixas: [] }],
  complexidades: [{ id: "c1", nome: "Média", multiplicador: 1.2, ordem: 1 }],
  servicos: [{ id: "s1", nome: "Folha", valor: 200, recorrencia: "mensal", ativo: true, ordem: 1 }],
  global: { valorMinimo: 400, descontoMaximoPct: 20 },
};

describe("FormPrecificacao", () => {
  it("renderiza os blocos de configuração", () => {
    const html = renderToStaticMarkup(<FormPrecificacao cfg={cfg} />);
    expect(html).toContain("Simples"); // base por regime
    expect(html).toContain("Média"); // complexidade
    expect(html).toContain("Folha"); // serviço
    expect(html).toContain("Valor mínimo"); // globais
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/precificacao-render.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 4: `FormPrecificacao` (blocos simples)**

Client (`"use client"`) com o `chamar(fn)` padrão (roda a action, `alert(erro)`, `router.refresh()`). Recebe
`cfg: PrecificacaoView`. Renderiza, em cartões `rounded-2xl border border-linha bg-white p-4`:
- **Valores-base por regime** — para cada `REGIME`, um `<input type="number">` com o `valorBase` atual
  (casando por `cfg.regimes`; ausentes começam em 0), salvando no `onBlur` via `salvarBaseRegime`.
- **`<BlocoFatores fatores={cfg.fatores} />`** — ponto de montagem (o componente vem na Task 5; import já no
  topo). *Nesta task, importar e renderizar; o arquivo é criado na Task 5.*
- **Complexidade** — lista de níveis (nome + multiplicador) com ↑/↓ (`reordenarComplexidades(moverNaOrdem…)`
  reusando `moverNaOrdem` de `@/lib/comercial/funilConfig`), remover, e "Adicionar nível"
  (`criarComplexidade`). Salva nome/multiplicador no `onBlur` via `salvarComplexidade`.
- **Serviços adicionais** — lista (nome, valor, recorrência `<select mensal/unico>`, ativo `<checkbox>`) com
  remover e "Adicionar serviço" (`criarServico`); salva via `salvarServico`.
- **Globais** — dois campos rotulados **"Valor mínimo"** e **"Desconto máximo (%)"**, salvando via
  `salvarGlobais`.

> Para o teste passar nesta task sem o `BlocoFatores` pronto, criar o arquivo `BlocoFatores.tsx` já na Task 4
> como **stub mínimo** (`export function BlocoFatores(){ return null }`) e completá-lo na Task 5 — assim o
> import resolve e a Task 4 fecha isolada.

- [ ] **Step 5: Rodar e verificar**

Run: `npx vitest run src/tests/comercial/precificacao-render.test.tsx && npm run typecheck`
Expected: PASS + typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/configuracoes/precificacao/page.tsx" "src/app/(app)/configuracoes/precificacao/FormPrecificacao.tsx" "src/app/(app)/configuracoes/precificacao/BlocoFatores.tsx" src/tests/comercial/precificacao-render.test.tsx
git commit -m "feat(comercial): tela de precificacao — blocos regime/complexidade/servicos/globais"
```

---

### Task 5: Bloco por fator (faixas/unidade)

**Files:**
- Modify: `src/app/(app)/configuracoes/precificacao/BlocoFatores.tsx` (do stub ao completo)
- Test: `src/tests/comercial/precificacao-render.test.tsx` (asserção do bloco)

**Interfaces:**
- Consumes: `PrecificacaoView["fatores"]`, as actions de fator/faixa (Task 3), `moverNaOrdem`.
- Produces: o editor por fator (faturamento/funcionários/notas) com modo e faixas/unidade.

- [ ] **Step 1: Estender o teste de render**

Adicionar ao `precificacao-render.test.tsx`, no mesmo `it` (ou um novo), com um fator em `faixas` e outro em
`unidade` no `cfg`, asserções de que os rótulos aparecem:
```tsx
expect(html).toContain("Faturamento"); // rótulo do fator
expect(html).toContain("Faixas"); // opção de modo
```
(Ajustar o `cfg.fatores` do teste para incluir o rótulo esperado; os três fatores são `faturamento`,
`funcionarios`, `notas` — mapear para rótulos "Faturamento", "Funcionários", "Notas".)

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/precificacao-render.test.tsx`
Expected: FAIL — o stub retorna `null`.

- [ ] **Step 3: Implementar `BlocoFatores`**

Client. Recebe `fatores: PrecificacaoView["fatores"]`. Mapa de rótulos:
`{ faturamento: "Faturamento", funcionarios: "Funcionários", notas: "Notas" }`. Para cada fator, um cartão:
- Título (rótulo) + um seletor de **modo** (dois botões/segmented "Faixas" | "Por unidade") →
  `definirModoFator(fator, modo)`.
- Se `modo === "unidade"`: dois campos **valor unitário** e **franquia**, salvando via `salvarUnidadeFator`.
- Se `modo === "faixas"`: a lista de faixas (campos **até** — vazio = ∞ — e **valor**), com ↑/↓
  (`reordenarFaixas(moverNaOrdem(idsDoFator, id, dir))`), remover (`removerFaixa`) e "Adicionar faixa"
  (`criarFaixa(fator)`); salvar cada linha no `onBlur` via `salvarFaixa(id, ate|null, valor)`.
- Usar o `chamar(fn)` padrão e `controleCls("compacto")` nos campos (o `<input type="color">` da regra de
  borda **não** existe aqui; os inputs de texto/número usam o token e não declaram `border`).

- [ ] **Step 4: Rodar e verificar**

Run: `npx vitest run src/tests/comercial/precificacao-render.test.tsx && npm run typecheck && npm run lint`
Expected: PASS + typecheck e lint limpos (atenção à regra `divida-ui`: nenhum `<input>` com `border`
estática — usar só `controleCls`).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/configuracoes/precificacao/BlocoFatores.tsx" src/tests/comercial/precificacao-render.test.tsx
git commit -m "feat(comercial): bloco por fator na precificacao (faixas/unidade)"
```

---

### Task 6: Hub + release 6.14.0

**Files:**
- Modify: `src/app/(app)/configuracoes/page.tsx`
- Modify: `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Item no hub**

Em `ITENS` de `configuracoes/page.tsx`, adicionar (sem `papeis` → admin-only):
```ts
{
  href: "/configuracoes/precificacao",
  label: "Precificação de honorários",
  desc: "Base por regime, acréscimos, complexidade, serviços, piso e desconto.",
},
```

- [ ] **Step 2: Conferência na tela** — `npm run dev`, `/configuracoes/precificacao`: preencher bases,
  alternar um fator entre faixas/unidade, adicionar faixa/complexidade/serviço, salvar globais. **Mostrar ao
  Pedro** (a calculadora que consome isto vem na Fatia B).

- [ ] **Step 3: Verificação completa**

```bash
npm run lint && npm run typecheck && npm test && npm run format && npm run build
npx prettier --check .
```

- [ ] **Step 4: Bump + CHANGELOG**

- `package.json`: `6.13.0` → `6.14.0`.
- `CHANGELOG.md`: seção `## [6.14.0] — <data>` com `### Adicionado` descrevendo a configuração de
  precificação (motor + tela), citando que é a fundação da RF-003 (a calculadora vem a seguir).
- Conferir `npx vitest run src/tests/versao.test.ts`.

- [ ] **Step 5: PR**

```bash
git push origin develop
gh pr create --base main --head develop --title "RF-003 fatia A: motor + configuração de precificação (v6.14.0)"
gh pr checks --watch
```

- [ ] **Step 6: Release (com o Pedro)**

> **Migration `0102` em produção antes do deploy** (SQL Editor). Sequência: migration → merge → Implantar →
> confirmar `6.14.0` no `/api/health` → tag. O merge não publica.

## Self-Review (cobertura da spec)

- Motor `calcularHonorario` com a ordem exata (base → acréscimos faixa/unidade → complexidade → serviços →
  desconto com teto → piso depois) → Task 2, testado.
- 6 tabelas + seeds + RLS → Task 1.
- Tela de config com todos os blocos (regime, por-fator faixas/unidade, complexidade, serviços, globais) →
  Tasks 3-5.
- Gate admin nas mutações → Task 3 (`admin()` em cada action).
- `precificacao_config` singleton (uma linha, check `id`) → Task 1.
- Snapshot e a calculadora (avulsa/integrada) → **Fatias B e C**, fora daqui.
