-- Conciliação Fatia B: origem de receita avulsa + marcador de conciliação na baixa.
alter type titulo_origem add value if not exists 'RECEITA_AVULSA';
alter table baixa add column if not exists conciliado_em date;
