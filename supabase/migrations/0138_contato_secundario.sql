-- Segundo e-mail e segundo telefone por cliente, com escolha independente de quais entram nos
-- envios (honorários, comunicados, régua). Permite enviar para o principal, o 2º, ou ambos —
-- inclusive só o 2º (desligando o principal). Defaults preservam o comportamento atual:
-- principal ligado, secundário desligado.
alter table clientes add column if not exists email_2 text;
alter table clientes add column if not exists telefone_2 text;
alter table clientes add column if not exists telefone_ddi_2 text default '55';
-- Anuláveis de propósito: o payload de gravação manda null quando o campo não vem no form/API;
-- o helper de envio trata null como o default (principal=on, 2º=off), então null não muda o
-- comportamento. O default abaixo já popula as linhas existentes.
alter table clientes add column if not exists email_envio boolean default true;
alter table clientes add column if not exists email_2_envio boolean default false;
alter table clientes add column if not exists whatsapp_envio boolean default true;
alter table clientes add column if not exists whatsapp_2_envio boolean default false;
