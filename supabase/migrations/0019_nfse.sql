-- Emissão de NFS-e nacional (V5). Idempotente.
create table if not exists nfse_config (
  id smallint primary key default 1 check (id = 1), -- linha única
  cnpj text, inscricao_municipal text, razao_social text,
  endereco jsonb, codigo_municipio text, uf text,
  item_lc116 text, codigo_tributacao_municipal text, aliquota_iss numeric,
  natureza_operacao text, simples_nacional boolean default true,
  ambiente text not null default 'homologacao', -- homologacao|producao
  atualizado_em timestamptz not null default now()
);

create table if not exists nfse_certificado (
  id smallint primary key default 1 check (id = 1), -- linha única
  nome_arquivo text, pfx_cifrado text, senha_cifrada text,
  validade timestamptz, atualizado_em timestamptz not null default now()
);

create table if not exists nfse (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  valor numeric not null,
  competencia date not null,
  status text not null default 'processando', -- processando|autorizada|rejeitada|erro|cancelada
  chave_acesso text, numero text,
  dps_xml text, nfse_xml text, danfse_path text,
  mensagens jsonb, ambiente text not null,
  criado_por uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  autorizada_em timestamptz
);
create index if not exists nfse_cliente_idx on nfse (cliente_id, competencia);

alter table nfse_config enable row level security;
alter table nfse_certificado enable row level security;
alter table nfse enable row level security;

-- Config e certificado: só admin.
drop policy if exists nfse_config_admin on nfse_config;
create policy nfse_config_admin on nfse_config for all to authenticated
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
drop policy if exists nfse_cert_admin on nfse_certificado;
create policy nfse_cert_admin on nfse_certificado for all to authenticated
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');

-- Notas: quem vê honorário (admin/financeiro/contador-dono), espelhando a regra financeira.
drop policy if exists nfse_rw on nfse;
create policy nfse_rw on nfse for all to authenticated
  using (
    auth_papel() in ('admin', 'financeiro')
    or (auth_papel() = 'contador'
        and exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid()))
  )
  with check (
    auth_papel() in ('admin', 'financeiro')
    or (auth_papel() = 'contador'
        and exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid()))
  );

create or replace function nfse_integridade() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  if auth.uid() is not null and tg_op = 'INSERT' then new.criado_por := auth.uid(); end if;
  return new;
end; $$;
drop trigger if exists trg_nfse_integridade on nfse;
create trigger trg_nfse_integridade before insert on nfse
  for each row execute function nfse_integridade();
