-- RF-072 (Fatia B): porte do cliente (classificação por faturamento).
do $$ begin create type porte_empresa as enum ('MEI','ME','EPP','DEMAIS'); exception when duplicate_object then null; end $$;
alter table clientes add column if not exists porte porte_empresa;
