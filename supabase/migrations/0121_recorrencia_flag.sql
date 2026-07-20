-- Flag "tem honorários recorrentes": interruptor mestre da geração de mensalidade.
-- Cliente com a flag desmarcada não gera nada — nem por honorário, nem por contrato ativo.
alter table clientes_financeiro add column if not exists tem_honorarios_recorrentes boolean not null default true;

-- Recria gerar_mensalidades (0073) com a flag nos três blocos. Ausência de linha em
-- clientes_financeiro conta como true (default), para não quebrar clientes só com contrato.
create or replace function gerar_mensalidades(p_competencia date) returns jsonb
  language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_comp date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_dias int := extract(day from v_fim)::int;
  v_venc_mes date := (v_comp + interval '1 month')::date;
  v_ano int := extract(year from v_comp)::int;
  v_gerados int := 0; v_pulados int := 0;
  r record; v_valor numeric; v_venc date; v_ins int;
  v_cat_hon uuid; v_cat_13 uuid; v_p1 numeric; v_p2 numeric; v_hon numeric;
begin
  select id into v_cat_hon from categoria where nome = 'Honorários mensais' and categoria_pai_id is null limit 1;
  select id into v_cat_13  from categoria where nome = '13º honorário'      and categoria_pai_id is null limit 1;

  -- (1) MENSALIDADE por contrato ATIVO — a flag prevalece: cliente não-recorrente não gera nem com contrato.
  for r in
    select ct.* from contrato ct
    join clientes c on c.id = ct.cliente_id
    where ct.status = 'ATIVO' and ct.data_inicio <= v_fim
      and c.excluido_em is null and c.status = 'ativo'
      and coalesce((select f.tem_honorarios_recorrentes from clientes_financeiro f where f.cliente_id = ct.cliente_id), true)
  loop
    v_venc := (v_venc_mes + (r.dia_vencimento - 1))::date;
    if date_trunc('month', r.data_inicio) = v_comp and extract(day from r.data_inicio) > 1 then
      v_valor := round(r.valor_mensal * (v_dias - extract(day from r.data_inicio) + 1) / v_dias, 2);
    else
      v_valor := r.valor_mensal;
    end if;
    insert into titulo (cliente_id, contrato_id, origem, descricao, valor, competencia, vencimento, categoria_id, centro_custo_id)
      values (r.cliente_id, r.id, 'MENSALIDADE', r.descricao, v_valor, v_comp, v_venc, r.categoria_id, r.centro_custo_id)
      on conflict do nothing;
    get diagnostics v_ins = row_count;
    if v_ins > 0 then v_gerados := v_gerados + 1; else v_pulados := v_pulados + 1; end if;
  end loop;

  -- (2) MENSALIDADE do honorário vigente, para clientes sem contrato ativo E recorrentes.
  for r in
    select c.id as cliente_id, coalesce(f.dia_vencimento, 10) as dia
    from clientes c join clientes_financeiro f on f.cliente_id = c.id
    where c.excluido_em is null and c.status = 'ativo'
      and coalesce(f.honorario_mensal,0) > 0
      and f.tem_honorarios_recorrentes
      and not exists (select 1 from contrato ct where ct.cliente_id = c.id and ct.status = 'ATIVO')
  loop
    v_valor := honorario_vigente(r.cliente_id, v_comp);
    if coalesce(v_valor, 0) <= 0 then continue; end if;
    v_venc := (v_venc_mes + (r.dia - 1))::date;
    insert into titulo (cliente_id, contrato_id, origem, descricao, valor, competencia, vencimento, categoria_id)
      values (r.cliente_id, null, 'MENSALIDADE', 'Honorário mensal', v_valor, v_comp, v_venc, v_cat_hon)
      on conflict do nothing;
    get diagnostics v_ins = row_count;
    if v_ins > 0 then v_gerados := v_gerados + 1; else v_pulados := v_pulados + 1; end if;
  end loop;

  -- (3) 13º HONORÁRIO na rodada de OUTUBRO — só para recorrentes.
  if extract(month from v_comp)::int = 10 then
    for r in
      select c.id as cliente_id
      from clientes c join clientes_financeiro f on f.cliente_id = c.id
      where c.excluido_em is null and c.status = 'ativo'
        and coalesce(f.honorario_mensal,0) > 0
        and f.tem_honorarios_recorrentes
    loop
      v_hon := honorario_vigente(r.cliente_id, v_comp);
      if coalesce(v_hon, 0) <= 0 then continue; end if;
      v_p1 := round(v_hon / 2, 2);
      v_p2 := v_hon - v_p1;

      insert into titulo (cliente_id, contrato_id, origem, descricao, valor, competencia, vencimento, categoria_id, parcela, total_parcelas)
        values (r.cliente_id, null, 'DECIMO_TERCEIRO', '13º honorário (1/2)', v_p1,
                make_date(v_ano, 11, 1), make_date(v_ano, 11, 20), v_cat_13, 1, 2)
        on conflict do nothing;
      get diagnostics v_ins = row_count;
      if v_ins > 0 then v_gerados := v_gerados + 1; else v_pulados := v_pulados + 1; end if;

      insert into titulo (cliente_id, contrato_id, origem, descricao, valor, competencia, vencimento, categoria_id, parcela, total_parcelas)
        values (r.cliente_id, null, 'DECIMO_TERCEIRO', '13º honorário (2/2)', v_p2,
                make_date(v_ano, 12, 1), make_date(v_ano, 12, 15), v_cat_13, 2, 2)
        on conflict do nothing;
      get diagnostics v_ins = row_count;
      if v_ins > 0 then v_gerados := v_gerados + 1; else v_pulados := v_pulados + 1; end if;
    end loop;
  end if;

  return jsonb_build_object('gerados', v_gerados, 'pulados', v_pulados);
end $$;
revoke all on function gerar_mensalidades(date) from public;
grant execute on function gerar_mensalidades(date) to authenticated;
