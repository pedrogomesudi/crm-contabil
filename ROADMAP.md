# Roadmap

Plano de evolução do **CRM Contábil**. Cada "Versão" abaixo é um marco de produto e corresponde
a um *major* no [versionamento semântico](docs/VERSIONAMENTO.md): V1 → `v1.0.0`, V2 → `v2.0.0`, e
assim por diante. Correções e ajustes dentro de um marco saem como *minor*/*patch* (ex.: `v1.1.0`,
`v1.0.1`).

Legenda: ✅ concluída · 🚧 em andamento · ⬜ planejada

| Versão | Marco | Status |
|:------:|-------|:------:|
| **V1** | Fundação da plataforma | ✅ |
| **V2** | Integração com o Domínio Sistemas | ✅ |
| **V3** | Geração automática do contrato (Word/PDF) | ✅ |
| **V4** | Assinaturas digitais integradas | ✅ |
| **V5** | Emissão de NFS-e pelo CRM (A: honorários ✅ · B: multi-emitente ⬜) | 🚧 |
| **V6** | Módulo Financeiro (contas a receber/pagar) | ⬜ |
| **V7** | Integração com WhatsApp (atendimento, boletos, avisos) | ⬜ |
| **V8** | Layout e estética | ⬜ |
| **V9** | Modo whitelabel (comercialização) | ⬜ |
| **V10** | Segurança da informação e legalidade técnica | ⬜ |

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

## V2 — Integração com o Domínio Sistemas ✅

Importação **Domínio → CRM**: cadastro, regime tributário e honorários dos clientes a partir dos
relatórios exportados do Domínio (Empresas, Clientes, Contratos), com prévia/confirmação,
reconciliação idempotente por CNPJ e auditoria.

- Leitor `.xls` próprio (parser BIFF tolerante) para os relatórios do Domínio.
- Tela de importação com prévia (novos/atualizados/pendências) e aplicação transacional.
- RLS do financeiro nos dados de honorário; arquivos processados em memória (LGPD).

Descoberta registrada: a API oficial (Onvio) não extrai esses dados (fluxo invertido) e o acesso
direto ao banco é inviável — por isso o caminho é exportar do Domínio e importar no CRM, que também
escala para a comercialização (V7). Detalhes em
[`docs/superpowers/specs/2026-06-26-v2-dominio-integracao-design.md`](docs/superpowers/specs/2026-06-26-v2-dominio-integracao-design.md).

## V3 — Geração automática do contrato ✅

Preenchimento automático do **contrato de prestação de serviços contábeis** com os dados do cadastro
do cliente, gerando o contrato em **Word** e **PDF**, salvos nos Documentos do cliente.

- Minuta padrão do escritório tagueada + motor **docxtemplater** (preserva formatação).
- Campos de **representante legal** no cadastro; formatação fiel (CNPJ/CEP/telefone, endereço em
  Title Case, honorário por extenso, e-mail linkado, data de assinatura = data de geração).
- PDF via **Gotenberg** (LibreOffice headless), com degradação graciosa para só-Word.
- Detalhes em
  [`docs/superpowers/specs/2026-06-30-v3-geracao-contrato-design.md`](docs/superpowers/specs/2026-06-30-v3-geracao-contrato-design.md).

## V4 — Assinaturas digitais integradas ✅

Integração entre o CRM e a **Clicksign**, para enviar o contrato gerado, colher assinaturas e
acompanhar o status sem sair do CRM.

- Envio do contrato PDF já gerado para assinatura (modelo de envelope da Clicksign v3).
- Signatários: escritório + cliente + **2 testemunhas opcionais** (por envio).
- **Webhook** (HMAC) atualiza o status por signatário e traz o **PDF assinado** de volta aos Documentos.
- Assinatura eletrônica avançada (Lei 14.063/2020 + MP 2.200-2/2001). Sandbox → produção por env.

## V5 — Emissão de NFS-e pelo CRM 🚧

Emissão de NFS-e pelo padrão nacional (nfse.gov.br), integrando direto com a **Sefin Nacional**.
Dividido em dois subsistemas de complexidade distinta:

- **A) NFS-e dos honorários do escritório** ✅ *(v5.0.0)* — 1 emitente (o escritório), a partir do
  honorário já no CRM; certificado A1 in-house (cifrado); emissão por cliente e em lote, avulsa e
  cancelamento, em produção. Spec: `docs/superpowers/specs/2026-07-02-v5-nfse-nacional-design.md`.
- **B) NFS-e dos clientes (multi-emitente)** ⬜ *(próximo marco — "V5-B")* — cada cliente emite as
  próprias notas: N emitentes, com **múltiplos certificados e municípios** (multi-tenant fiscal).
  Spec e plano separados quando chegar a vez.

## V6 — Módulo Financeiro ⬜

Módulo de **controle de receitas e despesas** (contas a receber e a pagar) do escritório,
integrado à base de clientes do CRM, tendo o **contrato de honorários** como entidade central do
contas a receber. Documento de requisitos: **`módulo financeiro.docx`** (raiz do projeto).

Oito blocos funcionais (fase sugerida entre parênteses):

1. **Cadastros básicos** (MVP) — contas bancárias, plano de contas, centros de custo, clientes,
   fornecedores e tabela de serviços.
2. **Contratos e contas a receber** (MVP) — contratos de honorários, geração automática de
   mensalidades, honorários eventuais, 13º, reajustes e baixas.
3. **Contas a pagar** (MVP) — lançamentos únicos, parcelados e recorrentes, com anexos e aprovação.
4. **Régua de cobrança** (MVP) — alertas e cobranças automáticas por e-mail/WhatsApp com
   escalonamento. *(A parte por WhatsApp depende da integração da V7.)*
5. **Movimentações e conciliação** (F2) — transferências entre contas, importação de extrato
   (OFX/CSV) e conciliação bancária.
6. **Relatórios** (MVP/F2) — fluxo de caixa, DRE gerencial, aging, inadimplência, MRR e receita
   por tipo.
7. **Dashboards** (MVP) — indicadores consolidados: MRR, churn, inadimplência, saldos e previsão
   de caixa.
8. **Integrações e avançado** (F2/F3) — gateway de pagamento (boleto/PIX), NFS-e, portal do
   cliente, rateios e comissões.

> Marco grande: quando chegar a vez, decompor em sub-projetos (começando pelo MVP) com spec e
> plano próprios, na cadência brainstorm → spec → plano.

## V7 — Integração com WhatsApp ⬜

Integração do CRM com o **WhatsApp** para relacionamento com clientes: **atendimento**, envio de
**boletos** e disparo de **mensagens e notícias do escritório**.

> A definir: provedor (API oficial do WhatsApp Cloud vs. BSP), modelos de mensagem aprovados
> (templates), opt-in/opt-out (LGPD) e a ligação com a régua de cobrança da V6.

## V8 — Layout e estética ⬜

Refinamento visual e de experiência da plataforma (identidade visual, design system, responsividade).

> A definir: direção de design (ver skill `frontend-design`).

## V9 — Modo whitelabel ⬜

Tornar a plataforma **whitelabel/multi-tenant** para comercialização a qualquer escritório de
contabilidade (marca, domínio, isolamento de dados por cliente, planos).

> A definir: estratégia de tenancy, customização de marca, cobrança/assinaturas.

## V10 — Segurança da informação e legalidade técnica ⬜

Endurecimento de **segurança** e **conformidade legal/técnica** para comercializar a plataforma
sem riscos (LGPD, retenção, auditoria, pentest, termos de uso e contrato SaaS).

> A definir: escopo de auditoria, requisitos LGPD para operador/controlador, SLA.
