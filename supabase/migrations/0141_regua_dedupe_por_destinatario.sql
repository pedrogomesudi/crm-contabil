-- A régua passa a alcançar o 2º contato do cliente (email_2 / telefone_2, da 0138). Para isso a
-- trava contra duplicidade precisa deixar de ser "uma mensagem por etapa" e virar "uma mensagem
-- por etapa POR DESTINATÁRIO" — senão o segundo envio da mesma etapa é barrado pelo índice.
--
-- A garantia que importa continua de pé: duas execuções do cron na mesma etapa não mandam a
-- mesma cobrança duas vezes para o mesmo destinatário. Só o escopo da chave muda.
--
-- Seguro nos dados existentes: hoje há no máximo uma linha por (titulo_id, etapa_id), então
-- acrescentar o destinatário à chave não pode violar unicidade.
drop index if exists uq_wa_msg_titulo_etapa;
create unique index if not exists uq_wa_msg_titulo_etapa_destino
  on whatsapp_mensagem (titulo_id, etapa_id, telefone)
  where etapa_id is not null;

-- Mesma troca no e-mail: a 0090 criou uq_email_msg_titulo_etapa espelhando o do WhatsApp.
drop index if exists uq_email_msg_titulo_etapa;
create unique index if not exists uq_email_msg_titulo_etapa_destino
  on email_mensagem (titulo_id, etapa_id, para)
  where etapa_id is not null;
