-- Bucket privado de documentos
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

-- Leitura defensiva: authenticated só lê objeto cujo caminho está vinculado a um
-- documento visível (a RLS de `documentos`/`clientes` faz o filtro real).
-- Sem policies de insert/update/delete para authenticated => escrita só via service_role.
create policy storage_documentos_select on storage.objects for select to authenticated using (
  bucket_id = 'documentos'
  and exists (select 1 from documentos d where d.caminho_storage = name)
);
