-- Obrigações Fatia 3A: hierarquia de usuários (escalonamento) + config (toggle + limiares).
alter table usuarios add column if not exists superior_id uuid references usuarios(id);

create table if not exists obrigacao_config (
  id int primary key default 1,
  escalonamento_ativo boolean not null default false,
  dias_lider int not null default 7,
  dias_socio int not null default 15,
  atualizado_em timestamptz not null default now(),
  constraint obrigacao_config_singleton check (id = 1)
);
alter table obrigacao_config enable row level security;
drop policy if exists obrigacao_config_sel on obrigacao_config;
create policy obrigacao_config_sel on obrigacao_config for select using (true);
drop policy if exists obrigacao_config_upd on obrigacao_config;
create policy obrigacao_config_upd on obrigacao_config for update
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
insert into obrigacao_config (id) values (1) on conflict (id) do nothing;
