-- DDI (código do país) do telefone do cliente, para o envio de WhatsApp funcionar fora do Brasil.
-- Aditivo: o número local segue em `telefone`, formato inalterado. O default '55' faz todo cliente
-- existente já ficar correto — sem migração de dados. O nono dígito brasileiro (em chaveTelefone)
-- passa a rodar só quando telefone_ddi = '55'.
alter table clientes add column if not exists telefone_ddi text not null default '55';
