create table if not exists dados_bancarios (
  id                int primary key default 1,
  pix_chave         text,
  banco             text,
  agencia           text,
  conta             text,
  titular           text,
  documento         text,
  mensagem_template text not null default
    'Olá {nome}! Segue a sua nota fiscal de serviços (NFS-e), referente ao honorário de {valor} — competência {competencia}.\n\nPara pagamento:\n{pagamento}\n\nSe já efetuou o pagamento, por favor desconsidere. Qualquer dúvida, estamos à disposição!',
  atualizado_em     timestamptz not null default now(),
  constraint dados_bancarios_singleton check (id = 1)
);
alter table dados_bancarios enable row level security;
do $$ begin
  drop policy if exists dados_bancarios_admin on dados_bancarios;
  create policy dados_bancarios_admin on dados_bancarios for all to authenticated
    using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
end $$;

alter table whatsapp_mensagem add column if not exists nfse_id uuid references nfse(id) on delete set null;
create index if not exists idx_wa_msg_nfse on whatsapp_mensagem(nfse_id) where nfse_id is not null;
