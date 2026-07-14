# Solicitações internas entre departamentos (RF-045) — Design

**Data:** 2026-07-14
**Requisito:** RF-045 — "Solicitações internas entre departamentos com SLA e fila de atendimento."

---

## 1. Tabela própria, não a do portal

O portal já tem `solicitacao` (RF-054). **Não vou estendê-la.** Ela é cliente-facing: a RLS gira em torno de
`auth_cliente_id()` e o `cliente_id` é obrigatório. Enfiar pedidos internos ali significaria um `cliente_id`
nulo atravessando policies escritas para o caso oposto — o tipo de remendo em que um `cliente` acaba vendo o
que não devia por causa de um `null` inesperado.

Tabela nova, `solicitacao_interna`, **reaproveitando as lições** da outra: numeração por sequência, SLA
calculado no servidor e **gatilho que sobrescreve os campos forjáveis**.

## 2. Fila com responsável opcional (decisão do usuário)

A solicitação nasce **na fila do departamento de destino**, normalmente **sem dono**. Quem for atender clica
em **"Assumir"** e vira responsável. Quem abre **pode sugerir** um responsável, mas não é obrigatório.

Por que a fila é o padrão: um pedido endereçado a uma pessoa específica **morre na caixa de quem saiu de
férias** — ninguém mais vê que ele existe. Na fila, o departamento inteiro enxerga.

## 3. SLA por departamento (decisão do usuário)

`departamento_sla (departamento pk, dias int)` — Fiscal responde em 2 dias, Pessoal em 1, Contábil em 3. O
prazo é calculado **no servidor**, a partir do SLA do **departamento de destino**, e o solicitante **não pode
escolhê-lo** (senão todo pedido nasceria "para ontem").

Sem SLA cadastrado → cai num padrão (3 dias), e a tela de configuração avisa.

## 4. Banco — `0095_solicitacoes_internas.sql`

```sql
create type solic_interna_status as enum ('aberta','em_andamento','respondida','resolvida');

create table departamento_sla (
  departamento departamento primary key,
  dias int not null default 3 check (dias between 0 and 60)
);

create table solicitacao_interna (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null,                       -- sequência; gerado pelo gatilho
  origem departamento not null,                 -- departamento de quem pede
  destino departamento not null,                -- fila de destino
  cliente_id uuid references clientes(id) on delete set null,   -- opcional: sobre qual cliente
  assunto text not null,
  status solic_interna_status not null default 'aberta',
  prazo date,                                   -- do SLA do destino; NUNCA do formulário
  solicitante_id uuid references usuarios(id),  -- forçado pelo gatilho = auth.uid()
  responsavel_id uuid references usuarios(id),  -- null = na fila
  tarefa_id uuid references tarefa(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  resolvida_em timestamptz
);

create table solicitacao_interna_mensagem (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references solicitacao_interna(id) on delete cascade,
  autor_id uuid references usuarios(id),        -- forçado pelo gatilho
  corpo text not null,
  criado_em timestamptz not null default now()
);
```

**Gatilho `before insert/update`** (a lição da migration 0088 — *default não é validação*): sobrescreve
`solicitante_id` e `autor_id` com `auth.uid()`, gera o `numero`, calcula o `prazo` pelo SLA do destino e
zera `resolvida_em` quando o status sai de `resolvida`. Sem isso, qualquer usuário com JWT válido chamaria a
API direto e **forjaria a autoria de uma mensagem** ou esticaria o próprio prazo.

**RLS:** é comunicação **interna** — toda a equipe (`admin/assistente/contador/financeiro`) lê e escreve; o
papel `cliente` é negado por padrão (nenhuma policy o lista), então o portal não enxerga nada. `departamento_sla`:
leitura para a equipe, escrita para **admin**.

## 5. Telas

- **`/solicitacoes/internas`** — a **fila**: agrupada por departamento de destino, com filtros (destino,
  origem, status, **SLA vencido**, "só as minhas", "sem responsável"). Cada linha mostra número, assunto,
  cliente (se houver), quem pediu, prazo e se está vencida.
- **Abrir solicitação:** destino, assunto, descrição, cliente (opcional) e responsável (opcional). A origem
  é o **departamento do solicitante** — resolvido no servidor a partir de `cliente_responsavel`/perfil;
  se a pessoa não tiver departamento, ela escolhe.
- **Detalhe** (`/solicitacoes/internas/[id]`) — **thread** de mensagens, botão **"Assumir"** (quando está na
  fila), mudar status, **"Converter em tarefa"** (reusa o padrão do RF-054) e resolver.
- **Início (dashboard):** contador de "solicitações na minha fila" e "vencidas" — senão a fila vira um lugar
  onde ninguém entra.

Reusa o menu **Solicitações** já existente, com duas abas: **Do cliente** (RF-054) e **Internas** (RF-045).

## 6. Testes

Unitários: `slaDoDepartamento()` (com fallback e aviso), `filaDoDepartamento()` (ordenação: vencidas
primeiro, depois por prazo), `estaVencida(status, prazo, hoje)` (resolvida nunca conta como vencida).

RLS: a equipe toda vê e escreve; **o cliente do portal não vê nada** (0 linhas nas duas tabelas); o
solicitante **não consegue forjar** `solicitante_id` nem `autor_id` (o gatilho normaliza — o teste lê de
volta e confere); o **prazo forjado** no INSERT é **sobrescrito** pelo SLA do destino.

## 7. Entrega

Migration → lint/typecheck/test/build → deploy. Validar: configurar o SLA de dois departamentos, abrir uma
solicitação do Fiscal para o Contábil, ver que ela **nasce na fila sem dono** com o prazo do Contábil,
**assumir**, responder, converter em tarefa e resolver.

**Versão:** `v5.29.0` (feature).
