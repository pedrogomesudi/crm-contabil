-- Contratos/honorários vindos do Domínio. Têm valores => RLS = clientes_financeiro
-- (assistente NÃO acessa). Idempotente.
create table if not exists contratos_dominio (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  dominio_codigo text,
  tipo_contrato text,
  emissao date,
  inicio_contrato date,
  inicio_faturamento date,
  dia_vencimento text,
  encerrado_em date,
  valor_original numeric(12, 2),
  valor_atual numeric(12, 2),
  criado_em timestamptz not null default now()
);

alter table contratos_dominio enable row level security;

-- Assistente NÃO tem policy => não lê nem grava (igual a clientes_financeiro).
drop policy if exists contratos_select on contratos_dominio;
create policy contratos_select on contratos_dominio for select to authenticated using (
  auth_papel() in ('admin', 'financeiro')
  or (auth_papel() = 'contador'
      and exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid()))
);
drop policy if exists contratos_insert on contratos_dominio;
create policy contratos_insert on contratos_dominio for insert to authenticated with check (
  auth_papel() in ('admin', 'financeiro')
);
drop policy if exists contratos_update on contratos_dominio;
create policy contratos_update on contratos_dominio for update to authenticated using (
  auth_papel() in ('admin', 'financeiro')
) with check (auth_papel() in ('admin', 'financeiro'));
drop policy if exists contratos_delete on contratos_dominio;
create policy contratos_delete on contratos_dominio for delete to authenticated using (
  auth_papel() = 'admin'
);
