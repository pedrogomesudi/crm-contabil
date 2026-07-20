# Suspensão por Inadimplência — Fatia A (núcleo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suspender clientes inadimplentes com alçada segregada (financeiro suspende, admin reativa), cessando o faturamento e registrando auditoria — sem ainda travar o portal (Fatia B).

**Architecture:** Estado corrente em `clientes.suspenso` + histórico em `cliente_suspensao`; parâmetros (dias de tolerância, piso) em `escritorio_config`. Uma RPC deriva a fila de candidatos/suspensos. Lógica de elegibilidade e alçada em funções puras testadas. Ações server aplicam o efeito (flag + contratos `ATIVO↔SUSPENSO` + log). Tela `/financeiro/inadimplencia` para a equipe financeira operar.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + RLS), Tailwind 4, vitest + `renderToStaticMarkup`.

## Global Constraints

- Papel vive em `usuarios.papel`, lido via `auth_papel()` — NUNCA do JWT/`app_metadata`.
- Migrations imutáveis após aplicadas; a nova deve ser idempotente (`add column if not exists`, `create table if not exists`, `drop policy if exists ... ; create policy ...`). Aplicada por `npm run db:migrate` (não `supabase db push`).
- Imports via alias `@/*`. Segredos server-only.
- Guard `divida-ui`: inputs NÃO declaram `border` estático no className escrito à mão — usar `controleCls` de `@/components/ui/Campo`; proibido `←`/`&larr;` e classes `amber-\d`.
- Guard `rotas-alcancaveis`: rota nova sob `/financeiro/*` já é coberta pelo hub, mas deve ter link real a partir de `/financeiro/cadastros`.
- `escritorio_config` é singleton `id=1`; escrita admin-only via `createAdminSupabase()`.
- Rodar antes de commitar: `npm run lint && npm run typecheck && npm test && npm run format`.

---

### Task 1: Lógica pura de elegibilidade e alçada

**Files:**
- Create: `src/lib/financeiro/suspensao.ts`
- Test: `src/tests/financeiro/suspensao.test.ts`

**Interfaces:**
- Produces:
  - `elegivelSuspensao(diasAtraso: number, saldoDevedor: number, diasTolerancia: number | null, valorMinimo: number | null): boolean`
  - `podeSuspender(papel: string): boolean`
  - `podeReativar(papel: string): boolean`
  - `motivoValido(motivo: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/financeiro/suspensao.test.ts
import { describe, it, expect } from "vitest";
import { elegivelSuspensao, podeSuspender, podeReativar, motivoValido } from "@/lib/financeiro/suspensao";

describe("elegivelSuspensao", () => {
  it("elegível quando atraso >= tolerância e saldo >= piso", () => {
    expect(elegivelSuspensao(30, 500, 30, 100)).toBe(true);
  });
  it("não elegível se atraso menor que a tolerância", () => {
    expect(elegivelSuspensao(29, 500, 30, 100)).toBe(false);
  });
  it("não elegível se saldo abaixo do piso", () => {
    expect(elegivelSuspensao(40, 50, 30, 100)).toBe(false);
  });
  it("piso null = sem piso (qualquer saldo positivo conta)", () => {
    expect(elegivelSuspensao(40, 1, 30, null)).toBe(true);
  });
  it("tolerância null = feature desligada", () => {
    expect(elegivelSuspensao(999, 9999, null, null)).toBe(false);
  });
  it("tolerância 0 = desligada (não sugere ninguém)", () => {
    expect(elegivelSuspensao(999, 9999, 0, null)).toBe(false);
  });
  it("saldo zero nunca é elegível", () => {
    expect(elegivelSuspensao(40, 0, 30, null)).toBe(false);
  });
});

describe("alçada", () => {
  it("financeiro e admin suspendem; contador/assistente/cliente não", () => {
    expect(podeSuspender("admin")).toBe(true);
    expect(podeSuspender("financeiro")).toBe(true);
    expect(podeSuspender("contador")).toBe(false);
    expect(podeSuspender("assistente")).toBe(false);
    expect(podeSuspender("cliente")).toBe(false);
  });
  it("só admin reativa", () => {
    expect(podeReativar("admin")).toBe(true);
    expect(podeReativar("financeiro")).toBe(false);
    expect(podeReativar("contador")).toBe(false);
  });
});

describe("motivoValido", () => {
  it("exige texto não vazio após trim", () => {
    expect(motivoValido("acordo de parcelamento")).toBe(true);
    expect(motivoValido("   ")).toBe(false);
    expect(motivoValido("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/financeiro/suspensao.test.ts`
Expected: FAIL (módulo `@/lib/financeiro/suspensao` não existe)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/financeiro/suspensao.ts
// Regras puras de elegibilidade e alçada da suspensão por inadimplência.
// tolerância null/0 = feature desligada; piso null = sem piso.
export const elegivelSuspensao = (
  diasAtraso: number,
  saldoDevedor: number,
  diasTolerancia: number | null,
  valorMinimo: number | null,
): boolean =>
  diasTolerancia != null &&
  diasTolerancia > 0 &&
  diasAtraso >= diasTolerancia &&
  saldoDevedor > 0 &&
  (valorMinimo == null || saldoDevedor >= valorMinimo);

// financeiro (e admin) suspende; apenas admin reativa (a alçada).
export const podeSuspender = (papel: string): boolean => papel === "admin" || papel === "financeiro";
export const podeReativar = (papel: string): boolean => papel === "admin";

export const motivoValido = (motivo: string): boolean => motivo.trim().length > 0;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/financeiro/suspensao.test.ts`
Expected: PASS (13 assertions)

- [ ] **Step 5: Commit**

```bash
git add src/lib/financeiro/suspensao.ts src/tests/financeiro/suspensao.test.ts
git commit -m "feat(suspensao): lógica pura de elegibilidade e alçada"
```

---

### Task 2: Migration 0117 — schema, RLS e RPC de candidatos

**Files:**
- Create: `supabase/migrations/0117_suspensao_inadimplencia.sql`

**Interfaces:**
- Produces (banco):
  - coluna `clientes.suspenso boolean not null default false`
  - tabela `cliente_suspensao(id, cliente_id, acao, motivo, saldo_devedor, dias_atraso, por, em)`
  - colunas `escritorio_config.suspensao_dias_tolerancia int`, `escritorio_config.suspensao_valor_minimo numeric(15,2)`
  - RPC `financeiro_suspensao_candidatos()` → jsonb array de `{cliente_id, cliente, saldo_devedor, dias_atraso, suspenso}` (uma linha por cliente que está suspenso OU tem saldo vencido > 0)

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0117_suspensao_inadimplencia.sql
-- RF Financeiro: suspensão por inadimplência (Fatia A — núcleo).

-- Estado corrente (barato para UI e, na Fatia B, para RLS do portal).
alter table clientes add column if not exists suspenso boolean not null default false;

-- Trilha de auditoria append-only: quem suspendeu/reativou, por quê e contra qual dívida.
create table if not exists cliente_suspensao (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references clientes(id) on delete cascade,
  acao          text not null check (acao in ('suspensao','reativacao')),
  motivo        text not null,
  saldo_devedor numeric(15,2),
  dias_atraso   int,
  por           uuid references usuarios(id),
  em            timestamptz not null default now()
);
create index if not exists idx_cliente_suspensao_cliente on cliente_suspensao(cliente_id, em desc);

-- RLS: leitura para a equipe; escrita para a equipe financeira. A segregação
-- suspender(financeiro)/reativar(admin) é aplicada na server action, não aqui.
alter table cliente_suspensao enable row level security;
drop policy if exists cliente_suspensao_read  on cliente_suspensao;
drop policy if exists cliente_suspensao_write on cliente_suspensao;
create policy cliente_suspensao_read on cliente_suspensao for select
  using (auth_papel() in ('admin','contador','assistente','financeiro'));
create policy cliente_suspensao_write on cliente_suspensao for all
  using (auth_papel() in ('admin','financeiro')) with check (auth_papel() in ('admin','financeiro'));

-- Parâmetros. null/0 em dias = feature desligada; null em valor = sem piso.
alter table escritorio_config add column if not exists suspensao_dias_tolerancia int;
alter table escritorio_config add column if not exists suspensao_valor_minimo numeric(15,2);

-- Fila derivada: uma linha por cliente que está suspenso OU tem saldo vencido > 0.
-- saldo_devedor = soma do saldo dos títulos RECEBER vencidos; dias_atraso = maior atraso.
create or replace function financeiro_suspensao_candidatos() returns jsonb
  language sql stable security invoker set search_path = public as $$
  with ts as (
    select t.cliente_id, t.vencimento,
      (t.valor - coalesce((select sum(valor_recebido) from baixa where titulo_id = t.id and estornada = false), 0)) as saldo
    from titulo t
    where t.status <> 'CANCELADO' and t.tipo = 'RECEBER' and t.cliente_id is not null
  ),
  venc as (
    select cliente_id,
           sum(saldo) as saldo_devedor,
           max((current_date - vencimento)) as dias_atraso
    from ts
    where vencimento < current_date and saldo > 0
    group by cliente_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'cliente_id', c.id,
    'cliente', c.razao_social,
    'saldo_devedor', coalesce(v.saldo_devedor, 0),
    'dias_atraso', coalesce(v.dias_atraso, 0),
    'suspenso', c.suspenso
  ) order by coalesce(v.saldo_devedor, 0) desc), '[]'::jsonb)
  from clientes c
  left join venc v on v.cliente_id = c.id
  where c.suspenso or v.cliente_id is not null;
$$;
revoke all on function financeiro_suspensao_candidatos() from public;
grant execute on function financeiro_suspensao_candidatos() to authenticated;
```

- [ ] **Step 2: Verify idempotency guards**

Run: `grep -E "if not exists|drop policy if exists|create or replace" supabase/migrations/0117_suspensao_inadimplencia.sql | wc -l`
Expected: ≥ 8 (todas as criações são idempotentes). Confirme visualmente que não há `create table cliente_suspensao (` sem `if not exists` nem `create policy` sem `drop ... if exists` antes.

> Nota: sem Docker local, a migration não roda em teste unitário. Ela é aplicada em produção no release via `node --env-file=.env.producao.bak scripts/db-migrate.mjs` (antes do Implantar). A validação de RLS acontece por `npm run db:test` quando houver Session pooler.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0117_suspensao_inadimplencia.sql
git commit -m "feat(suspensao): schema, RLS e RPC de candidatos (0117)"
```

---

### Task 3: Config dos parâmetros (admin) na tela de pagamento

**Files:**
- Modify: `src/app/(app)/configuracoes/pagamento/actions.ts` (adicionar `salvarConfigSuspensao`)
- Modify: `src/app/(app)/configuracoes/pagamento/page.tsx` (ler os 2 campos e renderizar o bloco)

**Interfaces:**
- Consumes: `createAdminSupabase` de `@/lib/supabase/admin`, `getPerfilAtual` de `@/lib/auth/perfil`, `controleCls` de `@/components/ui/Campo`.
- Produces: `salvarConfigSuspensao(formData: FormData): Promise<void>` (admin-only; grava `suspensao_dias_tolerancia`, `suspensao_valor_minimo` em `escritorio_config` id=1).

- [ ] **Step 1: Add the server action**

Adicione ao fim de `src/app/(app)/configuracoes/pagamento/actions.ts`:

```ts
export async function salvarConfigSuspensao(formData: FormData): Promise<void> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || perfil.papel !== "admin") return;
  const num = (k: string): number | null => {
    const raw = String(formData.get(k) ?? "")
      .trim()
      .replace(/\./g, "")
      .replace(",", ".");
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const dias = num("suspensao_dias_tolerancia");
  const valor = num("suspensao_valor_minimo");
  const admin = createAdminSupabase();
  await admin
    .from("escritorio_config")
    .update({
      suspensao_dias_tolerancia: dias == null ? null : Math.round(dias),
      suspensao_valor_minimo: valor,
    })
    .eq("id", 1);
  revalidatePath("/configuracoes/pagamento");
}
```

- [ ] **Step 2: Render the config block on the page**

Em `src/app/(app)/configuracoes/pagamento/page.tsx`: (a) amplie o select do `escritorio_config`; (b) importe a nova action; (c) adicione o bloco `<form>`.

Trocar a linha do select da config (linha ~15):

```tsx
  const { data: cfg } = await admin
    .from("escritorio_config")
    .select("alcada_pagamento, suspensao_dias_tolerancia, suspensao_valor_minimo")
    .eq("id", 1)
    .maybeSingle();
  const alcada = (cfg?.alcada_pagamento as number | null) ?? null;
  const dias = (cfg?.suspensao_dias_tolerancia as number | null) ?? null;
  const piso = (cfg?.suspensao_valor_minimo as number | null) ?? null;
```

Trocar o import da action (linha 8):

```tsx
import { salvarAlcada, salvarConfigSuspensao } from "./actions";
```

Adicionar, logo antes de `</Container>`, o bloco:

```tsx
      <form action={salvarConfigSuspensao} className="max-w-md space-y-2 rounded-lg border border-linha bg-white p-4">
        <h2 className="text-sm font-semibold text-grafite">Suspensão por inadimplência</h2>
        <p className="text-xs text-cinza">
          Clientes com atraso a partir destes dias e saldo devedor a partir do piso entram na fila de
          sugestão de suspensão. Dias vazio ou 0 = suspensão desligada. Piso vazio = sem piso.
        </p>
        <label className="flex items-center gap-2 text-sm">
          Dias de tolerância
          <input
            name="suspensao_dias_tolerancia"
            type="number"
            step="1"
            min="0"
            defaultValue={dias ?? ""}
            className={controleCls("compacto")}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          Piso R$
          <input
            name="suspensao_valor_minimo"
            type="number"
            step="0.01"
            min="0"
            defaultValue={piso ?? ""}
            className={controleCls("compacto")}
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-verde px-4 py-2 text-sm font-medium text-white hover:brightness-105"
        >
          Salvar suspensão
        </button>
      </form>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/configuracoes/pagamento/actions.ts src/app/\(app\)/configuracoes/pagamento/page.tsx
git commit -m "feat(suspensao): config admin de dias de tolerância e piso"
```

---

### Task 4: Ações de suspensão/reativação + tela `/financeiro/inadimplencia`

**Files:**
- Create: `src/app/(app)/financeiro/inadimplencia/actions.ts`
- Create: `src/app/(app)/financeiro/inadimplencia/page.tsx`
- Create: `src/app/(app)/financeiro/inadimplencia/LinhaCliente.tsx`
- Modify: `src/app/(app)/financeiro/cadastros/page.tsx` (adicionar item no hub)
- Test: `src/tests/financeiro/inadimplencia-ui.test.tsx`

**Interfaces:**
- Consumes: `elegivelSuspensao`, `podeSuspender`, `podeReativar`, `motivoValido` de `@/lib/financeiro/suspensao`; `getPerfilAtual`; `createServerSupabase`; `createAdminSupabase`; RPC `financeiro_suspensao_candidatos`.
- Produces:
  - `type ClienteSuspensao = { clienteId: string; cliente: string; saldoDevedor: number; diasAtraso: number; suspenso: boolean }`
  - `type ListaSuspensao = { papel: string; sugeridos: ClienteSuspensao[]; suspensos: ClienteSuspensao[]; reativaveis: ClienteSuspensao[] }`
  - `listarSuspensao(): Promise<ListaSuspensao | null>`
  - `suspenderCliente(clienteId: string, motivo: string): Promise<{ ok?: boolean; erro?: string }>`
  - `reativarCliente(clienteId: string, motivo: string): Promise<{ ok?: boolean; erro?: string }>`

- [ ] **Step 1: Write the actions**

```ts
// src/app/(app)/financeiro/inadimplencia/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { elegivelSuspensao, podeSuspender, podeReativar, motivoValido } from "@/lib/financeiro/suspensao";

export type ClienteSuspensao = {
  clienteId: string;
  cliente: string;
  saldoDevedor: number;
  diasAtraso: number;
  suspenso: boolean;
};
export type ListaSuspensao = {
  papel: string;
  sugeridos: ClienteSuspensao[];
  suspensos: ClienteSuspensao[];
  reativaveis: ClienteSuspensao[];
};

type Row = { cliente_id: string; cliente: string; saldo_devedor: number; dias_atraso: number; suspenso: boolean };

export async function listarSuspensao(): Promise<ListaSuspensao | null> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeGerenciarFinanceiro(perfil.papel)) return null;
  const supabase = await createServerSupabase();
  const [{ data: rows }, { data: cfg }] = await Promise.all([
    supabase.rpc("financeiro_suspensao_candidatos"),
    supabase.from("escritorio_config").select("suspensao_dias_tolerancia, suspensao_valor_minimo").eq("id", 1).maybeSingle(),
  ]);
  const dias = (cfg?.suspensao_dias_tolerancia as number | null) ?? null;
  const piso = (cfg?.suspensao_valor_minimo as number | null) ?? null;
  const itens: ClienteSuspensao[] = ((rows ?? []) as Row[]).map((r) => ({
    clienteId: r.cliente_id,
    cliente: r.cliente,
    saldoDevedor: Number(r.saldo_devedor),
    diasAtraso: Number(r.dias_atraso),
    suspenso: r.suspenso,
  }));
  return {
    papel: perfil.papel,
    sugeridos: itens.filter((i) => !i.suspenso && elegivelSuspensao(i.diasAtraso, i.saldoDevedor, dias, piso)),
    suspensos: itens.filter((i) => i.suspenso && i.saldoDevedor > 0),
    reativaveis: itens.filter((i) => i.suspenso && i.saldoDevedor <= 0),
  };
}

export async function suspenderCliente(clienteId: string, motivo: string): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeSuspender(perfil.papel)) return { erro: "Sem permissão para suspender." };
  if (!motivoValido(motivo)) return { erro: "Informe o motivo da suspensão." };
  const supabase = await createServerSupabase();
  const { data: rows } = await supabase.rpc("financeiro_suspensao_candidatos");
  const row = ((rows ?? []) as Row[]).find((r) => r.cliente_id === clienteId);
  if (!row) return { erro: "Cliente não encontrado na fila." };
  if (row.suspenso) return { erro: "Cliente já está suspenso." };
  const admin = createAdminSupabase();
  await admin.from("clientes").update({ suspenso: true }).eq("id", clienteId);
  await admin.from("contrato").update({ status: "SUSPENSO" }).eq("cliente_id", clienteId).eq("status", "ATIVO");
  await admin.from("cliente_suspensao").insert({
    cliente_id: clienteId,
    acao: "suspensao",
    motivo: motivo.trim(),
    saldo_devedor: Number(row.saldo_devedor),
    dias_atraso: Number(row.dias_atraso),
    por: perfil.id,
  });
  revalidatePath("/financeiro/inadimplencia");
  return { ok: true };
}

export async function reativarCliente(clienteId: string, motivo: string): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeReativar(perfil.papel)) return { erro: "Só um admin pode reativar." };
  if (!motivoValido(motivo)) return { erro: "Informe o motivo da reativação." };
  const admin = createAdminSupabase();
  await admin.from("clientes").update({ suspenso: false }).eq("id", clienteId);
  await admin.from("contrato").update({ status: "ATIVO" }).eq("cliente_id", clienteId).eq("status", "SUSPENSO");
  await admin.from("cliente_suspensao").insert({
    cliente_id: clienteId,
    acao: "reativacao",
    motivo: motivo.trim(),
    por: perfil.id,
  });
  revalidatePath("/financeiro/inadimplencia");
  return { ok: true };
}
```

- [ ] **Step 2: Write the client row component**

```tsx
// src/app/(app)/financeiro/inadimplencia/LinhaCliente.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { controleCls } from "@/components/ui/Campo";
import { formatarMoeda } from "@/lib/format";
import type { ClienteSuspensao } from "./actions";

export function LinhaCliente({
  item,
  acaoLabel,
  onAcao,
}: {
  item: ClienteSuspensao;
  acaoLabel: string;
  onAcao: (clienteId: string, motivo: string) => Promise<{ ok?: boolean; erro?: string }>;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function confirmar() {
    setErro("");
    setBusy(true);
    const r = await onAcao(item.clienteId, motivo);
    setBusy(false);
    if (r.ok) {
      setAberto(false);
      setMotivo("");
      router.refresh();
    } else {
      setErro(r.erro ?? "Erro");
    }
  }

  return (
    <li className="flex flex-col gap-1 rounded-lg border border-linha bg-white p-3 text-sm">
      <span className="flex items-center justify-between gap-2">
        <span className="font-medium text-texto">{item.cliente}</span>
        <span className="text-cinza">
          {formatarMoeda(item.saldoDevedor)} · {item.diasAtraso}d
        </span>
      </span>
      {!aberto && (
        <button type="button" onClick={() => setAberto(true)} className="w-fit text-verde underline">
          {acaoLabel}
        </button>
      )}
      {aberto && (
        <span className="flex flex-col gap-1">
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (obrigatório)"
            className={controleCls("compacto")}
          />
          <span className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={confirmar}
              className="rounded bg-verde px-2 py-0.5 font-medium text-white"
            >
              Confirmar
            </button>
            <button type="button" onClick={() => setAberto(false)} className="text-cinza underline">
              Cancelar
            </button>
          </span>
          {erro && <span className="text-negativo">{erro}</span>}
        </span>
      )}
    </li>
  );
}
```

- [ ] **Step 3: Write the page**

```tsx
// src/app/(app)/financeiro/inadimplencia/page.tsx
import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { Voltar } from "@/components/ui/Voltar";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { podeReativar } from "@/lib/financeiro/suspensao";
import { PageHeader } from "@/components/ui/PageHeader";
import { LinhaCliente } from "./LinhaCliente";
import { listarSuspensao, suspenderCliente, reativarCliente } from "./actions";

export default async function InadimplenciaPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const dados = await listarSuspensao();
  if (!dados) redirect("/");
  const admin = podeReativar(dados.papel);
  return (
    <Container largura="padrao" className="space-y-6 p-4">
      <Voltar href="/financeiro/cadastros" />
      <PageHeader titulo="Inadimplência e suspensão" subtitulo="Sugestões de suspensão, suspensos e reativação" />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-grafite">Sugeridos para suspensão ({dados.sugeridos.length})</h2>
        {dados.sugeridos.length === 0 ? (
          <p className="text-sm text-cinza">Ninguém elegível com a regra atual.</p>
        ) : (
          <ul className="space-y-2">
            {dados.sugeridos.map((i) => (
              <LinhaCliente key={i.clienteId} item={i} acaoLabel="Suspender" onAcao={suspenderCliente} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-grafite">Suspensos ({dados.suspensos.length})</h2>
        {dados.suspensos.length === 0 ? (
          <p className="text-sm text-cinza">Nenhum cliente suspenso.</p>
        ) : (
          <ul className="space-y-2">
            {dados.suspensos.map((i) =>
              admin ? (
                <LinhaCliente key={i.clienteId} item={i} acaoLabel="Reativar" onAcao={reativarCliente} />
              ) : (
                <li key={i.clienteId} className="flex items-center justify-between rounded-lg border border-linha bg-white p-3 text-sm">
                  <span className="font-medium text-texto">{i.cliente}</span>
                  <span className="text-cinza">suspenso · só admin reativa</span>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-grafite">Suspensos sem pendência ({dados.reativaveis.length})</h2>
        {dados.reativaveis.length === 0 ? (
          <p className="text-sm text-cinza">Nenhum.</p>
        ) : (
          <ul className="space-y-2">
            {dados.reativaveis.map((i) =>
              admin ? (
                <LinhaCliente key={i.clienteId} item={i} acaoLabel="Reativar (quitado)" onAcao={reativarCliente} />
              ) : (
                <li key={i.clienteId} className="flex items-center justify-between rounded-lg border border-linha bg-white p-3 text-sm">
                  <span className="font-medium text-texto">{i.cliente}</span>
                  <span className="text-cinza">quitado · só admin reativa</span>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </Container>
  );
}
```

- [ ] **Step 4: Add hub link**

Em `src/app/(app)/financeiro/cadastros/page.tsx`, dentro do array `ITENS`, logo após a linha de `regua-cobranca`, adicione:

```tsx
  { href: "/financeiro/inadimplencia", label: "Inadimplência e suspensão" },
```

- [ ] **Step 5: Write the render test**

```tsx
// src/tests/financeiro/inadimplencia-ui.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LinhaCliente } from "@/app/(app)/financeiro/inadimplencia/LinhaCliente";

const item = { clienteId: "c1", cliente: "Padaria X", saldoDevedor: 500, diasAtraso: 40, suspenso: false };
const noop = async () => ({ ok: true });

describe("LinhaCliente", () => {
  it("mostra o cliente, o saldo e o rótulo da ação", () => {
    const html = renderToStaticMarkup(<LinhaCliente item={item} acaoLabel="Suspender" onAcao={noop} />);
    expect(html).toContain("Padaria X");
    expect(html).toContain("Suspender");
    expect(html).toContain("40d");
  });
  it("o rótulo da ação é configurável (reativar)", () => {
    const html = renderToStaticMarkup(
      <LinhaCliente item={{ ...item, suspenso: true }} acaoLabel="Reativar" onAcao={noop} />,
    );
    expect(html).toContain("Reativar");
  });
});
```

- [ ] **Step 6: Run the render test**

Run: `npx vitest run src/tests/financeiro/inadimplencia-ui.test.tsx`
Expected: PASS (3 assertions). Se o runner reclamar de JSX no arquivo `.tsx`, confirme que outros testes `.test.tsx` do projeto rodam igual (mesma config vitest).

- [ ] **Step 7: Full gate**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tudo verde (incluindo `rotas-alcancaveis` e `divida-ui`, que a rota nova e os inputs com `controleCls` devem satisfazer).

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/financeiro/inadimplencia" "src/app/(app)/financeiro/cadastros/page.tsx" src/tests/financeiro/inadimplencia-ui.test.tsx
git commit -m "feat(suspensao): ações e tela /financeiro/inadimplencia"
```

---

## Self-Review

**1. Spec coverage:**
- Modelo de dados (clientes.suspenso + cliente_suspensao + 2 params) → Task 2. ✅
- Lógica pura (elegivelSuspensao, podeSuspender, podeReativar) → Task 1. ✅
- Ações suspender/reativar com efeito em contratos + auditoria → Task 4. ✅
- Fila derivada de sugeridos + suspensos + reativáveis → RPC (Task 2) + `listarSuspensao` (Task 4). ✅
- Config admin dos parâmetros → Task 3. ✅
- Tela `/financeiro/inadimplencia` + link no hub → Task 4. ✅
- Alçada segregada (financeiro suspende, admin reativa) → `podeSuspender`/`podeReativar` (Task 1) aplicados nas actions (Task 4) e no gate da UI (page). ✅
- Reativação por quitação como sugestão manual → bloco `reativaveis` (Task 4). ✅
- Fora de escopo (portal, cron) → não incluídos, corretamente (Fatia B / futuro). ✅

**2. Placeholder scan:** Nenhum TBD/TODO; todo passo com código completo. ✅

**3. Type consistency:** `ClienteSuspensao`/`ListaSuspensao` definidos em Task 4 e usados consistentemente na page e no componente; `Row` (snake_case do RPC) mapeado para camelCase uma única vez em `listarSuspensao`. `financeiro_suspensao_candidatos` retorna exatamente as chaves consumidas (`cliente_id, cliente, saldo_devedor, dias_atraso, suspenso`). Assinaturas de `suspenderCliente`/`reativarCliente` batem com o `onAcao` do componente. ✅

**Nota de dependência:** a RPC usa `baixa.estornada = false` — coluna confirmada em `0034_contas_a_pagar_schema.sql:38` e já usada por `0035_pagar_rpcs.sql`. O saldo por título espelha `valor - Σ baixa.valor_recebido` das baixas não estornadas.
