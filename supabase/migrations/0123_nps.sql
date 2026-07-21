-- RF-074 (Fatia A): coleta de NPS pelo portal do cliente.
create table if not exists nps_resposta (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  nota int not null check (nota between 0 and 10),
  comentario text,
  criada_em timestamptz not null default now()
);
create index if not exists ix_nps_cliente on nps_resposta(cliente_id, criada_em);

alter table nps_resposta enable row level security;

-- Cliente lê/insere só a própria; equipe operacional lê tudo; sem UPDATE/DELETE (imutável).
drop policy if exists nps_sel_cliente on nps_resposta;
create policy nps_sel_cliente on nps_resposta for select
  using (cliente_id = auth_cliente_id() or auth_papel() in ('admin', 'assistente', 'contador'));
drop policy if exists nps_ins_cliente on nps_resposta;
create policy nps_ins_cliente on nps_resposta for insert
  with check (cliente_id = auth_cliente_id());

-- Config no singleton escritorio_config.
alter table escritorio_config add column if not exists nps_ativo boolean not null default false;
alter table escritorio_config add column if not exists nps_periodicidade_dias int not null default 90;
alter table escritorio_config add column if not exists nps_pergunta text;
