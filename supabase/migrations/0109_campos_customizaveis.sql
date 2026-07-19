-- RF-027: campos customizáveis por escritório.
create table if not exists campo_custom (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('texto','numero','data','booleano','lista')),
  obrigatorio boolean not null default false,
  opcoes text[],            -- usado só quando tipo = 'lista'
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table clientes add column if not exists campos_custom jsonb not null default '{}'::jsonb;

alter table campo_custom enable row level security;
drop policy if exists campo_custom_read  on campo_custom;
drop policy if exists campo_custom_write on campo_custom;
create policy campo_custom_read  on campo_custom for select using (auth_papel() in ('admin','assistente','contador'));
create policy campo_custom_write on campo_custom for all
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
