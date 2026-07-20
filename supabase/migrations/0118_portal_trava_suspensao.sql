-- RF Financeiro: suspensão por inadimplência (Fatia B — trava do portal).
-- O cliente suspenso perde acesso a documentos, notas e guias e não abre nova
-- solicitação nem envia documento; boletos e situação financeira seguem visíveis.

-- Espelha auth_cliente_id() (0085) com o search_path endurecido de auth_papel() (0011).
create or replace function auth_cliente_suspenso() returns boolean
  language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(c.suspenso, false)
  from usuarios u
  join clientes c on c.id = u.cliente_id
  where u.id = auth.uid() and u.papel = 'cliente' and u.ativo
$$;
revoke all on function auth_cliente_suspenso() from public;
grant execute on function auth_cliente_suspenso() to authenticated;

-- LEITURA travada: documentos, notas, guias.
drop policy if exists documentos_portal_sel on documentos;
create policy documentos_portal_sel on documentos for select to authenticated
  using (cliente_id = auth_cliente_id() and not auth_cliente_suspenso());

drop policy if exists nfse_portal_sel on nfse;
create policy nfse_portal_sel on nfse for select to authenticated
  using (cliente_id = auth_cliente_id() and not auth_cliente_suspenso());

drop policy if exists obrig_portal_sel on obrigacao_instancia;
create policy obrig_portal_sel on obrigacao_instancia for select to authenticated
  using (cliente_id = auth_cliente_id() and not auth_cliente_suspenso());

-- INTERAÇÃO travada: envio de documento e abertura de nova solicitação.
-- Preserva o ramo de equipe das policies com OR — só o ramo do cliente ganha a trava.
drop policy if exists documentos_portal_ins on documentos;
create policy documentos_portal_ins on documentos for insert to authenticated
  with check (cliente_id = auth_cliente_id() and origem = 'cliente' and not auth_cliente_suspenso());

drop policy if exists solicitacao_ins on solicitacao;
create policy solicitacao_ins on solicitacao for insert to authenticated with check (
  (cliente_id = auth_cliente_id() and status = 'aberta' and not auth_cliente_suspenso())
  or (auth_papel() in ('admin','assistente','contador') and exists (select 1 from clientes c where c.id = cliente_id))
);
