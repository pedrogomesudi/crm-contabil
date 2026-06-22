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
