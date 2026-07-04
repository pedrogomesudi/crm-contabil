-- Sincroniza honorario_mensal = soma dos contratos ATIVOS do cliente (NFS-e segue o contrato).
create or replace function sync_honorario_por_contrato() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
declare v_cliente uuid; v_soma numeric;
begin
  v_cliente := coalesce(new.cliente_id, old.cliente_id);
  select coalesce(sum(valor_mensal), 0) into v_soma from contrato
    where cliente_id = v_cliente and status = 'ATIVO';
  insert into clientes_financeiro (cliente_id, honorario_mensal)
    values (v_cliente, nullif(v_soma, 0))
    on conflict (cliente_id) do update set honorario_mensal = nullif(v_soma, 0);
  return null;
end $$;
drop trigger if exists trg_sync_honorario on contrato;
create trigger trg_sync_honorario after insert or update or delete on contrato
  for each row execute function sync_honorario_por_contrato();

-- Recalcula titulo.status a partir da soma das baixas (nunca mexe em CANCELADO).
create or replace function recalcular_status_titulo() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
declare v_titulo uuid; v_valor numeric; v_acresc numeric; v_baixado numeric; v_status titulo_status;
begin
  v_titulo := coalesce(new.titulo_id, old.titulo_id);
  select valor into v_valor from titulo where id = v_titulo;
  if v_valor is null then return null; end if;
  select coalesce(sum(valor_recebido),0), coalesce(sum(juros+multa),0)
    into v_baixado, v_acresc from baixa where titulo_id = v_titulo;
  if v_baixado <= 0 then v_status := 'ABERTO';
  elsif v_baixado >= (v_valor + v_acresc) then v_status := 'BAIXADO';
  else v_status := 'BAIXADO_PARCIAL';
  end if;
  update titulo set status = v_status, atualizado_em = now()
    where id = v_titulo and status <> 'CANCELADO';
  return null;
end $$;
drop trigger if exists trg_status_titulo on baixa;
create trigger trg_status_titulo after insert or delete on baixa
  for each row execute function recalcular_status_titulo();
