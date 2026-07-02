-- Número da DPS (nDPS) por uma sequência dedicada — monotônica, sem reuso mesmo
-- após exclusões, e segura em concorrência. Substitui a contagem de linhas.
-- Começa alto (1000) para não colidir com os nDPS pequenos já usados. (V5)
create sequence if not exists nfse_dps_seq start with 1000 increment by 1;

create or replace function proximo_ndps() returns bigint
  language sql volatile security definer set search_path = pg_catalog, public
  as $$ select nextval('nfse_dps_seq') $$;

grant execute on function proximo_ndps() to authenticated;
