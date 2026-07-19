-- RF-060 (Fatia B): versionamento de documentos.
alter table documentos add column if not exists substitui_id uuid references documentos(id) on delete set null;
create index if not exists idx_documentos_substitui on documentos(substitui_id);
