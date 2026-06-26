-- Auditoria das importações do Domínio + staging da prévia. Idempotente.
create table if not exists importacoes (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'previa', -- previa | aplicada | falha
  arquivos jsonb,                        -- nomes dos arquivos enviados
  executado_por uuid references usuarios(id),
  executado_em timestamptz not null default now(),
  novos int not null default 0,
  atualizados int not null default 0,
  inalterados int not null default 0,
  pendencias int not null default 0,
  erros int not null default 0,
  expira_em timestamptz                   -- prévias expiram; aplicadas têm null
);

create table if not exists importacao_itens (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid not null references importacoes(id) on delete cascade,
  classe text not null,                   -- novo|atualizado|inalterado|pendencia|erro
  cpf_cnpj text,
  payload jsonb not null                  -- ClienteNormalizado + diff + contratos
);

alter table importacoes enable row level security;
alter table importacao_itens enable row level security;

-- Cadastral: admin/assistente gerenciam importação.
drop policy if exists imp_all on importacoes;
create policy imp_all on importacoes for all to authenticated
  using (auth_papel() in ('admin', 'assistente'))
  with check (auth_papel() in ('admin', 'assistente'));

drop policy if exists imp_itens_all on importacao_itens;
create policy imp_itens_all on importacao_itens for all to authenticated
  using (auth_papel() in ('admin', 'assistente'))
  with check (auth_papel() in ('admin', 'assistente'));

-- Limpeza de prévias expiradas (chamada pela action antes de criar nova prévia).
create or replace function limpar_previas_expiradas() returns void
  language sql security definer set search_path = public as $$
  delete from importacoes where status = 'previa' and expira_em is not null and expira_em < now();
$$;
revoke all on function limpar_previas_expiradas() from public;
grant execute on function limpar_previas_expiradas() to authenticated;
