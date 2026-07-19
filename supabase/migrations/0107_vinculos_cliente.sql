-- RF-026 (Fatia A): grupo econômico + matriz/filial.
create table if not exists grupo_economico (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

alter table clientes add column if not exists grupo_id  uuid references grupo_economico(id) on delete set null;
alter table clientes add column if not exists matriz_id uuid references clientes(id)        on delete set null;
do $$ begin
  alter table clientes drop constraint if exists clientes_matriz_nao_self;
  alter table clientes add  constraint clientes_matriz_nao_self check (matriz_id is null or matriz_id <> id);
end $$;

-- RLS: dicionário compartilhado — leitura para a equipe, escrita admin/assistente.
alter table grupo_economico enable row level security;
drop policy if exists grupo_economico_read  on grupo_economico;
drop policy if exists grupo_economico_write on grupo_economico;
create policy grupo_economico_read  on grupo_economico for select
  using (auth_papel() in ('admin','assistente','contador'));
create policy grupo_economico_write on grupo_economico for all
  using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));
