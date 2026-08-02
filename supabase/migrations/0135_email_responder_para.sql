-- "Responder para" (reply-to) no e-mail do escritório. Permite enviar de um domínio
-- verificado (ex.: contato@seusaldo.ai, com o NOME do escritório no remetente) e ainda
-- assim receber as respostas na caixa real do escritório — sem verificar o domínio de
-- cada cliente. Nulo = comporta-se como hoje (resposta vai para o próprio remetente).
alter table email_config add column if not exists responder_para text;
