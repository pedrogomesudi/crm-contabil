-- V6.1 — Fundação Financeira: cadastros de apoio + extensão do cliente.
-- Idempotente. RLS: admin+financeiro gerenciam tudo; contador LÊ categoria/servico.

-- ===== ENUMS =====
do $$ begin
  create type financeiro_conta_tipo as enum ('CORRENTE','POUPANCA','CAIXA','CARTAO');
exception when duplicate_object then null; end $$;
do $$ begin
  create type categoria_natureza as enum ('RECEITA','DESPESA');
exception when duplicate_object then null; end $$;
do $$ begin
  create type categoria_grupo as enum ('OPERACIONAL','NAO_OPERACIONAL');
exception when duplicate_object then null; end $$;
do $$ begin
  create type faixa_faturamento as enum ('ATE_81K','ATE_360K','ATE_4_8MI','ATE_78MI','ACIMA_78MI');
exception when duplicate_object then null; end $$;

-- ===== TABELAS DE APOIO =====
create table if not exists conta_bancaria (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo financeiro_conta_tipo not null,
  banco text, agencia text, numero text,
  saldo_inicial numeric(15,2) not null default 0,
  data_saldo_inicial date,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);

create table if not exists categoria (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  natureza categoria_natureza not null,
  grupo categoria_grupo not null default 'OPERACIONAL',
  categoria_pai_id uuid references categoria(id),
  ordem_dre int not null default 0,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
-- Hierarquia de no máx. 2 níveis: uma categoria com pai não pode ser pai de outra.
create or replace function categoria_max_dois_niveis() returns trigger language plpgsql as $$
begin
  if new.categoria_pai_id is not null then
    if exists (select 1 from categoria p where p.id = new.categoria_pai_id and p.categoria_pai_id is not null) then
      raise exception 'Plano de contas limitado a 2 níveis';
    end if;
    if exists (select 1 from categoria f where f.categoria_pai_id = new.id) then
      raise exception 'Categoria já é pai; não pode ter pai';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_categoria_niveis on categoria;
create trigger trg_categoria_niveis before insert or update on categoria
  for each row execute function categoria_max_dois_niveis();

create table if not exists centro_custo (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);

create table if not exists fornecedor (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj_cpf text,
  contato jsonb not null default '{}'::jsonb,
  categoria_padrao_id uuid references categoria(id),
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);

create table if not exists servico (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  preco_sugerido numeric(15,2),
  categoria_id uuid references categoria(id),
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);

-- ===== EXTENSÃO FINANCEIRA DO CLIENTE =====
alter table clientes_financeiro add column if not exists dia_vencimento smallint;
alter table clientes_financeiro add column if not exists qtd_funcionarios int;
alter table clientes_financeiro add column if not exists faixa_faturamento faixa_faturamento;
alter table clientes_financeiro add column if not exists data_saida date;
do $$ begin
  alter table clientes_financeiro add constraint chk_dia_vencimento
    check (dia_vencimento is null or (dia_vencimento between 1 and 28));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table clientes_financeiro add constraint chk_qtd_funcionarios
    check (qtd_funcionarios is null or qtd_funcionarios >= 0);
exception when duplicate_object then null; end $$;

-- ===== RLS =====
alter table conta_bancaria enable row level security;
alter table categoria     enable row level security;
alter table centro_custo  enable row level security;
alter table fornecedor    enable row level security;
alter table servico       enable row level security;

-- Tabelas restritas a admin+financeiro (SELECT/INSERT/UPDATE)
do $$
declare t text;
begin
  foreach t in array array['conta_bancaria','centro_custo','fornecedor'] loop
    execute format('drop policy if exists %I_select on %I', t, t);
    execute format($p$create policy %I_select on %I for select to authenticated
      using (auth_papel() in ('admin','financeiro'))$p$, t, t);
    execute format('drop policy if exists %I_insert on %I', t, t);
    execute format($p$create policy %I_insert on %I for insert to authenticated
      with check (auth_papel() in ('admin','financeiro'))$p$, t, t);
    execute format('drop policy if exists %I_update on %I', t, t);
    execute format($p$create policy %I_update on %I for update to authenticated
      using (auth_papel() in ('admin','financeiro'))
      with check (auth_papel() in ('admin','financeiro'))$p$, t, t);
  end loop;
end $$;

-- categoria e servico: SELECT liberado também ao contador; escrita só admin+financeiro
do $$
declare t text;
begin
  foreach t in array array['categoria','servico'] loop
    execute format('drop policy if exists %I_select on %I', t, t);
    execute format($p$create policy %I_select on %I for select to authenticated
      using (auth_papel() in ('admin','financeiro','contador'))$p$, t, t);
    execute format('drop policy if exists %I_insert on %I', t, t);
    execute format($p$create policy %I_insert on %I for insert to authenticated
      with check (auth_papel() in ('admin','financeiro'))$p$, t, t);
    execute format('drop policy if exists %I_update on %I', t, t);
    execute format($p$create policy %I_update on %I for update to authenticated
      using (auth_papel() in ('admin','financeiro'))
      with check (auth_papel() in ('admin','financeiro'))$p$, t, t);
  end loop;
end $$;

-- ===== SEEDS (RF-004 plano de contas; RF-005 centros de custo) — idempotentes =====
insert into categoria (nome, natureza, grupo, ordem_dre)
select v.nome, v.natureza::categoria_natureza, 'OPERACIONAL'::categoria_grupo, v.ordem
from (values
  ('Honorários mensais','RECEITA',10),
  ('Honorários eventuais','RECEITA',20),
  ('13º honorário','RECEITA',30),
  ('Outras receitas','RECEITA',40),
  ('Pessoal e encargos','DESPESA',110),
  ('Softwares e licenças','DESPESA',120),
  ('Ocupação','DESPESA',130),
  ('Impostos','DESPESA',140),
  ('Marketing','DESPESA',150),
  ('Serviços de terceiros','DESPESA',160),
  ('Financeiras','DESPESA',170)
) as v(nome, natureza, ordem)
where not exists (select 1 from categoria c where c.nome = v.nome and c.categoria_pai_id is null);

insert into centro_custo (nome)
select v.nome from (values
  ('Fiscal'),('Contábil'),('Pessoal/DP'),('Legalização'),('Consultoria'),('Administrativo')
) as v(nome)
where not exists (select 1 from centro_custo cc where cc.nome = v.nome);
