-- Mudança de regra de negócio na aplicação da importação do Domínio:
-- cliente que JÁ existe no CRM (casado por CNPJ) NÃO tem o cadastro alterado.
-- Apenas clientes NOVOS são inseridos. O honorário do cliente existente pode ser
-- trazido/atualizado pelos contratos, mas NUNCA é zerado (sem contrato = preserva).
-- Substitui o comportamento anterior (0016), que fazia upsert sobrescrevendo tudo.
create or replace function aplicar_importacao(p_id uuid) returns jsonb
  language plpgsql set search_path = pg_catalog, public as $$
declare
  v_gravados int := 0;     -- clientes NOVOS criados
  v_honorarios int := 0;   -- honorários definidos/atualizados
  v_cliente_id uuid;
  v_honorario numeric;
  v_tem_contrato boolean;
  r record;
  c jsonb;
begin
  update importacoes set status = 'aplicada', expira_em = null
    where id = p_id and status = 'previa' and (expira_em is null or expira_em > now());
  if not found then
    raise exception 'Prévia indisponível (já aplicada ou expirada).';
  end if;

  for r in
    select payload->'cliente' as cli, classe
    from importacao_itens
    where importacao_id = p_id and classe in ('novo', 'atualizado', 'inalterado')
  loop
    c := r.cli;

    if r.classe = 'novo' then
      -- Cliente NOVO: cria. (on conflict do nothing é rede de segurança contra corrida.)
      insert into clientes (
        cpf_cnpj, tipo_pessoa, razao_social, nome_fantasia, regime_tributario, status,
        cnae, inscricao_estadual, endereco, email, telefone, dominio_codigo,
        origem, sincronizado_em, dominio_snapshot
      ) values (
        c->>'cpf_cnpj',
        (c->>'tipo_pessoa')::tipo_pessoa,
        c->>'razao_social',
        c->>'nome_fantasia',
        (c->>'regime_tributario')::regime_tributario,
        (c->>'status')::status_cliente,
        c->>'cnae',
        c->>'inscricao_estadual',
        case when jsonb_typeof(c->'endereco') = 'object' then c->'endereco' else null end,
        c->>'email',
        c->>'telefone',
        c->>'dominio_codigo',
        'dominio', now(), c
      )
      on conflict (cpf_cnpj) do nothing
      returning id into v_cliente_id;
      if v_cliente_id is null then
        select id into v_cliente_id from clientes where cpf_cnpj = c->>'cpf_cnpj';
      else
        v_gravados := v_gravados + 1;
      end if;
    else
      -- Cliente EXISTENTE: NÃO altera nenhum dado cadastral. Só localiza o id.
      select id into v_cliente_id from clientes where cpf_cnpj = c->>'cpf_cnpj';
    end if;

    if v_cliente_id is null then continue; end if;

    -- Financeiro só para quem pode (admin/financeiro).
    if auth_papel() in ('admin', 'financeiro') then
      select coalesce(sum((ct->>'valorAtual')::numeric), 0) into v_honorario
      from importacao_contratos ic, jsonb_array_elements(ic.payload) ct
      where ic.importacao_id = p_id and ic.cpf_cnpj = c->>'cpf_cnpj'
        and (ct->>'encerradoEm') is null and (ct->>'tipoContrato') ~* 'honor';

      if r.classe = 'novo' then
        -- Cliente novo: define o honorário (null se não houver contrato).
        insert into clientes_financeiro (cliente_id, honorario_mensal)
        values (v_cliente_id, nullif(v_honorario, 0))
        on conflict (cliente_id) do update set honorario_mensal = nullif(v_honorario, 0);
        if v_honorario > 0 then v_honorarios := v_honorarios + 1; end if;
      elsif v_honorario > 0 then
        -- Cliente existente: só ATUALIZA o honorário se houver contrato. NUNCA zera.
        insert into clientes_financeiro (cliente_id, honorario_mensal)
        values (v_cliente_id, v_honorario)
        on conflict (cliente_id) do update set honorario_mensal = v_honorario;
        v_honorarios := v_honorarios + 1;
      end if;

      -- Espelho de contratos: só mexe se houver contrato no staging deste cliente
      -- (não apaga o histórico de quem veio sem contrato nesta importação).
      select exists (
        select 1 from importacao_contratos ic
        where ic.importacao_id = p_id and ic.cpf_cnpj = c->>'cpf_cnpj'
      ) into v_tem_contrato;
      if v_tem_contrato then
        delete from contratos_dominio where cliente_id = v_cliente_id;
        insert into contratos_dominio (
          cliente_id, dominio_codigo, tipo_contrato, emissao, inicio_contrato,
          inicio_faturamento, dia_vencimento, encerrado_em, valor_original, valor_atual
        )
        select
          v_cliente_id, ct->>'codigoCliente', ct->>'tipoContrato',
          (ct->>'emissao')::date, (ct->>'inicioContrato')::date, (ct->>'inicioFaturamento')::date,
          ct->>'diaVencimento', (ct->>'encerradoEm')::date,
          (ct->>'valorOriginal')::numeric, (ct->>'valorAtual')::numeric
        from importacao_contratos ic, jsonb_array_elements(ic.payload) ct
        where ic.importacao_id = p_id and ic.cpf_cnpj = c->>'cpf_cnpj';
      end if;
    end if;
  end loop;

  return jsonb_build_object('gravados', v_gravados, 'honorarios', v_honorarios);
end;
$$;
revoke all on function aplicar_importacao(uuid) from public;
grant execute on function aplicar_importacao(uuid) to authenticated;
