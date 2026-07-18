-- RF-003: aperta a RLS das tabelas de precificação. A 0102 concedia leitura E escrita a
-- admin/assistente/contador; a intenção é edição SÓ admin (a calculadora, comercial, só lê).
-- Separa em duas policies por tabela: _read (select para o comercial) e _write (tudo para admin).
-- Sem o _write cobrindo delete via `using`, assistente/contador não conseguiam ser barrados no
-- delete por uma policy `for all` única — por isso o split explícito.

do $$
declare t text;
begin
  foreach t in array array[
    'precificacao_regime_base','precificacao_fator','precificacao_faixa',
    'precificacao_complexidade','precificacao_servico','precificacao_config'
  ] loop
    execute format('drop policy if exists %I on %I', t||'_rw', t);
    execute format('drop policy if exists %I on %I', t||'_read', t);
    execute format('drop policy if exists %I on %I', t||'_write', t);
    execute format(
      'create policy %I on %I for select using (auth_papel() in (''admin'',''assistente'',''contador''))',
      t||'_read', t);
    execute format(
      'create policy %I on %I for all using (auth_papel() = ''admin'') with check (auth_papel() = ''admin'')',
      t||'_write', t);
  end loop;
end $$;
