-- Conciliação bancária Fatia A: movimentações importadas do extrato (OFX/CSV), com dedup.
create table if not exists movimento_bancario (
  id uuid primary key default gen_random_uuid(),
  conta_bancaria_id uuid not null references conta_bancaria(id) on delete cascade,
  data date not null,
  valor numeric(15,2) not null,
  descricao text,
  fitid text,
  dedup_hash text not null,
  status text not null default 'pendente',
  baixa_id uuid references baixa(id) on delete set null,
  importado_em timestamptz not null default now(),
  importado_por uuid references usuarios(id),
  constraint uq_movimento_dedup unique (conta_bancaria_id, dedup_hash),
  constraint chk_movimento_status check (status in ('pendente','conciliada','ignorada'))
);
create index if not exists idx_movimento_conta_data on movimento_bancario (conta_bancaria_id, data);

alter table movimento_bancario enable row level security;
drop policy if exists movimento_sel on movimento_bancario;
create policy movimento_sel on movimento_bancario for select using (auth_papel() in ('admin','financeiro'));
drop policy if exists movimento_ins on movimento_bancario;
create policy movimento_ins on movimento_bancario for insert with check (auth_papel() in ('admin','financeiro'));
drop policy if exists movimento_upd on movimento_bancario;
create policy movimento_upd on movimento_bancario for update using (auth_papel() in ('admin','financeiro')) with check (auth_papel() in ('admin','financeiro'));
