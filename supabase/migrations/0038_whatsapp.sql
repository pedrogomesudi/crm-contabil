-- V7.1 — Config e histórico de WhatsApp (Z-API). Credenciais cifradas na app.
do $$ begin create type whatsapp_status as enum ('ENVIADO','ERRO');
exception when duplicate_object then null; end $$;

create table if not exists whatsapp_config (
  id smallint primary key default 1 check (id = 1),
  instance text,
  token_cifrado text,
  client_token_cifrado text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
insert into whatsapp_config (id) values (1) on conflict (id) do nothing;

create table if not exists whatsapp_mensagem (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete set null,
  titulo_id uuid references titulo(id) on delete set null,
  telefone text not null,
  texto text not null,
  status whatsapp_status not null,
  resposta jsonb,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id)
);
create index if not exists idx_wa_msg_cliente on whatsapp_mensagem(cliente_id);

alter table whatsapp_config enable row level security;
alter table whatsapp_mensagem enable row level security;

-- config: só admin (mesma regra da config NFS-e)
do $$ begin
  drop policy if exists wa_config_admin on whatsapp_config;
  create policy wa_config_admin on whatsapp_config for all to authenticated
    using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
end $$;

-- histórico: admin/financeiro tudo; contador só dos seus clientes; assistente nada
do $$ begin
  drop policy if exists wa_msg_select on whatsapp_mensagem;
  create policy wa_msg_select on whatsapp_mensagem for select to authenticated using (
    auth_papel() in ('admin','financeiro')
    or (auth_papel() = 'contador' and exists (select 1 from clientes c where c.id = whatsapp_mensagem.cliente_id and c.contador_id = auth.uid()))
  );
  drop policy if exists wa_msg_write on whatsapp_mensagem;
  create policy wa_msg_write on whatsapp_mensagem for all to authenticated
    using (auth_papel() in ('admin','financeiro','contador'))
    with check (auth_papel() in ('admin','financeiro','contador'));
end $$;
