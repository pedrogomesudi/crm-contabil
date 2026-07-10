-- SALARIO_MINIMO no enum de índice de reajuste. ISOLADO: ADD VALUE não pode conviver com o uso do
-- valor na mesma transação. O runner (db-migrate.mjs) commita por arquivo, então a 0075 já o enxerga.
alter type indice_reajuste add value if not exists 'SALARIO_MINIMO';
