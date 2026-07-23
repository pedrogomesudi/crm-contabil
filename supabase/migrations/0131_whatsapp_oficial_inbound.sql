-- WhatsApp oficial Sub-projeto 2: credenciais do webhook de entrada (Cloud API).
alter table whatsapp_config add column if not exists oficial_app_secret_cifrado text;
alter table whatsapp_config add column if not exists oficial_verify_token text;
