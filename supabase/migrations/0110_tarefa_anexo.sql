-- RF-040: anexos de tarefa (tabela própria, separada do GED do cliente).
create table if not exists tarefa_anexo (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references tarefa(id) on delete cascade,
  nome text not null,
  caminho_storage text not null unique,
  enviado_por uuid references usuarios(id),
  enviado_em timestamptz not null default now()
);
create index if not exists idx_tarefa_anexo_tarefa on tarefa_anexo(tarefa_id);
alter table tarefa_anexo enable row level security;

drop policy if exists tarefa_anexo_sel on tarefa_anexo;
create policy tarefa_anexo_sel on tarefa_anexo for select to authenticated
  using (exists (select 1 from tarefa t where t.id = tarefa_id));
drop policy if exists tarefa_anexo_ins on tarefa_anexo;
create policy tarefa_anexo_ins on tarefa_anexo for insert to authenticated
  with check (exists (
    select 1 from tarefa t where t.id = tarefa_id
    and (auth_papel() in ('admin','assistente') or t.responsavel_id = auth.uid() or t.criado_por = auth.uid())
  ));
drop policy if exists tarefa_anexo_del on tarefa_anexo;
create policy tarefa_anexo_del on tarefa_anexo for delete to authenticated
  using (exists (
    select 1 from tarefa t where t.id = tarefa_id
    and (auth_papel() in ('admin','assistente') or t.responsavel_id = auth.uid() or t.criado_por = auth.uid())
  ));
