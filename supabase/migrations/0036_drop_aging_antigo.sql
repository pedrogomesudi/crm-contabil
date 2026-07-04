-- Remove o financeiro_aging() antigo (0 args, V6.5). O novo é financeiro_aging(titulo_tipo
-- default 'RECEBER') — com o antigo presente, a chamada sem args ficava ambígua.
drop function if exists financeiro_aging();
