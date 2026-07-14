-- V9.1 — Régua de cobrança por e-mail (RF-051, fatia B): e-mail como fallback do WhatsApp.
alter table regua_etapa add column if not exists email_assunto text;
alter table regua_etapa add column if not exists email_corpo text;

-- Opt-out por canal. Nasce ligado: quem não quiser e-mail desliga aqui.
-- ATENÇÃO (mudança de comportamento): a partir daqui, cobranca_whatsapp = false significa
-- apenas "não me cobre por WhatsApp" — o e-mail assume. Antes, silenciava o cliente por completo.
alter table clientes_financeiro add column if not exists cobranca_email boolean not null default true;

-- Interruptor do escritório: desliga o canal sem mexer nas etapas.
alter table email_config add column if not exists regua_email_fallback boolean not null default true;

-- Dedupe do e-mail por etapa — espelha uq_wa_msg_titulo_etapa.
alter table email_mensagem add column if not exists etapa_id uuid references regua_etapa(id) on delete set null;
create unique index if not exists uq_email_msg_titulo_etapa
  on email_mensagem(titulo_id, etapa_id) where etapa_id is not null;
