-- Fatia B (mídia): mensagem pode ser texto OU mídia (com legenda no texto).
alter table whatsapp_mensagem add column if not exists midia_tipo text;   -- 'image' | 'audio' | 'document'
alter table whatsapp_mensagem add column if not exists midia_path text;   -- caminho no bucket 'documentos'
alter table whatsapp_mensagem add column if not exists midia_nome text;   -- nome do arquivo (document)
alter table whatsapp_mensagem add column if not exists midia_mime text;   -- content-type
