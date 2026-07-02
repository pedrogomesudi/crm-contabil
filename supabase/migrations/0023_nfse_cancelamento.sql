-- Cancelamento de NFS-e (evento). Idempotente.
alter table nfse add column if not exists cancelado_em timestamptz;
alter table nfse add column if not exists cancelamento jsonb; -- { cMotivo, xMotivo, idEvento, xml }
