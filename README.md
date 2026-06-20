# CRM Contábil

> **Status:** Fase 1 em andamento — apenas o scaffolding (Task 1) está implementado: health check,
> configuração de build/test/lint e Dockerfile. Login, dashboard, papéis/RLS e módulo de clientes
> ainda serão construídos (ver `docs/superpowers/plans/`).

CRM web para escritório de contabilidade — login com papéis, dashboard e gestão de clientes.

- **Stack:** Next.js 16 (App Router) + TypeScript + Tailwind CSS · Supabase (Auth/Postgres/RLS/Storage) · deploy no EasyPanel.
- **Documentos do projeto:** `docs/superpowers/specs/` (design) e `docs/superpowers/plans/` (plano de implementação).

## Pré-requisitos

- Node.js 22+ (paridade com o deploy em `node:22-alpine`; desenvolvido em Node 26)
- Conta/projeto no Supabase (nuvem)
- Supabase CLI (`npx supabase`) para rodar o banco local e as migrations

## Variáveis de ambiente

Copie `.env.local.example` para `.env.local` e preencha:

| Variável | Onde é usada | Observação |
|----------|--------------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | **Build-time** — embutida no bundle |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | **Build-time** — embutida no bundle |
| `SUPABASE_SERVICE_ROLE_KEY` | apenas server | **Runtime** — segredo; nunca vai ao navegador |

> **Importante (EasyPanel):** as duas `NEXT_PUBLIC_*` são **inlined no build**. Trocar o projeto
> Supabase exige **rebuild**, não apenas restart. A `SUPABASE_SERVICE_ROLE_KEY` é runtime e deve ser
> marcada como segredo.

## Rodar localmente

```bash
npm install
npm run dev           # http://localhost:3000
npm run lint          # ESLint (eslint-config-next)
npm run typecheck     # TypeScript (tsc --noEmit)
npm run format        # Prettier (escreve)
npm test              # testes (Vitest)
npm run test:coverage # testes com cobertura
```

> A Supabase CLI é usada sob demanda via `npx supabase ...` (não é dependência do projeto).

Banco local (quando houver migrations):

```bash
npx supabase start
npx supabase migration up
```
