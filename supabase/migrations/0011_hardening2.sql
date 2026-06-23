-- Hardening 2 (revisão do projeto inteiro). Tudo idempotente.

-- 1) search_path com pg_catalog explícito nas funções que ficaram para trás em 0007
--    (defesa contra sequestro de resolução de nomes em SECURITY DEFINER).
create or replace function auth_papel() returns papel
  language sql stable security definer set search_path = pg_catalog, public as $$
  select papel from usuarios where id = auth.uid() and ativo
$$;

create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  insert into usuarios (id, nome, email, papel)
  values (
    new.id,
    coalesce(new.raw_app_meta_data->>'nome', new.email),
    new.email,
    coalesce((new.raw_app_meta_data->>'papel')::papel, 'assistente')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function dashboard_resumo()
  returns jsonb
  language sql stable security invoker set search_path = pg_catalog, public as $$
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
  from t cross join r;
$$;

-- 2) Congela também email/nome para não-admin (impede o usuário divergir a própria
--    linha de auth.users via update). service_role (uid nulo) e admin seguem livres.
create or replace function congela_campos_sensiveis() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  if auth.uid() is not null and coalesce(auth_papel(), 'assistente') <> 'admin' then
    new.papel := old.papel;
    new.ativo := old.ativo;
    new.email := old.email;
    new.nome := old.nome;
  end if;
  return new;
end;
$$;

-- 3) Integridade/auditoria de clientes_financeiro (espelha o que clientes já tem):
--    atualizado_por é forçado a auth.uid() (não-forjável) e atualizado_em vem do banco.
create or replace function clientes_financeiro_integridade() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  if auth.uid() is not null then
    new.atualizado_por := auth.uid();
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;
drop trigger if exists trg_clientes_financeiro_integridade on clientes_financeiro;
create trigger trg_clientes_financeiro_integridade
  before insert or update on clientes_financeiro
  for each row execute function clientes_financeiro_integridade();

-- 4) cpf_cnpj sempre dígitos (11 ou 14): trava a normalização no banco, não só na app.
alter table clientes drop constraint if exists chk_cpf_cnpj_digitos;
alter table clientes add constraint chk_cpf_cnpj_digitos
  check (cpf_cnpj ~ '^[0-9]{11}$' or cpf_cnpj ~ '^[0-9]{14}$');

-- 5) caminho_storage deve pertencer ao cliente do documento (impede vincular um
--    objeto físico de outro cliente — defesa da policy de storage).
alter table documentos drop constraint if exists chk_caminho_prefixo;
alter table documentos add constraint chk_caminho_prefixo
  check (caminho_storage like cliente_id::text || '/%');
