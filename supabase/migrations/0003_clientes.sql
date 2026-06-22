create table clientes (
  id uuid primary key default gen_random_uuid(),
  tipo_pessoa tipo_pessoa not null,
  razao_social text not null,
  nome_fantasia text,
  cpf_cnpj text not null unique,
  regime_tributario regime_tributario not null,
  inscricao_estadual text,
  inscricao_municipal text,
  email text,
  telefone text,
  endereco jsonb,
  responsavel_nome text,
  contador_id uuid references usuarios(id),
  status status_cliente not null default 'ativo',
  data_inicio date,
  observacoes text,
  criado_por uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- Coerência tipo x regime (spec §7)
  constraint chk_tipo_regime check (
    (tipo_pessoa = 'MEI' and regime_tributario = 'MEI') or
    (tipo_pessoa = 'PF'  and regime_tributario = 'Isento/PF') or
    (tipo_pessoa = 'PJ'  and regime_tributario in ('Simples', 'Presumido', 'Real'))
  )
);

alter table clientes enable row level security;

-- SELECT: admin/financeiro/assistente veem todos; contador só os seus
create policy clientes_select on clientes for select to authenticated using (
  auth_papel() in ('admin', 'financeiro', 'assistente')
  or (auth_papel() = 'contador' and contador_id = auth.uid())
);

-- INSERT: admin/assistente/contador podem criar (financeiro é leitura de cadastrais)
create policy clientes_insert on clientes for insert to authenticated with check (
  auth_papel() in ('admin', 'assistente', 'contador')
);

-- UPDATE: admin/assistente todos; contador só os seus
create policy clientes_update on clientes for update to authenticated using (
  auth_papel() in ('admin', 'assistente')
  or (auth_papel() = 'contador' and contador_id = auth.uid())
) with check (
  auth_papel() in ('admin', 'assistente')
  or (auth_papel() = 'contador' and contador_id = auth.uid())
);

-- DELETE (eliminação definitiva): apenas admin
create policy clientes_delete on clientes for delete to authenticated using (
  auth_papel() = 'admin'
);

-- atualizado_em automático
create function set_atualizado_em() returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;
create trigger trg_clientes_atualizado_em
  before update on clientes for each row execute function set_atualizado_em();
