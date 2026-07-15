# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota o
[Versionamento Semântico](https://semver.org/lang/pt-BR/). Veja as regras em
[`docs/VERSIONAMENTO.md`](docs/VERSIONAMENTO.md) e o plano de evolução em [`ROADMAP.md`](ROADMAP.md).

## [Não lançado]

### Adicionado

- **Backup e teste de restauração (RNF-06) — fecha o V10:** dump próprio do schema `public`
  (**`backup:dump`**) com retenção 7 diários + 4 semanais e envio a bucket S3-compatível (SigV4 próprio, sem
  SDK); **verificador pós-restore** (**`restore:verificar`**) que prova, contra um banco restaurado, que
  dados, extensões, crons, admin, as 5 DEKs e a cripto voltaram; runbook de restauração (ensaio num projeto
  descartável) no DEPLOY.md; o `tenant:doctor` avisa quando o dump local está velho ou ausente. O dump
  próprio é **redundância do negócio** — auth/storage seguem cobertos pelo backup do Supabase.

- **Envelope encryption (V10-B):** rotação de chave sem re-cifrar dado. Uma **chave-mestra**
  (`MASTER_CRIPTO_KEY`) cifra 5 **DEKs** (uma por domínio) em `chave_dados`; cada DEK é o valor da chave
  atual, então o ciphertext existente decifra sem tocar. `cifrarDominio`/`decifrarDominio` com **fallback**
  para o env na transição. Scripts **`cripto:migrar`** e **`cripto:rotacionar`** com **auto-teste em dado
  real** (rollback se a DEK não decifrar). Provisionador gera a mestra e migra; `tenant:doctor` confere as
  5 DEKs. `chave_dados` é service_role-only.

- **LGPD (V10-A):** conformidade com a Lei Geral de Proteção de Dados. **Relatório de dados por titular**
  (direito de acesso em PDF + portabilidade em JSON), **registro de tratamentos (ROPA)** pré-semeado e
  editável, **histórico de consentimento** (cada mudança de opt-in vira evento) e **exclusão por
  anonimização** que respeita a guarda fiscal — anonimiza os dados pessoais não-fiscais e preserva o
  esqueleto fiscal, com a retenção documentada. Tabelas admin-only.

## [6.0.0] — 2026-07-15

### Adicionado

- **V9 — Multi-tenant (um banco e um app por escritório):** ferramental de provisionamento —
  **`tenant:novo`** (cria o projeto Supabase, roda as migrations, gera as chaves do escritório, cria o admin
  e registra os crons), **`tenant:adotar`** (traz um escritório existente para o registro),
  **`db:migrate:all` / `db:test:all` / `cron:bootstrap:all`** (laços com **falha ruidosa**) e
  **`tenant:doctor`** (diagnóstico de deriva: migrations, crons, admin, chaves e app). Segredos por
  escritório em `tenants/<slug>.env`, **fora do git** (o script aborta se o caminho não estiver ignorado).
  **Não existe comando de remover tenant**, por decisão de segurança. O app e o schema **não mudaram**.

### Alterado

- **Menu lateral enxuto:** Propostas, Obrigações, Escalonamento, Vencimentos, Conciliação, Rentabilidade,
  Integração Domínio e Usuários saíram da barra e passaram a viver **dentro da seção a que pertencem**
  (Comercial, Clientes, Financeiro e Configurações). Os **badges de alerta** de Obrigações, Escalonamento e
  Vencimentos **somam no item Clientes** e aparecem individualmente na sub-navegação de lá — um alerta que
  ninguém vê é um alerta que não existe. O assistente passa a acessar Configurações (só a Integração
  Domínio), que antes era admin-only.

### Adicionado

- **Solicitações internas entre departamentos (RF-045):** pedidos de um departamento a outro, com **SLA por
  departamento de destino** (calculado no servidor — quem abre não escolhe o prazo) e **fila de atendimento**
  (nasce sem dono; quem atende **assume**). Thread, converter em tarefa, filtros (destino, origem, status,
  SLA vencido, só as minhas, sem responsável) e contador de fila no Início. Gatilho impede forjar autoria,
  status e prazo. Novo campo **departamento** do colaborador (tela de Usuários).

- **Timesheet (RF-043) e Rentabilidade por cliente (RF-044):** apontamento de horas **manual** e por
  **cronômetro** (com trava de 8h contra cronômetro esquecido), por cliente e tarefa. **Custo/hora por
  colaborador com vigência**, em tabela **admin-only** (dado salarial — nem o financeiro vê o valor
  individual). Relatório de **rentabilidade** por cliente e período: horas, custo, **recebido × contratado**
  lado a lado, margem R$/% e R$/hora, ordenado pelos piores primeiro, com aviso de cliente **sem
  apontamento** (custo zero não é cliente barato — é ninguém apontou).

- **Comunicados em massa segmentados (RF-055):** avisos de legislação e prazos para um **segmento** da base
  — por regime, tipo, status, **município/UF**, contador ou responsável de departamento (E entre critérios,
  OU dentro de cada um; município compara sem acento/caixa). **Prévia obrigatória** com contagem, lista e
  **excluídos com motivo**, mais "Enviar teste para mim". Canal **e-mail** (sem teto) ou **WhatsApp** (teto de
  50 + aviso de risco de banimento do número). Registro por destinatário, **"Reenviar falhas"** e **opt-out
  próprio** (`aceita_comunicados`), distinto do de cobrança.

- **Tarefas — recorrência, calendário e SOPs (RF-040/041/042):**
  - **Tarefas recorrentes:** molde + regra (semanal/mensal/trimestral/anual) com **antecedência**, geradas
    por **cron diário às 9h**. Idempotência por `(recorrencia_id, competencia)`; dia 31 em mês curto cai no
    último dia. Botão "Gerar agora".
  - **Calendário:** terceira vista do painel, com grade mensal, navegação preservando os filtros e faixa
    "Sem prazo".
  - **Modelos de processo (SOPs):** etapas com responsável por papel, prazo relativo e checklist, que
    **viram tarefas**. Etapas na mesma **onda** são paralelas; a onda seguinte nasce **sozinha** (trigger no
    banco) quando a anterior fecha. Iniciar processo na ficha do cliente ou no painel de tarefas.
  - **Novo job pg_cron** `tarefas-recorrentes-diaria` — rodar `npm run cron:bootstrap` após o deploy.

- **Régua de cobrança por e-mail (RF-051, Fatia B):** o e-mail vira o **canal redundante** do WhatsApp
  (canal não oficial, sujeito a banimento pela Meta). Se o WhatsApp não entrega — não configurado, cliente
  sem telefone, opt-out ou erro do provedor —, a cobrança sai por e-mail; se entregou, o e-mail não sai.
  Idempotência **entre canais** por (título, etapa). Cada etapa ganha assunto e corpo de e-mail (em branco,
  reaproveita o texto do WhatsApp) e o histórico da régua mostra o canal de cada envio.

### Alterado

- **`cobranca_whatsapp = false` não silencia mais o cliente por completo:** passa a significar apenas
  "não cobrar por WhatsApp" — o e-mail assume. A ficha do cliente agora tem **dois** interruptores
  ("Cobrar por WhatsApp" / "Cobrar por e-mail"); para silêncio total, desligue os dois. **Clientes hoje com
  o WhatsApp desligado voltarão a ser cobrados, agora por e-mail.**

- **E-mail integrado (RF-051, Fatia A):** canal de e-mail do escritório — **SMTP** (qualquer provedor que
  ele já use) ou **API** (Resend/SendGrid), com credencial cifrada (`EMAIL_CRIPTO_KEY`) e **envio de teste**.
  **Templates com variáveis** (mesma sintaxe da régua) e prévia. Na **ficha do cliente**, botão
  **Enviar e-mail** com anexos (documentos, comprovantes de obrigações e DANFSe) resolvidos **por id** via
  RLS, e **histórico** de todos os envios — inclusive as falhas, com a mensagem do provedor.

- **Portal do cliente (Fatia C) — Solicitações (RF-054):** o cliente abre pedidos pelo portal
  (categoria, assunto e descrição) e conversa com o escritório numa **thread**. Cada solicitação ganha
  **número sequencial** e **prazo por SLA** configurável em Configurações → Marca. A equipe atende em
  **`/solicitacoes`** (filtros por status, categoria e **SLA vencido**), responde, **atribui responsável**,
  muda o status e **converte em tarefa**. Um gatilho `before insert` sobrescreve no servidor os campos
  forjáveis (autoria, número, prazo, status, responsável), impedindo falsificação via API.

- **Conciliação bancária (Fatia B):** casamento das movimentações com o financeiro — **conciliar** com
  baixa já lançada ou com título em aberto (cria a baixa), **criar lançamento avulso** (despesa com
  fornecedor / receita com cliente), **ignorar** e **reabrir**, além do botão **"Conciliar automáticos"**
  (casa os inequívocos por valor). Conclui a conciliação bancária.
- **Conciliação bancária (Fatia A):** importação do extrato bancário em **OFX** e **CSV** (com
  mapeamento de colunas) por conta, com **deduplicação** (não reimporta a mesma linha) e prévia; tela
  **Conciliação** (`/financeiro/conciliacao`) com as movimentações por período e totais de crédito/débito.

- **Obrigações e Compliance (Fatia 3B):** clientes **inativos** deixam de gerar obrigações e somem das
  telas de risco/escalonamento/calendário (voltam ao reativar); **geração retroativa em lote** (backfill
  de um mês inicial até o atual, no calendário e na ficha); **relatório de conformidade**
  (`/obrigacoes/conformidade`) por competência, com % de conformidade, quebra por cliente, CSV e impressão.
- **Obrigações e Compliance (Fatia 3A — escalonamento):** hierarquia de usuários (campo Superior em
  Usuários) e **escalonamento** das obrigações muito atrasadas do responsável para o líder e o sócio,
  com limiares configuráveis e liga/desliga (Configurações → Matriz de obrigações); página
  **Escalonamento** (`/obrigacoes/escalonamento`) e badge no menu com o que subiu para você.
- **Obrigações e Compliance (Fatia 2):** **baixa de obrigação** com comprovante (anexo PDF/PNG/JPG,
  obrigatório por obrigação via flag na matriz) registrando quem entregou e quando, além de dispensar
  e reabrir; **painel de riscos** (`/obrigacoes/riscos`) com Vencendo hoje / Vencidas / Sem responsável,
  agrupado por responsável, e badge no menu.
- **Obrigações e Compliance (Fatia 1):** matriz de obrigações parametrizável (Configurações → Matriz de
  obrigações, admin) com critérios de incidência (perfil/regime, flags, UF, CNAE) e regras de prazo
  (dia útil + feriados nacionais, prazo interno); **geração automática do calendário** por cliente e
  competência (mensal/trimestral/anual), via botão e cron mensal (idempotente); tela **Obrigações**
  (calendário do mês, filtros e selo de severidade) e seção na ficha do cliente.
- **Financeiro — Fluxo de caixa detalhado:** novo relatório em `/financeiro/relatorios/fluxo` (no hub de
  Relatórios): matriz de categorias × 12 meses combinando **realizado** (baixas) e **projetado**
  (títulos em aberto por vencimento), com **saldo acumulado** ao fim de cada mês, seletor de ano,
  exportação em CSV e impressão.
- **Financeiro — Extrato/movimentações:** novo relatório em `/financeiro/relatorios/extrato` (no hub de
  Relatórios) que alterna entre **Lançamentos** (títulos) e **Baixas**, com filtros (período, tipo,
  categoria, busca por cliente) e **exportação em CSV**.
- **Onboarding — ligar/desligar notificações de prazo:** em Configurações → Template de onboarding, o admin
  pode desativar os alertas de prazo (o badge no menu e a tela de alertas somem para todos). Vêm ligados
  por padrão.

- **Financeiro — DRE:** novo relatório de Demonstração de Resultado em `/financeiro/relatorios/dre`
  (também no hub `/financeiro/relatorios`, com link no dashboard). Receitas − despesas por categoria e
  grupo (operacional/não), com resultado operacional e líquido, por período (mês/trimestre/semestre/ano) e
  regime competência/caixa. Imprimível.

- **Boletos — baixa automática + envio:** quando o cliente paga o boleto, o webhook do provedor dá baixa
  no título automaticamente (marca como BAIXADO) e registra o boleto como pago. A cobrança por WhatsApp
  passa a incluir a linha digitável e o PIX copia-e-cola do boleto. Requer a variável
  `BOLETO_WEBHOOK_SECRET` e cadastrar a URL do webhook no painel do provedor. Fecha o módulo de boletos.

- **Boletos — emissão:** em Contas a receber, cada título ganha "Emitir boleto" (usa o provedor configurado
  em Configurações → Boletos) e passa a exibir a linha digitável e o PIX copia-e-cola. Configure a conta de
  recebimento na tela de Boletos. (A baixa automática por pagamento vem na próxima etapa.)

- **Boletos — adaptador Inter:** implementado o adaptador do Banco Inter (emissão de boleto BoléPix via
  OAuth2 + mTLS e interpretação do webhook), pronto para ser ligado na emissão. Ainda não é acionado pela
  interface — isso vem na etapa de emissão. Nomes de campo/situação podem exigir acerto no primeiro teste
  ao vivo com a conta Inter.

- **Boletos — adaptador Asaas:** implementado o adaptador do provedor Asaas (emissão de boleto híbrido
  boleto+PIX e interpretação do webhook de pagamento), pronto para ser ligado na emissão. Ainda não é
  acionado pela interface — isso vem na etapa de emissão.

- **Boletos (fundação):** Configurações → Boletos permite escolher o provedor de emissão (Banco Inter ou
  Asaas) e guardar as credenciais cifradas. A emissão em si vem nas próximas etapas. Requer a variável
  `BOLETO_CRIPTO_KEY` para salvar credenciais.

- **Comercial — propostas formais:** cada oportunidade pode ter propostas de honorários (itens com valor e
  recorrência mensal/único, validade, condições). Um documento formatado ("Proposta de Honorários", com
  totais e dados de pagamento) abre para impressão/compartilhamento. Marcar a proposta como Enviada/Aceita
  move a oportunidade no funil (Proposta/Ganho).

- **Comercial — métricas do funil:** tela `/comercial/metricas` com o pipeline atual (total e por etapa) e
  os fechamentos por período (mês/trimestre/semestre/ano, navegável): ganhos, perdidos, **taxa de
  conversão**, desempenho por responsável e motivos de perda. Link "Métricas" no quadro.

- **Onboarding × Comercial — gatilho de consultoria:** em qualquer item do processo de onboarding, um botão
  **"Gerar oportunidade de consultoria"** cria uma oportunidade no funil comercial já ligada ao cliente
  (serviço "Consultoria: …", etapa Novo). O item passa a mostrar "criada ✓ · ver no funil". Fecha o Ciclo C.

- **Módulo Comercial — funil de oportunidades:** nova área `/comercial` com um quadro de prospects por
  etapa (Novo → Contato feito → Proposta enviada → Negociação), cada coluna somando quantidade e valor.
  Move com ← →, marca **Ganho**/**Perdido** (com motivo) e, ao ganhar, **converte em cliente**
  pré-preenchido que já leva ao onboarding. Item "Comercial" no menu (admin/assistente/contador).

### Alterado

- **Comercial — Kanban:** no quadro do funil, agora dá para **arrastar os cards** entre as colunas
  (Novo → Contato feito → Proposta enviada → Negociação); ao soltar, a etapa muda. As setas ← → e os
  botões Ganho/Perdido continuam (fallback no celular).

- **Onboarding — página própria por cliente:** o onboarding de cada cliente agora abre em uma página
  dedicada (`/onboarding/[cliente]`), acessada pela lista de processos, pelos alertas e por um link no
  cadastro. O cadastro do cliente deixou de exibir a seção completa (ficou mais curto).

### Adicionado

- **Onboarding — alertas de prazo:** tela `/onboarding/alertas` lista os itens do processo vencendo (nos
  próximos 3 dias) ou vencidos, agrupados por severidade (vence em breve / vencido / crítico), com o
  responsável e link para o cliente; filtro "só os meus". Um badge no menu mostra a contagem. Respeita o
  isolamento por cliente (contador vê só os seus).

- **Onboarding — construtor de templates:** Configurações → Template de onboarding vira um gerenciador de
  vários templates (criar, ativar/desativar, excluir) com editor por template — criar/editar/remover e
  **reordenar blocos e itens** (↑↓). Ao iniciar um processo, escolhe-se qual template aplicar.

- **Onboarding — dependências, competência e anexos (Ciclo B):** itens do processo agora respeitam
  **dependências** (não conclui enquanto os pré-requisitos não estiverem concluídos/dispensados),
  exigem **anexo** quando obrigatório (upload de PDF/imagem no processo) e gravam a **competência inicial**
  no cadastro do cliente ao concluir o item da data de corte. O editor de template permite definir os
  códigos de dependência e o campo de destino por item.

- **Onboarding de cliente — motor de processo:** workflow de entrada estruturado em **blocos**, com
  **prazos relativos** (D+n a partir da data de início), **perfis de cliente** (MEI, Simples com/sem
  funcionários, Presumido/Real, PF) e **condições** que filtram os itens ao instanciar. Template padrão
  de transferência de contabilidade (7 blocos, ~36 itens) semeável em Configurações → Template de
  onboarding, com itens editáveis. A aba do cliente instancia o processo (perfil + condições) e mostra os
  itens por bloco com prazo, itens **bloqueantes** e **alertas de risco**. Itens de "acesso" guardam
  URL/login e **senha cifrada** (cofre); revelar é restrito a admin/contador e auditado (fail-closed).
  RLS com **isolamento por cliente** (contador só os seus). Tela global /onboarding lista os processos
  com perfil, progresso e atraso. Requer a variável `ONBOARDING_CRIPTO_KEY`.

- **Financeiro — Orçado × Realizado:** dashboard comparativo por categoria, com período ajustável
  (mês/trimestre/semestre/ano) e base competência ou caixa; cartões de resumo (Receitas/Despesas/
  Resultado com variação), gráfico de barras por categoria, linha de evolução da receita no ano e tabela
  estilo DRE com variação colorida.

- **Financeiro — Orçamento:** tela para definir o orçado por categoria em cada mês do ano (grade
  editável Receitas/Despesas × 12 meses, com totais e atalhos "replicar nos 12 meses" e "copiar do ano
  anterior"). Base do dashboard Orçado × Realizado (próxima etapa).

### Corrigido

- **Datas — fuso horário:** `formatarData` mostrava o **dia anterior** para colunas `date` puras
  (ex.: vencimento/competência `2026-07-10` → "09/07") porque convertia UTC→São Paulo. Agora datas puras
  (`YYYY-MM-DD`) são formatadas direto, sem deslocamento; timestamps seguem convertendo para o fuso.
- **Cobrança — marcadores da mensagem:** o template da nota agora reconhece os marcadores de forma
  tolerante (ignora maiúscula/acento/espaço/pontuação): `{NOME}` (contato), `{EMPRESA}`, `{COMPETÊNCIA}`,
  `{VALOR}`, `{VENCIMENTO}`, `{CHAVE PIX}`, `{RAZÃO SOCIAL}` (favorecido), `{CNPJ}`, `{BANCO}`, `{AG}`,
  `{CONTA}`, `{PAGAMENTO}`. Antes só batia nomes minúsculos exatos e quebrava com acento/espaço, saindo
  literais/vazios. O vencimento vem do honorário do mês.
- **NFS-e — download em lote:** botões **separados** para baixar todas em **PDF** e todas em **XML**;
  **cache do DANFSe** no storage (bucket `documentos`, `danfse/{chave}.pdf`) com **pré-carregamento na
  emissão** — o ADN nacional (que retornava 502/429 em lote) passa a ser tocado 1×/nota, e as baixas
  seguintes vêm do storage (instantâneas, sem erro), em **paralelo**. Botão "Rebaixar só as que faltaram"
  reprocessa apenas as falhas.

### Adicionado

- **Atendimento — nova tela (Fatia A):** página inteira em 3 colunas (conversas · thread · contato),
  chat estilo WhatsApp (separador por dia + horário), lista com busca, abas Todas/Não lidas/Favoritos,
  favoritar conversa, nova conversa e menu "marcar todas como lidas"; painel do contato com o cliente
  casado pelo telefone (regime, CNPJ, honorário, situação) e atalho para a ficha.
- **Atendimento — recibos de entrega/leitura:** cada mensagem enviada mostra `✓` (enviada), `✓✓`
  (entregue) e `✓✓` em azul (lida), via eventos de status do Z-API casados pelo `messageId`.
- **Atendimento — mídia (Fatia B):** recebe imagem/áudio/documento do cliente (baixados e guardados no
  storage, com proteção anti-SSRF e teto de tamanho) e envia imagem/PDF por anexo no composer; imagens
  viram miniatura, áudio vira player e documento vira chip com download. A rota que serve a mídia força
  download de tipos não seguros (anti-XSS).
- **Atendimento — status e atendente (Fatia C):** cada conversa tem estado (aberta/pendente/finalizada)
  e responsável; abas por status; quem responde assume a conversa; receber ou responder reabre uma
  conversa finalizada.
- **Atendimento — nome do cliente:** a conversa mostra a razão social (empresa) + o responsável (contato)
  do cadastro no lugar do telefone, casando pelo número; a "nova conversa" permite buscar um cliente
  cadastrado (além de digitar um número avulso).
- **Cobrança — envio de notas + PIX/TED (WhatsApp):** na tela de NFS-e em lote, o painel lista as NFS-e
  autorizadas com seleção por caixas (selo "já enviada", pré-marcando só as pendentes) e busca; envia às
  selecionadas a NFS-e (PDF) + a mensagem com dados de pagamento (PIX/TED), com progresso e reenvio das
  falhas; não reenvia quem já recebeu e respeita o opt-out. Dados bancários em Configurações → Dados de
  pagamento.

- **V8.2d — Rollout SALDO final (fecha a V8):** identidade SALDO nos 19 arquivos restantes —
  **atendimento** (inbox de chat com balões saída-verde/entrada-neutro + badge de não-lidas),
  **usuários** (badge de papel via `badgePapel`), **integração Domínio** (uploads/prévias/Receita),
  **documentos**, **assinatura/contrato**, **config WhatsApp** e sobras; `CardResumo` legado removido.
  **Gate final atingido: zero resíduo de estilo antigo em `src`** — toda a plataforma na identidade
  SALDO. Só apresentação; actions/RLS/uploads/Clicksign inalterados.
- **V8.2c — Rollout SALDO (NFS-e):** identidade SALDO nas 13 telas de NFS-e — lista de notas (badge de
  status via `badgeStatusNfse`, número/valor em mono), emissão (avulsa e por honorário), emissão em
  lote e configuração do emitente/certificado. Só apresentação; mTLS/SEFIN/actions/RLS inalterados e a
  **emissão avulsa preservada**. Próxima fatia: V8.2d (atendimento/integrações/documentos/assinatura/usuários).
- **V8.2b — Rollout SALDO (Financeiro):** identidade SALDO aplicada às 10 telas/componentes do módulo
  financeiro — dashboard (StatCards + barras recoloridas verde/violeta, valores em mono), contas a
  receber/pagar (tabelas com **badges de status** e valores mono), régua de cobrança, `CadastroCrud`
  genérico (cobre as 5 telas de cadastro) e hubs/headers. Novo helper `badgeStatusTitulo` (status do
  título → cor). Só apresentação; cálculos/actions/RLS inalterados. Próximas fatias: V8.2c (NFS-e),
  V8.2d (atendimento/integrações/resto).
- **V8.2a — Rollout SALDO (Auth + Clientes):** recomponentização profunda (estilo Apple) das áreas de
  **autenticação** e **clientes**. Guia de linguagem (`docs/design/saldo-ui.md`) + **primitivos ampliados**
  (`Campo`/`Input`/`Select`/`Textarea`, `Painel`, `Chip`, `Toolbar`, `EmptyState`, `Iniciais`) e helpers
  puros (`iniciais`, `badgeRegime`). **Lista de clientes** repaginada (toolbar de busca, tabela com
  iniciais, CNPJ em mono, badges de regime e pills de situação), **ficha** e **formulários** re-skinnados,
  **login/recuperação/404** com a identidade SALDO. Lógica/permissões/RLS inalteradas. Próximas fatias:
  V8.2b (financeiro), V8.2c (NFS-e), V8.2d (atendimento/integrações/resto).
- **V8.1 — Fundação do Design System SALDO:** rebrand visual do CRM como **SALDO** (`seusaldo.ai`).
  Tokens de cor/tipografia no Tailwind 4 `@theme` (verde `#0FA968`, tinta, violeta, creme…) + fontes
  **self-hosted** (Space Grotesk / IBM Plex Sans / IBM Plex Mono via `next/font`). Componente
  **`LogoSaldo`** (SVG, 4 variantes) + **favicon** SALDO. Primitivos reutilizáveis em `src/components/ui/`
  (**Card, Botao, Badge, PageHeader, StatCard**). **Sidebar** escura com item ativo verde e **menu
  recolhível (drawer) no mobile**; shell com fundo creme; **dashboard** reestilizado (StatCards, números
  em Space Grotesk) — tudo **responsivo**. Sem migration. O rollout às demais telas é a V8.2.
- **V7.3 — Atendimento / Inbox WhatsApp (fecha a V7):** caixa de entrada bidirecional. `whatsapp_mensagem`
  vira **bidirecional** (`direcao` IN/OUT, `lida`, `z_message_id`) — a conversa é **derivada por telefone**,
  então a thread já nasce **unificada** (recebidas + respostas + cobranças/régua). **Webhook**
  `POST /api/webhooks/zapi/[secret]` (protegido por `ZAPI_WEBHOOK_SECRET`) com **dedup** por `z_message_id`
  e resolução best-effort do cliente. Tela **`/atendimento`** (menu; gate admin/financeiro/contador):
  dois painéis, resposta na thread, badge de não-lidas, atualização por **polling**. Só texto (mídia
  recebida vira marcador). Migration 0040.
- **V7.2 — Régua de Cobrança Automática:** cobrança dos honorários por WhatsApp em **etapas
  configuráveis** (seed D-3/D+1/D+7/D+15) sobre os títulos a receber. Tela **`/financeiro/regua-cobranca`**
  (admin/financeiro): toggle liga/desliga, **CRUD das etapas** (dias, template com `{nome}/{valor}/{vencimento}/{dias}`),
  botão **"Processar agora"** e histórico. **Opt-out por cliente** (LGPD) na ficha
  (`clientes_financeiro.cobranca_whatsapp`). **Idempotência** por `(titulo, etapa)` — cada etapa dispara
  uma vez. Motor server-side (`regua-motor.ts`) acionado pela rota protegida **`POST /api/cron/regua-cobranca`**
  (`CRON_SECRET`, service_role) + agendador externo diário, e pelo botão manual. Reusa o cliente Z-API,
  templates e histórico da V7.1. Migration 0039.
- **V7.1 — Envio WhatsApp (fundação, Z-API):** integração com o **Z-API** (provedor não-oficial) para
  envio de mensagens. Tela **`/configuracoes/whatsapp`** (admin) com credenciais **cifradas**
  (AES-256-GCM, env `WHATSAPP_CRIPTO_KEY`) e botão **testar conexão**. Cliente isolado em
  `whatsapp/zapi.ts` (trocar de provedor = só esse arquivo), helpers de normalização de telefone e
  templates de mensagem. Botão **"Cobrar (WhatsApp)"** num título de contas a receber → envia a
  cobrança e grava **histórico** (`whatsapp_mensagem`). Fundação reusada pela régua automática (V7.2).
  Migration 0038. *(Também corrige o `somaBaixado` em contas a receber para ignorar baixas estornadas.)*
- **V6.3 — Contas a Pagar + Estorno Auditado (fecha o Módulo Financeiro):** o `titulo` passa a ter
  **tipo RECEBER/PAGAR** (+ fornecedor + parcelamento). Nova tela **`/financeiro/contas-a-pagar`**
  (admin/financeiro): lançar despesa **única**, **parcelada** (N parcelas com rateio) ou **recorrente**
  (template que gera todo mês, inclusive na automação pg_cron), **pagar** (baixa na conta de saída) e
  **anexar** NF/boleto/comprovante. **Estorno auditado** (marca a baixa com justificativa, não deleta;
  o status é recalculado ignorando estornadas) substitui o "desfazer baixa" em receber e pagar. O
  **dashboard** ganha o lado despesa: **saldo real** (entradas − saídas), saídas/a pagar do mês,
  **aging de contas a pagar** e receita × despesa — o aviso de "só entradas" saiu. Migrations 0033–0037.
  Aprovação de pagamento acima de limite fica como incremento futuro.
- **V6.5 — Relatórios e Dashboard financeiro:** página **`/financeiro/dashboard`** (gate financeiro) com
  cards de **saldo, MRR, recebido/a receber, inadimplência (R$ e %) e previsão de caixa 30/60/90**;
  **aging** de contas a receber (a vencer / 1–30 / 31–60 / 61–90 / 90+) em barras; **fluxo de caixa**
  dos últimos 6 meses (recebido × a receber); **maiores devedores** e **receita por tipo**
  (mensalidade × 13º). RPCs de agregação SECURITY INVOKER (a RLS escopa o contador). Barras/tabelas em
  CSS puro (sem biblioteca). Ressalva na tela: valores refletem só **entradas** até as contas a pagar
  (V6.3). Migration 0032.
- **V6.2 — Motor de Recorrência (contas a receber):** entidade **contrato** de honorários na ficha do
  cliente (vários por cliente; ao salvar, **sincroniza o honorário** — a NFS-e passa a faturar pelo
  contrato sem mudar o caminho fiscal). **Geração de mensalidades** (botão "Gerar mensalidades do mês"
  + **automação** mensal via pg_cron, ligável por toggle) com **pró-rata** no 1º mês, **13º** e
  **idempotência**. Tela **`/financeiro/contas-a-receber`**: título por competência, **baixa
  (recebimento)** na conta bancária (total/parcial, com juros/multa/desconto) e **desfazer baixa**.
  Status do título derivado das baixas (trigger). Migrations 0028–0031; RLS financeira (admin/
  financeiro tudo, contador só os seus). A **NFS-e avulsa** permanece intocada.
- **V6.1 — Fundação Financeira (primeira fatia da V6):** cadastros de apoio do módulo financeiro —
  **contas bancárias**, **plano de contas** (hierárquico, 2 níveis, com seed padrão), **centros de
  custo** (seed dos 6 departamentos), **fornecedores** (com validação de CNPJ/CPF) e **tabela de
  serviços** eventuais — em `/financeiro/cadastros/*`. Estende a ficha do cliente com **dia de
  vencimento, qtd. de funcionários, faixa de faturamento e data de saída**. Permissões em
  `src/lib/financeiro/permissoes.ts` (admin+financeiro gerenciam; contador lê plano de contas e
  serviços; assistente não vê nada financeiro), espelhadas na RLS (migration 0026). Pró-rata
  (RF-013) e o status financeiro suspenso/encerrado ficam para o **V6.2** (nascem no contrato).

- Em planejamento: **V6.2 — Motor de recorrência** (contratos + geração de mensalidades) — ver `ROADMAP.md`.

## [5.4.0] — 2026-07-02

### Adicionado

- **Cancelamento de NFS-e:** botão **"Cancelar"** nas notas autorizadas (na ficha do cliente), com
  **motivo** (Erro na emissão · Serviço não prestado · Outros) + **justificativa**. Envia o **evento
  de cancelamento** assinado à Sefin (`/nfse/{chave}/eventos`, mTLS) e marca a nota como
  **cancelada** (`nfse.cancelado_em`/`cancelamento`, migration 0023). Rejeição da Sefin (fora do
  prazo etc.) mantém a nota autorizada e mostra o motivo. Assinatura e POST mTLS agora são
  compartilhados entre a emissão (DPS) e o evento.

## [5.3.0] — 2026-07-02

### Adicionado

- **NFS-e avulsa (serviço extra):** a ficha permite emitir **mais de uma nota** por cliente na mesma
  competência — com **valor editável** (pré-preenchido com o honorário), **descrição** própria e um
  checkbox **"nota avulsa"**. A trava anti-duplicidade vale só para a nota **recorrente**; a emissão
  em lote passa a considerar só recorrentes ao marcar "já emitida" (um cliente com apenas uma avulsa
  segue apto para a recorrente). Coluna `nfse.avulsa` (migration 0022).

## [5.2.4] — 2026-07-02

### Corrigido

- **dhEmi / E0008:** a data de emissão da DPS passa a ter uma **margem de 2 min no passado**, para
  absorver desvio de relógio do servidor e evitar a rejeição "E0008 — data de emissão posterior à
  data de processamento".

## [5.2.3] — 2026-07-02

### Adicionado

- **Marcar/desmarcar todos** no lote: checkbox no cabeçalho da tabela alterna todas as notas aptas de
  uma vez — útil para emitir só 2-3 num universo de 60+ (desmarca tudo e escolhe as poucas).

## [5.2.2] — 2026-07-02

### Corrigido

- **Numeração da DPS (E0014):** o `nDPS` passa a vir de uma **sequência dedicada** (`nfse_dps_seq`,
  migration 0021) em vez da contagem de linhas — monotônico e **sem reuso** mesmo após exclusão de
  notas. Antes, apagar notas fazia a contagem cair e reusar números de DPS já enviados, causando
  "E0014 … já existe em uma NFS-e gerada a partir de uma DPS enviada anteriormente".

## [5.2.1] — 2026-07-02

### Adicionado

- **Retry de erro transitório da Sefin:** a emissão retenta automaticamente quando a Sefin devolve
  **E0082** (instabilidade da consulta ao cadastro CNPJ do prestador) — evita rejeições falsas em
  lotes grandes. Erros de fato (ex.: schema) não são retentados.

## [5.2.0] — 2026-07-02

### Adicionado

- **Emissão de NFS-e em lote** (`/nfse/lote`): escolha a competência, veja o preview dos clientes
  ativos com honorário (pré-marcados; já-emitidas e sem-CNPJ travadas), desmarque exceções e emita
  **uma nota por vez** com **progresso ao vivo** (e botão **Parar**). Ao final, **relatório CSV** com
  o que saiu, o que não saiu e o motivo. Reusa o motor de emissão da V5 (`emitirNfseCliente`); a
  emissão da ficha passou a delegar para ele. Link "Emitir NFS-e em lote" na lista de clientes.
- **Proteção contra CSV formula injection** no relatório.

## [5.1.1] — 2026-07-02

### Adicionado

- **Selo de ambiente** nas notas: NFS-e emitidas em **homologação** exibem um selo "homologação" na
  lista, para não se confundirem com as de produção (validade jurídica).

## [5.1.0] — 2026-07-02

### Adicionado

- **Download da NFS-e na ficha:** para notas autorizadas, botões **DANFSe (PDF)** — o app baixa da
  Sefin (ADN) com o certificado (mTLS) — e **XML** (o autorizado, já armazenado), além de link para o
  **portal público** (consulta por chave). Assim a nota é impressa/enviada ao cliente sem sair do CRM.

## [5.0.6] — 2026-07-02

### Alterado

- **Diagnóstico:** a resposta não-JSON da Sefin (páginas HTML de erro do IIS) passa a expor o status
  HTTP e um trecho do corpo, facilitando identificar URL/endpoint errado.

## [5.0.5] — 2026-07-02

### Corrigido

- **Anti-duplicidade por ambiente:** uma NFS-e de **homologação** não bloqueia mais a emissão em
  **produção** (e vice-versa) para o mesmo cliente/competência — a checagem passou a filtrar por
  `ambiente`.

## [5.0.4] — 2026-07-02

### Corrigido

- **DPS (schema E1235):** `dhEmi` no formato exigido (`-03:00`, sem milissegundos) e inclusão do
  bloco de endereço do tomador (`toma > end`), alinhando ao XSD nacional (nota real).

## [5.0.3] — 2026-07-02

### Corrigido

- **Diagnóstico de rejeição:** o parser passa a capturar o corpo cru da resposta da Sefin (e formatos
  de erro alternativos), para expor o motivo real da recusa em vez de só "HTTP 400".

## [5.0.2] — 2026-07-02

### Corrigido

- **Emissão de NFS-e:** a action lia colunas inexistentes (`cnpj`/`cpf`) — o documento do tomador
  vem de `clientes.cpf_cnpj`. Isso causava "Cliente não encontrado". Erros de query passam a ser
  logados em vez de virar a mesma mensagem.

## [5.0.1] — 2026-07-02

### Corrigido

Ajuste da DPS e da assinatura ao layout **real** (a partir de uma NFS-e autorizada da Elevare):

- **Assinatura:** canonicalização **C14N padrão** (`REC-xml-c14n-20010315`), não exclusive-c14n.
- **DPS:** regime do Simples Nacional correto (`opSimpNac=3` + `regApTribSN` + `regEspTrib`); serviço
  por **`cTribNac`** (código nacional de 6 dígitos) + `xDescServ`; Simples sem `pAliq`, usando
  `tpRetISSQN` + `pTotTribSN`.
- **Config:** campos `codigo_servico_nacional`, `descricao_servico`, `pct_trib_sn` (migration 0020);
  tela e emissão ajustadas.

## [5.0.0] — 2026-07-02

Emissão de **NFS-e dos honorários do escritório** pelo padrão nacional (V5-A do roadmap), integrando
direto com a **Sefin Nacional**, com o certificado A1 cifrado in-house.

### Adicionado

- **Motor de emissão** (`src/lib/nfse/`): monta a **DPS** (XML, layout nacional), assina em
  **XMLDSig** (enveloped + exclusive-c14n + RSA-SHA256) com o A1, comprime (GZip+Base64) e envia por
  **mTLS** à Sefin.
- **Certificado A1 cifrado** (AES-256-GCM, chave `NFSE_CERT_KEY`): upload em `Configurações → NFS-e`,
  decifrado apenas no runtime da emissão; nunca vai ao browser.
- **Configuração fiscal** do escritório (item LC116, ISS, código do município, ambiente) — tela admin.
- **Emissão pela ficha do cliente**: botão "Emitir NFS-e" a partir do honorário (de
  `clientes_financeiro`), com anti-duplicidade por competência, e seção de notas com status.
- **Tabelas** `nfse_config`, `nfse_certificado`, `nfse` (migration 0019) com RLS financeira.
- Variáveis `NFSE_AMBIENTE`, `NFSE_URL_HOMOLOGACAO`, `NFSE_URL_PRODUCAO`, `NFSE_CERT_KEY` + guia de
  deploy. Começa em homologação (produção restrita).

## [4.0.2] — 2026-07-01

Correções de segurança e robustez na assinatura (V4), a partir de code review multi-ângulo.

### Segurança

- **Webhook:** o tipo do evento passa a ser lido do **corpo** (`event.name`, sob HMAC) em vez de um
  header não assinado — impede forjar a ação (ex.: transformar um `sign` em `refusal`) por replay.
- **Anti-replay:** eventos `sign`/`refusal` são ignorados quando a assinatura já está em estado
  terminal (`finalizado`/`recusado`/`cancelado`).
- **Envio:** valida que o documento pertence ao cliente informado (`documentos.cliente_id`).
- **Timeouts** nas chamadas à Clicksign e no download do assinado (evita requisições penduradas).

### Corrigido

- **Assinado não é mais perdido:** falha de upload/insert do PDF assinado agora devolve `503` para a
  Clicksign reenviar, em vez de responder `200` e perder o arquivo.
- **Sem duplicatas:** o assinado usa caminho determinístico (`upsert`) e reúso da linha de documento,
  evitando arquivos/registros duplicados em retries ou eventos concorrentes.
- **E-mails normalizados** (lowercase) no envio e no webhook — o casamento por e-mail não falha por
  diferença de caixa.
- **Erro do insert de signatários** passa a ser registrado.
- **Reenvio pela UI** volta a aparecer quando a assinatura está `recusado`/`cancelado` (antes ficava
  sem saída); lista de assinaturas ordenada para exibir a mais recente.

## [4.0.1] — 2026-07-01

### Corrigido

- **Webhook de assinatura:** no `auto_close` a Clicksign pode ainda não ter gerado o PDF assinado;
  agora o webhook responde `503` nesse caso para a Clicksign **reenviar**, e a tentativa seguinte
  salva o arquivo (o status já fica `finalizado`). Descoberto no teste real de produção.

## [4.0.0] — 2026-07-01

Integração de **assinaturas digitais via Clicksign** (V4 do roadmap): envia o contrato gerado para
assinatura, acompanha o status por webhook e traz o PDF assinado de volta aos Documentos.

### Adicionado

- **Cliente Clicksign** (`src/lib/assinatura/clicksign.ts`): monta o envelope v3 (documento em
  base64 → signatários → requisitos → ativa → notifica) e baixa o PDF assinado.
- **Webhook** (`src/app/api/webhooks/clicksign/route.ts` + `src/lib/assinatura/webhook.ts`): valida
  o HMAC (`content-hmac`), atualiza o status por signatário e salva o assinado nos Documentos
  (idempotente).
- **Envio pela ficha do cliente**: botão "Enviar para assinatura" no contrato PDF, com formulário de
  signatários (cliente pré-preenchido + representante do escritório + 2 testemunhas opcionais) e
  indicador de status.
- **Tabelas** `assinaturas` e `assinatura_signatarios` (migration 0018) com RLS de gestão de
  documentos.
- Variáveis `CLICKSIGN_URL`, `CLICKSIGN_TOKEN`, `CLICKSIGN_HMAC_SECRET` e guia de deploy do webhook.

## [3.0.0] — 2026-06-30

Geração automática do **contrato de prestação de serviços contábeis** (V3 do roadmap): preenche a
minuta padrão do escritório com os dados do cliente e produz Word + PDF.

### Adicionado

- **Motor de geração** (`src/lib/contrato/`): monta o mapa tag→valor a partir do cliente, preenche a
  minuta tagueada com **docxtemplater** (preservando a formatação) e converte para PDF via
  **Gotenberg** (LibreOffice headless via HTTP, com degradação graciosa se indisponível).
- **Representante legal** no cadastro do cliente (`representante` jsonb; migration 0017):
  nacionalidade, estado civil, profissão, RG e CPF — usados na qualificação da CONTRATANTE.
- **Tela "Gerar contrato"** na ficha do cliente (admin/financeiro/contador-dono): escolhe a data de
  início da vigência, gera Word + PDF e salva nos **Documentos** do cliente, com pré-checagem dos
  campos necessários.
- **Formatação fiel à minuta:** CNPJ/CPF, CEP (NN.NNN-NNN), telefone ((NN) N NNNN-NNNN), endereço em
  Title Case, honorário em R$ + valor por extenso, e-mail como hyperlink (mailto dinâmico). Data de
  assinatura = data de geração.
- Serviço **Gotenberg** documentado no deploy (`GOTENBERG_URL`).

## [2.0.2] — 2026-06-29

### Adicionado

- **Prévia detalhada da importação:** além dos contadores, a tela mostra seções expansíveis com os
  itens — **Pendências** (com o motivo: regime sem equivalente, documento inválido ou cliente sem
  empresa), **Atualizados** (diff campo a campo) e **Novos** (razão social, CNPJ, regime). Completa
  a confirmação informada prevista no spec. Valores de honorário não aparecem (isolados por RLS).

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

[Não lançado]: https://github.com/pedrogomesudi/crm-contabil/compare/v3.0.0...HEAD
[3.0.0]: https://github.com/pedrogomesudi/crm-contabil/compare/v2.0.2...v3.0.0
[2.0.2]: https://github.com/pedrogomesudi/crm-contabil/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/pedrogomesudi/crm-contabil/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/pedrogomesudi/crm-contabil/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/pedrogomesudi/crm-contabil/releases/tag/v1.0.0
