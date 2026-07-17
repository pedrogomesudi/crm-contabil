-- Limpeza de dado: tira o DDI 55 embutido no campo `telefone`. Agora que o país vive em
-- telefone_ddi (migration 0098, default '55'), os números que foram cadastrados COM o 55 na
-- frente (ex.: 5534999663451) ficaram com o país duplicado — uma vez no DDI, outra no telefone.
--
-- A regra só toca números de 12–13 dígitos que começam com 55: nesses, o 55 é código de país
-- (número local BR tem 10–11 dígitos). Um número de 10–11 dígitos que começa com 55 é DDD 55
-- (Santa Maria/RS) — NÃO é código de país, e fica intacto.
--
-- É PURAMENTE COSMÉTICO: com telefone_ddi = '55', o normalizarTelefone recola o 55 na hora do
-- envio, então o número enviado e a chave de conversa ficam byte a byte idênticos. Nenhum envio
-- muda, nenhuma conversa existente deixa de casar.
--
-- Idempotente: depois de rodar, os alvos viram 10–11 dígitos e não casam mais o filtro.
update clientes
set telefone = substring(regexp_replace(telefone, '\D', '', 'g') from 3)
where telefone is not null
  and length(regexp_replace(telefone, '\D', '', 'g')) in (12, 13)
  and regexp_replace(telefone, '\D', '', 'g') like '55%';
