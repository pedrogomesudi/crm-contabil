-- Corrige o "nono dígito": telefones de 12 dígitos (55+DD+8, sem o 9) são normalizados para
-- a forma canônica de 13 dígitos (55+DD+9+8), unindo o histórico que estava dividido entre as
-- duas formas (a resposta do cliente às vezes chega sem o 9).

-- Mensagens: reescreve os telefones de 12 díg inserindo o 9 após o DDD.
update whatsapp_mensagem
  set telefone = '55' || substr(telefone, 3, 2) || '9' || substr(telefone, 5)
  where telefone ~ '^55[0-9]{10}$';

-- Conversas (meta: status/atendente/favorita): a chave é o telefone (PK).
-- 1) Mescla: quando já existe a versão de 13 díg (a que criamos ao enviar, com meta definida),
--    descarta a duplicata de 12 díg (criada pela resposta sem o 9).
delete from conversa c12
  where c12.telefone ~ '^55[0-9]{10}$'
    and exists (
      select 1 from conversa c13
      where c13.telefone = '55' || substr(c12.telefone, 3, 2) || '9' || substr(c12.telefone, 5)
    );
-- 2) Renomeia as remanescentes de 12 díg para a forma de 13 díg.
update conversa
  set telefone = '55' || substr(telefone, 3, 2) || '9' || substr(telefone, 5)
  where telefone ~ '^55[0-9]{10}$';
