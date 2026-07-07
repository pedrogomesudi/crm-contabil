-- Metadados por conversa (derivada de whatsapp_mensagem por telefone).
-- Fatia A: apenas o marcador de favorito. Extensível na Fatia C (status/atendente).
create table if not exists conversa (
  telefone   text primary key,
  favorita   boolean not null default false,
  criado_em  timestamptz not null default now()
);
alter table conversa enable row level security;

do $$ begin
  drop policy if exists conversa_all on conversa;
  create policy conversa_all on conversa for all to authenticated
    using (auth_papel() in ('admin','financeiro','contador'))
    with check (auth_papel() in ('admin','financeiro','contador'));
end $$;
