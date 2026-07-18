-- RF-003 Fatia A: tabelas de configuração da precificação de honorários (um escritório).
-- Leitura para o comercial; a EDIÇÃO fica atrás de gate admin nas actions.

create table if not exists precificacao_regime_base (
  regime text primary key,
  valor_base numeric(12,2) not null default 0
);

create table if not exists precificacao_fator (
  fator text primary key,                 -- 'faturamento' | 'funcionarios' | 'notas'
  modo text not null default 'faixas',    -- 'faixas' | 'unidade'
  valor_unitario numeric(12,2) not null default 0,
  franquia numeric(14,2) not null default 0
);
do $$ begin
  alter table precificacao_fator drop constraint if exists precificacao_fator_modo_chk;
  alter table precificacao_fator add constraint precificacao_fator_modo_chk check (modo in ('faixas','unidade'));
end $$;

create table if not exists precificacao_faixa (
  id uuid primary key default gen_random_uuid(),
  fator text not null references precificacao_fator(fator) on delete cascade,
  ate numeric(14,2),                      -- null = sem teto
  valor numeric(12,2) not null default 0,
  ordem int not null
);

create table if not exists precificacao_complexidade (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  multiplicador numeric(5,3) not null default 1.0,
  ordem int not null
);

create table if not exists precificacao_servico (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  valor numeric(12,2) not null default 0,
  recorrencia text not null default 'mensal',   -- 'mensal' | 'unico'
  ativo boolean not null default true,
  ordem int not null
);
do $$ begin
  alter table precificacao_servico drop constraint if exists precificacao_servico_rec_chk;
  alter table precificacao_servico add constraint precificacao_servico_rec_chk check (recorrencia in ('mensal','unico'));
end $$;

create table if not exists precificacao_config (
  id boolean primary key default true,
  valor_minimo numeric(12,2) not null default 0,
  desconto_maximo_pct numeric(5,2) not null default 0
);
do $$ begin
  alter table precificacao_config drop constraint if exists precificacao_config_id_chk;
  alter table precificacao_config add constraint precificacao_config_id_chk check (id);
end $$;

-- RLS: leitura/escrita para o comercial (a edição é limitada a admin na action).
do $$
declare t text;
begin
  foreach t in array array[
    'precificacao_regime_base','precificacao_fator','precificacao_faixa',
    'precificacao_complexidade','precificacao_servico','precificacao_config'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t||'_rw', t);
    execute format(
      'create policy %I on %I for all using (auth_papel() in (''admin'',''assistente'',''contador'')) with check (auth_papel() in (''admin'',''assistente'',''contador''))',
      t||'_rw', t);
  end loop;
end $$;

-- Seeds idempotentes.
insert into precificacao_regime_base (regime)
select v from (values ('Simples'),('Presumido'),('Real'),('MEI'),('Isento/PF')) as r(v)
where not exists (select 1 from precificacao_regime_base b where b.regime = r.v);

insert into precificacao_fator (fator)
select v from (values ('faturamento'),('funcionarios'),('notas')) as f(v)
where not exists (select 1 from precificacao_fator x where x.fator = f.v);

insert into precificacao_complexidade (nome, multiplicador, ordem)
select v.nome, v.mult, v.ordem from (values ('Baixa',1.0,1),('Média',1.2,2),('Alta',1.5,3)) as v(nome,mult,ordem)
where not exists (select 1 from precificacao_complexidade c where c.nome = v.nome);

insert into precificacao_config (id) select true
where not exists (select 1 from precificacao_config);
