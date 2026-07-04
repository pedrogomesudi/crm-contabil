-- Gera as mensalidades da competência (1º dia do mês). Idempotente (on conflict do nothing).
-- Universo: clientes ativos, não-excluídos, com contrato ATIVO ou honorario_mensal > 0.
-- Pró-rata no 1º mês (data_inicio no meio do mês). 13º no mês parametrizado.
-- SECURITY DEFINER: o pg_cron roda sem sessão; o gate de papel é no server action do botão.
create or replace function gerar_mensalidades(p_competencia date) returns jsonb
  language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_comp date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_dias int := extract(day from v_fim)::int;
  v_gerados int := 0; v_pulados int := 0;
  r record; v_valor numeric; v_venc date; v_ins int;
  v_cat_hon uuid;
begin
  select id into v_cat_hon from categoria where nome = 'Honorários mensais' and categoria_pai_id is null limit 1;

  -- (1) MENSALIDADE por contrato ATIVO já iniciado
  for r in
    select ct.* from contrato ct
    join clientes c on c.id = ct.cliente_id
    where ct.status = 'ATIVO' and ct.data_inicio <= v_fim
      and c.excluido_em is null and c.status = 'ativo'
  loop
    v_venc := (v_comp + (r.dia_vencimento - 1))::date;
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

    if r.gera_decimo_terceiro and extract(month from v_comp)::int = r.mes_decimo_terceiro then
      insert into titulo (cliente_id, contrato_id, origem, descricao, valor, competencia, vencimento, categoria_id, centro_custo_id)
        values (r.cliente_id, r.id, 'DECIMO_TERCEIRO', r.descricao || ' (13º)', r.valor_mensal, v_comp, v_venc, r.categoria_id, r.centro_custo_id)
        on conflict do nothing;
      get diagnostics v_ins = row_count;
      if v_ins > 0 then v_gerados := v_gerados + 1; else v_pulados := v_pulados + 1; end if;
    end if;
  end loop;

  -- (2) MENSALIDADE do honorário para clientes ativos SEM contrato ativo
  for r in
    select c.id as cliente_id, f.honorario_mensal, coalesce(f.dia_vencimento, 10) as dia
    from clientes c join clientes_financeiro f on f.cliente_id = c.id
    where c.excluido_em is null and c.status = 'ativo'
      and coalesce(f.honorario_mensal,0) > 0
      and not exists (select 1 from contrato ct where ct.cliente_id = c.id and ct.status = 'ATIVO')
  loop
    v_venc := (v_comp + (r.dia - 1))::date;
    insert into titulo (cliente_id, contrato_id, origem, descricao, valor, competencia, vencimento, categoria_id)
      values (r.cliente_id, null, 'MENSALIDADE', 'Honorário mensal', r.honorario_mensal, v_comp, v_venc, v_cat_hon)
      on conflict do nothing;
    get diagnostics v_ins = row_count;
    if v_ins > 0 then v_gerados := v_gerados + 1; else v_pulados := v_pulados + 1; end if;
  end loop;

  return jsonb_build_object('gerados', v_gerados, 'pulados', v_pulados);
end $$;
revoke all on function gerar_mensalidades(date) from public;
grant execute on function gerar_mensalidades(date) to authenticated;

-- Encerra o contrato e CANCELA os títulos futuros em ABERTO (competência >= mês corrente).
create or replace function encerrar_contrato(p_id uuid, p_data date, p_motivo text) returns void
  language plpgsql set search_path = pg_catalog, public as $$
begin
  update contrato set status = 'ENCERRADO', data_encerramento = p_data, motivo_encerramento = p_motivo,
    atualizado_em = now(), atualizado_por = auth.uid() where id = p_id;
  update titulo set status = 'CANCELADO', atualizado_em = now()
    where contrato_id = p_id and status = 'ABERTO'
      and competencia >= date_trunc('month', now())::date;
end $$;
revoke all on function encerrar_contrato(uuid, date, text) from public;
grant execute on function encerrar_contrato(uuid, date, text) to authenticated;
