# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota o
[Versionamento Semântico](https://semver.org/lang/pt-BR/). Veja as regras em
[`docs/VERSIONAMENTO.md`](docs/VERSIONAMENTO.md) e o plano de evolução em [`ROADMAP.md`](ROADMAP.md).

## [Não lançado]

- Em planejamento: **V2 — Integração com o Domínio Sistemas** (ver `ROADMAP.md`).

## [1.0.0] — 2026-06-24

Primeira versão da plataforma: estrutura da aplicação web, cadastro de clientes e usuários,
hospedagem e e-mails (V1 do roadmap).

### Adicionado

- **Fundação:** scaffolding Next.js 16 (App Router) + TypeScript + Tailwind, health check,
  Dockerfile para EasyPanel, ESLint/Prettier e CI.
- **Banco e segurança:** enums, tabela `usuarios`, papéis/RBAC com **fonte única** em
  `usuarios.papel` (`auth_papel()`), RLS por papel e trigger anti-escalonamento; trigger
  `handle_new_user` para sincronizar o perfil. 18 asserts de RLS no runner próprio (`db:test`).
- **Clientes:** módulo completo (lista, ficha, CRUD) com `clientes` (CHECK tipo × regime) e
  honorário isolado em `clientes_financeiro` (assistente sem acesso).
- **Documentos do cliente:** upload, download por URL assinada, exclusão e log de auditoria
  (Supabase Storage).
- **Validações:** CPF/CNPJ e schema do cliente (TDD).
- **Integração Supabase:** clients browser/server/admin + proxy de sessão (`proxy.ts`).
- **Autenticação:** login, recuperação de senha (anti-loop) e guarda de rotas.
- **Gestão de usuários:** convite por e-mail (SMTP/Brevo), atribuição de papéis e status.
- **Dashboard:** números-resumo, distribuição por regime, atividade recente e atalhos.
- **Bootstrap do primeiro admin** via `service_role` (`npm run admin:bootstrap`).
- **Deploy:** publicação no EasyPanel e guia em `docs/DEPLOY.md`.

[Não lançado]: https://github.com/pedrogomesudi/crm-contabil/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/pedrogomesudi/crm-contabil/releases/tag/v1.0.0
