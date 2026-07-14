-- RF-055: comunicados em massa segmentados (avisos de legislação e prazos).
do $$ begin create type comunicado_canal as enum ('email','whatsapp');
exception when duplicate_object then null; end $$;
do $$ begin create type comunicado_status as enum ('rascunho','enviando','enviado');
exception when duplicate_object then null; end $$;
do $$ begin create type comunicado_envio_status as enum ('ENVIADO','ERRO');
exception when duplicate_object then null; end $$;

create table if not exists comunicado (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,        -- nome interno; não vai ao cliente
  assunto text not null,
  corpo text not null,         -- com variáveis {nome}, {escritorio}, {hoje}...
  canal comunicado_canal not null default 'email',
  filtro jsonb not null default '{}'::jsonb,
  status comunicado_status not null default 'rascunho',
  criado_por uuid references usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);

create table if not exists comunicado_destinatario (
  id uuid primary key default gen_random_uuid(),
  comunicado_id uuid not null references comunicado(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete set null,
  para text not null,
  status comunicado_envio_status not null,
  erro text,
  criado_em timestamptz not null default now()
);
-- Idempotência: o mesmo cliente não recebe o mesmo comunicado duas vezes — nem com
-- clique duplo, nem no "reenviar falhas".
create unique index if not exists uq_comunicado_cliente
  on comunicado_destinatario(comunicado_id, cliente_id) where cliente_id is not null;

-- Opt-out de comunicados: finalidade DISTINTA da cobrança (LGPD — o cliente pode querer
-- receber a fatura e não os informativos). Fica em `clientes` (não em clientes_financeiro):
-- não é dado financeiro e toda linha de cliente existe.
alter table clientes add column if not exists aceita_comunicados boolean not null default true;

alter table comunicado enable row level security;
alter table comunicado_destinatario enable row level security;

do $$ begin
  drop policy if exists comunicado_sel on comunicado;
  create policy comunicado_sel on comunicado for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists comunicado_write on comunicado;
  create policy comunicado_write on comunicado for all to authenticated
    using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));

  -- Sem policy de INSERT/UPDATE: só o servidor (service_role) grava, depois de enviar.
  -- Ninguém forja um "enviado" que nunca saiu.
  drop policy if exists comunicado_dest_sel on comunicado_destinatario;
  create policy comunicado_dest_sel on comunicado_destinatario for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
end $$;
