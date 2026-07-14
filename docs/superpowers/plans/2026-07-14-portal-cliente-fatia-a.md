# Portal do cliente — Fatia A — Plano

> REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Cliente entra num portal próprio (convite + senha) e baixa **documentos, NFS-e, guias de obrigações e boletos** — só leitura. Falha fechada: papel `cliente` é negado por padrão em tudo; concedo SELECT estreito.

## Global Constraints
- Migrations idempotentes; valor de enum novo **em migration isolada** (não pode ser usado na mesma transação).
- RBAC via `auth_papel()`; novo helper `auth_cliente_id()`.
- **Nenhuma policy de escrita** para `cliente` nesta fatia.
- Antes de cada commit: `lint && typecheck && test` (+ `db:test` — obrigatório aqui).

---

### Task 1: Migrations — papel `cliente`, vínculo e policies do portal

**Files:** Create `supabase/migrations/0084_papel_cliente.sql`, `supabase/migrations/0085_portal_cliente.sql`

- [ ] **Step 1: 0084 (isolada)**
```sql
-- Papel do portal. Isolado: um valor de enum novo não pode ser USADO na mesma transação.
alter type papel add value if not exists 'cliente';
```

- [ ] **Step 2: 0085**
```sql
alter table usuarios add column if not exists cliente_id uuid references clientes(id) on delete cascade;

do $$ begin
  alter table usuarios add constraint chk_usuario_cliente
    check ((papel = 'cliente' and cliente_id is not null) or (papel <> 'cliente' and cliente_id is null));
exception when duplicate_object then null; end $$;

create or replace function auth_cliente_id() returns uuid
language sql stable security definer set search_path = public as $$
  select cliente_id from usuarios where id = auth.uid() and papel = 'cliente' and ativo
$$;
revoke all on function auth_cliente_id() from public;
grant execute on function auth_cliente_id() to authenticated;

-- Policies do portal: SOMENTE SELECT, só as linhas do próprio cliente.
drop policy if exists clientes_portal_sel on clientes;
create policy clientes_portal_sel on clientes for select to authenticated using (id = auth_cliente_id());
drop policy if exists documentos_portal_sel on documentos;
create policy documentos_portal_sel on documentos for select to authenticated using (cliente_id = auth_cliente_id());
drop policy if exists nfse_portal_sel on nfse;
create policy nfse_portal_sel on nfse for select to authenticated using (cliente_id = auth_cliente_id());
drop policy if exists obrig_portal_sel on obrigacao_instancia;
create policy obrig_portal_sel on obrigacao_instancia for select to authenticated using (cliente_id = auth_cliente_id());
drop policy if exists titulo_portal_sel on titulo;
create policy titulo_portal_sel on titulo for select to authenticated using (cliente_id = auth_cliente_id());
drop policy if exists boleto_portal_sel on boleto;
create policy boleto_portal_sel on boleto for select to authenticated
  using (exists (select 1 from titulo t where t.id = boleto.titulo_id and t.cliente_id = auth_cliente_id()));
```

- [ ] **Step 3:** `npm run db:migrate` → aplica as duas.
- [ ] **Step 4:** `npm run db:test 2>&1 | grep -icE "FALHA|error"` → `0`.
- [ ] **Step 5:** commit `feat: migrations 0084/0085 — papel cliente, vínculo e policies do portal`

---

### Task 2: Tipos, perfil e permissões (TDD)

**Files:** Modify `src/lib/tipos.ts`, `src/lib/auth/perfil.ts`; Create `src/lib/portal/permissoes.ts`; Test `src/tests/portal/permissoes.test.ts`

- [ ] **Step 1: Teste**
```ts
import { describe, it, expect } from "vitest";
import { ehCliente, ehEquipe } from "@/lib/portal/permissoes";

describe("portal/permissoes", () => {
  it("ehCliente só para cliente", () => {
    expect(ehCliente("cliente")).toBe(true);
    expect(ehCliente("admin")).toBe(false);
    expect(ehCliente(undefined)).toBe(false);
  });
  it("ehEquipe exclui cliente", () => {
    expect(ehEquipe("admin")).toBe(true);
    expect(ehEquipe("financeiro")).toBe(true);
    expect(ehEquipe("cliente")).toBe(false);
    expect(ehEquipe(undefined)).toBe(false);
  });
});
```
- [ ] **Step 2:** `npm test -- portal/permissoes` → FAIL.
- [ ] **Step 3: Implementar**
  - `tipos.ts`: `export const PAPEIS = ["admin", "contador", "assistente", "financeiro", "cliente"] as const;`
  - `perfil.ts`: o `select` inclui `cliente_id`; o schema Zod ganha `cliente_id` nullable; `PerfilAtual` ganha `clienteId: string | null`.
  - `src/lib/portal/permissoes.ts`:
```ts
import type { Papel } from "@/lib/tipos";
export function ehCliente(papel: Papel | undefined): boolean { return papel === "cliente"; }
export function ehEquipe(papel: Papel | undefined): boolean {
  return papel === "admin" || papel === "contador" || papel === "assistente" || papel === "financeiro";
}
```
- [ ] **Step 4:** PASS + `typecheck && lint`. **Atenção:** incluir `"cliente"` em `PAPEIS` pode quebrar switches exaustivos — corrigir o que o `tsc` acusar (é o objetivo do enum exaustivo).
- [ ] **Step 5:** commit `feat: papel cliente nos tipos, perfil e permissões do portal`

---

### Task 3: Gate — equipe × cliente nunca se cruzam

**Files:** Modify `src/app/(app)/layout.tsx`

- [ ] **Step 1:** No layout do grupo `(app)`, após obter o perfil: se `ehCliente(perfil.papel)` → `redirect("/portal")`.
- [ ] **Step 2:** `lint && typecheck`.
- [ ] **Step 3:** commit `feat: layout da equipe redireciona cliente para o portal`

---

### Task 4: Convite do cliente (ficha)

**Files:** Create `src/app/(app)/clientes/[id]/portal-actions.ts`, `src/components/clientes/PortalCliente.tsx`; Modify `src/app/(app)/clientes/[id]/page.tsx`

- [ ] **Step 1: portal-actions.ts** — gate admin/assistente. `convidarClientePortal(clienteId, email, nome)`: `createAdminSupabase().auth.admin.inviteUserByEmail(email)`; com o `user.id`, `update usuarios set papel='cliente', cliente_id=<clienteId>, nome=<nome>` (service_role). Se o e-mail já existir, revincula. `revogarAcessoPortal(usuarioId)`: `ativo=false`. `listarAcessosPortal(clienteId)`.
- [ ] **Step 2: PortalCliente.tsx** — seção "Portal do cliente" na ficha: lista acessos (nome/e-mail/ativo), campos e-mail+nome e botão "Convidar", "Revogar" por acesso. Visível a admin/assistente.
- [ ] **Step 3:** integrar na ficha carregando `listarAcessosPortal(id)`.
- [ ] **Step 4:** `lint && typecheck`.
- [ ] **Step 5:** commit `feat: convite do cliente ao portal (ficha)`

---

### Task 5: O portal (layout + páginas + downloads)

**Files:** Create `src/app/(portal)/layout.tsx`, `src/app/(portal)/portal/page.tsx`, `.../documentos/page.tsx`, `.../notas/page.tsx`, `.../guias/page.tsx`, `.../boletos/page.tsx`, `src/app/(portal)/portal/actions.ts`

- [ ] **Step 1: layout.tsx** — gate: sem sessão → `/login`; `!ehCliente(perfil.papel)` → `/`. Marca do escritório + navegação (Início · Documentos · Notas · Guias · Boletos · Sair).
- [ ] **Step 2: actions.ts** — downloads. Padrão **obrigatório**: ler com `createServerSupabase()` (RLS prova a titularidade) e **só então** assinar com `createAdminSupabase()`:
```ts
export async function urlDocumento(id: string): Promise<{ url?: string; erro?: string }> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("documentos").select("caminho_storage").eq("id", id).maybeSingle();
  if (!data) return { erro: "Não encontrado." };
  const admin = createAdminSupabase();
  const { data: s } = await admin.storage.from("documentos").createSignedUrl(data.caminho_storage as string, 60);
  return { url: s?.signedUrl };
}
```
(análogo para DANFSe, comprovante de obrigação e PDF do boleto.)
- [ ] **Step 3: páginas** — cada uma lista as linhas do cliente (a RLS filtra) com botão baixar: Documentos (nome/tipo/data), Notas (número/competência/valor/status), Guias (obrigação/competência/vencimento/comprovante), Boletos (vencimento/valor/status), Início (nome + atalhos).
- [ ] **Step 4:** `lint && typecheck && test`.
- [ ] **Step 5:** commit `feat: portal do cliente (layout, documentos, notas, guias, boletos)`

---

### Task 6: Testes de RLS (o coração) + docs

**Files:** Modify `supabase/tests/rls.test.sql`, `docs/DOCUMENTACAO.md`

- [ ] **Step 1: Asserts** — usuário `cliente` vinculado ao cliente A (`aaaaaaaa-…001`); cliente B = `aaaaaaaa-…002`. Provar:
  1. vê **só** o próprio cadastro, documentos, `nfse`, `obrigacao_instancia`, `titulo`, `boleto`;
  2. **não** vê os do cliente B (contagem 0);
  3. **não escreve** (insert/update/delete negados);
  4. **não** vê tabelas de equipe (ex.: `tarefa` → 0);
  5. `chk_usuario_cliente` barra cliente sem vínculo e equipe com vínculo.
- [ ] **Step 2:** `npm run db:test` → 0 falhas.
- [ ] **Step 3: docs** — seção **Portal do cliente** (acesso por convite; o que vê; modelo de segurança: negado por padrão, SELECT estreito por `auth_cliente_id()`, download via RLS + URL assinada, equipe e cliente não se cruzam). Notar fatias B (upload + rastreio) e C (solicitações).
- [ ] **Step 4:** commit `test+docs: RLS do portal do cliente e documentação`

---

## Self-Review
- Papel + vínculo + policies → T1. Tipos/perfil → T2. Gate → T3. Convite → T4. Portal → T5. RLS+docs → T6. ✔
- **Falha fechada:** cliente negado por padrão; nenhuma escrita nesta fatia.
- Downloads sempre passam pela RLS antes de assinar a URL.
