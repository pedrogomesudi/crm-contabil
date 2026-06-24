# Roadmap

Plano de evolução do **CRM Contábil**. Cada "Versão" abaixo é um marco de produto e corresponde
a um *major* no [versionamento semântico](docs/VERSIONAMENTO.md): V1 → `v1.0.0`, V2 → `v2.0.0`, e
assim por diante. Correções e ajustes dentro de um marco saem como *minor*/*patch* (ex.: `v1.1.0`,
`v1.0.1`).

Legenda: ✅ concluída · 🚧 em andamento · ⬜ planejada

| Versão | Marco | Status |
|:------:|-------|:------:|
| **V1** | Fundação da plataforma | ✅ |
| **V2** | Integração com o Domínio Sistemas | ⬜ |
| **V3** | Geração automática do contrato (Word/PDF) | ⬜ |
| **V4** | Assinaturas digitais integradas | ⬜ |
| **V5** | Emissão de NFS-e pelo CRM | ⬜ |
| **V6** | Layout e estética | ⬜ |
| **V7** | Modo whitelabel (comercialização) | ⬜ |
| **V8** | Segurança da informação e legalidade técnica | ⬜ |

---

## V1 — Fundação da plataforma ✅

Estrutura da aplicação web, cadastro de clientes e usuários, hospedagem e e-mails.

- Aplicação Next.js 16 (App Router) + TypeScript + Tailwind, com CI e qualidade.
- Banco Supabase completo: papéis/RBAC, RLS por papel e anti-escalonamento.
- Cadastro de clientes (CRUD, ficha, honorário isolado) e de usuários (convite por e-mail).
- Documentos do cliente (upload/download assinado + log de auditoria via Storage).
- Login, recuperação de senha, guarda de rotas e dashboard.
- Deploy no EasyPanel.

Detalhes em [`CHANGELOG.md`](CHANGELOG.md).

## V2 — Integração com o Domínio Sistemas ⬜

Integrar o CRM ao **Domínio Sistemas** (software contábil), permitindo o fluxo de dados entre as
duas plataformas.

> A definir: escopo da integração (quais dados, direção do fluxo, API/arquivo disponível).

## V3 — Geração automática do contrato ⬜

Preenchimento automático do **contrato de prestação de serviços contábeis** com os dados do
cadastro do cliente, gerando o contrato em **Word** e **PDF**.

> A definir: modelo(s) de contrato, campos mesclados, motor de template.

## V4 — Assinaturas digitais integradas ⬜

Integração entre o CRM e uma **plataforma de assinaturas digitais**, para enviar, assinar e
acompanhar a assinatura dos contratos sem sair do CRM.

> A definir: provedor de assinatura, validade jurídica (ICP-Brasil x eletrônica), webhooks de status.

## V5 — Emissão de NFS-e pelo CRM ⬜

Integração com **emissor de notas fiscais eletrônicas de serviço (NFS-e)**, para emitir notas de
prestação de serviços diretamente pelo CRM.

> A definir: emissor/municípios atendidos, regime tributário, conciliação com o honorário.

## V6 — Layout e estética ⬜

Refinamento visual e de experiência da plataforma (identidade visual, design system, responsividade).

> A definir: direção de design (ver skill `frontend-design`).

## V7 — Modo whitelabel ⬜

Tornar a plataforma **whitelabel/multi-tenant** para comercialização a qualquer escritório de
contabilidade (marca, domínio, isolamento de dados por cliente, planos).

> A definir: estratégia de tenancy, customização de marca, cobrança/assinaturas.

## V8 — Segurança da informação e legalidade técnica ⬜

Endurecimento de **segurança** e **conformidade legal/técnica** para comercializar a plataforma
sem riscos (LGPD, retenção, auditoria, pentest, termos de uso e contrato SaaS).

> A definir: escopo de auditoria, requisitos LGPD para operador/controlador, SLA.
