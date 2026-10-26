-- A lista de Clientes passa a mostrar a situação do contrato de honorários. Duas coisas são
-- necessárias para isso funcionar para todo mundo que vê a lista.

-- 1) O papel 'financeiro' lê `clientes` (0003) mas NÃO lia `assinaturas` (0018) — a coluna nova
--    nasceria vazia justamente para quem acompanha honorários, sem nada na tela explicando.
--    Leitura apenas: criar/enviar envelope segue com admin/assistente/contador-dono.
drop policy if exists assinaturas_read on assinaturas;
create policy assinaturas_read on assinaturas for select to authenticated
  using (
    auth_papel() in ('admin', 'assistente', 'financeiro')
    or (auth_papel() = 'contador' and exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid()))
  );

-- 2) Contrato assinado em PAPEL precisa de como ser registrado, senão fica para sempre como
--    "não enviado". O tipo entra no catálogo do GED e aparece no seletor do upload; anexar o
--    PDF assinado com este tipo é o que marca o cliente como assinado na lista.
insert into tipo_documento (nome, ordem)
  select 'Contrato assinado', 1
  where not exists (select 1 from tipo_documento where lower(nome) = 'contrato assinado');
