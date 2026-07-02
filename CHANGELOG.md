# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota o
[Versionamento Semântico](https://semver.org/lang/pt-BR/). Veja as regras em
[`docs/VERSIONAMENTO.md`](docs/VERSIONAMENTO.md) e o plano de evolução em [`ROADMAP.md`](ROADMAP.md).

## [Não lançado]

- Em planejamento: **V5-B — NFS-e dos clientes (multi-emitente)** e **V6 — Layout/estética** (ver `ROADMAP.md`).

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
