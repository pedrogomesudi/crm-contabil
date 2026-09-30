-- O papel 'financeiro' é quem opera contas a receber (titulo é legível por admin/financeiro,
-- ver 0028), mas a 0137 deixou grupo_cobranca legível só por admin/assistente/contador. Com
-- isso o nome do grupo vinha nulo para o financeiro e o filtro por grupo de empresas na tela
-- de contas a receber sumia justamente para quem mais o usa. Leitura apenas — a escrita
-- (criar/renomear grupo, mover membro) continua com admin/assistente.
drop policy if exists grupo_cobranca_read on grupo_cobranca;
create policy grupo_cobranca_read on grupo_cobranca for select
  using (auth_papel() in ('admin','assistente','contador','financeiro'));
