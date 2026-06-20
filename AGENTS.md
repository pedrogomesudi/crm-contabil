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
- **Comandos:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`, `npm run build`. Rode todos antes de commitar.
- **Banco:** schema/policies só via migrations da Supabase CLI (`supabase/migrations`), nunca pelo painel.
- **Docs do projeto:** `docs/superpowers/specs/` (design) e `docs/superpowers/plans/` (plano).
