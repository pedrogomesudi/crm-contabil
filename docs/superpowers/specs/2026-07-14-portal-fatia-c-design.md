# Portal do cliente — Fatia C (solicitações) — Design

**Data:** 2026-07-14
**Contexto:** Fecha o portal. Entrega o **RF-054**: central de solicitações do cliente, com categorização, SLA e **conversão em tarefa interna**.

## Objetivo

O cliente abre uma **solicitação** pelo portal, **conversa** com o escritório dentro dela (thread), e o escritório acompanha por **status e SLA**, podendo **converter em tarefa** e resolver.

## Decisões (brainstorm)
1. **Com conversa (thread):** cliente e escritório trocam mensagens dentro da solicitação — é o que tira conversa do WhatsApp e deixa histórico por assunto.
2. **Categorias próprias + SLA único:** `guia`, `documento`, `duvida`, `outro`; um **SLA em dias** (padrão 2), configurável pelo admin.

## Segurança — a segunda escrita do papel `cliente`

O cliente ganha exatamente **duas** novas escritas, ambas estreitas:
- **INSERT em `solicitacao`** — só do próprio cadastro e sempre nascendo `status='aberta'` (não escolhe status, prazo, responsável nem tarefa).
- **INSERT em `solicitacao_mensagem`** — só em solicitação que ele **enxerga** (ou seja, dele).
- **Sem UPDATE e sem DELETE** em nada. Quem muda status, responsável, prazo e converte em tarefa é **a equipe**.
- A **conversão em tarefa** é da equipe (o cliente segue sem qualquer policy em `tarefa`).
- O **prazo (SLA) é calculado no servidor**, nunca vem do formulário.

## Modelo de dados (migration 0087)

```sql
do $$ begin create type solicitacao_categoria as enum ('guia','documento','duvida','outro');
exception when duplicate_object then null; end $$;
do $$ begin create type solicitacao_status as enum ('aberta','em_andamento','respondida','resolvida');
exception when duplicate_object then null; end $$;

create sequence if not exists solicitacao_numero_seq;

create table if not exists solicitacao (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null default nextval('solicitacao_numero_seq'),
  cliente_id uuid not null references clientes(id) on delete cascade,
  categoria solicitacao_categoria not null,
  assunto text not null,
  status solicitacao_status not null default 'aberta',
  prazo date,                                   -- SLA (calculado no servidor)
  responsavel_id uuid references usuarios(id),
  tarefa_id uuid references tarefa(id) on delete set null,   -- conversão
  criado_por uuid references usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  resolvida_em timestamptz
);
create index if not exists idx_solicitacao_cliente on solicitacao (cliente_id);

create table if not exists solicitacao_mensagem (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references solicitacao(id) on delete cascade,
  autor_id uuid references usuarios(id) default auth.uid(),
  corpo text not null,
  criado_em timestamptz not null default now()
);
create index if not exists idx_solic_msg on solicitacao_mensagem (solicitacao_id, criado_em);

alter table escritorio_config add column if not exists solicitacao_sla_dias int not null default 2;
```

### RLS
```sql
-- SELECT: uma regra serve aos dois lados. Para a EQUIPE, exists(clientes) filtra pelos clientes
-- visíveis; para o CLIENTE, a policy do portal (0085) só devolve o próprio cadastro.
create policy solicitacao_sel on solicitacao for select to authenticated
  using (exists (select 1 from clientes c where c.id = cliente_id));

-- INSERT: cliente só do próprio cadastro e sempre 'aberta'; equipe em cliente visível.
create policy solicitacao_ins on solicitacao for insert to authenticated with check (
  (cliente_id = auth_cliente_id() and status = 'aberta')
  or (auth_papel() in ('admin','assistente','contador') and exists (select 1 from clientes c where c.id = cliente_id))
);

-- UPDATE: SÓ a equipe (status, responsável, prazo, tarefa). O cliente não altera nada.
create policy solicitacao_upd on solicitacao for update to authenticated
  using (auth_papel() in ('admin','assistente','contador') and exists (select 1 from clientes c where c.id = cliente_id))
  with check (auth_papel() in ('admin','assistente','contador') and exists (select 1 from clientes c where c.id = cliente_id));

-- Mensagens: lê quem enxerga a solicitação; escreve o dono (cliente) ou a equipe. Sem update/delete.
create policy solic_msg_sel on solicitacao_mensagem for select to authenticated
  using (exists (select 1 from solicitacao s where s.id = solicitacao_id));
create policy solic_msg_ins on solicitacao_mensagem for insert to authenticated with check (
  exists (select 1 from solicitacao s where s.id = solicitacao_id
          and (s.cliente_id = auth_cliente_id() or auth_papel() in ('admin','assistente','contador')))
);
```
Trigger `solicitacao_integridade`: `atualizado_em = now()`; ao virar `resolvida`, grava `resolvida_em` (limpa ao reabrir).

## Componentes

### Biblioteca — `src/lib/solicitacoes/solicitacao.ts` (pura)
- `SOLICITACAO_CATEGORIAS`, `SOLICITACAO_STATUS` (valor→rótulo).
- `prazoSla(hojeIso, slaDias): string`.
- Severidade do prazo: reusa `classificarAlerta` (resolvida não tem severidade).

### Portal
- `/portal/solicitacoes`: lista (número, assunto, categoria, status, prazo) + **"Nova solicitação"** (categoria, assunto, primeira mensagem).
- `/portal/solicitacoes/[id]`: **thread** (mensagens em ordem, autor "você" × escritório) + campo para responder.
- Ações: `abrirSolicitacao` (prazo calculado no servidor pelo SLA da config) e `responderSolicitacao`.
- Item no menu do portal.

### Escritório
- **`/solicitacoes`** (menu "Solicitações"): painel com filtros (status, categoria, **SLA vencido**), selo de atraso.
- **`/solicitacoes/[id]`**: thread + responder + **atribuir responsável** + **mudar status** + **"Converter em tarefa"** (cria a tarefa vinculada ao cliente e guarda `tarefa_id`) + resolver.
- **Configurações → Marca:** campo **"SLA de solicitações (dias)"**.

## Testes
- **RLS:** cliente abre solicitação **só do próprio** cadastro e **sempre 'aberta'** (não nasce 'resolvida' nem em cadastro alheio); **não** altera status/responsável; escreve mensagem **só** na dele; equipe atualiza e converte. Cliente **continua sem** policy em `tarefa`.
- **Unit:** `prazoSla`, rótulos.
- Suíte + `db:test` verdes antes de cada commit.

## Fora de escopo
- Anexos na solicitação (o cliente já envia documentos na aba Documentos).
- Notificação por WhatsApp/e-mail ao responder.
- SLA por categoria (foi decidido SLA único).
