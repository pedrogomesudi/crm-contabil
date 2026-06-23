-- Invariante: sempre ≥1 admin ativo. Bloqueia rebaixar/desativar o ÚLTIMO admin
-- ativo (defesa em profundidade; as actions também checam para mensagem amigável).
create function garantir_admin_ativo() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  if (old.papel = 'admin' and old.ativo)
     and not (new.papel = 'admin' and new.ativo)
     and (select count(*) from usuarios u
          where u.papel = 'admin' and u.ativo and u.id <> old.id) = 0 then
    raise exception 'Não é possível remover o último administrador ativo';
  end if;
  return new;
end;
$$;

create trigger trg_garantir_admin_ativo
  before update on usuarios
  for each row execute function garantir_admin_ativo();
