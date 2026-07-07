-- Fatia C: estado e responsável da conversa.
alter table conversa add column if not exists status text not null default 'aberta';   -- 'aberta' | 'pendente' | 'finalizada'
alter table conversa add column if not exists atendente_id uuid references usuarios(id);
