-- V6.3 — RPCs do lado despesa + dashboard/aging atualizados.

-- Gera títulos PAGAR das despesas recorrentes ativas (idempotente).
create or replace function gerar_despesas_recorrentes(p_competencia date) returns jsonb
  language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_comp date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_g int := 0; v_p int := 0; r record; v_venc date; v_ins int;
begin
  for r in select * from despesa_recorrente where ativa and data_inicio <= v_fim loop
    v_venc := (v_comp + (r.dia_vencimento - 1))::date;
    insert into titulo (tipo, fornecedor_id, origem, descricao, valor, competencia, vencimento,
                        categoria_id, centro_custo_id, grupo_parcelamento_id)
      values ('PAGAR', r.fornecedor_id, 'DESPESA_RECORRENTE', r.descricao, r.valor_mensal, v_comp, v_venc,
              r.categoria_id, r.centro_custo_id, r.id)
      on conflict do nothing;
    get diagnostics v_ins = row_count;
    if v_ins > 0 then v_g := v_g + 1; else v_p := v_p + 1; end if;
  end loop;
  return jsonb_build_object('gerados', v_g, 'pulados', v_p);
end $$;
revoke all on function gerar_despesas_recorrentes(date) from public;
grant execute on function gerar_despesas_recorrentes(date) to authenticated;

-- Automação mensal agora gera receber E pagar quando o flag está ligado.
create or replace function gerar_mensalidades_automatico() returns void
  language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if (select geracao_automatica from financeiro_config where id = 1) then
    perform gerar_mensalidades(date_trunc('month', now())::date);
    perform gerar_despesas_recorrentes(date_trunc('month', now())::date);
  end if;
end $$;

-- Aging por tipo (RECEBER default).
create or replace function financeiro_aging(p_tipo titulo_tipo default 'RECEBER') returns jsonb
  language sql stable security invoker set search_path = public as $$
  with ts as (
    select t.vencimento,
      (t.valor - coalesce((select sum(valor_recebido) from baixa where titulo_id = t.id and estornada = false), 0)) as saldo
    from titulo t where t.status <> 'CANCELADO' and t.tipo = p_tipo
  ),
  fx as (
    select case when vencimento >= current_date then 'a_vencer'
        when current_date - vencimento <= 30 then 'd1_30'
        when current_date - vencimento <= 60 then 'd31_60'
        when current_date - vencimento <= 90 then 'd61_90'
        else 'd90_mais' end as faixa, saldo
    from ts where saldo > 0
  )
  select coalesce(jsonb_object_agg(faixa, jsonb_build_object('total', total, 'qtd', qtd)), '{}'::jsonb)
  from (select faixa, sum(saldo) as total, count(*) as qtd from fx group by faixa) g;
$$;
revoke all on function financeiro_aging(titulo_tipo) from public;
grant execute on function financeiro_aging(titulo_tipo) to authenticated;

-- Dashboard: agora com o lado despesa e saldo real.
create or replace function financeiro_dashboard(p_competencia date) returns jsonb
  language sql stable security invoker set search_path = public as $$
  with
  comp as (select date_trunc('month', p_competencia)::date as ini,
                  (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date as fim),
  ts as (
    select t.id, t.tipo, t.vencimento, t.competencia, t.origem, t.valor,
      (t.valor - coalesce((select sum(valor_recebido) from baixa where titulo_id = t.id and estornada = false), 0)) as saldo
    from titulo t where t.status <> 'CANCELADO'
  ),
  mov as (
    select b.valor_recebido, b.data_recebimento, t.tipo
    from baixa b join titulo t on t.id = b.titulo_id where b.estornada = false
  ),
  recebimentos as (select coalesce(sum(valor_recebido),0) v from mov where tipo='RECEBER'),
  pagamentos as (select coalesce(sum(valor_recebido),0) v from mov where tipo='PAGAR'),
  saldo as (select coalesce((select sum(saldo_inicial) from conta_bancaria where ativa),0)
                 + (select v from recebimentos) - (select v from pagamentos) as v),
  mrr as (
    select coalesce((select sum(valor_mensal) from contrato where status='ATIVO'),0)
         + coalesce((select sum(f.honorario_mensal) from clientes_financeiro f join clientes c on c.id=f.cliente_id
             where c.excluido_em is null and c.status='ativo' and coalesce(f.honorario_mensal,0)>0
               and not exists (select 1 from contrato ct where ct.cliente_id=c.id and ct.status='ATIVO')),0) as v
  ),
  receb_mes as (select coalesce(sum(valor_recebido),0) v from mov, comp where tipo='RECEBER' and data_recebimento between comp.ini and comp.fim),
  saidas_mes as (select coalesce(sum(valor_recebido),0) v from mov, comp where tipo='PAGAR' and data_recebimento between comp.ini and comp.fim),
  a_receber as (select coalesce(sum(saldo),0) v from ts, comp where tipo='RECEBER' and competencia between comp.ini and comp.fim and saldo>0),
  a_pagar as (select coalesce(sum(saldo),0) v from ts, comp where tipo='PAGAR' and competencia between comp.ini and comp.fim and saldo>0),
  inad as (select coalesce(sum(saldo) filter (where tipo='RECEBER' and vencimento<current_date and saldo>0),0) vencido,
                  coalesce(sum(saldo) filter (where tipo='RECEBER' and saldo>0),0) carteira from ts),
  prev as (select
      coalesce(sum(saldo) filter (where tipo='RECEBER' and vencimento between current_date and current_date+30 and saldo>0),0) p30,
      coalesce(sum(saldo) filter (where tipo='RECEBER' and vencimento between current_date and current_date+60 and saldo>0),0) p60,
      coalesce(sum(saldo) filter (where tipo='RECEBER' and vencimento between current_date and current_date+90 and saldo>0),0) p90 from ts),
  tipo as (select coalesce(jsonb_object_agg(origem, total),'{}'::jsonb) por_tipo
           from (select ts.origem, sum(ts.valor) total from ts, comp
                 where ts.tipo='RECEBER' and ts.competencia between comp.ini and comp.fim group by ts.origem) g),
  rd as (select coalesce(sum(valor) filter (where tipo='RECEBER'),0) receita,
                coalesce(sum(valor) filter (where tipo='PAGAR'),0) despesa
         from ts, comp where competencia between comp.ini and comp.fim)
  select jsonb_build_object(
    'saldo', (select v from saldo),
    'saldo_real', (select v from saldo),
    'mrr', (select v from mrr),
    'recebido_mes', (select v from receb_mes),
    'saidas_mes', (select v from saidas_mes),
    'a_receber_mes', (select v from a_receber),
    'a_pagar_mes', (select v from a_pagar),
    'inadimplencia_total', (select vencido from inad),
    'inadimplencia_pct', case when (select carteira from inad)>0 then round((select vencido from inad)/(select carteira from inad)*100,2) else 0 end,
    'previsao_30', (select p30 from prev), 'previsao_60', (select p60 from prev), 'previsao_90', (select p90 from prev),
    'receita_por_tipo', (select por_tipo from tipo),
    'receita_despesa', jsonb_build_object('receita', (select receita from rd), 'despesa', (select despesa from rd))
  );
$$;
revoke all on function financeiro_dashboard(date) from public;
grant execute on function financeiro_dashboard(date) to authenticated;
