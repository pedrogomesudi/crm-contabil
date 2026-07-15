-- V10-A: LGPD — ROPA (registro de tratamentos), histórico de consentimento, solicitações
-- do titular e parâmetro de retenção. Dado de CONFORMIDADE: RLS admin-only.
do $$ begin create type lgpd_base_legal as enum
  ('consentimento','contrato','obrigacao_legal','legitimo_interesse','protecao_credito','exercicio_direitos');
exception when duplicate_object then null; end $$;
do $$ begin create type lgpd_solic_tipo as enum ('acesso','exclusao');
exception when duplicate_object then null; end $$;
do $$ begin create type lgpd_solic_status as enum ('aberta','concluida');
exception when duplicate_object then null; end $$;

create table if not exists lgpd_tratamento (
  id uuid primary key default gen_random_uuid(),
  finalidade text not null,
  categorias text not null,
  base_legal lgpd_base_legal not null,
  retencao text,
  ativo boolean not null default true,
  ordem int not null default 0
);

create table if not exists lgpd_consentimento_evento (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete cascade,
  tipo text not null,
  concedido boolean not null,
  origem text,
  usuario_id uuid references usuarios(id),
  criado_em timestamptz not null default now()
);
create index if not exists ix_lgpd_consent_cliente on lgpd_consentimento_evento(cliente_id, criado_em desc);

create table if not exists lgpd_solicitacao_titular (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete set null,
  tipo lgpd_solic_tipo not null,
  status lgpd_solic_status not null default 'aberta',
  retido jsonb,
  anonimizado jsonb,
  criado_por uuid references usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);

alter table escritorio_config add column if not exists retencao_meses int not null default 60;
alter table escritorio_config add column if not exists lgpd_encarregado text;

alter table lgpd_tratamento enable row level security;
alter table lgpd_consentimento_evento enable row level security;
alter table lgpd_solicitacao_titular enable row level security;

do $$ begin
  drop policy if exists lgpd_trat_all on lgpd_tratamento;
  create policy lgpd_trat_all on lgpd_tratamento for all to authenticated
    using (auth_papel() = 'admin') with check (auth_papel() = 'admin');

  -- Consentimento: admin lê; NINGUÉM insere pela app (o evento é gravado por service_role,
  -- para o titular não forjar o próprio consentimento).
  drop policy if exists lgpd_consent_sel on lgpd_consentimento_evento;
  create policy lgpd_consent_sel on lgpd_consentimento_evento for select to authenticated
    using (auth_papel() = 'admin');

  drop policy if exists lgpd_solic_all on lgpd_solicitacao_titular;
  create policy lgpd_solic_all on lgpd_solicitacao_titular for all to authenticated
    using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
end $$;
