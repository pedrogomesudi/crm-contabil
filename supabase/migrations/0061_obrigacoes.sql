-- Obrigações e Compliance — Fatia 1: matriz + instâncias por competência.
do $$ begin create type obrigacao_esfera as enum ('federal','estadual','municipal','trabalhista'); exception when duplicate_object then null; end $$;
do $$ begin create type obrigacao_periodicidade as enum ('mensal','trimestral','anual'); exception when duplicate_object then null; end $$;
do $$ begin create type obrigacao_instancia_status as enum ('pendente','dispensada'); exception when duplicate_object then null; end $$;

create table if not exists obrigacao (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  descricao text,
  esfera obrigacao_esfera not null,
  periodicidade obrigacao_periodicidade not null,
  aplicavel_a text[] not null default '{}',
  condicao_flags text[] not null default '{}',
  condicao_modo text not null default 'any',
  ufs text[] not null default '{}',
  cnae_prefixos text[] not null default '{}',
  venc_dia int not null,
  venc_mes_offset int not null default 1,
  venc_mes int,
  venc_ano_offset int not null default 1,
  prazo_interno_dias_uteis int not null default 0,
  antecipa boolean not null default true,
  ativa boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  constraint chk_condicao_modo check (condicao_modo in ('any','all'))
);

create table if not exists obrigacao_instancia (
  id uuid primary key default gen_random_uuid(),
  obrigacao_id uuid not null references obrigacao(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  competencia date not null,
  vencimento_legal date not null,
  vencimento_interno date not null,
  status obrigacao_instancia_status not null default 'pendente',
  responsavel_id uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  constraint uq_obrigacao_instancia unique (obrigacao_id, cliente_id, competencia)
);
create index if not exists idx_obrigacao_instancia_cliente on obrigacao_instancia (cliente_id);
create index if not exists idx_obrigacao_instancia_venc on obrigacao_instancia (vencimento_legal);

alter table obrigacao enable row level security;
alter table obrigacao_instancia enable row level security;

drop policy if exists obrigacao_sel on obrigacao;
create policy obrigacao_sel on obrigacao for select using (true);
drop policy if exists obrigacao_ins on obrigacao;
create policy obrigacao_ins on obrigacao for insert with check (auth_papel() = 'admin');
drop policy if exists obrigacao_upd on obrigacao;
create policy obrigacao_upd on obrigacao for update using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
drop policy if exists obrigacao_del on obrigacao;
create policy obrigacao_del on obrigacao for delete using (auth_papel() = 'admin');

drop policy if exists obrigacao_inst_sel on obrigacao_instancia;
create policy obrigacao_inst_sel on obrigacao_instancia for select
  using (exists (select 1 from clientes c where c.id = cliente_id));
drop policy if exists obrigacao_inst_ins on obrigacao_instancia;
create policy obrigacao_inst_ins on obrigacao_instancia for insert
  with check (exists (select 1 from clientes c where c.id = cliente_id));
drop policy if exists obrigacao_inst_upd on obrigacao_instancia;
create policy obrigacao_inst_upd on obrigacao_instancia for update
  using (exists (select 1 from clientes c where c.id = cliente_id))
  with check (exists (select 1 from clientes c where c.id = cliente_id));
