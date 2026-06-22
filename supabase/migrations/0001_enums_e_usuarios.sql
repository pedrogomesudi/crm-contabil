-- Enums (valores exatos conforme o spec / Global Constraints)
create type papel as enum ('admin', 'contador', 'assistente', 'financeiro');
create type tipo_pessoa as enum ('PJ', 'PF', 'MEI');
create type regime_tributario as enum ('Simples', 'Presumido', 'Real', 'MEI', 'Isento/PF');
create type status_cliente as enum ('ativo', 'inativo');

-- Perfil da aplicação, 1:1 com auth.users
create table usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  papel papel not null default 'assistente',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- RLS habilitada; NÃO usar FORCE (a função auth_papel() precisa do bypass do owner)
alter table usuarios enable row level security;

-- Policy 1: cada um lê a própria linha
create policy usuarios_select_propria
  on usuarios for select to authenticated
  using (id = auth.uid());

-- Policy 2: cada um atualiza a própria linha (campos sensíveis são congelados pelo trigger)
create policy usuarios_update_propria
  on usuarios for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Função de papel BLINDADA, criada AQUI (antes do trigger que a usa).
-- SECURITY DEFINER + owner que bypassa RLS de usuarios (usuarios não usa FORCE RLS).
create function auth_papel() returns papel
  language sql stable security definer set search_path = public as $$
  select papel from usuarios where id = auth.uid()
$$;
revoke all on function auth_papel() from public;
grant execute on function auth_papel() to authenticated;

-- Trigger anti-escalonamento: congela papel/ativo quando quem edita não é admin.
-- Guarda auth.uid() is not null => libera service_role (uid nulo) e Admin.
create function congela_campos_sensiveis() returns trigger
  language plpgsql as $$
begin
  if auth.uid() is not null and coalesce(auth_papel(), 'assistente') <> 'admin' then
    new.papel := old.papel;
    new.ativo := old.ativo;
  end if;
  return new;
end;
$$;

create trigger trg_congela_campos_sensiveis
  before update on usuarios
  for each row execute function congela_campos_sensiveis();
