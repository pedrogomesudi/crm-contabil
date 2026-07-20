-- Cobrança avulsa: a unique index uq_titulo_honorario (uma por cliente/competência/origem
-- quando não há contrato) foi pensada para MENSALIDADE/13º — garante uma mensalidade por mês.
-- Ela estava pegando também RECEITA_AVULSA, impedindo mais de uma cobrança avulsa por
-- cliente no mesmo mês. Recria o índice excluindo a receita avulsa da unicidade.
drop index if exists uq_titulo_honorario;
create unique index if not exists uq_titulo_honorario
  on titulo (cliente_id, competencia, origem)
  where (contrato_id is null and origem <> 'RECEITA_AVULSA');
