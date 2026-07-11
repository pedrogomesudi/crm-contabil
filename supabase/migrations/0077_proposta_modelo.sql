-- Sub-projeto B: modelo da proposta (padrão vs próprio) + responsável comercial.
alter table escritorio_config
  add column if not exists proposta_modelo text not null default 'padrao',
  add column if not exists proposta_template_path text,
  add column if not exists proposta_template_tipo text;

do $$ begin
  alter table escritorio_config add constraint escritorio_config_modelo_chk
    check (proposta_modelo in ('padrao','proprio'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table escritorio_config add constraint escritorio_config_tpl_tipo_chk
    check (proposta_template_tipo is null or proposta_template_tipo in ('docx','html'));
exception when duplicate_object then null; end $$;

alter table proposta
  add column if not exists responsavel_nome text,
  add column if not exists responsavel_email text,
  add column if not exists responsavel_telefone text;

comment on column escritorio_config.proposta_modelo is
  'padrao = documento HTML da plataforma (usa a Marca); proprio = template enviado (docx|html).';
