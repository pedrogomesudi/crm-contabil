-- NFS-e avulsa (serviço extra) — permite 2+ notas por cliente/competência. Idempotente.
alter table nfse add column if not exists avulsa boolean not null default false;
