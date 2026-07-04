-- V6.3 — Enums de contas a pagar. SEPARADA do schema porque não se pode adicionar
-- valor de enum e usá-lo na mesma transação (o runner roda 1 migration = 1 tx).
do $$ begin create type titulo_tipo as enum ('RECEBER','PAGAR');
exception when duplicate_object then null; end $$;
alter type titulo_origem add value if not exists 'DESPESA_AVULSA';
alter type titulo_origem add value if not exists 'DESPESA_PARCELADA';
alter type titulo_origem add value if not exists 'DESPESA_RECORRENTE';
