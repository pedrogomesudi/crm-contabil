-- Dados do representante legal para o contrato (V3). O NOME reaproveita
-- responsavel_nome já existente. Idempotente.
alter table clientes add column if not exists representante jsonb;
