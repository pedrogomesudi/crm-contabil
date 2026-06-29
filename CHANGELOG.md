# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota o
[Versionamento Semântico](https://semver.org/lang/pt-BR/). Veja as regras em
[`docs/VERSIONAMENTO.md`](docs/VERSIONAMENTO.md) e o plano de evolução em [`ROADMAP.md`](ROADMAP.md).

## [Não lançado]

- Em planejamento: **V3 — Geração automática do contrato (Word/PDF)** (ver `ROADMAP.md`).

## [2.0.1] — 2026-06-29

Correções da revisão de código da V2.

### Corrigido

- **Aplicação atômica:** a importação passa a ser aplicada por uma RPC transacional no Postgres
  (`aplicar_importacao`, migration 0016) — tudo-ou-nada, com guarda contra **reaplicação** e
  **prévia expirada**, e erros do bloco financeiro deixam de ser silenciados.
- **Honorário zera** quando o cliente perde todos os contratos ativos (antes ficava o valor antigo).
- **Papel financeiro** removido do fluxo de importação (não escreve cadastro; ficava travado).
- `parseClientes`: deixa de criar ficha-fantasma `código 0` quando há "Código:" sem valor.
- Lista de clientes é revalidada após importar (`revalidatePath`); re-checagem de papel nas actions
  (defesa em profundidade); card "Erros" (sempre 0) substituído por aviso de pendências.

### Segurança

- Importação **escopada por dono** (assistente não acessa/edita importação de outro usuário; M3).
- `dominio_codigo` deixa de ser único (evita falha dura com matriz/filial); auditoria
  (`criado_por`) em `contratos_dominio`.

## [2.0.0] — 2026-06-29

Integração **Domínio → CRM** (V2 do roadmap): importa cadastro, regime tributário e honorários
dos clientes a partir dos relatórios exportados do Domínio.

### Adicionado

- **Leitor de `.xls` do Domínio:** parser BIFF tolerante (via `cfb`) que lê os relatórios cujo
  formato bibliotecas padrão (xlrd/SheetJS) recusam.
- **Importação de 3 fontes** com CNPJ como chave de junção: *Relação de Regime de Empresas*
  (cadastro-mestre: razão social, regime, status, CNAE, inscrição estadual), *Clientes*
  (endereço e contato) e *Relação de Contratos* (honorários).
- **Tela `/integracoes/dominio`** (admin/assistente/financeiro) com upload, **prévia (dry-run)** —
  novos/atualizados/inalterados/pendências/erros — e confirmação.
- **Reconciliação idempotente por CNPJ:** reimportar não duplica; mapeamento de regime
  (Microempresa→Simples, Lucro Presumido→Presumido, Lucro Real→Real, MEI→MEI) com validação de
  CPF/CNPJ e consistência tipo × regime; casos especiais (imune/isenta, cliente sem empresa) viram
  pendência sem bloquear a importação.
- **Honorário** espelhado em `clientes_financeiro` a partir dos contratos ativos.
- **Banco:** colunas de origem/sync em `clientes` (migration 0012); `contratos_dominio` com RLS do
  financeiro (0013); `importacoes` + staging da prévia (0014); hardening de segurança — staging
  financeiro isolado, autoria não-forjável e função de limpeza com gate de papel (0015).

### Segurança

- Arquivos enviados são processados em memória e descartados (não vão ao Storage).
- Valores de honorário no staging ficam isolados do papel `assistente` (RLS do financeiro).

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

[Não lançado]: https://github.com/pedrogomesudi/crm-contabil/compare/v2.0.1...HEAD
[2.0.1]: https://github.com/pedrogomesudi/crm-contabil/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/pedrogomesudi/crm-contabil/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/pedrogomesudi/crm-contabil/releases/tag/v1.0.0
