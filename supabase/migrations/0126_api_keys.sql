-- RF-080 (Fatia A): API keys para a API pública.
create table if not exists api_key (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  key_hash text not null unique, -- sha256 hex da chave (nunca em claro)
  prefixo text not null,         -- primeiros ~10 chars, para exibição
  escopos text[] not null default '{}',
  criado_por uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  ultimo_uso timestamptz,
  revogada_em timestamptz
);
create index if not exists ix_api_key_hash on api_key(key_hash) where revogada_em is null;

alter table api_key enable row level security;
drop policy if exists api_key_admin on api_key;
create policy api_key_admin on api_key for all
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
