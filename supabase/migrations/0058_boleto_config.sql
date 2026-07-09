-- Boletos Fatia 1: configuração do provedor (credenciais cifradas).
do $$ begin create type boleto_provedor as enum ('nenhum','inter','asaas'); exception when duplicate_object then null; end $$;
do $$ begin create type boleto_ambiente as enum ('sandbox','producao'); exception when duplicate_object then null; end $$;

create table if not exists boleto_config (
  id int primary key default 1,
  provedor boleto_provedor not null default 'nenhum',
  asaas_api_key_cifrada text,
  asaas_ambiente boleto_ambiente not null default 'producao',
  inter_client_id_cifrado text,
  inter_client_secret_cifrado text,
  inter_conta_corrente text,
  inter_cert_cifrado text,
  inter_key_cifrado text,
  atualizado_em timestamptz not null default now(),
  constraint boleto_config_singleton check (id = 1)
);
alter table boleto_config enable row level security;
drop policy if exists boleto_config_rw on boleto_config;
create policy boleto_config_rw on boleto_config for all
  using (auth_papel() in ('admin','financeiro')) with check (auth_papel() in ('admin','financeiro'));
insert into boleto_config (id) values (1) on conflict (id) do nothing;
