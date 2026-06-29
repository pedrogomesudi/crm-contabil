-- Correções da revisão da V2. Idempotente.

-- [M5] dominio_codigo deixa de ser ÚNICO (matriz/filial ou recódigo do Domínio
-- com mesmo código causariam unique_violation abortando a aplicação inteira; a
-- reconciliação é por cpf_cnpj). Vira índice simples só para lookup.
drop index if exists clientes_dominio_codigo_uidx;
create index if not exists clientes_dominio_codigo_idx
  on clientes (dominio_codigo) where dominio_codigo is not null;

-- [M4] Auditoria em contratos_dominio (espelha o padrão de clientes_financeiro).
alter table contratos_dominio add column if not exists criado_por uuid references usuarios(id);
create or replace function contratos_dominio_integridade() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  if auth.uid() is not null then
    new.criado_por := auth.uid();
  end if;
  new.criado_em := now();
  return new;
end;
$$;
drop trigger if exists trg_contratos_dominio_integridade on contratos_dominio;
create trigger trg_contratos_dominio_integridade
  before insert on contratos_dominio
  for each row execute function contratos_dominio_integridade();

-- [M3] Importação é escopada por dono (admin vê tudo). Evita que um assistente
-- altere/apague a importação de outro (e cascateie no staging financeiro).
drop policy if exists imp_all on importacoes;
create policy imp_all on importacoes for all to authenticated
  using (auth_papel() = 'admin' or executado_por = auth.uid())
  with check (auth_papel() in ('admin', 'assistente'));

drop policy if exists imp_itens_all on importacao_itens;
create policy imp_itens_all on importacao_itens for all to authenticated
  using (
    auth_papel() = 'admin'
    or exists (select 1 from importacoes i where i.id = importacao_id and i.executado_por = auth.uid())
  )
  with check (
    auth_papel() in ('admin', 'assistente')
    and exists (select 1 from importacoes i where i.id = importacao_id and i.executado_por = auth.uid())
  );

-- [A1/A2/A3/A4/A5] Aplicação ATÔMICA da importação, lendo direto do staging.
-- SECURITY INVOKER: a RLS continua valendo (assistente não escreve financeiro).
-- O flip de status é a 1ª escrita: protege contra reaplicação/concorrência e,
-- em qualquer erro, a transação inteira faz rollback (volta a 'previa').
create or replace function aplicar_importacao(p_id uuid) returns jsonb
  language plpgsql set search_path = pg_catalog, public as $$
declare
  v_gravados int := 0;
  v_cliente_id uuid;
  v_honorario numeric;
  r record;
  c jsonb;
begin
  update importacoes set status = 'aplicada', expira_em = null
    where id = p_id and status = 'previa' and (expira_em is null or expira_em > now());
  if not found then
    raise exception 'Prévia indisponível (já aplicada ou expirada).';
  end if;

  for r in
    select payload->'cliente' as cli
    from importacao_itens
    where importacao_id = p_id and classe in ('novo', 'atualizado')
  loop
    c := r.cli;
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
    on conflict (cpf_cnpj) do update set
      tipo_pessoa = excluded.tipo_pessoa,
      razao_social = excluded.razao_social,
      nome_fantasia = excluded.nome_fantasia,
      regime_tributario = excluded.regime_tributario,
      status = excluded.status,
      cnae = excluded.cnae,
      inscricao_estadual = excluded.inscricao_estadual,
      endereco = excluded.endereco,
      email = excluded.email,
      telefone = excluded.telefone,
      dominio_codigo = excluded.dominio_codigo,
      origem = 'dominio',
      sincronizado_em = now(),
      dominio_snapshot = excluded.dominio_snapshot
    returning id into v_cliente_id;
    v_gravados := v_gravados + 1;

    -- Financeiro só para quem pode (admin/financeiro). Sempre reflete o estado
    -- atual: zera o honorário se não há mais contrato ativo (corrige A3).
    if auth_papel() in ('admin', 'financeiro') then
      select coalesce(sum((ct->>'valorAtual')::numeric), 0) into v_honorario
      from importacao_contratos ic, jsonb_array_elements(ic.payload) ct
      where ic.importacao_id = p_id and ic.cpf_cnpj = c->>'cpf_cnpj'
        and (ct->>'encerradoEm') is null and (ct->>'tipoContrato') ~* 'honor';

      insert into clientes_financeiro (cliente_id, honorario_mensal)
      values (v_cliente_id, nullif(v_honorario, 0))
      on conflict (cliente_id) do update set honorario_mensal = nullif(v_honorario, 0);

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
  end loop;

  return jsonb_build_object('gravados', v_gravados);
end;
$$;
revoke all on function aplicar_importacao(uuid) from public;
grant execute on function aplicar_importacao(uuid) to authenticated;
