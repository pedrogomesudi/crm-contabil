-- RF-062: retenção por tipo + view de vencimento de retenção.
alter table tipo_documento add column if not exists retencao_meses int;  -- null = usa o global

-- Calcula quando cada documento "vence" a retenção. security_invoker => respeita a RLS de documentos/clientes.
create or replace view documento_retencao with (security_invoker = true) as
select
  d.id, d.cliente_id, cl.razao_social as cliente_nome, d.nome, d.tipo, d.tipo_id,
  d.competencia, d.enviado_em, d.substitui_id,
  coalesce(td.retencao_meses, ec.retencao_meses) as meses_retencao,
  (coalesce(d.competencia, d.enviado_em::date)
     + (coalesce(td.retencao_meses, ec.retencao_meses) || ' months')::interval)::date as vence_em
from documentos d
left join tipo_documento td on td.id = d.tipo_id
left join clientes cl on cl.id = d.cliente_id
cross join (select retencao_meses from escritorio_config where id = 1) ec;
