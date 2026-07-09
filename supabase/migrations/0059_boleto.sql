-- Boletos Fatia 4a: registro do boleto emitido + conta de recebimento.
do $$ begin create type boleto_status as enum ('emitido','pago','cancelado','erro'); exception when duplicate_object then null; end $$;
create sequence if not exists boleto_numero_seq;

create table if not exists boleto (
  id uuid primary key default gen_random_uuid(),
  titulo_id uuid not null references titulo(id) on delete cascade,
  numero bigint not null default nextval('boleto_numero_seq'),
  provedor text not null,
  provedor_boleto_id text,
  nosso_numero text,
  linha_digitavel text,
  pix_copia_cola text,
  url_pdf text,
  valor numeric(15,2) not null,
  vencimento date not null,
  status boleto_status not null default 'emitido',
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id) default auth.uid(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_boleto_titulo on boleto(titulo_id);
create index if not exists idx_boleto_provedor_id on boleto(provedor_boleto_id);
alter table boleto enable row level security;
drop policy if exists boleto_rw on boleto;
create policy boleto_rw on boleto for all
  using (auth_papel() in ('admin','financeiro')) with check (auth_papel() in ('admin','financeiro'));

alter table boleto_config add column if not exists conta_bancaria_id uuid references conta_bancaria(id);

create or replace function proximo_numero_boleto() returns bigint language sql security definer as $$ select nextval('boleto_numero_seq'); $$;
grant execute on function proximo_numero_boleto() to authenticated;
