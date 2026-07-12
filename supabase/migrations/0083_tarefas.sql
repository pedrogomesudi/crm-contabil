-- RF-040/042 (Fatia A): tarefas internas com checklist.
do $$ begin create type tarefa_status as enum ('aberta','em_andamento','concluida','cancelada'); exception when duplicate_object then null; end $$;
do $$ begin create type tarefa_prioridade as enum ('baixa','media','alta','urgente'); exception when duplicate_object then null; end $$;

create table if not exists tarefa (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  responsavel_id uuid references usuarios(id),
  cliente_id uuid references clientes(id) on delete set null,
  departamento departamento,
  prioridade tarefa_prioridade not null default 'media',
  prazo date,
  status tarefa_status not null default 'aberta',
  concluida_em timestamptz,
  criado_por uuid references usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_tarefa_responsavel on tarefa(responsavel_id);
create index if not exists idx_tarefa_cliente on tarefa(cliente_id);

create table if not exists tarefa_item (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references tarefa(id) on delete cascade,
  descricao text not null,
  feito boolean not null default false,
  ordem int not null default 0
);

alter table tarefa enable row level security;
alter table tarefa_item enable row level security;

drop policy if exists tarefa_sel on tarefa;
create policy tarefa_sel on tarefa for select to authenticated using (auth_papel() in ('admin','assistente','contador','financeiro'));
drop policy if exists tarefa_ins on tarefa;
create policy tarefa_ins on tarefa for insert to authenticated with check (auth_papel() in ('admin','assistente','contador','financeiro'));
drop policy if exists tarefa_upd on tarefa;
create policy tarefa_upd on tarefa for update to authenticated
  using (auth_papel() in ('admin','assistente') or responsavel_id = auth.uid() or criado_por = auth.uid())
  with check (auth_papel() in ('admin','assistente') or responsavel_id = auth.uid() or criado_por = auth.uid());
drop policy if exists tarefa_del on tarefa;
create policy tarefa_del on tarefa for delete to authenticated
  using (auth_papel() in ('admin','assistente') or responsavel_id = auth.uid() or criado_por = auth.uid());

drop policy if exists titem_sel on tarefa_item;
create policy titem_sel on tarefa_item for select to authenticated using (exists (select 1 from tarefa t where t.id = tarefa_id));
drop policy if exists titem_wr on tarefa_item;
create policy titem_wr on tarefa_item for all to authenticated
  using (exists (select 1 from tarefa t where t.id = tarefa_id and (auth_papel() in ('admin','assistente') or t.responsavel_id = auth.uid() or t.criado_por = auth.uid())))
  with check (exists (select 1 from tarefa t where t.id = tarefa_id and (auth_papel() in ('admin','assistente') or t.responsavel_id = auth.uid() or t.criado_por = auth.uid())));

create or replace function tarefa_integridade() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if new.status = 'concluida' and new.concluida_em is null then new.concluida_em := now(); end if;
  if new.status <> 'concluida' then new.concluida_em := null; end if;
  return new;
end $$;
drop trigger if exists trg_tarefa_integridade on tarefa;
create trigger trg_tarefa_integridade before insert or update on tarefa for each row execute function tarefa_integridade();
