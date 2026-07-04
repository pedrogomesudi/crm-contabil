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
