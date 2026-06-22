create table documentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  nome text not null,
  tipo text,
  caminho_storage text not null unique,
  enviado_por uuid references usuarios(id),
  enviado_em timestamptz not null default now()
);
alter table documentos enable row level security;

-- Mesma visibilidade do cliente correspondente (RLS de clientes já filtra o EXISTS)
create policy doc_select on documentos for select to authenticated using (
  exists (select 1 from clientes c where c.id = cliente_id)
);
create policy doc_insert on documentos for insert to authenticated with check (
  -- financeiro só VÊ documentos (spec §4.2); admin/contador/assistente gerenciam
  auth_papel() in ('admin', 'contador', 'assistente')
  and exists (select 1 from clientes c where c.id = cliente_id)
);
create policy doc_delete on documentos for delete to authenticated using (
  auth_papel() = 'admin'
);

create table log_acesso_documento (
  id uuid primary key default gen_random_uuid(),
  -- log sobrevive à eliminação do documento (auditoria LGPD)
  documento_id uuid references documentos(id) on delete set null,
  usuario_id uuid references usuarios(id),
  acessado_em timestamptz not null default now()
);
alter table log_acesso_documento enable row level security;
-- Apenas admin lê o log pela aplicação (gravação é server-side via service_role)
create policy log_select on log_acesso_documento for select to authenticated using (
  auth_papel() = 'admin'
);
