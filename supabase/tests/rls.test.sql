-- Testes de RLS. Rodados pelo runner scripts/db-test-rls.mjs dentro de uma
-- transação (ROLLBACK no fim — não persiste dados de teste).
-- Convenção: simular usuário via _simular(uid) (seta role + request.jwt.claims).

create or replace function _simular(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
end $$;

-- Semear usuários como owner. Os perfis em `usuarios` são criados automaticamente
-- pelo trigger handle_new_user, lendo o papel de raw_app_meta_data.
reset role;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@teste.com',  '{"nome":"Admin","papel":"admin"}'::jsonb,        now(), now()),
  ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','assist@teste.com', '{"nome":"Assist","papel":"assistente"}'::jsonb,   now(), now()),
  ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','contador@teste.com','{"nome":"Contador X","papel":"contador"}'::jsonb, now(), now())
  on conflict do nothing;

-- ASSERT 2: o trigger handle_new_user criou o perfil com o papel vindo de app_metadata
do $$
declare v_papel papel;
begin
  reset role;
  select papel into v_papel from usuarios where id = '00000000-0000-0000-0000-000000000003';
  if v_papel is distinct from 'contador' then
    raise exception 'FALHA: sync de perfil não aplicou papel de app_metadata (=%)', v_papel;
  end if;
  raise notice 'OK: handle_new_user criou perfil com papel contador';
end $$;

-- ASSERT 1: assistente NÃO consegue se promover a admin (trigger anti-escalonamento)
do $$
declare v_papel papel; v_uid uuid;
begin
  perform _simular('00000000-0000-0000-0000-000000000002'); -- assistente
  v_uid := auth.uid();
  if v_uid is null then raise exception 'FALHA: auth.uid() nulo (claims não aplicados)'; end if;
  update usuarios set papel = 'admin' where id = v_uid;
  select papel into v_papel from usuarios where id = v_uid;
  if v_papel <> 'assistente' then
    raise exception 'FALHA: assistente conseguiu mudar o próprio papel (=%)', v_papel;
  end if;
  raise notice 'OK: papel do assistente permaneceu congelado';
end $$;

-- ASSERT 3: CHECK tipo×regime rejeita combinação inválida (PF + Simples)
do $$
begin
  reset role;
  begin
    insert into clientes (tipo_pessoa, razao_social, cpf_cnpj, regime_tributario)
    values ('PF', 'Fulano', '11111111111', 'Simples');
    raise exception 'FALHA: CHECK permitiu PF+Simples';
  exception when check_violation then
    raise notice 'OK: CHECK rejeitou PF+Simples';
  end;
end $$;

-- ASSERT 4: contador só enxerga os clientes atribuídos a ele
reset role;
insert into clientes (id, tipo_pessoa, razao_social, cpf_cnpj, regime_tributario, contador_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'PJ', 'Cliente do Contador', '11222333000181', 'Simples', '00000000-0000-0000-0000-000000000003'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'PJ', 'Cliente de Outro',    '11222333000262', 'Simples', '00000000-0000-0000-0000-000000000001')
  on conflict do nothing;
do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador
  select count(*) into n from clientes;
  if n <> 1 then raise exception 'FALHA: contador viu % clientes (esperado 1)', n; end if;
  raise notice 'OK: contador enxerga apenas o próprio cliente';
end $$;

-- ASSERT 5: assistente NÃO acessa clientes_financeiro (honorário), mesmo havendo dados
reset role;
insert into clientes_financeiro (cliente_id, honorario_mensal)
values ('aaaaaaaa-0000-0000-0000-000000000001', 500.00) on conflict do nothing;
do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000002'); -- assistente
  select count(*) into n from clientes_financeiro;
  if n <> 0 then raise exception 'FALHA: assistente viu % linhas de honorário', n; end if;
  raise notice 'OK: assistente não acessa clientes_financeiro';
end $$;
