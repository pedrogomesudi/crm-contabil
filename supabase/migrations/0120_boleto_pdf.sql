-- 2ª via em PDF do boleto: caminho do arquivo guardado no Storage + bucket privado.
alter table boleto add column if not exists pdf_path text;
insert into storage.buckets (id, name, public) values ('boletos', 'boletos', false)
  on conflict (id) do nothing;
