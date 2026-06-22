-- Testes de RLS. Rodados pelo runner scripts/db-test-rls.mjs dentro de uma
-- transação (ROLLBACK no fim — não persiste dados de teste).
-- Convenção: simular usuário via _simular(uid) (seta role + request.jwt.claims).

create or replace function _simular(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
end $$;

-- Semear usuários como owner (created_at/updated_at explícitos p/ não depender do GoTrue).
reset role;
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@teste.com', now(), now()),
  ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','assist@teste.com', now(), now())
  on conflict do nothing;
insert into usuarios (id, nome, email, papel) values
  ('00000000-0000-0000-0000-000000000001','Admin','admin@teste.com','admin'),
  ('00000000-0000-0000-0000-000000000002','Assist','assist@teste.com','assistente')
  on conflict do nothing;

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
