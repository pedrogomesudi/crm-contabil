-- WhatsApp oficial Sub-projeto 1: escolha de provedor por escritório + credenciais da API oficial.
alter table whatsapp_config add column if not exists provedor text not null default 'zapi'
  check (provedor in ('zapi','oficial'));
alter table whatsapp_config add column if not exists oficial_phone_number_id text;
alter table whatsapp_config add column if not exists oficial_token_cifrado text;
