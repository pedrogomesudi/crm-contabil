-- Identidade/marca do escritório — a semente do whitelabel. Singleton hoje (id=1); quando a V9 chegar,
-- id vira tenant_id e a RLS ganha o filtro por tenant. Separada do nfse_config (marca != config fiscal).
create table if not exists escritorio_config (
  id smallint primary key default 1 check (id = 1),
  nome text,
  cnpj text,
  email text,
  telefone text,
  endereco jsonb,
  logo_path text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);

-- Semeia a linha vazia para o update da action sempre encontrar.
insert into escritorio_config (id) values (1) on conflict (id) do nothing;

alter table escritorio_config enable row level security;

-- Leitura: qualquer autenticado (a proposta usa a marca). Escrita: só admin.
drop policy if exists escritorio_config_sel on escritorio_config;
create policy escritorio_config_sel on escritorio_config for select to authenticated using (true);
drop policy if exists escritorio_config_ins on escritorio_config;
create policy escritorio_config_ins on escritorio_config for insert to authenticated
  with check (auth_papel() = 'admin');
drop policy if exists escritorio_config_upd on escritorio_config;
create policy escritorio_config_upd on escritorio_config for update to authenticated
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');

-- Autoria não-forjável.
create or replace function escritorio_config_integridade() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  new.atualizado_por := auth.uid();
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists trg_escritorio_config_integridade on escritorio_config;
create trigger trg_escritorio_config_integridade before insert or update on escritorio_config
  for each row execute function escritorio_config_integridade();
