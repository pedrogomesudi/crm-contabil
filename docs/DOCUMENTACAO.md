# SALDO — Documentação de funcionalidades e módulos

> **Documento parcial / vivo.** Reflete o estado atual do sistema em produção (`app.seusaldo.ai`).
> Atualizar conforme os módulos evoluem. Última revisão: 2026-07-08.

---

## 1. Visão geral

**SALDO** é um CRM para escritórios de contabilidade: reúne cadastro de clientes, emissão e gestão de
NFS-e, atendimento por WhatsApp, financeiro (contas a pagar/receber, orçamento e orçado × realizado),
cobrança automatizada, onboarding de clientes com cofre de credenciais, e integração com o sistema
Domínio.

- **Stack:** Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind 4 · Supabase
  (Auth/Postgres/RLS/Storage) · deploy em EasyPanel.
- **Acesso:** aplicação web responsiva (desktop e celular).
- **Segurança:** autenticação Supabase; autorização por papel (RBAC) aplicada tanto no servidor quanto
  na base (Row-Level Security); credenciais sensíveis cifradas (AES-256-GCM); ações sensíveis auditadas.

---

## 2. Papéis e permissões (RBAC)

Quatro papéis. O papel é a **fonte única** de autorização (vive em `usuarios.papel`) e é aplicado nas
políticas do banco.

| Papel | Perfil típico |
|---|---|
| **admin** | Dono/gestor do escritório — acesso total e configurações. |
| **contador** | Contador responsável — vê e gerencia **seus** clientes. |
| **assistente** | Apoio operacional — cadastro, documentos, atendimento. |
| **financeiro** | Financeiro do escritório — contas, cobrança, honorários. |

**Matriz de capacidades (resumo):**

| Capacidade | admin | contador | assistente | financeiro |
|---|:--:|:--:|:--:|:--:|
| Criar/editar cliente | ✔ | ✔ (os seus) | ✔ | — |
| Excluir cliente | ✔ | — | — | — |
| Atribuir contador ao cliente | ✔ | — | — | — |
| Ver honorário | ✔ | ✔ | — | ✔ |
| Gerenciar documentos | ✔ | ✔ | ✔ | — |
| Atendimento (WhatsApp) | ✔ | ✔ | — | ✔ |
| Onboarding (gerenciar itens) | ✔ | ✔ | ✔ | — |
| Revelar senha do cofre | ✔ | ✔ | — | — |
| Editar checklist-modelo de onboarding | ✔ | — | — | — |
| Financeiro (contas, orçamento, dashboards) | ✔ | — | — | ✔ |
| Configurar NFS-e / WhatsApp / usuários | ✔ | — | — | — |

> **Isolamento por cliente:** o contador só enxerga os clientes atribuídos a ele; as tabelas ligadas a
> cliente (documentos, onboarding, etc.) herdam essa regra na RLS.

---

## 3. Módulos

### 3.1 Início (dashboard geral)
Página inicial com indicadores de carteira: **total de clientes**, ativos/inativos, distribuição por
regime tributário e clientes recentes.

### 3.2 Clientes
Cadastro completo de PJ/PF/MEI e a ficha do cliente, que concentra todas as áreas ligadas a ele.

- **Cadastro:** razão social, CNPJ/CPF, tipo de pessoa, regime tributário, inscrições estadual/municipal,
  endereço, e-mail, telefone, responsável, representante, contador responsável, status, observações.
- **Consulta à Receita Federal:** para PJ, botão que preenche/atualiza os dados a partir do CNPJ.
- **Honorário e dados financeiros:** valor mensal, dia de vencimento, faixa de faturamento, nº de
  funcionários, data de saída, opt-out de cobrança por WhatsApp (visível a quem pode ver honorário).
- **Contratos:** geração de contrato de prestação de serviços a partir do cadastro.
- **Documentos + assinatura eletrônica:** upload de documentos do cliente, com fluxo de assinatura
  (integração ClickSign) e registro de acesso auditado.
- **NFS-e do cliente:** notas emitidas e emissão de nota com o cliente como emitente.
- **Onboarding:** aba com o checklist de entrada do cliente (ver 3.3).
- **Exclusão:** soft delete (somente admin).

### 3.3 Onboarding (RF-010)
Workflow de entrada de cliente com **checklist configurável** e **cofre de credenciais**.

- **Checklist-modelo** (Configurações → Checklist de onboarding, admin): itens padrão por categoria —
  documentos, procurações, certificados, acessos, responsáveis — com obrigatório/ordem/ativo.
- **Por cliente:** aba "Onboarding" com "Iniciar onboarding" (copia o modelo), itens agrupados por
  categoria, **barra de progresso**, status (pendente/concluído/dispensado), responsável, prazo e
  observação.
- **Cofre de acessos:** itens de "acesso" guardam URL, login e **senha cifrada** (AES-256-GCM). Revelar a
  senha é restrito a **admin/contador** e **auditado** (registra quem/quando; falha fechada — sem
  auditoria, não revela). A senha nunca trafega em texto nas listagens.
- **Lista global** (`/onboarding`): clientes em processo, % concluído, obrigatórios pendentes, próximo
  prazo.
- **Configuração de deploy:** exige a variável `ONBOARDING_CRIPTO_KEY` (chave do cofre; definida uma vez,
  nunca alterada).

> **Evolução planejada:** motor de **template de processo estruturado** (blocos, prazos D+n, perfis de
> cliente, condições, itens bloqueantes) — ver Roadmap.

### 3.4 Atendimento (WhatsApp)
Central de atendimento integrada ao WhatsApp via **Z-API** (número dedicado do escritório).

- **Inbox** em 3 colunas com abas (Abertas / Pendentes / Finalizadas / Favoritos).
- **Envio e recepção** de mensagens em tempo (polling); **mídia** (imagem, documento, áudio) enviada e
  recebida.
- **Read receipts** (entregue ✓✓ / lido em azul), no padrão do WhatsApp.
- **Status do atendimento e atendente** responsável por conversa.
- **Identificação do cliente:** exibe nome da empresa + contato em vez do número, quando o telefone bate
  com um cliente cadastrado.
- **Nova conversa** a partir dos clientes cadastrados.

### 3.5 NFS-e (notas fiscais de serviço)
Emissão e gestão de NFS-e, com certificado digital e provedor nacional (ADN).

- **Configuração do emitente** (Configurações → NFS-e, admin): dados do emitente e **certificado
  digital**.
- **Emissão avulsa** e **emissão com o cliente como emitente** (preenche o tomador a partir do CNPJ).
- **Lote** (`/nfse/lote`): emissão/gestão em lote por competência.
- **Download em lote:** botões separados para baixar todas em **PDF** e em **XML**, com **cache do
  DANFSe** no Storage (baixas repetidas ficam instantâneas) e reprocessamento de falhas.

### 3.6 Cobrança (envio de notas + PIX/TED)
Na tela de NFS-e em lote, painel que envia ao cliente, por WhatsApp, a **NFS-e (PDF)** + a **mensagem de
cobrança** com dados de pagamento.

- **Seleção por lote:** lista as NFS-e autorizadas com caixas de seleção, selo **"já enviada"**
  (pré-marcando só as pendentes) e busca.
- **Mensagem configurável** (Configurações → Dados de pagamento): PIX + banco/agência/conta/titular/CNPJ
  + template. Marcadores tolerantes a maiúscula/acento/espaço: `{NOME}` (contato), `{EMPRESA}`,
  `{COMPETÊNCIA}`, `{VALOR}`, `{VENCIMENTO}`, `{CHAVE PIX}`, `{RAZÃO SOCIAL}` (favorecido), `{CNPJ}`,
  `{BANCO}`, `{AG}`, `{CONTA}`, `{PAGAMENTO}` (bloco pronto).
- **Progresso e reenvio** de falhas; respeita o opt-out de cobrança do cliente.

### 3.7 Financeiro
Módulo completo de gestão financeira do escritório (admin/financeiro).

- **Contas a receber** e **contas a pagar:** títulos com competência, vencimento, categoria, centro de
  custo, fornecedor; **baixas** (recebimentos/pagamentos), parcelamento, despesas recorrentes.
- **Dashboard financeiro:** receita/despesa do mês, aging de contas a receber/pagar, fluxo de caixa
  (6 meses), maiores devedores, receita por tipo.
- **Orçamento:** grade editável (categorias × 12 meses) por ano, com totais e atalhos ("replicar nos 12
  meses", "copiar do ano anterior").
- **Orçado × Realizado:** dashboard comparativo por categoria, com período ajustável
  (mês/trimestre/semestre/ano) e base **competência** ou **caixa**; cartões de resumo, gráfico de barras
  por categoria, linha de evolução da receita e tabela estilo DRE com variação colorida.
- **Régua de cobrança:** etapas de cobrança configuráveis (base para a automação — ver Roadmap).
- **Cadastros:** plano de contas (categorias, natureza/DRE), centros de custo, contas bancárias,
  fornecedores, serviços e contratos.

### 3.8 Integração Domínio
Importação de contratos/dados a partir do sistema **Domínio** (admin/assistente), com telas de
importação e conciliação.

### 3.9 Configurações (admin)
Central de integrações e credenciais:
- **WhatsApp (Z-API):** credenciais do provedor e teste de conexão.
- **NFS-e (emitente):** dados do emitente e certificado digital.
- **Dados de pagamento (PIX/TED):** conta e PIX enviados na cobrança.
- **Checklist de onboarding:** itens-modelo do onboarding.

### 3.10 Usuários (admin)
Gestão da equipe: convite de usuários, definição de papel e status (ativo/inativo). O papel real é
definido server-side (não confiável a partir do token).

---

## 4. Integrações externas

| Integração | Uso |
|---|---|
| **Z-API** | WhatsApp não-oficial (envio/recepção de texto e mídia, status de entrega/leitura). Webhook em `/api/webhooks/zapi/[secret]`. |
| **Receita Federal** | Consulta de CNPJ para preencher/atualizar cadastro. |
| **ADN / provedor NFS-e** | Emissão e download de NFS-e (DANFSe/XML), com certificado digital. |
| **ClickSign** | Assinatura eletrônica de documentos. Webhook em `/api/webhooks/clicksign`. |
| **Domínio** | Importação de contratos/dados contábeis. |

---

## 5. Infraestrutura e segurança

- **Banco (Supabase/Postgres):** schema versionado em `supabase/migrations/NNNN_*.sql`, aplicado por um
  runner próprio (`npm run db:migrate`); **Row-Level Security** em todas as tabelas sensíveis, por papel
  e por dono do cliente.
- **Storage (Supabase):** documentos, DANFSe (cache) e mídia de atendimento, com rotas de acesso
  controladas.
- **Criptografia:** credenciais do WhatsApp, certificados e o **cofre de acessos** do onboarding cifrados
  com AES-256-GCM; chaves em variáveis de ambiente (`WHATSAPP_CRIPTO_KEY`, `ONBOARDING_CRIPTO_KEY`),
  definidas uma vez e nunca alteradas.
- **Auditoria:** acesso a documentos e revelação de senhas do cofre são registrados (quem/quando),
  de forma não-forjável.
- **Cron:** rota `/api/cron/regua-cobranca` protegida por `CRON_SECRET` (para a régua automática).
- **Saúde:** `/api/health` para verificação de disponibilidade.

---

## 6. APIs e webhooks

| Rota | Função |
|---|---|
| `GET /api/health` | Healthcheck. |
| `POST /api/webhooks/zapi/[secret]` | Recebe eventos do WhatsApp (mensagens, status). |
| `POST /api/webhooks/clicksign` | Recebe eventos de assinatura de documentos. |
| `POST /api/cron/regua-cobranca` | Execução agendada da régua de cobrança (Bearer `CRON_SECRET`). |
| `GET /api/atendimento/midia/[id]` | Serve a mídia de atendimento (com controle de acesso). |

---

## 7. Roadmap / em aberto

- **Onboarding — motor de template estruturado (Ciclo A/B/C):** blocos, prazos relativos (D+n), perfis
  de cliente e condições, itens bloqueantes, write-back ao cadastro, dependências, alertas escalonados,
  oportunidades de consultoria e gatilho pelo módulo comercial.
- **Legalização / societário:** processos por órgão (Junta, Receita, prefeitura, Estado, bombeiros,
  vigilância), protocolos e prazos; templates por tipo de serviço; transferência de contabilidade
  (acervo, NBC PG 01).
- **Régua de cobrança automática:** cron externo diário disparando a rota protegida.
- **Boletos:** emissão via provedor com API (Inter × Asaas pesquisados) — adiado.

---

## 8. Convenções do projeto

- **Migrations** são imutáveis após aplicadas; mudança = nova migration idempotente.
- **RBAC** é fonte única (`usuarios.papel` via `auth_papel()`); nunca ler papel do token.
- **Tabelas-filhas de cliente** delegam o isolamento à RLS de `clientes` (via `EXISTS`).
- Antes de cada entrega: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
