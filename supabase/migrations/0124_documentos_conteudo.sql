-- RF-061: busca no conteúdo de PDFs digitais.
alter table documentos add column if not exists texto_extraido text;
alter table documentos add column if not exists texto_status text; -- null=pendente | 'ok' | 'vazio' | 'erro'
-- Coluna gerada: o app só escreve texto_extraido; o tsvector se deriva sozinho.
-- to_tsvector(regconfig_constante, text) é IMMUTABLE, então pode ser usada em coluna gerada.
alter table documentos
  add column if not exists conteudo tsvector
  generated always as (to_tsvector('portuguese', coalesce(texto_extraido, ''))) stored;
create index if not exists idx_documentos_conteudo on documentos using gin(conteudo);
