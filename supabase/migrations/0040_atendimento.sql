-- V7.3 — Atendimento: whatsapp_mensagem vira bidirecional (entrada + saída).
-- 'RECEBIDO' é só adicionado aqui; o uso ocorre na app (outra transação) — seguro.
alter type whatsapp_status add value if not exists 'RECEBIDO';

do $$ begin create type whatsapp_direcao as enum ('IN','OUT');
exception when duplicate_object then null; end $$;

alter table whatsapp_mensagem add column if not exists direcao whatsapp_direcao not null default 'OUT';
alter table whatsapp_mensagem add column if not exists lida boolean not null default true;
alter table whatsapp_mensagem add column if not exists z_message_id text;

-- dedup do webhook
create unique index if not exists uq_wa_msg_zid on whatsapp_mensagem(z_message_id) where z_message_id is not null;
-- montagem da thread por contato
create index if not exists idx_wa_msg_thread on whatsapp_mensagem(telefone, criado_em);
