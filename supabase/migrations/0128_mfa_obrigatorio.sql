-- MFA (TOTP) Fatia B: interruptor de escritório para exigir 2FA de toda a equipe.
-- Aditiva e idempotente; a escrita já é admin-only pela RLS de escritorio_config (0076).
alter table escritorio_config add column if not exists mfa_obrigatorio boolean not null default false;
