-- Vencimentos: certificados digitais e procurações, com alertas escalonados. Idempotente.

do $$ begin
  create type certificado_tipo as enum ('A1','A3');
exception when duplicate_object then null; end $$;

create table if not exists certificado_digital (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  tipo certificado_tipo not null,
  titular text not null,
  documento_titular text,
  emissao date,
  validade date not null,
  observacao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
create index if not exists certificado_digital_cliente_idx on certificado_digital (cliente_id);
create index if not exists certificado_digital_validade_idx on certificado_digital (validade) where ativo;

create table if not exists procuracao (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  orgao text not null,
  outorgante text not null,
  outorgado text,
  inicio date,
  validade date not null,
  observacao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
create index if not exists procuracao_cliente_idx on procuracao (cliente_id);
create index if not exists procuracao_validade_idx on procuracao (validade) where ativo;

-- Visibilidade: admin/assistente veem todos; contador só os seus. Financeiro fica de fora
-- (certificado e procuração não são dado financeiro) — a política nasce fechada, sem depender
-- do gate da tela, ao contrário de obrigacao_instancia.
create or replace function pode_ver_vencimento(p_cliente_id uuid) returns boolean
  language sql stable security invoker set search_path = pg_catalog, public as $$
  select auth_papel() in ('admin','assistente')
      or (auth_papel() = 'contador'
          and exists (select 1 from clientes c where c.id = p_cliente_id and c.contador_id = auth.uid()));
$$;

alter table certificado_digital enable row level security;
alter table procuracao enable row level security;

drop policy if exists cert_dig_sel on certificado_digital;
create policy cert_dig_sel on certificado_digital for select to authenticated
  using (pode_ver_vencimento(cliente_id));
drop policy if exists cert_dig_ins on certificado_digital;
create policy cert_dig_ins on certificado_digital for insert to authenticated
  with check (pode_ver_vencimento(cliente_id));
drop policy if exists cert_dig_upd on certificado_digital;
create policy cert_dig_upd on certificado_digital for update to authenticated
  using (pode_ver_vencimento(cliente_id)) with check (pode_ver_vencimento(cliente_id));
drop policy if exists cert_dig_del on certificado_digital;
create policy cert_dig_del on certificado_digital for delete to authenticated
  using (pode_ver_vencimento(cliente_id));

drop policy if exists procuracao_sel on procuracao;
create policy procuracao_sel on procuracao for select to authenticated
  using (pode_ver_vencimento(cliente_id));
drop policy if exists procuracao_ins on procuracao;
create policy procuracao_ins on procuracao for insert to authenticated
  with check (pode_ver_vencimento(cliente_id));
drop policy if exists procuracao_upd on procuracao;
create policy procuracao_upd on procuracao for update to authenticated
  using (pode_ver_vencimento(cliente_id)) with check (pode_ver_vencimento(cliente_id));
drop policy if exists procuracao_del on procuracao;
create policy procuracao_del on procuracao for delete to authenticated
  using (pode_ver_vencimento(cliente_id));

-- Autoria não-forjável (padrão do projeto).
create or replace function vencimento_integridade() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := auth.uid();
    new.atualizado_por := auth.uid();
  else
    new.criado_por := old.criado_por;
    new.atualizado_por := auth.uid();
    new.atualizado_em := now();
  end if;
  return new;
end; $$;

drop trigger if exists trg_cert_dig_integridade on certificado_digital;
create trigger trg_cert_dig_integridade before insert or update on certificado_digital
  for each row execute function vencimento_integridade();
drop trigger if exists trg_procuracao_integridade on procuracao;
create trigger trg_procuracao_integridade before insert or update on procuracao
  for each row execute function vencimento_integridade();

-- Expõe SÓ a data de validade dos certificados da NFS-e — nunca pfx_cifrado/senha_cifrada.
-- SECURITY DEFINER bypassa a RLS (admin-only dessas tabelas), então a regra de visibilidade
-- é replicada explicitamente aqui.
create or replace function certificados_nfse_vencimento()
  returns table (cliente_id uuid, validade timestamptz, origem text)
  language sql stable security definer set search_path = pg_catalog, public as $$
  select c.cliente_id, c.validade, 'nfse_cliente'::text
    from nfse_certificado_cliente c
    join clientes cl on cl.id = c.cliente_id
   where c.validade is not null
     and auth_papel() in ('admin','assistente','contador')
     and (auth_papel() in ('admin','assistente') or cl.contador_id = auth.uid())
  union all
  select null::uuid, n.validade, 'nfse_escritorio'::text
    from nfse_certificado n
   where n.id = 1 and n.validade is not null
     and auth_papel() in ('admin','assistente','contador');
$$;

-- Funções recebem EXECUTE de PUBLIC por padrão; para SECURITY DEFINER isso é risco.
revoke execute on function certificados_nfse_vencimento() from public;
grant execute on function certificados_nfse_vencimento() to authenticated;
