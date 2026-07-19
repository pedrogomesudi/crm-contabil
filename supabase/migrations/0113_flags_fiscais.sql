-- Flags fiscais explícitas no cadastro (sobrescrita tri-state; null = Auto/deriva).
alter table clientes add column if not exists flag_tem_folha       boolean;
alter table clientes add column if not exists flag_contribui_icms  boolean;
alter table clientes add column if not exists flag_contribui_iss   boolean;
