-- Testes de RLS. Rodados por scripts/db-test-rls.mjs dentro de uma transação
-- (ROLLBACK no fim — não persiste dados). _simular(uid) troca role + claims.
-- IMPORTANTE: exige Session pooler (set_config local consistente entre statements).
-- Nota: a numeração dos ASSERTs segue a ordem histórica de criação (por Task),
-- não a ordem de execução (ex.: ASSERT 2 aparece antes do ASSERT 1).

create or replace function _simular(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
end $$;

-- ===== SEEDS (como owner; perfis em usuarios criados pelo trigger handle_new_user) =====
reset role;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@teste.com',    '{"nome":"Admin","papel":"admin"}'::jsonb,        now(), now()),
  ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','assist@teste.com',   '{"nome":"Assist","papel":"assistente"}'::jsonb,   now(), now()),
  ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','contador@teste.com', '{"nome":"Contador","papel":"contador"}'::jsonb,   now(), now()),
  ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fin@teste.com',      '{"nome":"Fin","papel":"financeiro"}'::jsonb,      now(), now())
  on conflict do nothing;

-- Clientes: 001 do contador (003); 002 do admin (001)
insert into clientes (id, tipo_pessoa, razao_social, cpf_cnpj, regime_tributario, contador_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'PJ', 'Cliente do Contador', '11222333000181', 'Simples', '00000000-0000-0000-0000-000000000003'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'PJ', 'Cliente do Admin',    '11222333000262', 'Simples', '00000000-0000-0000-0000-000000000001')
  on conflict do nothing;

-- Honorário para ambos
insert into clientes_financeiro (cliente_id, honorario_mensal) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 500.00),
  ('aaaaaaaa-0000-0000-0000-000000000002', 999.00)
  on conflict do nothing;

-- ===== SANITY: prova que a RLS está ativa (não rodando como superuser/owner) =====
do $$
declare n int; v_super text;
begin
  reset role;
  select current_setting('is_superuser') into v_super;
  if v_super <> 'off' then raise exception 'FALHA: conexão superuser — RLS não confiável'; end if;
  perform _simular('00000000-0000-0000-0000-000000000099'); -- uid sem perfil => auth_papel null
  select count(*) into n from clientes;
  if n <> 0 then raise exception 'FALHA: RLS inativa (authenticated sem papel viu % clientes)', n; end if;
  raise notice 'OK: RLS ativa e aplicada (não-superuser; sem papel => sem acesso)';
end $$;

-- ===== ASSERTS =====

-- ASSERT 2: trigger handle_new_user criou o perfil com o papel de app_metadata
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

-- ASSERT 1: assistente NÃO se promove a admin (trigger anti-escalonamento)
do $$
declare v_papel papel; v_uid uuid;
begin
  perform _simular('00000000-0000-0000-0000-000000000002');
  v_uid := auth.uid();
  if v_uid is null then raise exception 'FALHA: auth.uid() nulo (claims não aplicados)'; end if;
  update usuarios set papel = 'admin' where id = v_uid;
  select papel into v_papel from usuarios where id = v_uid;
  if v_papel <> 'assistente' then
    raise exception 'FALHA: assistente mudou o próprio papel (=%)', v_papel;
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
do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador
  select count(*) into n from clientes;
  if n <> 1 then raise exception 'FALHA: contador viu % clientes (esperado 1)', n; end if;
  raise notice 'OK: contador enxerga apenas o próprio cliente';
end $$;

-- ASSERT 5: assistente NÃO acessa clientes_financeiro (honorário)
do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000002'); -- assistente
  select count(*) into n from clientes_financeiro;
  if n <> 0 then raise exception 'FALHA: assistente viu % honorários', n; end if;
  raise notice 'OK: assistente não acessa clientes_financeiro';
end $$;

-- ASSERT 6: ao deletar documento, o log de auditoria permanece (documento_id -> null)
do $$
declare n int;
begin
  reset role;
  insert into documentos (id, cliente_id, nome, caminho_storage) values
    ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'contrato.pdf', 'aaaaaaaa-0000-0000-0000-000000000001/contrato.pdf')
    on conflict do nothing;
  insert into log_acesso_documento (documento_id, usuario_id) values
    ('dddddddd-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001')
    on conflict do nothing;
  delete from documentos where id = 'dddddddd-0000-0000-0000-000000000001';
  select count(*) into n from log_acesso_documento where documento_id is null;
  if n < 1 then raise exception 'FALHA: log não sobreviveu à exclusão do documento'; end if;
  raise notice 'OK: log preservado com documento_id nulo após exclusão';
end $$;

-- ASSERT 7: assistente NÃO deleta cliente (delete negado pela RLS)
do $$
declare existe boolean;
begin
  perform _simular('00000000-0000-0000-0000-000000000002'); -- assistente
  delete from clientes where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  reset role;
  select exists(select 1 from clientes where id = 'aaaaaaaa-0000-0000-0000-000000000001') into existe;
  if not existe then raise exception 'FALHA: assistente conseguiu deletar cliente'; end if;
  raise notice 'OK: assistente não deleta cliente';
end $$;

-- ASSERT 8: financeiro NÃO insere cliente (insert negado pela RLS)
do $$
begin
  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro
  begin
    insert into clientes (tipo_pessoa, razao_social, cpf_cnpj, regime_tributario)
    values ('PJ', 'Teste Fin', '99888777000166', 'Simples');
    raise exception 'FALHA: financeiro conseguiu inserir cliente';
  exception when insufficient_privilege then
    raise notice 'OK: financeiro não insere cliente';
  end;
end $$;

-- ASSERT 9: contador NÃO atualiza cliente de outro contador
do $$
declare v text;
begin
  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador
  update clientes set razao_social = 'HACKED' where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  reset role;
  select razao_social into v from clientes where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if v = 'HACKED' then raise exception 'FALHA: contador atualizou cliente alheio'; end if;
  raise notice 'OK: contador não atualiza cliente de outro contador';
end $$;

-- ASSERT 10: contador só vê honorário dos seus clientes
do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador
  select count(*) into n from clientes_financeiro;
  if n <> 1 then raise exception 'FALHA: contador viu % honorários (esperado 1)', n; end if;
  raise notice 'OK: contador só vê honorário dos seus clientes';
end $$;

-- ASSERT 11: usuário comum (assistente) só vê o próprio perfil em usuarios
do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000002'); -- assistente
  select count(*) into n from usuarios;
  if n <> 1 then raise exception 'FALHA: usuário comum viu % linhas de usuarios (esperado 1)', n; end if;
  raise notice 'OK: usuário comum só vê o próprio perfil';
end $$;

-- ASSERT 12: financeiro NÃO insere documento (só vê)
do $$
begin
  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro
  begin
    insert into documentos (cliente_id, nome, caminho_storage)
    values ('aaaaaaaa-0000-0000-0000-000000000002', 'x.pdf', 'aaaaaaaa-0000-0000-0000-000000000002/x.pdf');
    raise exception 'FALHA: financeiro inseriu documento';
  exception when insufficient_privilege then
    raise notice 'OK: financeiro não insere documento';
  end;
end $$;

-- ASSERT 13: contador NÃO vê documento de cliente de outro contador
do $$
declare n int;
begin
  reset role;
  insert into documentos (id, cliente_id, nome, caminho_storage) values
    ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'outro.pdf', 'aaaaaaaa-0000-0000-0000-000000000002/outro.pdf')
    on conflict do nothing;
  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador
  select count(*) into n from documentos where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'FALHA: contador viu documento de cliente alheio (%)', n; end if;
  raise notice 'OK: contador não vê documento de cliente de outro contador';
end $$;

-- ASSERT 14: caminho privilegiado (service_role/owner, auth.uid() nulo) CONSEGUE
-- mudar papel — é o que o bootstrap/Task 12 usam (o guard auth.uid() is not null libera).
do $$
declare v papel;
begin
  -- simula service_role: limpa role E claims (auth.uid() nulo). Só resetar o role
  -- não basta — o request.jwt.claims do _simular anterior persiste na transação.
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if auth.uid() is not null then raise exception 'FALHA: auth.uid() não-nulo após limpar claims'; end if;
  update usuarios set papel = 'admin' where id = '00000000-0000-0000-0000-000000000002';
  select papel into v from usuarios where id = '00000000-0000-0000-0000-000000000002';
  if v <> 'admin' then
    raise exception 'FALHA: caminho privilegiado não promoveu papel (=%)', v;
  end if;
  raise notice 'OK: service_role/owner (uid nulo) promove papel — guard libera o privilegiado';
end $$;

-- ASSERT 15: dashboard_resumo() respeita a RLS (contador vê só o resumo dos seus)
do $$
declare v jsonb;
begin
  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador (1 cliente)
  select dashboard_resumo() into v;
  if (v->>'total')::int <> 1 then
    raise exception 'FALHA: dashboard_resumo não respeitou RLS (total=%)', v->>'total';
  end if;
  raise notice 'OK: dashboard_resumo respeita RLS (contador vê só os seus)';
end $$;

-- ASSERT 16: contador NÃO insere documento em cliente de outro contador (doc_insert)
do $$
begin
  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador (dono do ...0001)
  begin
    insert into documentos (cliente_id, nome, caminho_storage)
    values ('aaaaaaaa-0000-0000-0000-000000000002', 'intruso.pdf',
            'aaaaaaaa-0000-0000-0000-000000000002/intruso.pdf'); -- cliente do admin
    raise exception 'FALHA: contador inseriu documento em cliente alheio';
  exception when insufficient_privilege then
    raise notice 'OK: contador não insere documento em cliente alheio';
  end;
end $$;

-- ASSERT 17: authenticated não forja registro em log_acesso_documento (sem policy de INSERT)
do $$
begin
  perform _simular('00000000-0000-0000-0000-000000000002'); -- assistente
  begin
    insert into log_acesso_documento (documento_id, usuario_id)
    values ('dddddddd-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');
    raise exception 'FALHA: authenticated inseriu log de acesso';
  exception when insufficient_privilege then
    raise notice 'OK: log_acesso_documento não aceita insert de authenticated';
  end;
end $$;

-- Nota: a invariante "≥1 admin ativo" (trigger garantir_admin_ativo, migration 0010)
-- não é testada aqui porque o banco compartilha admins reais (ex.: o fundador), o que
-- impede isolar o cenário "último admin". A garantia vem do trigger + checagem na action.
