-- Portal do cliente (RF-052) — Fatia A: vínculo do usuário-cliente e policies de LEITURA.
-- Modelo de segurança: as policies existentes listam os papéis de equipe, então o papel
-- 'cliente' é NEGADO por padrão em tudo. Aqui concedo SELECT estreito, só nas linhas do
-- próprio cadastro. Nenhuma policy de escrita para 'cliente' nesta fatia.

alter table usuarios add column if not exists cliente_id uuid references clientes(id) on delete cascade;

-- Cliente DEVE estar vinculado a um cadastro; equipe NUNCA tem vínculo.
do $$ begin
  alter table usuarios add constraint chk_usuario_cliente
    check ((papel = 'cliente' and cliente_id is not null) or (papel <> 'cliente' and cliente_id is null));
exception when duplicate_object then null; end $$;

-- Id do cliente do usuário logado; null para a equipe (então as policies abaixo não
-- ampliam nada para quem não é cliente).
create or replace function auth_cliente_id() returns uuid
language sql stable security definer set search_path = public as $$
  select cliente_id from usuarios where id = auth.uid() and papel = 'cliente' and ativo
$$;
revoke all on function auth_cliente_id() from public;
grant execute on function auth_cliente_id() to authenticated;

drop policy if exists clientes_portal_sel on clientes;
create policy clientes_portal_sel on clientes for select to authenticated
  using (id = auth_cliente_id());

drop policy if exists documentos_portal_sel on documentos;
create policy documentos_portal_sel on documentos for select to authenticated
  using (cliente_id = auth_cliente_id());

drop policy if exists nfse_portal_sel on nfse;
create policy nfse_portal_sel on nfse for select to authenticated
  using (cliente_id = auth_cliente_id());

drop policy if exists obrig_portal_sel on obrigacao_instancia;
create policy obrig_portal_sel on obrigacao_instancia for select to authenticated
  using (cliente_id = auth_cliente_id());

drop policy if exists titulo_portal_sel on titulo;
create policy titulo_portal_sel on titulo for select to authenticated
  using (cliente_id = auth_cliente_id());

drop policy if exists boleto_portal_sel on boleto;
create policy boleto_portal_sel on boleto for select to authenticated
  using (exists (select 1 from titulo t where t.id = boleto.titulo_id and t.cliente_id = auth_cliente_id()));
