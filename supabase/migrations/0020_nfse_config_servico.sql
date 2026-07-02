-- Campos de serviço da NFS-e nacional confirmados numa nota real (V5). Idempotente.
alter table nfse_config add column if not exists codigo_servico_nacional text; -- cTribNac (6 díg.)
alter table nfse_config add column if not exists descricao_servico text;       -- xDescServ
alter table nfse_config add column if not exists pct_trib_sn numeric;          -- pTotTribSN (%)
