-- descarta o MVP plano (só dados de teste)
drop table if exists onboarding_log_credencial cascade;
drop table if exists onboarding_item cascade;
drop table if exists onboarding_item_modelo cascade;

do $$ begin create type onboarding_perfil as enum ('mei','simples_sem_func','simples_com_func','presumido_real','pf'); exception when duplicate_object then null; end $$;
do $$ begin create type onboarding_item_tipo as enum ('padrao','acesso'); exception when duplicate_object then null; end $$;
do $$ begin create type onboarding_condicao_modo as enum ('any','all'); exception when duplicate_object then null; end $$;
do $$ begin create type onboarding_processo_status as enum ('em_andamento','concluido'); exception when duplicate_object then null; end $$;

create table if not exists onboarding_template (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  descricao text,
  data_referencia text not null default 'data_inicio_processo',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists onboarding_bloco (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references onboarding_template(id) on delete cascade,
  ordem int not null,
  slug text not null,
  nome text not null,
  prazo_bloco_dias int
);

create table if not exists onboarding_template_item (
  id uuid primary key default gen_random_uuid(),
  bloco_id uuid not null references onboarding_bloco(id) on delete cascade,
  codigo text not null,
  titulo text not null,
  descricao text,
  tipo onboarding_item_tipo not null default 'padrao',
  responsavel_papel papel,
  prazo_dias int,
  aplicavel_a text[] not null default '{*}',
  condicao_flags text[] not null default '{}',
  condicao_modo onboarding_condicao_modo not null default 'all',
  bloqueante boolean not null default false,
  anexo_obrigatorio boolean not null default false,
  alerta_risco text,
  ordem int not null default 0
);

create table if not exists onboarding_processo (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  template_id uuid not null references onboarding_template(id),
  data_inicio date not null,
  perfil onboarding_perfil not null,
  flags jsonb not null default '{}',
  status onboarding_processo_status not null default 'em_andamento',
  criado_por uuid references usuarios(id),
  criado_em timestamptz not null default now()
);
create index if not exists idx_onb_processo_cliente on onboarding_processo(cliente_id);

create table if not exists onboarding_processo_item (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references onboarding_processo(id) on delete cascade,
  bloco_ordem int not null,
  bloco_nome text not null,
  codigo text,
  titulo text not null,
  descricao text,
  tipo onboarding_item_tipo not null default 'padrao',
  responsavel_papel papel,
  responsavel_id uuid references usuarios(id),
  prazo date,
  status onboarding_status not null default 'pendente',
  observacao text,
  bloqueante boolean not null default false,
  anexo_obrigatorio boolean not null default false,
  alerta_risco text,
  ordem int not null default 0,
  acesso_url text,
  acesso_login text,
  acesso_senha_cifrada text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
create index if not exists idx_onb_processo_item_proc on onboarding_processo_item(processo_id);

create table if not exists onboarding_log_credencial (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references onboarding_processo_item(id) on delete cascade,
  usuario_id uuid references usuarios(id),
  em timestamptz not null default now()
);

alter table onboarding_template enable row level security;
alter table onboarding_bloco enable row level security;
alter table onboarding_template_item enable row level security;
alter table onboarding_processo enable row level security;
alter table onboarding_processo_item enable row level security;
alter table onboarding_log_credencial enable row level security;

do $$ begin
  drop policy if exists onb_template_sel on onboarding_template;
  create policy onb_template_sel on onboarding_template for select to authenticated using (auth_papel() in ('admin','contador','assistente'));
  drop policy if exists onb_template_wr on onboarding_template;
  create policy onb_template_wr on onboarding_template for all to authenticated using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
  drop policy if exists onb_bloco_sel on onboarding_bloco;
  create policy onb_bloco_sel on onboarding_bloco for select to authenticated using (auth_papel() in ('admin','contador','assistente'));
  drop policy if exists onb_bloco_wr on onboarding_bloco;
  create policy onb_bloco_wr on onboarding_bloco for all to authenticated using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
  drop policy if exists onb_titem_sel on onboarding_template_item;
  create policy onb_titem_sel on onboarding_template_item for select to authenticated using (auth_papel() in ('admin','contador','assistente'));
  drop policy if exists onb_titem_wr on onboarding_template_item;
  create policy onb_titem_wr on onboarding_template_item for all to authenticated using (auth_papel() = 'admin') with check (auth_papel() = 'admin');

  drop policy if exists onb_proc_all on onboarding_processo;
  create policy onb_proc_all on onboarding_processo for all to authenticated
    using (auth_papel() in ('admin','contador','assistente') and exists (select 1 from clientes c where c.id = cliente_id))
    with check (auth_papel() in ('admin','contador','assistente') and exists (select 1 from clientes c where c.id = cliente_id));

  drop policy if exists onb_procitem_all on onboarding_processo_item;
  create policy onb_procitem_all on onboarding_processo_item for all to authenticated
    using (auth_papel() in ('admin','contador','assistente') and exists (select 1 from onboarding_processo pr join clientes c on c.id = pr.cliente_id where pr.id = processo_id))
    with check (auth_papel() in ('admin','contador','assistente') and exists (select 1 from onboarding_processo pr join clientes c on c.id = pr.cliente_id where pr.id = processo_id));

  drop policy if exists onb_log_ins on onboarding_log_credencial;
  create policy onb_log_ins on onboarding_log_credencial for insert to authenticated
    with check (auth_papel() in ('admin','contador') and usuario_id = auth.uid()
      and exists (select 1 from onboarding_processo_item pi join onboarding_processo pr on pr.id = pi.processo_id join clientes c on c.id = pr.cliente_id where pi.id = item_id));
  drop policy if exists onb_log_sel on onboarding_log_credencial;
  create policy onb_log_sel on onboarding_log_credencial for select to authenticated using (auth_papel() = 'admin');
end $$;
