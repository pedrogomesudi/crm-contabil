-- V7.2 — Régua de cobrança: etapas configuráveis, opt-out, idempotência, toggle.
create table if not exists regua_etapa (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  dias_offset int not null,       -- negativo = antes do vencimento; positivo = depois
  template text not null,
  ordem int not null default 0,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
-- Só uma etapa ATIVA por deslocamento (evita ambiguidade no mesmo dia).
create unique index if not exists uq_regua_etapa_offset on regua_etapa(dias_offset) where ativa;

-- Seed padrão (idempotente por nome).
insert into regua_etapa (nome, dias_offset, template, ordem) values
  ('Lembrete D-3', -3, 'Olá {nome}! Seu honorário de {valor} vence em {vencimento} (em 3 dias). Qualquer dúvida, estamos à disposição.', 1),
  ('Cobrança D+1', 1, 'Olá {nome}! Consta em aberto o valor de {valor}, vencido em {vencimento} ({dias} dia(s) de atraso). Se já pagou, desconsidere.', 2),
  ('Cobrança D+7', 7, 'Olá {nome}! O valor de {valor} segue em aberto desde {vencimento} ({dias} dias de atraso). Podemos ajudar a regularizar?', 3),
  ('Cobrança D+15', 15, 'Olá {nome}! Última régua: {valor} vencido em {vencimento} ({dias} dias). Entre em contato para evitarmos medidas de cobrança.', 4)
on conflict do nothing;

-- Opt-out por cliente (default: participa da régua).
alter table clientes_financeiro add column if not exists cobranca_whatsapp boolean not null default true;

-- Idempotência: liga o histórico à etapa; 1 envio por (título, etapa).
alter table whatsapp_mensagem add column if not exists etapa_id uuid references regua_etapa(id) on delete set null;
create unique index if not exists uq_wa_msg_titulo_etapa on whatsapp_mensagem(titulo_id, etapa_id) where etapa_id is not null;

-- Toggle da régua automática.
alter table whatsapp_config add column if not exists regua_ativa boolean not null default false;

-- RLS de regua_etapa (admin/financeiro).
alter table regua_etapa enable row level security;
do $$ begin
  drop policy if exists regua_etapa_all on regua_etapa;
  create policy regua_etapa_all on regua_etapa for all to authenticated
    using (auth_papel() in ('admin','financeiro')) with check (auth_papel() in ('admin','financeiro'));
end $$;
