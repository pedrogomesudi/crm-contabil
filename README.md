# CRM Contábil

> **Status:** Fase 1 em andamento. Implementado: fundação (Next.js + qualidade/CI), banco completo
> (enums, `usuarios`, papéis/RLS, anti-escalonamento, `clientes`, honorário isolado, documentos,
> Storage — com 15 asserts de RLS), validações (CPF/CNPJ + schema), integração Supabase (clients +
> proxy de sessão) e bootstrap do admin. Pendente: telas (login, dashboard, clientes), gestão de
> usuários e deploy (ver `docs/superpowers/plans/`).

CRM web para escritório de contabilidade — login com papéis, dashboard e gestão de clientes.

- **Stack:** Next.js 16 (App Router) + TypeScript + Tailwind CSS · Supabase (Auth/Postgres/RLS/Storage) · deploy no EasyPanel.
- **Documentos do projeto:** `docs/superpowers/specs/` (design) e `docs/superpowers/plans/` (plano de implementação).

## Pré-requisitos

- Node.js 22+ (paridade com o deploy em `node:22-alpine`)
- Conta/projeto no Supabase (nuvem)
- O certificado da CA do Supabase salvo em `supabase/db-ca.crt` (já versionado)

> **Migrations:** não usamos `supabase db push`/CLI. O schema é aplicado pelo runner próprio
> (`npm run db:migrate`), que rastreia em `app_migrations`. Ver `AGENTS.md`.

## Variáveis de ambiente

Copie `.env.local.example` para `.env.local` e preencha:

| Variável | Onde é usada | Observação |
|----------|--------------|------------|
| `NEXT_PUBLIC_SITE_URL` | build/runtime | URL pública (usada em `metadataBase`) |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | **Build-time** — embutida no bundle |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | **Build-time** — embutida no bundle |
| `SUPABASE_SERVICE_ROLE_KEY` | apenas server | **Runtime** — segredo; nunca vai ao navegador |
| `SUPABASE_DB_URL` | scripts de banco | Connection string (Session pooler). Senha URL-encoded |
| `SUPABASE_DB_CA` | scripts de banco | Opcional. Default `supabase/db-ca.crt` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NOME` | `admin:bootstrap` | Só para o bootstrap. **Remover após** o primeiro login |

> **Importante (EasyPanel):** as `NEXT_PUBLIC_*` são **inlined no build**. Trocar o projeto Supabase
> exige **rebuild**, não apenas restart. `SUPABASE_SERVICE_ROLE_KEY` é runtime/segredo.
> A `ADMIN_PASSWORD` deve ser **diferente** da senha do Postgres.

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

## Banco de dados (migrations + RLS)

```bash
npm run db:migrate    # aplica supabase/migrations/*.sql (runner próprio)
npm run db:test       # roda os asserts de RLS contra o banco
```

## Bootstrap do primeiro Admin

1. Defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` (≠ senha do Postgres) no `.env.local`.
2. `npm run admin:bootstrap` — cria/promove o admin e define `usuarios.papel='admin'`.
3. Após logar, troque a senha e **remova** as variáveis `ADMIN_*` do `.env.local`.
