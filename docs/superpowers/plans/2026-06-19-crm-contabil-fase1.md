# CRM Contábil — Fase 1 (Fundação) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a fundação de um CRM web para escritório de contabilidade — login com papéis, dashboard e módulo de Clientes — com permissões garantidas no banco (RLS).

**Architecture:** App Next.js (App Router) servido pelo EasyPanel, falando com um projeto Supabase na nuvem que provê Auth, Postgres (com Row Level Security), e Storage. Todo o schema e as policies vivem em migrations versionadas pela Supabase CLI. Operações privilegiadas (convite de usuário, eliminação definitiva) rodam em código server-side com a `service_role`; o navegador só usa a `anon key`.

**Tech Stack:** Next.js 14+ (App Router) · TypeScript · Tailwind CSS · `@supabase/ssr` · `@supabase/supabase-js` · Supabase CLI · Vitest (testes) · Zod (validação) · Docker/Nixpacks (deploy EasyPanel).

**Spec de origem:** `docs/superpowers/specs/2026-06-19-crm-contabil-fase1-design.md`

## Global Constraints

- **Papéis (enum `papel`):** `admin` | `contador` | `assistente` | `financeiro`. Valores exatos, minúsculos.
- **Tipos de pessoa (enum `tipo_pessoa`):** `PJ` | `PF` | `MEI`.
- **Regimes (enum `regime_tributario`):** `Simples` | `Presumido` | `Real` | `MEI` | `Isento/PF`.
- **Status de cliente (enum `status_cliente`):** `ativo` | `inativo`.
- **Segredos:** `SUPABASE_SERVICE_ROLE_KEY` NUNCA prefixada com `NEXT_PUBLIC_` e NUNCA importada em código client. Apenas `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` vão ao navegador.
- **Env de build (EasyPanel):** as duas `NEXT_PUBLIC_*` precisam existir no ambiente de **build** (são inlined). `SUPABASE_SERVICE_ROLE_KEY` só no runtime do servidor.
- **Schema = migrations:** nenhuma alteração de schema/policy pelo painel do Supabase. Tudo em `supabase/migrations/*.sql` via CLI.
- **RLS:** toda tabela de dados (`usuarios`, `clientes`, `clientes_financeiro`, `documentos`, `log_acesso_documento`) tem RLS habilitada. `usuarios` NÃO usa `FORCE ROW LEVEL SECURITY`.
- **Idioma:** identificadores de schema e UI em português; mensagens de erro ao usuário em português-BR.
- **Commits:** um commit por tarefa concluída, mensagem no formato `tipo: descrição` (feat/test/chore/docs).
- **Next.js:** `output: 'standalone'` no `next.config`.

---

## Estrutura de Arquivos

```
crm-contabil/
├── supabase/
│   ├── config.toml                      # config da Supabase CLI (local dev)
│   ├── migrations/
│   │   ├── 0001_enums_e_usuarios.sql     # enums + usuarios + RLS + auth_papel() + trigger proteção
│   │   ├── 0002_handle_new_user.sql       # trigger sync auth.users -> usuarios
│   │   ├── 0003_clientes.sql             # tabela clientes + CHECK tipo×regime + RLS
│   │   ├── 0004_clientes_financeiro.sql  # honorário isolado + RLS (sem assistente)
│   │   ├── 0005_documentos_e_log.sql     # documentos + log_acesso_documento + RLS
│   │   ├── 0006_storage.sql              # bucket privado + policies storage.objects
│   │   └── 0007_seed_admin.sql           # seed do primeiro Admin (idempotente)
│   └── tests/
│       └── rls.test.sql                  # testes de RLS via pgTAP (ou script SQL de asserts)
├── src/
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts                 # createBrowserClient (anon)
│   │   │   ├── server.ts                 # createServerClient (cookies, anon)
│   │   │   └── admin.ts                  # createClient service_role (server-only)
│   │   ├── validation/
│   │   │   ├── documento.ts              # validação CPF/CNPJ (dígitos)
│   │   │   └── cliente.ts                # schema Zod do cliente + regra tipo×regime
│   │   └── tipos.ts                      # tipos TS compartilhados (Papel, Cliente, etc.)
│   ├── proxy.ts                          # refresh de sessão (@supabase/ssr) — Next 16 (ex-middleware.ts)
│   ├── app/
│   │   ├── layout.tsx                    # layout raiz
│   │   ├── login/
│   │   │   ├── page.tsx                  # tela de login
│   │   │   └── actions.ts               # server actions: entrar, recuperar senha
│   │   ├── (app)/                        # grupo autenticado (com menu lateral)
│   │   │   ├── layout.tsx                # shell: sidebar + guarda de sessão
│   │   │   ├── page.tsx                  # dashboard (números, atividade, atalhos)
│   │   │   ├── clientes/
│   │   │   │   ├── page.tsx              # lista + busca + filtros
│   │   │   │   ├── novo/page.tsx         # form novo cliente
│   │   │   │   ├── [id]/page.tsx         # ficha do cliente (abas)
│   │   │   │   └── actions.ts            # server actions CRUD cliente + honorário
│   │   │   ├── documentos/
│   │   │   │   └── actions.ts            # upload, gerar URL assinada (+log), excluir
│   │   │   └── usuarios/
│   │   │       ├── page.tsx              # gestão de usuários (só admin)
│   │   │       └── actions.ts            # convite, ativar/desativar, alterar papel (service_role)
│   │   └── api/
│   │       └── health/route.ts           # endpoint de saúde p/ deploy "hello world"
│   ├── components/
│   │   ├── Sidebar.tsx                   # menu lateral
│   │   ├── CardResumo.tsx                # card de número-resumo
│   │   ├── TabelaClientes.tsx            # tabela com busca/filtro/paginação
│   │   └── FormCliente.tsx               # formulário em abas
│   └── tests/
│       ├── validation/documento.test.ts  # testes CPF/CNPJ
│       └── validation/cliente.test.ts    # testes schema + tipo×regime
├── Dockerfile                            # build standalone p/ EasyPanel
├── next.config.mjs
├── tailwind.config.ts
├── package.json
├── vitest.config.ts
├── .env.local.example
└── README.md                             # operação: env, bootstrap admin, deploy
```

---

## Task 1: Scaffolding do projeto + deploy "hello world"

Entrega: app Next.js mínimo, com TypeScript/Tailwind/Vitest configurados, endpoint `/api/health`, e Dockerfile pronto para o EasyPanel. Marco 1 da §12 (parte app).

**Files:**
- Create: `package.json`, `next.config.mjs`, `tailwind.config.ts`, `tsconfig.json`, `vitest.config.ts`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/api/health/route.ts`
- Create: `Dockerfile`, `.dockerignore`, `.env.local.example`, `README.md`
- Test: `src/tests/health.test.ts`

**Interfaces:**
- Produces: rota `GET /api/health` → `{ status: "ok" }` (200). Usada como health check do EasyPanel.

- [ ] **Step 1: Inicializar o projeto Next.js**

Run:
```bash
cd /Users/pedrogomes/crm-contabil
npx create-next-app@latest . --ts --tailwind --app --src-dir --no-eslint --use-npm --import-alias "@/*" --yes
```
Expected: estrutura `src/app/` criada, `package.json` com `next`, `react`, `tailwindcss`.

- [ ] **Step 2: Adicionar dependências do projeto**

Run:
```bash
npm install @supabase/supabase-js @supabase/ssr zod
npm install -D vitest @vitejs/plugin-react jsdom
```
Expected: pacotes adicionados sem erro.

- [ ] **Step 3: Configurar `next.config.mjs` para standalone**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
};
export default nextConfig;
```

- [ ] **Step 4: Configurar Vitest**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/tests/**/*.test.ts', 'src/tests/**/*.test.tsx'],
  },
});
```
Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 5: Escrever o teste falho do health check**

Create `src/tests/health.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  it('retorna status ok', async () => {
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 6: Rodar o teste e ver falhar**

Run: `npm test -- src/tests/health.test.ts`
Expected: FAIL — módulo `@/app/api/health/route` não existe.

- [ ] **Step 7: Implementar o endpoint de health**

Create `src/app/api/health/route.ts`:
```ts
import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({ status: 'ok' });
}
```

- [ ] **Step 8: Rodar o teste e ver passar**

Run: `npm test -- src/tests/health.test.ts`
Expected: PASS.

- [ ] **Step 9: Criar o Dockerfile para o EasyPanel**

Create `Dockerfile`:
```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* precisam existir no build (inlined). EasyPanel injeta via build args/env.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

Create `.dockerignore`:
```
node_modules
.next
.git
.env.local
```

- [ ] **Step 10: Documentar env e operação no README**

Create `.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```
Create `README.md` com seções: pré-requisitos, variáveis de ambiente (quais são build vs runtime), como rodar localmente (`npm run dev`), e nota: "trocar o projeto Supabase exige **rebuild** no EasyPanel, não só restart, porque as `NEXT_PUBLIC_*` são embutidas no build".

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: scaffolding Next.js + health check + Dockerfile EasyPanel"
```

---

## Task 2: Supabase CLI + enums + tabela `usuarios` com RLS e proteção anti-escalonamento

Entrega: projeto Supabase local inicializado, primeira migration com os enums, a tabela `usuarios`, RLS (SELECT/UPDATE própria linha) e o trigger `BEFORE UPDATE` que congela `papel`/`ativo` para não-admin. Marcos 1–2 da §12.

**Files:**
- Create: `supabase/config.toml` (gerado), `supabase/migrations/0001_enums_e_usuarios.sql`
- Test: `supabase/tests/rls.test.sql` (iniciado nesta task)

**Interfaces:**
- Produces: enums `papel`, `tipo_pessoa`, `regime_tributario`, `status_cliente`; tabela `usuarios(id uuid pk, nome text, email text, papel papel, ativo bool, criado_em timestamptz)`; função `auth_papel() returns papel` (STABLE SECURITY DEFINER); função-trigger `congela_campos_sensiveis()`.

- [ ] **Step 1: Inicializar Supabase local**

Run:
```bash
cd /Users/pedrogomes/crm-contabil
npx supabase init
npx supabase start
```
Expected: `supabase/config.toml` criado; stack local sobe e imprime `API URL`, `anon key`, `service_role key`. Anotar para o `.env.local`.

- [ ] **Step 2: Criar a migration dos enums e da tabela `usuarios`**

Create `supabase/migrations/0001_enums_e_usuarios.sql`:
```sql
-- Enums (valores exatos conforme Global Constraints)
create type papel as enum ('admin','contador','assistente','financeiro');
create type tipo_pessoa as enum ('PJ','PF','MEI');
create type regime_tributario as enum ('Simples','Presumido','Real','MEI','Isento/PF');
create type status_cliente as enum ('ativo','inativo');

-- Perfil da aplicação, 1:1 com auth.users
create table usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  papel papel not null default 'assistente',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- RLS habilitada; NÃO usar FORCE (a função auth_papel() precisa do bypass do owner)
alter table usuarios enable row level security;

-- Policy 1: cada um lê a própria linha
create policy usuarios_select_propria
  on usuarios for select to authenticated
  using (id = auth.uid());

-- Policy 2: cada um atualiza a própria linha (campos sensíveis são congelados pelo trigger)
create policy usuarios_update_propria
  on usuarios for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Função de papel BLINDADA, criada AQUI (antes do trigger que a usa).
-- SECURITY DEFINER + owner que bypassa RLS de usuarios (usuarios não usa FORCE RLS).
create function auth_papel() returns papel
  language sql stable security definer set search_path = public as $$
  select papel from usuarios where id = auth.uid()
$$;
revoke all on function auth_papel() from public;
grant execute on function auth_papel() to authenticated;

-- Trigger anti-escalonamento: congela papel/ativo quando quem edita não é admin.
-- Guarda auth.uid() is not null => libera service_role (uid nulo) e Admin.
create function congela_campos_sensiveis() returns trigger
  language plpgsql as $$
begin
  if auth.uid() is not null and coalesce(auth_papel(), 'assistente') <> 'admin' then
    new.papel := old.papel;
    new.ativo := old.ativo;
  end if;
  return new;
end;
$$;

create trigger trg_congela_campos_sensiveis
  before update on usuarios
  for each row execute function congela_campos_sensiveis();
```

> Nota: `auth_papel()` é criada nesta mesma migration, **antes** do trigger, e o trigger a usa diretamente — sem fragilidade de ordem e sem recursão (a função é `SECURITY DEFINER` e lê a própria linha por PK). `returns papel` (enum) funciona nas comparações com literais string das policies das próximas tasks.

- [ ] **Step 3: Aplicar a migration**

Run: `npx supabase migration up`
Expected: migration `0001` aplicada sem erro; `\d usuarios` mostra a tabela.

- [ ] **Step 4: Escrever asserts de RLS para `usuarios`**

Create `supabase/tests/rls.test.sql` (primeiros casos):
```sql
-- Executar com: psql "$DB_URL" -f supabase/tests/rls.test.sql
-- Pré-condição: rodar como service_role para semear; depois simular usuários.

-- CONVENÇÃO DOS TESTES DE RLS (vale para todos os asserts deste arquivo):
--  • Rodar com `psql -1` (transação única) para o `set local` valer nos blocos seguintes.
--  • Simular usuário via `request.jwt.claims` (JSON) — é de lá que auth.uid() lê o `sub`.
--  • auth.users exige colunas obrigatórias (instance_id, aud, role) além de id/email.
--  • Helper de simulação: troca o role e os claims numa tacada.

create or replace function _simular(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
end $$;

-- Semear dois usuários (como owner; reset role antes).
-- created_at/updated_at explícitos para não depender de defaults da versão do GoTrue.
reset role;
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@teste.com', now(), now()),
  ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','assist@teste.com', now(), now())
  on conflict do nothing;
insert into usuarios (id, nome, email, papel) values
  ('00000000-0000-0000-0000-000000000001','Admin','admin@teste.com','admin'),
  ('00000000-0000-0000-0000-000000000002','Assist','assist@teste.com','assistente')
  on conflict do nothing;

-- ASSERT 1: assistente NÃO consegue se promover a admin
do $$
declare v_papel papel; v_uid uuid;
begin
  perform _simular('00000000-0000-0000-0000-000000000002');  -- assistente
  v_uid := auth.uid();
  if v_uid is null then raise exception 'FALHA: auth.uid() nulo (claims não aplicados)'; end if;
  update usuarios set papel = 'admin' where id = v_uid;
  select papel into v_papel from usuarios where id = v_uid;
  if v_papel <> 'assistente' then
    raise exception 'FALHA: assistente conseguiu mudar o próprio papel (=%)', v_papel;
  end if;
  raise notice 'OK: papel do assistente permaneceu congelado';
end $$;
```

- [ ] **Step 5: Rodar os asserts e ver passar**

Run:
```bash
npx supabase db reset   # reaplica migrations limpas
psql -1 "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls.test.sql
```
Expected: saída `OK: papel do assistente permaneceu congelado`, sem `FALHA`.

- [ ] **Step 6: Commit**

```bash
git add supabase/config.toml supabase/migrations/0001_enums_e_usuarios.sql supabase/tests/rls.test.sql
git commit -m "feat: enums + tabela usuarios com RLS e trigger anti-escalonamento"
```

---

## Task 3: Trigger `handle_new_user` (sync de perfil)

Entrega: o trigger que cria a linha em `usuarios` quando um usuário nasce em `auth.users`, lendo o papel de `app_metadata`. (A função `auth_papel()` já foi criada na Task 2/migration 0001.) Marco 2 da §12.

**Files:**
- Create: `supabase/migrations/0002_handle_new_user.sql`
- Modify: `supabase/tests/rls.test.sql` (adicionar casos)

**Interfaces:**
- Produces: trigger `on auth.users` → cria `usuarios`.
- Consumes: tabela `usuarios`, enums e `auth_papel()` da Task 2.

- [ ] **Step 1: Criar a migration do trigger de sync**

Create `supabase/migrations/0002_handle_new_user.sql`:
```sql
-- Sincroniza auth.users -> usuarios. Papel vem de app_metadata (definido server-side no convite).
-- Fallback 'assistente' (menor privilégio). Idempotente (on conflict do nothing).
create function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into usuarios (id, nome, email, papel)
  values (
    new.id,
    coalesce(new.raw_app_meta_data->>'nome', new.email),
    new.email,
    coalesce((new.raw_app_meta_data->>'papel')::papel, 'assistente')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function handle_new_user();
```

- [ ] **Step 2: Aplicar a migration**

Run: `npx supabase migration up`
Expected: migration `0002` aplicada; `select auth_papel();` executável.

- [ ] **Step 3: Adicionar assert de sync de perfil ao teste**

Append em `supabase/tests/rls.test.sql`:
```sql
-- ASSERT 2: inserir em auth.users com papel em app_metadata cria usuarios com o papel certo
reset role;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','contador@teste.com',
   '{"nome":"Contador X","papel":"contador"}'::jsonb, now(), now())
  on conflict do nothing;
do $$
declare v_papel papel;
begin
  select papel into v_papel from usuarios where id = '00000000-0000-0000-0000-000000000003';
  if v_papel is distinct from 'contador' then
    raise exception 'FALHA: sync de perfil não aplicou papel de app_metadata (=%)', v_papel;
  end if;
  raise notice 'OK: handle_new_user criou perfil com papel contador';
end $$;
```

- [ ] **Step 4: Rodar e ver passar**

Run:
```bash
npx supabase db reset
psql -1 "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls.test.sql
```
Expected: `OK: handle_new_user criou perfil com papel contador` e os asserts anteriores também OK.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_handle_new_user.sql supabase/tests/rls.test.sql
git commit -m "feat: trigger handle_new_user (sync de perfil via app_metadata)"
```

---

## Task 4: Tabela `clientes` + CHECK tipo×regime + RLS por papel

Entrega: tabela `clientes` (sem dado financeiro), constraint de coerência tipo×regime e policies de acesso por papel (Contador só os seus; demais todos). Marco 4 da §12 (parte cadastral).

**Files:**
- Create: `supabase/migrations/0003_clientes.sql`
- Modify: `supabase/tests/rls.test.sql`

**Interfaces:**
- Produces: tabela `clientes(id uuid pk, tipo_pessoa, razao_social, nome_fantasia, cpf_cnpj unique, regime_tributario, inscricao_estadual, inscricao_municipal, email, telefone, endereco jsonb, responsavel_nome, contador_id uuid→usuarios, status status_cliente, data_inicio date, observacoes, criado_por, criado_em, atualizado_em)`.
- Consumes: `auth_papel()`, enums.

- [ ] **Step 1: Criar a migration de `clientes`**

Create `supabase/migrations/0003_clientes.sql`:
```sql
create table clientes (
  id uuid primary key default gen_random_uuid(),
  tipo_pessoa tipo_pessoa not null,
  razao_social text not null,
  nome_fantasia text,
  cpf_cnpj text not null unique,
  regime_tributario regime_tributario not null,
  inscricao_estadual text,
  inscricao_municipal text,
  email text,
  telefone text,
  endereco jsonb,
  responsavel_nome text,
  contador_id uuid references usuarios(id),
  status status_cliente not null default 'ativo',
  data_inicio date,
  observacoes text,
  criado_por uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- Coerência tipo x regime (Global Constraints / spec §7)
  constraint chk_tipo_regime check (
    (tipo_pessoa = 'MEI' and regime_tributario = 'MEI') or
    (tipo_pessoa = 'PF'  and regime_tributario = 'Isento/PF') or
    (tipo_pessoa = 'PJ'  and regime_tributario in ('Simples','Presumido','Real'))
  )
);

alter table clientes enable row level security;

-- SELECT: admin/financeiro/assistente veem todos; contador só os seus
create policy clientes_select on clientes for select to authenticated using (
  auth_papel() in ('admin','financeiro','assistente')
  or (auth_papel() = 'contador' and contador_id = auth.uid())
);

-- INSERT: admin/assistente/contador podem criar (financeiro é leitura de cadastrais)
create policy clientes_insert on clientes for insert to authenticated with check (
  auth_papel() in ('admin','assistente','contador')
);

-- UPDATE: admin/assistente todos; contador só os seus
create policy clientes_update on clientes for update to authenticated using (
  auth_papel() in ('admin','assistente')
  or (auth_papel() = 'contador' and contador_id = auth.uid())
) with check (
  auth_papel() in ('admin','assistente')
  or (auth_papel() = 'contador' and contador_id = auth.uid())
);

-- DELETE (eliminação definitiva): apenas admin
create policy clientes_delete on clientes for delete to authenticated using (
  auth_papel() = 'admin'
);

-- atualizado_em automático
create function set_atualizado_em() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
create trigger trg_clientes_atualizado_em
  before update on clientes for each row execute function set_atualizado_em();
```

- [ ] **Step 2: Aplicar a migration**

Run: `npx supabase migration up`
Expected: migration `0003` aplicada.

- [ ] **Step 3: Assert — CHECK tipo×regime bloqueia combinação inválida**

Append em `supabase/tests/rls.test.sql`:
```sql
-- ASSERT 3: PF com regime Simples deve ser rejeitado pelo CHECK
reset role;
do $$
begin
  begin
    insert into clientes (tipo_pessoa, razao_social, cpf_cnpj, regime_tributario)
    values ('PF','Fulano','11111111111','Simples');
    raise exception 'FALHA: CHECK permitiu PF+Simples';
  exception when check_violation then
    raise notice 'OK: CHECK rejeitou PF+Simples';
  end;
end $$;

-- ASSERT 4: contador só enxerga seus clientes
insert into clientes (id, tipo_pessoa, razao_social, cpf_cnpj, regime_tributario, contador_id)
values
 ('aaaaaaaa-0000-0000-0000-000000000001','PJ','Cliente do Contador','11222333000181','Simples','00000000-0000-0000-0000-000000000003'),
 ('aaaaaaaa-0000-0000-0000-000000000002','PJ','Cliente de Outro','11222333000262','Simples','00000000-0000-0000-0000-000000000001')
 on conflict do nothing;
do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000003');  -- contador
  select count(*) into n from clientes;
  if n <> 1 then raise exception 'FALHA: contador viu % clientes (esperado 1)', n; end if;
  raise notice 'OK: contador enxerga apenas o próprio cliente';
end $$;
```

- [ ] **Step 4: Rodar e ver passar**

Run:
```bash
npx supabase db reset
psql -1 "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls.test.sql
```
Expected: `OK: CHECK rejeitou PF+Simples` e `OK: contador enxerga apenas o próprio cliente`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_clientes.sql supabase/tests/rls.test.sql
git commit -m "feat: tabela clientes com CHECK tipo×regime e RLS por papel"
```

---

## Task 5: Tabela `clientes_financeiro` (honorário isolado, sem acesso do Assistente)

Entrega: honorário em tabela 1:1 separada, com RLS que dá acesso a admin/financeiro/contador-dono e **nenhuma policy** para assistente. Marco 4 da §12 (parte sensível).

**Files:**
- Create: `supabase/migrations/0004_clientes_financeiro.sql`
- Modify: `supabase/tests/rls.test.sql`

**Interfaces:**
- Produces: tabela `clientes_financeiro(cliente_id uuid pk→clientes on delete cascade, honorario_mensal numeric, atualizado_por uuid→usuarios, atualizado_em timestamptz)`.

- [ ] **Step 1: Criar a migration**

Create `supabase/migrations/0004_clientes_financeiro.sql`:
```sql
create table clientes_financeiro (
  cliente_id uuid primary key references clientes(id) on delete cascade,
  honorario_mensal numeric(12,2),
  atualizado_por uuid references usuarios(id),
  atualizado_em timestamptz not null default now()
);

alter table clientes_financeiro enable row level security;

-- Assistente NÃO tem policy aqui => não lê nem grava.
create policy fin_select on clientes_financeiro for select to authenticated using (
  auth_papel() in ('admin','financeiro')
  or (auth_papel() = 'contador'
      and exists (select 1 from clientes c
                  where c.id = cliente_id and c.contador_id = auth.uid()))
);
create policy fin_insert on clientes_financeiro for insert to authenticated with check (
  auth_papel() in ('admin','financeiro')
  or (auth_papel() = 'contador'
      and exists (select 1 from clientes c
                  where c.id = cliente_id and c.contador_id = auth.uid()))
);
create policy fin_update on clientes_financeiro for update to authenticated using (
  auth_papel() in ('admin','financeiro')
  or (auth_papel() = 'contador'
      and exists (select 1 from clientes c
                  where c.id = cliente_id and c.contador_id = auth.uid()))
) with check (
  auth_papel() in ('admin','financeiro')
  or (auth_papel() = 'contador'
      and exists (select 1 from clientes c
                  where c.id = cliente_id and c.contador_id = auth.uid()))
);
```

- [ ] **Step 2: Aplicar a migration**

Run: `npx supabase migration up`
Expected: migration `0004` aplicada.

- [ ] **Step 3: Assert — assistente não acessa honorário**

Append em `supabase/tests/rls.test.sql`:
```sql
-- ASSERT 5: assistente lê 0 linhas de clientes_financeiro mesmo havendo dados
reset role;
insert into clientes_financeiro (cliente_id, honorario_mensal)
values ('aaaaaaaa-0000-0000-0000-000000000001', 500.00) on conflict do nothing;
do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000002');  -- assistente
  select count(*) into n from clientes_financeiro;
  if n <> 0 then raise exception 'FALHA: assistente viu % linhas de honorário', n; end if;
  raise notice 'OK: assistente não acessa clientes_financeiro';
end $$;
```

- [ ] **Step 4: Rodar e ver passar**

Run:
```bash
npx supabase db reset
psql -1 "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls.test.sql
```
Expected: `OK: assistente não acessa clientes_financeiro`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_clientes_financeiro.sql supabase/tests/rls.test.sql
git commit -m "feat: clientes_financeiro com honorário isolado (assistente sem acesso)"
```

---

## Task 6: `documentos` + `log_acesso_documento` + Storage com policies

Entrega: tabelas de documentos e log de auditoria (com `ON DELETE SET NULL` no log), bucket privado e policies de `storage.objects` (leitura por join com `documentos`; escrita só service_role). Marco 5 da §12.

**Files:**
- Create: `supabase/migrations/0005_documentos_e_log.sql`, `supabase/migrations/0006_storage.sql`
- Modify: `supabase/tests/rls.test.sql`

**Interfaces:**
- Produces: tabela `documentos(id uuid pk, cliente_id→clientes on delete cascade, nome, tipo, caminho_storage, enviado_por, enviado_em)`; tabela `log_acesso_documento(id, documento_id→documentos on delete set null, usuario_id, acessado_em)`; bucket `documentos`.

- [ ] **Step 1: Criar a migration de documentos + log**

Create `supabase/migrations/0005_documentos_e_log.sql`:
```sql
create table documentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  nome text not null,
  tipo text,
  caminho_storage text not null unique,
  enviado_por uuid references usuarios(id),
  enviado_em timestamptz not null default now()
);
alter table documentos enable row level security;

-- Mesma visibilidade do cliente correspondente
create policy doc_select on documentos for select to authenticated using (
  exists (select 1 from clientes c where c.id = cliente_id)  -- RLS de clientes já filtra
);
create policy doc_insert on documentos for insert to authenticated with check (
  -- financeiro só VÊ documentos (spec §4.2); admin/contador/assistente gerenciam
  auth_papel() in ('admin','contador','assistente')
  and exists (select 1 from clientes c where c.id = cliente_id)
);
create policy doc_delete on documentos for delete to authenticated using (
  auth_papel() = 'admin'
);

create table log_acesso_documento (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid references documentos(id) on delete set null, -- log sobrevive à eliminação
  usuario_id uuid references usuarios(id),
  acessado_em timestamptz not null default now()
);
alter table log_acesso_documento enable row level security;
-- Apenas admin lê o log pela aplicação (gravação é server-side via service_role)
create policy log_select on log_acesso_documento for select to authenticated using (
  auth_papel() = 'admin'
);
```

> Nota sobre `doc_select`: como `clientes` já tem RLS, o `exists` só retorna verdadeiro para clientes visíveis ao usuário corrente — assim o Contador só vê documentos dos seus clientes, sem duplicar a regra.

- [ ] **Step 2: Criar a migration do Storage**

Create `supabase/migrations/0006_storage.sql`:
```sql
-- Bucket privado
insert into storage.buckets (id, name, public)
values ('documentos','documentos', false)
on conflict (id) do nothing;

-- Leitura defensiva: authenticated só lê objeto cujo caminho está vinculado a um documento visível.
create policy storage_documentos_select on storage.objects for select to authenticated using (
  bucket_id = 'documentos'
  and exists (
    select 1 from documentos d where d.caminho_storage = name
  )
);
-- Sem policies de insert/update/delete para authenticated => escrita só via service_role.
```

- [ ] **Step 3: Aplicar as migrations**

Run: `npx supabase migration up`
Expected: migrations `0005` e `0006` aplicadas; bucket `documentos` existe.

- [ ] **Step 4: Assert — log sobrevive à exclusão do documento**

Append em `supabase/tests/rls.test.sql`:
```sql
-- ASSERT 6: ao deletar documento, o log permanece com documento_id nulo
reset role;
insert into documentos (id, cliente_id, nome, caminho_storage)
values ('dddddddd-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','contrato.pdf','aaaaaaaa-0000-0000-0000-000000000001/contrato.pdf')
on conflict do nothing;
insert into log_acesso_documento (documento_id, usuario_id)
values ('dddddddd-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001')
on conflict do nothing;
delete from documentos where id = 'dddddddd-0000-0000-0000-000000000001';
do $$
declare n int;
begin
  select count(*) into n from log_acesso_documento where documento_id is null;
  if n < 1 then raise exception 'FALHA: log não sobreviveu à exclusão do documento'; end if;
  raise notice 'OK: log preservado com documento_id nulo após exclusão';
end $$;
```

- [ ] **Step 5: Rodar e ver passar**

Run:
```bash
npx supabase db reset
psql -1 "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls.test.sql
```
Expected: `OK: log preservado com documento_id nulo após exclusão`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0005_documentos_e_log.sql supabase/migrations/0006_storage.sql supabase/tests/rls.test.sql
git commit -m "feat: documentos + log de auditoria + storage com policies"
```

---

## Task 7: Validações (CPF/CNPJ + schema do cliente) com TDD

Entrega: funções puras de validação de CPF/CNPJ e o schema Zod do cliente (incluindo a regra tipo×regime no app), totalmente testadas. Independe do Supabase.

**Files:**
- Create: `src/lib/validation/documento.ts`, `src/lib/validation/cliente.ts`, `src/lib/tipos.ts`
- Test: `src/tests/validation/documento.test.ts`, `src/tests/validation/cliente.test.ts`

**Interfaces:**
- Produces: `validarCPF(v: string): boolean`, `validarCNPJ(v: string): boolean`, `validarDocumento(tipo: TipoPessoa, v: string): boolean`; `clienteSchema` (Zod); tipos `Papel`, `TipoPessoa`, `RegimeTributario`, `Cliente`.

- [ ] **Step 1: Definir os tipos compartilhados**

Create `src/lib/tipos.ts`:
```ts
export type Papel = 'admin' | 'contador' | 'assistente' | 'financeiro';
export type TipoPessoa = 'PJ' | 'PF' | 'MEI';
export type RegimeTributario = 'Simples' | 'Presumido' | 'Real' | 'MEI' | 'Isento/PF';
export type StatusCliente = 'ativo' | 'inativo';
```

- [ ] **Step 2: Escrever os testes falhos de CPF/CNPJ**

Create `src/tests/validation/documento.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { validarCPF, validarCNPJ, validarDocumento } from '@/lib/validation/documento';

describe('validarCPF', () => {
  it('aceita CPF válido', () => expect(validarCPF('52998224725')).toBe(true));
  it('rejeita CPF inválido', () => expect(validarCPF('11111111111')).toBe(false));
  it('rejeita comprimento errado', () => expect(validarCPF('123')).toBe(false));
});

describe('validarCNPJ', () => {
  it('aceita CNPJ válido', () => expect(validarCNPJ('11222333000181')).toBe(true));
  it('rejeita CNPJ inválido', () => expect(validarCNPJ('11222333000100')).toBe(false));
});

describe('validarDocumento', () => {
  it('PF valida como CPF', () => expect(validarDocumento('PF', '52998224725')).toBe(true));
  it('MEI valida como CNPJ', () => expect(validarDocumento('MEI', '11222333000181')).toBe(true));
  it('PJ valida como CNPJ', () => expect(validarDocumento('PJ', '11222333000181')).toBe(true));
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -- src/tests/validation/documento.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Implementar as validações**

Create `src/lib/validation/documento.ts`:
```ts
import type { TipoPessoa } from '@/lib/tipos';

export function validarCPF(valor: string): boolean {
  const cpf = valor.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (fim: number) => {
    let soma = 0;
    for (let i = 0; i < fim; i++) soma += parseInt(cpf[i]) * (fim + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calc(9) === parseInt(cpf[9]) && calc(10) === parseInt(cpf[10]);
}

export function validarCNPJ(valor: string): boolean {
  const cnpj = valor.replace(/\D/g, '');
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (fim: number) => {
    const pesos = fim === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    let soma = 0;
    for (let i = 0; i < fim; i++) soma += parseInt(cnpj[i]) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calc(12) === parseInt(cnpj[12]) && calc(13) === parseInt(cnpj[13]);
}

export function validarDocumento(tipo: TipoPessoa, valor: string): boolean {
  return tipo === 'PF' ? validarCPF(valor) : validarCNPJ(valor);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- src/tests/validation/documento.test.ts`
Expected: PASS (todos os casos).

- [ ] **Step 6: Escrever o teste falho do schema do cliente**

Create `src/tests/validation/cliente.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { clienteSchema } from '@/lib/validation/cliente';

const base = {
  tipo_pessoa: 'PJ', razao_social: 'Empresa X', cpf_cnpj: '11222333000181',
  regime_tributario: 'Simples',
};

describe('clienteSchema', () => {
  it('aceita PJ + Simples + CNPJ válido', () => {
    expect(clienteSchema.safeParse(base).success).toBe(true);
  });
  it('rejeita PF com regime Simples (tipo×regime)', () => {
    const r = clienteSchema.safeParse({ ...base, tipo_pessoa: 'PF', regime_tributario: 'Simples', cpf_cnpj: '52998224725' });
    expect(r.success).toBe(false);
  });
  it('rejeita CNPJ inválido', () => {
    const r = clienteSchema.safeParse({ ...base, cpf_cnpj: '11222333000100' });
    expect(r.success).toBe(false);
  });
  it('exige razao_social', () => {
    const r = clienteSchema.safeParse({ ...base, razao_social: '' });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `npm test -- src/tests/validation/cliente.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 8: Implementar o schema do cliente**

Create `src/lib/validation/cliente.ts`:
```ts
import { z } from 'zod';
import { validarDocumento } from './documento';

const combinacoes: Record<string, string[]> = {
  PJ: ['Simples', 'Presumido', 'Real'],
  PF: ['Isento/PF'],
  MEI: ['MEI'],
};

export const clienteSchema = z.object({
  tipo_pessoa: z.enum(['PJ', 'PF', 'MEI']),
  razao_social: z.string().min(1, 'Razão social/nome é obrigatório'),
  nome_fantasia: z.string().optional(),
  cpf_cnpj: z.string().min(1, 'CPF/CNPJ é obrigatório'),
  regime_tributario: z.enum(['Simples', 'Presumido', 'Real', 'MEI', 'Isento/PF']),
  inscricao_estadual: z.string().optional(),
  inscricao_municipal: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  telefone: z.string().optional(),
  responsavel_nome: z.string().optional(),
  observacoes: z.string().optional(),
  // Campos persistidos que vêm do formulário — sem eles o Zod os descarta no insert.
  contador_id: z.string().uuid('Selecione um contador').optional().or(z.literal('')),
  data_inicio: z.string().optional().or(z.literal('')),
  status: z.enum(['ativo', 'inativo']).optional(),
  // endereco (jsonb) é montado à parte na action a partir de campos planos do form
  // (logradouro, numero, bairro, cidade, uf, cep) — não vem como string crua aqui.
}).refine(
  (d) => validarDocumento(d.tipo_pessoa, d.cpf_cnpj),
  { path: ['cpf_cnpj'], message: 'CPF/CNPJ inválido para o tipo selecionado' }
).refine(
  (d) => combinacoes[d.tipo_pessoa]?.includes(d.regime_tributario),
  { path: ['regime_tributario'], message: 'Regime incompatível com o tipo de pessoa' }
);

export type ClienteInput = z.infer<typeof clienteSchema>;
```

- [ ] **Step 9: Rodar e ver passar**

Run: `npm test -- src/tests/validation/cliente.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/tipos.ts src/lib/validation/ src/tests/validation/
git commit -m "feat: validação de CPF/CNPJ e schema do cliente (tipo×regime)"
```

---

## Task 8: Clients Supabase (browser/server/admin) + middleware de sessão

Entrega: os três pontos de acesso ao Supabase no Next e o middleware que mantém a sessão viva. Marco 1 da §12 (integração).

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`, `src/proxy.ts` (Next 16: era `middleware.ts`)

**Interfaces:**
- Produces: `createBrowserSupabase()`, `createServerSupabase()` (async, lê cookies), `createAdminSupabase()` (service_role, server-only).

- [ ] **Step 1: Client do navegador**

Create `src/lib/supabase/client.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr';

export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 2: Client de servidor (cookies)**

Create `src/lib/supabase/server.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch { /* chamado de Server Component: ignorar, middleware renova */ }
        },
      },
    },
  );
}
```

- [ ] **Step 3: Client admin (service_role, server-only)**

Create `src/lib/supabase/admin.ts`:
```ts
import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function createAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
```
Run: `npm install server-only`

- [ ] **Step 4: Proxy de refresh de sessão**

> **Next 16:** a convenção `middleware.ts` foi renomeada para **`proxy.ts`**, e a função
> exportada é **`proxy`** (não `middleware`). O conteúdo é idêntico ao padrão do @supabase/ssr.

Create `src/proxy.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  await supabase.auth.getUser(); // renova o token
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)'],
};
```

- [ ] **Step 5: Verificar build**

Run: `npm run build`
Expected: build conclui sem erro de tipos.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/ src/proxy.ts package.json
git commit -m "feat: clients Supabase (browser/server/admin) + proxy de sessão"
```

---

## Task 9: Login + recuperação de senha + guarda de rotas

Entrega: tela de login funcional, server actions de entrar/recuperar senha, e o layout autenticado que bloqueia acesso sem sessão. Marco 2 da §12 (UI auth).

**Files:**
- Create: `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/app/(app)/layout.tsx`
- Modify: `src/app/page.tsx` (redirecionar para `/login` ou `/` conforme sessão)

**Interfaces:**
- Consumes: `createServerSupabase()`.
- Produces: rota `/login`; layout `(app)` que exige sessão e expõe o usuário/papel aos filhos.

- [ ] **Step 1: Server actions de autenticação**

Create `src/app/login/actions.ts`:
```ts
'use server';
import { createServerSupabase } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export async function entrar(_prev: unknown, formData: FormData) {
  const email = String(formData.get('email'));
  const senha = String(formData.get('senha'));
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) return { erro: 'E-mail ou senha inválidos.' };
  redirect('/');
}

export async function recuperarSenha(_prev: unknown, formData: FormData) {
  const email = String(formData.get('email'));
  const supabase = await createServerSupabase();
  await supabase.auth.resetPasswordForEmail(email);
  return { mensagem: 'Se o e-mail existir, enviaremos instruções de recuperação.' };
}
```

- [ ] **Step 2: Tela de login**

Create `src/app/login/page.tsx`:
```tsx
'use client';
import { useActionState } from 'react';
import { entrar } from './actions';

export default function LoginPage() {
  // Next 15 / React 19: useActionState (de 'react'), não o antigo useFormState (de 'react-dom').
  const [estado, action] = useActionState(entrar, {} as { erro?: string });
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50">
      <form action={action} className="w-80 space-y-4 rounded-xl bg-white p-8 shadow">
        <h1 className="text-xl font-semibold text-center">CRM Contábil</h1>
        <input name="email" type="email" placeholder="E-mail" required
               className="w-full rounded border px-3 py-2" />
        <input name="senha" type="password" placeholder="Senha" required
               className="w-full rounded border px-3 py-2" />
        {estado?.erro && <p className="text-sm text-red-600">{estado.erro}</p>}
        <button className="w-full rounded bg-slate-900 py-2 text-white">Entrar</button>
        <a href="/login/recuperar" className="block text-center text-sm text-slate-500">
          Esqueci minha senha
        </a>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Layout autenticado com guarda**

Create `src/app/(app)/layout.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { Sidebar } from '@/components/Sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('usuarios').select('nome, papel').eq('id', user.id).single();
  if (!perfil) redirect('/login');

  return (
    <div className="flex min-h-screen">
      <Sidebar papel={perfil.papel} />
      <main className="flex-1 bg-slate-50 p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Sidebar mínima (placeholder com navegação real)**

Create `src/components/Sidebar.tsx`:
```tsx
import type { Papel } from '@/lib/tipos';

export function Sidebar({ papel }: { papel: Papel }) {
  return (
    <aside className="w-56 bg-slate-900 p-4 text-slate-100">
      <p className="mb-6 font-semibold">CRM Contábil</p>
      <nav className="space-y-1 text-sm">
        <a href="/" className="block rounded px-2 py-1 hover:bg-slate-800">Início</a>
        <a href="/clientes" className="block rounded px-2 py-1 hover:bg-slate-800">Clientes</a>
        {papel === 'admin' && (
          <a href="/usuarios" className="block rounded px-2 py-1 hover:bg-slate-800">Usuários</a>
        )}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 5: Mover o dashboard para o grupo (app)**

> **Limpeza de boilerplate (revisão da Task 1):** o `src/app/page.tsx` atual é o boilerplate do
> create-next-app e referencia `/next.svg` etc. Ao mover, **reescreva** o conteúdo (não só mova) e
> remova os assets boilerplate (`public/*.svg`, `favicon.ico` boilerplate) de forma coordenada — não
> deixe referência órfã a `/next.svg`. **Mantenha `public/` não-vazio** (ex.: um `.gitkeep`), senão o
> `COPY /app/public ./public` do Dockerfile falha o build.

Move `src/app/page.tsx` → `src/app/(app)/page.tsx` e substitua o conteúdo por um placeholder temporário:
```tsx
export default function Dashboard() {
  return <h1 className="text-2xl font-semibold">Dashboard</h1>;
}
```

- [ ] **Step 6: Verificação manual do fluxo de login**

Run (com Supabase local de pé e `.env.local` preenchido): `npm run dev`
Manual:
1. Acessar `http://localhost:3000/` → deve redirecionar para `/login`.
2. Criar um usuário de teste no Supabase Studio local (Auth) e logar.
3. Após login, deve ver "Dashboard" e a sidebar.
Expected: redirecionamento sem sessão; acesso com sessão.

- [ ] **Step 7: Commit**

```bash
git add src/app/login src/app/\(app\) src/components/Sidebar.tsx
git rm src/app/page.tsx 2>/dev/null || true
git commit -m "feat: login, recuperação de senha e guarda de rotas autenticadas"
```

---

## Task 10: Módulo Clientes (lista + busca/filtros + ficha + CRUD)

Entrega: listar/buscar/filtrar clientes, criar/editar via formulário em abas, e gravar honorário separado conforme o papel. Marco 4 da §12 (UI).

**Files:**
- Create: `src/app/(app)/clientes/page.tsx`, `src/app/(app)/clientes/novo/page.tsx`, `src/app/(app)/clientes/[id]/page.tsx`, `src/app/(app)/clientes/actions.ts`
- Create: `src/components/TabelaClientes.tsx`, `src/components/FormCliente.tsx`

**Interfaces:**
- Consumes: `createServerSupabase()`, `clienteSchema`, tipos.
- Produces: server actions `criarCliente`, `atualizarCliente`, `inativarCliente`, `salvarHonorario`.

- [ ] **Step 1: Server actions de cliente**

Create `src/app/(app)/clientes/actions.ts`:
```ts
'use server';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { clienteSchema } from '@/lib/validation/cliente';

// Campos não-textuais (uuid/date): string vazia precisa virar null, senão o Postgres
// rejeita com 22P02 (invalid input syntax). Aplicar antes de todo insert/update.
function limparOpcionais<T extends Record<string, unknown>>(d: T): T {
  const out: Record<string, unknown> = { ...d };
  for (const k of ['contador_id', 'data_inicio']) {
    if (out[k] === '' || out[k] === undefined) out[k] = null;
  }
  return out as T;
}

export async function criarCliente(_prev: unknown, formData: FormData) {
  const dados = Object.fromEntries(formData) as Record<string, string>;
  const parsed = clienteSchema.safeParse(dados);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0].message };
  }
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('clientes').insert({
    ...limparOpcionais(parsed.data), criado_por: user!.id,
  });
  if (error) {
    if (error.code === '23505') {
      // CPF/CNPJ já existe — spec §7: se for inativo (e visível ao usuário), oferecer reativação.
      // A consulta respeita a RLS: um contador pode não enxergar cliente de outro contador.
      const { data: existente } = await supabase.from('clientes')
        .select('id, status').eq('cpf_cnpj', parsed.data.cpf_cnpj).single();
      if (existente?.status === 'inativo') {
        return { erro: 'CPF/CNPJ já cadastrado em um cliente INATIVO.', reativarId: existente.id };
      }
      if (existente?.status === 'ativo') {
        return { erro: 'CPF/CNPJ já cadastrado em um cliente ativo.' };
      }
      // existente == null: a linha existe (violou unique) mas não é visível por RLS — não afirmar status
      return { erro: 'CPF/CNPJ já cadastrado. Procure um administrador.' };
    }
    return { erro: 'Não foi possível salvar o cliente.' };
  }
  revalidatePath('/clientes');
  return { ok: true };
}

export async function reativarCliente(clienteId: string) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('clientes')
    .update({ status: 'ativo' }).eq('id', clienteId);
  if (error) return { erro: 'Não foi possível reativar.' };
  revalidatePath('/clientes');
  return { ok: true };
}

export async function salvarHonorario(clienteId: string, valor: number) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  // RLS barra automaticamente quem não pode (ex.: assistente) — erro tratado abaixo
  const { error } = await supabase.from('clientes_financeiro').upsert({
    cliente_id: clienteId, honorario_mensal: valor, atualizado_por: user!.id,
  });
  if (error) return { erro: 'Sem permissão para alterar honorário.' };
  return { ok: true };
}

export async function atualizarCliente(clienteId: string, _prev: unknown, formData: FormData) {
  const dados = Object.fromEntries(formData) as Record<string, string>;
  const parsed = clienteSchema.safeParse(dados);
  if (!parsed.success) return { erro: parsed.error.issues[0].message };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('clientes').update(limparOpcionais(parsed.data)).eq('id', clienteId);
  if (error) {
    if (error.code === '23505') return { erro: 'CPF/CNPJ já cadastrado em outro cliente.' };
    return { erro: 'Não foi possível atualizar o cliente.' };
  }
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

export async function inativarCliente(clienteId: string) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('clientes')
    .update({ status: 'inativo' }).eq('id', clienteId);
  if (error) return { erro: 'Não foi possível inativar.' };
  revalidatePath('/clientes');
  return { ok: true };
}
```

- [ ] **Step 2: Lista de clientes com busca/filtros**

Create `src/app/(app)/clientes/page.tsx`:
```tsx
import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';

export default async function ClientesPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q, status } = await searchParams;
  const supabase = await createServerSupabase();
  let query = supabase.from('clientes')
    .select('id, razao_social, cpf_cnpj, regime_tributario, status')
    .order('atualizado_em', { ascending: false });
  if (q) query = query.ilike('razao_social', `%${q}%`);
  if (status) query = query.eq('status', status);
  const { data: clientes } = await query;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <Link href="/clientes/novo" className="rounded bg-slate-900 px-3 py-2 text-sm text-white">
          + Novo cliente
        </Link>
      </div>
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar por nome"
               className="rounded border px-3 py-2 text-sm" />
        <select name="status" defaultValue={status} className="rounded border px-2 text-sm">
          <option value="">Todos</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
        </select>
        <button className="rounded border px-3 text-sm">Filtrar</button>
      </form>
      <table className="w-full bg-white text-sm shadow rounded overflow-hidden">
        <thead className="bg-slate-100 text-left">
          <tr><th className="p-2">Nome</th><th className="p-2">CPF/CNPJ</th>
              <th className="p-2">Regime</th><th className="p-2">Status</th></tr>
        </thead>
        <tbody>
          {clientes?.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="p-2"><Link href={`/clientes/${c.id}`} className="text-slate-900 underline">{c.razao_social}</Link></td>
              <td className="p-2">{c.cpf_cnpj}</td>
              <td className="p-2">{c.regime_tributario}</td>
              <td className="p-2">{c.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Formulário de novo cliente**

Create `src/components/FormCliente.tsx` (campos das abas Cadastrais/Contato/Gestão) e `src/app/(app)/clientes/novo/page.tsx` que usa `criarCliente`. O formulário (client component) usa `useActionState(criarCliente, {})` (de `'react'`, não `useFormState`), inputs com `name` batendo as chaves do `clienteSchema` (incluindo `<select name="contador_id">` populado via prop com a lista de contadores carregada no server component pai). Exibir `estado.erro` em vermelho. Após `ok`, redirecionar para `/clientes`.

```tsx
// src/app/(app)/clientes/novo/page.tsx
import { createServerSupabase } from '@/lib/supabase/server';
import { FormCliente } from '@/components/FormCliente';

export default async function NovoCliente() {
  const supabase = await createServerSupabase();
  const { data: contadores } = await supabase
    .from('usuarios').select('id, nome').eq('papel', 'contador').eq('ativo', true);
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Novo cliente</h1>
      <FormCliente contadores={contadores ?? []} />
    </div>
  );
}
```

- [ ] **Step 4: Ficha do cliente (abas + honorário condicional)**

Create `src/app/(app)/clientes/[id]/page.tsx`: server component que carrega o cliente; **tenta** carregar `clientes_financeiro` (se a query retornar vazio/erro de permissão, simplesmente não exibe a aba de honorário — o RLS já garante a proteção, então isto é só UX). Renderiza `FormCliente` em modo edição e, quando houver honorário acessível, a aba "Honorário" com `salvarHonorario`.

- [ ] **Step 5: Verificação manual**

Run: `npm run dev`
Manual (logado como admin):
1. `/clientes` → lista vazia, botão "+ Novo cliente".
2. Criar um cliente PJ + Simples + CNPJ válido → aparece na lista.
3. Tentar CNPJ inválido → mensagem de erro.
4. Abrir a ficha → editar nome → salvar.
5. Logar como assistente (criar usuário de teste) → ficha do cliente **não** mostra honorário.
Expected: todos os comportamentos conforme descrito.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/clientes src/components/FormCliente.tsx src/components/TabelaClientes.tsx
git commit -m "feat: módulo Clientes (lista, busca, ficha, CRUD, honorário condicional)"
```

---

## Task 11: Dashboard (números-resumo + atividade recente + atalhos)

Entrega: a tela inicial com os cards de resumo, lista de atividade recente e atalhos. Marco 6 da §12.

**Files:**
- Modify: `src/app/(app)/page.tsx`
- Create: `src/components/CardResumo.tsx`

**Interfaces:**
- Consumes: `createServerSupabase()`.

- [ ] **Step 1: Card de resumo**

Create `src/components/CardResumo.tsx`:
```tsx
export function CardResumo({ titulo, valor }: { titulo: string; valor: number | string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow">
      <p className="text-sm text-slate-500">{titulo}</p>
      <p className="text-2xl font-semibold">{valor}</p>
    </div>
  );
}
```

- [ ] **Step 2: Dashboard com dados reais**

Replace `src/app/(app)/page.tsx`:
```tsx
import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';
import { CardResumo } from '@/components/CardResumo';

export default async function Dashboard() {
  const supabase = await createServerSupabase();
  const [{ count: total }, { count: ativos }, { data: recentes }] = await Promise.all([
    supabase.from('clientes').select('*', { count: 'exact', head: true }),
    supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('status', 'ativo'),
    supabase.from('clientes').select('id, razao_social, atualizado_em')
      .order('atualizado_em', { ascending: false }).limit(5),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Início</h1>
        <Link href="/clientes/novo" className="rounded bg-slate-900 px-3 py-2 text-sm text-white">
          + Novo cliente
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <CardResumo titulo="Total de clientes" valor={total ?? 0} />
        <CardResumo titulo="Ativos" valor={ativos ?? 0} />
        <CardResumo titulo="Inativos" valor={(total ?? 0) - (ativos ?? 0)} />
      </div>
      <div className="rounded-xl bg-white p-4 shadow">
        <h2 className="mb-2 font-semibold">Atividade recente</h2>
        <ul className="space-y-1 text-sm">
          {recentes?.map((c) => (
            <li key={c.id} className="flex justify-between">
              <Link href={`/clientes/${c.id}`} className="underline">{c.razao_social}</Link>
              <span className="text-slate-400">
                {new Date(c.atualizado_em).toLocaleDateString('pt-BR')}
              </span>
            </li>
          ))}
          {!recentes?.length && <li className="text-slate-400">Nenhuma atividade ainda.</li>}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificação manual**

Run: `npm run dev`
Manual: logar e acessar `/` → ver 3 cards com contagens corretas e os 5 clientes mais recentes; "+ Novo cliente" leva ao formulário.
Expected: números batem com a lista de clientes.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/page.tsx src/components/CardResumo.tsx
git commit -m "feat: dashboard com números-resumo, atividade recente e atalhos"
```

---

## Task 12: Gestão de usuários (convite + papel) via service_role + seed do Admin

Entrega: tela só-admin para convidar usuários, ativar/desativar e alterar papel, com tudo rodando server-side com `service_role`; e a migration de seed do primeiro Admin. Marcos 2 e 3 da §12.

**Files:**
- Create: `src/app/(app)/usuarios/page.tsx`, `src/app/(app)/usuarios/actions.ts`
- Create: `supabase/migrations/0007_seed_admin.sql`
- Modify: `README.md` (passo de bootstrap)

**Interfaces:**
- Consumes: `createAdminSupabase()`, `createServerSupabase()`.
- Produces: server actions `convidarUsuario`, `alterarPapel`, `definirAtivo`.

- [ ] **Step 1: Server actions de usuários (service_role + checagem de admin)**

Create `src/app/(app)/usuarios/actions.ts`:
```ts
'use server';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import type { Papel } from '@/lib/tipos';

async function exigirAdmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sem sessão');
  const { data: perfil } = await supabase
    .from('usuarios').select('papel').eq('id', user.id).single();
  if (perfil?.papel !== 'admin') throw new Error('Apenas administradores');
}

export async function convidarUsuario(_prev: unknown, formData: FormData) {
  await exigirAdmin();
  const email = String(formData.get('email'));
  const nome = String(formData.get('nome'));
  const papel = String(formData.get('papel')) as Papel;
  if (!['admin','contador','assistente','financeiro'].includes(papel)) {
    return { erro: 'Papel inválido.' };
  }
  const admin = createAdminSupabase();
  const { data: criado, error: errCreate } = await admin.auth.admin.createUser({
    email,
    email_confirm: false,
    app_metadata: { papel, nome }, // mantido como registro do papel pretendido
  });
  if (errCreate || !criado?.user) return { erro: 'Não foi possível criar (e-mail já existe?).' };

  // CRÍTICO (validado no bootstrap do admin): o GoTrue popula app_metadata DEPOIS
  // do INSERT em auth.users, então o trigger handle_new_user (AFTER INSERT) cria o
  // perfil com o papel padrão 'assistente'. NÃO confiar no trigger para o papel:
  // defini-lo EXPLICITAMENTE aqui via service_role após a criação.
  const { error: errPapel } = await admin
    .from('usuarios')
    .update({ papel, nome, ativo: true })
    .eq('id', criado.user.id);
  if (errPapel) return { erro: 'Usuário criado, mas falha ao definir o papel.' };

  // ATENÇÃO (resolver junto da decisão de SMTP §11.1): generateLink GERA e RETORNA o link
  // (data.properties.action_link) — com SMTP configurado no Supabase ele dispara o e-mail de
  // convite; SEM SMTP, é preciso enviar o action_link você mesmo (ou trocar por
  // inviteUserByEmail). Não retorne { ok:true } sem confirmar a entrega no Step 6.
  const { data: link, error: errInvite } =
    await admin.auth.admin.generateLink({ type: 'invite', email });
  if (errInvite) return { erro: 'Usuário criado, mas falha ao gerar o convite por e-mail.' };
  // TODO §11.1: se o SMTP do Supabase não enviar automaticamente, despachar link.properties.action_link.

  revalidatePath('/usuarios');
  return { ok: true };
}

export async function alterarPapel(usuarioId: string, papel: Papel) {
  await exigirAdmin();
  const admin = createAdminSupabase();
  const { error } = await admin.from('usuarios').update({ papel }).eq('id', usuarioId);
  if (error) return { erro: 'Falha ao alterar papel.' };
  revalidatePath('/usuarios');
  return { ok: true };
}

export async function definirAtivo(usuarioId: string, ativo: boolean) {
  await exigirAdmin();
  const admin = createAdminSupabase();
  const { error } = await admin.from('usuarios').update({ ativo }).eq('id', usuarioId);
  if (error) return { erro: 'Falha ao atualizar status.' };
  revalidatePath('/usuarios');
  return { ok: true };
}
```

> Nota: `alterarPapel`/`definirAtivo` usam o client **admin** (service_role) — que bypassa RLS e o trigger só congela quando `auth.uid() is not null`; como o service_role tem `auth.uid()` nulo, a alteração é permitida. Confirma a interação descrita no spec §5.1.

- [ ] **Step 2: Tela de gestão de usuários (só admin)**

Create `src/app/(app)/usuarios/page.tsx`: server component que primeiro checa o papel (redireciona se não-admin), lista `usuarios` (via client admin, já que a RLS não permite listar todos por `authenticated`), e renderiza um formulário de convite (`convidarUsuario`) + a tabela com selects de papel (`alterarPapel`) e botão ativar/desativar (`definirAtivo`).

```tsx
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

export default async function UsuariosPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: eu } = await supabase.from('usuarios').select('papel').eq('id', user!.id).single();
  if (eu?.papel !== 'admin') redirect('/');

  const admin = createAdminSupabase();
  const { data: usuarios } = await admin.from('usuarios')
    .select('id, nome, email, papel, ativo').order('criado_em');
  // ...render do formulário de convite + tabela (selects de papel, toggle ativo)
  return <pre>{JSON.stringify(usuarios, null, 2)}</pre>; // substituir por UI real
}
```

- [ ] **Step 3: Seed do primeiro Admin (idempotente)**

Create `supabase/migrations/0007_seed_admin.sql`:
```sql
-- O primeiro Admin é criado manualmente no Auth (ver README). Esta migration apenas
-- GARANTE que, se existir um auth.users com o e-mail do fundador, o papel seja admin.
-- Idempotente: roda sem efeito se o usuário ainda não existir.
do $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = 'pedro@gomesadvocacia.com.br';
  if v_id is not null then
    insert into usuarios (id, nome, email, papel)
    values (v_id, 'Pedro Gomes', 'pedro@gomesadvocacia.com.br', 'admin')
    on conflict (id) do update set papel = 'admin';
  end if;
end $$;
```

- [ ] **Step 4: Documentar o bootstrap no README**

Append no `README.md` seção "Bootstrap do primeiro Admin":
1. Criar o usuário fundador no Supabase (Studio → Auth → Add user, com e-mail/senha).
2. Rodar `npx supabase migration up` (a 0007 promove esse e-mail a `admin`).
3. Logar e usar a tela `/usuarios` para convidar o resto da equipe.

- [ ] **Step 5: Aplicar a migration e verificar**

Run: `npx supabase migration up`
Manual: criar o usuário fundador no Studio, reaplicar, e confirmar `select papel from usuarios where email='pedro@gomesadvocacia.com.br'` → `admin`.
Expected: papel `admin`.

- [ ] **Step 6: Verificação manual da gestão de usuários**

Manual (logado como admin): `/usuarios` → convidar um e-mail com papel `financeiro` → conferir no Studio que o convite saiu e, ao aceitar, `usuarios` recebe papel `financeiro`. Logado como não-admin → `/usuarios` redireciona para `/`.
Expected: conforme descrito.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/usuarios supabase/migrations/0007_seed_admin.sql README.md
git commit -m "feat: gestão de usuários (convite/papel via service_role) + seed do Admin"
```

---

## Task 13: Documentos do cliente (upload + download com URL assinada e log)

Entrega: anexar documentos a um cliente (upload server-side com service_role) e baixar via URL assinada, registrando o acesso no log. Marco 5 da §12 (UI/handlers).

**Files:**
- Create: `src/app/(app)/documentos/actions.ts`
- Modify: `src/app/(app)/clientes/[id]/page.tsx` (aba Documentos)

**Interfaces:**
- Consumes: `createServerSupabase()`, `createAdminSupabase()`.
- Produces: server actions `anexarDocumento`, `gerarLinkDownload`, `excluirDocumento`.

- [ ] **Step 1: Server actions de documentos**

Create `src/app/(app)/documentos/actions.ts`:
```ts
'use server';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

const TIPOS_OK = ['application/pdf', 'image/png', 'image/jpeg'];
const MAX_BYTES = 10 * 1024 * 1024;

export async function anexarDocumento(clienteId: string, formData: FormData) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  // Verifica que o usuário enxerga o cliente (RLS) antes de subir
  const { data: cli } = await supabase.from('clientes').select('id').eq('id', clienteId).single();
  if (!cli) return { erro: 'Cliente não encontrado ou sem permissão.' };

  const file = formData.get('arquivo') as File;
  if (!file || file.size === 0) return { erro: 'Selecione um arquivo.' };
  if (file.size > MAX_BYTES) return { erro: 'Arquivo acima de 10 MB.' };
  if (!TIPOS_OK.includes(file.type)) return { erro: 'Tipo não permitido (PDF/PNG/JPG).' };

  // caminho_storage === name do objeto em storage.objects (SEM o prefixo do bucket).
  // A policy de SELECT do storage compara storage.objects.name = documentos.caminho_storage.
  const caminho = `${clienteId}/${Date.now()}-${file.name}`;
  const admin = createAdminSupabase();
  const up = await admin.storage.from('documentos')
    .upload(caminho, file, { contentType: file.type });
  if (up.error) return { erro: 'Falha no upload.' };

  await admin.from('documentos').insert({
    cliente_id: clienteId, nome: file.name, tipo: String(formData.get('tipo') ?? ''),
    caminho_storage: caminho, enviado_por: user!.id,
  });
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

export async function gerarLinkDownload(documentoId: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  // RLS garante que só vê doc de cliente visível
  const { data: doc } = await supabase.from('documentos')
    .select('caminho_storage').eq('id', documentoId).single();
  if (!doc) return { erro: 'Sem permissão.' };

  const admin = createAdminSupabase();
  // registra o acesso ANTES de devolver o link (server-side, não burlável)
  await admin.from('log_acesso_documento').insert({ documento_id: documentoId, usuario_id: user!.id });
  const { data: signed } = await admin.storage.from('documentos')
    .createSignedUrl(doc.caminho_storage, 60);
  return { url: signed?.signedUrl };
}

export async function excluirDocumento(documentoId: string, clienteId: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: eu } = await supabase.from('usuarios').select('papel').eq('id', user!.id).single();
  if (eu?.papel !== 'admin') return { erro: 'Apenas administradores excluem documentos.' };

  const admin = createAdminSupabase();
  const { data: doc } = await admin.from('documentos')
    .select('caminho_storage').eq('id', documentoId).single();
  if (doc) {
    // ordem: Storage primeiro, depois DB (evita arquivo órfão); log sobrevive (SET NULL)
    await admin.storage.from('documentos').remove([doc.caminho_storage]);
    await admin.from('documentos').delete().eq('id', documentoId);
  }
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
```

- [ ] **Step 2: Aba Documentos na ficha do cliente**

Modify `src/app/(app)/clientes/[id]/page.tsx`: adicionar a aba "Documentos" que lista `documentos` do cliente, um `<form>` de upload e um botão "Baixar"/"Excluir".

Detalhes de binding (importante — `anexarDocumento(clienteId, formData)` tem 2 args, mas `<form action>` só passa `formData`):
- No componente, bindar o id: `<form action={anexarDocumento.bind(null, cliente.id)}>` com `<input type="file" name="arquivo" />` e `<select name="tipo">`. (Server Actions já recebem `multipart/form-data`; não precisa de `encType` manual.)
- "Baixar": botão que chama `gerarLinkDownload(doc.id)` e faz `window.open(res.url)` (client component pequeno).
- "Excluir" (só admin): `excluirDocumento.bind(null, doc.id, cliente.id)`.

**Notas de implementação da Task 10 (registradas na revisão do código):**
- **Endereço:** o `clienteSchema` não inclui os campos planos de endereço (logradouro/número/bairro/cidade/UF/CEP) — o Zod os descartaria. Na `criarCliente`/`atualizarCliente`, montar `endereco` (jsonb) a partir desses campos do `formData` ANTES do `safeParse` (ou adicioná-los ao schema e compor o objeto na action). Sem isso, o endereço é silenciosamente perdido.
- **`status` no form:** o `<select name="status">` da ficha deve emitir só `ativo`/`inativo` — nunca `value=""` (string vazia em coluna enum dá Postgres 22P02). Na criação, simplesmente não enviar `status` (a coluna tem `default 'ativo'`). `limparOpcionais` cuida de `contador_id`/`data_inicio`, mas NÃO deve setar `status` para null (a coluna é NOT NULL com default).
- **Edição:** `atualizarCliente(clienteId, _prev, formData)` tem 3 args — no `FormCliente` em modo edição, usar `atualizarCliente.bind(null, cliente.id)` com `useActionState`.
- **Normalizar `cpf_cnpj` (unicidade):** o banco tem `unique` em `cpf_cnpj` como texto. Gravar **só os dígitos** (`valor.replace(/\D/g, "")`) na action, senão "11.222.333/0001-81" e "11222333000181" viram registros distintos e a unicidade é burlável. Aplicar antes do insert/update (a busca por CNPJ inativo na reativação também usa dígitos).
- **`email` vazio → null:** estender `limparOpcionais` para mapear `email: ""` → `null` (a coluna é nullable; evita gravar string vazia). `contador_id`/`data_inicio` já são tratados.
- **Auditoria server-side:** `criado_por`/`contador_id` são forçados/congelados por trigger no banco (migration 0007) — a action pode enviar, mas o banco é a autoridade (contador não reatribui; só Admin).

- [ ] **Step 3: Verificação manual**

Run: `npm run dev`
Manual (admin): abrir ficha de um cliente → anexar um PDF → ver na lista → baixar (abre o arquivo) → conferir no Studio que `log_acesso_documento` ganhou uma linha → excluir o documento → conferir que o arquivo sumiu do Storage e a linha do log permaneceu com `documento_id` nulo. Tentar anexar arquivo > 10 MB → erro.
Expected: conforme descrito.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/documentos src/app/\(app\)/clientes/\[id\]/page.tsx
git commit -m "feat: documentos do cliente (upload, download assinado + log, exclusão)"
```

---

## Task 14: Deploy no EasyPanel + verificação ponta a ponta

Entrega: app no ar no EasyPanel apontando para o Supabase de produção, com env corretas e o fluxo principal validado em produção. Marco 1 da §12 (deploy final).

**Files:** nenhum novo (configuração de plataforma + verificação).

- [ ] **Step 1: Criar o projeto Supabase de produção e aplicar migrations**

Run:
```bash
npx supabase link --project-ref <ref-do-projeto>
npx supabase db push   # aplica todas as migrations no projeto de produção
```
Expected: migrations 0001–0007 aplicadas em produção.

- [ ] **Step 2: Criar o app no EasyPanel**

Manual no EasyPanel:
1. Novo serviço → App → fonte: este repositório Git (ou imagem via Dockerfile).
2. Build: Dockerfile. Definir **build args/env** `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (produção).
3. Runtime env: `SUPABASE_SERVICE_ROLE_KEY` (produção) — marcado como secreto.
4. Porta 3000; health check em `/api/health`.
5. Domínio + HTTPS.

- [ ] **Step 2b: Configurar URLs de Auth no Supabase**

Manual no Supabase (Auth → URL Configuration): definir Site URL e Redirect URLs para o domínio do EasyPanel (necessário para reset de senha e convites funcionarem).

- [ ] **Step 3: Bootstrap do Admin em produção**

Manual: criar o usuário fundador no Auth de produção e rodar a promoção (0007 já aplicada; se o usuário foi criado depois, reaplicar o bloco de seed ou promover via Studio).

- [ ] **Step 4: Verificação ponta a ponta em produção**

Manual no domínio público:
1. `/api/health` → `{"status":"ok"}`.
2. Login como admin.
3. Convidar um usuário (conferir e-mail de convite).
4. Cadastrar um cliente, anexar documento, baixar (gera log), inativar.
5. Logar como assistente → confirmar honorário invisível.
Expected: todos os critérios de sucesso da §1 do spec satisfeitos em produção.

- [ ] **Step 5: Commit (marcação de release)**

```bash
git tag -a v0.1.0-fase1 -m "Fase 1 (Fundação) no ar"
git commit --allow-empty -m "chore: Fase 1 implantada no EasyPanel"
```

---

## Notas finais de execução

- **Ordem das migrations importa.** Se a CLI acusar recursão de RLS na Task 2 (subquery direta em `usuarios`), trocar a subquery do trigger por `auth_papel()` e mover a criação de `auth_papel()` para antes (renumerar 0001/0002).
- **Testes de RLS são a rede de segurança principal** desta fase — rode `supabase/tests/rls.test.sql` após qualquer mudança de policy.
- **Decisões em aberto do spec (§11)** a confirmar com o usuário durante a execução: provedor de e-mail (SMTP), domínio, expiração de sessão, e se o Assistente pode reatribuir `contador_id` (Task 10 — hoje a RLS permite; se for restringir a Admin, mover a edição de `contador_id` para uma action que cheque papel).
