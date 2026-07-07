-- {VALOR} passa a sair sem "R$" (para casar com "R$ {valor}" no texto); ajusta o default.
alter table dados_bancarios alter column mensagem_template set default
  'Olá {nome}! Segue a sua nota fiscal de serviços (NFS-e), referente ao honorário de R$ {valor} — competência {competencia}.\n\nPara pagamento:\n{pagamento}\n\nSe já efetuou o pagamento, por favor desconsidere. Qualquer dúvida, estamos à disposição!';
