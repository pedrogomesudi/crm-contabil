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
  O CI (`.github/workflows/ci.yml`, job **`verify`**) roda exatamente esses + `format:check`, em todo push
  para `main`/`develop` e em todo PR. O que falha aqui falha lá — rodar antes é o barato.
- **Git — o `main` é protegido:** não aceita push direto (**nem de admin**), force-push nem deleção.
  Trabalhe em `develop` (ou `feat/*` a partir dela); **nunca** `git push origin main` — o GitHub
  responde `GH006` e a entrega vai por **PR** com o `verify` verde:
  `git push origin develop` → `gh pr create --base main --head develop` → `gh pr checks --watch` →
  `gh pr merge --merge`. A **tag vem depois** do merge (`npm run release:tag`, que lê a versão do
  `package.json`). Passo a passo do marco e do hotfix em [`docs/VERSIONAMENTO.md`](docs/VERSIONAMENTO.md).
- **Versão:** `package.json.version` **não** é decorativo — o `/api/health` o devolve, e é assim que se
  sabe qual release está no ar (o EasyPanel faz auto-deploy do `main`). Ao lançar, ele sobe junto com o
  CHANGELOG; `src/tests/versao.test.ts` exige que os dois batam, então divergir quebra o CI.
- **Scripts `scripts/*.mjs`:** ferramental de banco (JS puro, deliberadamente não-tipado). São
  cobertos por ESLint, mas **fora** do `tsc --noEmit` (não estão no `include` do tsconfig). Não
  adicionar lógica de app aqui.
- **Banco / migrations:** sem Docker local. A fonte de verdade do schema/policies são os
  arquivos `supabase/migrations/NNNN_*.sql`, aplicados pelo **runner próprio** `npm run db:migrate`
  (rastreia em `app_migrations`). **NÃO** usar `supabase db push` (usaria outra tabela de controle e
  conflitaria). Testes de RLS: `npm run db:test` (exige Session pooler em `SUPABASE_DB_URL`).
  - Migrations já aplicadas são **imutáveis** (não editar — o runner não as reaplica). Mudança =
    nova migration com `create or replace` / `drop ... if exists`.
  - Novas migrations devem ser **idempotentes** quando possível (`create table if not exists`,
    `drop policy if exists ... ; create policy ...`).
- **Docs do projeto:** `docs/superpowers/specs/` (design) e `docs/superpowers/plans/` (plano).
