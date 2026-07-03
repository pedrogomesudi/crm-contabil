-- V5-B: NFS-e dos clientes (multi-emitente). Idempotente.

-- Config fiscal por cliente-emitente (identidade CNPJ/IM/razão/endereço vem de clientes).
create table if not exists nfse_emitente (
  cliente_id uuid primary key references clientes(id) on delete cascade,
  codigo_municipio text,
  item_lc116 text,
  codigo_servico_nacional text,
  codigo_tributacao_municipal text,
  aliquota_iss numeric,
  pct_trib_sn numeric,
  simples_nacional boolean not null default true,
  natureza_operacao text,
  descricao_servico_padrao text,
  serie text not null default '1',
  proximo_ndps bigint not null default 1,
  ambiente text not null default 'homologacao',
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

-- Certificado A1 por cliente (cifrado, mesma NFSE_CERT_KEY da V5-A).
create table if not exists nfse_certificado_cliente (
  cliente_id uuid primary key references clientes(id) on delete cascade,
  nome_arquivo text,
  pfx_cifrado text,
  senha_cifrada text,
  validade timestamptz,
  atualizado_em timestamptz not null default now()
);

-- Distingue emissão do escritório (V5-A) x do cliente (V5-B); snapshot do tomador externo.
alter table nfse add column if not exists emitente text not null default 'escritorio'
  check (emitente in ('escritorio','cliente'));
alter table nfse add column if not exists tomador_documento text;
alter table nfse add column if not exists tomador_razao_social text;
alter table nfse add column if not exists tomador_endereco jsonb;
alter table nfse add column if not exists descricao_servico text;

alter table nfse_emitente enable row level security;
alter table nfse_certificado_cliente enable row level security;

-- Config e certificado do cliente-emitente: só admin (dado fiscal sensível).
drop policy if exists nfse_emitente_admin on nfse_emitente;
create policy nfse_emitente_admin on nfse_emitente for all to authenticated
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
drop policy if exists nfse_cert_cliente_admin on nfse_certificado_cliente;
create policy nfse_cert_cliente_admin on nfse_certificado_cliente for all to authenticated
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');

-- Numeração de DPS por cliente (atômica; evita reuso — erro E0014).
create or replace function proximo_ndps_cliente(p_cliente_id uuid) returns bigint
  language plpgsql security definer set search_path = pg_catalog, public as $$
declare n bigint;
begin
  update nfse_emitente set proximo_ndps = proximo_ndps + 1
    where cliente_id = p_cliente_id
    returning proximo_ndps - 1 into n;
  if n is null then raise exception 'emitente nao configurado'; end if;
  return n;
end; $$;
grant execute on function proximo_ndps_cliente(uuid) to authenticated;
