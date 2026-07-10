# Competência do mês anterior, vencimento no mês atual e 13º em duas parcelas — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faturar em regime vencido — a competência é o mês do serviço (M−1), o vencimento cai no mês atual (M) — corrigir os 99 títulos e 102 NFS-e já gravados com competência errada, e passar a gerar o 13º honorário em duas parcelas (20/11 e 15/12).

**Architecture:** Uma migration ajusta a RPC de geração, cria `competencia_padrao()` (testável isoladamente), adiciona `nfse.dcompet` para preservar o que foi enviado à Sefin e corrige os dados existentes — nesta ordem, porque inverter destrói informação. O XML das notas nunca é tocado.

**Tech Stack:** Postgres (Supabase) com runner de migrations próprio · Next.js 16 (Server Actions) · TypeScript · Vitest · asserts SQL em `supabase/tests/rls.test.sql`.

## Global Constraints

- Migrations via `npm run db:migrate`; **nunca** `supabase db push`. Próxima livre: **0071**.
- Migrations aplicadas são **imutáveis** — mudança = nova migration.
- **A ordem dentro da migration é crítica:** backfill de `dcompet` **antes** do `update` da competência. Invertido, perde-se para sempre o registro do que foi enviado à Sefin.
- **Nenhum XML é alterado.** `dps_xml` e `nfse_xml` seguem com `dCompet = julho`. A verdade fiscal é o XML.
- `dia_vencimento` ∈ [1, 28] por CHECK em `contrato` e `clientes_financeiro` — somar um mês nunca transborda.
- **Regra do 13º:** um honorário, 50%/50%, vencimentos **fixos** 20/11 e 15/12, competências novembro e dezembro, gerado na rodada de **outubro**, para **todos os clientes ativos com honorário**.
- `Date.now()` / `new Date()` sem argumento são proibidos **dentro de componentes** (regra `react-hooks/purity`). O relógio vive em `src/lib/`.
- Rodar antes de cada commit: `npm run lint && npm run typecheck && npm test`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

- **Create** `src/lib/financeiro/competencia.ts` — `mesAnterior` (puro) e `mesAnteriorDeHoje` (usa o relógio, fora de componente).
- **Create** `src/tests/financeiro/competencia.test.ts` — fronteiras (virada de ano).
- **Create** `supabase/migrations/0071_competencia_mes_anterior.sql` — `competencia_padrao()`, `gerar_mensalidades` (vencimento M+1, 13º em 2 parcelas, 13º removido do laço de contratos), `gerar_mensalidades_automatico()`, coluna `nfse.dcompet` + backfill + correção dos dados.
- **Modify** `supabase/tests/rls.test.sql` — asserts da geração e do 13º.
- **Modify** `src/app/(app)/clientes/[id]/nfse.ts` — grava `dcompet` na emissão (V5-A).
- **Modify** `src/app/(app)/clientes/[id]/nfse-emitente.ts` — grava `dcompet` na emissão (V5-B).
- **Modify** `src/components/financeiro/ContasReceber.tsx` — competência padrão = mês anterior.
- **Modify** `src/components/nfse/LoteNfse.tsx` — competência padrão = mês anterior.
- **Modify** `src/components/nfse/EmitirNfse.tsx` e `src/components/nfse/EmitirNfseCliente.tsx` — competência padrão = mês anterior.
- **Modify** `docs/DOCUMENTACAO.md` — regra de faturamento e o campo `dcompet`.

---

### Task 1: Helper puro de competência

**Files:**
- Create: `src/lib/financeiro/competencia.ts`
- Create: `src/tests/financeiro/competencia.test.ts`

**Interfaces:**
- Produces:
  - `mesAnterior(hojeISO: string): string` — `"2026-07-10"` → `"2026-06"` (formato de `<input type="month">`)
  - `mesAnteriorDeHoje(): string` — mesma coisa, a partir do relógio em America/Sao_Paulo

- [ ] **Step 1: Escrever o teste que falha**

Arquivo `src/tests/financeiro/competencia.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mesAnterior } from "@/lib/financeiro/competencia";

describe("mesAnterior", () => {
  it("devolve o mês anterior no formato YYYY-MM", () => {
    expect(mesAnterior("2026-07-10")).toBe("2026-06");
    expect(mesAnterior("2026-03-01")).toBe("2026-02");
    expect(mesAnterior("2026-08-31")).toBe("2026-07");
  });
  it("vira o ano corretamente em janeiro", () => {
    expect(mesAnterior("2026-01-15")).toBe("2025-12");
    expect(mesAnterior("2026-01-01")).toBe("2025-12");
  });
  it("não depende do dia do mês", () => {
    expect(mesAnterior("2026-05-01")).toBe(mesAnterior("2026-05-28"));
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- src/tests/financeiro/competencia.test.ts`
Expected: FAIL — módulo `@/lib/financeiro/competencia` não existe.

- [ ] **Step 3: Implementar**

Arquivo `src/lib/financeiro/competencia.ts`:

```ts
// O escritório fatura em regime vencido: a competência corrente é sempre o mês anterior.
// Puro (recebe a data) para ser testável; o relógio fica na função de baixo.

// "2026-07-10" -> "2026-06" (formato de <input type="month">)
export function mesAnterior(hojeISO: string): string {
  const partes = hojeISO.slice(0, 7).split("-");
  const ano = Number(partes[0]);
  const mes = Number(partes[1]);
  const total = ano * 12 + (mes - 1) - 1; // meses desde o ano 0, menos um
  const a = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${a}-${String(m).padStart(2, "0")}`;
}

// Fora de componente: usar o relógio aqui não dispara react-hooks/purity.
export function mesAnteriorDeHoje(): string {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return mesAnterior(hoje);
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- src/tests/financeiro/competencia.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/financeiro/competencia.ts src/tests/financeiro/competencia.test.ts
git commit -m "feat: helper de competência (mês anterior), puro e testado

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Migration — geração, 13º, `dcompet` e correção dos dados

**Files:**
- Create: `supabase/migrations/0071_competencia_mes_anterior.sql`

**Interfaces:**
- Produces: função `competencia_padrao(p_hoje date default current_date) returns date`; `gerar_mensalidades(date)` com vencimento no mês seguinte e 13º em duas parcelas; `gerar_mensalidades_automatico()` usando `competencia_padrao()`; coluna `nfse.dcompet date`.

- [ ] **Step 1: Escrever a migration**

Arquivo `supabase/migrations/0071_competencia_mes_anterior.sql`:

```sql
-- Faturamento em regime vencido: a competência é o mês do SERVIÇO (M-1) e o título vence em M.
-- Também: 13º honorário em duas parcelas com vencimentos fixos, e separação entre o mês do serviço
-- (nfse.competencia) e o que foi enviado à Sefin (nfse.dcompet).
--
-- ORDEM CRÍTICA: o backfill de dcompet vem ANTES do update da competência. Invertido, perde-se para
-- sempre o registro do que a nota autorizada declarou.

-- (A) A competência corrente é sempre o mês anterior. Função própria para ser testável isoladamente.
create or replace function competencia_padrao(p_hoje date default current_date) returns date
  language sql immutable set search_path = pg_catalog, public as $$
  select (date_trunc('month', p_hoje) - interval '1 month')::date;
$$;
revoke all on function competencia_padrao(date) from public;
grant execute on function competencia_padrao(date) to authenticated;

-- (B) Geração: mensalidade vence no mês SEGUINTE à competência; 13º em duas parcelas por CLIENTE.
-- O 13º saiu do laço de contratos: se ficasse, um cliente com contrato receberia 13º duas vezes
-- (uma pelo contrato, outra pelo cliente). O honorario_mensal já é a soma dos contratos ativos.
create or replace function gerar_mensalidades(p_competencia date) returns jsonb
  language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_comp date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_dias int := extract(day from v_fim)::int;
  v_venc_mes date := (v_comp + interval '1 month')::date;  -- 1º dia do mês de vencimento
  v_ano int := extract(year from v_comp)::int;
  v_gerados int := 0; v_pulados int := 0;
  r record; v_valor numeric; v_venc date; v_ins int;
  v_cat_hon uuid; v_cat_13 uuid; v_p1 numeric; v_p2 numeric;
begin
  select id into v_cat_hon from categoria where nome = 'Honorários mensais' and categoria_pai_id is null limit 1;
  select id into v_cat_13  from categoria where nome = '13º honorário'      and categoria_pai_id is null limit 1;

  -- (1) MENSALIDADE por contrato ATIVO já iniciado
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

  -- (2) MENSALIDADE do honorário para clientes ativos SEM contrato ativo
  for r in
    select c.id as cliente_id, f.honorario_mensal, coalesce(f.dia_vencimento, 10) as dia
    from clientes c join clientes_financeiro f on f.cliente_id = c.id
    where c.excluido_em is null and c.status = 'ativo'
      and coalesce(f.honorario_mensal,0) > 0
      and not exists (select 1 from contrato ct where ct.cliente_id = c.id and ct.status = 'ATIVO')
  loop
    v_venc := (v_venc_mes + (r.dia - 1))::date;
    insert into titulo (cliente_id, contrato_id, origem, descricao, valor, competencia, vencimento, categoria_id)
      values (r.cliente_id, null, 'MENSALIDADE', 'Honorário mensal', r.honorario_mensal, v_comp, v_venc, v_cat_hon)
      on conflict do nothing;
    get diagnostics v_ins = row_count;
    if v_ins > 0 then v_gerados := v_gerados + 1; else v_pulados := v_pulados + 1; end if;
  end loop;

  -- (3) 13º HONORÁRIO: gerado na rodada de OUTUBRO (competência = outubro), quando ambos os
  -- vencimentos (20/11 e 15/12) ainda estão no futuro. Um honorário dividido em 50%/50%.
  if extract(month from v_comp)::int = 10 then
    for r in
      select c.id as cliente_id, f.honorario_mensal
      from clientes c join clientes_financeiro f on f.cliente_id = c.id
      where c.excluido_em is null and c.status = 'ativo'
        and coalesce(f.honorario_mensal,0) > 0
    loop
      -- A 2ª parcela é o RESTO, não outro round(): 333.33 -> 166.67 + 166.66 = 333.33 exato.
      v_p1 := round(r.honorario_mensal / 2, 2);
      v_p2 := r.honorario_mensal - v_p1;

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

-- (C) O job do dia 1 passa a gerar a competência ANTERIOR.
create or replace function gerar_mensalidades_automatico() returns void
  language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if (select geracao_automatica from financeiro_config where id = 1) then
    perform gerar_mensalidades(competencia_padrao());
  end if;
end $$;

-- (D) dcompet: o que foi ENVIADO à Sefin. nfse.competencia passa a ser o mês do SERVIÇO.
alter table nfse add column if not exists dcompet date;
comment on column nfse.dcompet is
  'Competência efetivamente enviada na DPS (dCompet). Pode divergir de nfse.competencia nas notas '
  'emitidas antes da correção de 2026-07: lá, competencia = mês do serviço e dcompet = o que a nota diz.';

-- Congela o que foi enviado ANTES de qualquer alteração. Esta linha precisa vir antes da (E).
update nfse set dcompet = competencia where dcompet is null;

-- (E) Correção do ciclo de julho/2026: as notas e os títulos referem-se ao serviço de JUNHO.
-- O vencimento dos títulos NÃO é tocado (segue em julho, que é o regime vencido correto).
update nfse   set competencia = date '2026-06-01' where competencia = date '2026-07-01';
update titulo set competencia = date '2026-06-01'
  where competencia = date '2026-07-01' and origem = 'MENSALIDADE';
```

- [ ] **Step 2: Conferir os números ANTES de aplicar**

A terceira contagem é a que **autoriza** o `update`: se junho já tivesse títulos, mover os de julho
violaria `uq_titulo_honorario (cliente_id, competencia, origem)` e a migration abortaria (a transação
protege o banco, mas é melhor saber antes).

Run:
```bash
node --env-file=.env.local --input-type=module -e "
import { makeClient } from './scripts/_db.mjs';
const c = makeClient(); await c.connect();
const q = async (s) => (await c.query(s)).rows[0].n;
console.log('nfse julho (esperado 102):        ', await q(\"select count(*)::int n from nfse where competencia='2026-07-01'\"));
console.log('titulos julho (esperado 99):      ', await q(\"select count(*)::int n from titulo where competencia='2026-07-01' and origem='MENSALIDADE'\"));
console.log('titulos junho (PRECISA ser 0):    ', await q(\"select count(*)::int n from titulo where competencia='2026-06-01'\"));
await c.end();"
```
Expected: `102`, `99`, `0`. Se o terceiro não for 0, **parar** e reavaliar.

- [ ] **Step 3: Aplicar a migration**

Run: `npm run db:migrate`
Expected: `+ aplicando: 0071_competencia_mes_anterior.sql` sem erro.

- [ ] **Step 4: Conferir os números DEPOIS (a prova de que a migração fez o que devia)**

Run:
```bash
node --env-file=.env.local --input-type=module -e "
import { makeClient } from './scripts/_db.mjs';
const c = makeClient(); await c.connect();
const q = async (s) => (await c.query(s)).rows[0].n;
console.log('nfse com competencia julho (esperado 0):   ', await q(\"select count(*)::int n from nfse where competencia='2026-07-01'\"));
console.log('nfse com competencia junho (esperado 102): ', await q(\"select count(*)::int n from nfse where competencia='2026-06-01'\"));
console.log('nfse com dcompet nulo (esperado 0):        ', await q('select count(*)::int n from nfse where dcompet is null'));
console.log('nfse com dcompet julho (esperado 102):     ', await q(\"select count(*)::int n from nfse where dcompet='2026-07-01'\"));
console.log('titulos competencia julho (esperado 0):    ', await q(\"select count(*)::int n from titulo where competencia='2026-07-01' and origem='MENSALIDADE'\"));
console.log('titulos competencia junho (esperado 99):   ', await q(\"select count(*)::int n from titulo where competencia='2026-06-01' and origem='MENSALIDADE'\"));
console.log('titulos vencendo em julho (esperado 99):   ', await q(\"select count(*)::int n from titulo where vencimento >= '2026-07-01' and vencimento < '2026-08-01' and origem='MENSALIDADE'\"));
await c.end();"
```
Expected: exatamente os valores entre parênteses. O último confirma que o **vencimento não foi tocado**.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0071_competencia_mes_anterior.sql
git commit -m "feat(db): competência = mês do serviço, vencimento no mês seguinte, 13º em 2 parcelas

Adiciona nfse.dcompet (o que foi enviado à Sefin) e corrige o ciclo de julho/2026:
102 NFS-e e 99 títulos passam para competência junho. O XML das notas não é tocado.
O 13º sai do laço de contratos e passa a ser gerado por cliente, em duas parcelas
(20/11 e 15/12), evitando dupla cobrança.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Asserts SQL da geração e do 13º

**Files:**
- Modify: `supabase/tests/rls.test.sql`

O arquivo roda numa transação com ROLLBACK. Seeds existentes: clientes `aaaaaaaa-…001` (do contador) e
`aaaaaaaa-…002` (do admin), ambos com `clientes_financeiro`.

- [ ] **Step 1: Acrescentar os asserts ao final de `supabase/tests/rls.test.sql`**

```sql
-- ===== Faturamento em regime vencido: competência do serviço, vencimento no mês seguinte =====
do $$
declare v_venc date; v_comp date; n int; v_soma numeric; v_p1 numeric; v_p2 numeric;
begin
  reset role;

  -- competencia_padrao devolve o mês anterior (fronteiras: virada de ano)
  if competencia_padrao(date '2026-01-15') <> date '2025-12-01' then
    raise exception 'FALHA: competencia_padrao não virou o ano';
  end if;
  if competencia_padrao(date '2026-03-01') <> date '2026-02-01' then
    raise exception 'FALHA: competencia_padrao errou o mês anterior';
  end if;
  if competencia_padrao(date '2026-08-31') <> date '2026-07-01' then
    raise exception 'FALHA: competencia_padrao dependeu do dia do mês';
  end if;
  raise notice 'OK: competencia_padrao devolve o mês anterior';

  -- cliente de teste com honorário 333.33 e vencimento dia 10
  update clientes_financeiro set honorario_mensal = 333.33, dia_vencimento = 10
    where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002';

  -- a mensalidade de maio vence em JUNHO
  perform gerar_mensalidades(date '2026-05-01');
  select vencimento into v_venc from titulo
    where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002'
      and origem = 'MENSALIDADE' and competencia = date '2026-05-01';
  if v_venc is distinct from date '2026-06-10' then
    raise exception 'FALHA: mensalidade de maio venceu em % (esperado 2026-06-10)', v_venc;
  end if;
  raise notice 'OK: mensalidade da competência M vence em M+1';

  -- a rodada de maio NÃO gera 13º
  select count(*) into n from titulo
    where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002' and origem = 'DECIMO_TERCEIRO';
  if n <> 0 then raise exception 'FALHA: rodada de maio gerou % títulos de 13º', n; end if;

  -- a rodada de OUTUBRO gera as duas parcelas, com vencimentos fixos
  perform gerar_mensalidades(date '2026-10-01');
  select count(*) into n from titulo
    where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002' and origem = 'DECIMO_TERCEIRO';
  if n <> 2 then raise exception 'FALHA: rodada de outubro gerou % parcelas de 13º (esperado 2)', n; end if;

  select competencia, vencimento, valor into v_comp, v_venc, v_p1 from titulo
    where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002' and origem = 'DECIMO_TERCEIRO' and parcela = 1;
  if v_comp <> date '2026-11-01' or v_venc <> date '2026-11-20' then
    raise exception 'FALHA: 13º 1/2 com competência % e vencimento % (esperado 2026-11-01 / 2026-11-20)', v_comp, v_venc;
  end if;

  select competencia, vencimento, valor into v_comp, v_venc, v_p2 from titulo
    where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002' and origem = 'DECIMO_TERCEIRO' and parcela = 2;
  if v_comp <> date '2026-12-01' or v_venc <> date '2026-12-15' then
    raise exception 'FALHA: 13º 2/2 com competência % e vencimento % (esperado 2026-12-01 / 2026-12-15)', v_comp, v_venc;
  end if;
  raise notice 'OK: 13º em duas parcelas, vencimentos 20/11 e 15/12';

  -- a soma das parcelas é exata (nem cria nem perde centavo)
  if v_p1 <> 166.67 or v_p2 <> 166.66 or (v_p1 + v_p2) <> 333.33 then
    raise exception 'FALHA: parcelas do 13º somam % (% + %), esperado 333.33', v_p1 + v_p2, v_p1, v_p2;
  end if;
  raise notice 'OK: parcelas do 13º somam o honorário exato (166.67 + 166.66)';

  -- idempotência: rodar de novo não duplica
  perform gerar_mensalidades(date '2026-10-01');
  select count(*) into n from titulo
    where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002' and origem = 'DECIMO_TERCEIRO';
  if n <> 2 then raise exception 'FALHA: segunda rodada duplicou o 13º (% títulos)', n; end if;
  raise notice 'OK: geração é idempotente';
end $$;
```

- [ ] **Step 2: Rodar os testes**

Run: `npm run db:test`
Expected: todos os asserts passam, incluindo os cinco novos `OK:` acima.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/rls.test.sql
git commit -m "test(db): regime vencido, 13º em duas parcelas e soma exata das parcelas

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Emissão grava `dcompet`

**Files:**
- Modify: `src/app/(app)/clientes/[id]/nfse.ts`
- Modify: `src/app/(app)/clientes/[id]/nfse-emitente.ts`

**Interfaces:**
- A coluna `dcompet` recebe a mesma competência enviada na DPS. Daqui para frente as duas coincidem; a divergência existe só nas 102 linhas históricas.

- [ ] **Step 1: V5-A — `emitirNfseCliente` grava `dcompet`**

Em `src/app/(app)/clientes/[id]/nfse.ts`, há **dois** `insert` em `nfse` dentro de `emitirNfseCliente`
(um no `catch` de falha de comunicação, outro no caminho normal). Em **ambos**, acrescentar
`dcompet: competencia,` logo após a linha `competencia,`:

```ts
    await supabase.from("nfse").insert({
      cliente_id: clienteId,
      valor,
      competencia,
      dcompet: competencia, // o que foi enviado na DPS (dCompet)
      status: "erro",
      dps_xml: assinado,
      ambiente,
      avulsa,
      mensagens: [{ descricao: "Falha de comunicação" }],
    });
```

e

```ts
  await supabase.from("nfse").insert({
    cliente_id: clienteId,
    valor,
    competencia,
    dcompet: competencia, // o que foi enviado na DPS (dCompet)
    status: resultado.autorizada ? "autorizada" : "rejeitada",
    chave_acesso: resultado.chaveAcesso ?? null,
    numero: resultado.numero ?? null,
    dps_xml: assinado,
    nfse_xml: resultado.xmlNfse ?? null,
    mensagens: resultado.mensagens ? resultado.mensagens.map((m) => ({ descricao: m })) : null,
    ambiente,
    avulsa,
    autorizada_em: resultado.autorizada ? new Date().toISOString() : null,
  });
```

- [ ] **Step 2: V5-B — `emitirNfseDoCliente` grava `dcompet`**

Em `src/app/(app)/clientes/[id]/nfse-emitente.ts`, o objeto `baseRow` é usado pelos dois `insert`.
Acrescentar `dcompet` a ele, logo depois de `competencia`:

```ts
  const baseRow = {
    cliente_id: clienteId,
    emitente: "cliente" as const,
    valor: dados.valor,
    competencia: dados.competencia,
    dcompet: dados.competencia, // o que foi enviado na DPS (dCompet)
    ambiente,
    tomador_documento: documento,
    tomador_razao_social: dados.tomadorRazaoSocial,
    tomador_endereco: dados.tomadorEndereco,
    descricao_servico: config.descricaoServico,
    dps_xml: assinado,
  };
```

- [ ] **Step 3: Verificar lint/typecheck**

Run: `npm run lint && npm run typecheck`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/clientes/[id]/nfse.ts" "src/app/(app)/clientes/[id]/nfse-emitente.ts"
git commit -m "feat(nfse): emissão grava dcompet (competência enviada na DPS)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: UI — competência padrão = mês anterior

**Files:**
- Modify: `src/components/financeiro/ContasReceber.tsx`
- Modify: `src/components/nfse/LoteNfse.tsx`
- Modify: `src/components/nfse/EmitirNfse.tsx`
- Modify: `src/components/nfse/EmitirNfseCliente.tsx`

**Interfaces:**
- Consumes: `mesAnteriorDeHoje()` de `@/lib/financeiro/competencia` (Task 1).

Em todos os quatro, o estado do mês é `const [mes, setMes] = useState("")`. Passa a nascer com o mês
anterior. `mesAnteriorDeHoje()` usa o relógio **dentro de `src/lib/`**, não no corpo do componente —
por isso não dispara `react-hooks/purity`.

- [ ] **Step 1: `ContasReceber.tsx`**

Adicionar o import e trocar o `useState` do mês:

```tsx
import { mesAnteriorDeHoje } from "@/lib/financeiro/competencia";
```

```tsx
  // Faturamento em regime vencido: a competência corrente é o mês anterior.
  const [mes, setMes] = useState(mesAnteriorDeHoje());
```

- [ ] **Step 2: `LoteNfse.tsx`**

Mesmo import; trocar `const [mes, setMes] = useState("");` por:

```tsx
  // Emissão nos primeiros dias do mês, referente ao serviço do mês anterior.
  const [mes, setMes] = useState(mesAnteriorDeHoje());
```

- [ ] **Step 3: `EmitirNfse.tsx` e `EmitirNfseCliente.tsx`**

Em cada um, mesmo import e mesma troca:

```tsx
  const [mes, setMes] = useState(mesAnteriorDeHoje());
```

- [ ] **Step 4: Verificar lint/typecheck/testes/build**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: sem erros. Se o lint acusar `react-hooks/purity`, algum `new Date()` escapou para dentro de
um componente — o relógio deve vir de `mesAnteriorDeHoje()`.

- [ ] **Step 5: Commit**

```bash
git add src/components/financeiro/ContasReceber.tsx src/components/nfse/LoteNfse.tsx src/components/nfse/EmitirNfse.tsx src/components/nfse/EmitirNfseCliente.tsx
git commit -m "feat: competência padrão nas telas = mês anterior (regime vencido)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Documentação

**Files:**
- Modify: `docs/DOCUMENTACAO.md`

- [ ] **Step 1: Documentar a regra de faturamento no módulo Financeiro (seção 3.10)**

Acrescentar ao bloco de "Contas a receber", antes de "Dashboard financeiro":

```markdown
- **Regime vencido:** a **competência** de um título é o **mês do serviço**; o **vencimento** cai no
  **mês seguinte**. A geração roda no dia 1 (pg_cron) para a competência do mês anterior. O **13º
  honorário** equivale a um honorário, dividido em **duas parcelas de 50%**, com vencimentos fixos em
  **20/11** e **15/12**, geradas na rodada de outubro.
```

- [ ] **Step 2: Documentar `dcompet` na seção de NFS-e (3.8)**

Acrescentar:

```markdown
- **Competência × `dCompet`:** `nfse.competencia` é o **mês do serviço**; `nfse.dcompet` guarda o que foi
  **efetivamente enviado à Sefin** na DPS. Nas notas emitidas até julho/2026 os dois divergem (a nota
  declarou julho para o serviço de junho); daí em diante coincidem. O XML autorizado é a verdade fiscal
  e nunca é alterado.
```

- [ ] **Step 3: Commit**

```bash
git add docs/DOCUMENTACAO.md
git commit -m "docs: regime vencido, 13º em duas parcelas e a coluna dcompet

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verificação final

- [ ] `npm run lint && npm run typecheck && npm test` — tudo verde.
- [ ] `npm run build` — compila.
- [ ] `npm run db:test` — asserts verdes, incluindo os cinco novos.
- [ ] Conferência dos dados (Task 2, Step 4) — 102 NFS-e e 99 títulos em junho, `dcompet` = julho em
      102 linhas, **vencimento inalterado** (99 títulos vencendo em julho).
- [ ] **Validação manual** (após deploy): abrir `/financeiro/contas-a-receber` e conferir que o seletor
      de competência já vem no **mês anterior**; conferir que os títulos de junho aparecem com
      vencimento em julho.
