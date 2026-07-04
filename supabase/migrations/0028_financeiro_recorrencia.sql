-- V6.2 — Motor de recorrência: contratos, títulos (contas a receber), baixas.
-- Idempotente. RLS financeira: admin/financeiro tudo; contador só os seus; assistente nada.

-- ===== ENUMS =====
do $$ begin create type contrato_status as enum ('ATIVO','SUSPENSO','ENCERRADO');
exception when duplicate_object then null; end $$;
do $$ begin create type indice_reajuste as enum ('IPCA','IGPM','INPC','PERCENTUAL_FIXO','SEM_REAJUSTE');
exception when duplicate_object then null; end $$;
do $$ begin create type titulo_origem as enum ('MENSALIDADE','DECIMO_TERCEIRO');
exception when duplicate_object then null; end $$;
do $$ begin create type titulo_status as enum ('ABERTO','VENCIDO','BAIXADO','BAIXADO_PARCIAL','CANCELADO');
exception when duplicate_object then null; end $$;
do $$ begin create type forma_pagamento as enum ('PIX','BOLETO','CARTAO','TRANSFERENCIA','DINHEIRO');
exception when duplicate_object then null; end $$;

-- ===== CONTRATO =====
create table if not exists contrato (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  descricao text not null,
  valor_mensal numeric(15,2) not null,
  dia_vencimento smallint not null check (dia_vencimento between 1 and 28),
  data_inicio date not null,
  indice_reajuste indice_reajuste not null default 'SEM_REAJUSTE',
  percentual_fixo numeric(6,3),
  mes_data_base smallint check (mes_data_base between 1 and 12),
  gera_decimo_terceiro boolean not null default false,
  mes_decimo_terceiro smallint not null default 12 check (mes_decimo_terceiro between 1 and 12),
  categoria_id uuid references categoria(id),
  centro_custo_id uuid references centro_custo(id),
  status contrato_status not null default 'ATIVO',
  data_encerramento date,
  motivo_encerramento text,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
create index if not exists idx_contrato_cliente on contrato(cliente_id);

-- ===== TITULO (conta a receber) =====
create table if not exists titulo (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  contrato_id uuid references contrato(id) on delete set null,
  origem titulo_origem not null,
  descricao text,
  valor numeric(15,2) not null,
  competencia date not null,
  vencimento date not null,
  categoria_id uuid references categoria(id),
  centro_custo_id uuid references centro_custo(id),
  status titulo_status not null default 'ABERTO',
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
-- Idempotência: 1 título por contrato/competência/origem; para o honorário (sem contrato), por cliente.
create unique index if not exists uq_titulo_contrato on titulo(contrato_id, competencia, origem) where contrato_id is not null;
create unique index if not exists uq_titulo_honorario on titulo(cliente_id, competencia, origem) where contrato_id is null;
create index if not exists idx_titulo_competencia on titulo(competencia);

-- ===== BAIXA (recebimento) =====
create table if not exists baixa (
  id uuid primary key default gen_random_uuid(),
  titulo_id uuid not null references titulo(id) on delete cascade,
  data_recebimento date not null,
  valor_recebido numeric(15,2) not null check (valor_recebido > 0),
  juros numeric(15,2) not null default 0,
  multa numeric(15,2) not null default 0,
  desconto numeric(15,2) not null default 0,
  conta_bancaria_id uuid not null references conta_bancaria(id),
  forma_pagamento forma_pagamento not null,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id)
);
create index if not exists idx_baixa_titulo on baixa(titulo_id);

-- ===== CONFIG (flag de automação) =====
create table if not exists financeiro_config (
  id smallint primary key default 1 check (id = 1),
  geracao_automatica boolean not null default false,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
insert into financeiro_config (id) values (1) on conflict (id) do nothing;

-- ===== RLS =====
alter table contrato enable row level security;
alter table titulo   enable row level security;
alter table baixa    enable row level security;
alter table financeiro_config enable row level security;

do $$ begin
  drop policy if exists contrato_all on contrato;
  create policy contrato_all on contrato for all to authenticated
    using (
      auth_papel() in ('admin','financeiro')
      or (auth_papel() = 'contador' and exists (select 1 from clientes c where c.id = contrato.cliente_id and c.contador_id = auth.uid()))
    )
    with check (
      auth_papel() in ('admin','financeiro')
      or (auth_papel() = 'contador' and exists (select 1 from clientes c where c.id = contrato.cliente_id and c.contador_id = auth.uid()))
    );
end $$;

do $$ begin
  drop policy if exists titulo_select on titulo;
  create policy titulo_select on titulo for select to authenticated using (
    auth_papel() in ('admin','financeiro')
    or (auth_papel() = 'contador' and exists (select 1 from clientes c where c.id = titulo.cliente_id and c.contador_id = auth.uid()))
  );
  drop policy if exists titulo_write on titulo;
  create policy titulo_write on titulo for all to authenticated
    using (auth_papel() in ('admin','financeiro'))
    with check (auth_papel() in ('admin','financeiro'));
end $$;

do $$ begin
  drop policy if exists baixa_select on baixa;
  create policy baixa_select on baixa for select to authenticated using (
    auth_papel() in ('admin','financeiro')
    or (auth_papel() = 'contador' and exists (
      select 1 from titulo t join clientes c on c.id = t.cliente_id
      where t.id = baixa.titulo_id and c.contador_id = auth.uid()))
  );
  drop policy if exists baixa_write on baixa;
  create policy baixa_write on baixa for all to authenticated
    using (auth_papel() in ('admin','financeiro'))
    with check (auth_papel() in ('admin','financeiro'));
end $$;

do $$ begin
  drop policy if exists fincfg_select on financeiro_config;
  create policy fincfg_select on financeiro_config for select to authenticated using (auth_papel() in ('admin','financeiro'));
  drop policy if exists fincfg_write on financeiro_config;
  create policy fincfg_write on financeiro_config for all to authenticated
    using (auth_papel() in ('admin','financeiro')) with check (auth_papel() in ('admin','financeiro'));
end $$;
