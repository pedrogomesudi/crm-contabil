-- V10-B: envelope encryption. Uma DEK (chave-de-dados) por domínio, guardada CIFRADA pela
-- MASTER_CRIPTO_KEY. Rotacionar a mestra re-embrulha as DEKs — o dado cifrado não é tocado.
-- Cada DEK É o valor da chave atual do domínio, então o ciphertext existente decifra igual.
create table if not exists chave_dados (
  dominio text primary key,          -- 'whatsapp','onboarding','boleto','email','nfse'
  dek_cifrado text not null,         -- a DEK, cifrada pela MASTER (formato iv:tag:ct)
  versao int not null default 1,
  atualizado_em timestamptz not null default now()
);

alter table chave_dados enable row level security;
-- SEM policy para authenticated: a DEK cifrada só é lida/escrita por service_role. Um usuário
-- logado nunca a vê; e, mesmo com a mestra, o ciphertext da DEK é inútil sem service_role.
