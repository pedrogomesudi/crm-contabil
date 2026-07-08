create table if not exists orcamento (
  id             uuid primary key default gen_random_uuid(),
  categoria_id   uuid not null references categoria(id) on delete cascade,
  ano            int not null,
  mes            smallint not null check (mes between 1 and 12),
  valor          numeric(14,2) not null default 0,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references usuarios(id),
  unique (categoria_id, ano, mes)
);
create index if not exists idx_orcamento_ano on orcamento(ano);
alter table orcamento enable row level security;
do $$ begin
  drop policy if exists orcamento_all on orcamento;
  create policy orcamento_all on orcamento for all to authenticated
    using (auth_papel() in ('admin','financeiro'))
    with check (auth_papel() in ('admin','financeiro'));
end $$;
