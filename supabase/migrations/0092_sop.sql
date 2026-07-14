-- RF-041: templates de processo (SOPs). As etapas viram TAREFAS — sem processo paralelo,
-- para não criar a terceira cópia do padrão onboarding/legalização.
do $$ begin create type sop_processo_status as enum ('em_andamento','concluido','cancelado');
exception when duplicate_object then null; end $$;

create table if not exists sop_template (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  descricao text,
  departamento departamento,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists sop_etapa (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references sop_template(id) on delete cascade,
  -- Mesma onda = etapas PARALELAS (nascem juntas). Ondas rodam em SEQUÊNCIA.
  onda int not null default 1 check (onda >= 1),
  ordem int not null default 0,
  titulo text not null,
  descricao text,
  responsavel_papel papel,
  prazo_dias int not null default 0,  -- relativo à data_inicio do processo
  prioridade tarefa_prioridade not null default 'media'
);
create index if not exists ix_sop_etapa_template on sop_etapa(template_id, onda, ordem);

create table if not exists sop_etapa_item (
  id uuid primary key default gen_random_uuid(),
  etapa_id uuid not null references sop_etapa(id) on delete cascade,
  descricao text not null,
  ordem int not null default 0
);

create table if not exists sop_processo (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references sop_template(id),
  cliente_id uuid references clientes(id) on delete cascade,  -- null = processo interno
  data_inicio date not null,
  onda_atual int not null default 1,
  status sop_processo_status not null default 'em_andamento',
  criado_por uuid references usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists ix_sop_processo_cliente on sop_processo(cliente_id);

alter table tarefa add column if not exists sop_processo_id uuid references sop_processo(id) on delete cascade;
alter table tarefa add column if not exists sop_etapa_id uuid references sop_etapa(id) on delete set null;
alter table tarefa add column if not exists sop_onda int;
-- Idempotência: a etapa não vira tarefa duas vezes no mesmo processo.
create unique index if not exists uq_tarefa_sop_etapa
  on tarefa(sop_processo_id, sop_etapa_id) where sop_processo_id is not null;

-- Gera as tarefas de uma onda. Usada pelo app (onda 1) e pelo trigger (ondas seguintes).
create or replace function sop_gerar_onda(p_processo uuid, p_onda int)
returns int language plpgsql security definer set search_path = public as $$
declare v_proc sop_processo; v_dep departamento; n int := 0;
begin
  select * into v_proc from sop_processo where id = p_processo;
  if not found then return 0; end if;
  select t.departamento into v_dep from sop_template t where t.id = v_proc.template_id;

  insert into tarefa (titulo, descricao, responsavel_id, cliente_id, departamento, prioridade, prazo,
                      sop_processo_id, sop_etapa_id, sop_onda)
  select e.titulo, e.descricao,
         -- Responsável por papel: (1) responsável do departamento no cliente;
         -- (2) contador do cliente, se o papel da etapa for 'contador'; (3) NINGUÉM.
         -- Nunca chutar um responsável: tarefa órfã aparece no painel; tarefa atribuída
         -- à pessoa errada some da vista de quem deveria fazê-la.
         coalesce(
           (select cr.usuario_id from cliente_responsavel cr
             where cr.cliente_id = v_proc.cliente_id and cr.departamento = v_dep),
           (select c.contador_id from clientes c
             where c.id = v_proc.cliente_id and e.responsavel_papel = 'contador')
         ),
         v_proc.cliente_id, v_dep, e.prioridade,
         v_proc.data_inicio + e.prazo_dias,
         v_proc.id, e.id, e.onda
    from sop_etapa e
   where e.template_id = v_proc.template_id and e.onda = p_onda
     and not exists (select 1 from tarefa x where x.sop_processo_id = v_proc.id and x.sop_etapa_id = e.id);
  get diagnostics n = row_count;

  -- O checklist da etapa vira o checklist da tarefa.
  insert into tarefa_item (tarefa_id, descricao, ordem)
  select tf.id, i.descricao, i.ordem
    from tarefa tf join sop_etapa_item i on i.etapa_id = tf.sop_etapa_id
   where tf.sop_processo_id = v_proc.id and tf.sop_onda = p_onda
     and not exists (select 1 from tarefa_item ti where ti.tarefa_id = tf.id and ti.descricao = i.descricao);

  update sop_processo set onda_atual = p_onda where id = p_processo;
  return n;
end $$;

-- Avanço de onda NO BANCO, não nas actions: a tarefa é concluída pelo painel, pelo kanban e
-- pela ficha do cliente. Se o avanço morasse na action, o caminho esquecido travaria o
-- processo em silêncio. No trigger, qualquer caminho funciona — inclusive um update por script.
create or replace function sop_avancar_onda() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pendentes int; v_proxima int;
begin
  if new.sop_processo_id is null or new.sop_onda is null then return new; end if;
  if new.status not in ('concluida','cancelada') then return new; end if;

  select count(*) into v_pendentes from tarefa
   where sop_processo_id = new.sop_processo_id and sop_onda = new.sop_onda
     and status not in ('concluida','cancelada');
  if v_pendentes > 0 then return new; end if;  -- a onda ainda não fechou

  select min(e.onda) into v_proxima
    from sop_etapa e join sop_processo p on p.template_id = e.template_id
   where p.id = new.sop_processo_id and e.onda > new.sop_onda;

  if v_proxima is null then
    update sop_processo set status = 'concluido' where id = new.sop_processo_id;
  else
    perform sop_gerar_onda(new.sop_processo_id, v_proxima);
  end if;
  return new;
end $$;

drop trigger if exists trg_sop_avancar on tarefa;
create trigger trg_sop_avancar after update of status on tarefa
  for each row execute function sop_avancar_onda();

alter table sop_template enable row level security;
alter table sop_etapa enable row level security;
alter table sop_etapa_item enable row level security;
alter table sop_processo enable row level security;

do $$ begin
  drop policy if exists sop_tpl_sel on sop_template;
  create policy sop_tpl_sel on sop_template for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists sop_tpl_write on sop_template;
  create policy sop_tpl_write on sop_template for all to authenticated
    using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));

  drop policy if exists sop_etapa_sel on sop_etapa;
  create policy sop_etapa_sel on sop_etapa for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists sop_etapa_write on sop_etapa;
  create policy sop_etapa_write on sop_etapa for all to authenticated
    using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));

  drop policy if exists sop_item_sel on sop_etapa_item;
  create policy sop_item_sel on sop_etapa_item for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists sop_item_write on sop_etapa_item;
  create policy sop_item_write on sop_etapa_item for all to authenticated
    using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));

  drop policy if exists sop_proc_sel on sop_processo;
  create policy sop_proc_sel on sop_processo for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists sop_proc_ins on sop_processo;
  create policy sop_proc_ins on sop_processo for insert to authenticated
    with check (auth_papel() in ('admin','assistente','contador'));
  drop policy if exists sop_proc_upd on sop_processo;
  create policy sop_proc_upd on sop_processo for update to authenticated
    using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));
end $$;
