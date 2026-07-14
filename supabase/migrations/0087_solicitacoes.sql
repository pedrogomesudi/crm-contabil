-- Portal Fatia C (RF-054): solicitações do cliente com thread, SLA e conversão em tarefa.
-- Segunda escrita do papel 'cliente': abrir solicitação (sempre 'aberta', só do próprio
-- cadastro) e postar mensagem na dela. Sem UPDATE e sem DELETE.

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
  prazo date,
  responsavel_id uuid references usuarios(id),
  tarefa_id uuid references tarefa(id) on delete set null,
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

-- SLA único, configurável pelo admin.
alter table escritorio_config add column if not exists solicitacao_sla_dias int not null default 2;

alter table solicitacao enable row level security;
alter table solicitacao_mensagem enable row level security;

-- SELECT: uma regra serve aos dois lados. Para a EQUIPE, exists(clientes) filtra pelos
-- clientes visíveis; para o CLIENTE, a policy do portal (0085) só devolve o próprio cadastro.
drop policy if exists solicitacao_sel on solicitacao;
create policy solicitacao_sel on solicitacao for select to authenticated
  using (exists (select 1 from clientes c where c.id = cliente_id));

-- INSERT: cliente só do PRÓPRIO cadastro e sempre nascendo 'aberta'; equipe em cliente visível.
drop policy if exists solicitacao_ins on solicitacao;
create policy solicitacao_ins on solicitacao for insert to authenticated with check (
  (cliente_id = auth_cliente_id() and status = 'aberta')
  or (auth_papel() in ('admin','assistente','contador') and exists (select 1 from clientes c where c.id = cliente_id))
);

-- UPDATE: SÓ a equipe. O cliente não altera status, responsável, prazo nem tarefa.
drop policy if exists solicitacao_upd on solicitacao;
create policy solicitacao_upd on solicitacao for update to authenticated
  using (auth_papel() in ('admin','assistente','contador') and exists (select 1 from clientes c where c.id = cliente_id))
  with check (auth_papel() in ('admin','assistente','contador') and exists (select 1 from clientes c where c.id = cliente_id));

-- Mensagens: lê quem enxerga a solicitação; escreve o dono (cliente) ou a equipe. Sem update/delete.
drop policy if exists solic_msg_sel on solicitacao_mensagem;
create policy solic_msg_sel on solicitacao_mensagem for select to authenticated
  using (exists (select 1 from solicitacao s where s.id = solicitacao_id));
drop policy if exists solic_msg_ins on solicitacao_mensagem;
create policy solic_msg_ins on solicitacao_mensagem for insert to authenticated with check (
  exists (select 1 from solicitacao s where s.id = solicitacao_id
          and (s.cliente_id = auth_cliente_id() or auth_papel() in ('admin','assistente','contador')))
);

create or replace function solicitacao_integridade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if new.status = 'resolvida' and new.resolvida_em is null then new.resolvida_em := now(); end if;
  if new.status <> 'resolvida' then new.resolvida_em := null; end if;
  return new;
end $$;
drop trigger if exists trg_solicitacao_integridade on solicitacao;
create trigger trg_solicitacao_integridade before insert or update on solicitacao
  for each row execute function solicitacao_integridade();
