-- RF-040 (fatia B): tarefas recorrentes. O cron diário gera as ocorrências.
do $$ begin create type tarefa_periodicidade as enum ('semanal','mensal','trimestral','anual');
exception when duplicate_object then null; end $$;

create table if not exists tarefa_recorrencia (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  responsavel_id uuid references usuarios(id),
  cliente_id uuid references clientes(id) on delete cascade,
  departamento departamento,
  prioridade tarefa_prioridade not null default 'media',
  periodicidade tarefa_periodicidade not null,
  dia_semana int check (dia_semana between 0 and 6),
  dia_mes int check (dia_mes between 1 and 31),
  mes int check (mes between 1 and 12),
  antecedencia_dias int not null default 3 check (antecedencia_dias between 0 and 60),
  proxima_data date not null,
  ativa boolean not null default true,
  criado_por uuid references usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists tarefa_recorrencia_item (
  id uuid primary key default gen_random_uuid(),
  recorrencia_id uuid not null references tarefa_recorrencia(id) on delete cascade,
  descricao text not null,
  ordem int not null default 0
);

alter table tarefa add column if not exists recorrencia_id uuid references tarefa_recorrencia(id) on delete set null;
alter table tarefa add column if not exists competencia date;

-- Idempotência: o cron pode rodar duas vezes (ou ser reexecutado após falhar no meio).
-- A mesma ocorrência não nasce duas vezes — a garantia é do banco, não do código.
create unique index if not exists uq_tarefa_recorrencia_competencia
  on tarefa(recorrencia_id, competencia) where recorrencia_id is not null;

alter table tarefa_recorrencia enable row level security;
alter table tarefa_recorrencia_item enable row level security;

do $$ begin
  drop policy if exists tarefa_rec_sel on tarefa_recorrencia;
  create policy tarefa_rec_sel on tarefa_recorrencia for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists tarefa_rec_write on tarefa_recorrencia;
  create policy tarefa_rec_write on tarefa_recorrencia for all to authenticated
    using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));

  drop policy if exists tarefa_rec_item_sel on tarefa_recorrencia_item;
  create policy tarefa_rec_item_sel on tarefa_recorrencia_item for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists tarefa_rec_item_write on tarefa_recorrencia_item;
  create policy tarefa_rec_item_write on tarefa_recorrencia_item for all to authenticated
    using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));
end $$;
