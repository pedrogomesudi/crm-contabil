-- Observabilidade Fatia A: registro de erros server-side capturados pelo onRequestError do Next.
-- Escrita via service_role (o hook roda fora da sessão do usuário); leitura só admin.
create table if not exists evento_erro (
  id         uuid primary key default gen_random_uuid(),
  criado_em  timestamptz not null default now(),
  mensagem   text not null,
  rota       text,
  metodo     text,
  digest     text,
  tipo_rota  text,
  stack      text,
  contexto   jsonb
);
create index if not exists idx_evento_erro_criado on evento_erro(criado_em desc);
alter table evento_erro enable row level security;
drop policy if exists evento_erro_sel on evento_erro;
create policy evento_erro_sel on evento_erro for select to authenticated using (auth_papel() = 'admin');
