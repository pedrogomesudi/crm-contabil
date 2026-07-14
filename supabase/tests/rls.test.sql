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

-- Usuário do PORTAL (papel 'cliente'), vinculado ao cliente A (…001).
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','portal@teste.com', '{"nome":"Portal","papel":"assistente"}'::jsonb, now(), now())
  on conflict do nothing;
-- O trigger cria como 'assistente'; o convite real faz este mesmo update server-side.
update usuarios set papel = 'cliente', cliente_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  where id = '00000000-0000-0000-0000-000000000005';

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

-- ===== V2: contratos_dominio seguem a RLS do financeiro =====
-- seed: um contrato para o cliente do contador (003). Como asserts anteriores
-- (na mesma transação) podem ter promovido o user 0002, garantimos aqui, como
-- owner, que ele volta a ser 'assistente' antes destes asserts.
reset role;
update usuarios set papel = 'assistente' where id = '00000000-0000-0000-0000-000000000002';
insert into contratos_dominio (id, cliente_id, tipo_contrato, valor_atual) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'HONORARIOS CONTABEIS', 250.00)
  on conflict do nothing;

-- ASSERT 18: assistente NÃO enxerga contratos_dominio (sem policy)
do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000002'); -- assistente
  select count(*) into n from contratos_dominio;
  if n <> 0 then raise exception 'FALHA: assistente viu % contratos_dominio (devia ser 0)', n; end if;
  raise notice 'OK: assistente não acessa contratos_dominio';
end $$;

-- ASSERT 19: financeiro enxerga contratos_dominio
do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro
  select count(*) into n from contratos_dominio;
  if n < 1 then raise exception 'FALHA: financeiro não viu contratos_dominio'; end if;
  raise notice 'OK: financeiro acessa contratos_dominio';
end $$;

-- ASSERT 20: assistente NÃO insere em contratos_dominio (sem policy de insert)
do $$
begin
  perform _simular('00000000-0000-0000-0000-000000000002'); -- assistente
  begin
    insert into contratos_dominio (cliente_id, tipo_contrato, valor_atual)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'X', 1.00);
    raise exception 'FALHA: assistente inseriu contrato_dominio';
  exception when insufficient_privilege then
    raise notice 'OK: assistente não insere contratos_dominio';
  end;
end $$;

-- ===== V2 hardening: staging financeiro (importacao_contratos) = RLS do financeiro =====
reset role;
insert into importacoes (id, status) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'previa') on conflict do nothing;
insert into importacao_contratos (id, importacao_id, cpf_cnpj, payload) values
  ('ffffffff-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', '11222333000181', '[]'::jsonb)
  on conflict do nothing;

-- ASSERT 21: assistente NÃO enxerga importacao_contratos (valores de honorário)
do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000002'); -- assistente
  select count(*) into n from importacao_contratos;
  if n <> 0 then raise exception 'FALHA: assistente viu % importacao_contratos (devia ser 0)', n; end if;
  raise notice 'OK: assistente não acessa importacao_contratos (staging financeiro)';
end $$;

-- ASSERT 22: financeiro enxerga importacao_contratos
do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro
  select count(*) into n from importacao_contratos;
  if n < 1 then raise exception 'FALHA: financeiro não viu importacao_contratos'; end if;
  raise notice 'OK: financeiro acessa importacao_contratos';
end $$;

-- ===== V2 review: importação escopada por dono (M3) =====
-- importação pertencente ao contador (003), não ao assistente (002)
reset role;
insert into importacoes (id, status, executado_por) values
  ('eeeeeeee-0000-0000-0000-000000000002', 'previa', '00000000-0000-0000-0000-000000000003')
  on conflict do nothing;

-- ASSERT 23: assistente NÃO enxerga importação de outro usuário (escopo por dono)
do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000002'); -- assistente (não é dono nem admin)
  select count(*) into n from importacoes where id = 'eeeeeeee-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'FALHA: assistente viu importação alheia (devia ser 0)'; end if;
  raise notice 'OK: importação é escopada por dono (assistente não vê alheia)';
end $$;

-- ===== V4: assinaturas seguem a RLS de gestão de documentos =====
reset role;
insert into assinaturas (id, cliente_id, clicksign_envelope_id, status) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'env_teste', 'enviado')
  on conflict do nothing;

-- ASSERT: financeiro NÃO gerencia assinaturas (não está em admin/assistente/contador-dono)
do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro
  select count(*) into n from assinaturas;
  if n <> 0 then raise exception 'FALHA: financeiro viu % assinaturas (devia ser 0)', n; end if;
  raise notice 'OK: financeiro não acessa assinaturas';
end $$;

-- ===== V5: NFS-e segue a RLS financeira; config/cert são só admin =====
reset role;
insert into nfse (id, cliente_id, valor, competencia, status, ambiente) values
  ('22222222-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 100, '2026-07-01', 'autorizada', 'homologacao')
  on conflict do nothing;

do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000002'); -- assistente
  select count(*) into n from nfse;
  if n <> 0 then raise exception 'FALHA: assistente viu % nfse (devia ser 0)', n; end if;
  select count(*) into n from nfse_config;
  if n <> 0 then raise exception 'FALHA: assistente viu nfse_config (devia ser 0)'; end if;
  raise notice 'OK: assistente não acessa nfse nem config';
  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro
  -- Checa a nota de teste específica (robusto a dados reais que possam existir).
  select count(*) into n from nfse where id = '22222222-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'FALHA: financeiro não viu a nfse de teste (viu %)', n; end if;
  raise notice 'OK: financeiro vê nfse';
end $$;

-- ===== V5-B: emitente/certificado do cliente são só admin; numeração por cliente =====
do $$
declare n int; a bigint; b bigint;
begin
  -- admin cadastra o emitente do cliente 002 e o enxerga
  perform _simular('00000000-0000-0000-0000-000000000001'); -- admin
  insert into nfse_emitente (cliente_id, codigo_municipio, codigo_servico_nacional)
    values ('aaaaaaaa-0000-0000-0000-000000000002', '3170206', '170201')
    on conflict (cliente_id) do nothing;
  select count(*) into n from nfse_emitente where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if n <> 1 then raise exception 'FALHA: admin não vê nfse_emitente (viu %)', n; end if;

  -- financeiro e contador NÃO acessam config/cert do emitente
  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro
  select count(*) into n from nfse_emitente;
  if n <> 0 then raise exception 'FALHA: financeiro viu nfse_emitente (devia ser 0)'; end if;
  select count(*) into n from nfse_certificado_cliente;
  if n <> 0 then raise exception 'FALHA: financeiro viu nfse_certificado_cliente (devia ser 0)'; end if;
  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador
  select count(*) into n from nfse_emitente;
  if n <> 0 then raise exception 'FALHA: contador viu nfse_emitente (devia ser 0)'; end if;
  raise notice 'OK: nfse_emitente/certificado_cliente são admin-only';

  -- numeração por cliente incrementa monotonicamente (RPC SECURITY DEFINER)
  reset role;
  select proximo_ndps_cliente('aaaaaaaa-0000-0000-0000-000000000002') into a;
  select proximo_ndps_cliente('aaaaaaaa-0000-0000-0000-000000000002') into b;
  if b <> a + 1 then raise exception 'FALHA: proximo_ndps_cliente não incrementou (% -> %)', a, b; end if;
  raise notice 'OK: proximo_ndps_cliente incrementa por cliente';
end $$;

-- ===== V6.1 — RLS DOS CADASTROS FINANCEIROS =====

-- Seed de apoio (como owner): uma conta e uma categoria para os SELECTs.
reset role;
insert into conta_bancaria (id, nome, tipo, saldo_inicial)
  values ('bbbbbbbb-0000-0000-0000-000000000001','Conta Teste','CORRENTE',0)
  on conflict do nothing;

-- ASSERT F1: financeiro gerencia conta_bancaria (INSERT permitido)
do $$
begin
  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro
  insert into conta_bancaria (nome, tipo) values ('Conta do Financeiro','CAIXA');
  raise notice 'OK: financeiro insere conta_bancaria';
end $$;

-- ASSERT F2: contador NÃO vê conta_bancaria (SELECT bloqueado => 0 linhas)
do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador
  select count(*) into n from conta_bancaria;
  if n <> 0 then raise exception 'FALHA: contador viu % contas', n; end if;
  raise notice 'OK: contador não vê conta_bancaria';
end $$;

-- ASSERT F3: contador NÃO insere conta_bancaria (INSERT bloqueado)
do $$
declare ok boolean := false;
begin
  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador
  begin
    insert into conta_bancaria (nome, tipo) values ('Hack','CAIXA');
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FALHA: contador conseguiu inserir conta_bancaria'; end if;
  raise notice 'OK: contador não insere conta_bancaria';
end $$;

-- ASSERT F4: contador LÊ categoria (SELECT liberado => vê os seeds)
do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador
  select count(*) into n from categoria;
  if n = 0 then raise exception 'FALHA: contador não viu categorias (esperava seeds)'; end if;
  raise notice 'OK: contador lê categoria (% linhas)', n;
end $$;

-- ASSERT F5: contador NÃO escreve em categoria (INSERT bloqueado)
do $$
declare ok boolean := false;
begin
  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador
  begin
    insert into categoria (nome, natureza) values ('Categoria Hack','RECEITA');
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FALHA: contador escreveu em categoria'; end if;
  raise notice 'OK: contador não escreve em categoria';
end $$;

-- ASSERT F6: contador LÊ servico (SELECT liberado)
do $$
declare n int;
begin
  reset role;
  insert into servico (id, nome) values ('cccccccc-0000-0000-0000-000000000001','Abertura de empresa')
    on conflict do nothing;
  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador
  select count(*) into n from servico;
  if n = 0 then raise exception 'FALHA: contador não viu serviços'; end if;
  raise notice 'OK: contador lê servico (% linhas)', n;
end $$;

-- ASSERT F7: assistente NÃO vê nada financeiro (categoria bloqueada)
do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000002'); -- assistente
  select count(*) into n from categoria;
  if n <> 0 then raise exception 'FALHA: assistente viu % categorias', n; end if;
  raise notice 'OK: assistente não vê categoria';
end $$;

-- ASSERT F8: gatilho de 2 níveis barra o 3º nível do plano de contas
do $$
declare v_pai uuid; v_filho uuid; ok boolean := false;
begin
  reset role;
  insert into categoria (nome, natureza) values ('Pai N1','DESPESA') returning id into v_pai;
  insert into categoria (nome, natureza, categoria_pai_id) values ('Filho N2','DESPESA', v_pai) returning id into v_filho;
  begin
    insert into categoria (nome, natureza, categoria_pai_id) values ('Neto N3','DESPESA', v_filho);
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FALHA: aceitou 3º nível no plano de contas'; end if;
  raise notice 'OK: plano de contas limitado a 2 níveis';
end $$;

-- ===== aplicar_importacao: NÃO altera clientes existentes (só honorário via contrato) =====
do $$
declare
  v_imp uuid;
  v_ex1 uuid; v_ex2 uuid; v_nv uuid;
  v_res jsonb;
  v_razao text; v_email text; v_hon numeric;
begin
  reset role;
  -- Existentes com cadastro + honorário
  insert into clientes (id, tipo_pessoa, razao_social, cpf_cnpj, regime_tributario, status, email)
    values (gen_random_uuid(), 'PJ', 'ORIGINAL LTDA', '99000000000191', 'Simples', 'ativo', 'orig@x.com')
    returning id into v_ex1;
  insert into clientes (id, tipo_pessoa, razao_social, cpf_cnpj, regime_tributario, status, email)
    values (gen_random_uuid(), 'PJ', 'PRESERVA LTDA', '99000000000272', 'Simples', 'ativo', 'preserva@x.com')
    returning id into v_ex2;
  insert into clientes_financeiro (cliente_id, honorario_mensal) values (v_ex1, 500), (v_ex2, 800);

  -- Importação prévia (admin = ...001)
  insert into importacoes (id, status, arquivos, executado_por, expira_em, novos, atualizados, inalterados, pendencias, erros)
    values (gen_random_uuid(), 'previa', '[]'::jsonb, '00000000-0000-0000-0000-000000000001', now() + interval '1 hour', 1, 1, 1, 0, 0)
    returning id into v_imp;

  -- Itens: EX1 'atualizado' com cadastro DIFERENTE; EX2 'inalterado'; NV 'novo'
  insert into importacao_itens (importacao_id, classe, cpf_cnpj, payload) values
    (v_imp, 'atualizado', '99000000000191', jsonb_build_object('cliente', jsonb_build_object(
        'cpf_cnpj','99000000000191','tipo_pessoa','PJ','razao_social','MUDADO LTDA','nome_fantasia',null,
        'regime_tributario','Simples','status','ativo','cnae',null,'inscricao_estadual',null,
        'endereco',null,'email','novo@x.com','telefone',null,'dominio_codigo',null))),
    (v_imp, 'inalterado', '99000000000272', jsonb_build_object('cliente', jsonb_build_object(
        'cpf_cnpj','99000000000272','tipo_pessoa','PJ','razao_social','PRESERVA LTDA','nome_fantasia',null,
        'regime_tributario','Simples','status','ativo','cnae',null,'inscricao_estadual',null,
        'endereco',null,'email','preserva@x.com','telefone',null,'dominio_codigo',null))),
    (v_imp, 'novo', '99000000000353', jsonb_build_object('cliente', jsonb_build_object(
        'cpf_cnpj','99000000000353','tipo_pessoa','PJ','razao_social','NOVO CLIENTE LTDA','nome_fantasia',null,
        'regime_tributario','Simples','status','ativo','cnae',null,'inscricao_estadual',null,
        'endereco',null,'email','nv@x.com','telefone',null,'dominio_codigo',null)));

  -- Contratos: honorário para EX1 (750) e para NV (300); EX2 SEM contrato
  insert into importacao_contratos (importacao_id, cpf_cnpj, payload) values
    (v_imp, '99000000000191', jsonb_build_array(jsonb_build_object('codigoCliente','1','tipoContrato','HONORARIOS CONTABEIS','encerradoEm',null,'valorAtual',750,'valorOriginal',750))),
    (v_imp, '99000000000353', jsonb_build_array(jsonb_build_object('codigoCliente','2','tipoContrato','HONORARIOS CONTABEIS','encerradoEm',null,'valorAtual',300,'valorOriginal',300)));

  -- Aplica como admin
  perform _simular('00000000-0000-0000-0000-000000000001');
  select aplicar_importacao(v_imp) into v_res;
  reset role;

  -- EX1: cadastro PRESERVADO (razao e email inalterados), honorário ATUALIZADO p/ 750
  select razao_social, email into v_razao, v_email from clientes where id = v_ex1;
  if v_razao <> 'ORIGINAL LTDA' then raise exception 'FALHA: cadastro do existente foi alterado (razao=%)', v_razao; end if;
  if v_email <> 'orig@x.com' then raise exception 'FALHA: email do existente foi alterado (email=%)', v_email; end if;
  select honorario_mensal into v_hon from clientes_financeiro where cliente_id = v_ex1;
  if v_hon <> 750 then raise exception 'FALHA: honorário do existente não atualizou p/ 750 (=%)', v_hon; end if;

  -- EX2: SEM contrato => honorário PRESERVADO (800), nunca zerado
  select honorario_mensal into v_hon from clientes_financeiro where cliente_id = v_ex2;
  if v_hon is distinct from 800 then raise exception 'FALHA: honorário sem contrato foi alterado/zerado (=%)', v_hon; end if;

  -- NV: criado, com honorário 300
  select id into v_nv from clientes where cpf_cnpj = '99000000000353';
  if v_nv is null then raise exception 'FALHA: cliente novo não foi criado'; end if;
  select honorario_mensal into v_hon from clientes_financeiro where cliente_id = v_nv;
  if v_hon <> 300 then raise exception 'FALHA: honorário do novo cliente errado (=%)', v_hon; end if;

  -- gravados = 1 (só o novo)
  if (v_res->>'gravados')::int <> 1 then raise exception 'FALHA: gravados<>1 (=%)', v_res->>'gravados'; end if;

  raise notice 'OK: import não altera existentes; honorário atualiza com contrato e preserva sem contrato';
end $$;

-- ===== V6.2 — RLS de contrato/titulo/baixa =====
reset role;
insert into contrato (id, cliente_id, descricao, valor_mensal, dia_vencimento, data_inicio)
  values ('dddddddd-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Contábil',500,10,'2026-01-01')
  on conflict do nothing;
insert into titulo (id, cliente_id, contrato_id, origem, valor, competencia, vencimento)
  values ('eeeeeeee-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001','MENSALIDADE',500,'2026-07-01','2026-07-10')
  on conflict do nothing;

-- ASSERT R1: contador vê o contrato/título do SEU cliente
do $$ declare n int; begin
  perform _simular('00000000-0000-0000-0000-000000000003');
  select count(*) into n from contrato where cliente_id='aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'FALHA: contador não viu o contrato do seu cliente (n=%)', n; end if;
  select count(*) into n from titulo where cliente_id='aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'FALHA: contador não viu o título do seu cliente (n=%)', n; end if;
  raise notice 'OK: contador vê contrato/título do próprio cliente';
end $$;

-- ASSERT R2: contador NÃO escreve título
do $$ declare ok boolean := false; begin
  perform _simular('00000000-0000-0000-0000-000000000003');
  begin
    insert into titulo (cliente_id, origem, valor, competencia, vencimento)
      values ('aaaaaaaa-0000-0000-0000-000000000001','MENSALIDADE',9,'2026-08-01','2026-08-10');
  exception when others then ok := true; end;
  if not ok then raise exception 'FALHA: contador conseguiu inserir título'; end if;
  raise notice 'OK: contador não escreve título';
end $$;

-- ASSERT R3: assistente NÃO vê nada financeiro
do $$ declare n int; begin
  perform _simular('00000000-0000-0000-0000-000000000002');
  select count(*) into n from contrato; if n <> 0 then raise exception 'FALHA: assistente viu contrato'; end if;
  select count(*) into n from titulo;   if n <> 0 then raise exception 'FALHA: assistente viu titulo'; end if;
  raise notice 'OK: assistente não vê contrato/titulo';
end $$;

-- ASSERT R4: financeiro gerencia (registra baixa)
do $$ begin
  reset role;
  insert into conta_bancaria (id, nome, tipo) values ('bbbbbbbb-0000-0000-0000-0000000000f1','Conta Rec','CORRENTE') on conflict do nothing;
  perform _simular('00000000-0000-0000-0000-000000000004');
  insert into baixa (titulo_id, data_recebimento, valor_recebido, conta_bancaria_id, forma_pagamento)
    values ('eeeeeeee-0000-0000-0000-000000000001','2026-07-10',500,'bbbbbbbb-0000-0000-0000-0000000000f1','PIX');
  raise notice 'OK: financeiro registra baixa';
end $$;

-- ===== V6.2 — triggers de sync e status =====
do $$ declare v numeric; begin
  reset role;
  insert into clientes (id, tipo_pessoa, razao_social, cpf_cnpj, regime_tributario)
    values ('aaaaaaaa-0000-0000-0000-0000000000c1','PJ','Cliente Sync','55000000000191','Simples') on conflict do nothing;
  insert into contrato (cliente_id, descricao, valor_mensal, dia_vencimento, data_inicio)
    values ('aaaaaaaa-0000-0000-0000-0000000000c1','A',300,10,'2026-01-01'),
           ('aaaaaaaa-0000-0000-0000-0000000000c1','B',200,10,'2026-01-01');
  select honorario_mensal into v from clientes_financeiro where cliente_id='aaaaaaaa-0000-0000-0000-0000000000c1';
  if v is distinct from 500 then raise exception 'FALHA: sync honorário <> 500 (=%)', v; end if;
  raise notice 'OK: contrato sincroniza honorário (soma=500)';
end $$;

do $$ declare s titulo_status; begin
  reset role;
  insert into titulo (id, cliente_id, contrato_id, origem, valor, competencia, vencimento)
    values ('eeeeeeee-0000-0000-0000-0000000000c1','aaaaaaaa-0000-0000-0000-0000000000c1',null,'MENSALIDADE',100,'2026-07-01','2026-07-10')
    on conflict do nothing;
  insert into baixa (titulo_id, data_recebimento, valor_recebido, conta_bancaria_id, forma_pagamento)
    values ('eeeeeeee-0000-0000-0000-0000000000c1','2026-07-05',40,'bbbbbbbb-0000-0000-0000-0000000000f1','PIX');
  select status into s from titulo where id='eeeeeeee-0000-0000-0000-0000000000c1';
  if s <> 'BAIXADO_PARCIAL' then raise exception 'FALHA: status parcial errado (=%)', s; end if;
  insert into baixa (titulo_id, data_recebimento, valor_recebido, conta_bancaria_id, forma_pagamento)
    values ('eeeeeeee-0000-0000-0000-0000000000c1','2026-07-06',60,'bbbbbbbb-0000-0000-0000-0000000000f1','PIX');
  select status into s from titulo where id='eeeeeeee-0000-0000-0000-0000000000c1';
  if s <> 'BAIXADO' then raise exception 'FALHA: status total errado (=%)', s; end if;
  raise notice 'OK: baixas recalculam status (parcial -> total)';
end $$;

-- ===== V6.2 — RPC gerar_mensalidades =====
do $$ declare r1 jsonb; r2 jsonb; v numeric; n int; begin
  reset role;
  insert into clientes (id, tipo_pessoa, razao_social, cpf_cnpj, regime_tributario)
    values ('aaaaaaaa-0000-0000-0000-0000000000d1','PJ','Cli ProRata','55000000000272','Simples') on conflict do nothing;
  insert into contrato (id, cliente_id, descricao, valor_mensal, dia_vencimento, data_inicio, gera_decimo_terceiro, mes_decimo_terceiro)
    values ('dddddddd-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000d1','X',3100,10,'2026-07-16',true,7)
    on conflict do nothing;

  r1 := gerar_mensalidades('2026-07-01');
  select valor into v from titulo where contrato_id='dddddddd-0000-0000-0000-0000000000d1' and origem='MENSALIDADE';
  if v is distinct from 1600.00 then raise exception 'FALHA: pró-rata <> 1600 (=%)', v; end if;
  -- 0071: o 13º saiu do laço de contratos e passou a ser gerado POR CLIENTE, na rodada de outubro.
  -- Se voltasse a ser gerado aqui, um cliente com contrato receberia a cobrança duas vezes.
  select count(*) into n from titulo where contrato_id='dddddddd-0000-0000-0000-0000000000d1' and origem='DECIMO_TERCEIRO';
  if n <> 0 then raise exception 'FALHA: 13º ainda é gerado pelo contrato (n=%) — deve ser por cliente', n; end if;

  r2 := gerar_mensalidades('2026-07-01');
  select count(*) into n from titulo where contrato_id='dddddddd-0000-0000-0000-0000000000d1';
  if n <> 1 then raise exception 'FALHA: geração duplicou (n=%, esperado só a mensalidade)', n; end if;

  perform encerrar_contrato('dddddddd-0000-0000-0000-0000000000d1', now()::date, 'teste');
  select count(*) into n from titulo where contrato_id='dddddddd-0000-0000-0000-0000000000d1' and status='CANCELADO';
  if n < 1 then raise exception 'FALHA: encerramento não cancelou títulos futuros'; end if;

  raise notice 'OK: gerar_mensalidades (pró-rata 1600, 13º, idempotente, encerramento cancela)';
end $$;

-- ===== V6.5 — RPCs de relatório =====
do $$ declare d jsonb; ag jsonb; fx jsonb; begin
  reset role;
  insert into clientes (id, tipo_pessoa, razao_social, cpf_cnpj, regime_tributario)
    values ('aaaaaaaa-0000-0000-0000-0000000000e1','PJ','Cli Relatorio','55000000000353','Simples') on conflict do nothing;
  insert into contrato (id, cliente_id, descricao, valor_mensal, dia_vencimento, data_inicio)
    values ('dddddddd-0000-0000-0000-0000000000e1','aaaaaaaa-0000-0000-0000-0000000000e1','R',777,10,'2026-01-01') on conflict do nothing;
  insert into titulo (id, cliente_id, contrato_id, origem, valor, competencia, vencimento)
    values ('eeeeeeee-0000-0000-0000-0000000000e1','aaaaaaaa-0000-0000-0000-0000000000e1','dddddddd-0000-0000-0000-0000000000e1','MENSALIDADE',777,'2000-01-01','2000-01-10')
    on conflict do nothing;

  d := financeiro_dashboard('2026-07-01');
  if (d->>'mrr')::numeric < 777 then raise exception 'FALHA: MRR não inclui contrato (=%)', d->>'mrr'; end if;
  if (d->>'inadimplencia_total')::numeric < 777 then raise exception 'FALHA: inadimplência não inclui vencido (=%)', d->>'inadimplencia_total'; end if;

  ag := financeiro_aging();
  if (ag->'d90_mais'->>'total')::numeric < 777 then raise exception 'FALHA: aging d90_mais não inclui o vencido (=%)', ag->'d90_mais'->>'total'; end if;

  fx := financeiro_fluxo_caixa(6);
  if jsonb_array_length(fx) <> 6 then raise exception 'FALHA: fluxo não tem 6 meses (=%)', jsonb_array_length(fx); end if;

  raise notice 'OK: RPCs de relatório (MRR/inadimplência/aging d90_mais/fluxo 6 meses)';
end $$;

-- ===== V6.3 — RLS de contas a pagar + estorno =====
reset role;
insert into fornecedor (id, nome) values ('ffffffff-0000-0000-0000-000000000001','Fornecedor Teste') on conflict do nothing;
insert into titulo (id, tipo, fornecedor_id, origem, valor, competencia, vencimento)
  values ('eeeeeeee-0000-0000-0000-0000000000a1','PAGAR','ffffffff-0000-0000-0000-000000000001','DESPESA_AVULSA',300,'2026-07-01','2026-07-15')
  on conflict do nothing;

-- ASSERT P1: contador NÃO vê contas a pagar (cliente nulo => não casa)
do $$ declare n int; begin
  perform _simular('00000000-0000-0000-0000-000000000003');
  select count(*) into n from titulo where tipo='PAGAR'; if n <> 0 then raise exception 'FALHA: contador viu PAGAR (n=%)', n; end if;
  raise notice 'OK: contador não vê contas a pagar';
end $$;

-- ASSERT P2: financeiro gerencia despesa_recorrente
do $$ begin
  perform _simular('00000000-0000-0000-0000-000000000004');
  insert into despesa_recorrente (descricao, fornecedor_id, valor_mensal, dia_vencimento, data_inicio) values ('Aluguel','ffffffff-0000-0000-0000-000000000001',1000,5,'2026-01-01');
  raise notice 'OK: financeiro gerencia despesa_recorrente';
end $$;

-- ASSERT P3: assistente NÃO vê despesa_recorrente
do $$ declare n int; begin
  perform _simular('00000000-0000-0000-0000-000000000002');
  select count(*) into n from despesa_recorrente; if n <> 0 then raise exception 'FALHA: assistente viu despesa_recorrente'; end if;
  raise notice 'OK: assistente não vê despesa_recorrente';
end $$;

-- ASSERT P4: estorno marca (não deleta) e recomputa status
do $$ declare s titulo_status; n int; begin
  reset role;
  insert into baixa (id, titulo_id, data_recebimento, valor_recebido, conta_bancaria_id, forma_pagamento)
    values ('cccccccc-0000-0000-0000-0000000000a1','eeeeeeee-0000-0000-0000-0000000000a1','2026-07-15',300,'bbbbbbbb-0000-0000-0000-0000000000f1','PIX');
  select status into s from titulo where id='eeeeeeee-0000-0000-0000-0000000000a1';
  if s <> 'BAIXADO' then raise exception 'FALHA: pagar não ficou BAIXADO (=%)', s; end if;
  update baixa set estornada=true, estorno_motivo='erro', estorno_em=now() where id='cccccccc-0000-0000-0000-0000000000a1';
  select status into s from titulo where id='eeeeeeee-0000-0000-0000-0000000000a1';
  if s <> 'ABERTO' then raise exception 'FALHA: estorno não voltou p/ ABERTO (=%)', s; end if;
  select count(*) into n from baixa where id='cccccccc-0000-0000-0000-0000000000a1';
  if n <> 1 then raise exception 'FALHA: estorno deletou a baixa (trilha perdida)'; end if;
  raise notice 'OK: estorno marca (não deleta) e volta status p/ ABERTO';
end $$;

-- ===== V6.3 — RPC gerar_despesas_recorrentes + dashboard com saídas =====
do $$ declare r jsonb; d jsonb; n int; begin
  reset role;
  insert into despesa_recorrente (id, descricao, fornecedor_id, valor_mensal, dia_vencimento, data_inicio)
    values ('99999999-0000-0000-0000-0000000000d1','Software','ffffffff-0000-0000-0000-000000000001',500,10,'2026-01-01') on conflict do nothing;
  r := gerar_despesas_recorrentes('2026-07-01');
  select count(*) into n from titulo where grupo_parcelamento_id='99999999-0000-0000-0000-0000000000d1' and origem='DESPESA_RECORRENTE';
  if n <> 1 then raise exception 'FALHA: recorrente não gerou 1 título (n=%)', n; end if;
  r := gerar_despesas_recorrentes('2026-07-01');
  select count(*) into n from titulo where grupo_parcelamento_id='99999999-0000-0000-0000-0000000000d1' and origem='DESPESA_RECORRENTE';
  if n <> 1 then raise exception 'FALHA: recorrente duplicou (n=%)', n; end if;

  d := financeiro_dashboard('2026-07-01');
  if (d->>'a_pagar_mes')::numeric < 500 then raise exception 'FALHA: a_pagar_mes não considera despesas (=%)', d->>'a_pagar_mes'; end if;
  if not (d ? 'saldo_real') then raise exception 'FALHA: dashboard sem saldo_real'; end if;
  raise notice 'OK: despesas recorrentes (idempotente) + dashboard com a_pagar/saldo_real';
end $$;

-- ===== V7.1 — RLS de WhatsApp =====
reset role;
insert into whatsapp_mensagem (id, cliente_id, telefone, texto, status)
  values ('11111111-0000-0000-0000-00000000fa01','aaaaaaaa-0000-0000-0000-000000000001','5534999','oi','ENVIADO')
  on conflict do nothing;

-- ASSERT W1: assistente NÃO vê config nem histórico
do $$ declare n int; begin
  perform _simular('00000000-0000-0000-0000-000000000002');
  select count(*) into n from whatsapp_config; if n <> 0 then raise exception 'FALHA: assistente viu config wa'; end if;
  select count(*) into n from whatsapp_mensagem; if n <> 0 then raise exception 'FALHA: assistente viu histórico wa'; end if;
  raise notice 'OK: assistente não vê WhatsApp';
end $$;

-- ASSERT W2: contador vê o histórico do SEU cliente; NÃO vê a config
do $$ declare n int; begin
  perform _simular('00000000-0000-0000-0000-000000000003');
  select count(*) into n from whatsapp_mensagem where cliente_id='aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'FALHA: contador não viu histórico do seu cliente (n=%)', n; end if;
  select count(*) into n from whatsapp_config; if n <> 0 then raise exception 'FALHA: contador viu config wa (só admin)'; end if;
  raise notice 'OK: contador vê histórico do próprio cliente, não a config';
end $$;

-- ASSERT W3: admin gerencia a config
do $$ begin
  perform _simular('00000000-0000-0000-0000-000000000001');
  update whatsapp_config set instance='inst-teste' where id=1;
  raise notice 'OK: admin gerencia config wa';
end $$;

-- ===== V7.2 — RLS de régua + idempotência =====
-- ASSERT R1: assistente NÃO gerencia regua_etapa
do $$ declare n int; begin
  perform _simular('00000000-0000-0000-0000-000000000002');
  select count(*) into n from regua_etapa; if n <> 0 then raise exception 'FALHA: assistente viu regua_etapa'; end if;
  raise notice 'OK: assistente não vê regua_etapa';
end $$;

-- ASSERT R2: financeiro gerencia regua_etapa
do $$ declare n int; begin
  perform _simular('00000000-0000-0000-0000-000000000004');
  select count(*) into n from regua_etapa where ativa; if n < 4 then raise exception 'FALHA: financeiro não vê etapas seed (n=%)', n; end if;
  update regua_etapa set ordem = ordem where dias_offset = -3;
  raise notice 'OK: financeiro gerencia regua_etapa';
end $$;

-- ASSERT R3: unique parcial barra 2ª etapa ativa no mesmo offset
do $$ declare erro boolean := false; begin
  reset role;
  begin
    insert into regua_etapa (nome, dias_offset, template) values ('dup', -3, 'x');
  exception when unique_violation then erro := true; end;
  if not erro then raise exception 'FALHA: permitiu 2 etapas ativas no mesmo offset'; end if;
  raise notice 'OK: unique (dias_offset) where ativa barra duplicata';
end $$;

-- ASSERT R4: unique (titulo_id, etapa_id) barra reenvio da mesma etapa
do $$ declare erro boolean := false; v_etapa uuid; begin
  reset role;
  select id into v_etapa from regua_etapa where dias_offset = 1 limit 1;
  insert into whatsapp_mensagem (id, titulo_id, etapa_id, telefone, texto, status)
    values ('22222222-0000-0000-0000-0000000000e1','eeeeeeee-0000-0000-0000-0000000000a1', v_etapa, '5534','x','ENVIADO') on conflict do nothing;
  begin
    insert into whatsapp_mensagem (titulo_id, etapa_id, telefone, texto, status)
      values ('eeeeeeee-0000-0000-0000-0000000000a1', v_etapa, '5534','y','ENVIADO');
  exception when unique_violation then erro := true; end;
  if not erro then raise exception 'FALHA: permitiu reenvio da mesma etapa para o título'; end if;
  raise notice 'OK: idempotência (titulo_id, etapa_id)';
end $$;

-- ===== V7.3 — atendimento: thread + dedup =====
-- entrada de um cliente do contador (aaaa..001)
reset role;
insert into whatsapp_mensagem (id, cliente_id, telefone, texto, status, direcao, lida, z_message_id)
  values ('33333333-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-000000000001','5534000','oi entrada','RECEBIDO','IN',false,'ZID-1')
  on conflict do nothing;

-- ASSERT A1: contador vê a entrada do SEU cliente
do $$ declare n int; begin
  perform _simular('00000000-0000-0000-0000-000000000003');
  select count(*) into n from whatsapp_mensagem where telefone='5534000' and direcao='IN';
  if n <> 1 then raise exception 'FALHA: contador não viu entrada do seu cliente (n=%)', n; end if;
  raise notice 'OK: contador vê thread do próprio cliente';
end $$;

-- ASSERT A2: assistente NÃO vê a entrada
do $$ declare n int; begin
  perform _simular('00000000-0000-0000-0000-000000000002');
  select count(*) into n from whatsapp_mensagem where telefone='5534000';
  if n <> 0 then raise exception 'FALHA: assistente viu thread'; end if;
  raise notice 'OK: assistente não vê atendimento';
end $$;

-- ASSERT A3: dedup por z_message_id
do $$ declare erro boolean := false; begin
  reset role;
  begin
    insert into whatsapp_mensagem (telefone, texto, status, direcao, z_message_id)
      values ('5534000','dup','RECEBIDO','IN','ZID-1');
  exception when unique_violation then erro := true; end;
  if not erro then raise exception 'FALHA: permitiu z_message_id duplicado'; end if;
  raise notice 'OK: dedup por z_message_id';
end $$;

-- ===== Vencimentos: financeiro fora; contador escopado; RPC da NFS-e não vaza cliente alheio =====
reset role;
insert into nfse_certificado_cliente (cliente_id, nome_arquivo, validade)
  values ('aaaaaaaa-0000-0000-0000-000000000002', 'teste.pfx', now() + interval '30 days')
  on conflict (cliente_id) do nothing;

do $$
declare n int;
begin
  -- admin cadastra um certificado e uma procuração para o cliente do CONTADOR (…001)
  perform _simular('00000000-0000-0000-0000-000000000001'); -- admin
  insert into certificado_digital (cliente_id, tipo, titular, validade)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'A1', 'Titular Teste', current_date + 10);
  insert into procuracao (cliente_id, orgao, outorgante, validade)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'e-CAC', 'Outorgante Teste', current_date + 40);
  -- e um certificado para o cliente do ADMIN (…002), alheio ao contador
  insert into certificado_digital (cliente_id, tipo, titular, validade)
    values ('aaaaaaaa-0000-0000-0000-000000000002', 'A3', 'Outro Titular', current_date + 5);

  -- financeiro NÃO vê nada (a política já nasce fechada para ele)
  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro
  select count(*) into n from certificado_digital;
  if n <> 0 then raise exception 'FALHA: financeiro viu % certificado_digital (devia ser 0)', n; end if;
  select count(*) into n from procuracao;
  if n <> 0 then raise exception 'FALHA: financeiro viu % procuracao (devia ser 0)', n; end if;
  select count(*) into n from certificados_nfse_vencimento();
  if n <> 0 then raise exception 'FALHA: financeiro obteve linhas da RPC da NFS-e (devia ser 0)'; end if;

  -- contador vê os do SEU cliente…
  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador
  select count(*) into n from certificado_digital where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'FALHA: contador não viu o certificado do seu cliente (viu %)', n; end if;
  select count(*) into n from procuracao where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'FALHA: contador não viu a procuração do seu cliente (viu %)', n; end if;
  -- …e NÃO vê os do cliente alheio
  select count(*) into n from certificado_digital where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'FALHA: contador viu certificado de cliente alheio'; end if;
  -- a RPC (SECURITY DEFINER) também não vaza o certificado NFS-e do cliente alheio
  select count(*) into n from certificados_nfse_vencimento()
    where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'FALHA: RPC da NFS-e vazou cliente alheio ao contador'; end if;

  -- assistente vê os dois clientes
  perform _simular('00000000-0000-0000-0000-000000000002'); -- assistente
  select count(*) into n from certificado_digital
    where cliente_id in ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002');
  if n <> 2 then raise exception 'FALHA: assistente viu % certificados (esperado 2)', n; end if;

  raise notice 'OK: vencimentos — financeiro fora, contador escopado, RPC da NFS-e não vaza';
end $$;

-- ===== Faturamento em regime vencido: competência do serviço, vencimento no mês seguinte =====
do $$
declare v_venc date; v_comp date; n int; v_p1 numeric; v_p2 numeric;
begin
  reset role;

  -- competencia_padrao devolve o mês anterior (fronteiras: virada de ano)
  if competencia_padrao(date '2026-01-15') <> date '2025-12-01' then
    raise exception 'FALHA: competencia_padrao não virou o ano';
  end if;
  if competencia_padrao(date '2026-03-01') <> date '2026-02-01' then
    raise exception 'FALHA: competencia_padrao errou o mês anterior';
  end if;
  if competencia_padrao(date '2026-08-31') <> date '2026-07-01' then
    raise exception 'FALHA: competencia_padrao dependeu do dia do mês';
  end if;
  raise notice 'OK: competencia_padrao devolve o mês anterior';

  -- cliente de teste com honorário 333.33 e vencimento dia 10
  update clientes_financeiro set honorario_mensal = 333.33, dia_vencimento = 10
    where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002';

  -- a mensalidade de maio vence em JUNHO
  perform gerar_mensalidades(date '2026-05-01');
  select vencimento into v_venc from titulo
    where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002'
      and origem = 'MENSALIDADE' and competencia = date '2026-05-01';
  if v_venc is distinct from date '2026-06-10' then
    raise exception 'FALHA: mensalidade de maio venceu em % (esperado 2026-06-10)', v_venc;
  end if;
  raise notice 'OK: mensalidade da competência M vence em M+1';

  -- a rodada de maio NÃO gera 13º
  select count(*) into n from titulo
    where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002' and origem = 'DECIMO_TERCEIRO';
  if n <> 0 then raise exception 'FALHA: rodada de maio gerou % títulos de 13º', n; end if;

  -- a rodada de OUTUBRO gera as duas parcelas, com vencimentos fixos
  perform gerar_mensalidades(date '2026-10-01');
  select count(*) into n from titulo
    where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002' and origem = 'DECIMO_TERCEIRO';
  if n <> 2 then raise exception 'FALHA: rodada de outubro gerou % parcelas de 13º (esperado 2)', n; end if;

  select competencia, vencimento, valor into v_comp, v_venc, v_p1 from titulo
    where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002' and origem = 'DECIMO_TERCEIRO' and parcela = 1;
  if v_comp <> date '2026-11-01' or v_venc <> date '2026-11-20' then
    raise exception 'FALHA: 13º 1/2 com competência % e vencimento % (esperado 2026-11-01 / 2026-11-20)', v_comp, v_venc;
  end if;

  select competencia, vencimento, valor into v_comp, v_venc, v_p2 from titulo
    where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002' and origem = 'DECIMO_TERCEIRO' and parcela = 2;
  if v_comp <> date '2026-12-01' or v_venc <> date '2026-12-15' then
    raise exception 'FALHA: 13º 2/2 com competência % e vencimento % (esperado 2026-12-01 / 2026-12-15)', v_comp, v_venc;
  end if;
  raise notice 'OK: 13º em duas parcelas, vencimentos 20/11 e 15/12';

  -- a soma das parcelas é exata (nem cria nem perde centavo)
  if v_p1 <> 166.67 or v_p2 <> 166.66 or (v_p1 + v_p2) <> 333.33 then
    raise exception 'FALHA: parcelas do 13º somam % (% + %), esperado 333.33', v_p1 + v_p2, v_p1, v_p2;
  end if;
  raise notice 'OK: parcelas do 13º somam o honorário exato (166.67 + 166.66)';

  -- idempotência: rodar de novo não duplica
  perform gerar_mensalidades(date '2026-10-01');
  select count(*) into n from titulo
    where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002' and origem = 'DECIMO_TERCEIRO';
  if n <> 2 then raise exception 'FALHA: segunda rodada duplicou o 13º (% títulos)', n; end if;
  raise notice 'OK: geração é idempotente';
end $$;

-- ===== Vigências: captura por trigger, sem poluir o histórico =====
do $$
declare n int; v numeric; v_mes date := date_trunc('month', now())::date;
begin
  reset role;

  -- (1) INSERT em clientes_financeiro não explode (OLD não existe no INSERT) e cria a vigência
  insert into clientes (id, tipo_pessoa, razao_social, cpf_cnpj, regime_tributario)
    values ('aaaaaaaa-0000-0000-0000-0000000000f9','PJ','Cli Vigencia','55000000000999','Simples')
    on conflict do nothing;
  insert into clientes_financeiro (cliente_id, honorario_mensal)
    values ('aaaaaaaa-0000-0000-0000-0000000000f9', 500.00)
    on conflict (cliente_id) do update set honorario_mensal = 500.00;
  select count(*) into n from honorario_vigencia where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000f9';
  if n <> 1 then raise exception 'FALHA: insert não criou vigência de honorário (n=%)', n; end if;
  raise notice 'OK: insert em clientes_financeiro cria vigência (e não explode com OLD)';

  -- o insert do cliente criou a vigência de regime
  select count(*) into n from regime_vigencia where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000f9';
  if n <> 1 then raise exception 'FALHA: insert de cliente não criou vigência de regime (n=%)', n; end if;

  -- (2) update que NÃO muda o honorário não cria vigência
  update clientes_financeiro set dia_vencimento = 15 where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000f9';
  update clientes_financeiro set honorario_mensal = 500.00 where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000f9';
  select count(*) into n from honorario_vigencia where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000f9';
  if n <> 1 then raise exception 'FALHA: update sem mudança poluiu o histórico (n=%)', n; end if;
  raise notice 'OK: update que não muda o valor não cria vigência';

  -- (3) duas mudanças no mesmo mês => UMA linha, com o último valor
  update clientes_financeiro set honorario_mensal = 600.00 where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000f9';
  update clientes_financeiro set honorario_mensal = 700.00 where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000f9';
  select count(*) into n from honorario_vigencia
    where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000f9' and vigente_de = v_mes;
  if n <> 1 then raise exception 'FALHA: duas mudanças no mesmo mês criaram % linhas', n; end if;
  select valor into v from honorario_vigencia
    where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000f9' and vigente_de = v_mes;
  if v <> 700.00 then raise exception 'FALHA: a última mudança do mês não venceu (valor=%)', v; end if;
  raise notice 'OK: duas mudanças no mesmo mês => uma linha, último valor';

  -- (4) mudança de regime cria vigência de regime (comparação por contagem: `regime` é enum)
  update clientes set regime_tributario = 'Presumido' where id = 'aaaaaaaa-0000-0000-0000-0000000000f9';
  select count(*) into n from regime_vigencia
    where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000f9'
      and vigente_de = v_mes and regime = 'Presumido';
  if n <> 1 then raise exception 'FALHA: mudança de regime não criou vigência (n=%)', n; end if;
  raise notice 'OK: mudança de regime cria vigência';

  -- (5) honorario_vigente devolve o valor DA ÉPOCA, não o atual
  insert into honorario_vigencia (cliente_id, valor, vigente_de, estimada)
    values ('aaaaaaaa-0000-0000-0000-0000000000f9', 300.00, date '2025-01-01', false)
    on conflict do nothing;
  if honorario_vigente('aaaaaaaa-0000-0000-0000-0000000000f9', date '2025-06-01') <> 300.00 then
    raise exception 'FALHA: honorario_vigente não devolveu o valor da época';
  end if;
  if honorario_vigente('aaaaaaaa-0000-0000-0000-0000000000f9', v_mes) <> 700.00 then
    raise exception 'FALHA: honorario_vigente não devolveu o valor corrente';
  end if;
  raise notice 'OK: honorario_vigente resolve pela competência';

  -- (6) gerar_mensalidades de uma competência antiga usa o honorário daquela competência
  perform gerar_mensalidades(date '2025-06-01');
  select valor into v from titulo
    where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000f9'
      and origem = 'MENSALIDADE' and competencia = date '2025-06-01';
  if v is distinct from 300.00 then
    raise exception 'FALHA: geração retroativa cobrou % (esperado 300.00, o valor da época)', v;
  end if;
  raise notice 'OK: geração retroativa usa o honorário da época';
end $$;

-- ===== Reajuste: trava por ano, aplicação cria vigência, desfazer limpa o rastro =====
do $$
declare n int; v numeric; v_mes date; v_item uuid;
begin
  reset role;
  insert into clientes (id, tipo_pessoa, razao_social, cpf_cnpj, regime_tributario)
    values ('aaaaaaaa-0000-0000-0000-0000000000fa','PJ','Cli Reajuste','55000000000888','Simples')
    on conflict do nothing;
  insert into clientes_financeiro (cliente_id, honorario_mensal)
    values ('aaaaaaaa-0000-0000-0000-0000000000fa', 500.00)
    on conflict (cliente_id) do update set honorario_mensal = 500.00;

  -- limpa vigências criadas pelo insert acima, para medir só o efeito do reajuste
  delete from honorario_vigencia where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000fa';

  -- aplica um reajuste: sobe o honorário (cria a vigência via trigger) + registra
  update clientes_financeiro set honorario_mensal = 533.93 where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000fa';
  insert into reajuste_item (cliente_id, ano_base, indice, percentual, valor_anterior, valor_novo)
    values ('aaaaaaaa-0000-0000-0000-0000000000fa', 2027, 'SALARIO_MINIMO', 6.785, 500.00, 533.93)
    returning id into v_item;

  v_mes := date_trunc('month', now())::date;
  select count(*) into n from honorario_vigencia
    where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000fa' and vigente_de = v_mes;
  if n <> 1 then raise exception 'FALHA: reajuste não criou a vigência (n=%)', n; end if;
  raise notice 'OK: aplicar reajuste cria a vigência (via trigger da Fatia B)';

  -- trava: um segundo reajuste no mesmo ano-base é barrado
  begin
    insert into reajuste_item (cliente_id, ano_base, indice, percentual, valor_anterior, valor_novo)
      values ('aaaaaaaa-0000-0000-0000-0000000000fa', 2027, 'IPCA', 5, 533.93, 560.00);
    raise exception 'FALHA: a trava por ano-base não barrou o segundo reajuste';
  exception when unique_violation then
    raise notice 'OK: trava (cliente, ano_base) barra reajuste duplicado';
  end;

  -- desfazer: volta o honorário, remove a vigência do mês e apaga o registro — sem rastro.
  -- Mede a vigência pelo MESMO mês que a função usa (date_trunc do criado_em do item).
  select date_trunc('month', criado_em)::date into v_mes from reajuste_item where id = v_item;
  perform desfazer_reajuste(v_item);
  select honorario_mensal into v from clientes_financeiro where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000fa';
  if v <> 500.00 then raise exception 'FALHA: desfazer não voltou o honorário (=%)', v; end if;
  select count(*) into n from honorario_vigencia
    where cliente_id = 'aaaaaaaa-0000-0000-0000-0000000000fa' and vigente_de = v_mes;
  if n <> 0 then raise exception 'FALHA: desfazer não removeu a vigência (n=%)', n; end if;
  select count(*) into n from reajuste_item where id = v_item;
  if n <> 0 then raise exception 'FALHA: desfazer não removeu o registro'; end if;
  raise notice 'OK: desfazer volta o honorário, remove a vigência e o registro (sem rastro)';
end $$;

-- ASSERT: escritorio_config — todos leem (select true); só admin escreve
do $$
declare n int; v_nome text;
begin
  reset role;
  update escritorio_config set nome = 'Base' where id = 1; -- garante estado conhecido

  -- financeiro LÊ a marca (whitelabel visível a todos)
  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro
  select count(*) into n from escritorio_config where id = 1;
  if n <> 1 then raise exception 'FALHA: financeiro não leu escritorio_config (n=%)', n; end if;

  -- financeiro NÃO altera (update sem efeito pela RLS)
  update escritorio_config set nome = 'Hack' where id = 1;
  reset role;
  select nome into v_nome from escritorio_config where id = 1;
  if v_nome <> 'Base' then raise exception 'FALHA: financeiro alterou a marca (nome=%)', v_nome; end if;
  raise notice 'OK: financeiro lê a marca mas não altera';

  -- admin ALTERA com efeito
  perform _simular('00000000-0000-0000-0000-000000000001'); -- admin
  update escritorio_config set nome = 'Escritório X' where id = 1;
  reset role;
  select nome into v_nome from escritorio_config where id = 1;
  if v_nome <> 'Escritório X' then raise exception 'FALHA: admin não alterou a marca (nome=%)', v_nome; end if;
  raise notice 'OK: admin altera a marca do escritório';
end $$;

-- ASSERT: escritorio_config.proposta_modelo — só admin escreve
do $$
declare v text;
begin
  reset role;
  update escritorio_config set proposta_modelo = 'padrao' where id = 1;

  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro
  update escritorio_config set proposta_modelo = 'proprio' where id = 1;
  reset role;
  select proposta_modelo into v from escritorio_config where id = 1;
  if v <> 'padrao' then raise exception 'FALHA: financeiro alterou proposta_modelo (=%)', v; end if;

  perform _simular('00000000-0000-0000-0000-000000000001'); -- admin
  update escritorio_config set proposta_modelo = 'proprio' where id = 1;
  reset role;
  select proposta_modelo into v from escritorio_config where id = 1;
  if v <> 'proprio' then raise exception 'FALHA: admin não alterou proposta_modelo (=%)', v; end if;
  raise notice 'OK: só admin altera proposta_modelo';
end $$;

-- ASSERT: cliente_responsavel — contador escreve só no cliente dele; admin em qualquer; financeiro não
do $$
declare n int;
begin
  -- contador atribui no PRÓPRIO cliente (…001 é dele) -> efeito
  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador
  insert into cliente_responsavel (cliente_id, departamento, usuario_id)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'fiscal', '00000000-0000-0000-0000-000000000003')
    on conflict (cliente_id, departamento) do update set usuario_id = excluded.usuario_id;
  reset role;
  select count(*) into n from cliente_responsavel where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000001' and departamento = 'fiscal';
  if n <> 1 then raise exception 'FALHA: contador não gravou responsável no próprio cliente (n=%)', n; end if;

  -- contador tenta no cliente de OUTRO (…002 é do admin) -> negado pela RLS
  perform _simular('00000000-0000-0000-0000-000000000003');
  begin
    insert into cliente_responsavel (cliente_id, departamento, usuario_id)
      values ('aaaaaaaa-0000-0000-0000-000000000002', 'fiscal', '00000000-0000-0000-0000-000000000003');
    raise exception 'FALHA: contador gravou responsável em cliente de outro';
  exception when insufficient_privilege then null; -- esperado
  end;

  -- financeiro NÃO escreve
  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro
  begin
    insert into cliente_responsavel (cliente_id, departamento, usuario_id)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'contabil', '00000000-0000-0000-0000-000000000004');
    raise exception 'FALHA: financeiro gravou responsável';
  exception when insufficient_privilege then null; -- esperado
  end;

  -- admin atribui em QUALQUER cliente -> efeito
  perform _simular('00000000-0000-0000-0000-000000000001'); -- admin
  insert into cliente_responsavel (cliente_id, departamento, usuario_id)
    values ('aaaaaaaa-0000-0000-0000-000000000002', 'contabil', '00000000-0000-0000-0000-000000000001')
    on conflict (cliente_id, departamento) do update set usuario_id = excluded.usuario_id;
  reset role;
  select count(*) into n from cliente_responsavel where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002' and departamento = 'contabil';
  if n <> 1 then raise exception 'FALHA: admin não gravou responsável (n=%)', n; end if;

  raise notice 'OK: cliente_responsavel — contador só no próprio, admin em qualquer, financeiro barrado';
end $$;

-- ASSERT: legalizacao — contador cria processo só no cliente dele; financeiro lê e não escreve
do $$
declare tpl uuid; proc uuid; n int;
begin
  reset role;
  insert into legalizacao_template (tipo, slug, nome) values ('baixa','tpl-teste-rls','TPL teste')
    on conflict (slug) do update set nome = excluded.nome returning id into tpl;

  -- contador cria no PRÓPRIO cliente (…001) -> efeito
  perform _simular('00000000-0000-0000-0000-000000000003');
  insert into legalizacao_processo (cliente_id, template_id, tipo, titulo, data_inicio)
    values ('aaaaaaaa-0000-0000-0000-000000000001', tpl, 'baixa', 'Baixa', current_date) returning id into proc;
  reset role;
  select count(*) into n from legalizacao_processo where id = proc;
  if n <> 1 then raise exception 'FALHA: contador não criou processo no próprio cliente'; end if;

  -- contador NÃO cria no cliente de outro (…002) -> barrado
  perform _simular('00000000-0000-0000-0000-000000000003');
  begin
    insert into legalizacao_processo (cliente_id, template_id, tipo, titulo, data_inicio)
      values ('aaaaaaaa-0000-0000-0000-000000000002', tpl, 'baixa', 'X', current_date);
    raise exception 'FALHA: contador criou processo em cliente de outro';
  exception when insufficient_privilege then null; end;

  -- financeiro LÊ mas NÃO escreve (update não afeta a linha)
  perform _simular('00000000-0000-0000-0000-000000000004');
  select count(*) into n from legalizacao_processo where id = proc;
  if n <> 1 then raise exception 'FALHA: financeiro não leu processo'; end if;
  update legalizacao_processo set titulo = 'hack' where id = proc;
  reset role;
  if exists (select 1 from legalizacao_processo where id = proc and titulo = 'hack') then
    raise exception 'FALHA: financeiro alterou processo';
  end if;

  raise notice 'OK: legalizacao — contador só no próprio, financeiro só lê';
end $$;

-- ASSERT: em_constituicao aceita CNPJ nulo; ativo sem CNPJ é barrado pela constraint
do $$
declare cid uuid; ok boolean;
begin
  reset role;
  insert into clientes (tipo_pessoa, razao_social, cpf_cnpj, regime_tributario, status)
    values ('PJ','Nova Em Constituicao', null, 'Simples', 'em_constituicao') returning id into cid;
  if cid is null then raise exception 'FALHA: não criou em_constituicao sem CNPJ'; end if;

  ok := true;
  begin
    insert into clientes (tipo_pessoa, razao_social, cpf_cnpj, regime_tributario, status)
      values ('PJ','Sem CNPJ Ativo', null, 'Simples', 'ativo');
  exception when check_violation then ok := false; end;
  if ok then raise exception 'FALHA: aceitou cliente ativo sem CNPJ'; end if;

  delete from clientes where id = cid;
  raise notice 'OK: em_constituicao aceita CNPJ nulo; ativo sem CNPJ barrado';
end $$;

-- ASSERT: legalizacao_template — só admin escreve (editor de modelos, Fatia B)
do $$
declare ok boolean;
begin
  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador
  ok := true;
  begin
    insert into legalizacao_template (tipo, slug, nome) values ('baixa','tpl-contador-rls','X');
    raise exception 'FALHA: contador criou template';
  exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'FALHA: contador criou template (sem erro)'; end if;

  perform _simular('00000000-0000-0000-0000-000000000001'); -- admin
  insert into legalizacao_template (tipo, slug, nome) values ('baixa','tpl-admin-rls','Y')
    on conflict (slug) do nothing;
  reset role;
  if not exists (select 1 from legalizacao_template where slug = 'tpl-admin-rls') then
    raise exception 'FALHA: admin não criou template';
  end if;
  raise notice 'OK: legalizacao_template só admin escreve';
end $$;

-- ASSERT: tarefa — admin edita qualquer; contador edita a que criou e não a de outro; financeiro não edita alheia
do $$
declare t_contador uuid; t_admin uuid; v text;
begin
  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador
  insert into tarefa (titulo) values ('Tarefa do contador') returning id into t_contador;
  perform _simular('00000000-0000-0000-0000-000000000001'); -- admin
  insert into tarefa (titulo) values ('Tarefa do admin') returning id into t_admin;

  -- contador edita a PRÓPRIA (criou) -> efeito
  perform _simular('00000000-0000-0000-0000-000000000003');
  update tarefa set titulo = 'Editada pelo contador' where id = t_contador;
  reset role;
  select titulo into v from tarefa where id = t_contador;
  if v <> 'Editada pelo contador' then raise exception 'FALHA: contador não editou a própria tarefa (=%)', v; end if;

  -- contador NÃO edita a do admin -> sem efeito
  perform _simular('00000000-0000-0000-0000-000000000003');
  update tarefa set titulo = 'hack' where id = t_admin;
  reset role;
  select titulo into v from tarefa where id = t_admin;
  if v = 'hack' then raise exception 'FALHA: contador editou tarefa de outro'; end if;

  -- financeiro NÃO edita a do admin -> sem efeito
  perform _simular('00000000-0000-0000-0000-000000000004');
  update tarefa set titulo = 'hack2' where id = t_admin;
  reset role;
  select titulo into v from tarefa where id = t_admin;
  if v = 'hack2' then raise exception 'FALHA: financeiro editou tarefa alheia'; end if;

  -- admin edita QUALQUER -> efeito
  perform _simular('00000000-0000-0000-0000-000000000001');
  update tarefa set titulo = 'Editada pelo admin' where id = t_contador;
  reset role;
  select titulo into v from tarefa where id = t_contador;
  if v <> 'Editada pelo admin' then raise exception 'FALHA: admin não editou tarefa de outro (=%)', v; end if;

  raise notice 'OK: tarefa — admin edita qualquer; contador/financeiro só as suas';
end $$;

-- =========================================================================
-- PORTAL DO CLIENTE — o bloco mais crítico: é a primeira superfície exposta
-- ao cliente final. Prova isolamento (só o que é dele), leitura-apenas e que
-- ele não enxerga nada da equipe.
-- =========================================================================
do $$
declare n int; ok boolean; v_obrig uuid; v_tit_a uuid; v_tit_b uuid;
begin
  reset role;
  -- Dados dos DOIS clientes, para provar o isolamento.
  -- chk_caminho_prefixo: o caminho DEVE começar com o id do cliente (barra caminho cruzado).
  insert into documentos (cliente_id, nome, caminho_storage) values
    ('aaaaaaaa-0000-0000-0000-000000000001','Doc do A','aaaaaaaa-0000-0000-0000-000000000001/doc-a.pdf'),
    ('aaaaaaaa-0000-0000-0000-000000000002','Doc do B','aaaaaaaa-0000-0000-0000-000000000002/doc-b.pdf')
    on conflict do nothing;

  insert into nfse (cliente_id, valor, competencia, ambiente) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 100, date_trunc('month', current_date)::date, 'homologacao'),
    ('aaaaaaaa-0000-0000-0000-000000000002', 200, date_trunc('month', current_date)::date, 'homologacao');

  select id into v_obrig from obrigacao limit 1;
  if v_obrig is not null then
    insert into obrigacao_instancia (obrigacao_id, cliente_id, competencia, vencimento_legal, vencimento_interno) values
      (v_obrig,'aaaaaaaa-0000-0000-0000-000000000001', date_trunc('month', current_date)::date, current_date, current_date),
      (v_obrig,'aaaaaaaa-0000-0000-0000-000000000002', date_trunc('month', current_date)::date, current_date, current_date)
      on conflict do nothing;
  end if;

  -- Competência antiga de propósito: uq_titulo_honorario(cliente, competencia, origem)
  -- já tem mensalidade do mês corrente semeada por outros blocos.
  insert into titulo (cliente_id, origem, valor, competencia, vencimento) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 'MENSALIDADE', 500, '2019-01-01', '2019-01-10')
    returning id into v_tit_a;
  insert into titulo (cliente_id, origem, valor, competencia, vencimento) values
    ('aaaaaaaa-0000-0000-0000-000000000002', 'MENSALIDADE', 900, '2019-01-01', '2019-01-10')
    returning id into v_tit_b;

  insert into boleto (titulo_id, provedor, valor, vencimento) values
    (v_tit_a, 'inter', 500, current_date),
    (v_tit_b, 'inter', 900, current_date);

  -- ===== o cliente do portal (…005, vinculado ao cliente A) =====
  perform _simular('00000000-0000-0000-0000-000000000005');

  -- (1) vê SÓ o próprio cadastro
  select count(*) into n from clientes;
  if n <> 1 then raise exception 'FALHA(portal): cliente vê % cadastros (esperado 1)', n; end if;
  select count(*) into n from clientes where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'FALHA(portal): o cadastro visível não é o dele'; end if;

  -- (2) vê SÓ os próprios documentos / notas / obrigações / títulos / boletos
  select count(*) into n from documentos;
  if n <> 1 then raise exception 'FALHA(portal): documentos visíveis = % (esperado 1)', n; end if;
  select count(*) into n from documentos where cliente_id <> 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'FALHA(portal): cliente vê documento de outro'; end if;

  select count(*) into n from nfse where cliente_id <> 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'FALHA(portal): cliente vê NFS-e de outro'; end if;

  select count(*) into n from obrigacao_instancia where cliente_id <> 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'FALHA(portal): cliente vê obrigação de outro'; end if;

  select count(*) into n from titulo where cliente_id <> 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'FALHA(portal): cliente vê título de outro'; end if;

  select count(*) into n from boleto;
  if n <> 1 then raise exception 'FALHA(portal): boletos visíveis = % (esperado 1)', n; end if;

  -- (3) NÃO escreve
  ok := true;
  begin
    -- caminho VÁLIDO de propósito: a barreira que queremos provar é a RLS, não a constraint.
    insert into documentos (cliente_id, nome, caminho_storage)
      values ('aaaaaaaa-0000-0000-0000-000000000001','Hack','aaaaaaaa-0000-0000-0000-000000000001/hack.pdf');
    raise exception 'FALHA(portal): cliente inseriu documento';
  exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'FALHA(portal): insert de documento não foi barrado'; end if;

  update clientes set razao_social = 'hack' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  reset role;
  select count(*) into n from clientes where id = 'aaaaaaaa-0000-0000-0000-000000000001' and razao_social = 'hack';
  if n <> 0 then raise exception 'FALHA(portal): cliente alterou o próprio cadastro'; end if;

  -- (4) NÃO vê nada da equipe
  perform _simular('00000000-0000-0000-0000-000000000005');
  select count(*) into n from tarefa;
  if n <> 0 then raise exception 'FALHA(portal): cliente vê tarefas da equipe (%)', n; end if;
  select count(*) into n from clientes_financeiro;
  if n <> 0 then raise exception 'FALHA(portal): cliente vê honorários'; end if;

  reset role;
  raise notice 'OK: portal — cliente vê só o que é dele, não escreve e não enxerga a equipe';
end $$;

-- ASSERT: constraint do vínculo — cliente exige cliente_id; equipe não pode ter
do $$
declare ok boolean;
begin
  reset role;
  -- Tiro o vínculo do usuário do portal (o papel continua 'cliente'). Não mexo no papel:
  -- o trigger anti-escalonamento reverteria a mudança e a constraint nem seria exercida.
  ok := true;
  begin
    update usuarios set cliente_id = null where id = '00000000-0000-0000-0000-000000000005';
    raise exception 'FALHA: aceitou papel cliente sem vínculo';
  exception when check_violation then ok := false; end;
  if ok then raise exception 'FALHA: cliente sem cliente_id não foi barrado'; end if;

  ok := true;
  begin
    update usuarios set cliente_id = 'aaaaaaaa-0000-0000-0000-000000000001' where id = '00000000-0000-0000-0000-000000000004';
    raise exception 'FALHA: aceitou equipe COM vínculo de cliente';
  exception when check_violation then ok := false; end;
  if ok then raise exception 'FALHA: equipe com cliente_id não foi barrada'; end if;

  raise notice 'OK: chk_usuario_cliente — cliente exige vínculo; equipe não pode ter';
end $$;

-- =========================================================================
-- PORTAL FATIA B — a PRIMEIRA escrita do papel 'cliente'. Prova que ele só
-- consegue enviar documento do próprio cadastro, marcado como origem='cliente',
-- e que continua sem poder alterar/apagar nada nem escrever no rastreio.
-- =========================================================================
do $$
declare n int; ok boolean; v_doc uuid;
begin
  perform _simular('00000000-0000-0000-0000-000000000005'); -- cliente do portal (cliente A)

  -- (1) ENVIA documento do próprio cadastro -> efeito
  insert into documentos (cliente_id, nome, caminho_storage, origem)
    values ('aaaaaaaa-0000-0000-0000-000000000001','Enviado pelo cliente','aaaaaaaa-0000-0000-0000-000000000001/envio.pdf','cliente')
    returning id into v_doc;
  reset role;
  select count(*) into n from documentos where id = v_doc and origem = 'cliente';
  if n <> 1 then raise exception 'FALHA(portal B): cliente não conseguiu enviar documento'; end if;

  -- (2) NÃO envia para o cadastro de OUTRO cliente
  perform _simular('00000000-0000-0000-0000-000000000005');
  ok := true;
  begin
    insert into documentos (cliente_id, nome, caminho_storage, origem)
      values ('aaaaaaaa-0000-0000-0000-000000000002','Invasao','aaaaaaaa-0000-0000-0000-000000000002/x.pdf','cliente');
    raise exception 'FALHA(portal B): cliente enviou documento para outro cadastro';
  exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'FALHA(portal B): envio para outro cadastro não foi barrado'; end if;

  -- (3) NÃO consegue se passar por documento do escritório (origem='escritorio')
  ok := true;
  begin
    insert into documentos (cliente_id, nome, caminho_storage, origem)
      values ('aaaaaaaa-0000-0000-0000-000000000001','Falso','aaaaaaaa-0000-0000-0000-000000000001/falso.pdf','escritorio');
    raise exception 'FALHA(portal B): cliente inseriu documento como origem escritorio';
  exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'FALHA(portal B): origem escritorio não foi barrada'; end if;

  -- (4) NÃO altera nem apaga documento (nem o que ele mesmo enviou)
  update documentos set nome = 'hack' where id = v_doc;
  reset role;
  select count(*) into n from documentos where id = v_doc and nome = 'hack';
  if n <> 0 then raise exception 'FALHA(portal B): cliente alterou documento'; end if;

  perform _simular('00000000-0000-0000-0000-000000000005');
  delete from documentos where id = v_doc;
  reset role;
  select count(*) into n from documentos where id = v_doc;
  if n <> 1 then raise exception 'FALHA(portal B): cliente apagou documento'; end if;

  -- (5) NÃO escreve no rastreio (portal_acesso não tem policy de INSERT)
  perform _simular('00000000-0000-0000-0000-000000000005');
  ok := true;
  begin
    insert into portal_acesso (cliente_id, tipo, ref_id)
      values ('aaaaaaaa-0000-0000-0000-000000000001','documento', v_doc);
    raise exception 'FALHA(portal B): cliente escreveu no rastreio';
  exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'FALHA(portal B): insert em portal_acesso não foi barrado'; end if;

  -- (6) NÃO escreve em tarefa (a tarefa automática é criada por service_role)
  ok := true;
  begin
    insert into tarefa (titulo) values ('tarefa do cliente');
    raise exception 'FALHA(portal B): cliente criou tarefa';
  exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'FALHA(portal B): insert em tarefa não foi barrado'; end if;

  reset role;
  raise notice 'OK: portal B — cliente só envia o próprio documento; não altera, não apaga, não escreve rastreio/tarefa';
end $$;

-- ASSERT: equipe LÊ o rastreio do seu cliente
do $$
declare n int;
begin
  reset role;
  insert into portal_acesso (cliente_id, tipo, ref_id, usuario_id)
    values ('aaaaaaaa-0000-0000-0000-000000000001','documento', gen_random_uuid(), '00000000-0000-0000-0000-000000000005');

  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador (dono do cliente A)
  select count(*) into n from portal_acesso where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n < 1 then raise exception 'FALHA: contador não lê o rastreio do próprio cliente'; end if;
  reset role;
  raise notice 'OK: equipe lê o rastreio do portal do seu cliente';
end $$;

-- =========================================================================
-- SOLICITAÇÕES (RF-054) — inclui o ANTI-FALSIFICAÇÃO apontado na revisão de
-- segurança: um DEFAULT não impede o envio explícito da coluna, então os
-- gatilhos (0088) sobrescrevem autoria e campos de gestão no servidor.
-- =========================================================================
do $$
declare s_id uuid; m_id uuid; n int; ok boolean; v_autor uuid; v_criado uuid; v_status text; v_prazo date;
begin
  -- ===== o CLIENTE do portal abre uma solicitação =====
  perform _simular('00000000-0000-0000-0000-000000000005');

  -- Tenta FORJAR tudo: autoria de outro, status resolvida, prazo folgado, responsável e tarefa.
  insert into solicitacao (cliente_id, categoria, assunto, status, prazo, responsavel_id, criado_por)
    values ('aaaaaaaa-0000-0000-0000-000000000001','duvida','Assunto',
            'aberta', '2099-12-31', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001')
    returning id into s_id;
  reset role;
  select criado_por, status::text, prazo into v_criado, v_status, v_prazo from solicitacao where id = s_id;
  if v_criado <> '00000000-0000-0000-0000-000000000005' then
    raise exception 'FALHA(solic): cliente forjou criado_por (=%)', v_criado;
  end if;
  if v_prazo = '2099-12-31' then raise exception 'FALHA(solic): cliente forjou o prazo do SLA'; end if;
  select count(*) into n from solicitacao where id = s_id and responsavel_id is null and tarefa_id is null;
  if n <> 1 then raise exception 'FALHA(solic): cliente forjou responsável/tarefa'; end if;

  -- NÃO abre solicitação em cadastro de OUTRO cliente
  perform _simular('00000000-0000-0000-0000-000000000005');
  ok := true;
  begin
    insert into solicitacao (cliente_id, categoria, assunto)
      values ('aaaaaaaa-0000-0000-0000-000000000002','duvida','Invasao');
    raise exception 'FALHA(solic): cliente abriu solicitação em cadastro alheio';
  exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'FALHA(solic): abertura em cadastro alheio não foi barrada'; end if;

  -- NÃO nasce 'resolvida': o gatilho NORMALIZA para 'aberta'. (O BEFORE trigger roda antes
  -- do WITH CHECK, então a tentativa não é rejeitada — é neutralizada, o que basta.)
  perform _simular('00000000-0000-0000-0000-000000000005');
  insert into solicitacao (cliente_id, categoria, assunto, status)
    values ('aaaaaaaa-0000-0000-0000-000000000001','duvida','Ja resolvida','resolvida')
    returning id into m_id;
  reset role;
  select status::text into v_status from solicitacao where id = m_id;
  if v_status <> 'aberta' then raise exception 'FALHA(solic): status forjado na abertura (=%)', v_status; end if;

  -- NÃO altera a solicitação (status/responsável são da equipe)
  perform _simular('00000000-0000-0000-0000-000000000005');
  update solicitacao set status = 'resolvida', responsavel_id = '00000000-0000-0000-0000-000000000005' where id = s_id;
  reset role;
  select status::text into v_status from solicitacao where id = s_id;
  if v_status = 'resolvida' then raise exception 'FALHA(solic): cliente alterou o status'; end if;

  -- ===== MENSAGENS: o cliente NÃO se passa pelo escritório =====
  perform _simular('00000000-0000-0000-0000-000000000005');
  insert into solicitacao_mensagem (solicitacao_id, corpo, autor_id)
    values (s_id, 'Mensagem forjada como se fosse o contador', '00000000-0000-0000-0000-000000000003')
    returning id into m_id;
  reset role;
  select autor_id into v_autor from solicitacao_mensagem where id = m_id;
  if v_autor <> '00000000-0000-0000-0000-000000000005' then
    raise exception 'FALHA(solic): cliente FORJOU a autoria da mensagem (=%) — impersonation', v_autor;
  end if;

  -- NÃO escreve mensagem em solicitação de outro cliente
  reset role;
  insert into solicitacao (cliente_id, categoria, assunto)
    values ('aaaaaaaa-0000-0000-0000-000000000002','duvida','Do cliente B') returning id into s_id;
  perform _simular('00000000-0000-0000-0000-000000000005');
  ok := true;
  begin
    insert into solicitacao_mensagem (solicitacao_id, corpo) values (s_id, 'Bisbilhotando');
    raise exception 'FALHA(solic): cliente escreveu em solicitação alheia';
  exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'FALHA(solic): mensagem em solicitação alheia não foi barrada'; end if;

  -- E não a enxerga
  select count(*) into n from solicitacao where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'FALHA(solic): cliente vê solicitação de outro'; end if;

  reset role;
  raise notice 'OK: solicitacao — cliente não forja autoria/SLA/status nem escreve em solicitação alheia';
end $$;

-- ASSERT: a EQUIPE gerencia (status, responsável, conversão em tarefa)
do $$
declare s_id uuid; v_status text;
begin
  reset role;
  insert into solicitacao (cliente_id, categoria, assunto)
    values ('aaaaaaaa-0000-0000-0000-000000000001','guia','Guia de marco') returning id into s_id;

  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador (dono do cliente A)
  update solicitacao set status = 'em_andamento', responsavel_id = '00000000-0000-0000-0000-000000000003' where id = s_id;
  insert into solicitacao_mensagem (solicitacao_id, corpo) values (s_id, 'Resposta do escritorio');
  reset role;
  select status::text into v_status from solicitacao where id = s_id;
  if v_status <> 'em_andamento' then raise exception 'FALHA(solic): equipe não atualizou o status (=%)', v_status; end if;

  raise notice 'OK: solicitacao — equipe atualiza status/responsável e responde';
end $$;

-- ============================================================================
-- E-mail integrado (RF-051) — 0089
-- ============================================================================

-- ASSERT: config de e-mail é só do admin (custódia de credencial)
do $$
declare n int; ok boolean := false;
begin
  reset role;
  update email_config set provedor = 'smtp', remetente_email = 'contato@escritorio.com', smtp_host = 'smtp.x.com' where id = 1;

  perform _simular('00000000-0000-0000-0000-000000000002'); -- assistente
  select count(*) into n from email_config;
  if n <> 0 then raise exception 'FALHA(email): assistente vê a config (e as credenciais)'; end if;
  begin
    update email_config set smtp_host = 'smtp.malicioso.com' where id = 1;
    ok := true;
  exception when insufficient_privilege then ok := false; end;
  reset role;
  -- sem policy de select, o update do assistente não casa linha alguma: o que importa é o host intacto
  perform 1 from email_config where id = 1 and smtp_host = 'smtp.x.com';
  if not found then raise exception 'FALHA(email): assistente alterou o host do SMTP'; end if;

  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro
  select count(*) into n from email_config;
  if n <> 0 then raise exception 'FALHA(email): financeiro vê a config'; end if;

  perform _simular('00000000-0000-0000-0000-000000000005'); -- cliente do portal
  select count(*) into n from email_config;
  if n <> 0 then raise exception 'FALHA(email): cliente do portal vê a config'; end if;

  perform _simular('00000000-0000-0000-0000-000000000001'); -- admin
  select count(*) into n from email_config;
  if n <> 1 then raise exception 'FALHA(email): admin não vê a config'; end if;
  reset role;

  raise notice 'OK: email_config — só admin lê e escreve';
end $$;

-- ASSERT: templates — equipe lê; só admin/assistente escrevem
do $$
declare n int; ok boolean := false;
begin
  perform _simular('00000000-0000-0000-0000-000000000002'); -- assistente
  insert into email_template (nome, assunto, corpo) values ('Aviso de guia', 'Guia de {competencia}', 'Ola {nome}');
  select count(*) into n from email_template;
  if n < 1 then raise exception 'FALHA(email): assistente não criou o template'; end if;

  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro: lê, não escreve
  select count(*) into n from email_template;
  if n < 1 then raise exception 'FALHA(email): financeiro não lê templates'; end if;
  begin
    insert into email_template (nome, assunto, corpo) values ('X', 'X', 'X');
    ok := true;
  exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'FALHA(email): financeiro criou template'; end if;

  perform _simular('00000000-0000-0000-0000-000000000005'); -- cliente do portal
  select count(*) into n from email_template;
  if n <> 0 then raise exception 'FALHA(email): cliente do portal vê templates'; end if;
  reset role;

  raise notice 'OK: email_template — equipe lê; só admin/assistente escrevem';
end $$;

-- ASSERT: histórico — contador só vê o dos seus clientes; ninguém insere pela app
do $$
declare n int; ok boolean := false;
begin
  reset role;
  insert into email_mensagem (cliente_id, para, assunto, corpo, status)
    values ('aaaaaaaa-0000-0000-0000-000000000001','a@cliente.com','Guia','Segue a guia','ENVIADO');
  insert into email_mensagem (cliente_id, para, assunto, corpo, status)
    values ('aaaaaaaa-0000-0000-0000-000000000002','b@cliente.com','Guia B','Segue','ENVIADO');

  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador (dono só do cliente A)
  select count(*) into n from email_mensagem where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'FALHA(email): contador vê e-mail de cliente que não é dele'; end if;
  select count(*) into n from email_mensagem where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n < 1 then raise exception 'FALHA(email): contador não vê o e-mail do próprio cliente'; end if;

  -- nem o admin insere pela app: o registro é do servidor (service_role), depois do envio
  perform _simular('00000000-0000-0000-0000-000000000001');
  begin
    insert into email_mensagem (cliente_id, para, assunto, corpo, status)
      values ('aaaaaaaa-0000-0000-0000-000000000001','x@y.com','Forjado','Nunca saiu','ENVIADO');
    ok := true;
  exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'FALHA(email): admin forjou um envio no histórico'; end if;

  perform _simular('00000000-0000-0000-0000-000000000005'); -- cliente do portal
  select count(*) into n from email_mensagem;
  if n <> 0 then raise exception 'FALHA(email): cliente do portal vê o histórico de e-mails'; end if;
  reset role;

  raise notice 'OK: email_mensagem — contador escopado; ninguém forja envio pela app';
end $$;

-- ============================================================================
-- Tarefas fatia B — recorrência (0091) e SOPs (0092)
-- ============================================================================

-- ASSERT: recorrência e templates de SOP — equipe lê; só admin/assistente escrevem
do $$
declare n int; ok boolean := false;
begin
  perform _simular('00000000-0000-0000-0000-000000000002'); -- assistente
  insert into tarefa_recorrencia (titulo, periodicidade, dia_mes, proxima_data)
    values ('Fechamento mensal', 'mensal', 5, '2026-08-05');
  insert into sop_template (slug, nome) values ('abertura-teste', 'Abertura de empresa');

  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro: lê, não escreve
  select count(*) into n from tarefa_recorrencia;
  if n < 1 then raise exception 'FALHA(tarefas-B): financeiro não lê recorrências'; end if;
  begin
    insert into tarefa_recorrencia (titulo, periodicidade, dia_mes, proxima_data)
      values ('X', 'mensal', 1, '2026-08-01');
    ok := true;
  exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'FALHA(tarefas-B): financeiro criou recorrência'; end if;

  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador: não edita template
  ok := false;
  begin
    insert into sop_template (slug, nome) values ('x-contador', 'X');
    ok := true;
  exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'FALHA(tarefas-B): contador criou template de SOP'; end if;

  perform _simular('00000000-0000-0000-0000-000000000005'); -- cliente do portal: não vê nada
  select count(*) into n from tarefa_recorrencia;
  if n <> 0 then raise exception 'FALHA(tarefas-B): cliente do portal vê recorrências'; end if;
  select count(*) into n from sop_template;
  if n <> 0 then raise exception 'FALHA(tarefas-B): cliente do portal vê templates de SOP'; end if;
  reset role;

  raise notice 'OK: recorrência e SOP — equipe lê; só admin/assistente escrevem; portal não vê';
end $$;

-- ASSERT: o TRIGGER avança a onda sozinho — a onda 2 só nasce quando a onda 1 fecha inteira
do $$
declare tpl uuid; proc uuid; e1 uuid; e2 uuid; e3 uuid; n int; v_status text;
begin
  reset role;
  insert into sop_template (slug, nome, departamento) values ('sop-onda-teste', 'Processo de teste', 'contabil')
    returning id into tpl;
  -- Onda 1: DUAS etapas paralelas. Onda 2: uma etapa.
  insert into sop_etapa (template_id, onda, ordem, titulo, prazo_dias) values (tpl, 1, 1, 'Coletar documentos', 2) returning id into e1;
  insert into sop_etapa (template_id, onda, ordem, titulo, prazo_dias) values (tpl, 1, 2, 'Conferir cadastro', 3) returning id into e2;
  insert into sop_etapa (template_id, onda, ordem, titulo, prazo_dias) values (tpl, 2, 1, 'Enviar ao cliente', 5) returning id into e3;
  insert into sop_etapa_item (etapa_id, descricao, ordem) values (e1, 'Contrato social', 1);

  insert into sop_processo (template_id, cliente_id, data_inicio)
    values (tpl, 'aaaaaaaa-0000-0000-0000-000000000001', '2026-07-01') returning id into proc;

  perform sop_gerar_onda(proc, 1);
  select count(*) into n from tarefa where sop_processo_id = proc;
  if n <> 2 then raise exception 'FALHA(sop): onda 1 deveria criar 2 tarefas paralelas (criou %)', n; end if;

  -- o prazo é relativo à data_inicio
  select count(*) into n from tarefa where sop_processo_id = proc and sop_etapa_id = e1 and prazo = date '2026-07-03';
  if n <> 1 then raise exception 'FALHA(sop): prazo relativo (data_inicio + prazo_dias) não aplicado'; end if;

  -- o checklist da etapa virou checklist da tarefa
  select count(*) into n from tarefa_item ti join tarefa t on t.id = ti.tarefa_id
   where t.sop_processo_id = proc and t.sop_etapa_id = e1;
  if n <> 1 then raise exception 'FALHA(sop): checklist da etapa não virou checklist da tarefa'; end if;

  -- Conclui SÓ UMA das duas paralelas: a onda 2 NÃO pode nascer.
  update tarefa set status = 'concluida' where sop_processo_id = proc and sop_etapa_id = e1;
  select count(*) into n from tarefa where sop_processo_id = proc and sop_onda = 2;
  if n <> 0 then raise exception 'FALHA(sop): onda 2 nasceu com a onda 1 ainda aberta'; end if;

  -- Fecha a segunda: agora a onda 2 nasce SOZINHA (trigger).
  update tarefa set status = 'concluida' where sop_processo_id = proc and sop_etapa_id = e2;
  select count(*) into n from tarefa where sop_processo_id = proc and sop_onda = 2;
  if n <> 1 then raise exception 'FALHA(sop): o trigger não gerou a onda 2 (tarefas=%)', n; end if;

  select onda_atual into n from sop_processo where id = proc;
  if n <> 2 then raise exception 'FALHA(sop): onda_atual não avançou (=%)', n; end if;

  -- Concluída a última onda, o processo fecha.
  update tarefa set status = 'concluida' where sop_processo_id = proc and sop_onda = 2;
  select status::text into v_status from sop_processo where id = proc;
  if v_status <> 'concluido' then raise exception 'FALHA(sop): processo não foi concluído (=%)', v_status; end if;

  -- Idempotência: regerar a onda não duplica tarefa.
  perform sop_gerar_onda(proc, 1);
  select count(*) into n from tarefa where sop_processo_id = proc and sop_onda = 1;
  if n <> 2 then raise exception 'FALHA(sop): regerar a onda duplicou tarefas (=%)', n; end if;

  raise notice 'OK: SOP — ondas paralelas, avanço automático por trigger e idempotência';
end $$;

-- ============================================================================
-- Comunicados em massa (RF-055) — 0093
-- ============================================================================

-- ASSERT: só admin/assistente criam comunicado; ninguém grava destinatário pela app
do $$
declare c_id uuid; n int; ok boolean := false;
begin
  perform _simular('00000000-0000-0000-0000-000000000002'); -- assistente
  insert into comunicado (titulo, assunto, corpo, canal)
    values ('Aviso DEFIS', 'Prazo da DEFIS', 'Ola {nome}, o prazo vence em breve.', 'email')
    returning id into c_id;

  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador: lê, não escreve
  select count(*) into n from comunicado;
  if n < 1 then raise exception 'FALHA(comunicado): contador não lê comunicados'; end if;
  begin
    insert into comunicado (titulo, assunto, corpo) values ('X', 'X', 'X');
    ok := true;
  exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'FALHA(comunicado): contador criou comunicado'; end if;

  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro: idem
  ok := false;
  begin
    insert into comunicado (titulo, assunto, corpo) values ('Y', 'Y', 'Y');
    ok := true;
  exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'FALHA(comunicado): financeiro criou comunicado'; end if;

  -- nem o admin grava destinatário pela app: o registro é do servidor, depois de enviar
  perform _simular('00000000-0000-0000-0000-000000000001');
  ok := false;
  begin
    insert into comunicado_destinatario (comunicado_id, cliente_id, para, status)
      values (c_id, 'aaaaaaaa-0000-0000-0000-000000000001', 'x@y.com', 'ENVIADO');
    ok := true;
  exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'FALHA(comunicado): admin forjou um envio no registro'; end if;

  perform _simular('00000000-0000-0000-0000-000000000005'); -- cliente do portal
  select count(*) into n from comunicado;
  if n <> 0 then raise exception 'FALHA(comunicado): cliente do portal vê comunicados'; end if;
  select count(*) into n from comunicado_destinatario;
  if n <> 0 then raise exception 'FALHA(comunicado): cliente do portal vê os destinatários'; end if;
  reset role;

  raise notice 'OK: comunicado — só admin/assistente criam; ninguém forja envio; portal não vê';
end $$;

-- ASSERT: o índice único impede o mesmo cliente receber o mesmo comunicado duas vezes
do $$
declare c_id uuid; ok boolean := false;
begin
  reset role;
  insert into comunicado (titulo, assunto, corpo) values ('Dup', 'Dup', 'Dup') returning id into c_id;
  insert into comunicado_destinatario (comunicado_id, cliente_id, para, status)
    values (c_id, 'aaaaaaaa-0000-0000-0000-000000000001', 'a@x.com', 'ENVIADO');
  begin
    insert into comunicado_destinatario (comunicado_id, cliente_id, para, status)
      values (c_id, 'aaaaaaaa-0000-0000-0000-000000000001', 'a@x.com', 'ENVIADO');
    ok := true;
  exception when unique_violation then ok := false; end;
  if ok then raise exception 'FALHA(comunicado): cliente recebeu o mesmo comunicado duas vezes'; end if;

  raise notice 'OK: comunicado — índice único barra envio duplicado ao mesmo cliente';
end $$;
