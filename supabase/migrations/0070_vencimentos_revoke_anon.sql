-- Endurecimento: o Supabase concede EXECUTE a `anon` por padrão nas funções do schema public.
-- `certificados_nfse_vencimento()` é SECURITY DEFINER e lê tabelas de certificado — não deve ser
-- alcançável por usuário não autenticado. Hoje ela já devolveria zero linhas (auth_papel() é nulo
-- para anon), mas remover o privilégio elimina a superfície em vez de depender do filtro interno.
revoke execute on function certificados_nfse_vencimento() from anon;
