-- Roda a geração para a competência corrente SOMENTE se o flag estiver ligado.
create or replace function gerar_mensalidades_automatico() returns void
  language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if (select geracao_automatica from financeiro_config where id = 1) then
    perform gerar_mensalidades(date_trunc('month', now())::date);
  end if;
end $$;

-- Agenda no pg_cron todo dia 1 às 06:00, se a extensão estiver disponível.
-- Degrada graciosamente: sem pg_cron, o botão manual continua funcionando.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('gerar-mensalidades-mensal', '0 6 1 * *', 'select gerar_mensalidades_automatico()');
  else
    raise notice 'pg_cron indisponível — automação fica só pelo botão manual até habilitar.';
  end if;
exception when others then
  raise notice 'Não foi possível agendar pg_cron (%). Automação segue pelo botão manual.', sqlerrm;
end $$;
