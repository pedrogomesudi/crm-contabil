-- Rastreio de origem/sincronização com o Domínio (V2). Idempotente.
alter table clientes add column if not exists origem text not null default 'manual';
alter table clientes add column if not exists dominio_codigo text;
alter table clientes add column if not exists cnae text;
alter table clientes add column if not exists sincronizado_em timestamptz;
alter table clientes add column if not exists dominio_snapshot jsonb;

create unique index if not exists clientes_dominio_codigo_uidx
  on clientes (dominio_codigo) where dominio_codigo is not null;
