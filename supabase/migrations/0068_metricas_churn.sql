-- Métricas/churn: fotografa o MRR na saída e captura a data de saída ao inativar.
alter table clientes_financeiro add column if not exists honorario_saida numeric(12, 2);

create or replace function capturar_saida_cliente() returns trigger
  language plpgsql security definer set search_path = public as $$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if new.status = 'inativo' and old.status is distinct from 'inativo' then
    update clientes_financeiro
      set data_saida = coalesce(data_saida, hoje),
          honorario_saida = coalesce(honorario_saida, honorario_mensal)
      where cliente_id = new.id;
  elsif new.status = 'ativo' and old.status = 'inativo' then
    update clientes_financeiro
      set data_saida = null, honorario_saida = null
      where cliente_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_capturar_saida on clientes;
create trigger trg_capturar_saida after update of status on clientes
  for each row execute function capturar_saida_cliente();
