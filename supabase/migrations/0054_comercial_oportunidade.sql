-- Módulo comercial (Fatia A): funil de oportunidades (pré-cliente).
do $$ begin
  create type oportunidade_etapa as enum ('novo','contato','proposta','negociacao','ganho','perdido');
exception when duplicate_object then null; end $$;

create table if not exists oportunidade (
  id uuid primary key default gen_random_uuid(),
  prospect_nome text not null,
  contato_nome text,
  contato_telefone text,
  contato_email text,
  origem text,
  servico_interesse text,
  valor_estimado numeric(12,2),
  responsavel_id uuid references usuarios(id),
  etapa oportunidade_etapa not null default 'novo',
  observacoes text,
  motivo_perda text,
  cliente_id uuid references clientes(id),
  criado_por uuid references usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table oportunidade enable row level security;
drop policy if exists oportunidade_rw on oportunidade;
create policy oportunidade_rw on oportunidade for all
  using (auth_papel() in ('admin','assistente','contador'))
  with check (auth_papel() in ('admin','assistente','contador'));
