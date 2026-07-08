alter table clientes add column if not exists competencia_inicial date;

alter table onboarding_template_item add column if not exists depende_de text[] not null default '{}';
alter table onboarding_template_item add column if not exists campo_destino text;

alter table onboarding_processo_item add column if not exists depende_de text[] not null default '{}';
alter table onboarding_processo_item add column if not exists campo_destino text;
alter table onboarding_processo_item add column if not exists valor_destino text;
alter table onboarding_processo_item add column if not exists anexo_nome text;

-- Backfill do template semeado (por código, restrito ao slug padrão), idempotente.
update onboarding_template_item ti set campo_destino = 'competencia_inicial'
  from onboarding_bloco b join onboarding_template t on t.id = b.template_id
  where ti.bloco_id = b.id and t.slug = 'onboarding-cliente-existente' and ti.codigo = '1.3';
update onboarding_template_item ti set depende_de = '{4.6}'
  from onboarding_bloco b join onboarding_template t on t.id = b.template_id
  where ti.bloco_id = b.id and t.slug = 'onboarding-cliente-existente' and ti.codigo = '6.1';
update onboarding_template_item ti set depende_de = '{1.3,2.5}'
  from onboarding_bloco b join onboarding_template t on t.id = b.template_id
  where ti.bloco_id = b.id and t.slug = 'onboarding-cliente-existente' and ti.codigo = '6.2';
update onboarding_template_item ti set depende_de = '{1.1}'
  from onboarding_bloco b join onboarding_template t on t.id = b.template_id
  where ti.bloco_id = b.id and t.slug = 'onboarding-cliente-existente' and ti.codigo = '6.3';

-- Backfill dos processos já instanciados: copia do template por código.
update onboarding_processo_item pi set depende_de = ti.depende_de, campo_destino = ti.campo_destino
  from onboarding_processo pr, onboarding_bloco b, onboarding_template_item ti
  where pi.processo_id = pr.id and b.template_id = pr.template_id and ti.bloco_id = b.id and ti.codigo = pi.codigo;
