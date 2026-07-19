-- RF-060 (Fatia A): taxonomia do GED — catálogo de tipos + eixos departamento/competência.
create table if not exists tipo_documento (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  departamento departamento,        -- sugerido; nullable
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table documentos add column if not exists tipo_id uuid references tipo_documento(id);
alter table documentos add column if not exists departamento departamento;
alter table documentos add column if not exists competencia date;

alter table tipo_documento enable row level security;
drop policy if exists tipo_documento_read  on tipo_documento;
drop policy if exists tipo_documento_write on tipo_documento;
create policy tipo_documento_read  on tipo_documento for select
  using (auth_papel() in ('admin','assistente','contador','financeiro'));
create policy tipo_documento_write on tipo_documento for all
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
