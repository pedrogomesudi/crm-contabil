-- Grupo de cobrança: N empresas (mesmos donos) cobradas por 1 boleto na empresa titular.
-- A NF continua individual por CNPJ; só o boleto é consolidado.
create table if not exists grupo_cobranca (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  titular_cliente_id uuid not null references clientes(id) on delete restrict,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id) default auth.uid()
);

-- Vínculo do membro ao grupo (um cliente em no máximo um grupo de cobrança).
alter table clientes add column if not exists grupo_cobranca_id uuid references grupo_cobranca(id) on delete set null;
create index if not exists idx_clientes_grupo_cobranca on clientes(grupo_cobranca_id);

-- O boleto passa a poder cobrir vários títulos (1 por empresa). titulo_id vira opcional
-- (boletos individuais continuam preenchendo-o); boletos de grupo usam grupo_cobranca_id.
alter table boleto alter column titulo_id drop not null;
alter table boleto add column if not exists grupo_cobranca_id uuid references grupo_cobranca(id) on delete set null;

create table if not exists boleto_titulo (
  boleto_id uuid not null references boleto(id) on delete cascade,
  titulo_id uuid not null references titulo(id) on delete cascade,
  valor numeric(15,2) not null,
  primary key (boleto_id, titulo_id)
);
create index if not exists idx_boleto_titulo_titulo on boleto_titulo(titulo_id);

-- Invariante: todo boleto tem titulo_id (individual) OU grupo_cobranca_id (grupo).
alter table boleto drop constraint if exists boleto_alvo_chk;
alter table boleto add constraint boleto_alvo_chk check (titulo_id is not null or grupo_cobranca_id is not null);

-- RLS no padrão de 0107 (leitura equipe; escrita admin/assistente).
alter table grupo_cobranca enable row level security;
alter table boleto_titulo enable row level security;
drop policy if exists grupo_cobranca_read on grupo_cobranca;
drop policy if exists grupo_cobranca_write on grupo_cobranca;
create policy grupo_cobranca_read on grupo_cobranca for select
  using (auth_papel() in ('admin','assistente','contador'));
create policy grupo_cobranca_write on grupo_cobranca for all
  using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));
drop policy if exists boleto_titulo_read on boleto_titulo;
drop policy if exists boleto_titulo_write on boleto_titulo;
create policy boleto_titulo_read on boleto_titulo for select
  using (auth_papel() in ('admin','assistente','contador'));
create policy boleto_titulo_write on boleto_titulo for all
  using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));
