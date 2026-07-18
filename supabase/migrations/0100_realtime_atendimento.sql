-- Habilita o Supabase Realtime nas tabelas do atendimento: o Postgres passa a emitir os eventos
-- de INSERT/UPDATE pelo WebSocket. O Realtime aplica a RLS de cada tabela na entrega — a assinatura
-- só recebe o que o usuário poderia ler.
-- Idempotente: `add table` erra com duplicate_object se a tabela já está na publicação — ignoramos.
do $$ begin
  alter publication supabase_realtime add table whatsapp_mensagem;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table conversa;
exception when duplicate_object then null; end $$;
