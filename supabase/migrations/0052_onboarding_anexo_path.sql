-- Fix: a coluna anexo_path faltava em onboarding_processo_item (o Ciclo A adiou o anexo e o
-- Ciclo B adicionou só anexo_nome). A ausência quebrava o SELECT do listarProcessoCliente,
-- fazendo os itens do checklist sumirem. Adiciona a coluna que faltava.
alter table onboarding_processo_item add column if not exists anexo_path text;
