-- Índices para o dashboard (counts por status/regime e ordenação por atualizado_em).
create index if not exists idx_clientes_status on clientes (status);
create index if not exists idx_clientes_regime on clientes (regime_tributario);
create index if not exists idx_clientes_atualizado_em on clientes (atualizado_em desc);

-- Resumo do dashboard em UMA query (snapshot consistente). SECURITY INVOKER =>
-- respeita a RLS de `clientes` (cada papel vê só o que pode).
create or replace function dashboard_resumo()
  returns jsonb
  language sql stable security invoker set search_path = public as $$
  with t as (
    select
      count(*) as total,
      count(*) filter (where status = 'ativo') as ativos,
      count(*) filter (where status = 'inativo') as inativos
    from clientes
  ),
  r as (
    select coalesce(jsonb_object_agg(regime_tributario, n), '{}'::jsonb) as por_regime
    from (
      select regime_tributario, count(*) as n from clientes group by regime_tributario
    ) g
  )
  select jsonb_build_object(
    'total', t.total,
    'ativos', t.ativos,
    'inativos', t.inativos,
    'por_regime', r.por_regime
  )
  from t, r;
$$;
revoke all on function dashboard_resumo() from public;
grant execute on function dashboard_resumo() to authenticated;
