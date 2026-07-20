-- Aprovação de pagamento com alçada.
alter table titulo add column if not exists aprovacao text check (aprovacao in ('pendente','aprovado'));
alter table titulo add column if not exists aprovado_por uuid references usuarios(id);
alter table titulo add column if not exists aprovado_em timestamptz;
alter table escritorio_config add column if not exists alcada_pagamento numeric(15,2);  -- null = sem alçada
