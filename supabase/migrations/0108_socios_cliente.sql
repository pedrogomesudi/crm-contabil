-- RF-026 (Fatia B): sócios em comum.
create table if not exists socio (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text not null unique,
  criado_em timestamptz not null default now()
);

create table if not exists cliente_socio (
  cliente_id uuid not null references clientes(id) on delete cascade,
  socio_id  uuid not null references socio(id)     on delete cascade,
  primary key (cliente_id, socio_id)
);

-- RLS: leitura para a equipe; escrita admin/assistente.
alter table socio         enable row level security;
alter table cliente_socio enable row level security;
drop policy if exists socio_read  on socio;
drop policy if exists socio_write on socio;
create policy socio_read  on socio for select using (auth_papel() in ('admin','assistente','contador'));
create policy socio_write on socio for all
  using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));
drop policy if exists cliente_socio_read  on cliente_socio;
drop policy if exists cliente_socio_write on cliente_socio;
create policy cliente_socio_read  on cliente_socio for select using (auth_papel() in ('admin','assistente','contador'));
create policy cliente_socio_write on cliente_socio for all
  using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));
