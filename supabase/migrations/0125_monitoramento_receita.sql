-- RF-084 (Fatia A): situação cadastral + opção Simples, e alertas de mudança.
alter table clientes add column if not exists situacao_cadastral text;
alter table clientes add column if not exists optante_simples boolean;
alter table clientes add column if not exists situacao_verificada_em timestamptz;

create table if not exists receita_alerta (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  tipo text not null check (tipo in ('situacao', 'simples')),
  de text,
  para text,
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por uuid references usuarios(id)
);
create index if not exists ix_receita_alerta_aberto on receita_alerta(cliente_id) where resolvido_em is null;

alter table receita_alerta enable row level security;
drop policy if exists receita_alerta_sel on receita_alerta;
create policy receita_alerta_sel on receita_alerta for select
  using (auth_papel() in ('admin', 'assistente', 'contador', 'financeiro'));

create table if not exists receita_config (
  id smallint primary key default 1 check (id = 1),
  ativo boolean not null default false,
  frequencia_dias int not null default 7,
  badge_ativo boolean not null default true
);
insert into receita_config (id) values (1) on conflict do nothing;
alter table receita_config enable row level security;
drop policy if exists receita_config_sel on receita_config;
create policy receita_config_sel on receita_config for select to authenticated using (true);
drop policy if exists receita_config_wr on receita_config;
create policy receita_config_wr on receita_config for all
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
