-- Plano comercial da INSTÂNCIA (modelo instância-por-cliente): define quais módulos ficam
-- visíveis/acessíveis. Cumulativo — contratos < relacionamento < financeiro < contabil < enterprise.
-- Default 'contabil' para NÃO esconder nada da instância atual (ELEVARE usa o conjunto fiscal).
-- A validação do valor mora no código (lib/planos); aqui é só o armazenamento.
alter table escritorio_config add column if not exists plano text not null default 'contabil';
