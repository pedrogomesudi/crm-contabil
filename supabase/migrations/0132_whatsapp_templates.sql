-- Sub-projeto 3 (Fatia 3A): templates aprovados para envio proativo na API oficial.
alter table whatsapp_config add column if not exists oficial_waba_id text;

create table if not exists whatsapp_template_fluxo (
  fluxo         text primary key,
  nome          text not null,
  idioma        text not null default 'pt_BR',
  atualizado_em timestamptz not null default now()
);

alter table whatsapp_template_fluxo enable row level security;
drop policy if exists whatsapp_template_fluxo_read  on whatsapp_template_fluxo;
drop policy if exists whatsapp_template_fluxo_write on whatsapp_template_fluxo;
create policy whatsapp_template_fluxo_read  on whatsapp_template_fluxo for select
  using (auth_papel() in ('admin','assistente','contador'));
create policy whatsapp_template_fluxo_write on whatsapp_template_fluxo for all
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
