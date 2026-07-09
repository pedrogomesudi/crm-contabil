-- Config do onboarding: liga/desliga os alertas de prazo in-app.
create table if not exists onboarding_config (
  id int primary key default 1,
  alertas_ativos boolean not null default true,
  atualizado_em timestamptz not null default now(),
  constraint onboarding_config_singleton check (id = 1)
);
alter table onboarding_config enable row level security;
drop policy if exists onboarding_config_sel on onboarding_config;
create policy onboarding_config_sel on onboarding_config for select using (true);
drop policy if exists onboarding_config_upd on onboarding_config;
create policy onboarding_config_upd on onboarding_config for update
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
insert into onboarding_config (id) values (1) on conflict (id) do nothing;
