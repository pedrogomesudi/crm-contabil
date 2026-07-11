-- RF-011..014 (Fatia A): módulo dedicado de legalização/societário.
do $$ begin create type legalizacao_tipo as enum
  ('abertura_simples','abertura_presumido','alteracao_quadro','transformacao','baixa','transferencia_entrada','transferencia_saida');
exception when duplicate_object then null; end $$;
do $$ begin create type legalizacao_orgao as enum
  ('junta','receita','prefeitura','sefaz','bombeiros','vigilancia','outro');
exception when duplicate_object then null; end $$;
do $$ begin create type legalizacao_proc_status as enum ('em_andamento','concluido','cancelado');
exception when duplicate_object then null; end $$;
do $$ begin create type legalizacao_etapa_status as enum ('pendente','em_andamento','concluido');
exception when duplicate_object then null; end $$;

create table if not exists legalizacao_template (
  id uuid primary key default gen_random_uuid(),
  tipo legalizacao_tipo not null,
  slug text not null unique,
  nome text not null,
  descricao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create table if not exists legalizacao_template_etapa (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references legalizacao_template(id) on delete cascade,
  ordem int not null,
  titulo text not null,
  descricao text,
  orgao legalizacao_orgao not null default 'outro',
  prazo_dias int,
  responsavel_papel papel,
  anexo_obrigatorio boolean not null default false,
  avisar_cliente boolean not null default false
);
create table if not exists legalizacao_processo (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  template_id uuid references legalizacao_template(id),
  tipo legalizacao_tipo not null,
  titulo text not null,
  status legalizacao_proc_status not null default 'em_andamento',
  data_inicio date not null,
  criado_por uuid references usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_leg_processo_cliente on legalizacao_processo(cliente_id);
create table if not exists legalizacao_etapa (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references legalizacao_processo(id) on delete cascade,
  ordem int not null,
  titulo text not null,
  descricao text,
  orgao legalizacao_orgao not null default 'outro',
  orgao_outro text,
  responsavel_papel papel,
  responsavel_id uuid references usuarios(id),
  prazo date,
  status legalizacao_etapa_status not null default 'pendente',
  protocolo text,
  protocolo_em date,
  anexo_obrigatorio boolean not null default false,
  anexo_path text,
  avisar_cliente boolean not null default false,
  cliente_avisado_em timestamptz,
  observacao text,
  concluido_em timestamptz,
  concluido_por uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
create index if not exists idx_leg_etapa_processo on legalizacao_etapa(processo_id);

alter table legalizacao_template enable row level security;
alter table legalizacao_template_etapa enable row level security;
alter table legalizacao_processo enable row level security;
alter table legalizacao_etapa enable row level security;

-- Templates: equipe lê; só admin escreve.
drop policy if exists leg_tpl_sel on legalizacao_template;
create policy leg_tpl_sel on legalizacao_template for select to authenticated
  using (auth_papel() in ('admin','contador','assistente'));
drop policy if exists leg_tpl_wr on legalizacao_template;
create policy leg_tpl_wr on legalizacao_template for all to authenticated
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
drop policy if exists leg_tpetapa_sel on legalizacao_template_etapa;
create policy leg_tpetapa_sel on legalizacao_template_etapa for select to authenticated
  using (auth_papel() in ('admin','contador','assistente'));
drop policy if exists leg_tpetapa_wr on legalizacao_template_etapa;
create policy leg_tpetapa_wr on legalizacao_template_etapa for all to authenticated
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');

-- Processo: SELECT herda a visibilidade do cliente; WRITE exige papel operacional + cliente visível.
drop policy if exists leg_proc_sel on legalizacao_processo;
create policy leg_proc_sel on legalizacao_processo for select to authenticated
  using (exists (select 1 from clientes c where c.id = cliente_id));
drop policy if exists leg_proc_wr on legalizacao_processo;
create policy leg_proc_wr on legalizacao_processo for all to authenticated
  using (auth_papel() in ('admin','assistente','contador') and exists (select 1 from clientes c where c.id = cliente_id))
  with check (auth_papel() in ('admin','assistente','contador') and exists (select 1 from clientes c where c.id = cliente_id));

-- Etapa: delega ao processo (e por ele, ao cliente).
drop policy if exists leg_etapa_sel on legalizacao_etapa;
create policy leg_etapa_sel on legalizacao_etapa for select to authenticated
  using (exists (select 1 from legalizacao_processo p join clientes c on c.id = p.cliente_id where p.id = processo_id));
drop policy if exists leg_etapa_wr on legalizacao_etapa;
create policy leg_etapa_wr on legalizacao_etapa for all to authenticated
  using (auth_papel() in ('admin','assistente','contador') and exists (select 1 from legalizacao_processo p join clientes c on c.id = p.cliente_id where p.id = processo_id))
  with check (auth_papel() in ('admin','assistente','contador') and exists (select 1 from legalizacao_processo p join clientes c on c.id = p.cliente_id where p.id = processo_id));

create or replace function legalizacao_etapa_integridade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_por := auth.uid();
  new.atualizado_em := now();
  if new.status = 'concluido' and new.concluido_em is null then
    new.concluido_em := now();
    new.concluido_por := auth.uid();
  end if;
  if new.status <> 'concluido' then
    new.concluido_em := null; new.concluido_por := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_legalizacao_etapa_integridade on legalizacao_etapa;
create trigger trg_legalizacao_etapa_integridade before insert or update on legalizacao_etapa
  for each row execute function legalizacao_etapa_integridade();

-- Seed idempotente dos modelos e etapas (só se o slug ainda não existe).
do $$
declare t uuid;
begin
  if not exists (select 1 from legalizacao_template where slug = 'abertura-simples') then
    insert into legalizacao_template (tipo, slug, nome, descricao) values
      ('abertura_simples','abertura-simples','Abertura — Simples Nacional','Constituição de empresa optante pelo Simples Nacional.') returning id into t;
    insert into legalizacao_template_etapa (template_id, ordem, titulo, orgao, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente) values
      (t,1,'Viabilidade de nome e endereço','prefeitura',2,'assistente',false,false),
      (t,2,'Registro do contrato social','junta',5,'contador',true,false),
      (t,3,'Inscrição no CNPJ','receita',7,'contador',false,true),
      (t,4,'Inscrição municipal','prefeitura',12,'assistente',false,false),
      (t,5,'Opção pelo Simples Nacional','receita',15,'contador',false,true),
      (t,6,'Alvará de funcionamento','prefeitura',20,'assistente',true,false),
      (t,7,'Vistoria do Corpo de Bombeiros','bombeiros',25,'assistente',false,false);
  end if;
  if not exists (select 1 from legalizacao_template where slug = 'abertura-presumido') then
    insert into legalizacao_template (tipo, slug, nome, descricao) values
      ('abertura_presumido','abertura-presumido','Abertura — Lucro Presumido','Constituição de empresa no regime de Lucro Presumido.') returning id into t;
    insert into legalizacao_template_etapa (template_id, ordem, titulo, orgao, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente) values
      (t,1,'Viabilidade de nome e endereço','prefeitura',2,'assistente',false,false),
      (t,2,'Registro do contrato social','junta',5,'contador',true,false),
      (t,3,'Inscrição no CNPJ','receita',7,'contador',false,true),
      (t,4,'Inscrição estadual','sefaz',12,'contador',false,false),
      (t,5,'Inscrição municipal','prefeitura',12,'assistente',false,false),
      (t,6,'Alvará de funcionamento','prefeitura',20,'assistente',true,false),
      (t,7,'Vistoria do Corpo de Bombeiros','bombeiros',25,'assistente',false,false);
  end if;
  if not exists (select 1 from legalizacao_template where slug = 'alteracao-quadro') then
    insert into legalizacao_template (tipo, slug, nome, descricao) values
      ('alteracao_quadro','alteracao-quadro','Alteração de quadro societário','Entrada/saída de sócios ou alteração de participações.') returning id into t;
    insert into legalizacao_template_etapa (template_id, ordem, titulo, orgao, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente) values
      (t,1,'Elaboração da alteração contratual','outro',2,'contador',false,false),
      (t,2,'Registro da alteração','junta',7,'contador',true,true),
      (t,3,'Atualização no CNPJ','receita',12,'contador',false,true),
      (t,4,'Atualização de inscrições','prefeitura',15,'assistente',false,false);
  end if;
  if not exists (select 1 from legalizacao_template where slug = 'transformacao') then
    insert into legalizacao_template (tipo, slug, nome, descricao) values
      ('transformacao','transformacao','Transformação de tipo societário','Ex.: EIRELI/LTDA para outro tipo.') returning id into t;
    insert into legalizacao_template_etapa (template_id, ordem, titulo, orgao, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente) values
      (t,1,'Elaboração do ato de transformação','outro',2,'contador',false,false),
      (t,2,'Registro na Junta Comercial','junta',7,'contador',true,true),
      (t,3,'Atualização do CNPJ','receita',12,'contador',false,false),
      (t,4,'Atualização de inscrições e licenças','prefeitura',15,'assistente',false,false);
  end if;
  if not exists (select 1 from legalizacao_template where slug = 'baixa') then
    insert into legalizacao_template (tipo, slug, nome, descricao) values
      ('baixa','baixa','Baixa / encerramento','Encerramento da empresa em todos os órgãos.') returning id into t;
    insert into legalizacao_template_etapa (template_id, ordem, titulo, orgao, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente) values
      (t,1,'Elaboração do distrato social','outro',2,'contador',false,false),
      (t,2,'Baixa municipal','prefeitura',7,'assistente',false,false),
      (t,3,'Baixa estadual','sefaz',10,'contador',false,false),
      (t,4,'Baixa na Junta Comercial','junta',15,'contador',true,false),
      (t,5,'Baixa do CNPJ','receita',20,'contador',false,true);
  end if;
  if not exists (select 1 from legalizacao_template where slug = 'transferencia-entrada') then
    insert into legalizacao_template (tipo, slug, nome, descricao) values
      ('transferencia_entrada','transferencia-entrada','Transferência — entrada','Recebimento de cliente de outra contabilidade (NBC PG 01).') returning id into t;
    insert into legalizacao_template_etapa (template_id, ordem, titulo, orgao, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente) values
      (t,1,'Comunicação de início ao cliente','outro',3,'assistente',false,true),
      (t,2,'Distrato com a contabilidade anterior','outro',2,'assistente',false,false),
      (t,3,'Recebimento do acervo documental','outro',5,'contador',true,false),
      (t,4,'Procurações e acessos (e-CAC, prefeitura)','receita',7,'contador',false,false),
      (t,5,'Conferência de obrigações pendentes','outro',12,'contador',false,false);
  end if;
  if not exists (select 1 from legalizacao_template where slug = 'transferencia-saida') then
    insert into legalizacao_template (tipo, slug, nome, descricao) values
      ('transferencia_saida','transferencia-saida','Transferência — saída','Saída de cliente para outra contabilidade (NBC PG 01).') returning id into t;
    insert into legalizacao_template_etapa (template_id, ordem, titulo, orgao, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente) values
      (t,1,'Comunicação formal da saída','outro',2,'assistente',false,true),
      (t,2,'Devolução do acervo documental','outro',7,'contador',true,false),
      (t,3,'Termo de entrega (NBC PG 01)','outro',10,'contador',true,false),
      (t,4,'Baixa de procurações e acessos','receita',12,'contador',false,false);
  end if;
end $$;
