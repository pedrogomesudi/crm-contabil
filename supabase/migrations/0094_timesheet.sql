-- RF-043/044: timesheet (apontamento de horas) e rentabilidade por cliente.
do $$ begin create type apontamento_origem as enum ('manual','cronometro');
exception when duplicate_object then null; end $$;

-- Custo/hora é dado SALARIAL: tabela própria, admin-only. A RLS do Postgres é por LINHA,
-- não por coluna — pôr `custo_hora` em `usuarios` vazaria o dado para qualquer um da equipe
-- que lesse a tabela (ex.: para montar um select de responsáveis).
-- A VIGÊNCIA existe porque o custo muda (aumento): o relatório de março não pode usar o
-- salário de hoje, senão a rentabilidade histórica se reescreve a cada reajuste.
create table if not exists colaborador_custo (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  custo_hora numeric(12,2) not null check (custo_hora >= 0),
  vigencia_inicio date not null,
  vigencia_fim date,
  criado_em timestamptz not null default now(),
  check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);
create index if not exists ix_custo_usuario on colaborador_custo(usuario_id, vigencia_inicio desc);

create table if not exists apontamento (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade default auth.uid(),
  cliente_id uuid references clientes(id) on delete set null,
  tarefa_id uuid references tarefa(id) on delete set null,
  data date not null,
  minutos int not null check (minutos > 0 and minutos <= 1440),
  descricao text,
  origem apontamento_origem not null default 'manual',
  criado_em timestamptz not null default now()
);
create index if not exists ix_apont_cliente on apontamento(cliente_id, data);
create index if not exists ix_apont_usuario on apontamento(usuario_id, data);

-- Uma sessão de cronômetro por pessoa: a PK é o usuário. Dois cronômetros simultâneos
-- gerariam horas duplicadas para a mesma pessoa.
create table if not exists apontamento_sessao (
  usuario_id uuid primary key references usuarios(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete set null,
  tarefa_id uuid references tarefa(id) on delete set null,
  iniciado_em timestamptz not null default now()
);

alter table colaborador_custo enable row level security;
alter table apontamento enable row level security;
alter table apontamento_sessao enable row level security;

do $$ begin
  -- custo: SÓ admin. Nem o financeiro vê salário individual — ele vê a rentabilidade
  -- agregada por cliente, que roda com service_role no servidor.
  drop policy if exists custo_admin on colaborador_custo;
  create policy custo_admin on colaborador_custo for all to authenticated
    using (auth_papel() = 'admin') with check (auth_papel() = 'admin');

  -- apontamento: cada um vê/edita os seus; admin e financeiro veem/editam todos.
  -- O WITH CHECK (usuario_id = auth.uid()) é o que impede apontar em nome de outro —
  -- o `default auth.uid()` sozinho NÃO impediria (lição da 0088: default não é validação).
  drop policy if exists apont_sel on apontamento;
  create policy apont_sel on apontamento for select to authenticated
    using (usuario_id = auth.uid() or auth_papel() in ('admin','financeiro'));
  drop policy if exists apont_ins on apontamento;
  create policy apont_ins on apontamento for insert to authenticated
    with check (usuario_id = auth.uid() or auth_papel() in ('admin','financeiro'));
  drop policy if exists apont_upd on apontamento;
  create policy apont_upd on apontamento for update to authenticated
    using (usuario_id = auth.uid() or auth_papel() in ('admin','financeiro'))
    with check (usuario_id = auth.uid() or auth_papel() in ('admin','financeiro'));
  drop policy if exists apont_del on apontamento;
  create policy apont_del on apontamento for delete to authenticated
    using (usuario_id = auth.uid() or auth_papel() in ('admin','financeiro'));

  -- sessão de cronômetro: só a própria.
  drop policy if exists sessao_own on apontamento_sessao;
  create policy sessao_own on apontamento_sessao for all to authenticated
    using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
end $$;
