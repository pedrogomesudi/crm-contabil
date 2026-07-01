-- Rastreio das assinaturas (Clicksign) — V4. Idempotente.
create table if not exists assinaturas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  documento_id uuid references documentos(id) on delete set null,
  clicksign_envelope_id text not null,
  clicksign_document_id text,
  status text not null default 'enviado', -- enviado|parcial|finalizado|recusado|cancelado
  documento_assinado_id uuid references documentos(id) on delete set null,
  criado_por uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  finalizado_em timestamptz
);
create index if not exists assinaturas_envelope_idx on assinaturas (clicksign_envelope_id);

create table if not exists assinatura_signatarios (
  id uuid primary key default gen_random_uuid(),
  assinatura_id uuid not null references assinaturas(id) on delete cascade,
  nome text not null,
  email text not null,
  papel text not null, -- contratada|contratante|testemunha
  clicksign_key text,
  status text not null default 'pendente', -- pendente|assinado|recusado
  assinado_em timestamptz
);

alter table assinaturas enable row level security;
alter table assinatura_signatarios enable row level security;

-- Gestão de documentos (admin/assistente/contador-dono) enxerga/gerencia.
drop policy if exists assinaturas_rw on assinaturas;
create policy assinaturas_rw on assinaturas for all to authenticated
  using (
    auth_papel() in ('admin', 'assistente')
    or (auth_papel() = 'contador'
        and exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid()))
  )
  with check (
    auth_papel() in ('admin', 'assistente')
    or (auth_papel() = 'contador'
        and exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid()))
  );

drop policy if exists assinatura_signatarios_rw on assinatura_signatarios;
create policy assinatura_signatarios_rw on assinatura_signatarios for all to authenticated
  using (exists (
    select 1 from assinaturas a where a.id = assinatura_id
    and (auth_papel() in ('admin', 'assistente')
      or (auth_papel() = 'contador'
          and exists (select 1 from clientes c where c.id = a.cliente_id and c.contador_id = auth.uid())))
  ))
  with check (exists (
    select 1 from assinaturas a where a.id = assinatura_id
    and (auth_papel() in ('admin', 'assistente')
      or (auth_papel() = 'contador'
          and exists (select 1 from clientes c where c.id = a.cliente_id and c.contador_id = auth.uid())))
  ));

-- Autoria não-forjável (espelha o padrão do projeto).
create or replace function assinaturas_integridade() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  if auth.uid() is not null and tg_op = 'INSERT' then
    new.criado_por := auth.uid();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_assinaturas_integridade on assinaturas;
create trigger trg_assinaturas_integridade
  before insert on assinaturas
  for each row execute function assinaturas_integridade();
