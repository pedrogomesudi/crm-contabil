-- V6.3 — Schema de contas a pagar (usa os enums da 0033, já committados).
-- Estende titulo (RECEBER/PAGAR), despesa_recorrente, estorno na baixa, anexos. Idempotente.

-- ===== TITULO: extensão =====
alter table titulo add column if not exists tipo titulo_tipo not null default 'RECEBER';
alter table titulo add column if not exists fornecedor_id uuid references fornecedor(id);
alter table titulo add column if not exists parcela smallint;
alter table titulo add column if not exists total_parcelas smallint;
alter table titulo add column if not exists grupo_parcelamento_id uuid;
alter table titulo alter column cliente_id drop not null;
do $$ begin
  alter table titulo add constraint chk_titulo_tipo check (
    (tipo = 'RECEBER' and cliente_id is not null) or (tipo = 'PAGAR' and fornecedor_id is not null)
  );
exception when duplicate_object then null; end $$;
create unique index if not exists uq_titulo_recorrente on titulo(grupo_parcelamento_id, competencia)
  where origem = 'DESPESA_RECORRENTE';
create index if not exists idx_titulo_tipo on titulo(tipo);

-- ===== DESPESA RECORRENTE (template) =====
create table if not exists despesa_recorrente (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  fornecedor_id uuid references fornecedor(id),
  categoria_id uuid references categoria(id),
  centro_custo_id uuid references centro_custo(id),
  valor_mensal numeric(15,2) not null,
  dia_vencimento smallint not null check (dia_vencimento between 1 and 28),
  data_inicio date not null,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);

-- ===== BAIXA: estorno auditado =====
alter table baixa add column if not exists estornada boolean not null default false;
alter table baixa add column if not exists estorno_motivo text;
alter table baixa add column if not exists estorno_em timestamptz;
alter table baixa add column if not exists estorno_por uuid references usuarios(id);

create or replace function recalcular_status_titulo() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
declare v_titulo uuid; v_valor numeric; v_acresc numeric; v_baixado numeric; v_status titulo_status;
begin
  v_titulo := coalesce(new.titulo_id, old.titulo_id);
  select valor into v_valor from titulo where id = v_titulo;
  if v_valor is null then return null; end if;
  select coalesce(sum(valor_recebido),0), coalesce(sum(juros+multa),0)
    into v_baixado, v_acresc from baixa where titulo_id = v_titulo and estornada = false;
  if v_baixado <= 0 then v_status := 'ABERTO';
  elsif v_baixado >= (v_valor + v_acresc) then v_status := 'BAIXADO';
  else v_status := 'BAIXADO_PARCIAL';
  end if;
  update titulo set status = v_status, atualizado_em = now()
    where id = v_titulo and status <> 'CANCELADO';
  return null;
end $$;
drop trigger if exists trg_status_titulo on baixa;
create trigger trg_status_titulo after insert or update or delete on baixa
  for each row execute function recalcular_status_titulo();

-- ===== ANEXO =====
create table if not exists anexo_titulo (
  id uuid primary key default gen_random_uuid(),
  titulo_id uuid not null references titulo(id) on delete cascade,
  nome text not null,
  caminho_storage text not null unique,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id)
);

-- ===== RLS das novas tabelas (admin/financeiro) =====
alter table despesa_recorrente enable row level security;
alter table anexo_titulo enable row level security;
do $$ begin
  drop policy if exists desprec_all on despesa_recorrente;
  create policy desprec_all on despesa_recorrente for all to authenticated
    using (auth_papel() in ('admin','financeiro')) with check (auth_papel() in ('admin','financeiro'));
  drop policy if exists anexo_all on anexo_titulo;
  create policy anexo_all on anexo_titulo for all to authenticated
    using (auth_papel() in ('admin','financeiro')) with check (auth_papel() in ('admin','financeiro'));
end $$;
