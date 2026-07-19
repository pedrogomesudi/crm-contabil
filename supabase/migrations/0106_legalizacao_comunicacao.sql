-- RF-013: comunicação automática de status da legalização.
create table if not exists legalizacao_config (
  id boolean primary key default true,
  canal text not null default 'email',       -- 'email' | 'whatsapp'
  ativo boolean not null default false,
  assunto text,
  template text not null default 'Olá {cliente}, a etapa "{etapa}" do processo "{processo}" foi concluída em {data}.'
);
do $$ begin
  alter table legalizacao_config drop constraint if exists legalizacao_config_id_chk;
  alter table legalizacao_config add constraint legalizacao_config_id_chk check (id);
  alter table legalizacao_config drop constraint if exists legalizacao_config_canal_chk;
  alter table legalizacao_config add constraint legalizacao_config_canal_chk check (canal in ('email','whatsapp'));
end $$;

alter table clientes add column if not exists comunicar_legalizacao boolean not null default true;

-- RLS: leitura para a equipe; escrita só admin (padrão da 0103).
alter table legalizacao_config enable row level security;
drop policy if exists legalizacao_config_read on legalizacao_config;
drop policy if exists legalizacao_config_write on legalizacao_config;
create policy legalizacao_config_read on legalizacao_config for select
  using (auth_papel() in ('admin','assistente','contador'));
create policy legalizacao_config_write on legalizacao_config for all
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');

insert into legalizacao_config (id) select true where not exists (select 1 from legalizacao_config);
