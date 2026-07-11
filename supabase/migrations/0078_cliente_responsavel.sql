-- RF-025: responsáveis internos por departamento, por cliente (camada nova; RLS de clientes intacta).
do $$ begin create type departamento as enum ('contabil','fiscal','pessoal','societario');
exception when duplicate_object then null; end $$;

create table if not exists cliente_responsavel (
  cliente_id uuid not null references clientes(id) on delete cascade,
  departamento departamento not null,
  usuario_id uuid not null references usuarios(id),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id) default auth.uid(),
  primary key (cliente_id, departamento)
);

alter table cliente_responsavel enable row level security;

drop policy if exists cliente_responsavel_sel on cliente_responsavel;
create policy cliente_responsavel_sel on cliente_responsavel for select to authenticated
  using (auth_papel() in ('admin','assistente','contador','financeiro'));

-- escrita: admin/assistente sempre; contador só nos clientes dele
drop policy if exists cliente_responsavel_ins on cliente_responsavel;
create policy cliente_responsavel_ins on cliente_responsavel for insert to authenticated
  with check (
    auth_papel() in ('admin','assistente')
    or (auth_papel() = 'contador' and exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid()))
  );

drop policy if exists cliente_responsavel_upd on cliente_responsavel;
create policy cliente_responsavel_upd on cliente_responsavel for update to authenticated
  using (
    auth_papel() in ('admin','assistente')
    or (auth_papel() = 'contador' and exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid()))
  )
  with check (
    auth_papel() in ('admin','assistente')
    or (auth_papel() = 'contador' and exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid()))
  );

drop policy if exists cliente_responsavel_del on cliente_responsavel;
create policy cliente_responsavel_del on cliente_responsavel for delete to authenticated
  using (
    auth_papel() in ('admin','assistente')
    or (auth_papel() = 'contador' and exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid()))
  );

create or replace function cliente_responsavel_integridade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_por := auth.uid();
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists trg_cliente_responsavel_integridade on cliente_responsavel;
create trigger trg_cliente_responsavel_integridade before insert or update on cliente_responsavel
  for each row execute function cliente_responsavel_integridade();
