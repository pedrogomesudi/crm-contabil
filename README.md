# CRM Contábil

CRM web para escritório de contabilidade — login com papéis, dashboard e gestão de clientes.

- **Stack:** Next.js 16 (App Router) + TypeScript + Tailwind CSS · Supabase (Auth/Postgres/RLS/Storage) · deploy no EasyPanel.
- **Documentos do projeto:** `docs/superpowers/specs/` (design) e `docs/superpowers/plans/` (plano de implementação).

## Pré-requisitos

- Node.js 20+ (desenvolvido em Node 26)
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
npm run dev          # http://localhost:3000
npm test             # testes (Vitest)
```

Banco local (quando houver migrations):

```bash
npx supabase start
npx supabase migration up
```
