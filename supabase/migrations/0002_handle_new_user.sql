-- Sincroniza auth.users -> usuarios. Papel vem de app_metadata (definido server-side
-- no convite). Fallback 'assistente' (menor privilégio). Idempotente (on conflict do nothing).
create function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into usuarios (id, nome, email, papel)
  values (
    new.id,
    coalesce(new.raw_app_meta_data->>'nome', new.email),
    new.email,
    coalesce((new.raw_app_meta_data->>'papel')::papel, 'assistente')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function handle_new_user();
