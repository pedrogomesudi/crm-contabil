-- Curadoria da matriz (Fatia A): a obrigação passa a carregar a norma que a fundamenta e a
-- data em que gente conferiu. Sem isso não há como auditar se um prazo ainda vale — e a
-- matriz é de onde sai o calendário de todo cliente.
alter table obrigacao add column if not exists base_legal text;
alter table obrigacao add column if not exists fonte_url text;
-- Para o caso em que a norma NÃO é exatamente representável no modelo de vencimento.
-- Ex.: EFD-Contribuições vence no 10º dia útil do 2º mês; aqui só cabe "dia fixo".
alter table obrigacao add column if not exists observacao_curadoria text;
alter table obrigacao add column if not exists revisada_em date;
alter table obrigacao add column if not exists revisada_por uuid references usuarios(id);

-- Sem valor padrão em revisada_em de propósito: nenhuma linha existente foi conferida por um
-- contador dentro deste sistema, e preenchê-la aqui fabricaria uma garantia que não houve.
