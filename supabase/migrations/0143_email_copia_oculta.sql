-- Cópia oculta de arquivo: endereço que recebe, em Bcc, toda mensagem enviada pelo sistema.
-- Configurável (e não embutido no código) porque cada escritório tem o seu — ou nenhum.
alter table email_config add column if not exists copia_oculta text;

comment on column email_config.copia_oculta is
  'Endereço em cópia oculta (Bcc) de todo e-mail enviado pelo sistema. Nulo = ninguém.';
