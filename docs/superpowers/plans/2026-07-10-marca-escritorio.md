# Marca do escritório (identidade configurável) — Plano de Implementação (Sub-projeto A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma configuração de identidade do escritório (nome, CNPJ, endereço, e-mail, telefone e logo) — a semente do whitelabel — lida por qualquer autenticado e editada só por admin.

**Architecture:** Tabela singleton `escritorio_config` (`id = 1`), logo no bucket `documentos` (privado, URL assinada). Normalização pura testável; upload valida PNG/JPG por magic bytes (não pela extensão). Tela em Configurações, no padrão das telas de config existentes.

**Tech Stack:** Postgres (Supabase/RLS) · Next.js 16 (Server Actions) · TypeScript · Vitest · Storage (bucket `documentos`).

## Global Constraints

- Migrations via `npm run db:migrate`; **nunca** `supabase db push`. Próxima livre: **0076**. Idempotente.
- Config singleton `id smallint primary key default 1 check (id = 1)`, no padrão de `obrigacao_config`/`nfse_config`.
- **Logo só PNG/JPG**, validado por **magic bytes** (extensão é forjável). SVG proibido (XSS). Limite 2 MB.
- Upload/remoção no Storage via `createAdminSupabase` (service_role); leitura por **URL assinada de 60s** (`createSignedUrl`), bucket privado. Nunca URL pública permanente.
- `Date.now()` / `new Date()` sem argumento só **fora de componentes** (regra `react-hooks/purity`).
- **Editar a marca = só admin** (gate no app + RLS); **ler = qualquer autenticado**.
- Rodar antes de cada commit: `npm run lint && npm run typecheck && npm test`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

- **Create** `supabase/migrations/0076_escritorio_config.sql` — tabela, RLS, trigger, seed da linha.
- **Create** `src/lib/escritorio/marca.ts` — `normalizarMarca` (puro) + `validarImagem` (magic bytes).
- **Create** `src/tests/escritorio/marca.test.ts` — normalização e validação de imagem.
- **Create** `src/app/(app)/configuracoes/marca/actions.ts` — `salvarMarca`, `salvarLogo`, `urlLogoAtual`.
- **Create** `src/app/(app)/configuracoes/marca/page.tsx` — tela (gate admin, carrega marca + preview).
- **Create** `src/app/(app)/configuracoes/marca/FormMarca.tsx` — formulários (dados + logo).
- **Modify** `src/app/(app)/configuracoes/page.tsx` — link no hub.
- **Modify** `supabase/tests/rls.test.sql` — RLS: não-admin lê mas não escreve.

---

### Task 1: Migration — `escritorio_config`

**Files:**
- Create: `supabase/migrations/0076_escritorio_config.sql`

**Interfaces:**
- Produces: tabela `escritorio_config` (singleton `id=1`) com `nome, cnpj, email, telefone, endereco jsonb, logo_path`.

- [ ] **Step 1: Escrever a migration**

Arquivo `supabase/migrations/0076_escritorio_config.sql`:

```sql
-- Identidade/marca do escritório — a semente do whitelabel. Singleton hoje (id=1); quando a V9 chegar,
-- id vira tenant_id e a RLS ganha o filtro por tenant. Separada do nfse_config (marca != config fiscal).
create table if not exists escritorio_config (
  id smallint primary key default 1 check (id = 1),
  nome text,
  cnpj text,
  email text,
  telefone text,
  endereco jsonb,
  logo_path text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);

-- Semeia a linha vazia para o update da action sempre encontrar.
insert into escritorio_config (id) values (1) on conflict (id) do nothing;

alter table escritorio_config enable row level security;

-- Leitura: qualquer autenticado (a proposta usa a marca). Escrita: só admin.
drop policy if exists escritorio_config_sel on escritorio_config;
create policy escritorio_config_sel on escritorio_config for select to authenticated using (true);
drop policy if exists escritorio_config_ins on escritorio_config;
create policy escritorio_config_ins on escritorio_config for insert to authenticated
  with check (auth_papel() = 'admin');
drop policy if exists escritorio_config_upd on escritorio_config;
create policy escritorio_config_upd on escritorio_config for update to authenticated
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');

-- Autoria não-forjável.
create or replace function escritorio_config_integridade() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  new.atualizado_por := auth.uid();
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists trg_escritorio_config_integridade on escritorio_config;
create trigger trg_escritorio_config_integridade before insert or update on escritorio_config
  for each row execute function escritorio_config_integridade();
```

- [ ] **Step 2: Aplicar**

Run: `npm run db:migrate`
Expected: `+ aplicando: 0076_escritorio_config.sql` sem erro.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0076_escritorio_config.sql
git commit -m "feat(db): escritorio_config — marca do escritório (semente do whitelabel)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Normalização e validação de imagem (puras)

**Files:**
- Create: `src/lib/escritorio/marca.ts`
- Create: `src/tests/escritorio/marca.test.ts`

**Interfaces:**
- Produces:
  - `type DadosMarca = { nome: string | null; cnpj: string | null; email: string | null; telefone: string | null; endereco: Record<string, string> | null }`
  - `normalizarMarca(fd: FormData): DadosMarca | { erro: string }`
  - `tipoImagem(buf: Uint8Array): "png" | "jpg" | null` — por magic bytes

- [ ] **Step 1: Escrever o teste que falha**

Arquivo `src/tests/escritorio/marca.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizarMarca, tipoImagem } from "@/lib/escritorio/marca";

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

describe("normalizarMarca", () => {
  it("aceita dados válidos e monta o endereço", () => {
    const r = normalizarMarca(
      fd({ nome: "Escritório X", cnpj: "11.222.333/0001-81", email: "a@b.com", telefone: "34999", cidade: "Uberlândia", uf: "MG" }),
    );
    expect(r).toEqual({
      nome: "Escritório X",
      cnpj: "11222333000181",
      email: "a@b.com",
      telefone: "34999",
      endereco: { cidade: "Uberlândia", uf: "MG" },
    });
  });
  it("rejeita CNPJ inválido", () => {
    expect(normalizarMarca(fd({ cnpj: "11.111.111/1111-11" }))).toHaveProperty("erro");
  });
  it("rejeita e-mail malformado", () => {
    expect(normalizarMarca(fd({ email: "sem-arroba" }))).toHaveProperty("erro");
  });
  it("campos vazios viram null e endereço vazio vira null", () => {
    expect(normalizarMarca(fd({}))).toEqual({
      nome: null,
      cnpj: null,
      email: null,
      telefone: null,
      endereco: null,
    });
  });
});

describe("tipoImagem", () => {
  it("reconhece PNG pelos magic bytes", () => {
    expect(tipoImagem(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
  });
  it("reconhece JPG pelos magic bytes", () => {
    expect(tipoImagem(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
  });
  it("rejeita SVG (texto) mesmo com extensão de imagem", () => {
    const svg = new TextEncoder().encode("<svg xmlns=...");
    expect(tipoImagem(svg)).toBeNull();
  });
  it("rejeita conteúdo aleatório", () => {
    expect(tipoImagem(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/tests/escritorio/marca.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `src/lib/escritorio/marca.ts`**

```ts
import { validarDocumento } from "@/lib/validation/documento";

export type DadosMarca = {
  nome: string | null;
  cnpj: string | null;
  email: string | null;
  telefone: string | null;
  endereco: Record<string, string> | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizarMarca(fd: FormData): DadosMarca | { erro: string } {
  const t = (k: string, max = 160) =>
    String(fd.get(k) ?? "")
      .trim()
      .slice(0, max);

  const cnpjDigits = t("cnpj").replace(/\D/g, "");
  if (cnpjDigits && !validarDocumento("PJ", cnpjDigits)) return { erro: "CNPJ inválido." };

  const email = t("email");
  if (email && !EMAIL.test(email)) return { erro: "E-mail inválido." };

  const endereco: Record<string, string> = {};
  for (const c of ["logradouro", "numero", "bairro", "cidade", "uf", "cep"]) {
    let v = t(c, 120);
    if (c === "uf") v = v.toUpperCase().slice(0, 2);
    if (v) endereco[c] = v;
  }

  return {
    nome: t("nome") || null,
    cnpj: cnpjDigits || null,
    email: email || null,
    telefone: t("telefone", 40) || null,
    endereco: Object.keys(endereco).length ? endereco : null,
  };
}

// Tipo da imagem pelos magic bytes — a extensão é forjável. SVG (texto) não casa: proibido (XSS).
export function tipoImagem(buf: Uint8Array): "png" | "jpg" | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/tests/escritorio/marca.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/escritorio/marca.ts src/tests/escritorio/marca.test.ts
git commit -m "feat: normalização da marca e validação de imagem por magic bytes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Actions — salvar marca, salvar logo, URL do logo

**Files:**
- Create: `src/app/(app)/configuracoes/marca/actions.ts`

**Interfaces:**
- Consumes: `normalizarMarca`, `tipoImagem` (Task 2); `getPerfilAtual`; `createServerSupabase`; `createAdminSupabase`.
- Produces:
  - `type EstadoMarca = { erro?: string; ok?: boolean }`
  - `salvarMarca(_prev: EstadoMarca, formData: FormData): Promise<EstadoMarca>`
  - `salvarLogo(_prev: EstadoMarca, formData: FormData): Promise<EstadoMarca>`
  - `urlLogoAtual(): Promise<string | null>`

- [ ] **Step 1: Criar o arquivo**

Arquivo `src/app/(app)/configuracoes/marca/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { normalizarMarca, tipoImagem } from "@/lib/escritorio/marca";

export type EstadoMarca = { erro?: string; ok?: boolean };

async function exigirAdmin(): Promise<boolean> {
  const perfil = await getPerfilAtual();
  return Boolean(perfil?.ativo && perfil.papel === "admin");
}

export async function salvarMarca(_prev: EstadoMarca, formData: FormData): Promise<EstadoMarca> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const dados = normalizarMarca(formData);
  if ("erro" in dados) return { erro: dados.erro };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("escritorio_config").update(dados).eq("id", 1);
  if (error) return { erro: "Falha ao salvar a marca." };
  revalidatePath("/configuracoes/marca");
  return { ok: true };
}

export async function salvarLogo(_prev: EstadoMarca, formData: FormData): Promise<EstadoMarca> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const arquivo = formData.get("logo") as File | null;
  if (!arquivo || arquivo.size === 0) return { erro: "Selecione um arquivo." };
  if (arquivo.size > 2 * 1024 * 1024) return { erro: "Logo acima de 2 MB." };
  const buf = new Uint8Array(await arquivo.arrayBuffer());
  const tipo = tipoImagem(buf);
  if (!tipo) return { erro: "Envie uma imagem PNG ou JPG." };

  const admin = createAdminSupabase();
  const supabase = await createServerSupabase();
  const { data: atual } = await supabase.from("escritorio_config").select("logo_path").eq("id", 1).maybeSingle();

  const path = `marca/logo-${Date.now()}.${tipo}`;
  const { error: upErr } = await admin.storage
    .from("documentos")
    .upload(path, buf, { contentType: tipo === "png" ? "image/png" : "image/jpeg", upsert: false });
  if (upErr) return { erro: "Falha ao enviar o logo." };

  const { error } = await supabase.from("escritorio_config").update({ logo_path: path }).eq("id", 1);
  if (error) {
    await admin.storage.from("documentos").remove([path]); // não deixa órfão se o update falhar
    return { erro: "Falha ao salvar o logo." };
  }
  // remove o logo anterior, se havia
  if (atual?.logo_path) await admin.storage.from("documentos").remove([atual.logo_path]);
  revalidatePath("/configuracoes/marca");
  return { ok: true };
}

export async function urlLogoAtual(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("escritorio_config").select("logo_path").eq("id", 1).maybeSingle();
  if (!data?.logo_path) return null;
  const admin = createAdminSupabase();
  const { data: signed } = await admin.storage.from("documentos").createSignedUrl(data.logo_path, 60);
  return signed?.signedUrl ?? null;
}
```

- [ ] **Step 2: Verificar lint/typecheck**

Run: `npm run lint && npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/configuracoes/marca/actions.ts"
git commit -m "feat: actions da marca — salvar dados, upload de logo (magic bytes), URL assinada

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Tela `/configuracoes/marca` + link no hub

**Files:**
- Create: `src/app/(app)/configuracoes/marca/page.tsx`
- Create: `src/app/(app)/configuracoes/marca/FormMarca.tsx`
- Modify: `src/app/(app)/configuracoes/page.tsx`

**Interfaces:**
- Consumes: `salvarMarca`, `salvarLogo`, `urlLogoAtual`, `EstadoMarca` (Task 3).

- [ ] **Step 1: Criar a página (server, gate admin, carrega dados)**

Arquivo `src/app/(app)/configuracoes/marca/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { urlLogoAtual } from "./actions";
import { FormMarca } from "./FormMarca";

export const metadata = { title: "Marca do escritório" };

export default async function MarcaPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const supabase = await createServerSupabase();
  const { data: marca } = await supabase
    .from("escritorio_config")
    .select("nome, cnpj, email, telefone, endereco")
    .eq("id", 1)
    .maybeSingle();
  const logoUrl = await urlLogoAtual();

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <PageHeader titulo="Marca do escritório" subtitulo="Identidade usada na proposta comercial e no whitelabel" />
      {!marca?.nome && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Configure a marca para usá-la na proposta comercial.
        </p>
      )}
      <FormMarca marca={marca ?? null} logoUrl={logoUrl} />
    </main>
  );
}
```

- [ ] **Step 2: Criar `FormMarca.tsx`** (client)

Arquivo `src/app/(app)/configuracoes/marca/FormMarca.tsx`:

```tsx
"use client";
import { useActionState } from "react";
import Image from "next/image";
import { salvarMarca, salvarLogo, type EstadoMarca } from "./actions";

const input = "mt-1 w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto";

type Marca = {
  nome: string | null;
  cnpj: string | null;
  email: string | null;
  telefone: string | null;
  endereco: Record<string, string> | null;
} | null;

export function FormMarca({ marca, logoUrl }: { marca: Marca; logoUrl: string | null }) {
  const [estado, salvar, pend] = useActionState<EstadoMarca, FormData>(salvarMarca, {});
  const [estLogo, subirLogo, pendLogo] = useActionState<EstadoMarca, FormData>(salvarLogo, {});
  const e = marca?.endereco ?? {};

  return (
    <div className="space-y-6">
      <form action={salvar} className="grid grid-cols-2 gap-3 text-sm">
        <label className="col-span-2 block">Nome
          <input name="nome" defaultValue={marca?.nome ?? ""} className={input} />
        </label>
        <label className="block">CNPJ
          <input name="cnpj" defaultValue={marca?.cnpj ?? ""} className={input} />
        </label>
        <label className="block">Telefone
          <input name="telefone" defaultValue={marca?.telefone ?? ""} className={input} />
        </label>
        <label className="col-span-2 block">E-mail
          <input name="email" defaultValue={marca?.email ?? ""} className={input} />
        </label>
        <label className="block">Logradouro
          <input name="logradouro" defaultValue={e.logradouro ?? ""} className={input} />
        </label>
        <label className="block">Número
          <input name="numero" defaultValue={e.numero ?? ""} className={input} />
        </label>
        <label className="block">Bairro
          <input name="bairro" defaultValue={e.bairro ?? ""} className={input} />
        </label>
        <label className="block">Cidade
          <input name="cidade" defaultValue={e.cidade ?? ""} className={input} />
        </label>
        <label className="block">UF
          <input name="uf" maxLength={2} defaultValue={e.uf ?? ""} className={input} />
        </label>
        <label className="block">CEP
          <input name="cep" defaultValue={e.cep ?? ""} className={input} />
        </label>
        <div className="col-span-2 flex items-center gap-3">
          <button disabled={pend} className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60">
            {pend ? "Salvando…" : "Salvar marca"}
          </button>
          {estado.ok && <span className="text-xs text-verde">Salvo ✓</span>}
          {estado.erro && <span role="alert" className="text-xs text-negativo">{estado.erro}</span>}
        </div>
      </form>

      <form action={subirLogo} className="space-y-2 rounded-lg border border-linha p-3 text-sm">
        <p className="font-medium text-texto">Logo</p>
        {logoUrl && (
          <Image src={logoUrl} alt="Logo do escritório" width={160} height={64} className="max-h-16 w-auto object-contain" unoptimized />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input type="file" name="logo" accept="image/png,image/jpeg" className="text-xs" />
          <button disabled={pendLogo} className="rounded-lg border border-linha px-3 py-1.5 disabled:opacity-60">
            {pendLogo ? "Enviando…" : "Enviar logo"}
          </button>
          {estLogo.ok && <span className="text-xs text-verde">Logo salvo ✓</span>}
          {estLogo.erro && <span role="alert" className="text-xs text-negativo">{estLogo.erro}</span>}
        </div>
        <p className="text-xs text-cinza">PNG ou JPG, até 2 MB.</p>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Link no hub de configurações**

Em `src/app/(app)/configuracoes/page.tsx`, acrescentar ao array `ITENS` (no topo, é o primeiro que
importa para o whitelabel):

```tsx
  { href: "/configuracoes/marca", label: "Marca do escritório", desc: "Nome, CNPJ, endereço e logo usados na proposta." },
```

- [ ] **Step 4: Verificar lint/typecheck/build**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: sem erros; build compila.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/configuracoes/marca/page.tsx" "src/app/(app)/configuracoes/marca/FormMarca.tsx" "src/app/(app)/configuracoes/page.tsx"
git commit -m "feat: tela de marca do escritório em Configurações

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Teste de RLS

**Files:**
- Modify: `supabase/tests/rls.test.sql`

- [ ] **Step 1: Acrescentar o bloco ao final de `supabase/tests/rls.test.sql`**

```sql
-- ===== Marca do escritório: qualquer autenticado lê; só admin escreve =====
do $$
declare v text;
begin
  reset role;
  update escritorio_config set nome = 'Antes' where id = 1;

  -- financeiro LÊ
  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro
  select nome into v from escritorio_config where id = 1;
  if v is distinct from 'Antes' then raise exception 'FALHA: financeiro não leu a marca (=%)', v; end if;

  -- financeiro NÃO escreve (RLS admin-only) — o update não afeta linha
  update escritorio_config set nome = 'HACK' where id = 1;
  reset role;
  select nome into v from escritorio_config where id = 1;
  if v = 'HACK' then raise exception 'FALHA: não-admin escreveu na marca'; end if;
  raise notice 'OK: marca — financeiro lê, não escreve';

  -- admin escreve
  perform _simular('00000000-0000-0000-0000-000000000001'); -- admin
  update escritorio_config set nome = 'Depois' where id = 1;
  reset role;
  select nome into v from escritorio_config where id = 1;
  if v is distinct from 'Depois' then raise exception 'FALHA: admin não escreveu a marca (=%)', v; end if;
  raise notice 'OK: marca — admin escreve';
end $$;
```

- [ ] **Step 2: Rodar**

Run: `npm run db:test`
Expected: todos passam, incluindo os dois novos `OK:`.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/rls.test.sql
git commit -m "test(rls): marca do escritório — leitura geral, escrita só admin

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Documentação

**Files:**
- Modify: `docs/DOCUMENTACAO.md`

- [ ] **Step 1: Acrescentar à seção de Configurações (3.11)**

Na lista de Configurações:

```markdown
- **Marca do escritório:** identidade (nome, CNPJ, endereço, e-mail, telefone e **logo**) usada na
  proposta comercial e base do whitelabel. Logo em PNG/JPG (validado por conteúdo, não pela extensão).
```

- [ ] **Step 2: Commit**

```bash
git add docs/DOCUMENTACAO.md
git commit -m "docs: marca do escritório em Configurações

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verificação final

- [ ] `npm run lint && npm run typecheck && npm test` — tudo verde.
- [ ] `npm run build` — compila.
- [ ] `npm run db:test` — asserts verdes, incluindo os dois novos.
- [ ] **Validação manual** (após deploy): em `/configuracoes/marca`, preencher nome/CNPJ/endereço e
      salvar; subir um logo PNG e ver o preview; tentar subir um SVG renomeado para `.png` → recusa;
      entrar como financeiro → `/configuracoes/marca` redireciona (edição), mas a leitura serve à Fatia B.
