# SALDO — Documentação de funcionalidades e módulos

> **Documento vivo.** Reflete o estado atual do sistema em produção (`app.seusaldo.ai`).
> Atualizar conforme os módulos evoluem. Última revisão: 2026-07-09.

---

## 1. Visão geral

**SALDO** é um CRM para escritórios de contabilidade. Reúne, num só lugar: funil comercial (captação
de clientes), cadastro de clientes, onboarding com cofre de credenciais, **calendário de obrigações
fiscais com escalonamento e conformidade**, emissão e gestão de NFS-e, atendimento por WhatsApp,
financeiro completo (contas a pagar/receber, orçamento, orçado × realizado, **conciliação bancária**,
relatórios gerenciais e indicadores de carteira), cobrança automatizada (WhatsApp + boletos) e
integração com o sistema Domínio.

- **Stack:** Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind 4 · Supabase
  (Auth/Postgres/RLS/Storage) · deploy em EasyPanel.
- **Marca:** identidade visual **SALDO** (rebrand V8), com design system próprio (tokens, fontes e
  primitivos de UI) aplicado a toda a plataforma.
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
| **assistente** | Apoio operacional — cadastro, documentos, atendimento, comercial, onboarding. |
| **financeiro** | Financeiro do escritório — contas, cobrança, honorários, relatórios. |

**Matriz de capacidades (resumo):**

| Capacidade | admin | contador | assistente | financeiro |
|---|:--:|:--:|:--:|:--:|
| Funil comercial (oportunidades) | ✔ | ✔ | ✔ | — |
| Criar/editar cliente | ✔ | ✔ (os seus) | ✔ | — |
| Excluir cliente | ✔ | — | — | — |
| Atribuir contador ao cliente | ✔ | — | — | — |
| Ver honorário | ✔ | ✔ | — | ✔ |
| Gerenciar documentos | ✔ | ✔ | ✔ | — |
| Atendimento (WhatsApp) | ✔ | ✔ | — | ✔ |
| Onboarding (gerenciar processos/itens) | ✔ | ✔ | ✔ | — |
| Revelar senha do cofre | ✔ | ✔ | — | — |
| Editar templates de onboarding | ✔ | — | — | — |
| Obrigações (calendário, baixa, riscos, conformidade) | ✔ | ✔ (os seus) | ✔ | — |
| Editar a matriz de obrigações | ✔ | — | — | — |
| Certificados e procurações (vencimentos) | ✔ | ✔ (os seus) | ✔ | — |
| Financeiro (contas, orçamento, conciliação, indicadores, relatórios) | ✔ | — | — | ✔ |
| Configurar NFS-e / WhatsApp / boletos / obrigações / usuários | ✔ | — | — | — |

> **Isolamento por cliente:** o contador só enxerga os clientes atribuídos a ele; as tabelas ligadas a
> cliente (documentos, onboarding, títulos, etc.) herdam essa regra na RLS. Tabelas **pré-cliente**
> (ex.: oportunidade do funil) usam RLS só por papel.

---

## 3. Módulos

### 3.1 Início (dashboard geral)
Página inicial com indicadores de carteira: **total de clientes**, ativos/inativos, distribuição por
regime tributário e clientes recentes.

### 3.2 Comercial (funil de oportunidades)
Módulo de captação e acompanhamento de novos clientes antes de virarem cadastro (admin/contador/assistente).

- **Funil Kanban** (`/comercial`): oportunidades em colunas por etapa — **Novo → Contato → Proposta →
  Negociação → Ganho / Perdido** — com **arrastar e soltar** para mover de etapa.
- **Oportunidade:** prospect, contato (nome/telefone/e-mail), origem, serviço de interesse, valor
  estimado, responsável, observações e motivo de perda.
- **Conversão:** ao marcar **Ganho**, converte a oportunidade em **cliente** e dá partida no
  **onboarding** — ligando o funil ao ciclo de entrada.
- **Propostas formais:** geração de proposta comercial a partir da oportunidade.
- **Métricas / relatórios** (`/comercial/metricas`): oportunidades ativas, taxa de conversão, valor
  em funil e desempenho por etapa.

### 3.3 Clientes
Cadastro completo de PJ/PF/MEI e a ficha do cliente, que concentra todas as áreas ligadas a ele.

- **Cadastro:** razão social, CNPJ/CPF, tipo de pessoa, regime tributário, inscrições estadual/municipal,
  endereço, e-mail, telefone, responsável, representante, contador responsável, status, observações,
  **competência inicial** (definida no onboarding).
- **Consulta à Receita Federal:** para PJ, botão que preenche/atualiza os dados a partir do CNPJ.
- **Honorário e dados financeiros:** valor mensal, dia de vencimento, faixa de faturamento, nº de
  funcionários, data de saída, opt-out de cobrança por WhatsApp (visível a quem pode ver honorário).
- **Contratos:** geração de contrato de prestação de serviços a partir do cadastro (Word + PDF).
- **Documentos + assinatura eletrônica:** upload de documentos do cliente, com fluxo de assinatura
  (integração Clicksign) e registro de acesso auditado.
- **NFS-e do cliente:** notas emitidas e emissão de nota com o cliente como emitente.
- **Onboarding:** link "Abrir onboarding" para a página dedicada do cliente (ver 3.4).
- **Obrigações:** seção com as obrigações do cliente na competência, com selo de severidade (ver 3.6).
- **Certificados e procurações:** seção com validade e selo de severidade, incluindo o A1 da NFS-e
  em modo leitura (ver 3.7).
- **Exclusão:** soft delete (somente admin).

### 3.4 Onboarding & Legalização
Workflow estruturado de entrada de cliente, com **motor de templates**, **cofre de credenciais**,
**regras de itens** e **alertas de prazo**. (Substituiu o antigo checklist plano do RF-010.)

- **Motor de templates** (Configurações → Template de onboarding, admin): um **gerenciador de vários
  templates**, cada um organizado em **blocos → itens**. Itens do tipo *padrão* (tarefa) ou *acesso*
  (credencial). Editor com CRUD de blocos/itens e **reordenação (↑↓)**. Template padrão pré-semeado
  (7 blocos, ~36 itens).
- **Processo por cliente:** ao **iniciar o processo**, escolhe-se o template e o **perfil do cliente**
  (MEI, Simples com/sem funcionário, Presumido/Real, PF) + flags de condição; o sistema **materializa**
  os itens aplicáveis com prazos relativos (D+n). Barra de progresso, status (pendente/concluído/
  dispensado), responsável, prazo e observação por item.
- **Página autônoma por cliente** (`/onboarding/[clienteId]`): tela dedicada só ao onboarding daquele
  cliente, com razão social e link para o cadastro completo.
- **Regras de itens:**
  - **Write-back ao cadastro:** concluir o item de competência inicial grava `clientes.competencia_inicial`.
  - **Dependências:** um item só pode ser concluído quando os itens de que depende já estiverem
    concluídos/dispensados (a UI mostra "Para concluir: …").
  - **Anexo obrigatório:** itens que exigem anexo bloqueiam a conclusão sem o arquivo (upload no Storage,
    URL assinada de 60s).
- **Cofre de acessos:** itens de "acesso" guardam URL, login e **senha cifrada** (AES-256-GCM). Revelar a
  senha é restrito a **admin/contador** e **auditado** (registra quem/quando; falha fechada — sem
  auditoria, não revela). A senha nunca trafega em texto nas listagens.
- **Lista global** (`/onboarding`): clientes em processo, % concluído, obrigatórios pendentes, próximo prazo.
- **Alertas de prazo (in-app):** cálculo ao vivo dos itens vencendo/vencidos (`/onboarding/alertas`),
  agrupados por severidade (em breve / vencido / crítico), com **badge no menu** e filtro "todos / só os
  meus". Um interruptor em Configurações (admin) liga/desliga as notificações de prazo para todos.
- **Gatilho de consultoria:** qualquer item pode **gerar uma oportunidade de consultoria** no funil
  comercial (vínculo idempotente), conectando onboarding → comercial.
- **Configuração de deploy:** exige a variável `ONBOARDING_CRIPTO_KEY` (chave do cofre; definida uma
  vez, nunca alterada).

> **Em aberto (F2):** legalização/societário — processos por órgão (Junta, Receita, prefeitura, Estado,
> bombeiros, vigilância), protocolos e prazos; templates por tipo de serviço societário; comunicação
> automática de status ao cliente; registro de transferência de contabilidade (acervo, NBC PG 01).

### 3.5 Atendimento (WhatsApp)
Central de atendimento integrada ao WhatsApp via **Z-API** (número dedicado do escritório).

- **Inbox** em colunas com abas (Abertas / Pendentes / Finalizadas / Favoritos).
- **Envio e recepção** de mensagens em tempo (polling); **mídia** (imagem, documento, áudio) enviada e
  recebida.
- **Read receipts** (entregue ✓✓ / lido em azul), no padrão do WhatsApp.
- **Status do atendimento e atendente** responsável por conversa.
- **Identificação do cliente:** exibe nome da empresa + contato em vez do número, quando o telefone bate
  com um cliente cadastrado. Normalização de telefone tolerante ao **nono dígito**.
- **Nova conversa** a partir dos clientes cadastrados.

### 3.6 Obrigações e Compliance
Controle do calendário de obrigações fiscais e trabalhistas dos clientes, do prazo à entrega, com
escalonamento de atrasos e relatório de conformidade (admin/contador/assistente).

- **Matriz de obrigações** (Configurações → Obrigações, admin): catálogo curado com esfera, periodicidade,
  regra de incidência (perfil do cliente, flags, UF, prefixo de CNAE) e exigência de comprovante.
  Pré-semeada com ~9 obrigações (DASN-SIMEI, PGDAS-D, DEFIS, DCTFWeb, FGTS Digital, EFD-Contribuições,
  EFD-Reinf, ECD, ECF).
- **Motor de prazos:** cálculo em dias úteis com **feriados nacionais** (fixos + móveis, via Páscoa),
  prazo interno em N dias úteis e antecipação quando o vencimento cai em dia não útil.
- **Geração de instâncias:** por competência, aplicando a regra de incidência a cada cliente, de forma
  **idempotente**. Roda **automaticamente todo mês** (ver §5, pg_cron) e também sob demanda.
- **Geração retroativa** em lote (até 24 meses) e **suspensão** de clientes inativos.
- **Calendário global** (`/obrigacoes`) e seção na ficha do cliente, com selo de severidade.
- **Baixa/entrega:** conclusão da obrigação com data de entrega, responsável, observação e **comprovante
  anexo** (obrigatório quando a obrigação exige).
- **Painel de riscos** (`/obrigacoes/riscos`): agrupado por responsável, classificando *vencida /
  vencendo hoje / no prazo*. Badge no menu, ligável por interruptor.
- **Escalonamento hierárquico** (`/obrigacoes/escalonamento`): atrasos sobem colaborador → líder → sócio
  pela cadeia `usuarios.superior_id`, com limiares configuráveis (padrão 7 e 15 dias) e interruptor.
- **Relatório de conformidade** (`/obrigacoes/conformidade`): por competência, agregado e por cliente,
  com **% de conformidade**, exportação em CSV e impressão.

### 3.7 Certificados e procurações (vencimentos)
Controle dos certificados digitais e das procurações de cada cliente, com alertas escalonados.

- **Cadastro por cliente:** certificado (tipo A1/A3, titular, documento, emissão, validade) e procuração
  (órgão, outorgante, outorgado, início, validade).
- **Renovar arquiva o anterior:** um certificado renovado é outro certificado; o histórico fica na ficha.
  Não há "editar" — corrigir é desativar e cadastrar de novo, o que deixa rastro.
- **Visão única:** o painel lê também a validade do **A1 usado pela NFS-e** (do cliente e do escritório),
  sem duplicá-la — via função `SECURITY DEFINER` que expõe apenas a data, nunca o certificado cifrado.
- **Alertas in-app:** severidade em 60/30/15 dias e vencido; **badge no menu** com vencidos + críticos;
  painel `/vencimentos` com quatro cartões, filtros, tabela e exportação CSV.
- **Acesso:** admin, assistente e contador (escopado aos seus clientes). O **financeiro não acessa** —
  a RLS já nasce fechada para ele, sem depender do gate da tela.

### 3.8 NFS-e (notas fiscais de serviço)
Emissão e gestão de NFS-e pelo padrão nacional (nfse.gov.br / Sefin Nacional), com certificado digital.

- **NFS-e dos honorários (1 emitente):** o escritório emite as notas dos seus honorários; config do
  emitente + certificado A1 (cifrado) em Configurações → NFS-e (admin).
- **NFS-e dos clientes (multi-emitente):** cada cliente emite as próprias notas como prestador — config
  fiscal + certificado A1 por cliente (cifrado), numeração de DPS por cliente, tomador externo.
- **Emissão avulsa** e **emissão com o cliente como emitente** (preenche o tomador a partir do CNPJ).
- **Lote** (`/nfse/lote`): emissão/gestão em lote por competência; cancelamento.
- **Download em lote:** botões para baixar todas em **PDF** e em **XML**, com **cache do DANFSe** no
  Storage (baixas repetidas ficam instantâneas) e reprocessamento de falhas.

### 3.9 Cobrança
Envio da cobrança ao cliente por dois caminhos, com respeito ao opt-out do cliente.

- **Cobrança por WhatsApp (NFS-e + PIX/TED):** na tela de NFS-e em lote, painel que envia por WhatsApp a
  **NFS-e (PDF)** + a **mensagem de cobrança** com dados de pagamento. Seleção por lote com selo "já
  enviada", busca, progresso e reenvio de falhas. Mensagem configurável (Configurações → Dados de
  pagamento) com marcadores tolerantes a maiúscula/acento/espaço: `{NOME}`, `{EMPRESA}`, `{COMPETÊNCIA}`,
  `{VALOR}`, `{VENCIMENTO}`, `{CHAVE PIX}`, `{RAZÃO SOCIAL}`, `{CNPJ}`, `{BANCO}`, `{AG}`, `{CONTA}`,
  `{PAGAMENTO}`.
- **Régua de cobrança automática:** etapas configuráveis (ex.: D-3 / D+1 / D+7 / D+15), opt-out por
  cliente (LGPD), idempotência por (título, etapa). Motor server-side na rota protegida
  `/api/cron/regua-cobranca` (Bearer `CRON_SECRET`), **agendada via pg_cron** (execução diária), além
  do botão "Processar agora".
- **Boletos (construído; ativação pendente de conta no provedor):** emissão de boleto por título, com
  **seletor de provedor** (Configurações → Boletos, admin): **nenhum / Banco Inter / Asaas**. Inter via
  OAuth2 + mTLS; Asaas via API key; credenciais cifradas (AES-256-GCM, `BOLETO_CRIPTO_KEY`). Emissão,
  **baixa por webhook** de pagamento e envio do boleto ao cliente. Exige uma conta ativa no provedor
  para operar em produção.

### 3.10 Financeiro
Módulo completo de gestão financeira do escritório (admin/financeiro).

- **Contas a receber** e **contas a pagar:** títulos (RECEBER/PAGAR) com competência, vencimento,
  categoria, centro de custo, fornecedor; **baixas** (recebimentos/pagamentos), parcelamento, despesas
  recorrentes, **estorno auditado** (justificativa, não deleta).
- **Dashboard financeiro** (`/financeiro/dashboard`): saldo em caixa, MRR, recebido/a receber,
  inadimplência, previsão, aging de receber/pagar, fluxo de caixa (6 meses), maiores devedores, receita
  por tipo.
- **Orçamento:** grade editável (categorias × 12 meses) por ano, com totais e atalhos ("replicar nos 12
  meses", "copiar do ano anterior").
- **Orçado × Realizado:** dashboard comparativo por categoria, período ajustável
  (mês/trimestre/semestre/ano) e base **competência** ou **caixa**; cartões de resumo, barras por
  categoria, linha de evolução da receita e tabela estilo DRE.
- **Relatórios** (`/financeiro/relatorios`) — hub com três relatórios:
  - **DRE:** Demonstração de Resultado por período (competência ou caixa), com resultado operacional e
    líquido; imprimível.
  - **Extrato / movimentações:** alternador **Lançamentos** (títulos) × **Baixas**, com filtros
    (período, tipo, categoria, busca por cliente) e **exportação em CSV**.
  - **Fluxo de caixa detalhado:** matriz categoria × 12 meses combinando **realizado** (baixas) e
    **projetado** (títulos em aberto por vencimento), com **saldo acumulado** ao fim de cada mês, seletor
    de ano, exportação em CSV e impressão.
- **Conciliação bancária** (`/financeiro/conciliacao`): importação de extrato em **OFX** (v1 SGML e v2 XML)
  e **CSV** (mapeamento de colunas, valor no formato BR), com **prevenção de importação duplicada**
  (hash por FITID ou conta+data+valor+descrição) e prévia "novo × já importado". Motor de **casamento**
  por valor com sinal (crédito → a receber, débito → a pagar) e **auto-conciliação** dos casos 1:1
  inequívocos. Por movimento: conciliar com uma baixa existente, conciliar com um título (gera a baixa),
  **criar lançamento avulso** (título + baixa), ignorar ou reabrir (desvincula sem apagar). Um índice
  único garante que uma baixa se ligue a no máximo um movimento.
- **Indicadores da carteira** (`/financeiro/indicadores`): saúde da recorrência — **MRR**, **ticket médio**,
  clientes ativos, **churn** (de clientes e de receita), crescimento (novos × saídas) e evolução mês a mês
  (janela de 12 meses), com exportação em CSV e impressão. A saída do cliente é capturada por trigger
  (fotografa `data_saida` e o honorário vigente ao inativar; limpa ao reativar). O MRR histórico é uma
  **aproximação** (não há histórico de honorário), o que a própria tela sinaliza.
- **Cadastros:** plano de contas (categorias, natureza/DRE), centros de custo, contas bancárias,
  fornecedores, serviços e contratos de honorários (com sincronização do honorário do cliente).

### 3.11 Integração Domínio
Importação de contratos/dados a partir do sistema **Domínio** (admin/assistente): leitor `.xls` próprio,
prévia (novos/atualizados/pendências), reconciliação idempotente por CNPJ e auditoria.

### 3.12 Configurações (admin)
Central de integrações e credenciais:
- **WhatsApp (Z-API):** credenciais do provedor e teste de conexão.
- **NFS-e (emitente):** dados do emitente e certificado digital.
- **Boletos:** provedor (Inter / Asaas), credenciais cifradas, ambiente e conta bancária.
- **Dados de pagamento (PIX/TED):** conta e PIX enviados na cobrança.
- **Template de onboarding:** gerenciador de templates + interruptor de notificações de prazo.
- **Obrigações:** matriz de obrigações + interruptores de escalonamento e do badge de riscos.

### 3.13 Usuários (admin)
Gestão da equipe: convite de usuários, definição de papel e status (ativo/inativo). O papel real é
definido server-side (não confiável a partir do token). Cada usuário pode ter um **superior**
(`superior_id`), formando a cadeia hierárquica usada pelo escalonamento de obrigações.

---

## 4. Integrações externas

| Integração | Uso |
|---|---|
| **Z-API** | WhatsApp não-oficial (envio/recepção de texto e mídia, status de entrega/leitura). Webhook em `/api/webhooks/zapi/[secret]`. |
| **Receita Federal** | Consulta de CNPJ para preencher/atualizar cadastro. |
| **Sefin Nacional / provedor NFS-e** | Emissão e download de NFS-e (DANFSe/XML), com certificado digital A1. |
| **Clicksign** | Assinatura eletrônica de documentos. Webhook em `/api/webhooks/clicksign`. |
| **Banco Inter / Asaas** | Emissão e baixa de **boletos** (construído; ativação pendente de conta). Webhook em `/api/webhooks/boleto/[secret]`. |
| **Domínio** | Importação de contratos/dados contábeis (via relatórios `.xls`). |
| **Gotenberg** | Conversão Word → PDF (contratos) via LibreOffice headless. |

---

## 5. Infraestrutura e segurança

- **Banco (Supabase/Postgres):** schema versionado em `supabase/migrations/NNNN_*.sql`, aplicado por um
  runner próprio (`npm run db:migrate`); **Row-Level Security** em todas as tabelas sensíveis, por papel
  e por dono do cliente.
- **Storage (Supabase):** documentos, DANFSe (cache), mídia de atendimento e anexos de onboarding, com
  rotas de acesso controladas (URLs assinadas de curta duração).
- **Criptografia (AES-256-GCM):** credenciais do WhatsApp, certificados NFS-e, o **cofre de acessos** do
  onboarding e as credenciais de boleto são cifrados; chaves em variáveis de ambiente
  (`WHATSAPP_CRIPTO_KEY`, `ONBOARDING_CRIPTO_KEY`, `BOLETO_CRIPTO_KEY`) — definidas uma vez e **nunca
  alteradas** (mudar torna os dados cifrados irrecuperáveis).
- **Auditoria:** acesso a documentos, revelação de senhas do cofre e estornos financeiros são
  registrados (quem/quando), de forma não-forjável.
- **Agendamentos (pg_cron, em produção):** três jobs ativos no banco —
  1. `gerar-mensalidades-mensal` (`0 6 1 * *`) — chama a função SQL `gerar_mensalidades_automatico()`.
  2. `regua-cobranca-diaria` (`0 12 * * *`) — via `pg_net`, faz `POST` em `/api/cron/regua-cobranca`.
  3. `gerar-obrigacoes-mensal` (`0 12 1 * *`) — via `pg_net`, faz `POST` em `/api/cron/gerar-obrigacoes`.

  As rotas HTTP são protegidas por Bearer `CRON_SECRET` (comparação em tempo constante). Como os jobs 2
  e 3 carregam o segredo no header, eles **não vivem numa migration** (seria commitá-lo). São recriados
  pelo script idempotente **`npm run cron:bootstrap`** (lê `CRON_SECRET` e `APP_URL` do ambiente,
  preserva o `jobid`, aceita `--dry-run`). **Rodar após todo restore de banco** — sem os jobs, a régua e
  a geração de obrigações param em silêncio. Ver [`DEPLOY.md`](DEPLOY.md#41-jobs-agendados-pg_cron--rodar-após-qualquer-restore-de-banco).
- **Exportações CSV:** neutralizam injeção de fórmula (células iniciadas por `=`/`+`/`@` viram texto).
- **Saúde:** `/api/health` para verificação de disponibilidade.

---

## 6. APIs e webhooks

| Rota | Função |
|---|---|
| `GET /api/health` | Healthcheck. |
| `POST /api/webhooks/zapi/[secret]` | Recebe eventos do WhatsApp (mensagens, status). |
| `POST /api/webhooks/clicksign` | Recebe eventos de assinatura de documentos. |
| `POST /api/webhooks/boleto/[secret]` | Recebe eventos de pagamento de boleto (baixa automática). |
| `POST /api/cron/regua-cobranca` | Execução agendada da régua de cobrança (Bearer `CRON_SECRET`). |
| `POST /api/cron/gerar-obrigacoes` | Geração mensal das instâncias de obrigações (Bearer `CRON_SECRET`). |
| `GET /api/atendimento/midia/[id]` | Serve a mídia de atendimento (com controle de acesso). |

---

## 7. Estado por área

**Concluído e em produção:**
- Comercial (funil Kanban, conversão, propostas, métricas).
- Clientes (cadastro, RF, contratos, documentos, assinatura).
- Onboarding & Legalização — motor de templates, cofre, regras de item, alertas in-app, gatilho de
  consultoria (base RF-010 e ciclos A/B/C entregues).
- **Obrigações e Compliance** — matriz + motor de prazos (dias úteis/feriados), geração mensal automática,
  baixa com comprovante, painel de riscos, escalonamento hierárquico, geração retroativa/suspensão e
  relatório de conformidade.
- **Certificados e procurações** — cadastro por cliente, alertas escalonados em 60/30/15 dias, painel
  global com badge, filtros e CSV, lendo também a validade do A1 da NFS-e sem duplicá-la.
- NFS-e (honorários + multi-emitente).
- Atendimento WhatsApp (inbox bidirecional, mídia, read receipts).
- Financeiro (contas a pagar/receber, orçamento, orçado × realizado, dashboard, **trilogia de
  relatórios: DRE + Extrato/CSV + Fluxo de caixa detalhado**, **conciliação bancária OFX/CSV** e
  **indicadores de carteira: MRR, ticket médio, churn**).
- Cobrança por WhatsApp + régua automática agendada (pg_cron).
- Integração Domínio; rebrand SALDO (design system) 100% aplicado.

**Construído, ativação pendente:**
- **Boletos** (Inter/Asaas) — código completo; aguarda conta ativa no provedor para operar em produção.

**Em aberto / próximos:**
- **Onboarding — Legalização/societário (F2):** processos por órgão e protocolos; templates por tipo de
  serviço societário; comunicação automática de status; transferência de contabilidade (NBC PG 01).
- **Financeiro:** aprovação de pagamento; na conciliação, casamento parcial (1 título ↔ vários
  movimentos), tolerância de valor e conferência de saldo extrato × sistema.
- **Obrigações:** curadoria da matriz e flags fiscais explícitas no cadastro do cliente (hoje derivadas
  de nº de funcionários e inscrições).
- **Whitelabel/multi-tenant** (comercialização) e **endurecimento de segurança/LGPD** (marcos V9/V10 do
  [ROADMAP](../ROADMAP.md)).

---

## 8. Convenções do projeto

- **Migrations** são imutáveis após aplicadas; mudança = nova migration idempotente.
- **RBAC** é fonte única (`usuarios.papel` via `auth_papel()`); nunca ler papel do token.
- **Tabelas-filhas de cliente** delegam o isolamento à RLS de `clientes` (via `EXISTS`); tabelas
  pré-cliente usam RLS por papel.
- **Ciclo de trabalho:** brainstorm → spec (`docs/superpowers/specs/`) → plano (`docs/superpowers/plans/`)
  → execução, com TDD nos helpers puros.
- Antes de cada entrega: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
