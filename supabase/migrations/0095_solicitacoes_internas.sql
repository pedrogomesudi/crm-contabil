-- RF-045: solicitações internas entre departamentos, com SLA e fila de atendimento.
-- Tabela PRÓPRIA (não a `solicitacao` do portal): aquela gira em torno de auth_cliente_id()
-- e de cliente_id obrigatório — enfiar pedidos internos ali colocaria um cliente_id nulo
-- atravessando policies escritas para o caso oposto.
do $$ begin create type solic_interna_status as enum ('aberta','em_andamento','respondida','resolvida');
exception when duplicate_object then null; end $$;

-- SLA POR DEPARTAMENTO: a natureza do trabalho é diferente (Pessoal responde em 1 dia,
-- Societário em 5). É o que torna o indicador de "SLA vencido" justo.
create table if not exists departamento_sla (
  departamento departamento primary key,
  dias int not null default 3 check (dias between 0 and 60)
);
insert into departamento_sla (departamento, dias) values
  ('contabil', 3), ('fiscal', 2), ('pessoal', 1), ('societario', 5)
on conflict (departamento) do nothing;

-- Departamento do colaborador = a origem do pedido. Null → a pessoa escolhe ao abrir.
alter table usuarios add column if not exists departamento departamento;

create sequence if not exists solic_interna_numero_seq;

create table if not exists solicitacao_interna (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null default nextval('solic_interna_numero_seq'),
  origem departamento not null,
  destino departamento not null,
  cliente_id uuid references clientes(id) on delete set null,
  assunto text not null,
  status solic_interna_status not null default 'aberta',
  prazo date,
  solicitante_id uuid references usuarios(id),
  responsavel_id uuid references usuarios(id),   -- null = na fila do destino
  tarefa_id uuid references tarefa(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  resolvida_em timestamptz
);
create index if not exists ix_solic_int_destino on solicitacao_interna(destino, status);
create index if not exists ix_solic_int_resp on solicitacao_interna(responsavel_id);

create table if not exists solicitacao_interna_mensagem (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references solicitacao_interna(id) on delete cascade,
  autor_id uuid references usuarios(id),
  corpo text not null,
  criado_em timestamptz not null default now()
);
create index if not exists ix_solic_int_msg on solicitacao_interna_mensagem(solicitacao_id, criado_em);

-- Lição da 0088: DEFAULT NÃO É VALIDAÇÃO. Um `default auth.uid()` não impede que a coluna
-- seja enviada explicitamente via PostgREST. Os gatilhos abaixo SOBRESCREVEM no servidor a
-- autoria, a numeração e o PRAZO — este último calculado pelo SLA do DESTINO, nunca pelo
-- que veio no formulário (senão todo pedido nasceria "para ontem").
create or replace function solic_interna_integridade() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_sla int;
begin
  new.atualizado_em := now();

  if tg_op = 'INSERT' then
    new.solicitante_id := coalesce(auth.uid(), new.solicitante_id);
    new.numero := nextval('solic_interna_numero_seq');
    new.status := 'aberta';
    new.resolvida_em := null;
    select dias into v_sla from departamento_sla where departamento = new.destino;
    new.prazo := current_date + coalesce(v_sla, 3);
  end if;

  if new.status = 'resolvida' and new.resolvida_em is null then new.resolvida_em := now(); end if;
  if new.status <> 'resolvida' then new.resolvida_em := null; end if;
  return new;
end $$;

drop trigger if exists trg_solic_interna_integridade on solicitacao_interna;
create trigger trg_solic_interna_integridade before insert or update on solicitacao_interna
  for each row execute function solic_interna_integridade();

create or replace function solic_interna_msg_integridade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.autor_id := coalesce(auth.uid(), new.autor_id);
  return new;
end $$;

drop trigger if exists trg_solic_interna_msg on solicitacao_interna_mensagem;
create trigger trg_solic_interna_msg before insert on solicitacao_interna_mensagem
  for each row execute function solic_interna_msg_integridade();

alter table departamento_sla enable row level security;
alter table solicitacao_interna enable row level security;
alter table solicitacao_interna_mensagem enable row level security;

-- Comunicação INTERNA: a equipe toda lê e escreve. O papel `cliente` é negado por omissão
-- (nenhuma policy o lista) — o portal não enxerga nada disto.
do $$ begin
  drop policy if exists dep_sla_sel on departamento_sla;
  create policy dep_sla_sel on departamento_sla for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists dep_sla_write on departamento_sla;
  create policy dep_sla_write on departamento_sla for all to authenticated
    using (auth_papel() = 'admin') with check (auth_papel() = 'admin');

  drop policy if exists solic_int_sel on solicitacao_interna;
  create policy solic_int_sel on solicitacao_interna for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists solic_int_ins on solicitacao_interna;
  create policy solic_int_ins on solicitacao_interna for insert to authenticated
    with check (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists solic_int_upd on solicitacao_interna;
  create policy solic_int_upd on solicitacao_interna for update to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'))
    with check (auth_papel() in ('admin','assistente','contador','financeiro'));

  drop policy if exists solic_int_msg_sel on solicitacao_interna_mensagem;
  create policy solic_int_msg_sel on solicitacao_interna_mensagem for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists solic_int_msg_ins on solicitacao_interna_mensagem;
  create policy solic_int_msg_ins on solicitacao_interna_mensagem for insert to authenticated
    with check (auth_papel() in ('admin','assistente','contador','financeiro'));
end $$;
