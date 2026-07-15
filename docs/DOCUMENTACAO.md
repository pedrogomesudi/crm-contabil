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

Quatro papéis de **equipe** e um papel de **cliente** (portal). O papel é a **fonte única** de autorização
(vive em `usuarios.papel`) e é aplicado nas políticas do banco.

| Papel | Perfil típico |
|---|---|
| **admin** | Dono/gestor do escritório — acesso total e configurações. |
| **contador** | Contador responsável — vê e gerencia **seus** clientes. |
| **assistente** | Apoio operacional — cadastro, documentos, atendimento, comercial, onboarding. |
| **financeiro** | Financeiro do escritório — contas, cobrança, honorários, relatórios. |
| **cliente** | Cliente do escritório — **só o portal** (`/portal`), somente leitura do que é dele (ver 3.6). |

> O papel `cliente` é **negado por padrão** em todas as policies de equipe; só ganha SELECT estreito nas
> linhas do próprio cadastro. Nasce apenas pelo **convite ao portal** (na ficha do cliente) e nunca aparece
> na tela de Usuários.

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
- **Propostas formais:** proposta comercial a partir da oportunidade — itens (mensal/único), validade,
  condições e **responsável comercial** (nome/e-mail pré-preenchidos do usuário logado, telefone digitado).
  **Geração por modelo:** o **modelo padrão** da plataforma monta o documento HTML com a **Marca**
  (logo/nome/CNPJ/endereço) e imprime pelo navegador; o **modelo próprio** (definido em Configurações →
  Marca) gera um **PDF baixável** a partir de um arquivo `.docx` ou HTML enviado pelo escritório, trocando
  as **tags** (`{nome_cliente}`, `{mes_ano}`, `{#itens}…{/itens}`, etc.) pelos dados da proposta. O HTML é
  sanitizado e convertido sem executar JavaScript de terceiros.
- **Métricas / relatórios** (`/comercial/metricas`): oportunidades ativas, taxa de conversão, valor
  em funil e desempenho por etapa.

### 3.3 Clientes
Cadastro completo de PJ/PF/MEI e a ficha do cliente, que concentra todas as áreas ligadas a ele.

- **Cadastro:** razão social, CNPJ/CPF, tipo de pessoa, regime tributário, inscrições estadual/municipal,
  endereço, e-mail, telefone, responsável, representante, contador responsável, status, observações,
  **competência inicial** (definida no onboarding).
- **Consulta à Receita Federal:** para PJ, botão que preenche/atualiza os dados a partir do CNPJ.
- **Empresa em constituição:** para abertura de empresa nova (que ainda não tem CNPJ), o botão **"Nova
  empresa (em constituição)"** cria um cliente com status **`em_constituicao`** e **CNPJ opcional** (permitido
  só nesse status; uma constraint barra cliente ativo sem CNPJ). O cadastro é enxuto (razão social pretendida,
  regime, endereço, **sócios** em `socios` jsonb com o administrador como representante) e pode **já iniciar o
  processo de abertura** (modelo Simples/Presumido). Enquanto `em_constituicao`, o cliente **não gera obrigações
  nem mensalidades** (ambos os geradores exigem `status = 'ativo'`). Quando o CNPJ é emitido, a ação **"Ativar
  empresa"** na ficha (CNPJ + regime + inscrições) valida e passa o cliente para **`ativo`**. Ao criar, é
  possível **anexar o PDF do formulário** de constituição ao acervo do cliente (fica nos Documentos). A
  **extração automática** dos dados do PDF foi descartada por ora: em produto whitelabel cada escritório tem
  um formulário próprio e o PDF do Google Forms exporta o texto fora de ordem — a única abordagem que
  generaliza (IA) exige chave, o que foge da estratégia atual; o preenchimento é manual.
- **Honorário e dados financeiros:** valor mensal, dia de vencimento, faixa de faturamento, nº de
  funcionários, data de saída, opt-out de cobrança por WhatsApp (visível a quem pode ver honorário).
- **Responsáveis por departamento (RF-025):** na ficha, um responsável interno por departamento —
  **Contábil, Fiscal, Pessoal (Folha), Societário/Legalização**. É uma camada de organização: **não altera
  a visibilidade** (o `contador_id` continua governando a RLS "cada contador vê os seus"). Admin/assistente
  editam qualquer cliente; o contador edita apenas os dele. Admin/assistente têm ainda a **redistribuição de
  carteira** em `/clientes/responsaveis` (acessível pelo botão na lista de Clientes): filtra por departamento,
  responsável atual e nome, marca vários clientes e atribui/remove o responsável de um departamento em massa.
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

**Legalização / Societário (RF-011 a RF-014 — Fatia A):** módulo **dedicado** (não altera o onboarding),
com acompanhamento de processos societários e de legalização **por órgão** (Junta, Receita, Prefeitura,
Sefaz, Bombeiros, Vigilância, Outro) e **número de protocolo**. **7 modelos semeados** (abertura Simples/
Presumido, alteração de quadro, transformação, baixa, transferência entrada/saída), cada um com etapas
(órgão, prazo D+n, responsável por papel, anexo obrigatório, "avisar cliente?"). Fluxo: na **ficha do
cliente**, inicia-se um processo (escolhe o modelo + data) — as etapas são **materializadas** com prazo;
no **detalhe do processo** (`/legalizacao/[id]`) preenche-se protocolo/data, muda-se status, ajusta-se
prazo (com selo de severidade), anexa-se comprovante (PDF/PNG/JPG por magic bytes) e registra-se
**"cliente avisado"** (RF-013 parcial — sem envio automático). O **menu "Legalização"** abre um painel
global com filtros por **órgão pendente** e **status**. RLS: processos herdam a visibilidade do cliente
(contador só os seus); **financeiro apenas lê**. Os **modelos são editáveis pelo admin** (Configurações →
Modelos de legalização). Nos processos de **transferência** (entrada/saída), um botão gera o **Termo de
Entrega/Recebimento de Acervo (NBC PG 01)** em PDF — cabeçalho com a Marca, cliente, **checklist editável**
do acervo (pré-preenchido), data e assinaturas; o PDF é baixado e **anexado aos Documentos** do cliente.
Com isso a legalização (RF-011 a RF-014) está completa — resta apenas o RF-013 como parcial (aviso ao
cliente registrado, sem envio automático).

### 3.5 Tarefas
Tarefas internas da equipe (RF-040 núcleo + RF-042 parcial).

- **Tarefa:** título, descrição, **responsável**, **cliente** (opcional), **departamento** (opcional — reusa
  o enum do RF-025), **prioridade** (urgente/alta/média/baixa), **prazo** (com selo de severidade) e
  **status** (aberta / em andamento / concluída / cancelada), mais um **checklist** de subitens.
- **Painel** (`/tarefas`, menu "Tarefas"): alterna entre **Lista** e **Kanban** (colunas por status, com
  botões ← → para mover), com filtros por responsável, departamento, status e prioridade; criação rápida.
- **Detalhe** (`/tarefas/[id]`): edição completa dos campos e do checklist.
- **Ficha do cliente:** seção **Tarefas** com as tarefas daquele cliente e criação rápida já vinculada.
- **RLS:** toda a equipe (admin/assistente/contador/financeiro) vê e cria tarefas; **editar/excluir** é de
  admin/assistente ou de quem **criou**/é **responsável** pela tarefa.
- **Tarefas recorrentes (RF-040)** — `/tarefas/recorrencias`: o **molde** (título, cliente, departamento,
  responsável, prioridade, checklist) mais a **regra** (semanal/mensal/trimestral/anual, dia, e a
  **antecedência** em dias). Um **cron diário às 9h** gera as ocorrências que entraram na janela.
  - **Idempotência é do banco:** índice único `(recorrencia_id, competencia)`. Uma reexecução do cron não
    duplica tarefa — o motor não depende de "lembrar" o que já fez, que é o que quebra quando o job falha
    no meio.
  - **Dia 31 em mês curto cai no último dia** (fevereiro → 28/29), em vez de pular o mês. Uma tarefa mensal
    que some em fevereiro é exatamente o tipo de falha que ninguém percebe.
  - Botão **"Gerar agora"** para não depender do cron do dia seguinte para testar.
- **Calendário (RF-042)** — terceira vista do painel, ao lado de Lista e Kanban: grade mensal por prazo,
  navegação de mês **preservando os filtros**, vencidas em vermelho e uma faixa **"Sem prazo"** — tarefa sem
  prazo não pode sumir da vista.
- **Modelos de processo / SOPs (RF-041)** — Configurações → **Modelos de processo**: etapas com
  **responsável por papel**, **prazo relativo** (dias após o início) e checklist próprio.
  - **A SOP gera tarefas**, não um processo paralelo — é o "desacoplamento do motor de templates" que o gap
    analysis pede, e evita a terceira cópia do padrão onboarding/legalização. As etapas viram tarefas comuns,
    com painel, kanban, checklist e ficha do cliente que já existiam.
  - **Ondas:** etapas na **mesma onda** são **paralelas** (nascem juntas); **ondas** rodam em **sequência**.
    Quando a última tarefa de uma onda fecha, a **próxima nasce sozinha** — e isso vive num **trigger no
    banco**, não nas actions: a tarefa é concluída pelo painel, pelo kanban e pela ficha, e o caminho
    esquecido travaria o processo em silêncio.
  - **Responsável por papel** é resolvido na geração: (1) responsável do departamento no cliente; (2) contador
    do cliente, se o papel for `contador`; (3) **ninguém**. Nunca chutamos um responsável — tarefa órfã
    aparece no painel; tarefa atribuída à pessoa errada some da vista de quem deveria fazê-la.
  - **Iniciar processo:** na ficha do cliente ou no painel de Tarefas (processo interno, sem cliente), com
    acompanhamento por onda e progresso.
- **Em aberto (fatias seguintes):** anexos em tarefa, timesheet (RF-043), rentabilidade (RF-044) e
  solicitações internas entre departamentos com SLA (RF-045).

### 3.5.1 Timesheet e Rentabilidade (RF-043 / RF-044)
Responde à pergunta que sustenta decisão de preço e de encerrar contrato ruim: **quanto custa atender este
cliente — e ele paga por isso?**

- **Apontamento (`/timesheet`, toda a equipe):** **manual** (data + duração aceitando `1h30`, `1:30` ou `90`
  + cliente/tarefa + o que foi feito) e por **cronômetro** (iniciar/parar no painel ou na ficha da tarefa).
  Apontar numa tarefa **herda o cliente** dela; sem cliente, a hora é **interna** (não entra no custo de
  nenhum cliente).
  - **Uma sessão de cronômetro por pessoa** (a PK de `apontamento_sessao` é o usuário) — dois cronômetros
    simultâneos gerariam horas duplicadas.
  - **Trava das 8 horas:** ao parar uma sessão longa, o sistema **não grava em silêncio** — pede confirmação
    com o tempo editável. Cronômetro esquecido rodando a noite inteira é o defeito clássico do recurso, e 14h
    fantasma destruiriam a margem do cliente sem ninguém entender por quê.
- **Custo/hora (Configurações → Custo por colaborador, SÓ admin):** é dado **salarial**, por isso vive em
  tabela própria (`colaborador_custo`) e **não** numa coluna de `usuarios` — a RLS do Postgres é por
  **linha**, não por coluna, e a coluna vazaria o custo para qualquer um da equipe que lesse a tabela.
  **Nem o financeiro** enxerga o valor individual.
  - **Vigência:** cada custo vale a partir de uma data, e a nova **fecha a anterior**. O relatório usa o custo
    **vigente na data de cada apontamento** — sem isso, um aumento reescreveria a rentabilidade do passado.
- **Rentabilidade (`/financeiro/rentabilidade`, admin e financeiro):** por cliente e período — **Horas**,
  **Custo estimado**, **Recebido** (baixas não estornadas), **Contratado** (honorário × meses), **Margem R$**,
  **Margem %** e **R$/hora**. O relatório roda com `service_role` (precisa cruzar o custo, admin-only) e é
  **agregado por cliente**: nunca mostra "quanto custa a hora do Fulano".
  - **Recebido e contratado lado a lado:** o contratado sozinho esconde o inadimplente (ele parece rentável
    sem pagar); o recebido sozinho pune quem só atrasou. A diferença entre os dois **é** o sinal de atraso
    (destacado em âmbar).
  - **Cliente sem apontamento é sinalizado**, nunca exibido como custo zero silencioso: custo zero não
    significa "cliente barato", significa **"ninguém apontou"**.
  - **Ordenado por margem crescente:** os piores primeiro — o relatório existe para achar cliente ruim.
  - Divisão por zero nunca vira `Infinity`: recebido 0 → margem % **nula**.

### 3.6 Portal do cliente
Área exposta ao **cliente final** (RF-052) — a primeira superfície fora da equipe, por isso desenhada
**falha fechada**.

- **Acesso por convite:** na ficha do cliente, admin/assistente convidam pelo e-mail (seção "Portal do
  cliente"). O convidado recebe o e-mail do Supabase, define a senha e entra em `/portal`. O acesso pode ser
  **revogado** (desativa o usuário, cortando o acesso na hora).
- **O que o cliente vê (somente leitura):** **Documentos**, **Notas fiscais** (baixa a DANFSe), **Guias e
  comprovantes** das obrigações e **Boletos** (2ª via, linha digitável e PIX).
- **Modelo de segurança:**
  - o papel **`cliente`** é **negado por padrão** em todas as policies (que listam só papéis de equipe);
    concedemos apenas **SELECT estreito** nas linhas do próprio cadastro, via `auth_cliente_id()`;
  - **nenhuma policy de escrita** para o cliente nesta fatia;
  - `usuarios.cliente_id` + constraint `chk_usuario_cliente`: cliente **exige** vínculo, equipe **não pode** ter;
  - **equipe e cliente nunca se cruzam:** o layout `(app)` manda `cliente` para `/portal` e o layout
    `(portal)` manda a equipe de volta — o gate vem antes de qualquer query;
  - **downloads:** o registro é lido com o cliente Supabase **do usuário** (a RLS prova a titularidade) e só
    então a URL é assinada com `service_role` (60s). Um id vindo do navegador nunca é suficiente;
  - o papel `cliente` **não é oferecido** na tela de Usuários (`PAPEIS_EQUIPE`): só nasce pelo convite ao portal.
- **Envio de documentos pelo cliente (Fatia B):** o cliente **envia arquivos** (PDF/PNG/JPG, até 10 MB,
  validados por magic bytes) pelo portal. É a **única escrita** concedida ao papel `cliente`: uma policy de
  INSERT em `documentos` com `cliente_id = auth_cliente_id() and origem = 'cliente'` — **sem UPDATE e sem
  DELETE**, nem do que ele mesmo enviou. O caminho do arquivo é **gerado no servidor** (a constraint
  `chk_caminho_prefixo` já impede escrita na pasta de outro). Cada envio **cria automaticamente uma tarefa**
  ("Documento enviado pelo cliente…"), atribuída ao responsável do departamento Contábil ou ao contador do
  cliente — assim nada passa batido.
- **Rastreio de entrega (RF-053):** todo download do cliente (documento, DANFSe, comprovante de obrigação e
  2ª via de boleto) é **registrado** em `portal_acesso` — gravado **apenas server-side** (a tabela não tem
  policy de INSERT). Na ficha do cliente, a seção **Documentos** passa a mostrar **"visto em dd/mm"** ou
  **"não visualizado"**, e marca o que foi **"enviado pelo cliente"**. Responde à pergunta que mais gera
  ligação: *"o cliente viu a guia?"*.
- **Solicitações (RF-054, Fatia C):** o cliente **abre um pedido** pelo portal (`/portal/solicitacoes`) —
  categoria (guia, documento, dúvida, outro), assunto e descrição — e conversa com o escritório numa
  **thread**. Cada solicitação recebe um **número sequencial** e um **prazo** calculado pelo SLA configurável
  em **Configurações → Marca** ("SLA de solicitações (dias)", padrão 2). A equipe atende em `/solicitacoes`,
  com filtros por **status**, **categoria** e **SLA vencido**, e no detalhe pode **responder** (o status vira
  *respondida*), **atribuir responsável**, **mudar o status** e **converter em tarefa** (cria a tarefa do
  cliente com o mesmo prazo e guarda o vínculo em `solicitacao.tarefa_id`).
  - **Segurança:** o cliente só pode **inserir** solicitação no próprio cadastro e **mensagens** nas
    solicitações dele; **não pode dar UPDATE**. Como *default* não é validação, um gatilho `before insert`
    **sobrescreve no servidor** os campos forjáveis — `criado_por`, `autor_id` da mensagem, `numero`, `prazo`,
    `status`, `responsavel_id` e `tarefa_id`. Sem isso, um cliente com JWT válido poderia chamar a API direto e
    **forjar a autoria** de uma mensagem (fazendo parecer que o escritório respondeu) ou esticar o próprio SLA.
    Os testes de RLS provam a neutralização: o cliente insere mensagem com `autor_id` do contador e a leitura
    devolve o `autor_id` dele.
- **DECISÃO (14/07/2026) — o reenvio automático dos não visualizados foi descartado.** O RF-053 fica
  **parcial de propósito**: o **rastreio** de visualização e download continua (é ele que responde "o cliente
  viu a guia?"), mas **não haverá cobrança automática** de quem não abriu. Quem decide insistir é a equipe,
  olhando o selo "não visualizado" na ficha — e, se quiser avisar, usa os **Comunicados** (RF-055) ou o
  e-mail da ficha (RF-051). Não há fatia pendente neste módulo.

### 3.6.1 Solicitações internas entre departamentos (RF-045)
O mesmo motor das solicitações do portal, virado **para dentro**: um departamento pede algo a outro, com
**SLA** e **fila de atendimento**.

- **Tabela própria** (`solicitacao_interna`), **não** a do portal: aquela gira em torno de `auth_cliente_id()`
  e de `cliente_id` obrigatório — enfiar pedidos internos ali colocaria um `cliente_id` nulo atravessando
  policies escritas para o caso oposto.
- **Fila:** a solicitação nasce **sem dono**, na fila do departamento de destino; quem for atender clica em
  **"Assumir"**. Quem abre **pode** sugerir um responsável, mas não precisa. Um pedido endereçado a uma pessoa
  específica **morre na caixa de quem saiu de férias** — na fila, o departamento inteiro enxerga.
  - "Assumir" só vale **se estiver sem dono**: dois cliques simultâneos não trocam o responsável pelas costas
    de quem chegou primeiro.
- **SLA por departamento** (Configurações → SLA por departamento, admin): Pessoal responde em 1 dia,
  Fiscal em 2, Contábil em 3, Societário em 5. O **prazo é calculado no servidor** pelo SLA do **destino** —
  quem abre **não escolhe**, senão todo pedido nasceria "para ontem". Mudar o SLA **não** reescreve o prazo
  das solicitações já abertas.
- **Segurança (lição da 0088 — *default não é validação*):** um gatilho `before insert` **sobrescreve**
  `solicitante_id`, `autor_id` da mensagem, `numero`, `status` e `prazo`. Os testes de RLS provam: um prazo
  forjado para 2030 vira o SLA do destino, e uma mensagem com `autor_id` de outra pessoa volta com o autor
  real.
- **Detalhe:** thread, assumir, mudar status, atribuir responsável, **converter em tarefa** e resolver.
- **Início:** contador de **"N na sua fila · M com SLA vencido"** — uma fila que ninguém abre é onde os
  pedidos vão morrer.
- **Departamento do colaborador** (tela de Usuários): é a **origem** dos pedidos dele. Sem isso, ele escolhe
  a origem ao abrir.

### 3.7 Atendimento (WhatsApp)
Central de atendimento integrada ao WhatsApp via **Z-API** (número dedicado do escritório).

- **Inbox** em colunas com abas (Abertas / Pendentes / Finalizadas / Favoritos).
- **Envio e recepção** de mensagens em tempo (polling); **mídia** (imagem, documento, áudio) enviada e
  recebida.
- **Read receipts** (entregue ✓✓ / lido em azul), no padrão do WhatsApp.
- **Status do atendimento e atendente** responsável por conversa.
- **Identificação do cliente:** exibe nome da empresa + contato em vez do número, quando o telefone bate
  com um cliente cadastrado. Normalização de telefone tolerante ao **nono dígito**.
- **Nova conversa** a partir dos clientes cadastrados.

### 3.7.1 E-mail integrado (RF-051)
Canal de e-mail do escritório, com envio a partir da **ficha do cliente** e registro automático de tudo.
Nasce também como **redundância** do WhatsApp, que é canal não oficial (Z-API) e pode ser banido.

- **Enviar e-mail** (admin/assistente/contador — o financeiro vê o histórico, mas não dispara): o
  destinatário já vem preenchido com o e-mail do cliente; escolher um **template** preenche assunto e corpo
  **já com as variáveis aplicadas**, e o texto continua editável antes do envio.
- **Anexos:** documentos do cliente, comprovantes de obrigações e DANFSe. O navegador manda o **id** do
  registro, **nunca o caminho do arquivo** — o servidor lê pelo id (a RLS prova que é daquele cliente) e só
  então baixa do Storage. Aceitar o caminho seria path traversal disfarçado. Teto de **10 MB** somados.
- **Histórico na ficha:** cada envio vira uma linha em `email_mensagem` com destinatário, assunto, anexos e
  **status**. A falha é gravada também, com a mensagem do provedor — um e-mail que não saiu não pode sumir.
  A tabela **não tem policy de INSERT**: só o servidor grava, depois de enviar, então ninguém forja um
  "enviado". O contador só enxerga o histórico dos clientes dele; o portal (papel `cliente`) não vê nada.
- **Corpo é texto**, com o HTML derivado por escape. Não aceitamos HTML cru — o template viraria vetor de
  injeção no cliente de e-mail de quem recebe.
- **Em aberto (Fatia B):** a régua de cobrança por e-mail, em **fallback** — sai quando o WhatsApp não está
  configurado, o cliente não tem telefone ou o envio falhou; nunca duas cobranças do mesmo título.

### 3.7.2 Comunicados em massa (RF-055)
Avisos de legislação e prazos para um **segmento** da base — não para "todo mundo" às cegas.

- **Segmentação por atributos do cadastro:** regime tributário, tipo (PJ/PF/MEI), status, **município/UF**,
  contador responsável e **responsável por departamento**. Os critérios combinam com **E**; dentro de cada
  critério vale **OU** ("os Simples **ou** MEI de Goiânia").
  - A comparação de município **ignora acento e caixa** — o endereço é digitado à mão, e "GOIANIA" precisa
    casar com "Goiânia"; comparar texto puro deixaria clientes de fora **em silêncio**.
- **Prévia obrigatória:** não existe botão que dispare direto. Antes de enviar, a tela mostra a **contagem**,
  a **lista de quem recebe** e **quem foi excluído, com o motivo** (sem e-mail, opt-out). Um comunicado errado
  sai para centenas de clientes assinado pelo escritório e não volta atrás. Há também **"Enviar teste para
  mim"**.
- **O segmento é recarregado no servidor no disparo.** A lista que o navegador viu é descartada: confiar
  nela permitiria adulterar a requisição e mudar quem recebe.
- **Canal:** **e-mail** (padrão, sem teto) ou **WhatsApp** — este com **teto de 50 destinatários** e aviso em
  destaque, porque disparo em massa é o gatilho clássico de **banimento do número** pela Meta (o Z-API é
  canal não oficial), o que derrubaria o **atendimento** e a **régua de cobrança** de uma vez.
- **Registro:** cada destinatário vira uma linha com status — **inclusive as falhas**, com a mensagem do
  provedor. `comunicado_destinatario` **não tem policy de INSERT** (só o servidor grava): ninguém forja um
  "enviado". Índice único `(comunicado_id, cliente_id)` — o mesmo cliente **não recebe duas vezes**, nem com
  clique duplo, nem no **"Reenviar falhas"** (que reprocessa só os que deram erro).
- **Opt-out (LGPD):** `clientes.aceita_comunicados`, na ficha do cliente — **finalidade distinta da
  cobrança**: o cliente pode querer receber a fatura e não os informativos.
- **Permissão:** criar e disparar é de **admin e assistente** (mesma trava dos templates de e-mail); a equipe
  toda consulta o histórico.

### 3.8 Obrigações e Compliance
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

### 3.9 Certificados e procurações (vencimentos)
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

### 3.10 NFS-e (notas fiscais de serviço)
Emissão e gestão de NFS-e pelo padrão nacional (nfse.gov.br / Sefin Nacional), com certificado digital.

- **NFS-e dos honorários (1 emitente):** o escritório emite as notas dos seus honorários; config do
  emitente + certificado A1 (cifrado) em Configurações → NFS-e (admin).
- **NFS-e dos clientes (multi-emitente):** cada cliente emite as próprias notas como prestador — config
  fiscal + certificado A1 por cliente (cifrado), numeração de DPS por cliente, tomador externo.
- **Emissão avulsa** e **emissão com o cliente como emitente** (preenche o tomador a partir do CNPJ).
- **Lote** (`/nfse/lote`): emissão/gestão em lote por competência; cancelamento.
- **Competência × `dCompet`:** `nfse.competencia` é o **mês do serviço** (regime vencido); `nfse.dcompet`
  guarda o que foi **efetivamente enviado à Sefin** na DPS. Nas notas emitidas até julho/2026 os dois
  divergem — a nota declarou julho para o serviço de junho — e daí em diante coincidem. O **XML
  autorizado é a verdade fiscal** e nunca é alterado. A anti-duplicidade da emissão usa `competencia`.
- **Download em lote:** botões para baixar todas em **PDF** e em **XML**, com **cache do DANFSe** no
  Storage (baixas repetidas ficam instantâneas) e reprocessamento de falhas.

### 3.11 Cobrança
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
- **E-mail como canal de fallback (RF-051, fatia B):** o Z-API é canal **não oficial** e pode ser banido
  pela Meta sem aviso — com a régua presa a ele, um banimento paralisaria a cobrança. Agora, se o WhatsApp
  não entrega (**não configurado**, cliente **sem telefone**, **opt-out** de WhatsApp ou **erro do
  provedor**), a cobrança sai por **e-mail**. Se o WhatsApp entregou, o e-mail **não** sai: o cliente nunca
  recebe duas cobranças do mesmo título.
  - Cada etapa tem **assunto** e **corpo de e-mail** próprios; **em branco, reaproveita o texto do
    WhatsApp** — a régua não fica muda por esquecimento de configuração, que é justamente o cenário em que
    o fallback importa.
  - **Idempotência entre canais:** antes de enviar, o motor consulta `whatsapp_mensagem` **e**
    `email_mensagem` por (título, etapa). O índice único de cada tabela sozinho não impediria uma
    reexecução do cron de cobrar de novo pelo outro canal.
  - **Interruptor** em Configurações → E-mail ("Usar e-mail como fallback da régua"), ligado por padrão.
  - **MUDANÇA DE COMPORTAMENTO:** `cobranca_whatsapp = false` **deixa de silenciar o cliente por
    completo** — passa a significar apenas "não me cobre por WhatsApp", e o e-mail assume. A ficha do
    cliente agora traz **dois** interruptores ("Cobrar por WhatsApp" / "Cobrar por e-mail"); para não
    cobrar de jeito nenhum, desligue os dois.
- **Boletos (construído; ativação pendente de conta no provedor):** emissão de boleto por título, com
  **seletor de provedor** (Configurações → Boletos, admin): **nenhum / Banco Inter / Asaas**. Inter via
  OAuth2 + mTLS; Asaas via API key; credenciais cifradas (AES-256-GCM, `BOLETO_CRIPTO_KEY`). Emissão,
  **baixa por webhook** de pagamento e envio do boleto ao cliente. Exige uma conta ativa no provedor
  para operar em produção.

### 3.12 Financeiro
Módulo completo de gestão financeira do escritório (admin/financeiro).

- **Contas a receber** e **contas a pagar:** títulos (RECEBER/PAGAR) com competência, vencimento,
  categoria, centro de custo, fornecedor; **baixas** (recebimentos/pagamentos), parcelamento, despesas
  recorrentes, **estorno auditado** (justificativa, não deleta).
- **Regime vencido:** a **competência** de um título é o **mês do serviço**; o **vencimento** cai no
  **mês seguinte**. A geração roda no dia 1 (pg_cron) para a competência do mês anterior, e o seletor
  de competência nas telas já vem no mês anterior. O **13º honorário** equivale a um honorário,
  dividido em **duas parcelas de 50%**, com vencimentos fixos em **20/11** e **15/12**, geradas na
  rodada de outubro (quando ambos ainda estão no futuro).
- **Vigências de honorário e regime:** toda mudança de honorário ou de regime tributário grava uma
  **vigência** (a partir de qual competência o valor vale), capturada por **trigger de banco** — o
  honorário é escrito por quatro caminhos diferentes. O MRR, o churn de receita e o ticket médio passam
  a usar **o honorário de cada mês**, e a geração de mensalidades usa o **valor vigente na competência**
  (uma geração retroativa não cobra o valor de hoje por um serviço antigo). As obrigações usam o
  **regime vigente na competência**. A ficha do cliente mostra a linha do tempo.
- **O que é estimativa:** o histórico anterior à entrega **não existe** — as vigências da carga inicial
  são marcadas como `estimada`, e a tela de indicadores assinala com `*` os meses cujo valor veio de
  estimativa. O sistema não finge saber o que não sabe.
- **Reajuste anual em lote (`/financeiro/reajuste`):** reajusta os honorários uma vez ao ano pelo índice
  de cada cliente — padrão **salário mínimo**, com IPCA/IGP-M/INPC (buscados no **BACEN**, séries SGS),
  percentual fixo ou "sem reajuste". Fluxo **simular → revisar → aplicar**: o percentual vem
  pré-preenchido e **editável por linha**; desmarca-se quem não entra; nada muda antes do "Aplicar". O
  reajuste só grava o honorário — a vigência de janeiro nasce pelo trigger. Um cliente já reajustado no
  **ano-base** fica fora do lote (trava por `(cliente, ano)`). A ficha mostra os reajustes com
  **Desfazer**, que volta o honorário e remove a vigência daquele mês, como se não tivesse acontecido.
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

### 3.13 Integração Domínio
Importação de contratos/dados a partir do sistema **Domínio** (admin/assistente): leitor `.xls` próprio,
prévia (novos/atualizados/pendências), reconciliação idempotente por CNPJ e auditoria.

### 3.14 Configurações (admin)
Central de integrações e credenciais:
- **Modelos de legalização (admin):** editor dos modelos societários/legalização — criar, editar (nome,
  descrição, tipo, ativo) e excluir modelos, e gerenciar suas **etapas** (título, descrição, órgão, prazo D+n,
  responsável por papel, anexo obrigatório, avisar cliente) com **reordenação (↑↓)**. Completa a
  configurabilidade do RF-012. Escrita **admin-only** (RLS); excluir um modelo **não** afeta processos já
  iniciados (as etapas de instância são cópias).
- **Marca do escritório:** nome, CNPJ, endereço, e-mail, telefone e **logo** (PNG/JPG, validado por
  magic bytes; SVG proibido por ser vetor de XSS) usados na proposta comercial e no whitelabel. O logo
  vai para o bucket privado `documentos` e é exibido por URL assinada. Registro único (`escritorio_config`
  id=1), estruturado para virar por-tenant na multi-tenancy futura. Inclui o bloco **Proposta:** escolha
  entre **modelo padrão** (usa a Marca) e **modelo próprio**, com upload do arquivo (`.docx`/HTML, até 5 MB,
  validado), painel de **referência de tags** e download de um **modelo de exemplo**. A validação do upload
  reconhece as tags, sinaliza as desconhecidas e avisa sobre recursos externos no HTML.
- **WhatsApp (Z-API):** credenciais do provedor e teste de conexão.
- **E-mail (RF-051):** canal de envio do escritório — **SMTP** (host, porta, TLS, usuário e senha: serve
  qualquer provedor que o escritório já use) ou **API** (Resend/SendGrid, com o domínio verificado lá).
  Remetente (nome + endereço) e **envio de e-mail de teste** — sem ele, um erro de senha só apareceria
  quando o primeiro cliente ficasse sem receber. Senha e chave são cifradas (AES-256-GCM,
  `EMAIL_CRIPTO_KEY`) e **nunca voltam para a tela**: o campo em branco mantém a credencial atual.
- **Templates de e-mail:** modelos com **variáveis** (`{nome}`, `{cnpj}`, `{escritorio}`, `{hoje}`,
  `{valor}`, `{vencimento}`, `{competencia}`) — mesma sintaxe da régua do WhatsApp, com prévia aplicada a
  um cliente de exemplo. Escrita: admin e assistente.
- **NFS-e (emitente):** dados do emitente e certificado digital.
- **Boletos:** provedor (Inter / Asaas), credenciais cifradas, ambiente e conta bancária.
- **Dados de pagamento (PIX/TED):** conta e PIX enviados na cobrança.
- **Template de onboarding:** gerenciador de templates + interruptor de notificações de prazo.
- **Obrigações:** matriz de obrigações + interruptores de escalonamento e do badge de riscos.

### 3.15 Usuários (admin)
Gestão da equipe: convite de usuários, definição de papel e status (ativo/inativo). O papel real é
definido server-side (não confiável a partir do token). Cada usuário pode ter um **superior**
(`superior_id`), formando a cadeia hierárquica usada pelo escalonamento de obrigações.

---

## 4. Integrações externas

| Integração | Uso |
|---|---|
| **Z-API** | WhatsApp não-oficial (envio/recepção de texto e mídia, status de entrega/leitura). Webhook em `/api/webhooks/zapi/[secret]`. |
| **Receita Federal** | Consulta de CNPJ para preencher/atualizar cadastro. |
| **BACEN (SGS)** | Séries de índices (salário mínimo, IPCA, IGP-M, INPC) para o reajuste anual de honorários. |
| **Sefin Nacional / provedor NFS-e** | Emissão e download de NFS-e (DANFSe/XML), com certificado digital A1. |
| **Clicksign** | Assinatura eletrônica de documentos. Webhook em `/api/webhooks/clicksign`. |
| **Banco Inter / Asaas** | Emissão e baixa de **boletos** (construído; ativação pendente de conta). Webhook em `/api/webhooks/boleto/[secret]`. |
| **Domínio** | Importação de contratos/dados contábeis (via relatórios `.xls`). |
| **Gotenberg** | Conversão Word → PDF (contratos) via LibreOffice headless. |

---

## 4.1 LGPD (V10-A)
Conformidade com a Lei Geral de Proteção de Dados — pré-requisito de comercialização. Menu **Configurações
→ LGPD** (admin) e uma seção **LGPD** na ficha do cliente.

- **O eixo honesto — exclusão × retenção fiscal:** a LGPD dá o direito de exclusão, mas a lei fiscal
  **obriga** a guardar boa parte dos dados. O sistema não finge que apaga o que é obrigado a reter: a
  "exclusão" é **anonimização dos dados pessoais não-fiscais** (e-mail, telefone, nome do representante,
  usuários do portal), com o **esqueleto fiscal preservado** (razão social, CNPJ, títulos, NFS-e) e o
  **motivo da retenção documentado** (base legal). Anonimização, **não** `DELETE`, e **irreversível** — cada
  operação é registrada (quem, o quê, quando). A trava usa a retenção configurável (`retencao_meses`, padrão
  60) e os sinais fiscais do cliente; regra em função pura testada.
- **Relatório de dados por titular:** reúne tudo que o sistema guarda sobre um cliente e as pessoas ligadas
  (cadastro, financeiro, documentos, NFS-e, títulos, e-mails, comunicados, acessos ao portal, solicitações,
  consentimentos) em **PDF** (direito de acesso, via Gotenberg) e **JSON** (portabilidade). Cada geração é
  registrada como atendimento do direito.
- **Registro de tratamentos (ROPA):** base legal por finalidade, **pré-semeado** com os típicos de um
  escritório contábil (cadastro/contrato, escrituração/obrigação legal, folha, cobrança, comunicados/
  consentimento, atendimento/legítimo interesse) e editável.
- **Consentimento com histórico:** cada mudança do opt-in de comunicados vira um **evento** (concedido/
  revogado, origem, quem, quando) — a prova histórica, além do estado atual. Gravado por `service_role`
  (o titular não forja o próprio consentimento).
- **Segurança:** as três tabelas LGPD são **admin-only** (RLS); `lgpd_consentimento_evento` não tem policy
  de INSERT (só o servidor grava). O encarregado (DPO) é um campo de configuração.

## 5. Infraestrutura e segurança

- **Banco (Supabase/Postgres):** schema versionado em `supabase/migrations/NNNN_*.sql`, aplicado por um
  runner próprio (`npm run db:migrate`); **Row-Level Security** em todas as tabelas sensíveis, por papel
  e por dono do cliente.
- **Storage (Supabase):** documentos, DANFSe (cache), mídia de atendimento e anexos de onboarding, com
  rotas de acesso controladas (URLs assinadas de curta duração).
- **Criptografia (AES-256-GCM):** credenciais do WhatsApp, certificados NFS-e, o **cofre de acessos** do
  onboarding, as credenciais de boleto e as **credenciais de e-mail** (senha SMTP / chave de API) são
  cifradas; chaves em variáveis de ambiente (`WHATSAPP_CRIPTO_KEY`, `ONBOARDING_CRIPTO_KEY`,
  `BOLETO_CRIPTO_KEY`, `EMAIL_CRIPTO_KEY`) — definidas uma vez e **nunca alteradas** (mudar torna os
  dados cifrados irrecuperáveis).
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
