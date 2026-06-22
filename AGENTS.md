<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Projeto CRM Contábil — convenções

- **Stack:** Next.js 16 (App Router) + TypeScript + Tailwind 4 · Supabase (Auth/Postgres/RLS/Storage) · deploy EasyPanel.
- **Next 16 — atenção:** a convenção `middleware.ts` virou **`proxy.ts`** (função `proxy`).
- **Imports:** use o alias `@/*` (mapeia `./src/*`).
- **Imagens:** use `next/image`, nunca `<img>`.
- **Segredos:** `SUPABASE_SERVICE_ROLE_KEY` é runtime, só no servidor; nunca `NEXT_PUBLIC_`. As `NEXT_PUBLIC_*` são inlined no build.
- **Papel (RBAC) — fonte única:** o papel vive **só** em `usuarios.papel`, lido via `auth_papel()`.
  **NUNCA** ler papel de `session.user.app_metadata` nem do JWT — o GoTrue popula `app_metadata`
  depois do INSERT, então o trigger `handle_new_user` cria o perfil como `assistente` e o papel real
  é definido **server-side via service_role** após `createUser` (bootstrap e convites/Task 12). O
  `app_metadata.papel` é decorativo/desatualizado — não confiar nele.
- **Comandos:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`, `npm run build`. Rode todos antes de commitar.
- **Banco / migrations:** sem Docker local. A fonte de verdade do schema/policies são os
  arquivos `supabase/migrations/NNNN_*.sql`, aplicados pelo **runner próprio** `npm run db:migrate`
  (rastreia em `app_migrations`). **NÃO** usar `supabase db push` (usaria outra tabela de controle e
  conflitaria). Testes de RLS: `npm run db:test` (exige Session pooler em `SUPABASE_DB_URL`).
  - Migrations já aplicadas são **imutáveis** (não editar — o runner não as reaplica). Mudança =
    nova migration com `create or replace` / `drop ... if exists`.
  - Novas migrations devem ser **idempotentes** quando possível (`create table if not exists`,
    `drop policy if exists ... ; create policy ...`).
- **Docs do projeto:** `docs/superpowers/specs/` (design) e `docs/superpowers/plans/` (plano).
