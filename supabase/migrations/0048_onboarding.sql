do $$ begin create type onboarding_categoria as enum ('documento','procuracao','certificado','acesso','responsavel'); exception when duplicate_object then null; end $$;
do $$ begin create type onboarding_status as enum ('pendente','concluido','dispensado'); exception when duplicate_object then null; end $$;

create table if not exists onboarding_item_modelo (
  id uuid primary key default gen_random_uuid(),
  categoria onboarding_categoria not null,
  nome text not null,
  obrigatorio boolean not null default true,
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists onboarding_item (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  categoria onboarding_categoria not null,
  nome text not null,
  obrigatorio boolean not null default true,
  ordem int not null default 0,
  status onboarding_status not null default 'pendente',
  responsavel_id uuid references usuarios(id),
  prazo date,
  observacao text,
  anexo_path text,
  acesso_url text,
  acesso_login text,
  acesso_senha_cifrada text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
create index if not exists idx_onboarding_item_cliente on onboarding_item(cliente_id);

create table if not exists onboarding_log_credencial (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references onboarding_item(id) on delete cascade,
  usuario_id uuid references usuarios(id),
  em timestamptz not null default now()
);

alter table onboarding_item_modelo enable row level security;
alter table onboarding_item enable row level security;
alter table onboarding_log_credencial enable row level security;

do $$ begin
  drop policy if exists onboarding_modelo_sel on onboarding_item_modelo;
  create policy onboarding_modelo_sel on onboarding_item_modelo for select to authenticated using (auth_papel() in ('admin','contador','assistente'));
  drop policy if exists onboarding_modelo_wr on onboarding_item_modelo;
  create policy onboarding_modelo_wr on onboarding_item_modelo for all to authenticated using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
  drop policy if exists onboarding_item_all on onboarding_item;
  create policy onboarding_item_all on onboarding_item for all to authenticated using (auth_papel() in ('admin','contador','assistente')) with check (auth_papel() in ('admin','contador','assistente'));
  drop policy if exists onboarding_log_ins on onboarding_log_credencial;
  create policy onboarding_log_ins on onboarding_log_credencial for insert to authenticated with check (auth_papel() in ('admin','contador'));
  drop policy if exists onboarding_log_sel on onboarding_log_credencial;
  create policy onboarding_log_sel on onboarding_log_credencial for select to authenticated using (auth_papel() = 'admin');
end $$;
