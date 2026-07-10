-- Faturamento em regime vencido: a competência é o mês do SERVIÇO (M-1) e o título vence em M.
-- Também: 13º honorário em duas parcelas com vencimentos fixos, e separação entre o mês do serviço
-- (nfse.competencia) e o que foi enviado à Sefin (nfse.dcompet).
--
-- ORDEM CRÍTICA: o backfill de dcompet vem ANTES do update da competência. Invertido, perde-se para
-- sempre o registro do que a nota autorizada declarou.

-- (A) A competência corrente é sempre o mês anterior. Função própria para ser testável isoladamente.
create or replace function competencia_padrao(p_hoje date default current_date) returns date
  language sql immutable set search_path = pg_catalog, public as $$
  select (date_trunc('month', p_hoje) - interval '1 month')::date;
$$;
revoke all on function competencia_padrao(date) from public;
grant execute on function competencia_padrao(date) to authenticated;

-- (B) Geração: mensalidade vence no mês SEGUINTE à competência; 13º em duas parcelas por CLIENTE.
-- O 13º saiu do laço de contratos: se ficasse, um cliente com contrato receberia 13º duas vezes
-- (uma pelo contrato, outra pelo cliente). O honorario_mensal já é a soma dos contratos ativos.
create or replace function gerar_mensalidades(p_competencia date) returns jsonb
  language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_comp date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_dias int := extract(day from v_fim)::int;
  v_venc_mes date := (v_comp + interval '1 month')::date;  -- 1º dia do mês de vencimento
  v_ano int := extract(year from v_comp)::int;
  v_gerados int := 0; v_pulados int := 0;
  r record; v_valor numeric; v_venc date; v_ins int;
  v_cat_hon uuid; v_cat_13 uuid; v_p1 numeric; v_p2 numeric;
begin
  select id into v_cat_hon from categoria where nome = 'Honorários mensais' and categoria_pai_id is null limit 1;
  select id into v_cat_13  from categoria where nome = '13º honorário'      and categoria_pai_id is null limit 1;

  -- (1) MENSALIDADE por contrato ATIVO já iniciado
  for r in
    select ct.* from contrato ct
    join clientes c on c.id = ct.cliente_id
    where ct.status = 'ATIVO' and ct.data_inicio <= v_fim
      and c.excluido_em is null and c.status = 'ativo'
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

  -- (2) MENSALIDADE do honorário para clientes ativos SEM contrato ativo
  for r in
    select c.id as cliente_id, f.honorario_mensal, coalesce(f.dia_vencimento, 10) as dia
    from clientes c join clientes_financeiro f on f.cliente_id = c.id
    where c.excluido_em is null and c.status = 'ativo'
      and coalesce(f.honorario_mensal,0) > 0
      and not exists (select 1 from contrato ct where ct.cliente_id = c.id and ct.status = 'ATIVO')
  loop
    v_venc := (v_venc_mes + (r.dia - 1))::date;
    insert into titulo (cliente_id, contrato_id, origem, descricao, valor, competencia, vencimento, categoria_id)
      values (r.cliente_id, null, 'MENSALIDADE', 'Honorário mensal', r.honorario_mensal, v_comp, v_venc, v_cat_hon)
      on conflict do nothing;
    get diagnostics v_ins = row_count;
    if v_ins > 0 then v_gerados := v_gerados + 1; else v_pulados := v_pulados + 1; end if;
  end loop;

  -- (3) 13º HONORÁRIO: gerado na rodada de OUTUBRO (competência = outubro), quando ambos os
  -- vencimentos (20/11 e 15/12) ainda estão no futuro. Um honorário dividido em 50%/50%.
  if extract(month from v_comp)::int = 10 then
    for r in
      select c.id as cliente_id, f.honorario_mensal
      from clientes c join clientes_financeiro f on f.cliente_id = c.id
      where c.excluido_em is null and c.status = 'ativo'
        and coalesce(f.honorario_mensal,0) > 0
    loop
      -- A 2ª parcela é o RESTO, não outro round(): 333.33 -> 166.67 + 166.66 = 333.33 exato.
      v_p1 := round(r.honorario_mensal / 2, 2);
      v_p2 := r.honorario_mensal - v_p1;

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

-- (C) O job do dia 1 passa a gerar a competência ANTERIOR.
create or replace function gerar_mensalidades_automatico() returns void
  language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if (select geracao_automatica from financeiro_config where id = 1) then
    perform gerar_mensalidades(competencia_padrao());
  end if;
end $$;

-- (D) dcompet: o que foi ENVIADO à Sefin. nfse.competencia passa a ser o mês do SERVIÇO.
alter table nfse add column if not exists dcompet date;
comment on column nfse.dcompet is
  'Competência efetivamente enviada na DPS (dCompet). Pode divergir de nfse.competencia nas notas '
  'emitidas antes da correção de 2026-07: lá, competencia = mês do serviço e dcompet = o que a nota diz.';

-- Congela o que foi enviado ANTES de qualquer alteração. Esta linha precisa vir antes da (E).
update nfse set dcompet = competencia where dcompet is null;

-- (E) Correção do ciclo de julho/2026: as notas e os títulos referem-se ao serviço de JUNHO.
-- O vencimento dos títulos NÃO é tocado (segue em julho, que é o regime vencido correto).
update nfse   set competencia = date '2026-06-01' where competencia = date '2026-07-01';
update titulo set competencia = date '2026-06-01'
  where competencia = date '2026-07-01' and origem = 'MENSALIDADE';
