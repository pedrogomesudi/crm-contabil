# V10-B — Envelope encryption — Design

**Data:** 2026-07-15
**Marco:** V10 — *"Antes dos marcos V9/V10, implementar envelope encryption (chave de dados por segredo,
cifrada pela chave mestra rotacionável)."* Risco atacado (gap analysis): *"Chaves de criptografia sem
rotação — chave vazada não pode ser rotacionada sem perda dos dados cifrados."*

---

## 1. O problema e a solução

Hoje 5 chaves cifram o dado **diretamente** (`WHATSAPP_`, `ONBOARDING_`, `BOLETO_`, `EMAIL_CRIPTO_KEY`,
`NFSE_CERT_KEY`). Uma chave vazada **não pode ser trocada** sem re-cifrar tudo o que ela protegeu.

**Envelope:** o dado é cifrado por uma **chave-de-dados (DEK)**; a DEK é guardada **cifrada por uma
chave-mestra (KEK)**. Rotacionar = re-embrulhar a DEK com a nova mestra — **o dado cifrado não é tocado**.

### O truque que elimina a re-cifragem

Cada DEK **é o valor atual da chave do domínio**. A `WHATSAPP_CRIPTO_KEY` de hoje vira a **DEK do domínio
"whatsapp"**, agora guardada cifrada pela mestra, no banco. Como a DEK é idêntica à chave antiga, **todo o
dado já cifrado continua decifrando** — zero migração de dado. Só acrescentamos uma camada por cima.

## 2. Componentes

- **`MASTER_CRIPTO_KEY`** (env): a única chave que sobra no ambiente e a única rotacionável. Hex de 32
  bytes. Backup em `tenants/<slug>.env` (como as demais).
- **`chave_dados`** (tabela): uma linha por domínio, com a **DEK cifrada pela mestra** e uma versão.
- **`cifrarDominio(dominio, buf)` / `decifrarDominio(dominio, pacote)`**: carregam a DEK do banco,
  desembrulham com a mestra (cache em memória por processo), e chamam o `cifrar`/`decifrar` que já existe.
  O primitivo AES-256-GCM **não muda**.
- **Fallback (decisão do usuário):** se a DEK não carregar (banco fora, migração incompleta),
  `decifrarDominio` cai para `process.env.<CHAVE_DO_DOMINIO>`. Rede de segurança na transição; removível
  depois.

## 3. Banco — `0097_envelope.sql`

```sql
create table chave_dados (
  dominio text primary key,          -- 'whatsapp','onboarding','boleto','email','nfse'
  dek_cifrado text not null,         -- a DEK, cifrada pela MASTER (formato iv:tag:ct)
  versao int not null default 1,
  atualizado_em timestamptz not null default now()
);
```

**RLS:** habilitada, **sem policy alguma** para `authenticated` — a tabela é lida/escrita **só por
service_role** (o app carrega a DEK server-side). Um usuário logado nunca vê a DEK cifrada, muito menos a
DEK. (Mesmo com a mestra, a DEK cifrada é inútil sem `service_role` para lê-la.)

## 4. Código

```
src/lib/cripto/
  master.ts        masterKey() — lê MASTER_CRIPTO_KEY, valida (64 hex)
  envelope.ts      dekDoDominio(dominio) [cache], cifrarDominio(), decifrarDominio() [com fallback]
  dominios.ts      DOMINIOS = { whatsapp:'WHATSAPP_CRIPTO_KEY', ... } — o mapa domínio→env de fallback
```

- `envelope.ts` reusa `cifrar`/`decifrar` de `@/lib/nfse/cripto` (o primitivo).
- **Cache:** a DEK **desembrulhada** é cacheada por processo (`Map<dominio, Buffer>`). A rotação re-embrulha
  a DEK (muda o `dek_cifrado`), mas **não muda o valor da DEK** — o cache segue válido. (Rotação de DEK, que
  exigiria re-cifrar dado, **não** é feature desta fatia.)

**Migração dos 17 arquivos / ~20 call sites:** trocar `cifrar(buf, process.env.X)` por
`await cifrarDominio("dominio", buf)` e o inverso para decifrar. Os domínios que já têm wrapper fino
(`boleto/cripto.ts`, `onboarding/credencial.ts`) mudam num lugar só. Os testes que setam
`process.env.ONBOARDING_CRIPTO_KEY` continuam válidos (o fallback).

## 5. Scripts

- **`scripts/cripto-migrar.mjs`** (`npm run cripto:migrar`): lê as 5 chaves do env + a `MASTER_CRIPTO_KEY`,
  embrulha cada uma como DEK e grava em `chave_dados` (idempotente — não sobrescreve se já existe, salvo
  `--forcar`). **Auto-teste obrigatório:** para cada domínio com dado cifrado em produção (ex.: o token do
  WhatsApp em `whatsapp_config`, o certificado em `nfse_certificado`), desembrulha a DEK e **decifra um
  valor real**; se qualquer um falhar, **aborta e não grava** — a garantia de que a DEK está correta antes
  de confiar nela.
- **`scripts/cripto-rotacionar.mjs`** (`npm run cripto:rotacionar`): recebe a mestra antiga (env atual) e a
  nova (`--nova <hex>`); para cada domínio, desembrulha a DEK com a antiga, re-embrulha com a nova, grava,
  incrementa a versão. **Auto-teste:** decifra um valor real com a DEK re-embrulhada antes de confirmar.
  Imprime o lembrete de trocar `MASTER_CRIPTO_KEY` no EasyPanel **depois** de rotacionar (a ordem importa:
  rotaciona no banco → troca no env → deploy).
- **Provisionador:** `tenant:novo` passa a gerar a `MASTER_CRIPTO_KEY` e a rodar `cripto:migrar` como parte
  do provisionamento (escritório novo já nasce com envelope).
- **`tenant:doctor`:** nova coluna — cada escritório tem a `MASTER_CRIPTO_KEY` no env **e** as 5 DEKs em
  `chave_dados`? Um escritório sem migrar aparece.

## 6. Segurança

- A mestra nunca é impressa (mascarada nos logs, como os demais segredos).
- `chave_dados` sem policy de `authenticated`: a DEK cifrada só é lida por service_role.
- Os scripts auto-testam **decifrando dado real** antes de confiar — nunca gravam uma DEK que não decifra.
- Rotação toca 5 linhas; o dado cifrado é imutável no processo (nenhum re-write de certificado/token).

## 7. Ordem de rollout (importa)

1. `0097` aplicada; `MASTER_CRIPTO_KEY` no env; deploy do código (com fallback ligado — nada quebra, ainda
   usa as chaves do env).
2. `npm run cripto:migrar` — cria as DEKs, auto-testa.
3. A partir daí o app usa as DEKs; o env é só fallback.
4. (Opcional, depois de validado) remover as 5 chaves do env — sobra só a mestra.
5. Rotação, quando necessária: `cripto:rotacionar --nova <hex>` → trocar `MASTER_CRIPTO_KEY` no EasyPanel →
   deploy.

## 8. Fora desta fatia

Rotação da DEK (exigiria re-cifrar o dado — só se uma DEK específica vazar); KMS externo; rotação
automática agendada (é evento raro e deliberado).

## 9. Validação

Migrar em produção e conferir pelo banco que: as 5 DEKs existem cifradas; um token do WhatsApp e o
certificado NFS-e **decifram** via `decifrarDominio`; o `doctor` fica verde. Depois, um ensaio de rotação
(gerar nova mestra, rotacionar, decifrar de novo) — **sem** trocar o env ainda, só provando que a DEK
re-embrulhada decifra.

**Versão:** `v6.2.0` (feature).
