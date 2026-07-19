-- RF-007 Fatia A: follow-up automatizado de propostas (config + registro). Espelha a régua de cobrança.

create table if not exists followup_config (
  id boolean primary key default true,
  canal text not null default 'email',       -- 'email' | 'whatsapp'
  ativo boolean not null default false
);
do $$ begin
  alter table followup_config drop constraint if exists followup_config_id_chk;
  alter table followup_config add constraint followup_config_id_chk check (id);
  alter table followup_config drop constraint if exists followup_config_canal_chk;
  alter table followup_config add constraint followup_config_canal_chk check (canal in ('email','whatsapp'));
end $$;

create table if not exists followup_etapa (
  id uuid primary key default gen_random_uuid(),
  dias_offset int not null,
  assunto text,
  template text not null,
  ordem int not null,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists followup_envio (
  id uuid primary key default gen_random_uuid(),
  proposta_id uuid not null references proposta(id) on delete cascade,
  etapa_id uuid not null references followup_etapa(id) on delete cascade,
  enviado_em timestamptz not null default now(),
  destino text,
  status text not null default 'enviado',    -- 'enviado' | 'sem_destino' | 'falhou'
  unique (proposta_id, etapa_id)
);

alter table proposta add column if not exists enviada_em timestamptz;

-- RLS: leitura para o comercial; escrita só admin (padrão da 0103).
do $$
declare t text;
begin
  foreach t in array array['followup_config','followup_etapa','followup_envio'] loop
    execute format('alter table %I enable row level security', t);
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

-- Config singleton (uma linha, desligada por padrão).
insert into followup_config (id) select true where not exists (select 1 from followup_config);
