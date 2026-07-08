-- Ciclo C: vínculo item de onboarding → oportunidade de consultoria gerada.
alter table onboarding_processo_item
  add column if not exists oportunidade_id uuid references oportunidade(id);
