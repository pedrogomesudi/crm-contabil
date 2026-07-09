-- Métricas do funil: data de fechamento (ganho/perdido) para filtrar por período.
alter table oportunidade add column if not exists fechado_em timestamptz;
update oportunidade set fechado_em = atualizado_em
  where etapa in ('ganho','perdido') and fechado_em is null;
