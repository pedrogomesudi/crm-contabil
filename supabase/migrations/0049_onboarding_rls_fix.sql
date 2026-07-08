-- Correções de segurança da RLS do onboarding (review do commit 0048):
-- (1) Isolamento por cliente: contador só enxerga/gerencia onboarding dos SEUS clientes.
--     Delega à RLS de `clientes` via EXISTS (mesmo padrão de `documentos`), em vez de só por papel.
-- (2) Auditoria não-forjável: o log de revelação de senha força `usuario_id = auth.uid()`
--     (ninguém registra acesso em nome de outro) e exige que o item pertença a um cliente visível.
do $$ begin
  drop policy if exists onboarding_item_all on onboarding_item;
  create policy onboarding_item_all on onboarding_item for all to authenticated
    using (
      auth_papel() in ('admin','contador','assistente')
      and exists (select 1 from clientes c where c.id = cliente_id)
    )
    with check (
      auth_papel() in ('admin','contador','assistente')
      and exists (select 1 from clientes c where c.id = cliente_id)
    );

  drop policy if exists onboarding_log_ins on onboarding_log_credencial;
  create policy onboarding_log_ins on onboarding_log_credencial for insert to authenticated
    with check (
      auth_papel() in ('admin','contador')
      and usuario_id = auth.uid()
      and exists (
        select 1 from onboarding_item oi join clientes c on c.id = oi.cliente_id where oi.id = item_id
      )
    );
end $$;
