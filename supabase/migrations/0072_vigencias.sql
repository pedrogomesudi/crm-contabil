-- Vigências de honorário e regime. Modelo de `vigente_de` ABERTO (sem vigente_ate):
-- o valor vigente na competência C é o da linha com o maior vigente_de <= C.
-- Uma mudança = uma escrita; não há intervalo para manter, logo não há intervalo inconsistente.

create table if not exists honorario_vigencia (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  valor numeric(15,2) not null,
  vigente_de date not null check (vigente_de = date_trunc('month', vigente_de)::date),
  estimada boolean not null default false,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id),
  unique (cliente_id, vigente_de)
);
create index if not exists honorario_vigencia_idx on honorario_vigencia (cliente_id, vigente_de desc);

create table if not exists regime_vigencia (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  regime regime_tributario not null,
  vigente_de date not null check (vigente_de = date_trunc('month', vigente_de)::date),
  estimada boolean not null default false,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id),
  unique (cliente_id, vigente_de)
);
create index if not exists regime_vigencia_idx on regime_vigencia (cliente_id, vigente_de desc);

alter table honorario_vigencia enable row level security;
alter table regime_vigencia enable row level security;

-- Honorário é dado sensível: espelha a RLS de clientes_financeiro (admin/financeiro/contador-dono).
drop policy if exists honorario_vigencia_sel on honorario_vigencia;
create policy honorario_vigencia_sel on honorario_vigencia for select to authenticated
  using (
    auth_papel() in ('admin','financeiro')
    or (auth_papel() = 'contador'
        and exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid()))
  );

-- Regime não é dado financeiro: delega o isolamento à RLS de clientes.
drop policy if exists regime_vigencia_sel on regime_vigencia;
create policy regime_vigencia_sel on regime_vigencia for select to authenticated
  using (exists (select 1 from clientes c where c.id = cliente_id));

-- Sem policy de escrita: quem grava são os triggers SECURITY DEFINER abaixo.

-- Valor vigente na competência. Fallbacks, em ordem:
--   1) a vigência mais recente com vigente_de <= competência
--   2) a PRIMEIRA vigência (extrapolação para trás, quando a competência é anterior a tudo)
--   3) o honorário atual (cliente sem vigência alguma)
create or replace function honorario_vigente(p_cliente uuid, p_competencia date) returns numeric
  language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(
    (select v.valor from honorario_vigencia v
      where v.cliente_id = p_cliente and v.vigente_de <= date_trunc('month', p_competencia)::date
      order by v.vigente_de desc limit 1),
    (select v.valor from honorario_vigencia v
      where v.cliente_id = p_cliente order by v.vigente_de asc limit 1),
    (select f.honorario_mensal from clientes_financeiro f where f.cliente_id = p_cliente)
  );
$$;
revoke all on function honorario_vigente(uuid, date) from public;
grant execute on function honorario_vigente(uuid, date) to authenticated;

-- Captura do honorário. O valor é escrito por QUATRO caminhos (formulário, importação do Domínio,
-- sync de contrato, captura de saída) — instrumentar cada um seria esquecer algum.
-- ATENÇÃO: OLD não existe no INSERT; ramificar por tg_op é obrigatório.
create or replace function capturar_honorario_vigencia() returns trigger
  language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_novo numeric;
begin
  if tg_op = 'INSERT' then
    v_novo := new.honorario_mensal;
  elsif new.honorario_mensal is distinct from old.honorario_mensal then
    v_novo := new.honorario_mensal;
  else
    return null;  -- update que não mexeu no honorário: não polui o histórico
  end if;
  if coalesce(v_novo, 0) <= 0 then return null; end if;

  insert into honorario_vigencia (cliente_id, valor, vigente_de, estimada, criado_por)
    values (new.cliente_id, v_novo, date_trunc('month', now())::date, false, auth.uid())
  on conflict (cliente_id, vigente_de) do update
    set valor = excluded.valor, estimada = false, criado_em = now(), criado_por = excluded.criado_por;
  return null;
end $$;
drop trigger if exists trg_honorario_vigencia on clientes_financeiro;
create trigger trg_honorario_vigencia after insert or update of honorario_mensal on clientes_financeiro
  for each row execute function capturar_honorario_vigencia();

create or replace function capturar_regime_vigencia() returns trigger
  language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_novo regime_tributario;
begin
  if tg_op = 'INSERT' then
    v_novo := new.regime_tributario;
  elsif new.regime_tributario is distinct from old.regime_tributario then
    v_novo := new.regime_tributario;
  else
    return null;
  end if;

  insert into regime_vigencia (cliente_id, regime, vigente_de, estimada, criado_por)
    values (new.id, v_novo, date_trunc('month', now())::date, false, auth.uid())
  on conflict (cliente_id, vigente_de) do update
    set regime = excluded.regime, estimada = false, criado_em = now(), criado_por = excluded.criado_por;
  return null;
end $$;
drop trigger if exists trg_regime_vigencia on clientes;
create trigger trg_regime_vigencia after insert or update of regime_tributario on clientes
  for each row execute function capturar_regime_vigencia();

-- BACKFILL — marcado como ESTIMADO, porque é suposição, não dado.
-- O quanto cada cliente pagava antes desta migration não existe em lugar nenhum. Estas linhas
-- afirmam "até onde sabemos, era isso", e a UI mostra o selo (estimada).
insert into honorario_vigencia (cliente_id, valor, vigente_de, estimada)
  select c.id, f.honorario_mensal,
         date_trunc('month', coalesce(c.data_inicio, c.criado_em))::date, true
    from clientes c join clientes_financeiro f on f.cliente_id = c.id
   where c.excluido_em is null and coalesce(f.honorario_mensal, 0) > 0
  on conflict (cliente_id, vigente_de) do nothing;

insert into regime_vigencia (cliente_id, regime, vigente_de, estimada)
  select c.id, c.regime_tributario,
         date_trunc('month', coalesce(c.data_inicio, c.criado_em))::date, true
    from clientes c
   where c.excluido_em is null
  on conflict (cliente_id, vigente_de) do nothing;
