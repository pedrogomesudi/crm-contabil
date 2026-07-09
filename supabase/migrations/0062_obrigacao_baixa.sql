-- Obrigações Fatia 2: comprovante configurável + entrega (quem/quando). Status "entregue" é derivado
-- de entregue_em IS NOT NULL — sem alterar o enum (o runner roda em transação).
alter table obrigacao add column if not exists comprovante_obrigatorio boolean not null default true;
alter table obrigacao_instancia add column if not exists comprovante_path text;
alter table obrigacao_instancia add column if not exists entregue_em date;
alter table obrigacao_instancia add column if not exists entregue_por uuid references usuarios(id);
alter table obrigacao_instancia add column if not exists observacao text;
