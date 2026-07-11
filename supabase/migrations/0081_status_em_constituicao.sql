-- Empresa em constituição — novo status. Isolado numa migration própria porque
-- um valor de enum recém-criado não pode ser USADO na mesma transação (a constraint
-- que o referencia vem na 0082, já em outra transação/arquivo).
alter type status_cliente add value if not exists 'em_constituicao';
