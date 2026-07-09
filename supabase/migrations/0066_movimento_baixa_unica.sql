-- Conciliação: garante que uma baixa é vinculada a no máximo um movimento (fecha TOCTOU do casamento).
create unique index if not exists uq_movimento_baixa on movimento_bancario (baixa_id) where baixa_id is not null;
