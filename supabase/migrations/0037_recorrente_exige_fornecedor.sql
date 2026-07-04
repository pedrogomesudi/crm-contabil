-- Defesa: gerar_despesas_recorrentes pula templates sem fornecedor (o título PAGAR
-- exige fornecedor — sem o filtro, um template inválido quebraria a geração do mês inteira).
create or replace function gerar_despesas_recorrentes(p_competencia date) returns jsonb
  language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_comp date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_g int := 0; v_p int := 0; r record; v_venc date; v_ins int;
begin
  for r in select * from despesa_recorrente
           where ativa and data_inicio <= v_fim and fornecedor_id is not null loop
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
