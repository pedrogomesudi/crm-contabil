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
| **V5** | Emissão de NFS-e pelo CRM (A: honorários ✅ · B: multi-emitente ✅) | ✅ |
| **V6** | Módulo Financeiro (contas a receber/pagar) | ✅ |
| **V7** | Integração com WhatsApp (atendimento, boletos, avisos) | ✅ |
| **V8** | Layout e estética | ✅ |
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

## V5 — Emissão de NFS-e pelo CRM ✅

Emissão de NFS-e pelo padrão nacional (nfse.gov.br), integrando direto com a **Sefin Nacional**.
Dividido em dois subsistemas de complexidade distinta:

- **A) NFS-e dos honorários do escritório** ✅ *(v5.0.0)* — 1 emitente (o escritório), a partir do
  honorário já no CRM; certificado A1 in-house (cifrado); emissão por cliente e em lote, avulsa e
  cancelamento, em produção. Spec: `docs/superpowers/specs/2026-07-02-v5-nfse-nacional-design.md`.
- **B) NFS-e dos clientes (multi-emitente)** ✅ *(v5.6.0)* — cada cliente emite as próprias notas
  como prestador: config fiscal + certificado A1 por cliente (cifrado), numeração de DPS por cliente,
  emissão por nota com tomador externo, e cancelar/baixar por emitente. Validado em homologação.
  Spec: `docs/superpowers/specs/2026-07-02-v5b-nfse-multiemitente-design.md`.

## V6 — Módulo Financeiro ✅

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

**Decomposição em sub-marcos** (cada um = spec + plano + implementação próprios):

- **V6.1 — Fundação financeira** ✅ — cadastros de apoio (contas bancárias, plano de contas,
  centros de custo, fornecedores, serviços) + extensão financeira do cliente + permissões + RLS +
  telas CRUD. *(Pró-rata e status financeiro suspenso/encerrado adiados para o V6.2.)*
- **V6.2 — Motor de recorrência** ✅ — contratos na ficha (sync do honorário), geração idempotente
  de mensalidades + 13º + **pró-rata (RF-013)**, contas a receber com **baixa (recebimento)**,
  disparo manual + automação (pg_cron). Migrations 0028–0031.
- **V6.3 — Contas a pagar + estorno auditado** ✅ — titulo RECEBER/PAGAR, despesa única/parcelada/
  recorrente (+pg_cron), baixa de pagamento, estorno auditado (justificativa, não deleta), anexos,
  dashboard com saldo real (entradas − saídas) e aging de pagar. Migrations 0033–0037. **Módulo
  Financeiro fechado** (aprovação de pagamento = incremento futuro).
- **V6.4 — Régua de cobrança** ✅ — entregue dentro da **V7.2** (etapas D-3/D+1/D+7/D+15, opt-out,
  idempotência, agendamento diário).
- **V6.5 — Relatórios e dashboard** ✅ — dashboard financeiro (`/financeiro/dashboard`): saldo, MRR,
  recebido/a receber, inadimplência, previsão, aging, fluxo de caixa (6m), maiores devedores, receita
  por tipo. RPCs SECURITY INVOKER + barras CSS. Só lado receita até a V6.3 (contas a pagar). Migration 0032.
- **V6.6 — Conciliação bancária** ✅ — Fatia A (importação OFX v1/v2 + CSV, dedup por hash, prévia) e
  Fatia B (motor de casamento por valor/sinal, auto-conciliação 1:1, conciliar com baixa/título, criar
  lançamento avulso, ignorar/reabrir). Índice único `uq_movimento_baixa` fecha a corrida do casamento.
  Migrations 0064–0066.

## V7 — Integração com WhatsApp ✅

Integração do CRM com o **WhatsApp** para relacionamento com clientes: **atendimento**, envio de
**boletos** e disparo de **mensagens e notícias do escritório**. Provedor escolhido: **Z-API**
(não-oficial; cliente isolado para troca futura).

- **V7.1 — Envio (fundação)** ✅ — config Z-API cifrada (`/configuracoes/whatsapp`), cliente
  `whatsapp/zapi.ts`, helpers de telefone/template, botão "Cobrar (WhatsApp)" num título + histórico
  `whatsapp_mensagem`. Migration 0038.
- **V7.2 — Régua de cobrança automática** ✅ — etapas configuráveis (D-3/D+1/D+7/D+15), opt-out por
  cliente (LGPD), idempotência por (título, etapa), motor server-side via rota protegida
  (`/api/cron/regua-cobranca`, `CRON_SECRET`) + agendador externo, botão "Processar agora". Migration 0039.
- **V7.3 — Atendimento (inbox bidirecional)** ✅ — `whatsapp_mensagem` bidirecional, webhook
  `/api/webhooks/zapi/[secret]` (dedup + resolução do cliente + tolerância ao nono dígito), inbox
  `/atendimento` (painéis, thread unificada por telefone, polling, read receipts).
- **V7.4 — Boletos** 🚧 — emissão/baixa de boleto por título com seletor de provedor **Inter × Asaas**
  (Configurações → Boletos), credenciais cifradas (`BOLETO_CRIPTO_KEY`), webhook de pagamento
  (`/api/webhooks/boleto/[secret]`, `BOLETO_WEBHOOK_SECRET`). Código completo; **ativação pendente** de
  conta ativa no provedor. Migrations 0058–0059. **Atendimento + régua concluídos; boletos aguardando
  ativação.**

> Opt-in/opt-out (LGPD) tratado na V7.2 (régua). Número dedicado do escritório (risco do não-oficial).

## V8 — Layout e estética ✅

Rebrand como **SALDO** (`seusaldo.ai`) a partir do Brand Kit: identidade visual, design system, responsividade.

- **V8.1 — Fundação SALDO** ✅ — tokens/fontes (Tailwind `@theme` + `next/font`), `LogoSaldo` + favicon,
  primitivos (`src/components/ui/`: Card/Botao/Badge/PageHeader/StatCard), sidebar com drawer mobile,
  shell creme e dashboard reestilizado — responsivo. Sem migration.
- **V8.2 — Rollout** ✅ — design system aplicado a toda a plataforma (gate: zero resíduo de estilo antigo).
  - **V8.2a — Auth + Clientes** ✅ — guia de linguagem (`docs/design/saldo-ui.md`), primitivos ampliados
    (Campo/Input/Select/Textarea/Painel/Chip/Toolbar/EmptyState/Iniciais), lista/ficha/formulários de
    clientes e telas de login recomponentizadas.
  - **V8.2b — Financeiro** ✅ — dashboard (StatCards + barras), contas a receber/pagar (tabelas + badges
    de status), régua, CadastroCrud genérico e hubs. Helper `badgeStatusTitulo`.
  - **V8.2c — NFS-e** ✅ — lista de notas (badge de status), emissão (avulsa/honorário), lote e config
    do emitente/certificado. Helper `badgeStatusNfse`. Emissão avulsa preservada.
  - **V8.2d — Atendimento + Integrações + resto** ✅ — inbox (chat), usuários (badge de papel), Domínio,
    documentos, assinatura, config WhatsApp. `badgePapel`; `CardResumo` legado removido. **Rollout 100% completo.**

## Entregas transversais (fora da trilha de versões)

Módulos que nasceram como diferenciais de CRM contábil, entregues em paralelo aos marcos acima
(cadência brainstorm → spec → plano). Ver [`docs/DOCUMENTACAO.md`](docs/DOCUMENTACAO.md).

- **Módulo Comercial (funil de oportunidades)** ✅ — funil Kanban arrastável
  (Novo → Contato → Proposta → Negociação → Ganho/Perdido), conversão **ganho → cliente → onboarding**,
  propostas formais e métricas (`/comercial`, `/comercial/metricas`). Migrations 0054, 0056–0057.
- **Onboarding & Legalização** ✅ (F1) — motor de **templates** (blocos → itens, perfis, condições,
  materialização com prazos D+n), **cofre de credenciais** cifrado + auditoria, regras de item
  (write-back de competência, dependências, anexo obrigatório), **alertas de prazo in-app** com badge e
  interruptor, página autônoma por cliente e **gatilho de consultoria** para o funil. Migrations
  0048–0052, 0055, 0060. **F2 (legalização/societário) em aberto.**
- **Financeiro — Relatórios gerenciais** ✅ — hub `/financeiro/relatorios` com **DRE**,
  **Extrato/movimentações (CSV)** e **Fluxo de caixa detalhado** (realizado + projetado, saldo
  acumulado). Sem migration.
- **Obrigações e Compliance** ✅ — matriz curada + **motor de prazos** (dias úteis, feriados fixos e
  móveis), geração de instâncias por competência (idempotente, **mensal via pg_cron**), calendário global
  e na ficha, **baixa com comprovante**, **painel de riscos** por responsável, **escalonamento
  hierárquico** (`usuarios.superior_id`, limiares 7/15 dias), geração retroativa/suspensão e **relatório
  de conformidade** (% por competência, CSV). Rotas `/obrigacoes`, `/obrigacoes/riscos`,
  `/obrigacoes/escalonamento`, `/obrigacoes/conformidade`, `/configuracoes/obrigacoes`.
  Migrations 0061–0063, 0067.
- **Financeiro — Indicadores da carteira** ✅ — `/financeiro/indicadores`: MRR, ticket médio, clientes
  ativos, **churn** (de clientes e de receita), novos × saídas e evolução de 12 meses; CSV e impressão.
  Trigger captura `data_saida` + honorário na inativação do cliente. Migration 0068.
- **Certificados e procurações (vencimentos)** ✅ *(v5.7.0)* — cadastro por cliente (certificado A1/A3 e
  procuração), **renovar arquiva o anterior**, alertas escalonados **60/30/15/vencido**, badge no menu e
  painel `/vencimentos` com cartões, filtros e CSV. Lê a validade do **A1 da NFS-e** (cliente e
  escritório) por função `SECURITY DEFINER` que expõe só a data — nunca o certificado cifrado. RLS
  fechada ao financeiro. Migrations 0069–0070. Atende RF-022/023 do gap analysis.

## V9 — Modo whitelabel ⬜

Tornar a plataforma **whitelabel/multi-tenant** para comercialização a qualquer escritório de
contabilidade (marca, domínio, isolamento de dados por cliente, planos).

> A definir: estratégia de tenancy, customização de marca, cobrança/assinaturas.

## V10 — Segurança da informação e legalidade técnica ⬜

Endurecimento de **segurança** e **conformidade legal/técnica** para comercializar a plataforma
sem riscos (LGPD, retenção, auditoria, pentest, termos de uso e contrato SaaS).

> A definir: escopo de auditoria, requisitos LGPD para operador/controlador, SLA.
