# E-mail integrado (RF-051) — Fatia A — Design

**Data:** 2026-07-14
**Requisito:** RF-051 — "E-mail integrado (envio e registro automático na ficha do cliente), com
templates e variáveis de personalização." Prioridade **MVP**.
**Motivação extra (gap analysis v1.3):** a régua de cobrança depende **exclusivamente** do Z-API
(canal não oficial, sujeito a banimento do número pela Meta). O e-mail é a **redundância de canal** —
mas a régua por e-mail fica para a **Fatia B**.

---

## 1. Escopo

**Nesta fatia (A):**
1. Configuração do canal de e-mail pelo escritório (whitelabel: credencial dele, domínio dele).
2. Templates de e-mail com variáveis de personalização.
3. Envio manual a partir da ficha do cliente, com anexos vindos do próprio cadastro.
4. Registro automático de todo envio na ficha do cliente (histórico com status).

**Fora desta fatia (decisões conscientes):**
- **Caixa de entrada (IMAP/recebimento):** o RF-051 pede "envio e registro"; receber e-mail é outro
  produto (parser MIME, threading, anexos de entrada). Não entra.
- **Régua de cobrança por e-mail:** Fatia B, com o comportamento **fallback** — o e-mail sai quando o
  WhatsApp não está configurado, o cliente não tem telefone ou o envio falhou. Nunca duas cobranças do
  mesmo título no mesmo dia.
- **Comunicados em massa (RF-055):** reaproveitará o motor de templates, mas é outro requisito.
- **Rastreio de abertura (pixel):** não. Privacidade e pouco valor real; o gap analysis pede rastreio
  de *entrega de guia*, que o portal já resolve (RF-053).

## 2. Arquitetura

### 2.1 Provedor — o escritório escolhe

Duas formas, porque escritórios pequenos já têm um e-mail e não querem contratar nada, enquanto os
maiores querem entregabilidade:

- **SMTP** (`nodemailer`): host, porta, TLS, usuário, senha. Serve Google Workspace, Zoho, Titan,
  Locaweb — qualquer provedor. Zero atrito de ativação.
- **API** (`fetch`, sem SDK): **Resend** ou **SendGrid**, com chave de API. Melhor entregabilidade,
  exige verificar o domínio no provedor antes do primeiro envio.

A escolha vive em `email_config.provedor`. O código de chamada não sabe qual é: uma função
`enviarEmail(msg)` decide pelo config e despacha.

### 2.2 Segredos

Senha SMTP e chave de API são cifradas em **AES-256-GCM** com `EMAIL_CRIPTO_KEY` (env, runtime,
server-only), reusando `cifrar`/`decifrar` de `src/lib/nfse/cripto.ts`. É o padrão já adotado
(`WHATSAPP_CRIPTO_KEY`, `BOLETO_CRIPTO_KEY`, `ONBOARDING_CRIPTO_KEY`).

**Invariante:** credencial **nunca** volta ao navegador. A tela mostra apenas "configurado" /
"não configurado" e um campo de senha vazio (preencher = trocar; deixar em branco = manter).

### 2.3 Anexos — o navegador manda id, não caminho

O cliente anexa o que já existe no cadastro: **documento**, **comprovante de obrigação**, **DANFSe**
e **boleto**. O formulário envia `{tipo, id}`; o servidor lê o registro **pelo id** (a RLS prova a
titularidade — mesmo padrão dos downloads do portal), baixa do Storage e anexa o buffer.
Aceitar `caminho_storage` do navegador seria path traversal disfarçado. Teto: **10 MB** somados.

## 3. Banco — migration `0089_email.sql`

```sql
create type email_provedor as enum ('smtp','api');
create type email_api_provedor as enum ('resend','sendgrid');
create type email_status as enum ('ENVIADO','ERRO');

create table email_config (
  id smallint primary key default 1 check (id = 1),
  provedor email_provedor,
  remetente_nome text,
  remetente_email text,
  smtp_host text, smtp_porta int, smtp_seguro boolean not null default true,
  smtp_usuario text, smtp_senha_cifrada text,
  api_provedor email_api_provedor, api_chave_cifrada text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
insert into email_config (id) values (1) on conflict do nothing;

create table email_template (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  assunto text not null,
  corpo text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table email_mensagem (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete set null,
  titulo_id uuid references titulo(id) on delete set null,   -- usado pela Fatia B (régua)
  para text not null,
  assunto text not null,
  corpo text not null,
  anexos jsonb not null default '[]',                        -- [{tipo, id, nome}]
  status email_status not null,
  erro text,
  enviado_por uuid references usuarios(id),
  criado_em timestamptz not null default now()
);
create index on email_mensagem (cliente_id, criado_em desc);
```

**RLS:**
- `email_config`: SELECT e UPDATE só **admin** (custódia de credencial — mesma regra do WhatsApp e da
  NFS-e). As colunas cifradas nunca são selecionadas pela app do usuário: o envio roda com
  `service_role`.
- `email_template`: SELECT para toda a equipe; INSERT/UPDATE/DELETE para **admin e assistente**.
- `email_mensagem`: SELECT para a equipe (o contador escopado ao seu cliente, como nas demais);
  **sem policy de INSERT** — só o servidor grava (`service_role`), depois de enviar. O papel
  `cliente` é negado por padrão em tudo (nenhuma policy o lista) — o portal não vê esta tabela.

## 4. Código

```
src/lib/email/
  config.ts       carrega e decifra o config (server-only)
  enviar.ts       enviarEmail(): despacha SMTP (nodemailer) ou API (fetch), devolve {ok|erro}
  template.ts     VARIAVEIS (catálogo), variaveisDoCliente(), aplicar() — reusa aplicarTemplate()
  validacao.ts    e-mail válido, limites (assunto 200, corpo 20k, anexos 10 MB)
src/app/(app)/configuracoes/email/
  page.tsx, FormEmail.tsx, actions.ts        (config + "Enviar e-mail de teste")
  templates/page.tsx, FormTemplate.tsx, actions.ts
src/components/clientes/EmailsCliente.tsx     seção da ficha: botão Enviar + histórico
src/app/(app)/clientes/[id]/email-actions.ts  enviarEmailCliente(), listarEmails()
```

**Variáveis dos templates** (mesma sintaxe `{chave}` da régua, via `aplicarTemplate()` de
`src/lib/whatsapp/mensagem.ts` — não duplico o motor):
`{nome}` (razão social), `{cnpj}`, `{email}`, `{escritorio}`, `{valor}`, `{vencimento}`,
`{competencia}`, `{hoje}`. As financeiras só têm valor quando o envio parte de um título (Fatia B);
no envio manual vêm vazias, e a tela avisa quais estão disponíveis.

**Testes unitários** (vitest, sem rede): validação de e-mail e limites; aplicação de variáveis com
chave ausente; escolha do provedor a partir do config; montagem do payload do Resend/SendGrid.

## 5. Segurança

- Gate de papel em toda action: config = **admin**; templates = admin/assistente; envio = quem
  gerencia o cadastro do cliente (admin/assistente/contador). Financeiro **não envia** nesta fatia.
- Credenciais só server-side, cifradas; `EMAIL_CRIPTO_KEY` nunca `NEXT_PUBLIC_`.
- **Host SMTP arbitrário é definido só por admin** — é ele quem escolhe para onde a senha dele vai.
  Nenhum input de usuário comum alcança o destino da conexão.
- Destinatário: apenas endereços **do cadastro do cliente** ou digitado pelo operador da equipe;
  nunca vindo de conteúdo do cliente final.
- Anexos por id, com leitura via RLS (§2.3).
- Corpo enviado como **texto** (e HTML derivado com escape) — não aceito HTML cru do usuário, para não
  virar vetor de injeção no cliente de e-mail de quem recebe.

## 6. Entrega e validação

`npm run db:migrate` (0089) → lint/typecheck/test/build → deploy. Antes de usar, **adicionar
`EMAIL_CRIPTO_KEY` no EasyPanel** (chave hex de 32 bytes, gerada na entrega).

Validação em produção: configurar o SMTP do escritório, mandar o **e-mail de teste**, criar um
template, enviar da ficha de um cliente com um documento anexo e conferir o registro no histórico —
inclusive um envio com senha errada, que deve gravar status **ERRO** com a mensagem do provedor.

**Versão:** `v5.24.0` (feature).
