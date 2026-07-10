# Vigências de honorário e regime — Plano de Implementação (Fatia B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar cada mudança de honorário e de regime tributário com data de vigência, e fazer os indicadores, a geração de mensalidades e as obrigações usarem **o valor da época** em vez do valor atual.

**Architecture:** Duas tabelas com `vigente_de` **aberto** (sem `vigente_ate`): o valor vigente na competência C é o da linha com o maior `vigente_de <= C`. A captura é por **trigger de banco** — o honorário tem quatro caminhos de escrita. O backfill grava `estimada = true`, porque o passado é suposição, não dado.

**Tech Stack:** Postgres (Supabase) com runner de migrations próprio · Next.js 16 (Server Actions) · TypeScript · Vitest · asserts SQL em `supabase/tests/rls.test.sql`.

## Global Constraints

- Migrations via `npm run db:migrate`; **nunca** `supabase db push`. Próximas livres: **0072** e **0073**.
- Migrations aplicadas são **imutáveis** — mudança = nova migration. Idempotentes.
- **`OLD` não existe em `INSERT`.** Em `plpgsql`, ler `OLD.col` durante um `INSERT` levanta *"record old is not assigned yet"*. Todo trigger `AFTER INSERT OR UPDATE` **precisa** ramificar por `tg_op`.
- **Regra de resolução (a única que importa):** o valor vigente na competência **C** é o da linha com o **maior `vigente_de <= C`**. Antes da primeira vigência, extrapola a primeira e marca como estimado.
- **`vigente_de` é sempre o 1º dia do mês** (garantido por `check` e por `date_trunc` no trigger).
- Triggers de captura são `SECURITY DEFINER` (escrevem na tabela de vigência independentemente da RLS do usuário), como o `capturar_saida_cliente` já existente.
- `Date.now()` / `new Date()` sem argumento são proibidos **dentro de componentes** (`react-hooks/purity`).
- Rodar antes de cada commit: `npm run lint && npm run typecheck && npm test`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

- **Create** `supabase/migrations/0072_vigencias.sql` — tabelas, RLS, triggers, `honorario_vigente()`, backfill.
- **Create** `supabase/migrations/0073_gerar_mensalidades_vigencia.sql` — `gerar_mensalidades` usa `honorario_vigente()`.
- **Create** `src/lib/financeiro/vigencia.ts` — `honorarioEm` (puro).
- **Create** `src/lib/obrigacoes/vigencia.ts` — `regimeEm` (puro).
- **Create** `src/tests/financeiro/vigencia.test.ts` e `src/tests/obrigacoes/vigencia.test.ts` — fronteiras.
- **Modify** `src/lib/financeiro/metricas.ts` — `ClienteMetrica` passa a ter `vigencias`; `MesMetrica` ganha `estimado`.
- **Modify** `src/tests/financeiro/metricas.test.ts` — o teste que prova que a aproximação acabou.
- **Modify** `src/tests/financeiro/indicadores-render.test.tsx` — monta um `MesMetrica` literal; ganha `estimado`.
- **Modify** `src/app/(app)/financeiro/indicadores/actions.ts` — carrega vigências (com fallback).
- **Modify** `src/app/(app)/financeiro/indicadores/Indicadores.tsx` — marca os meses estimados.
- **Modify** `src/lib/obrigacoes/motor.ts` — usa o regime vigente na competência.
- **Create** `src/components/clientes/LinhaTempoVigencias.tsx` — linha do tempo na ficha.
- **Modify** `src/app/(app)/clientes/[id]/page.tsx` — renderiza a linha do tempo.
- **Modify** `supabase/tests/rls.test.sql` — asserts dos triggers e da resolução.
- **Modify** `docs/DOCUMENTACAO.md`.

---

### Task 1: Migration — tabelas, triggers, resolução e backfill

**Files:**
- Create: `supabase/migrations/0072_vigencias.sql`

**Interfaces:**
- Produces: tabelas `honorario_vigencia` e `regime_vigencia`; função `honorario_vigente(uuid, date) returns numeric`; triggers `trg_honorario_vigencia` e `trg_regime_vigencia`.

- [ ] **Step 1: Escrever a migration**

Arquivo `supabase/migrations/0072_vigencias.sql`:

```sql
-- Vigências de honorário e regime. Modelo de `vigente_de` ABERTO (sem vigente_ate):
-- o valor vigente na competência C é o da linha com o maior vigente_de <= C.
-- Uma mudança = uma escrita; não há intervalo para manter, logo não há intervalo inconsistente.

create table if not exists honorario_vigencia (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  valor numeric(15,2) not null,
  vigente_de date not null check (vigente_de = date_trunc('month', vigente_de)::date),
  estimada boolean not null default false,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id),
  unique (cliente_id, vigente_de)
);
create index if not exists honorario_vigencia_idx on honorario_vigencia (cliente_id, vigente_de desc);

create table if not exists regime_vigencia (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  regime regime_tributario not null,
  vigente_de date not null check (vigente_de = date_trunc('month', vigente_de)::date),
  estimada boolean not null default false,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id),
  unique (cliente_id, vigente_de)
);
create index if not exists regime_vigencia_idx on regime_vigencia (cliente_id, vigente_de desc);

alter table honorario_vigencia enable row level security;
alter table regime_vigencia enable row level security;

-- Honorário é dado sensível: espelha a RLS de clientes_financeiro (admin/financeiro/contador-dono).
drop policy if exists honorario_vigencia_sel on honorario_vigencia;
create policy honorario_vigencia_sel on honorario_vigencia for select to authenticated
  using (
    auth_papel() in ('admin','financeiro')
    or (auth_papel() = 'contador'
        and exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid()))
  );

-- Regime não é dado financeiro: delega o isolamento à RLS de clientes.
drop policy if exists regime_vigencia_sel on regime_vigencia;
create policy regime_vigencia_sel on regime_vigencia for select to authenticated
  using (exists (select 1 from clientes c where c.id = cliente_id));

-- Sem policy de escrita: quem grava são os triggers SECURITY DEFINER abaixo.

-- Valor vigente na competência. Fallbacks, em ordem:
--   1) a vigência mais recente com vigente_de <= competência
--   2) a PRIMEIRA vigência (extrapolação para trás, quando a competência é anterior a tudo)
--   3) o honorário atual (cliente sem vigência alguma)
create or replace function honorario_vigente(p_cliente uuid, p_competencia date) returns numeric
  language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(
    (select v.valor from honorario_vigencia v
      where v.cliente_id = p_cliente and v.vigente_de <= date_trunc('month', p_competencia)::date
      order by v.vigente_de desc limit 1),
    (select v.valor from honorario_vigencia v
      where v.cliente_id = p_cliente order by v.vigente_de asc limit 1),
    (select f.honorario_mensal from clientes_financeiro f where f.cliente_id = p_cliente)
  );
$$;
revoke all on function honorario_vigente(uuid, date) from public;
grant execute on function honorario_vigente(uuid, date) to authenticated;

-- Captura do honorário. O valor é escrito por QUATRO caminhos (formulário, importação do Domínio,
-- sync de contrato, captura de saída) — instrumentar cada um seria esquecer algum.
-- ATENÇÃO: OLD não existe no INSERT; ramificar por tg_op é obrigatório.
create or replace function capturar_honorario_vigencia() returns trigger
  language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_novo numeric;
begin
  if tg_op = 'INSERT' then
    v_novo := new.honorario_mensal;
  elsif new.honorario_mensal is distinct from old.honorario_mensal then
    v_novo := new.honorario_mensal;
  else
    return null;  -- update que não mexeu no honorário: não polui o histórico
  end if;
  if coalesce(v_novo, 0) <= 0 then return null; end if;

  insert into honorario_vigencia (cliente_id, valor, vigente_de, estimada, criado_por)
    values (new.cliente_id, v_novo, date_trunc('month', now())::date, false, auth.uid())
  on conflict (cliente_id, vigente_de) do update
    set valor = excluded.valor, estimada = false, criado_em = now(), criado_por = excluded.criado_por;
  return null;
end $$;
drop trigger if exists trg_honorario_vigencia on clientes_financeiro;
create trigger trg_honorario_vigencia after insert or update of honorario_mensal on clientes_financeiro
  for each row execute function capturar_honorario_vigencia();

create or replace function capturar_regime_vigencia() returns trigger
  language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_novo regime_tributario;
begin
  if tg_op = 'INSERT' then
    v_novo := new.regime_tributario;
  elsif new.regime_tributario is distinct from old.regime_tributario then
    v_novo := new.regime_tributario;
  else
    return null;
  end if;

  insert into regime_vigencia (cliente_id, regime, vigente_de, estimada, criado_por)
    values (new.id, v_novo, date_trunc('month', now())::date, false, auth.uid())
  on conflict (cliente_id, vigente_de) do update
    set regime = excluded.regime, estimada = false, criado_em = now(), criado_por = excluded.criado_por;
  return null;
end $$;
drop trigger if exists trg_regime_vigencia on clientes;
create trigger trg_regime_vigencia after insert or update of regime_tributario on clientes
  for each row execute function capturar_regime_vigencia();

-- BACKFILL — marcado como ESTIMADO, porque é suposição, não dado.
-- O quanto cada cliente pagava antes desta migration não existe em lugar nenhum. Estas linhas
-- afirmam "até onde sabemos, era isso", e a UI mostra o selo (estimada).
insert into honorario_vigencia (cliente_id, valor, vigente_de, estimada)
  select c.id, f.honorario_mensal,
         date_trunc('month', coalesce(c.data_inicio, c.criado_em))::date, true
    from clientes c join clientes_financeiro f on f.cliente_id = c.id
   where c.excluido_em is null and coalesce(f.honorario_mensal, 0) > 0
  on conflict (cliente_id, vigente_de) do nothing;

insert into regime_vigencia (cliente_id, regime, vigente_de, estimada)
  select c.id, c.regime_tributario,
         date_trunc('month', coalesce(c.data_inicio, c.criado_em))::date, true
    from clientes c
   where c.excluido_em is null
  on conflict (cliente_id, vigente_de) do nothing;
```

- [ ] **Step 2: Aplicar a migration**

Run: `npm run db:migrate`
Expected: `+ aplicando: 0072_vigencias.sql` sem erro.

- [ ] **Step 3: Verificar o backfill e a resolução**

Run:
```bash
node --env-file=.env.local --input-type=module -e "
import { makeClient } from './scripts/_db.mjs';
const c = makeClient(); await c.connect();
const q = async (s) => (await c.query(s)).rows[0].n;
console.log('honorario_vigencia (esperado 99):    ', await q('select count(*)::int n from honorario_vigencia'));
console.log('todas estimadas (esperado 99):       ', await q('select count(*)::int n from honorario_vigencia where estimada'));
console.log('regime_vigencia (esperado 99):       ', await q('select count(*)::int n from regime_vigencia'));
console.log('vigente_de fora do 1o dia (esp. 0):  ', await q(\"select count(*)::int n from honorario_vigencia where vigente_de <> date_trunc('month', vigente_de)::date\"));
const r = await c.query(\"select honorario_vigente(cliente_id, '2026-06-01') = valor as bate from honorario_vigencia limit 3\");
console.log('honorario_vigente bate com a vigência:', r.rows.map(x=>x.bate).join(', '));
await c.end();"
```
Expected: `99`, `99`, `99`, `0`, e `true, true, true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0072_vigencias.sql
git commit -m "feat(db): vigências de honorário e regime, capturadas por trigger

Modelo de vigente_de aberto (sem vigente_ate): o valor vigente na competência C é
o da linha com o maior vigente_de <= C. Uma mudança = uma escrita; não há intervalo
para manter, logo não há intervalo inconsistente.

O backfill grava estimada = true: o histórico anterior a esta migration não existe
em lugar nenhum, e repetir o valor atual para trás seria disfarçar chute de fato.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Migration — a geração usa o honorário da época

**Files:**
- Create: `supabase/migrations/0073_gerar_mensalidades_vigencia.sql`

**Interfaces:**
- Consumes: `honorario_vigente(uuid, date)` (Task 1).
- Produces: `gerar_mensalidades(date)` resolvendo o honorário pela vigência da competência.

Isto corrige um erro real: gerar uma competência antiga **depois** de um reajuste hoje cobraria o valor
novo por um serviço velho. O 13º usa o honorário vigente na competência de **outubro** (a rodada em que
é gerado).

- [ ] **Step 1: Escrever a migration**

Arquivo `supabase/migrations/0073_gerar_mensalidades_vigencia.sql`:

```sql
-- gerar_mensalidades passa a usar honorario_vigente(cliente, competencia) em vez do honorário atual.
-- Sem isso, gerar uma competência antiga depois de um reajuste cobraria o valor novo por serviço velho.
create or replace function gerar_mensalidades(p_competencia date) returns jsonb
  language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_comp date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_dias int := extract(day from v_fim)::int;
  v_venc_mes date := (v_comp + interval '1 month')::date;
  v_ano int := extract(year from v_comp)::int;
  v_gerados int := 0; v_pulados int := 0;
  r record; v_valor numeric; v_venc date; v_ins int;
  v_cat_hon uuid; v_cat_13 uuid; v_p1 numeric; v_p2 numeric; v_hon numeric;
begin
  select id into v_cat_hon from categoria where nome = 'Honorários mensais' and categoria_pai_id is null limit 1;
  select id into v_cat_13  from categoria where nome = '13º honorário'      and categoria_pai_id is null limit 1;

  -- (1) MENSALIDADE por contrato ATIVO já iniciado (o contrato tem o próprio valor)
  for r in
    select ct.* from contrato ct
    join clientes c on c.id = ct.cliente_id
    where ct.status = 'ATIVO' and ct.data_inicio <= v_fim
      and c.excluido_em is null and c.status = 'ativo'
  loop
    v_venc := (v_venc_mes + (r.dia_vencimento - 1))::date;
    if date_trunc('month', r.data_inicio) = v_comp and extract(day from r.data_inicio) > 1 then
      v_valor := round(r.valor_mensal * (v_dias - extract(day from r.data_inicio) + 1) / v_dias, 2);
    else
      v_valor := r.valor_mensal;
    end if;
    insert into titulo (cliente_id, contrato_id, origem, descricao, valor, competencia, vencimento, categoria_id, centro_custo_id)
      values (r.cliente_id, r.id, 'MENSALIDADE', r.descricao, v_valor, v_comp, v_venc, r.categoria_id, r.centro_custo_id)
      on conflict do nothing;
    get diagnostics v_ins = row_count;
    if v_ins > 0 then v_gerados := v_gerados + 1; else v_pulados := v_pulados + 1; end if;
  end loop;

  -- (2) MENSALIDADE do honorário VIGENTE NA COMPETÊNCIA, para clientes sem contrato ativo
  for r in
    select c.id as cliente_id, coalesce(f.dia_vencimento, 10) as dia
    from clientes c join clientes_financeiro f on f.cliente_id = c.id
    where c.excluido_em is null and c.status = 'ativo'
      and coalesce(f.honorario_mensal,0) > 0
      and not exists (select 1 from contrato ct where ct.cliente_id = c.id and ct.status = 'ATIVO')
  loop
    v_valor := honorario_vigente(r.cliente_id, v_comp);
    if coalesce(v_valor, 0) <= 0 then continue; end if;
    v_venc := (v_venc_mes + (r.dia - 1))::date;
    insert into titulo (cliente_id, contrato_id, origem, descricao, valor, competencia, vencimento, categoria_id)
      values (r.cliente_id, null, 'MENSALIDADE', 'Honorário mensal', v_valor, v_comp, v_venc, v_cat_hon)
      on conflict do nothing;
    get diagnostics v_ins = row_count;
    if v_ins > 0 then v_gerados := v_gerados + 1; else v_pulados := v_pulados + 1; end if;
  end loop;

  -- (3) 13º HONORÁRIO na rodada de OUTUBRO: duas parcelas de 50%, vencendo 20/11 e 15/12.
  -- Usa o honorário vigente na competência de outubro.
  if extract(month from v_comp)::int = 10 then
    for r in
      select c.id as cliente_id
      from clientes c join clientes_financeiro f on f.cliente_id = c.id
      where c.excluido_em is null and c.status = 'ativo'
        and coalesce(f.honorario_mensal,0) > 0
    loop
      v_hon := honorario_vigente(r.cliente_id, v_comp);
      if coalesce(v_hon, 0) <= 0 then continue; end if;
      -- A 2ª parcela é o RESTO, não outro round(): 333.33 -> 166.67 + 166.66 = 333.33 exato.
      v_p1 := round(v_hon / 2, 2);
      v_p2 := v_hon - v_p1;

      insert into titulo (cliente_id, contrato_id, origem, descricao, valor, competencia, vencimento, categoria_id, parcela, total_parcelas)
        values (r.cliente_id, null, 'DECIMO_TERCEIRO', '13º honorário (1/2)', v_p1,
                make_date(v_ano, 11, 1), make_date(v_ano, 11, 20), v_cat_13, 1, 2)
        on conflict do nothing;
      get diagnostics v_ins = row_count;
      if v_ins > 0 then v_gerados := v_gerados + 1; else v_pulados := v_pulados + 1; end if;

      insert into titulo (cliente_id, contrato_id, origem, descricao, valor, competencia, vencimento, categoria_id, parcela, total_parcelas)
        values (r.cliente_id, null, 'DECIMO_TERCEIRO', '13º honorário (2/2)', v_p2,
                make_date(v_ano, 12, 1), make_date(v_ano, 12, 15), v_cat_13, 2, 2)
        on conflict do nothing;
      get diagnostics v_ins = row_count;
      if v_ins > 0 then v_gerados := v_gerados + 1; else v_pulados := v_pulados + 1; end if;
    end loop;
  end if;

  return jsonb_build_object('gerados', v_gerados, 'pulados', v_pulados);
end $$;
revoke all on function gerar_mensalidades(date) from public;
grant execute on function gerar_mensalidades(date) to authenticated;
```

- [ ] **Step 2: Aplicar e conferir que os testes de banco existentes seguem verdes**

Run: `npm run db:migrate && npm run db:test`
Expected: migration aplicada; **todos** os asserts passam (a Fatia A já testa vencimento, 13º e idempotência).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0073_gerar_mensalidades_vigencia.sql
git commit -m "feat(db): geração de mensalidades usa o honorário vigente na competência

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Helpers puros de resolução

**Files:**
- Create: `src/lib/financeiro/vigencia.ts`
- Create: `src/lib/obrigacoes/vigencia.ts`
- Create: `src/tests/financeiro/vigencia.test.ts`
- Create: `src/tests/obrigacoes/vigencia.test.ts`

**Interfaces:**
- Produces:
  - `type VigenciaValor = { vigenteDe: string; valor: number; estimada: boolean }`
  - `honorarioEm(vigencias: VigenciaValor[], mes: string): { valor: number; estimado: boolean }` — `mes` no formato `"YYYY-MM"`
  - `type VigenciaRegime = { vigenteDe: string; regime: string }`
  - `regimeEm(vigencias: VigenciaRegime[], competencia: string): string | null` — `competencia` no formato `"YYYY-MM"`

- [ ] **Step 1: Escrever os testes que falham**

Arquivo `src/tests/financeiro/vigencia.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { honorarioEm, type VigenciaValor } from "@/lib/financeiro/vigencia";

const v = (vigenteDe: string, valor: number, estimada = false): VigenciaValor => ({ vigenteDe, valor, estimada });

describe("honorarioEm — fronteiras", () => {
  const vigencias = [v("2025-10-01", 400, true), v("2026-01-01", 500), v("2026-03-01", 800)];

  it("mês exatamente igual ao vigente_de usa essa vigência", () => {
    expect(honorarioEm(vigencias, "2026-03")).toEqual({ valor: 800, estimado: false });
    expect(honorarioEm(vigencias, "2026-01")).toEqual({ valor: 500, estimado: false });
  });
  it("mês entre duas vigências usa a anterior", () => {
    expect(honorarioEm(vigencias, "2026-02")).toEqual({ valor: 500, estimado: false });
    expect(honorarioEm(vigencias, "2026-12")).toEqual({ valor: 800, estimado: false });
  });
  it("mês anterior à primeira vigência extrapola e marca como estimado", () => {
    expect(honorarioEm(vigencias, "2025-05")).toEqual({ valor: 400, estimado: true });
  });
  it("vigência marcada como estimada propaga o selo", () => {
    expect(honorarioEm(vigencias, "2025-11")).toEqual({ valor: 400, estimado: true });
  });
  it("lista vazia devolve zero estimado", () => {
    expect(honorarioEm([], "2026-03")).toEqual({ valor: 0, estimado: true });
  });
  it("não depende da ordem da lista", () => {
    const embaralhada = [vigencias[2]!, vigencias[0]!, vigencias[1]!];
    expect(honorarioEm(embaralhada, "2026-02")).toEqual({ valor: 500, estimado: false });
  });
});
```

Arquivo `src/tests/obrigacoes/vigencia.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { regimeEm, type VigenciaRegime } from "@/lib/obrigacoes/vigencia";

const vigencias: VigenciaRegime[] = [
  { vigenteDe: "2025-10-01", regime: "Simples" },
  { vigenteDe: "2026-03-01", regime: "Presumido" },
];

describe("regimeEm", () => {
  it("usa o regime vigente na competência", () => {
    expect(regimeEm(vigencias, "2026-02")).toBe("Simples");
    expect(regimeEm(vigencias, "2026-03")).toBe("Presumido");
    expect(regimeEm(vigencias, "2026-09")).toBe("Presumido");
  });
  it("antes da primeira vigência, extrapola a primeira", () => {
    expect(regimeEm(vigencias, "2025-01")).toBe("Simples");
  });
  it("lista vazia devolve null (o chamador usa o regime atual)", () => {
    expect(regimeEm([], "2026-03")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/tests/financeiro/vigencia.test.ts src/tests/obrigacoes/vigencia.test.ts`
Expected: FAIL — os módulos não existem.

- [ ] **Step 3: Implementar `src/lib/financeiro/vigencia.ts`**

```ts
// Resolução de vigência: o valor vigente na competência C é o da linha com o maior
// vigente_de <= C. Antes da primeira vigência, extrapola a primeira e marca como estimado.
// Puro: as datas ISO são comparadas por string (ordenáveis lexicograficamente).

export type VigenciaValor = { vigenteDe: string; valor: number; estimada: boolean };

export function honorarioEm(
  vigencias: VigenciaValor[],
  mes: string, // "YYYY-MM"
): { valor: number; estimado: boolean } {
  if (vigencias.length === 0) return { valor: 0, estimado: true };
  const alvo = `${mes}-01`;
  const ordenadas = [...vigencias].sort((a, b) => a.vigenteDe.localeCompare(b.vigenteDe));

  let escolhida: VigenciaValor | undefined;
  for (const v of ordenadas) {
    if (v.vigenteDe <= alvo) escolhida = v;
    else break;
  }
  // Competência anterior a tudo: extrapola a primeira, e isso é uma estimativa.
  if (!escolhida) return { valor: ordenadas[0]!.valor, estimado: true };
  return { valor: escolhida.valor, estimado: escolhida.estimada };
}
```

- [ ] **Step 4: Implementar `src/lib/obrigacoes/vigencia.ts`**

```ts
// Regime vigente na competência. Devolve null quando não há vigência alguma — nesse caso
// o chamador usa o regime atual do cadastro.
export type VigenciaRegime = { vigenteDe: string; regime: string };

export function regimeEm(vigencias: VigenciaRegime[], competencia: string): string | null {
  if (vigencias.length === 0) return null;
  const alvo = `${competencia}-01`;
  const ordenadas = [...vigencias].sort((a, b) => a.vigenteDe.localeCompare(b.vigenteDe));

  let escolhida: VigenciaRegime | undefined;
  for (const v of ordenadas) {
    if (v.vigenteDe <= alvo) escolhida = v;
    else break;
  }
  return (escolhida ?? ordenadas[0]!).regime; // antes da primeira: extrapola
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- src/tests/financeiro/vigencia.test.ts src/tests/obrigacoes/vigencia.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 6: Commit**

```bash
git add src/lib/financeiro/vigencia.ts src/lib/obrigacoes/vigencia.ts src/tests/financeiro/vigencia.test.ts src/tests/obrigacoes/vigencia.test.ts
git commit -m "feat: resolução pura de vigência (honorário e regime), com fronteiras testadas

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `calcularMetricas` usa as vigências

**Files:**
- Modify: `src/lib/financeiro/metricas.ts`
- Modify: `src/tests/financeiro/metricas.test.ts`

**Interfaces:**
- Consumes: `honorarioEm`, `VigenciaValor` (Task 3).
- Produces: `ClienteMetrica` com `vigencias: VigenciaValor[]` (em vez de `honorario: number`); `MesMetrica` ganha `estimado: boolean`.

- [ ] **Step 1: Escrever o teste que falha — o que prova que a aproximação acabou**

Acrescentar em `src/tests/financeiro/metricas.test.ts`:

```ts
import { calcularMetricas, mesesJanela, type ClienteMetrica } from "@/lib/financeiro/metricas";

describe("calcularMetricas com vigências", () => {
  it("o MRR de cada mês usa o honorário daquele mês, não o atual", () => {
    // Cliente entrou em 2025-10 pagando 500; passou a 800 em março de 2026.
    const clientes: ClienteMetrica[] = [
      {
        dataInicio: "2025-10-01",
        dataSaida: null,
        honorarioSaida: null,
        vigencias: [
          { vigenteDe: "2025-10-01", valor: 500, estimada: false },
          { vigenteDe: "2026-03-01", valor: 800, estimada: false },
        ],
      },
    ];
    const { serie } = calcularMetricas(clientes, ["2026-02", "2026-03"]);
    // Antes desta mudança, ambos dariam 800 — a aproximação que a tela admitia.
    expect(serie[0]!.mrr).toBe(500);
    expect(serie[1]!.mrr).toBe(800);
  });

  it("marca o mês como estimado quando o valor veio de vigência estimada", () => {
    const clientes: ClienteMetrica[] = [
      {
        dataInicio: "2025-10-01",
        dataSaida: null,
        honorarioSaida: null,
        vigencias: [{ vigenteDe: "2025-10-01", valor: 500, estimada: true }],
      },
    ];
    const { serie } = calcularMetricas(clientes, ["2026-02"]);
    expect(serie[0]!.estimado).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/tests/financeiro/metricas.test.ts`
Expected: FAIL — `ClienteMetrica` ainda tem `honorario`, e `MesMetrica` não tem `estimado`.

- [ ] **Step 3: Alterar `src/lib/financeiro/metricas.ts`**

Trocar o tipo `ClienteMetrica` e a resolução do honorário. Substituir o bloco de tipos:

```ts
import { honorarioEm, type VigenciaValor } from "./vigencia";

export type ClienteMetrica = {
  dataInicio: string | null; // entrada (null = presente desde antes da janela)
  dataSaida: string | null; // saída (null = ativo)
  vigencias: VigenciaValor[]; // histórico do honorário; resolvido mês a mês
  honorarioSaida: number | null; // fallback para cliente sem vigência alguma
};
```

Acrescentar `estimado` ao `MesMetrica`:

```ts
export type MesMetrica = {
  mes: string;
  base: number;
  novos: number;
  churn: number;
  liquido: number;
  ativosFim: number;
  churnPct: number;
  churnReceita: number;
  mrr: number;
  ticketMedio: number;
  estimado: boolean; // algum honorário do mês veio de vigência estimada/extrapolada
};
```

Dentro do `serie = meses.map((mes) => {...})`, trocar a resolução do honorário. **O selo `estimado` só pode
considerar clientes que contribuem para aquele mês** — um cliente que entra em fevereiro não pode marcar
janeiro como estimado, porque não somou um centavo ao MRR de janeiro.

Substituir o corpo do laço `for (const c of clientes)`:

```ts
    let base = 0, novos = 0, churn = 0, churnReceita = 0, mrr = 0, ativosFim = 0;
    let estimado = false;
    for (const c of clientes) {
      const r = honorarioEm(c.vigencias, mes);
      // Sem vigência alguma (cliente antigo já inativado), cai no honorário fotografado na saída.
      const hon = c.vigencias.length > 0 ? r.valor : (c.honorarioSaida ?? 0);
      const semRegistro = c.vigencias.length === 0 || r.estimado;

      const entrouAntes = !c.dataInicio || c.dataInicio < ini;
      const entrouNoMes = !!c.dataInicio && c.dataInicio >= ini && c.dataInicio < prox;
      const naoSaiuAteIni = !c.dataSaida || c.dataSaida >= ini;
      const saiuNoMes = !!c.dataSaida && c.dataSaida >= ini && c.dataSaida < prox;
      const ativoFim = (entrouAntes || entrouNoMes) && (!c.dataSaida || c.dataSaida >= prox);

      if (entrouAntes && naoSaiuAteIni) base += 1;
      if (entrouNoMes) novos += 1;
      if (saiuNoMes) {
        churn += 1;
        churnReceita += hon;
        if (semRegistro) estimado = true; // contribuiu com receita perdida: o selo conta
      }
      if (ativoFim) {
        ativosFim += 1;
        mrr += hon;
        if (semRegistro) estimado = true; // contribuiu com MRR: o selo conta
      }
    }
```

e devolver `estimado` no objeto do mês:

```ts
    return { mes, base, novos, churn, liquido: novos - churn, ativosFim, churnPct, churnReceita, mrr, ticketMedio, estimado };
```

- [ ] **Step 4: Converter os quatro `ClienteMetrica` antigos do arquivo de teste**

Os testes existentes constroem `honorario: number`. Trocar por `vigencias`, preservando exatamente os
mesmos números. Note o **cliente C**: ele tinha `honorario: 0` e `honorarioSaida: 100` — a vigência
carrega o 100 (era o que ele pagava enquanto ativo), e o `honorarioSaida` continua como fallback.

```ts
  const clientes: ClienteMetrica[] = [
    // A: sempre ativo, 300
    { dataInicio: null, dataSaida: null, honorarioSaida: null,
      vigencias: [{ vigenteDe: "1900-01-01", valor: 300, estimada: false }] },
    // B: novo em fev, 200
    { dataInicio: "2026-02-10", dataSaida: null, honorarioSaida: null,
      vigencias: [{ vigenteDe: "2026-02-01", valor: 200, estimada: false }] },
    // C: saiu em fev; pagava 100 enquanto ativo
    { dataInicio: "2025-12-01", dataSaida: "2026-02-15", honorarioSaida: 100,
      vigencias: [{ vigenteDe: "2025-12-01", valor: 100, estimada: false }] },
  ];
```

e, no último teste do arquivo:

```ts
    const r = calcularMetricas(
      [{ dataInicio: "2026-03-05", dataSaida: null, honorarioSaida: null,
         vigencias: [{ vigenteDe: "2026-03-01", valor: 100, estimada: false }] }],
      ["2026-03"],
    );
```

- [ ] **Step 5: Corrigir `src/tests/financeiro/indicadores-render.test.tsx`**

Ele monta um `MesMetrica` literal, e o campo novo é obrigatório. Acrescentar `estimado: false` ao objeto
da `serie` (linha 7).

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test -- src/tests/financeiro/metricas.test.ts src/tests/financeiro/indicadores-render.test.tsx`
Expected: PASS — inclusive os testes antigos, com os mesmos números de antes (jan MRR 400, fev MRR 500,
churn receita 100).

- [ ] **Step 7: Verificar typecheck (o compilador aponta todos os usos do tipo antigo)**

Run: `npm run typecheck`
Expected: o único erro restante é em `src/app/(app)/financeiro/indicadores/actions.ts`, corrigido na Task 5.

- [ ] **Step 8: Commit**

```bash
git add src/lib/financeiro/metricas.ts src/tests/financeiro/metricas.test.ts src/tests/financeiro/indicadores-render.test.tsx
git commit -m "feat: MRR usa o honorário vigente de cada mês, e marca os meses estimados

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Indicadores carregam vigências e sinalizam estimativa

**Files:**
- Modify: `src/app/(app)/financeiro/indicadores/actions.ts`
- Modify: `src/app/(app)/financeiro/indicadores/Indicadores.tsx`

**Interfaces:**
- Consumes: `ClienteMetrica.vigencias` (Task 4).

- [ ] **Step 1: Carregar as vigências em `actions.ts`**

Substituir a query e o mapeamento:

```ts
  const { data } = await supabase
    .from("clientes")
    .select(
      "data_inicio, clientes_financeiro(honorario_mensal, data_saida, honorario_saida), honorario_vigencia(vigente_de, valor, estimada)",
    )
    .is("excluido_em", null);

  const clientes: ClienteMetrica[] = (data ?? []).map((c) => {
    const fin = Array.isArray(c.clientes_financeiro) ? c.clientes_financeiro[0] : c.clientes_financeiro;
    const vigRows = (c.honorario_vigencia ?? []) as { vigente_de: string; valor: number; estimada: boolean }[];
    const vigencias = vigRows.map((v) => ({
      vigenteDe: v.vigente_de,
      valor: Number(v.valor),
      estimada: v.estimada,
    }));
    return {
      dataInicio: (c.data_inicio as string | null) ?? null,
      dataSaida: (fin?.data_saida as string | null) ?? null,
      vigencias,
      honorarioSaida: fin?.honorario_saida != null ? Number(fin.honorario_saida) : null,
    };
  });
```

- [ ] **Step 2: Marcar os meses estimados em `Indicadores.tsx`**

Na célula do mês, acrescentar o asterisco; e uma legenda abaixo da tabela.

Na coluna `Mês` de cada linha:

```tsx
                <td className="px-3 py-1.5">
                  {m.mes}
                  {m.estimado && <span title="Honorário estimado neste mês" className="ml-1 text-cinza">*</span>}
                </td>
```

Depois da tabela:

```tsx
      <p className="text-xs text-cinza">
        * Mês em que o honorário de algum cliente veio de <strong>estimativa</strong> — não há registro do
        valor da época. O histórico real começa a partir das mudanças registradas pelo sistema.
      </p>
```

Acrescentar a coluna `estimado` ao CSV, na linha do `serie.map(...)` do `paraCSV`:

```ts
      serie.map((m) => [m.mes, String(m.base), String(m.novos), String(m.churn), String(m.liquido), String(m.ativosFim), pct(m.churnPct), formatarMoeda(m.churnReceita), formatarMoeda(m.mrr), formatarMoeda(m.ticketMedio), m.estimado ? "sim" : "não"]),
```

e o cabeçalho correspondente (`"Estimado"`) na lista de cabeçalhos do `paraCSV`.

- [ ] **Step 3: Verificar lint/typecheck/testes**

Run: `npm run lint && npm run typecheck && npm test`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/financeiro/indicadores/actions.ts" "src/app/(app)/financeiro/indicadores/Indicadores.tsx"
git commit -m "feat: indicadores carregam vigências e sinalizam quais meses são estimados

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Obrigações usam o regime vigente na competência

**Files:**
- Modify: `src/lib/obrigacoes/motor.ts`

**Interfaces:**
- Consumes: `regimeEm`, `VigenciaRegime` (Task 3).

Hoje `gerarInstancias` lê `clientes.regime_tributario` (o atual) e aplica a competências antigas na
geração retroativa. Passa a resolver pelo regime da época.

- [ ] **Step 1: Alterar `src/lib/obrigacoes/motor.ts`**

1. Import:

```ts
import { regimeEm, type VigenciaRegime } from "./vigencia";
```

2. Acrescentar `regime_vigencia` ao `select` dos clientes:

```ts
  let q = supabase.from("clientes").select("id, tipo_pessoa, regime_tributario, cnae, inscricao_estadual, inscricao_municipal, contador_id, endereco, competencia_inicial, data_inicio, clientes_financeiro(qtd_funcionarios), regime_vigencia(vigente_de, regime)").is("excluido_em", null).eq("status", "ativo");
```

3. Resolver o regime da competência antes de `sugerirPerfil`:

```ts
  const competencia = `${ano}-${String(mes).padStart(2, "0")}`;
  const linhas: Row[] = [];
  for (const cl of (clientes ?? []) as Row[]) {
    const finRaw = cl.clientes_financeiro;
    const fin = (Array.isArray(finRaw) ? finRaw[0] : finRaw) as { qtd_funcionarios?: number | null } | null;
    const qtd = fin?.qtd_funcionarios ?? null;
    // Regime VIGENTE na competência: a geração retroativa não pode aplicar o regime de hoje
    // a um mês antigo. Sem vigência, cai no regime atual do cadastro.
    const vigencias = ((cl.regime_vigencia as { vigente_de: string; regime: string }[] | null) ?? []).map(
      (v): VigenciaRegime => ({ vigenteDe: v.vigente_de, regime: v.regime }),
    );
    const regime = regimeEm(vigencias, competencia) ?? (cl.regime_tributario as string);
    const perfil = sugerirPerfil(cl.tipo_pessoa as string, regime, qtd);
```

O restante do laço permanece igual.

- [ ] **Step 2: Verificar lint/typecheck/testes**

Run: `npm run lint && npm run typecheck && npm test`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/obrigacoes/motor.ts
git commit -m "feat(obrigacoes): geração usa o regime vigente na competência

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Linha do tempo na ficha do cliente

**Files:**
- Create: `src/components/clientes/LinhaTempoVigencias.tsx`
- Modify: `src/app/(app)/clientes/[id]/page.tsx`

**Interfaces:**
- Produces: `<LinhaTempoVigencias clienteId={string} papel={Papel} />` — server component, somente leitura.

- [ ] **Step 1: Criar o componente**

Arquivo `src/components/clientes/LinhaTempoVigencias.tsx`:

```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { formatarMoeda } from "@/lib/format";
import type { Papel } from "@/lib/tipos";

// As vigências nascem das mudanças (trigger de banco) — não se digitam. Por isso: só leitura.
function mesAno(iso: string): string {
  const [ano, mes] = iso.slice(0, 7).split("-");
  return `${mes}/${ano}`;
}

export async function LinhaTempoVigencias({ clienteId, papel }: { clienteId: string; papel: Papel }) {
  if (!podeVerHonorario(papel)) return null;
  const supabase = await createServerSupabase();

  const [{ data: hon }, { data: reg }] = await Promise.all([
    supabase
      .from("honorario_vigencia")
      .select("vigente_de, valor, estimada")
      .eq("cliente_id", clienteId)
      .order("vigente_de", { ascending: false }),
    supabase
      .from("regime_vigencia")
      .select("vigente_de, regime, estimada")
      .eq("cliente_id", clienteId)
      .order("vigente_de", { ascending: false }),
  ]);

  if (!hon?.length && !reg?.length) return null;

  return (
    <section className="max-w-4xl space-y-3 rounded-lg border border-linha bg-white p-4">
      <h2 className="text-sm font-semibold text-texto">Histórico de honorário e regime</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-xs font-medium text-cinza">Honorário</h3>
          <ul className="space-y-1 text-sm">
            {hon?.map((v) => (
              <li key={v.vigente_de} className="flex items-center gap-2">
                <span className="tabular-nums text-cinza">{mesAno(v.vigente_de)}</span>
                <span className="text-texto">{formatarMoeda(Number(v.valor))}</span>
                {v.estimada && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-cinza">estimada</span>
                )}
              </li>
            ))}
            {!hon?.length && <li className="text-sm text-cinza">Sem histórico.</li>}
          </ul>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-medium text-cinza">Regime tributário</h3>
          <ul className="space-y-1 text-sm">
            {reg?.map((v) => (
              <li key={v.vigente_de} className="flex items-center gap-2">
                <span className="tabular-nums text-cinza">{mesAno(v.vigente_de)}</span>
                <span className="text-texto">{v.regime}</span>
                {v.estimada && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-cinza">estimada</span>
                )}
              </li>
            ))}
            {!reg?.length && <li className="text-sm text-cinza">Sem histórico.</li>}
          </ul>
        </div>
      </div>
      <p className="text-xs text-cinza">
        As vigências são registradas automaticamente a cada mudança. As marcadas como{" "}
        <strong>estimada</strong> vêm da carga inicial — não há registro do valor da época.
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Ligar na ficha**

Em `src/app/(app)/clientes/[id]/page.tsx`, adicionar o import e renderizar logo **depois** do
`<HonorarioForm ... />` (linha 119):

```tsx
import { LinhaTempoVigencias } from "@/components/clientes/LinhaTempoVigencias";
```

```tsx
      {mostrarHonorario && <LinhaTempoVigencias clienteId={id} papel={papel} />}
```

- [ ] **Step 3: Verificar lint/typecheck/build**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: sem erros; build compila.

- [ ] **Step 4: Commit**

```bash
git add src/components/clientes/LinhaTempoVigencias.tsx "src/app/(app)/clientes/[id]/page.tsx"
git commit -m "feat: linha do tempo de honorário e regime na ficha do cliente

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Asserts SQL dos triggers e da resolução

**Files:**
- Modify: `supabase/tests/rls.test.sql`

O arquivo roda numa transação com ROLLBACK. Seeds: cliente `aaaaaaaa-…001` (do contador) e
`aaaaaaaa-…002` (do admin), ambos com `clientes_financeiro`.

- [ ] **Step 1: Acrescentar o bloco ao final de `supabase/tests/rls.test.sql`**

```sql
-- ===== Vigências: captura por trigger, sem poluir o histórico =====
do $$
declare n int; v numeric; v_mes date := date_trunc('month', now())::date;
begin
  reset role;

  -- (1) INSERT em clientes_financeiro não explode (OLD não existe no INSERT) e cria a vigência
  insert into clientes (id, tipo_pessoa, razao_social, cpf_cnpj, regime_tributario)
    values ('aaaaaaaa-0000-0000-0000-0000000000e1','PJ','Cli Vigencia','55000000000353','Simples')
    on conflict do nothing;
  insert into clientes_financeiro (cliente_id, honorario_mensal)
    values ('aaaaaaaa-0000-0000-0000-0000000000e1', 500.00)
    on conflict (cliente_id) do update set honorario_mensal = 500.00;
  select count(*) into n from honorario_vigencia where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000e1';
  if n <> 1 then raise exception 'FALHA: insert não criou vigência de honorário (n=%)', n; end if;
  raise notice 'OK: insert em clientes_financeiro cria vigência (e não explode com OLD)';

  -- o insert do cliente criou a vigência de regime
  select count(*) into n from regime_vigencia where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000e1';
  if n <> 1 then raise exception 'FALHA: insert de cliente não criou vigência de regime (n=%)', n; end if;

  -- (2) update que NÃO muda o honorário não cria vigência
  update clientes_financeiro set dia_vencimento = 15 where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000e1';
  update clientes_financeiro set honorario_mensal = 500.00 where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000e1';
  select count(*) into n from honorario_vigencia where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000e1';
  if n <> 1 then raise exception 'FALHA: update sem mudança poluiu o histórico (n=%)', n; end if;
  raise notice 'OK: update que não muda o valor não cria vigência';

  -- (3) duas mudanças no mesmo mês => UMA linha, com o último valor
  update clientes_financeiro set honorario_mensal = 600.00 where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000e1';
  update clientes_financeiro set honorario_mensal = 700.00 where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000e1';
  select count(*) into n from honorario_vigencia
    where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000e1' and vigente_de = v_mes;
  if n <> 1 then raise exception 'FALHA: duas mudanças no mesmo mês criaram % linhas', n; end if;
  select valor into v from honorario_vigencia
    where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000e1' and vigente_de = v_mes;
  if v <> 700.00 then raise exception 'FALHA: a última mudança do mês não venceu (valor=%)', v; end if;
  raise notice 'OK: duas mudanças no mesmo mês => uma linha, último valor';

  -- (4) mudança de regime cria vigência de regime (comparação por contagem: `regime` é enum)
  update clientes set regime_tributario = 'Presumido' where id = 'aaaaaaaa-0000-0000-0000-0000000000e1';
  select count(*) into n from regime_vigencia
    where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000e1'
      and vigente_de = v_mes and regime = 'Presumido';
  if n <> 1 then raise exception 'FALHA: mudança de regime não criou vigência (n=%)', n; end if;
  raise notice 'OK: mudança de regime cria vigência';

  -- (5) honorario_vigente devolve o valor DA ÉPOCA, não o atual
  insert into honorario_vigencia (cliente_id, valor, vigente_de, estimada)
    values ('aaaaaaaa-0000-0000-0000-0000000000e1', 300.00, date '2025-01-01', false)
    on conflict do nothing;
  if honorario_vigente('aaaaaaaa-0000-0000-0000-0000000000e1', date '2025-06-01') <> 300.00 then
    raise exception 'FALHA: honorario_vigente não devolveu o valor da época';
  end if;
  if honorario_vigente('aaaaaaaa-0000-0000-0000-0000000000e1', v_mes) <> 700.00 then
    raise exception 'FALHA: honorario_vigente não devolveu o valor corrente';
  end if;
  raise notice 'OK: honorario_vigente resolve pela competência';

  -- (6) gerar_mensalidades de uma competência antiga usa o honorário daquela competência
  perform gerar_mensalidades(date '2025-06-01');
  select valor into v from titulo
    where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000e1'
      and origem = 'MENSALIDADE' and competencia = date '2025-06-01';
  if v is distinct from 300.00 then
    raise exception 'FALHA: geração retroativa cobrou % (esperado 300.00, o valor da época)', v;
  end if;
  raise notice 'OK: geração retroativa usa o honorário da época';
end $$;
```

- [ ] **Step 2: Rodar os testes**

Run: `npm run db:test`
Expected: todos os asserts passam, incluindo os seis novos `OK:`.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/rls.test.sql
git commit -m "test(db): triggers de vigência e resolução por competência

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Documentação

**Files:**
- Modify: `docs/DOCUMENTACAO.md`

- [ ] **Step 1: Documentar as vigências no módulo Financeiro (seção 3.10)**

Acrescentar depois do bloco de "Regime vencido":

```markdown
- **Vigências de honorário e regime:** toda mudança de honorário ou de regime tributário grava uma
  **vigência** (a partir de qual competência o valor vale), capturada por **trigger de banco** — o
  honorário é escrito por quatro caminhos diferentes. O MRR, o churn de receita e o ticket médio passam
  a usar **o honorário de cada mês**, e a geração de mensalidades usa o **valor vigente na competência**
  (uma geração retroativa não cobra o valor de hoje por um serviço antigo). As obrigações usam o
  **regime vigente na competência**. A ficha do cliente mostra a linha do tempo.
- **O que é estimativa:** o histórico anterior à entrega **não existe** — as vigências da carga inicial
  são marcadas como `estimada`, e a tela de indicadores assinala com `*` os meses cujo valor veio de
  estimativa. O sistema não finge saber o que não sabe.
```

- [ ] **Step 2: Commit**

```bash
git add docs/DOCUMENTACAO.md
git commit -m "docs: vigências de honorário e regime

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verificação final

- [ ] `npm run lint && npm run typecheck && npm test` — tudo verde.
- [ ] `npm run build` — compila.
- [ ] `npm run db:test` — asserts verdes, incluindo os seis novos.
- [ ] Backfill conferido (Task 1, Step 3): 99 vigências de honorário e 99 de regime, **todas estimadas**.
- [ ] **Validação manual** (após deploy): alterar o honorário de um cliente de teste na ficha → a linha do
      tempo ganha uma vigência do mês corrente, **sem** o selo "estimada"; a tela de indicadores mostra
      `*` nos meses antigos e a legenda.
