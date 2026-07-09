-- Comercial: propostas formais de honorários (por oportunidade).
do $$ begin create type proposta_status as enum ('rascunho','enviada','aceita','recusada'); exception when duplicate_object then null; end $$;
do $$ begin create type proposta_recorrencia as enum ('mensal','unico'); exception when duplicate_object then null; end $$;
create sequence if not exists proposta_numero_seq;

create table if not exists proposta (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references oportunidade(id) on delete cascade,
  numero bigint not null default nextval('proposta_numero_seq'),
  validade date,
  observacoes text,
  status proposta_status not null default 'rascunho',
  criado_por uuid references usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create table if not exists proposta_item (
  id uuid primary key default gen_random_uuid(),
  proposta_id uuid not null references proposta(id) on delete cascade,
  descricao text not null,
  valor numeric(12,2) not null default 0,
  recorrencia proposta_recorrencia not null default 'mensal',
  ordem int not null default 0
);
alter table proposta enable row level security;
alter table proposta_item enable row level security;
drop policy if exists proposta_rw on proposta;
create policy proposta_rw on proposta for all
  using (auth_papel() in ('admin','assistente','contador')) with check (auth_papel() in ('admin','assistente','contador'));
drop policy if exists proposta_item_rw on proposta_item;
create policy proposta_item_rw on proposta_item for all
  using (auth_papel() in ('admin','assistente','contador')) with check (auth_papel() in ('admin','assistente','contador'));
