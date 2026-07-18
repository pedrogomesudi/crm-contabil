-- RF-002 Fatia A: as etapas ATIVAS do funil viram tabela (configuráveis pelo escritório).
-- ganho/perdido continuam estados de sistema (não entram aqui). ADITIVA: a coluna enum `etapa`
-- permanece como vestígio nesta fatia — o código para de usá-la; drop numa limpeza futura.

create table if not exists funil_etapa (
  id uuid primary key default gen_random_uuid(),
  rotulo text not null,
  ordem int not null,
  cor text not null default '#5A6163',
  probabilidade numeric(4,3) not null default 0.5,
  arquivada boolean not null default false,
  criado_em timestamptz not null default now()
);
alter table funil_etapa enable row level security;
drop policy if exists funil_etapa_rw on funil_etapa;
create policy funil_etapa_rw on funil_etapa for all
  using (auth_papel() in ('admin','assistente','contador'))
  with check (auth_papel() in ('admin','assistente','contador'));

-- Semeia as 4 etapas ativas de hoje, na ordem e com os rótulos atuais. Idempotente pelo rótulo.
insert into funil_etapa (rotulo, ordem, cor, probabilidade)
select v.rotulo, v.ordem, v.cor, v.prob from (values
  ('Novo', 1, '#8C938E', 0.20),
  ('Contato feito', 2, '#3C6E8F', 0.40),
  ('Proposta enviada', 3, '#7C5CFF', 0.60),
  ('Negociação', 4, '#B5820E', 0.80)
) as v(rotulo, ordem, cor, prob)
where not exists (select 1 from funil_etapa f where f.rotulo = v.rotulo);

-- Colunas novas na oportunidade.
alter table oportunidade add column if not exists etapa_id uuid references funil_etapa(id);
alter table oportunidade add column if not exists desfecho text;  -- 'ganho' | 'perdido' | null
alter table oportunidade add column if not exists etapa_desde timestamptz not null default now();
alter table oportunidade add column if not exists segmento text;
alter table oportunidade add column if not exists regime text;

-- De-para do enum atual: cada etapa ativa aponta para a linha nova; ganho/perdido viram desfecho.
update oportunidade o set etapa_id = f.id
from funil_etapa f
where o.etapa_id is null and o.desfecho is null
  and f.rotulo = case o.etapa
    when 'novo' then 'Novo'
    when 'contato' then 'Contato feito'
    when 'proposta' then 'Proposta enviada'
    when 'negociacao' then 'Negociação'
    else null end;

update oportunidade set desfecho = etapa::text
where etapa in ('ganho','perdido') and desfecho is null;

-- Garante: exatamente um de (etapa_id, desfecho) preenchido.
do $$ begin
  alter table oportunidade drop constraint if exists oportunidade_etapa_xor;
  alter table oportunidade add constraint oportunidade_etapa_xor
    check ((etapa_id is null) != (desfecho is null));
end $$;
