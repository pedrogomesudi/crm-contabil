-- Hardening pós-revisão (Tasks 2-6). create-or-replace nas funções já criadas
-- + integridade de contador_id/criado_por + doc_update.

-- B-13: auth_papel() ignora usuário inativo (defesa em profundidade: sessão
-- ainda válida de um usuário desativado perde acesso por papel imediatamente).
create or replace function auth_papel() returns papel
  language sql stable security definer set search_path = public as $$
  select papel from usuarios where id = auth.uid() and ativo
$$;

-- M-10: search_path fixo (evita sequestro de resolução de nomes)
create or replace function congela_campos_sensiveis() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  if auth.uid() is not null and coalesce(auth_papel(), 'assistente') <> 'admin' then
    new.papel := old.papel;
    new.ativo := old.ativo;
  end if;
  return new;
end;
$$;

-- M-11: search_path fixo
create or replace function set_atualizado_em() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- A-07/A-08: integridade de auditoria e atribuição de contador.
-- - criado_por nunca é forjável pelo client (forçado a auth.uid()).
-- - contador só cria cliente para si.
-- - só Admin reatribui contador_id (D4); demais têm o campo congelado no UPDATE.
create function clientes_integridade() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.criado_por := auth.uid();
      if auth_papel() = 'contador' then
        new.contador_id := auth.uid();
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if auth.uid() is not null and coalesce(auth_papel(), 'assistente') <> 'admin' then
      new.contador_id := old.contador_id;
      new.criado_por := old.criado_por;
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_clientes_integridade
  before insert or update on clientes
  for each row execute function clientes_integridade();

-- A-06: documentos podem ter metadados atualizados por quem gerencia (admin/
-- contador-dono/assistente); financeiro só vê.
create policy doc_update on documentos for update to authenticated using (
  auth_papel() in ('admin', 'contador', 'assistente')
  and exists (select 1 from clientes c where c.id = cliente_id)
) with check (
  auth_papel() in ('admin', 'contador', 'assistente')
  and exists (select 1 from clientes c where c.id = cliente_id)
);
