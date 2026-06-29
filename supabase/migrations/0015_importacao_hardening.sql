-- Hardening da V2 (achados do security review da 0014). Idempotente.

-- 1) [HIGH] Staging financeiro separado: os valores de contrato/honorário NÃO
--    podem ficar em importacao_itens (legível por assistente). Vão para uma
--    tabela própria com a MESMA RLS de contratos_dominio (admin/financeiro).
create table if not exists importacao_contratos (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid not null references importacoes(id) on delete cascade,
  cpf_cnpj text,              -- casa com o cliente na aplicação
  payload jsonb not null      -- lista de ContratoDominio (valores)
);
alter table importacao_contratos enable row level security;

drop policy if exists imp_contr_all on importacao_contratos;
create policy imp_contr_all on importacao_contratos for all to authenticated
  using (auth_papel() in ('admin', 'financeiro'))
  with check (auth_papel() in ('admin', 'financeiro'));

-- 2) [MED] Autoria não-forjável em importacoes (espelha clientes_financeiro_integridade).
create or replace function importacoes_integridade() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  if auth.uid() is not null then
    new.executado_por := auth.uid();
  end if;
  if tg_op = 'INSERT' then
    new.executado_em := now();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_importacoes_integridade on importacoes;
create trigger trg_importacoes_integridade
  before insert or update on importacoes
  for each row execute function importacoes_integridade();

-- 3) [MED] Endurece a função de limpeza: gate de papel + search_path fixo.
create or replace function limpar_previas_expiradas() returns void
  language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if auth_papel() not in ('admin', 'assistente') then
    raise exception 'forbidden';
  end if;
  delete from importacoes where status = 'previa' and expira_em is not null and expira_em < now();
end;
$$;
revoke all on function limpar_previas_expiradas() from public;
grant execute on function limpar_previas_expiradas() to authenticated;
