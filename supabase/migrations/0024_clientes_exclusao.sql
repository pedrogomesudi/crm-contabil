-- Soft delete de clientes: excluido_em nulo = cliente normal; preenchido = excluído.
-- Coluna dedicada (não novo valor de enum) para não colidir com status ativo/inativo
-- e evitar o pitfall de ALTER TYPE ADD VALUE em transação.
alter table clientes add column if not exists excluido_em timestamptz;

-- Apoia o filtro padrão da lista (excluido_em is null).
create index if not exists idx_clientes_excluido_em on clientes (excluido_em);
