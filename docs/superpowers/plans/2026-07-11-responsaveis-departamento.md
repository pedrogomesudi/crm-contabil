# Responsáveis por departamento (RF-025) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Designar responsável interno por departamento (Contábil, Fiscal, Pessoal, Societário) por cliente e redistribuir a carteira por seleção manual.

**Architecture:** Nova tabela `cliente_responsavel` (camada adicional; a RLS de `clientes` via `contador_id` fica intacta). Seção na ficha do cliente para atribuição individual; página `/clientes/responsaveis` (admin/assistente) para redistribuição em massa. Listas de colaboradores via `service_role` (a RLS de `usuarios` só deixa ler a própria linha).

**Tech Stack:** Next.js 16 (App Router, server components/actions), TypeScript, Supabase (Postgres/RLS), Vitest.

## Global Constraints

- Next 16: `proxy.ts`; `next/image`; alias `@/*` → `./src/*`.
- RBAC: papel só de `usuarios.papel` via `auth_papel()`. Nunca do JWT.
- Migrations: aplicadas por `npm run db:migrate`; imutáveis após aplicadas; idempotentes (`create type` com guarda, `create table if not exists`, `drop policy if exists; create policy`).
- Segredos server-only; listas de `usuarios` via `service_role` (`createAdminSupabase`, server-only).
- `clientes.contador_id` e as policies existentes de `clientes` permanecem **inalterados**.
- Antes de cada commit: `npm run lint && npm run typecheck && npm test` (e `npm run db:test` quando mexer em RLS).

---

### Task 1: Migration — enum, tabela, RLS e trigger

**Files:**
- Create: `supabase/migrations/0078_cliente_responsavel.sql`

**Interfaces:**
- Produces: tipo `departamento`; tabela `cliente_responsavel(cliente_id, departamento, usuario_id, atualizado_em, atualizado_por)` com PK `(cliente_id, departamento)`.

- [ ] **Step 1: Escrever a migration**

Arquivo `supabase/migrations/0078_cliente_responsavel.sql`:

```sql
-- RF-025: responsáveis internos por departamento, por cliente (camada nova; RLS de clientes intacta).
do $$ begin create type departamento as enum ('contabil','fiscal','pessoal','societario');
exception when duplicate_object then null; end $$;

create table if not exists cliente_responsavel (
  cliente_id uuid not null references clientes(id) on delete cascade,
  departamento departamento not null,
  usuario_id uuid not null references usuarios(id),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id) default auth.uid(),
  primary key (cliente_id, departamento)
);

alter table cliente_responsavel enable row level security;

drop policy if exists cliente_responsavel_sel on cliente_responsavel;
create policy cliente_responsavel_sel on cliente_responsavel for select to authenticated
  using (auth_papel() in ('admin','assistente','contador','financeiro'));

-- escrita: admin/assistente sempre; contador só nos clientes dele
drop policy if exists cliente_responsavel_ins on cliente_responsavel;
create policy cliente_responsavel_ins on cliente_responsavel for insert to authenticated
  with check (
    auth_papel() in ('admin','assistente')
    or (auth_papel() = 'contador' and exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid()))
  );

drop policy if exists cliente_responsavel_upd on cliente_responsavel;
create policy cliente_responsavel_upd on cliente_responsavel for update to authenticated
  using (
    auth_papel() in ('admin','assistente')
    or (auth_papel() = 'contador' and exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid()))
  )
  with check (
    auth_papel() in ('admin','assistente')
    or (auth_papel() = 'contador' and exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid()))
  );

drop policy if exists cliente_responsavel_del on cliente_responsavel;
create policy cliente_responsavel_del on cliente_responsavel for delete to authenticated
  using (
    auth_papel() in ('admin','assistente')
    or (auth_papel() = 'contador' and exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid()))
  );

create or replace function cliente_responsavel_integridade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_por := auth.uid();
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists trg_cliente_responsavel_integridade on cliente_responsavel;
create trigger trg_cliente_responsavel_integridade before insert or update on cliente_responsavel
  for each row execute function cliente_responsavel_integridade();
```

- [ ] **Step 2: Aplicar**

Run: `npm run db:migrate`
Expected: aplica `0078_cliente_responsavel.sql` sem erro.

- [ ] **Step 3: Conferir**

Run: `npm run db:test 2>&1 | grep -icE "FALHA|error"`
Expected: `0` (a suíte segue verde).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0078_cliente_responsavel.sql
git commit -m "feat: migration 0078 — cliente_responsavel (RF-025)"
```

---

### Task 2: Biblioteca — departamentos, colaboradores, permissão (TDD)

**Files:**
- Create: `src/lib/clientes/departamentos.ts`
- Create: `src/lib/clientes/colaboradores.ts`
- Modify: `src/lib/clientes/permissoes.ts`
- Test: `src/tests/clientes/responsaveis.test.ts`

**Interfaces:**
- Produces:
  - `type Departamento = "contabil" | "fiscal" | "pessoal" | "societario"`
  - `DEPARTAMENTOS: { valor: Departamento; rotulo: string }[]`
  - `listarColaboradores(): Promise<{ id: string; nome: string }[]>` (server-only)
  - `ehColaboradorValido(id: string): Promise<boolean>` (server-only)
  - `podeGerenciarResponsaveis(papel: Papel | undefined): boolean`

- [ ] **Step 1: Escrever os testes (falhando)**

Arquivo `src/tests/clientes/responsaveis.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DEPARTAMENTOS } from "@/lib/clientes/departamentos";
import { podeGerenciarResponsaveis } from "@/lib/clientes/permissoes";

describe("DEPARTAMENTOS", () => {
  it("cobre os quatro departamentos do enum", () => {
    expect(DEPARTAMENTOS.map((d) => d.valor)).toEqual(["contabil", "fiscal", "pessoal", "societario"]);
    expect(DEPARTAMENTOS.every((d) => d.rotulo.length > 0)).toBe(true);
  });
});

describe("podeGerenciarResponsaveis", () => {
  it("admin e assistente podem", () => {
    expect(podeGerenciarResponsaveis("admin")).toBe(true);
    expect(podeGerenciarResponsaveis("assistente")).toBe(true);
  });
  it("contador e financeiro não (gerência/redistribuição em massa)", () => {
    expect(podeGerenciarResponsaveis("contador")).toBe(false);
    expect(podeGerenciarResponsaveis("financeiro")).toBe(false);
    expect(podeGerenciarResponsaveis(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- responsaveis`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Implementar `departamentos.ts`**

```ts
export type Departamento = "contabil" | "fiscal" | "pessoal" | "societario";

export const DEPARTAMENTOS: { valor: Departamento; rotulo: string }[] = [
  { valor: "contabil", rotulo: "Contábil" },
  { valor: "fiscal", rotulo: "Fiscal" },
  { valor: "pessoal", rotulo: "Pessoal (Folha)" },
  { valor: "societario", rotulo: "Societário/Legalização" },
];
```

- [ ] **Step 4: Implementar `colaboradores.ts`** (segue o padrão de `contadores.ts`)

```ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

// Colaboradores que podem ser responsáveis por departamento: equipe operacional
// ativa (admin/contador/assistente). A RLS de `usuarios` não permite listar, daí
// service_role (server-only), expondo apenas id e nome.
export async function listarColaboradores(): Promise<{ id: string; nome: string }[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("usuarios")
    .select("id, nome")
    .in("papel", ["admin", "contador", "assistente"])
    .eq("ativo", true)
    .order("nome");
  if (error) {
    console.error("Falha ao listar colaboradores:", error.message);
    return [];
  }
  return data ?? [];
}

export async function ehColaboradorValido(id: string): Promise<boolean> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("usuarios")
    .select("id")
    .eq("id", id)
    .in("papel", ["admin", "contador", "assistente"])
    .eq("ativo", true)
    .maybeSingle();
  return !!data;
}
```

- [ ] **Step 5: Adicionar `podeGerenciarResponsaveis` em `permissoes.ts`**

```ts
// Quem gerencia responsáveis por departamento e a redistribuição em massa.
export function podeGerenciarResponsaveis(papel: Papel | undefined): boolean {
  return papel === "admin" || papel === "assistente";
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test -- responsaveis`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/clientes/departamentos.ts src/lib/clientes/colaboradores.ts src/lib/clientes/permissoes.ts src/tests/clientes/responsaveis.test.ts
git commit -m "feat: libs de departamentos, colaboradores e permissão (RF-025)"
```

---

### Task 3: Ficha do cliente — atribuição individual

**Files:**
- Create: `src/app/(app)/clientes/[id]/responsaveis-actions.ts`
- Create: `src/components/clientes/ResponsaveisDepartamento.tsx`
- Modify: `src/app/(app)/clientes/[id]/page.tsx`

**Interfaces:**
- Consumes: `DEPARTAMENTOS`, `listarColaboradores`, `ehColaboradorValido`, `getPerfilAtual`, `createServerSupabase`.
- Produces: `definirResponsavel(clienteId: string, departamento: Departamento, usuarioId: string | null): Promise<{ ok?: boolean; erro?: string }>`

- [ ] **Step 1: Escrever a action**

Arquivo `src/app/(app)/clientes/[id]/responsaveis-actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { ehColaboradorValido } from "@/lib/clientes/colaboradores";
import { podeGerenciarResponsaveis } from "@/lib/clientes/permissoes";
import type { Departamento } from "@/lib/clientes/departamentos";

const DEPTOS = new Set<Departamento>(["contabil", "fiscal", "pessoal", "societario"]);

export async function definirResponsavel(clienteId: string, departamento: Departamento, usuarioId: string | null): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo) return { erro: "Sem permissão." };
  if (!DEPTOS.has(departamento)) return { erro: "Departamento inválido." };

  // admin/assistente sempre; contador só no cliente dele (a RLS reforça).
  const supabase = await createServerSupabase();
  let autorizado = podeGerenciarResponsaveis(perfil.papel);
  if (!autorizado && perfil.papel === "contador") {
    const { data: c } = await supabase.from("clientes").select("id").eq("id", clienteId).maybeSingle();
    autorizado = Boolean(c); // a RLS de clientes já limita o contador aos seus
  }
  if (!autorizado) return { erro: "Sem permissão." };

  if (usuarioId === null) {
    const { error } = await supabase.from("cliente_responsavel").delete().eq("cliente_id", clienteId).eq("departamento", departamento);
    if (error) return { erro: "Falha ao remover responsável." };
  } else {
    if (!(await ehColaboradorValido(usuarioId))) return { erro: "Colaborador inválido." };
    const { error } = await supabase.from("cliente_responsavel").upsert(
      { cliente_id: clienteId, departamento, usuario_id: usuarioId },
      { onConflict: "cliente_id,departamento" },
    );
    if (error) return { erro: "Falha ao salvar responsável." };
  }
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
```

- [ ] **Step 2: Escrever o componente `ResponsaveisDepartamento.tsx`**

Client component. Props: `clienteId: string`, `colaboradores: {id,nome}[]`, `atuais: Record<Departamento, string | null>` (usuario_id por depto), `editavel: boolean`. Renderiza uma seção com uma linha por `DEPARTAMENTOS`: rótulo + `<select>` (opção "— sem responsável" com value "" e cada colaborador). `onChange` chama `definirResponsavel(clienteId, depto, value || null)`, com estado `ocupado` e `router.refresh()`. Se `!editavel`, mostra o nome do responsável atual como texto (sem select).

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { definirResponsavel } from "@/app/(app)/clientes/[id]/responsaveis-actions";
import { DEPARTAMENTOS, type Departamento } from "@/lib/clientes/departamentos";

export function ResponsaveisDepartamento({ clienteId, colaboradores, atuais, editavel }: {
  clienteId: string;
  colaboradores: { id: string; nome: string }[];
  atuais: Record<Departamento, string | null>;
  editavel: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const nome = (id: string | null) => colaboradores.find((c) => c.id === id)?.nome ?? "—";

  async function mudar(depto: Departamento, value: string) {
    setOcupado(true);
    const r = await definirResponsavel(clienteId, depto, value || null);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-linha bg-white p-4">
      <h2 className="font-display text-sm font-semibold text-texto">Responsáveis por departamento</h2>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {DEPARTAMENTOS.map((d) => (
          <label key={d.valor} className="text-xs text-cinza">
            {d.rotulo}
            {editavel ? (
              <select
                disabled={ocupado}
                defaultValue={atuais[d.valor] ?? ""}
                onChange={(e) => mudar(d.valor, e.target.value)}
                className="mt-0.5 block w-full rounded-lg border border-linha px-2 py-1.5 text-sm text-texto"
              >
                <option value="">— sem responsável</option>
                {colaboradores.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            ) : (
              <p className="mt-0.5 text-sm text-texto">{nome(atuais[d.valor])}</p>
            )}
          </label>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Carregar e renderizar na ficha (`page.tsx`)**

Após carregar `cliente` e `papel`, adicionar:

```ts
import { ResponsaveisDepartamento } from "@/components/clientes/ResponsaveisDepartamento";
import { listarColaboradores } from "@/lib/clientes/colaboradores";
import { podeGerenciarResponsaveis } from "@/lib/clientes/permissoes";
import { DEPARTAMENTOS, type Departamento } from "@/lib/clientes/departamentos";
// ...
const respEditavel = podeGerenciarResponsaveis(papel) || (papel === "contador" && cliente.contador_id === perfil.id);
const { data: respRows } = await supabase.from("cliente_responsavel").select("departamento, usuario_id").eq("cliente_id", id);
const atuaisResp = Object.fromEntries(DEPARTAMENTOS.map((d) => [d.valor, null])) as Record<Departamento, string | null>;
for (const r of respRows ?? []) atuaisResp[r.departamento as Departamento] = (r.usuario_id as string) ?? null;
const colaboradores = respEditavel ? await listarColaboradores() : [];
```

E renderizar a seção (por ex. logo após `VencimentosSection`), visível para quem pode ver o cadastro (a lista já respeita a RLS):

```tsx
{podeCriarCliente(papel) && (
  <ResponsaveisDepartamento clienteId={id} colaboradores={colaboradores} atuais={atuaisResp} editavel={respEditavel} />
)}
```

Nota: quando `!respEditavel`, `colaboradores` fica vazio, então o modo texto resolve o nome a partir de... (para exibir o nome no modo read-only, carregar sempre a lista mínima). Para simplificar e sempre mostrar o nome: **carregar `colaboradores` sempre** (não só quando editável). Ajustar a linha para `const colaboradores = await listarColaboradores();`.

- [ ] **Step 4: Verificar**

Run: `npm run lint && npm run typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/clientes/[id]/responsaveis-actions.ts" src/components/clientes/ResponsaveisDepartamento.tsx "src/app/(app)/clientes/[id]/page.tsx"
git commit -m "feat: responsáveis por departamento na ficha do cliente"
```

---

### Task 4: Redistribuição de carteira (seleção manual)

**Files:**
- Create: `src/app/(app)/clientes/responsaveis/page.tsx`
- Create: `src/app/(app)/clientes/responsaveis/RedistribuicaoCarteira.tsx`
- Create: `src/app/(app)/clientes/responsaveis/actions.ts`
- Modify: `src/app/(app)/clientes/page.tsx` (link de acesso)

**Interfaces:**
- Consumes: `listarColaboradores`, `ehColaboradorValido`, `podeGerenciarResponsaveis`, `DEPARTAMENTOS`.
- Produces: `atribuirEmMassa(clienteIds: string[], departamento: Departamento, usuarioId: string | null): Promise<{ ok?: boolean; erro?: string; n?: number }>`

- [ ] **Step 1: Escrever a action**

Arquivo `src/app/(app)/clientes/responsaveis/actions.ts`:

```ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { ehColaboradorValido } from "@/lib/clientes/colaboradores";
import { podeGerenciarResponsaveis } from "@/lib/clientes/permissoes";
import type { Departamento } from "@/lib/clientes/departamentos";

const DEPTOS = new Set<Departamento>(["contabil", "fiscal", "pessoal", "societario"]);

export async function atribuirEmMassa(clienteIds: string[], departamento: Departamento, usuarioId: string | null): Promise<{ ok?: boolean; erro?: string; n?: number }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeGerenciarResponsaveis(perfil.papel)) return { erro: "Sem permissão." };
  if (!DEPTOS.has(departamento)) return { erro: "Departamento inválido." };
  const ids = [...new Set(clienteIds)].filter(Boolean);
  if (ids.length === 0) return { erro: "Selecione ao menos um cliente." };

  const supabase = await createServerSupabase();
  if (usuarioId === null) {
    const { error } = await supabase.from("cliente_responsavel").delete().in("cliente_id", ids).eq("departamento", departamento);
    if (error) return { erro: "Falha ao remover." };
  } else {
    if (!(await ehColaboradorValido(usuarioId))) return { erro: "Colaborador inválido." };
    const linhas = ids.map((cliente_id) => ({ cliente_id, departamento, usuario_id: usuarioId }));
    const { error } = await supabase.from("cliente_responsavel").upsert(linhas, { onConflict: "cliente_id,departamento" });
    if (error) return { erro: "Falha ao atribuir." };
  }
  return { ok: true, n: ids.length };
}
```

- [ ] **Step 2: Escrever a página (server)**

Arquivo `src/app/(app)/clientes/responsaveis/page.tsx`:
- Gate: `if (!perfil || !podeGerenciarResponsaveis(perfil.papel)) redirect("/clientes")`.
- Lê `searchParams`: `depto` (default `contabil`), `resp` (usuario_id atual, ou `"nenhum"`), `q` (busca).
- Carrega `colaboradores` via `listarColaboradores()`.
- Consulta clientes (não excluídos) com `id, razao_social, cpf_cnpj` (aplicar `q` com `ilike` + `escapeLike`, limite 200) e os responsáveis do departamento escolhido (`cliente_responsavel` where departamento=depto). Monta `respPorCliente: Map<clienteId, usuario_id>`. Aplica o filtro `resp` (um colaborador específico ou "sem responsável") em memória.
- Renderiza `PageHeader` + `RedistribuicaoCarteira` com a lista, colaboradores, depto e filtros.

- [ ] **Step 3: Escrever o componente (client)**

Arquivo `RedistribuicaoCarteira.tsx`:
- Barra de filtros (form GET): `<select name="depto">` (DEPARTAMENTOS), `<select name="resp">` ("Qualquer", "Sem responsável", cada colaborador), `<input name="q">`, botão "Filtrar".
- Tabela de clientes: checkbox por linha (`Set<string>` selecionados), razão social, CPF/CNPJ, responsável atual (nome). Checkbox "marcar todos".
- Rodapé: `<select>` departamento-alvo (default = filtro `depto`), `<select>` destino ("— remover" + colaboradores), botão "Aplicar aos selecionados" → chama `atribuirEmMassa(selecionados, deptoAlvo, destino || null)`; ao ok, `router.refresh()` e limpa a seleção, com aviso `n` atualizados.

- [ ] **Step 4: Link de acesso na página de Clientes**

Em `src/app/(app)/clientes/page.tsx`, dentro de `acoes` do `PageHeader`, antes do "Novo cliente":

```tsx
{podeGerenciarResponsaveis(perfil?.papel) && (
  <Link href="/clientes/responsaveis">
    <Botao variante="secundario">Responsáveis por departamento</Botao>
  </Link>
)}
```

Import de `podeGerenciarResponsaveis` em `permissoes` (já importado o módulo; adicionar o nome).

- [ ] **Step 5: Verificar**

Run: `npm run lint && npm run typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/clientes/responsaveis/" "src/app/(app)/clientes/page.tsx"
git commit -m "feat: redistribuição de carteira por seleção manual (RF-025)"
```

---

### Task 5: Testes de RLS + documentação

**Files:**
- Modify: `supabase/tests/rls.test.sql`
- Modify: `docs/DOCUMENTACAO.md`

**Interfaces:**
- Consumes: fixtures existentes (admin …001, assistente …002, contador …003, financeiro …004; clientes `aaaaaaaa-…001` do contador, `aaaaaaaa-…002` do admin).

- [ ] **Step 1: Assert de RLS**

Adicionar ao final de `supabase/tests/rls.test.sql`:

```sql
-- ASSERT: cliente_responsavel — contador escreve só no cliente dele; admin em qualquer; financeiro não
do $$
declare n int;
begin
  -- contador atribui no PRÓPRIO cliente (…001 é dele) -> efeito
  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador
  insert into cliente_responsavel (cliente_id, departamento, usuario_id)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'fiscal', '00000000-0000-0000-0000-000000000003')
    on conflict (cliente_id, departamento) do update set usuario_id = excluded.usuario_id;
  reset role;
  select count(*) into n from cliente_responsavel where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000001' and departamento = 'fiscal';
  if n <> 1 then raise exception 'FALHA: contador não gravou responsável no próprio cliente (n=%)', n; end if;

  -- contador tenta no cliente de OUTRO (…002 é do admin) -> negado pela RLS
  perform _simular('00000000-0000-0000-0000-000000000003');
  begin
    insert into cliente_responsavel (cliente_id, departamento, usuario_id)
      values ('aaaaaaaa-0000-0000-0000-000000000002', 'fiscal', '00000000-0000-0000-0000-000000000003');
    raise exception 'FALHA: contador gravou responsável em cliente de outro';
  exception when insufficient_privilege then null; -- esperado
  end;

  -- financeiro NÃO escreve
  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro
  begin
    insert into cliente_responsavel (cliente_id, departamento, usuario_id)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'contabil', '00000000-0000-0000-0000-000000000004');
    raise exception 'FALHA: financeiro gravou responsável';
  exception when insufficient_privilege then null; -- esperado
  end;

  -- admin atribui em QUALQUER cliente -> efeito
  perform _simular('00000000-0000-0000-0000-000000000001'); -- admin
  insert into cliente_responsavel (cliente_id, departamento, usuario_id)
    values ('aaaaaaaa-0000-0000-0000-000000000002', 'contabil', '00000000-0000-0000-0000-000000000001')
    on conflict (cliente_id, departamento) do update set usuario_id = excluded.usuario_id;
  reset role;
  select count(*) into n from cliente_responsavel where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002' and departamento = 'contabil';
  if n <> 1 then raise exception 'FALHA: admin não gravou responsável (n=%)', n; end if;

  raise notice 'OK: cliente_responsavel — contador só no próprio, admin em qualquer, financeiro barrado';
end $$;
```

- [ ] **Step 2: Rodar RLS**

Run: `npm run db:test 2>&1 | grep -iE "FALHA|cliente_responsavel"`
Expected: `OK: cliente_responsavel — ...`; nenhuma `FALHA`. Rodar `npm run db:test 2>&1 | grep -icE "FALHA|error"` → `0`.

- [ ] **Step 3: Documentação**

Em `docs/DOCUMENTACAO.md`, na seção **Clientes**: acrescentar que a ficha tem **Responsáveis por departamento** (Contábil/Fiscal/Pessoal/Societário), que essa camada não altera a visibilidade (o `contador_id` segue governando a RLS), e que admin/assistente têm a **redistribuição de carteira** em `/clientes/responsaveis` (seleção manual + atribuição em massa por departamento).

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/rls.test.sql docs/DOCUMENTACAO.md
git commit -m "test+docs: RLS de cliente_responsavel e documentação (RF-025)"
```

---

## Self-Review (cobertura do spec)

- Enum de 4 departamentos → Task 1. ✔
- Tabela `cliente_responsavel` + RLS (contador só no dele; admin/assistente em qualquer; financeiro barrado; equipe lê) → Task 1 + Task 5. ✔
- `contador_id`/policies existentes intactos → nenhuma task os altera. ✔
- Libs (departamentos, colaboradores via service_role, permissão) → Task 2. ✔
- Ficha: atribuição individual → Task 3. ✔
- Redistribuição por seleção manual + link em Clientes → Task 4. ✔
- Testes + docs → Task 5. ✔

**Notas:** a lista de colaboradores é sempre carregada na ficha (Task 3, Step 3) para resolver nomes no modo read-only. Sem integração automática com obrigações/painéis (fora de escopo, conforme spec).
