-- Portal Fatia B: upload do cliente (PRIMEIRA escrita do papel 'cliente') + rastreio (RF-053).

-- Origem do documento: distingue o que o cliente enviou do que o escritório subiu.
alter table documentos add column if not exists origem text not null default 'escritorio';
do $$ begin
  alter table documentos add constraint chk_doc_origem check (origem in ('escritorio','cliente'));
exception when duplicate_object then null; end $$;

-- ÚNICA escrita concedida ao papel 'cliente': enviar documento do PRÓPRIO cadastro,
-- sempre marcado como origem='cliente'. Sem UPDATE e sem DELETE.
-- O caminho é gerado no servidor; a constraint chk_caminho_prefixo (0011) já exige que
-- ele comece com o id do cliente, impedindo escrita na pasta de outro.
drop policy if exists documentos_portal_ins on documentos;
create policy documentos_portal_ins on documentos for insert to authenticated
  with check (cliente_id = auth_cliente_id() and origem = 'cliente');

-- Rastreio de entrega (RF-053): quem viu o quê, quando.
do $$ begin create type portal_acesso_tipo as enum ('documento','nfse','obrigacao','boleto');
exception when duplicate_object then null; end $$;

create table if not exists portal_acesso (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  tipo portal_acesso_tipo not null,
  ref_id uuid not null,
  usuario_id uuid references usuarios(id),
  acessado_em timestamptz not null default now()
);
create index if not exists idx_portal_acesso_ref on portal_acesso (cliente_id, tipo, ref_id);

alter table portal_acesso enable row level security;
-- A equipe lê (herda a visibilidade do cliente). NÃO existe policy de INSERT:
-- o registro é gravado apenas server-side (service_role), nunca pelo navegador.
drop policy if exists portal_acesso_sel on portal_acesso;
create policy portal_acesso_sel on portal_acesso for select to authenticated
  using (exists (select 1 from clientes c where c.id = cliente_id));
