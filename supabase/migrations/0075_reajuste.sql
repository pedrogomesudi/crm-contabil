-- Reajuste anual em lote. O índice fica no honorário do cliente; o histórico em reajuste_item
-- (único por cliente+ano = trava anti-duplicidade). O reajuste só grava honorario_mensal — a vigência
-- de janeiro nasce pelo trigger da Fatia B.

alter table clientes_financeiro
  add column if not exists indice_reajuste indice_reajuste not null default 'SALARIO_MINIMO',
  add column if not exists percentual_reajuste numeric(6,3);  -- usado só quando indice = PERCENTUAL_FIXO

create table if not exists reajuste_item (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  ano_base int not null,
  indice indice_reajuste not null,
  percentual numeric(6,3) not null,
  valor_anterior numeric(15,2) not null,
  valor_novo numeric(15,2) not null,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id),
  unique (cliente_id, ano_base)
);
create index if not exists reajuste_item_cliente_idx on reajuste_item (cliente_id, ano_base desc);

alter table reajuste_item enable row level security;
drop policy if exists reajuste_item_rw on reajuste_item;
create policy reajuste_item_rw on reajuste_item for all to authenticated
  using (auth_papel() in ('admin','financeiro'))
  with check (auth_papel() in ('admin','financeiro'));

-- Desfazer um reajuste "como se nunca tivesse acontecido": volta o honorário, remove a vigência
-- daquele mês e apaga o registro. session_replication_role = replica desliga os triggers de usuário
-- SÓ nesta transação, para que voltar o honorário não recrie a vigência (trigger da Fatia B).
create or replace function desfazer_reajuste(p_item_id uuid) returns void
  language plpgsql security definer set search_path = pg_catalog, public as $$
declare r reajuste_item; v_mes date;
begin
  select * into r from reajuste_item where id = p_item_id;
  if not found then raise exception 'reajuste não encontrado'; end if;
  v_mes := date_trunc('month', r.criado_em)::date;

  set local session_replication_role = replica;   -- não dispara trg_honorario_vigencia
  update clientes_financeiro set honorario_mensal = r.valor_anterior where cliente_id = r.cliente_id;
  set local session_replication_role = origin;

  delete from honorario_vigencia where cliente_id = r.cliente_id and vigente_de = v_mes;
  delete from reajuste_item where id = p_item_id;
end $$;
revoke all on function desfazer_reajuste(uuid) from public;
grant execute on function desfazer_reajuste(uuid) to authenticated;
