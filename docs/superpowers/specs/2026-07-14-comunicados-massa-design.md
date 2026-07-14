# Comunicados em massa segmentados (RF-055) — Design

**Data:** 2026-07-14
**Requisito:** RF-055 — "Comunicados em massa segmentados (por regime, departamento, município) para
avisos de legislação e prazos."
**Nota do gap analysis (v1.3):** *"o disparo em lote com marcadores personalizáveis é base reaproveitável;
falta segmentação por atributos cadastrais."*

---

## 1. O que já existe e o que falta

Já temos: o **motor de e-mail** (SMTP/API, RF-051), os **templates com variáveis**, o disparo em lote da
NFS-e por WhatsApp e o `aplicarTemplate()`. **Falta a segmentação** — escolher *quem* recebe a partir do
cadastro — e o registro do que foi enviado a quem.

## 2. Canal e o risco do WhatsApp

**Decisão (usuário): e-mail como canal principal, WhatsApp opcional por comunicado.**

Disparo em massa por WhatsApp é o **gatilho clássico de banimento** de número pela Meta, e o Z-API é canal
não oficial. Perder o número derrubaria, de uma vez, o **atendimento** e a **régua de cobrança**. Por isso o
WhatsApp entra com travas:

- **teto de 50 destinatários** por comunicado no canal WhatsApp (o e-mail não tem teto);
- **aviso explícito na tela** antes de confirmar, dizendo o risco em português claro;
- envio **espaçado** (intervalo entre mensagens), não em rajada.

## 3. Segmentação

Filtro montado sobre os atributos que já existem no cadastro:

- **regime tributário** (Simples, Presumido, Real, MEI, Isento/PF) — múltipla escolha;
- **tipo de pessoa** (PJ, PF, MEI);
- **status** (ativo, em constituição, inativo);
- **município** e **UF** (de `clientes.endereco` jsonb);
- **contador responsável**;
- **responsável por departamento** (`cliente_responsavel`) — "todos os clientes cujo responsável Fiscal é a
  Ana".

Os filtros combinam com **E** (todos os critérios), e cada critério com **OU** internamente (regime =
Simples **ou** MEI). É o que a linguagem natural do escritório espera: "os Simples e MEI de Goiânia".

## 4. Prévia obrigatória

**Não existe disparo sem prévia.** Antes de enviar, a tela mostra **a contagem** e **a lista** de quem vai
receber, com o motivo de quem foi **excluído** (sem e-mail; opt-out). Um comunicado errado vai para
centenas de clientes assinado pelo escritório, e não tem como voltar atrás — a prévia é a única chance de
perceber.

Também há um **envio de teste** para o próprio operador antes do disparo real.

## 5. Opt-out (LGPD)

Nova coluna `clientes.aceita_comunicados boolean not null default true` — separada dos interruptores de
**cobrança**, que são outra finalidade. Um cliente pode querer receber a cobrança e não os informativos.
Fica na tabela `clientes` (não em `clientes_financeiro`) porque não é dado financeiro e porque toda linha de
cliente existe.

## 6. Banco — `0093_comunicados.sql`

```sql
create type comunicado_canal as enum ('email','whatsapp');
create type comunicado_status as enum ('rascunho','enviando','enviado');
create type comunicado_envio_status as enum ('ENVIADO','ERRO');

create table comunicado (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,             -- nome interno, não vai ao cliente
  assunto text not null,            -- assunto do e-mail
  corpo text not null,              -- com variáveis {nome}, {escritorio}, {hoje}...
  canal comunicado_canal not null default 'email',
  filtro jsonb not null default '{}',
  status comunicado_status not null default 'rascunho',
  criado_por uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);

create table comunicado_destinatario (
  id uuid primary key default gen_random_uuid(),
  comunicado_id uuid not null references comunicado(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete set null,
  para text not null,
  status comunicado_envio_status not null,
  erro text,
  criado_em timestamptz not null default now()
);
-- Idempotência: o mesmo cliente não recebe o mesmo comunicado duas vezes, mesmo que
-- o operador clique duas vezes ou reexecute o "reenviar falhas".
create unique index uq_comunicado_cliente on comunicado_destinatario(comunicado_id, cliente_id)
  where cliente_id is not null;

alter table clientes add column aceita_comunicados boolean not null default true;
```

**RLS:** `comunicado` e `comunicado_destinatario` — leitura para a equipe; **escrita para admin e
assistente** (decisão do usuário: mesma trava dos templates). O `comunicado_destinatario` **não tem policy
de INSERT** — só o servidor grava, depois de enviar, como em `email_mensagem`: ninguém forja um "enviado".
O papel `cliente` é negado por padrão (nenhuma policy o lista).

## 7. Envio

Server action, com `service_role` para gravar o registro:

1. **resolve o segmento** (a query do filtro, com o supabase do usuário — a RLS confirma o escopo);
2. **exclui** quem não tem e-mail/telefone e quem tem `aceita_comunicados = false`;
3. no WhatsApp, **barra acima de 50**;
4. envia **um a um**, aplicando as variáveis por cliente (`{nome}`, `{cnpj}`, `{escritorio}`, `{hoje}`);
5. grava **cada destinatário** com status — **inclusive as falhas**, com a mensagem do provedor;
6. o comunicado vira `enviado`.

**Reenviar falhas:** reprocessa só os `ERRO` — o índice único impede reenviar a quem já recebeu.

Não é assíncrono nesta fatia: o disparo roda na própria action, com prévia mostrando o total. Para bases
grandes isso pode demorar; se virar problema real, a fatia seguinte move para um job. **Não vou construir
fila antes de existir o problema.**

## 8. Telas

- **`/comunicados`** (menu): lista dos comunicados, com status, canal, total enviado e erros.
- **`/comunicados/novo`**: título, canal, assunto, corpo (com o catálogo de variáveis, como nos templates),
  os filtros de segmentação e o botão **"Ver quem vai receber"** → prévia com contagem, lista e excluídos →
  **"Enviar teste para mim"** → **"Disparar"** (com confirmação que repete o número de destinatários).
- **`/comunicados/[id]`**: o que foi enviado, para quem, com status e erro; botão **"Reenviar falhas"**.
- **Ficha do cliente:** o interruptor **"Aceita comunicados"**, ao lado dos de cobrança.

## 9. Testes

Unitários (a regra é o que erra):
- `descreverFiltro()`: "Simples ou MEI · Goiânia/GO" — é o texto que o operador lê antes de disparar;
- `aplicarFiltro()` sobre uma lista de clientes: E entre critérios, OU dentro do critério; cliente sem
  endereço não quebra o filtro de cidade;
- `elegiveis()`: separa quem recebe de quem é excluído, com o motivo (sem e-mail, opt-out).

RLS: financeiro e contador **não criam** comunicado; ninguém insere em `comunicado_destinatario` pela app;
cliente do portal não vê nada.

## 10. Entrega

`npm run db:migrate` → lint/typecheck/test/build → deploy. Validar em produção com um comunicado
segmentado para **você mesmo** (filtre por um cliente de teste), conferindo a prévia, o envio de teste, o
disparo, o registro e o "reenviar falhas".

**Versão:** `v5.27.0` (feature).
