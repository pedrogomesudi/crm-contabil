-- RF-003 Fatia C: snapshot do cálculo de precificação na proposta.
alter table proposta add column if not exists precificacao jsonb;
