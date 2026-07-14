-- V9 — E-mail integrado (RF-051). Credenciais cifradas na app (EMAIL_CRIPTO_KEY).
do $$ begin create type email_provedor as enum ('smtp','api');
exception when duplicate_object then null; end $$;
do $$ begin create type email_api_provedor as enum ('resend','sendgrid');
exception when duplicate_object then null; end $$;
do $$ begin create type email_status as enum ('ENVIADO','ERRO');
exception when duplicate_object then null; end $$;

create table if not exists email_config (
  id smallint primary key default 1 check (id = 1),
  provedor email_provedor,
  remetente_nome text,
  remetente_email text,
  smtp_host text,
  smtp_porta int,
  smtp_seguro boolean not null default true,
  smtp_usuario text,
  smtp_senha_cifrada text,
  api_provedor email_api_provedor,
  api_chave_cifrada text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
insert into email_config (id) values (1) on conflict (id) do nothing;

create table if not exists email_template (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  assunto text not null,
  corpo text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists email_mensagem (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete set null,
  titulo_id uuid references titulo(id) on delete set null,
  para text not null,
  assunto text not null,
  corpo text not null,
  anexos jsonb not null default '[]'::jsonb,
  status email_status not null,
  erro text,
  enviado_por uuid references usuarios(id),
  criado_em timestamptz not null default now()
);
create index if not exists ix_email_msg_cliente on email_mensagem (cliente_id, criado_em desc);

alter table email_config enable row level security;
alter table email_template enable row level security;
alter table email_mensagem enable row level security;

-- config: só admin (custódia de credencial — mesma regra da NFS-e e do WhatsApp)
do $$ begin
  drop policy if exists email_config_admin on email_config;
  create policy email_config_admin on email_config for all to authenticated
    using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
end $$;

-- templates: a equipe lê; admin/assistente escrevem
do $$ begin
  drop policy if exists email_tpl_sel on email_template;
  create policy email_tpl_sel on email_template for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists email_tpl_write on email_template;
  create policy email_tpl_write on email_template for all to authenticated
    using (auth_papel() in ('admin','assistente'))
    with check (auth_papel() in ('admin','assistente'));
end $$;

-- histórico: admin/assistente/financeiro tudo; contador só dos seus clientes.
-- Sem policy de INSERT/UPDATE: só o servidor (service_role) grava, depois de enviar —
-- assim ninguém forja um "enviado" que nunca saiu.
do $$ begin
  drop policy if exists email_msg_sel on email_mensagem;
  create policy email_msg_sel on email_mensagem for select to authenticated using (
    auth_papel() in ('admin','assistente','financeiro')
    or (auth_papel() = 'contador' and exists (
      select 1 from clientes c where c.id = email_mensagem.cliente_id and c.contador_id = auth.uid()))
  );
end $$;
