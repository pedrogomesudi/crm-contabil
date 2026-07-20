-- Conciliação parcial: tolerância de valor configurável.
alter table escritorio_config add column if not exists tolerancia_conciliacao numeric(15,2) not null default 0.01;
