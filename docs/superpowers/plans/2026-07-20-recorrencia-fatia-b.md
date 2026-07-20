# Flag "tem honorários recorrentes" — Fatia B — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marcar um cliente como "sem honorários recorrentes" para excluí-lo da geração automática de mensalidade (interruptor mestre que prevalece sobre contrato ativo), com checkbox na aba Financeiro do cliente.

**Architecture:** Coluna `clientes_financeiro.tem_honorarios_recorrentes` (default true). A RPC `gerar_mensalidades` é recriada com a flag nos três blocos (contrato/honorário/13º); ausência de linha em `clientes_financeiro` conta como `true` (default). O checkbox entra no `HonorarioForm`, é lido por `normalizarExtensaoFinanceira` e persistido no upsert.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres/plpgsql), Tailwind 4, vitest + `renderToStaticMarkup`.

## Global Constraints

- Migrations imutáveis; nova idempotente (`add column if not exists`, `create or replace function`). A coluna é adicionada ANTES do `create or replace` no mesmo arquivo (o plpgsql valida o corpo na criação).
- Aba Financeiro do cliente = `podeVerHonorario` (admin/financeiro/contador); `salvarHonorario` confia na RLS de `clientes_financeiro`.
- Guard `divida-ui`: sem `border` estático em input escrito à mão (usar `controleCls`); sem `←`/`amber-\d`.
- Imports `@/*`. Rodar antes de commitar: `npm run lint && npm run typecheck && npm test && npm run format && npm run build`.

---

### Task 1: Migration — coluna + RPC com a flag

**Files:**
- Create: `supabase/migrations/0121_recorrencia_flag.sql`

**Interfaces:**
- Produces: coluna `clientes_financeiro.tem_honorarios_recorrentes boolean not null default true`; `gerar_mensalidades(date)` recriada respeitando a flag nos 3 blocos.

- [ ] **Step 1: Write the migration**

```sql
-- Flag "tem honorários recorrentes": interruptor mestre da geração de mensalidade.
-- Cliente com a flag desmarcada não gera nada — nem por honorário, nem por contrato ativo.
alter table clientes_financeiro add column if not exists tem_honorarios_recorrentes boolean not null default true;

-- Recria gerar_mensalidades (0073) com a flag nos três blocos. Ausência de linha em
-- clientes_financeiro conta como true (default), para não quebrar clientes só com contrato.
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

  -- (1) MENSALIDADE por contrato ATIVO — a flag prevalece: cliente não-recorrente não gera nem com contrato.
  for r in
    select ct.* from contrato ct
    join clientes c on c.id = ct.cliente_id
    where ct.status = 'ATIVO' and ct.data_inicio <= v_fim
      and c.excluido_em is null and c.status = 'ativo'
      and coalesce((select f.tem_honorarios_recorrentes from clientes_financeiro f where f.cliente_id = ct.cliente_id), true)
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

  -- (2) MENSALIDADE do honorário vigente, para clientes sem contrato ativo E recorrentes.
  for r in
    select c.id as cliente_id, coalesce(f.dia_vencimento, 10) as dia
    from clientes c join clientes_financeiro f on f.cliente_id = c.id
    where c.excluido_em is null and c.status = 'ativo'
      and coalesce(f.honorario_mensal,0) > 0
      and f.tem_honorarios_recorrentes
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

  -- (3) 13º HONORÁRIO na rodada de OUTUBRO — só para recorrentes.
  if extract(month from v_comp)::int = 10 then
    for r in
      select c.id as cliente_id
      from clientes c join clientes_financeiro f on f.cliente_id = c.id
      where c.excluido_em is null and c.status = 'ativo'
        and coalesce(f.honorario_mensal,0) > 0
        and f.tem_honorarios_recorrentes
    loop
      v_hon := honorario_vigente(r.cliente_id, v_comp);
      if coalesce(v_hon, 0) <= 0 then continue; end if;
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

- [ ] **Step 2: Verify**

Run: `grep -cE "if not exists|create or replace|f.tem_honorarios_recorrentes|coalesce\(\(select f.tem_honorarios" supabase/migrations/0121_recorrencia_flag.sql`
Expected: ≥ 4 (coluna idempotente, função recriada, flag nos blocos 2 e 3, e o coalesce do bloco 1).

> Aplicada em produção via `node --env-file=.env.producao.bak scripts/db-migrate.mjs` antes do Implantar.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0121_recorrencia_flag.sql
git commit -m "feat(recorrencia): flag tem_honorarios_recorrentes + RPC (0121)"
```

---

### Task 2: `normalizarExtensaoFinanceira` lê o checkbox

**Files:**
- Modify: `src/lib/financeiro/extensaoCliente.ts`
- Test: `src/tests/financeiro/extensao-recorrencia.test.ts`

**Interfaces:**
- Produces: `ExtensaoFinanceira` ganha `tem_honorarios_recorrentes: boolean`; `normalizarExtensaoFinanceira` lê o campo `tem_honorarios_recorrentes` do FormData (presente = true, ausente = false — semântica de checkbox).

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/financeiro/extensao-recorrencia.test.ts
import { describe, it, expect } from "vitest";
import { normalizarExtensaoFinanceira } from "@/lib/financeiro/extensaoCliente";

function fd(pairs: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(pairs)) f.set(k, v);
  return f;
}

describe("normalizarExtensaoFinanceira — recorrência", () => {
  it("checkbox presente => tem_honorarios_recorrentes true", () => {
    const r = normalizarExtensaoFinanceira(fd({ tem_honorarios_recorrentes: "on" }));
    expect("erro" in r ? null : r.tem_honorarios_recorrentes).toBe(true);
  });
  it("checkbox ausente => tem_honorarios_recorrentes false", () => {
    const r = normalizarExtensaoFinanceira(fd({}));
    expect("erro" in r ? null : r.tem_honorarios_recorrentes).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/financeiro/extensao-recorrencia.test.ts`
Expected: FAIL (campo `tem_honorarios_recorrentes` não existe no retorno).

- [ ] **Step 3: Implement**

Em `src/lib/financeiro/extensaoCliente.ts`:

(a) adicionar ao tipo `ExtensaoFinanceira`:

```ts
  tem_honorarios_recorrentes: boolean;
```

(b) no `return` de `normalizarExtensaoFinanceira`, adicionar o campo (lendo o checkbox — presente = true):

```ts
    tem_honorarios_recorrentes: fd.get("tem_honorarios_recorrentes") != null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/financeiro/extensao-recorrencia.test.ts`
Expected: PASS (2 asserts).

- [ ] **Step 5: Commit**

```bash
git add src/lib/financeiro/extensaoCliente.ts src/tests/financeiro/extensao-recorrencia.test.ts
git commit -m "feat(recorrencia): normalizarExtensaoFinanceira lê o checkbox"
```

---

### Task 3: Checkbox no `HonorarioForm` + fiação na page

**Files:**
- Modify: `src/components/HonorarioForm.tsx`
- Modify: `src/app/(app)/clientes/[id]/page.tsx`
- Test: `src/tests/financeiro/honorario-recorrencia-render.test.tsx`

**Interfaces:**
- Consumes: `ExtensaoFinanceiraForm` (estende com `tem_honorarios_recorrentes: boolean`).
- Produces: `HonorarioForm` recebe `temContratoAtivo: boolean` (novo prop) e renderiza o checkbox + honorário desabilitado + avisos.

- [ ] **Step 1: Update the form**

Em `src/components/HonorarioForm.tsx`:

(a) adicionar ao tipo `ExtensaoFinanceiraForm`:

```ts
  tem_honorarios_recorrentes: boolean;
```

(b) trocar a assinatura para receber `temContratoAtivo`:

```tsx
export function HonorarioForm({
  clienteId,
  valorAtual,
  extensao,
  temContratoAtivo,
}: {
  clienteId: string;
  valorAtual: number | null;
  extensao: ExtensaoFinanceiraForm;
  temContratoAtivo: boolean;
}) {
```

(c) adicionar estado do checkbox (após o `useActionState`):

```tsx
  const [recorrente, setRecorrente] = useState(extensao.tem_honorarios_recorrentes);
```

e o import do `useState`:

```tsx
import { useActionState, useState } from "react";
```

(d) logo após o `<h2>Honorário</h2>`, inserir o checkbox e os avisos:

```tsx
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="tem_honorarios_recorrentes"
          checked={recorrente}
          onChange={(e) => setRecorrente(e.target.checked)}
        />
        Cliente tem honorários recorrentes
      </label>
      {!recorrente && (
        <p className="text-xs text-cinza">Cliente sem cobrança recorrente — só avulsa.</p>
      )}
      {!recorrente && temContratoAtivo && (
        <p role="alert" className="text-xs text-negativo">
          Este cliente tem contrato ativo, mas está marcado como não-recorrente — não gerará mensalidade.
        </p>
      )}
```

(e) desabilitar o input de honorário quando não-recorrente — trocar o `<input name="honorario_mensal" ...>` para incluir `disabled={!recorrente}`:

```tsx
        <input
          name="honorario_mensal"
          type="text"
          inputMode="decimal"
          defaultValue={valorBR}
          placeholder="0,00"
          disabled={!recorrente}
          className={`${controleCls()} w-48`}
        />
```

- [ ] **Step 2: Wire the page**

Em `src/app/(app)/clientes/[id]/page.tsx`:

(a) adicionar `tem_honorarios_recorrentes: true` ao literal default de `extensaoFinanceira`:

```tsx
    percentual_reajuste: null as number | null,
    tem_honorarios_recorrentes: true,
```

(b) incluir a coluna no `select` de `clientes_financeiro` (acrescentar `, tem_honorarios_recorrentes`):

```tsx
      .select(
        "honorario_mensal, dia_vencimento, qtd_funcionarios, faixa_faturamento, data_saida, cobranca_whatsapp, cobranca_email, indice_reajuste, percentual_reajuste, tem_honorarios_recorrentes",
      )
```

(c) no bloco `if (fin) { extensaoFinanceira = {...} }`, acrescentar o campo (default true quando null):

```tsx
        percentual_reajuste: fin.percentual_reajuste != null ? Number(fin.percentual_reajuste) : null,
        tem_honorarios_recorrentes: fin.tem_honorarios_recorrentes !== false,
```

(d) computar `temContratoAtivo` e passar ao form. Após `const contratos = ...`:

```tsx
  const temContratoAtivo = contratos.some((ct) => ct.status === "ATIVO");
```

e trocar a renderização do form:

```tsx
            <HonorarioForm
              clienteId={id}
              valorAtual={valorHonorario}
              extensao={extensaoFinanceira}
              temContratoAtivo={temContratoAtivo}
            />
```

- [ ] **Step 3: Write the render test**

```tsx
// src/tests/financeiro/honorario-recorrencia-render.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/(app)/clientes/actions", () => ({ salvarHonorario: vi.fn() }));

import { HonorarioForm } from "@/components/HonorarioForm";

const ext = {
  dia_vencimento: null,
  qtd_funcionarios: null,
  faixa_faturamento: null,
  data_saida: null,
  indice_reajuste: null,
  percentual_reajuste: null,
  tem_honorarios_recorrentes: false,
};

describe("HonorarioForm — recorrência", () => {
  it("mostra o checkbox e, quando não-recorrente, o aviso de só avulsa", () => {
    const html = renderToStaticMarkup(
      <HonorarioForm clienteId="c1" valorAtual={null} extensao={ext} temContratoAtivo={false} />,
    );
    expect(html).toContain("Cliente tem honorários recorrentes");
    expect(html).toContain("só avulsa");
  });
  it("com contrato ativo + não-recorrente, avisa o conflito", () => {
    const html = renderToStaticMarkup(
      <HonorarioForm clienteId="c1" valorAtual={null} extensao={ext} temContratoAtivo={true} />,
    );
    expect(html).toContain("contrato ativo");
  });
});
```

- [ ] **Step 4: Run the render test**

Run: `npx vitest run src/tests/financeiro/honorario-recorrencia-render.test.tsx`
Expected: PASS (2 asserts). O mock de `salvarHonorario` evita puxar a server action (o `useActionState` só precisa de uma referência).

- [ ] **Step 5: Full gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add src/components/HonorarioForm.tsx "src/app/(app)/clientes/[id]/page.tsx" src/tests/financeiro/honorario-recorrencia-render.test.tsx
git commit -m "feat(recorrencia): checkbox de honorários recorrentes na aba Financeiro"
```

---

## Self-Review

**1. Spec coverage (Fatia B):**
- Coluna `tem_honorarios_recorrentes` (default true) → Task 1. ✅
- RPC recriada com a flag nos 3 blocos, prevalecendo sobre contrato → Task 1. ✅
- Checkbox no HonorarioForm + honorário desabilitado + aviso "só avulsa" → Task 3. ✅
- Aviso de conflito (contrato ativo + não-recorrente) → Task 3. ✅
- Persistência via `salvarHonorario`/`normalizarExtensaoFinanceira` + leitura na page → Tasks 2, 3. ✅

**2. Placeholder scan:** Nenhum TBD/TODO; todo passo com código. ✅

**3. Type consistency:** `ExtensaoFinanceira` (lib) e `ExtensaoFinanceiraForm` (form) ambas ganham `tem_honorarios_recorrentes: boolean`; a page monta o literal com esse campo. `temContratoAtivo` novo prop do form. `normalizarExtensaoFinanceira` retorna o campo, consumido no upsert de `salvarHonorario` (`...ext`). Checkbox: presente=true/ausente=false, coerente entre form e normalizador. ✅

**Nota de dependência:** confirmado — `listarContratos` (`contratos.ts`) devolve `status` no select, então `temContratoAtivo = contratos.some(ct => ct.status === "ATIVO")` funciona.
