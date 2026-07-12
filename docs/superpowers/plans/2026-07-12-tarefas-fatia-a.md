# Tarefas — Fatia A — Plano

> REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Tarefas internas (responsável, prazo, prioridade, status, checklist) com painel global (lista+kanban), filtros, seção na ficha e menu.

## Global Constraints
- Migration idempotente; `db:migrate`. RBAC via `auth_papel()`. Antes de commit: `lint && typecheck && test` (+ `db:test` em RLS).

---

### Task 1: Migration 0083 — tarefa + tarefa_item + RLS + trigger

**Files:** Create `supabase/migrations/0083_tarefas.sql`

- [ ] **Step 1: Migration** — enums `tarefa_status`/`tarefa_prioridade`, tabelas `tarefa`/`tarefa_item`, índices, RLS abaixo, trigger `tarefa_integridade` (`atualizado_em`; `concluida_em` ao virar concluida, limpa ao sair).

```sql
do $$ begin create type tarefa_status as enum ('aberta','em_andamento','concluida','cancelada'); exception when duplicate_object then null; end $$;
do $$ begin create type tarefa_prioridade as enum ('baixa','media','alta','urgente'); exception when duplicate_object then null; end $$;

create table if not exists tarefa (
  id uuid primary key default gen_random_uuid(),
  titulo text not null, descricao text,
  responsavel_id uuid references usuarios(id),
  cliente_id uuid references clientes(id) on delete set null,
  departamento departamento,
  prioridade tarefa_prioridade not null default 'media',
  prazo date,
  status tarefa_status not null default 'aberta',
  concluida_em timestamptz,
  criado_por uuid references usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_tarefa_responsavel on tarefa(responsavel_id);
create index if not exists idx_tarefa_cliente on tarefa(cliente_id);

create table if not exists tarefa_item (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references tarefa(id) on delete cascade,
  descricao text not null, feito boolean not null default false, ordem int not null default 0
);

alter table tarefa enable row level security;
alter table tarefa_item enable row level security;

drop policy if exists tarefa_sel on tarefa;
create policy tarefa_sel on tarefa for select to authenticated using (auth_papel() in ('admin','assistente','contador','financeiro'));
drop policy if exists tarefa_ins on tarefa;
create policy tarefa_ins on tarefa for insert to authenticated with check (auth_papel() in ('admin','assistente','contador','financeiro'));
drop policy if exists tarefa_upd on tarefa;
create policy tarefa_upd on tarefa for update to authenticated
  using (auth_papel() in ('admin','assistente') or responsavel_id = auth.uid() or criado_por = auth.uid())
  with check (auth_papel() in ('admin','assistente') or responsavel_id = auth.uid() or criado_por = auth.uid());
drop policy if exists tarefa_del on tarefa;
create policy tarefa_del on tarefa for delete to authenticated
  using (auth_papel() in ('admin','assistente') or responsavel_id = auth.uid() or criado_por = auth.uid());

drop policy if exists titem_sel on tarefa_item;
create policy titem_sel on tarefa_item for select to authenticated using (exists (select 1 from tarefa t where t.id = tarefa_id));
drop policy if exists titem_wr on tarefa_item;
create policy titem_wr on tarefa_item for all to authenticated
  using (exists (select 1 from tarefa t where t.id = tarefa_id and (auth_papel() in ('admin','assistente') or t.responsavel_id = auth.uid() or t.criado_por = auth.uid())))
  with check (exists (select 1 from tarefa t where t.id = tarefa_id and (auth_papel() in ('admin','assistente') or t.responsavel_id = auth.uid() or t.criado_por = auth.uid())));

create or replace function tarefa_integridade() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if new.status = 'concluida' and new.concluida_em is null then new.concluida_em := now(); end if;
  if new.status <> 'concluida' then new.concluida_em := null; end if;
  return new;
end $$;
drop trigger if exists trg_tarefa_integridade on tarefa;
create trigger trg_tarefa_integridade before insert or update on tarefa for each row execute function tarefa_integridade();
```

- [ ] **Step 2:** `npm run db:migrate`. **Step 3:** `npm run db:test 2>&1 | grep -icE "FALHA|error"` → `0`. **Step 4:** commit `feat: migration 0083 — tarefas (tarefa + checklist, RLS)`

---

### Task 2: Lib tarefa + permissão (TDD)

**Files:** Create `src/lib/tarefas/tarefa.ts`; Modify `src/lib/clientes/permissoes.ts`; Test `src/tests/tarefas/tarefa.test.ts`

- [ ] **Step 1: Testes**

```ts
import { describe, it, expect } from "vitest";
import { TAREFA_STATUS, TAREFA_PRIORIDADE, progressoChecklist, ordemPrioridade } from "@/lib/tarefas/tarefa";
import { podeGerenciarTarefas } from "@/lib/clientes/permissoes";

describe("tarefa", () => {
  it("status e prioridade rotulados", () => { expect(TAREFA_STATUS.length).toBe(4); expect(TAREFA_PRIORIDADE.length).toBe(4); });
  it("progressoChecklist", () => {
    expect(progressoChecklist([{ feito: true }, { feito: false }, { feito: true }])).toEqual({ total: 3, feitos: 2, pct: 67 });
    expect(progressoChecklist([])).toEqual({ total: 0, feitos: 0, pct: 0 });
  });
  it("ordemPrioridade urgente primeiro", () => { expect(ordemPrioridade("urgente")).toBeLessThan(ordemPrioridade("baixa")); });
  it("podeGerenciarTarefas: equipe sim, undefined não", () => { expect(podeGerenciarTarefas("financeiro")).toBe(true); expect(podeGerenciarTarefas(undefined)).toBe(false); });
});
```

- [ ] **Step 2:** `npm test -- tarefas/tarefa` → FAIL.
- [ ] **Step 3: Implementar** `tarefa.ts`:

```ts
export type TarefaStatus = "aberta" | "em_andamento" | "concluida" | "cancelada";
export type TarefaPrioridade = "baixa" | "media" | "alta" | "urgente";
export const TAREFA_STATUS: { valor: TarefaStatus; rotulo: string }[] = [
  { valor: "aberta", rotulo: "Aberta" }, { valor: "em_andamento", rotulo: "Em andamento" },
  { valor: "concluida", rotulo: "Concluída" }, { valor: "cancelada", rotulo: "Cancelada" },
];
export const TAREFA_PRIORIDADE: { valor: TarefaPrioridade; rotulo: string }[] = [
  { valor: "urgente", rotulo: "Urgente" }, { valor: "alta", rotulo: "Alta" },
  { valor: "media", rotulo: "Média" }, { valor: "baixa", rotulo: "Baixa" },
];
export function progressoChecklist(itens: { feito: boolean }[]): { total: number; feitos: number; pct: number } {
  const total = itens.length; const feitos = itens.filter((i) => i.feito).length;
  return { total, feitos, pct: total === 0 ? 0 : Math.round((feitos / total) * 100) };
}
const ORD: Record<TarefaPrioridade, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };
export function ordemPrioridade(p: TarefaPrioridade): number { return ORD[p]; }
```

E em `permissoes.ts`: `export function podeGerenciarTarefas(papel: Papel | undefined): boolean { return papel === "admin" || papel === "assistente" || papel === "contador" || papel === "financeiro"; }`

- [ ] **Step 4:** PASS + `typecheck && lint`. **Step 5:** commit `feat: lib de tarefas`

---

### Task 3: Ações (CRUD tarefa + checklist + listar)

**Files:** Create `src/app/(app)/tarefas/actions.ts`

- [ ] **Step 1:** gate `podeGerenciarTarefas`. `listarTarefas(filtros)` (junta nome de responsável via `listarColaboradores` e cliente via consulta; filtra por eq). `criarTarefa`, `salvarTarefa`, `definirStatusTarefa`, `excluirTarefa`; checklist `salvarItem`/`alternarItem`/`excluirItem`. `revalidatePath`.
- [ ] **Step 2:** `lint && typecheck`. **Step 3:** commit `feat: ações de tarefas (CRUD + checklist + listagem)`

---

### Task 4: Painel global (lista + kanban) + menu

**Files:** Create `src/app/(app)/tarefas/page.tsx`, `PainelTarefas.tsx`; Modify `src/components/Sidebar.tsx`

- [ ] **Step 1: page.tsx** — gate; `searchParams` (filtros + `vista=lista|kanban`); `listarTarefas`; colaboradores + clientes p/ filtros.
- [ ] **Step 2: PainelTarefas.tsx** — filtros (GET) + alternador Lista/Kanban + "Nova tarefa". Lista: tabela com selo de prazo (`classificarAlerta`), prioridade, status. Kanban: colunas Aberta/Em andamento/Concluída, cartões com botões de mover status.
- [ ] **Step 3: menu** — `{ href: "/tarefas", label: "Tarefas" }` no Sidebar (autenticados).
- [ ] **Step 4:** `lint && typecheck`. **Step 5:** commit `feat: painel de tarefas (lista + kanban) + menu`

---

### Task 5: Detalhe da tarefa (edição + checklist)

**Files:** Create `src/app/(app)/tarefas/[id]/page.tsx`, `EditorTarefa.tsx`

- [ ] **Step 1: page.tsx** — gate; carrega tarefa + itens + colaboradores + clientes; `notFound()` se invisível.
- [ ] **Step 2: EditorTarefa.tsx** — campos → `salvarTarefa`/`definirStatusTarefa`; checklist (adicionar/marcar/remover); excluir.
- [ ] **Step 3:** `lint && typecheck`. **Step 4:** commit `feat: detalhe/edição da tarefa com checklist`

---

### Task 6: Seção na ficha do cliente

**Files:** Create `src/components/tarefas/TarefasCliente.tsx`; Modify `src/app/(app)/clientes/[id]/page.tsx`

- [ ] **Step 1:** carregar `listarTarefas({ cliente: id })`; seção lista + "nova tarefa" (pré-vincula cliente).
- [ ] **Step 2:** `lint && typecheck && test`. **Step 3:** commit `feat: seção de tarefas na ficha do cliente`

---

### Task 7: RLS test + docs

**Files:** Modify `supabase/tests/rls.test.sql`, `docs/DOCUMENTACAO.md`

- [ ] **Step 1: Assert** — admin edita qualquer; contador edita a que criou e não a de outro; financeiro cria mas não edita alheia. (Fixtures: criar tarefa como contador …003; admin edita; outro contador/financeiro não.)
- [ ] **Step 2:** `db:test` → 0 falhas.
- [ ] **Step 3: docs** — subseção **Tarefas** (avulsas + checklist, painel lista+kanban, filtros, ficha; RF-040 núcleo + RF-042 parcial; fatias futuras: recorrência, anexos, calendário, SOPs).
- [ ] **Step 4:** commit `test+docs: RLS de tarefas e documentação`

---

## Self-Review
- Migration+RLS → T1/T7. Lib → T2. Ações → T3. Painel+menu → T4. Detalhe → T5. Ficha → T6. Docs → T7. ✔
- Reusa `departamento` (RF-025), `classificarAlerta` (prazo), padrões de RLS/UI.
- Kanban por botões (sem drag) nesta fatia; drag/calendário/recorrência/anexos/SOPs depois.
