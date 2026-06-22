-- Honorário isolado em tabela 1:1 separada. Assim o Assistente faz SELECT normal
-- em `clientes` (inclusive select *) sem nunca tocar no dado sensível.
create table clientes_financeiro (
  cliente_id uuid primary key references clientes(id) on delete cascade,
  honorario_mensal numeric(12, 2),
  atualizado_por uuid references usuarios(id),
  atualizado_em timestamptz not null default now()
);

alter table clientes_financeiro enable row level security;

-- Assistente NÃO tem policy aqui => não lê nem grava.
create policy fin_select on clientes_financeiro for select to authenticated using (
  auth_papel() in ('admin', 'financeiro')
  or (auth_papel() = 'contador'
      and exists (select 1 from clientes c
                  where c.id = cliente_id and c.contador_id = auth.uid()))
);
create policy fin_insert on clientes_financeiro for insert to authenticated with check (
  auth_papel() in ('admin', 'financeiro')
  or (auth_papel() = 'contador'
      and exists (select 1 from clientes c
                  where c.id = cliente_id and c.contador_id = auth.uid()))
);
create policy fin_update on clientes_financeiro for update to authenticated using (
  auth_papel() in ('admin', 'financeiro')
  or (auth_papel() = 'contador'
      and exists (select 1 from clientes c
                  where c.id = cliente_id and c.contador_id = auth.uid()))
) with check (
  auth_papel() in ('admin', 'financeiro')
  or (auth_papel() = 'contador'
      and exists (select 1 from clientes c
                  where c.id = cliente_id and c.contador_id = auth.uid()))
);
