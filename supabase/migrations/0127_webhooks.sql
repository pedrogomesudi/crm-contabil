-- RF-080 (Fatia D): webhooks de saída — endpoints do cliente + outbox de entregas.
create table if not exists webhook_endpoint (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  secret text not null,                 -- chave HMAC (compartilhada com o consumidor)
  eventos text[] not null default '{}', -- ex.: {'titulo.pago','obrigacao.entregue'}
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists webhook_entrega (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references webhook_endpoint(id) on delete cascade,
  evento text not null,
  payload jsonb not null,
  status text not null default 'pendente', -- 'pendente' | 'ok' | 'falhou'
  tentativas int not null default 0,
  proximo_retry timestamptz not null default now(),
  criado_em timestamptz not null default now()
);
create index if not exists ix_webhook_entrega_fila on webhook_entrega(proximo_retry) where status = 'pendente';

alter table webhook_endpoint enable row level security;
drop policy if exists webhook_endpoint_admin on webhook_endpoint;
create policy webhook_endpoint_admin on webhook_endpoint for all
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');

alter table webhook_entrega enable row level security;
drop policy if exists webhook_entrega_admin on webhook_entrega;
create policy webhook_entrega_admin on webhook_entrega for all
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
