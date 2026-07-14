-- Portal do cliente (RF-052): novo papel. Isolado numa migration própria porque um
-- valor de enum recém-criado não pode ser USADO na mesma transação (as policies que o
-- referenciam vêm na 0085, já em outro arquivo/transação).
alter type papel add value if not exists 'cliente';
