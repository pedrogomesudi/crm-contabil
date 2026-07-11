-- Empresa em constituição (Fatia 1): CNPJ opcional só nesse status + lista de sócios.
alter table clientes alter column cpf_cnpj drop not null;

do $$ begin
  alter table clientes add constraint chk_cnpj_constituicao
    check (cpf_cnpj is not null or status = 'em_constituicao');
exception when duplicate_object then null; end $$;

alter table clientes add column if not exists socios jsonb;
