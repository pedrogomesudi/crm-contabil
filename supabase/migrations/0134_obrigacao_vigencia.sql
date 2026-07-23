-- Curadoria (C1): obrigação tem começo e fim conhecidos. Sem isso a matriz gera para sempre —
-- a EFD-Contribuições continuaria nascendo depois de 2027, quando PIS/COFINS deixam de existir.
-- Datas de COMPETÊNCIA (não de vencimento): a obrigação vale para o fato gerador do período.
alter table obrigacao add column if not exists vigente_de date;
alter table obrigacao add column if not exists vigente_ate date;

-- Nulo dos dois lados = sem limite, que é o comportamento de hoje para as 16 linhas existentes.
comment on column obrigacao.vigente_de is
  'Primeira competência em que a obrigação existe. Nulo = sem início definido.';
comment on column obrigacao.vigente_ate is
  'Última competência em que a obrigação existe. Nulo = ainda vigente.';
