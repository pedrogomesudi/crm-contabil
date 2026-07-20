-- RF Financeiro: suspensão por inadimplência (Fatia A — núcleo).

-- Estado corrente (barato para UI e, na Fatia B, para RLS do portal).
alter table clientes add column if not exists suspenso boolean not null default false;

-- Trilha de auditoria append-only: quem suspendeu/reativou, por quê e contra qual dívida.
create table if not exists cliente_suspensao (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references clientes(id) on delete cascade,
  acao          text not null check (acao in ('suspensao','reativacao')),
  motivo        text not null,
  saldo_devedor numeric(15,2),
  dias_atraso   int,
  por           uuid references usuarios(id),
  em            timestamptz not null default now()
);
create index if not exists idx_cliente_suspensao_cliente on cliente_suspensao(cliente_id, em desc);

-- RLS: leitura para a equipe; escrita para a equipe financeira. A segregação
-- suspender(financeiro)/reativar(admin) é aplicada na server action, não aqui.
alter table cliente_suspensao enable row level security;
drop policy if exists cliente_suspensao_read  on cliente_suspensao;
drop policy if exists cliente_suspensao_write on cliente_suspensao;
create policy cliente_suspensao_read on cliente_suspensao for select
  using (auth_papel() in ('admin','contador','assistente','financeiro'));
create policy cliente_suspensao_write on cliente_suspensao for all
  using (auth_papel() in ('admin','financeiro')) with check (auth_papel() in ('admin','financeiro'));

-- Parâmetros. null/0 em dias = feature desligada; null em valor = sem piso.
alter table escritorio_config add column if not exists suspensao_dias_tolerancia int;
alter table escritorio_config add column if not exists suspensao_valor_minimo numeric(15,2);

-- Fila derivada: uma linha por cliente que está suspenso OU tem saldo vencido > 0.
-- saldo_devedor = soma do saldo dos títulos RECEBER vencidos; dias_atraso = maior atraso.
create or replace function financeiro_suspensao_candidatos() returns jsonb
  language sql stable security invoker set search_path = public as $$
  with ts as (
    select t.cliente_id, t.vencimento,
      (t.valor - coalesce((select sum(valor_recebido) from baixa where titulo_id = t.id and estornada = false), 0)) as saldo
    from titulo t
    where t.status <> 'CANCELADO' and t.tipo = 'RECEBER' and t.cliente_id is not null
  ),
  venc as (
    select cliente_id,
           sum(saldo) as saldo_devedor,
           max((current_date - vencimento)) as dias_atraso
    from ts
    where vencimento < current_date and saldo > 0
    group by cliente_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'cliente_id', c.id,
    'cliente', c.razao_social,
    'saldo_devedor', coalesce(v.saldo_devedor, 0),
    'dias_atraso', coalesce(v.dias_atraso, 0),
    'suspenso', c.suspenso
  ) order by coalesce(v.saldo_devedor, 0) desc), '[]'::jsonb)
  from clientes c
  left join venc v on v.cliente_id = c.id
  where c.suspenso or v.cliente_id is not null;
$$;
revoke all on function financeiro_suspensao_candidatos() from public;
grant execute on function financeiro_suspensao_candidatos() to authenticated;
