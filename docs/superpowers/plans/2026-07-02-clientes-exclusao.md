# Exclusão (soft delete) e filtro de status de clientes — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o admin exclua clientes de forma reversível (soft delete) e restaure-os, e estender o filtro da lista para segmentar Ativos / Inativos / Excluídos, ocultando excluídos por padrão.

**Architecture:** Coluna nullable `clientes.excluido_em` marca exclusão (preserva histórico). Gate de admin via nova permissão `podeExcluirCliente` + server actions que releem o papel server-side. Filtro da lista centralizado num helper puro testável. UI de exclusão/restauração num client component na ficha.

**Tech Stack:** Next.js 16 (App Router, server actions), TypeScript, Tailwind 4, Supabase (Postgres/RLS), Vitest. Migrations via runner próprio `npm run db:migrate`.

## Global Constraints

- Migrations via `npm run db:migrate` (rastreia `app_migrations`); **nunca** `supabase db push`. Novas migrations idempotentes (`add column if not exists`, `create index if not exists`).
- Migrations já aplicadas são imutáveis — mudança = nova migration.
- Papel (RBAC) lido **só** de `usuarios.papel` via `getPerfilAtual()` / `auth_papel()`. Nunca do JWT/`app_metadata`.
- Imports pelo alias `@/*`. Convenção de middleware é `proxy.ts` (irrelevante aqui).
- Rodar antes de cada commit: `npm run lint && npm run typecheck && npm test`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Próxima migration livre: **0024**.

## File Structure

- **Create** `supabase/migrations/0024_clientes_exclusao.sql` — coluna `excluido_em` + índice.
- **Create** `src/lib/clientes/filtroStatus.ts` — helper puro do filtro de status.
- **Create** `src/tests/clientes/filtroStatus.test.ts` — teste do helper.
- **Create** `src/tests/clientes/permissoes.test.ts` — teste de `podeExcluirCliente`.
- **Create** `src/components/clientes/AcoesExclusaoCliente.tsx` — UI de excluir/restaurar.
- **Modify** `src/lib/clientes/permissoes.ts` — nova `podeExcluirCliente`.
- **Modify** `src/app/(app)/clientes/actions.ts` — `excluirCliente` / `restaurarCliente`.
- **Modify** `src/app/(app)/clientes/page.tsx` — filtro com 4 opções + coluna `excluido_em` + badge.
- **Modify** `src/app/(app)/clientes/[id]/page.tsx` — render do componente para admin + select com `excluido_em`.
- **Modify** `src/app/(app)/clientes/[id]/nfse.ts:214` — excluir excluídos do lote.

---

### Task 1: Migration — coluna `excluido_em`

**Files:**
- Create: `supabase/migrations/0024_clientes_exclusao.sql`

**Interfaces:**
- Produces: coluna `clientes.excluido_em timestamptz` (nullable, default null) + índice `idx_clientes_excluido_em`.

- [ ] **Step 1: Escrever a migration**

Arquivo `supabase/migrations/0024_clientes_exclusao.sql`:

```sql
-- Soft delete de clientes: excluido_em nulo = cliente normal; preenchido = excluído.
-- Coluna dedicada (não novo valor de enum) para não colidir com status ativo/inativo
-- e evitar o pitfall de ALTER TYPE ADD VALUE em transação.
alter table clientes add column if not exists excluido_em timestamptz;

-- Apoia o filtro padrão da lista (excluido_em is null).
create index if not exists idx_clientes_excluido_em on clientes (excluido_em);
```

- [ ] **Step 2: Aplicar a migration**

Run: `npm run db:migrate`
Expected: aplica `0024_clientes_exclusao` sem erro (registra em `app_migrations`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0024_clientes_exclusao.sql
git commit -m "feat(db): coluna excluido_em para soft delete de clientes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Permissão `podeExcluirCliente`

**Files:**
- Modify: `src/lib/clientes/permissoes.ts`
- Create: `src/tests/clientes/permissoes.test.ts`

**Interfaces:**
- Consumes: `Papel` de `@/lib/tipos`; funções existentes em `permissoes.ts`.
- Produces: `podeExcluirCliente(papel: Papel | undefined): boolean` — true só para `"admin"`.

- [ ] **Step 1: Escrever o teste que falha**

Arquivo `src/tests/clientes/permissoes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { podeExcluirCliente } from "@/lib/clientes/permissoes";

describe("podeExcluirCliente", () => {
  it("permite apenas admin", () => {
    expect(podeExcluirCliente("admin")).toBe(true);
  });
  it("nega os demais papéis e undefined", () => {
    expect(podeExcluirCliente("financeiro")).toBe(false);
    expect(podeExcluirCliente("assistente")).toBe(false);
    expect(podeExcluirCliente("contador")).toBe(false);
    expect(podeExcluirCliente(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- src/tests/clientes/permissoes.test.ts`
Expected: FAIL — `podeExcluirCliente` não existe / não é exportado.

- [ ] **Step 3: Implementar a função**

Ao final de `src/lib/clientes/permissoes.ts`, acrescentar:

```ts
// Quem exclui/restaura cliente (soft delete): apenas admin. A RLS de UPDATE de
// clientes é ampla (admin/assistente/contador-dono), então esta checagem no
// servidor é a trava efetiva — mesmo padrão dos gates de honorário/documentos.
export function podeExcluirCliente(papel: Papel | undefined): boolean {
  return papel === "admin";
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- src/tests/clientes/permissoes.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/clientes/permissoes.ts src/tests/clientes/permissoes.test.ts
git commit -m "feat: permissao podeExcluirCliente (admin)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Helper de filtro de status

**Files:**
- Create: `src/lib/clientes/filtroStatus.ts`
- Create: `src/tests/clientes/filtroStatus.test.ts`

**Interfaces:**
- Produces:
  - `type FiltroStatus = "" | "ativo" | "inativo" | "excluido"`
  - `normalizarFiltro(v: string | undefined): FiltroStatus`
  - `aplicarFiltroStatus<T>(query: T, filtro: FiltroStatus): T` onde `T` expõe `.eq`, `.is`, `.not` (contrato do PostgrestFilterBuilder). Predicados: `""`/`ativo`/`inativo` → `.is("excluido_em", null)` (com `.eq("status", filtro)` nos dois últimos); `excluido` → `.not("excluido_em", "is", null)`.

- [ ] **Step 1: Escrever o teste que falha**

Arquivo `src/tests/clientes/filtroStatus.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizarFiltro, aplicarFiltroStatus } from "@/lib/clientes/filtroStatus";

// Duble do PostgrestFilterBuilder: registra as chamadas e devolve a si mesmo.
function fakeBuilder() {
  const calls: unknown[][] = [];
  const b = {
    calls,
    eq(...a: unknown[]) { calls.push(["eq", ...a]); return b; },
    is(...a: unknown[]) { calls.push(["is", ...a]); return b; },
    not(...a: unknown[]) { calls.push(["not", ...a]); return b; },
  };
  return b;
}

describe("normalizarFiltro", () => {
  it("aceita os valores válidos", () => {
    expect(normalizarFiltro("ativo")).toBe("ativo");
    expect(normalizarFiltro("inativo")).toBe("inativo");
    expect(normalizarFiltro("excluido")).toBe("excluido");
    expect(normalizarFiltro("")).toBe("");
  });
  it("mapeia inválido/ausente para ''", () => {
    expect(normalizarFiltro("qualquer")).toBe("");
    expect(normalizarFiltro(undefined)).toBe("");
  });
});

describe("aplicarFiltroStatus", () => {
  it("'' esconde excluídos", () => {
    const b = fakeBuilder();
    aplicarFiltroStatus(b, "");
    expect(b.calls).toEqual([["is", "excluido_em", null]]);
  });
  it("'ativo' filtra status e esconde excluídos", () => {
    const b = fakeBuilder();
    aplicarFiltroStatus(b, "ativo");
    expect(b.calls).toEqual([["eq", "status", "ativo"], ["is", "excluido_em", null]]);
  });
  it("'inativo' filtra status e esconde excluídos", () => {
    const b = fakeBuilder();
    aplicarFiltroStatus(b, "inativo");
    expect(b.calls).toEqual([["eq", "status", "inativo"], ["is", "excluido_em", null]]);
  });
  it("'excluido' traz só os excluídos", () => {
    const b = fakeBuilder();
    aplicarFiltroStatus(b, "excluido");
    expect(b.calls).toEqual([["not", "excluido_em", "is", null]]);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- src/tests/clientes/filtroStatus.test.ts`
Expected: FAIL — módulo `filtroStatus` não existe.

- [ ] **Step 3: Implementar o helper**

Arquivo `src/lib/clientes/filtroStatus.ts`:

```ts
// Filtro de status/exclusão da lista de clientes. Puro e testável: concentra a
// montagem do predicado para o teste cobrir sem tocar no Supabase.

export type FiltroStatus = "" | "ativo" | "inativo" | "excluido";

const VALIDOS: readonly FiltroStatus[] = ["", "ativo", "inativo", "excluido"];

// Normaliza a query string: qualquer valor fora do conjunto vira "" (default).
export function normalizarFiltro(v: string | undefined): FiltroStatus {
  return VALIDOS.includes(v as FiltroStatus) ? (v as FiltroStatus) : "";
}

// Contrato mínimo do PostgrestFilterBuilder usado aqui.
type Builder<T> = T & {
  eq(col: string, val: unknown): Builder<T>;
  is(col: string, val: unknown): Builder<T>;
  not(col: string, op: string, val: unknown): Builder<T>;
};

// Aplica o predicado ao builder e o devolve. Excluídos ficam escondidos, exceto
// no filtro "excluido".
export function aplicarFiltroStatus<T>(query: Builder<T>, filtro: FiltroStatus): Builder<T> {
  if (filtro === "excluido") return query.not("excluido_em", "is", null);
  if (filtro === "ativo" || filtro === "inativo") {
    return query.eq("status", filtro).is("excluido_em", null);
  }
  return query.is("excluido_em", null);
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- src/tests/clientes/filtroStatus.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/clientes/filtroStatus.ts src/tests/clientes/filtroStatus.test.ts
git commit -m "feat: helper de filtro de status/exclusao de clientes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Server actions `excluirCliente` / `restaurarCliente`

**Files:**
- Modify: `src/app/(app)/clientes/actions.ts`

**Interfaces:**
- Consumes: `podeExcluirCliente` (Task 2); `getPerfilAtual` de `@/lib/auth/perfil`; `createServerSupabase`; `revalidatePath`.
- Produces:
  - `excluirCliente(clienteId: string): Promise<{ erro?: string }>`
  - `restaurarCliente(clienteId: string): Promise<{ erro?: string }>`
  - Sucesso → `{}`; falha → `{ erro: string }`.

- [ ] **Step 1: Adicionar imports**

Em `src/app/(app)/clientes/actions.ts`, juntar aos imports do topo:

```ts
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeExcluirCliente } from "@/lib/clientes/permissoes";
```

(`redirect`, `revalidatePath`, `createServerSupabase` já estão importados.)

- [ ] **Step 2: Implementar as actions**

Ao final de `src/app/(app)/clientes/actions.ts`, acrescentar:

```ts
// Soft delete: só admin (a RLS de UPDATE é ampla; a trava é aqui, server-side).
export async function excluirCliente(clienteId: string): Promise<{ erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!podeExcluirCliente(perfil?.papel)) return { erro: "Sem permissão." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("clientes")
    .update({ excluido_em: new Date().toISOString() })
    .eq("id", clienteId)
    .is("excluido_em", null) // não sobrescreve o carimbo de uma exclusão anterior
    .select("id");
  if (error) {
    console.error("excluirCliente:", error.code, error.message);
    return { erro: "Não foi possível excluir o cliente." };
  }
  if (!data || data.length === 0) return { erro: "Cliente não encontrado ou já excluído." };

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clienteId}`);
  return {};
}

export async function restaurarCliente(clienteId: string): Promise<{ erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!podeExcluirCliente(perfil?.papel)) return { erro: "Sem permissão." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("clientes")
    .update({ excluido_em: null })
    .eq("id", clienteId)
    .select("id");
  if (error) {
    console.error("restaurarCliente:", error.code, error.message);
    return { erro: "Não foi possível restaurar o cliente." };
  }
  if (!data || data.length === 0) return { erro: "Cliente não encontrado." };

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clienteId}`);
  return {};
}
```

- [ ] **Step 3: Verificar lint/typecheck**

Run: `npm run lint && npm run typecheck`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/clientes/actions.ts
git commit -m "feat: server actions excluirCliente/restaurarCliente (admin)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: UI de excluir/restaurar na ficha

**Files:**
- Create: `src/components/clientes/AcoesExclusaoCliente.tsx`
- Modify: `src/app/(app)/clientes/[id]/page.tsx`

**Interfaces:**
- Consumes: `excluirCliente` / `restaurarCliente` (Task 4); `podeExcluirCliente` (Task 2); `formatarData` de `@/lib/format`.
- Produces: `<AcoesExclusaoCliente clienteId={string} excluidoEm={string | null} />`.

- [ ] **Step 1: Criar o client component**

Arquivo `src/components/clientes/AcoesExclusaoCliente.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { excluirCliente, restaurarCliente } from "@/app/(app)/clientes/actions";
import { formatarData } from "@/lib/format";

export function AcoesExclusaoCliente({
  clienteId,
  excluidoEm,
}: {
  clienteId: string;
  excluidoEm: string | null;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();

  // Cliente excluído: faixa de aviso + Restaurar.
  if (excluidoEm) {
    return (
      <div className="flex items-center justify-between gap-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
        <span className="text-amber-900">Cliente excluído em {formatarData(excluidoEm)}.</span>
        <div className="flex flex-col items-end gap-1">
          <button
            disabled={pend}
            onClick={() =>
              start(async () => {
                setErro(null);
                const r = await restaurarCliente(clienteId);
                if (r.erro) setErro(r.erro);
                else router.refresh();
              })
            }
            className="rounded border border-amber-400 px-3 py-1 text-amber-900 disabled:opacity-60"
          >
            {pend ? "Restaurando…" : "Restaurar"}
          </button>
          {erro && <p role="alert" className="text-xs text-red-600">{erro}</p>}
        </div>
      </div>
    );
  }

  // Cliente ativo: botão Excluir com confirmação inline (sem window.confirm).
  return (
    <div className="rounded border border-slate-200 p-3 text-sm">
      {!confirmando ? (
        <button
          onClick={() => setConfirmando(true)}
          className="rounded border border-red-300 px-3 py-1 text-red-700"
        >
          Excluir cliente
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-slate-700">
            Excluir este cliente? O histórico é preservado e um administrador pode restaurá-lo.
          </p>
          <div className="flex gap-2">
            <button
              disabled={pend}
              onClick={() =>
                start(async () => {
                  setErro(null);
                  const r = await excluirCliente(clienteId);
                  if (r.erro) setErro(r.erro);
                  else router.refresh();
                })
              }
              className="rounded bg-red-700 px-3 py-1 text-white disabled:opacity-60"
            >
              {pend ? "Excluindo…" : "Confirmar exclusão"}
            </button>
            <button onClick={() => setConfirmando(false)} className="rounded border px-3 py-1">
              Voltar
            </button>
          </div>
          {erro && <p role="alert" className="text-xs text-red-600">{erro}</p>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Ligar na ficha — select + render**

Em `src/app/(app)/clientes/[id]/page.tsx`:

1. Adicionar o import (junto aos demais componentes):

```tsx
import { AcoesExclusaoCliente } from "@/components/clientes/AcoesExclusaoCliente";
import { podeExcluirCliente } from "@/lib/clientes/permissoes";
```

2. Acrescentar `excluido_em` ao `.select(...)` da query do cliente (a string longa que começa em `"id, tipo_pessoa, ...`): incluir `, excluido_em` antes de `atualizado_em`.

3. Renderizar o componente logo abaixo do `<h1>` (antes do `<FormCliente>`), só para quem pode excluir:

```tsx
{podeExcluirCliente(papel) && (
  <AcoesExclusaoCliente
    clienteId={id}
    excluidoEm={(cliente as { excluido_em: string | null }).excluido_em}
  />
)}
```

- [ ] **Step 3: Verificar lint/typecheck**

Run: `npm run lint && npm run typecheck`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/clientes/AcoesExclusaoCliente.tsx src/app/\(app\)/clientes/\[id\]/page.tsx
git commit -m "feat: UI de excluir/restaurar cliente na ficha (admin)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Filtro da lista (4 opções) + badge de excluído

**Files:**
- Modify: `src/app/(app)/clientes/page.tsx`

**Interfaces:**
- Consumes: `normalizarFiltro`, `aplicarFiltroStatus` (Task 3).

- [ ] **Step 1: Trocar o filtro na query**

Em `src/app/(app)/clientes/page.tsx`:

1. Adicionar import:

```tsx
import { normalizarFiltro, aplicarFiltroStatus } from "@/lib/clientes/filtroStatus";
```

2. Incluir `excluido_em` no `.select(...)`:

```tsx
.select("id, razao_social, cpf_cnpj, tipo_pessoa, regime_tributario, status, excluido_em")
```

3. Substituir o bloco atual de filtro de status:

```tsx
  if (status === "ativo" || status === "inativo") {
    query = query.eq("status", status);
  }
```

por:

```tsx
  const filtro = normalizarFiltro(status);
  query = aplicarFiltroStatus(query, filtro);
```

- [ ] **Step 2: Atualizar as opções do select**

Substituir as `<option>` atuais do `<select name="status">` por:

```tsx
          <option value="">Ativos e inativos</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
          <option value="excluido">Excluídos</option>
```

- [ ] **Step 3: Badge de excluído na coluna Status**

Na célula de Status da linha (`<td className="p-2">` com o `<span>` de status), acrescentar após o `<span>` existente:

```tsx
                      {cl.excluido_em && (
                        <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700">
                          excluído
                        </span>
                      )}
```

- [ ] **Step 4: Verificar lint/typecheck/testes**

Run: `npm run lint && npm run typecheck && npm test`
Expected: sem erros; todos os testes passam.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/clientes/page.tsx
git commit -m "feat: filtro de clientes com Ativos/Inativos/Excluidos

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Ocultar excluídos do lote de NFS-e

**Files:**
- Modify: `src/app/(app)/clientes/[id]/nfse.ts:214`

**Interfaces:**
- Nenhuma nova. Ajuste na query de elegíveis do lote.

- [ ] **Step 1: Adicionar o predicado**

Em `src/app/(app)/clientes/[id]/nfse.ts`, na query de `listarElegiveisLote` (por volta da linha 211-215), acrescentar `.is("excluido_em", null)` após `.eq("status", "ativo")`:

```ts
  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, razao_social, cpf_cnpj, endereco, status, clientes_financeiro(honorario_mensal)")
    .eq("status", "ativo")
    .is("excluido_em", null) // clientes excluídos não entram no lote
    .order("razao_social");
```

- [ ] **Step 2: Verificar lint/typecheck**

Run: `npm run lint && npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/clientes/\[id\]/nfse.ts
git commit -m "feat: excluir clientes soft-deleted do lote de NFS-e

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verificação final

Após todas as tasks:

- [ ] `npm run lint && npm run typecheck && npm test` — tudo verde.
- [ ] `npm run build` — build passa.
- [ ] Validação manual (admin): excluir um cliente de teste → some da lista padrão → aparece em "Excluídos" com badge → restaurar → volta ao normal. Conferir que não-admin não vê os botões.
