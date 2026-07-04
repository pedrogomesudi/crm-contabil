-- V6.5 — RPCs de relatório (lado receita). SECURITY INVOKER: RLS escopa o contador.
create index if not exists idx_titulo_vencimento on titulo(vencimento);

create or replace function financeiro_dashboard(p_competencia date) returns jsonb
  language sql stable security invoker set search_path = public as $$
  with
  comp as (select date_trunc('month', p_competencia)::date as ini,
                  (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date as fim),
  ts as (
    select t.id, t.vencimento, t.competencia, t.origem, t.valor,
      (t.valor - coalesce((select sum(valor_recebido) from baixa where titulo_id = t.id), 0)) as saldo
    from titulo t where t.status <> 'CANCELADO'
  ),
  saldo as (
    select coalesce((select sum(saldo_inicial) from conta_bancaria where ativa), 0)
         + coalesce((select sum(valor_recebido) from baixa), 0) as v
  ),
  mrr as (
    select coalesce((select sum(valor_mensal) from contrato where status = 'ATIVO'), 0)
         + coalesce((select sum(f.honorario_mensal) from clientes_financeiro f
             join clientes c on c.id = f.cliente_id
             where c.excluido_em is null and c.status = 'ativo' and coalesce(f.honorario_mensal,0) > 0
               and not exists (select 1 from contrato ct where ct.cliente_id = c.id and ct.status = 'ATIVO')), 0) as v
  ),
  recebido as (select coalesce(sum(b.valor_recebido), 0) as v from baixa b, comp
               where b.data_recebimento between comp.ini and comp.fim),
  a_receber as (select coalesce(sum(saldo), 0) as v from ts, comp
                where ts.competencia between comp.ini and comp.fim and ts.saldo > 0),
  inad as (
    select coalesce(sum(saldo) filter (where vencimento < current_date and saldo > 0), 0) as vencido,
           coalesce(sum(saldo) filter (where saldo > 0), 0) as carteira
    from ts
  ),
  prev as (
    select
      coalesce(sum(saldo) filter (where vencimento between current_date and current_date + 30 and saldo > 0), 0) as p30,
      coalesce(sum(saldo) filter (where vencimento between current_date and current_date + 60 and saldo > 0), 0) as p60,
      coalesce(sum(saldo) filter (where vencimento between current_date and current_date + 90 and saldo > 0), 0) as p90
    from ts
  ),
  tipo as (
    select coalesce(jsonb_object_agg(origem, total), '{}'::jsonb) as por_tipo
    from (select ts.origem, sum(ts.valor) as total from ts, comp
          where ts.competencia between comp.ini and comp.fim group by ts.origem) g
  )
  select jsonb_build_object(
    'saldo', (select v from saldo),
    'mrr', (select v from mrr),
    'recebido_mes', (select v from recebido),
    'a_receber_mes', (select v from a_receber),
    'inadimplencia_total', (select vencido from inad),
    'inadimplencia_pct', case when (select carteira from inad) > 0
      then round((select vencido from inad) / (select carteira from inad) * 100, 2) else 0 end,
    'previsao_30', (select p30 from prev),
    'previsao_60', (select p60 from prev),
    'previsao_90', (select p90 from prev),
    'receita_por_tipo', (select por_tipo from tipo)
  );
$$;
revoke all on function financeiro_dashboard(date) from public;
grant execute on function financeiro_dashboard(date) to authenticated;

create or replace function financeiro_aging() returns jsonb
  language sql stable security invoker set search_path = public as $$
  with ts as (
    select t.vencimento,
      (t.valor - coalesce((select sum(valor_recebido) from baixa where titulo_id = t.id), 0)) as saldo
    from titulo t where t.status <> 'CANCELADO'
  ),
  fx as (
    select case
        when vencimento >= current_date then 'a_vencer'
        when current_date - vencimento <= 30 then 'd1_30'
        when current_date - vencimento <= 60 then 'd31_60'
        when current_date - vencimento <= 90 then 'd61_90'
        else 'd90_mais' end as faixa, saldo
    from ts where saldo > 0
  )
  select coalesce(jsonb_object_agg(faixa, jsonb_build_object('total', total, 'qtd', qtd)), '{}'::jsonb)
  from (select faixa, sum(saldo) as total, count(*) as qtd from fx group by faixa) g;
$$;
revoke all on function financeiro_aging() from public;
grant execute on function financeiro_aging() to authenticated;

create or replace function financeiro_fluxo_caixa(p_meses int default 6) returns jsonb
  language sql stable security invoker set search_path = public as $$
  with meses as (
    select (date_trunc('month', current_date) - (n || ' month')::interval)::date as m
    from generate_series(0, p_meses - 1) n
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'mes', to_char(m, 'YYYY-MM'),
    'realizado', coalesce((select sum(valor_recebido) from baixa where date_trunc('month', data_recebimento) = meses.m), 0),
    'a_receber', coalesce((select sum(t.valor - coalesce((select sum(valor_recebido) from baixa where titulo_id = t.id), 0))
                           from titulo t where t.status <> 'CANCELADO' and date_trunc('month', t.vencimento) = meses.m), 0)
  ) order by m), '[]'::jsonb)
  from meses;
$$;
revoke all on function financeiro_fluxo_caixa(int) from public;
grant execute on function financeiro_fluxo_caixa(int) to authenticated;

create or replace function financeiro_maiores_devedores() returns jsonb
  language sql stable security invoker set search_path = public as $$
  with ts as (
    select t.cliente_id, t.vencimento,
      (t.valor - coalesce((select sum(valor_recebido) from baixa where titulo_id = t.id), 0)) as saldo
    from titulo t where t.status <> 'CANCELADO'
  ),
  venc as (
    select cliente_id, sum(saldo) as total, count(*) as qtd
    from ts where vencimento < current_date and saldo > 0
    group by cliente_id order by sum(saldo) desc limit 10
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'cliente', c.razao_social, 'total', v.total, 'qtd', v.qtd
  ) order by v.total desc), '[]'::jsonb)
  from venc v join clientes c on c.id = v.cliente_id;
$$;
revoke all on function financeiro_maiores_devedores() from public;
grant execute on function financeiro_maiores_devedores() to authenticated;
