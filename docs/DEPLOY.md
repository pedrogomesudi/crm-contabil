# Deploy — CRM Contábil (EasyPanel na Hostinger VPS)

Guia operacional da Fase 1. Substitua `crm.SEU-DOMINIO.com.br` pelo domínio escolhido.

- **VPS:** `srv1767582.hstgr.cloud` — IP `187.77.234.86` (EasyPanel).
- **Supabase:** mesmo projeto de desenvolvimento (já com migrations 0001–0011 aplicadas e admin criado).
- **Porta do app:** 3000 · **Health check:** `/api/health`.

---

## 1. DNS — apontar o domínio para o VPS

No painel de DNS do domínio (Wix, Hostinger ou outro registrador):

| Tipo | Nome/Host | Valor | TTL |
|------|-----------|-------|-----|
| `A`  | `crm` (ou `@` se domínio raiz) | `187.77.234.86` | padrão |

- Subdomínio de `gomesadvocacia.com.br` (DNS no Wix): adicione um registro **A** `crm` → `187.77.234.86`.
- Domínio próprio na Hostinger: aponte o **A** (ou os nameservers para a Hostinger) para o IP do VPS.
- Propagação leva de minutos a algumas horas. Confira com: `dig +short crm.SEU-DOMINIO.com.br`.

---

## 2. Criar o app no EasyPanel

No EasyPanel → **+ Service → App**.

### Opção A — GitHub (recomendado, auto-deploy)
1. Faça push deste repositório para um repo (privado) no GitHub.
2. App → **Source = GitHub** → selecione o repo e a branch `main`.
3. **Build = Dockerfile** (o `Dockerfile` na raiz já está pronto, output `standalone`).

### Opção B — Imagem Docker (sem GitHub)
1. Build local e push para um registry (Docker Hub privado grátis):
   ```bash
   docker build \
     --build-arg NEXT_PUBLIC_SUPABASE_URL="https://SEU-REF.supabase.co" \
     --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_..." \
     --build-arg NEXT_PUBLIC_SITE_URL="https://crm.SEU-DOMINIO.com.br" \
     -t SEU-USUARIO/crm-contabil:0.1.0 .
   docker push SEU-USUARIO/crm-contabil:0.1.0
   ```
2. App → **Source = Docker Image** → `SEU-USUARIO/crm-contabil:0.1.0`.

> Em ambas as opções, **as `NEXT_PUBLIC_*` precisam estar no BUILD** (são embutidas no bundle).
> No GitHub/Dockerfile do EasyPanel, defina-as como **Build Args**.

### Variáveis (EasyPanel → Environment)

**Build args (NEXT_PUBLIC_\*, embutidas no build):**
```
NEXT_PUBLIC_SUPABASE_URL=https://SEU-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...        # a publishable key (NÃO a anon JWT legada)
NEXT_PUBLIC_SITE_URL=https://crm.SEU-DOMINIO.com.br
```

**Runtime (secreta, só no servidor — NUNCA NEXT_PUBLIC):**
```
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...                 # marcar como secreto
EMAIL_CRIPTO_KEY=<hex de 32 bytes>                      # cifra a senha SMTP / chave de API (RF-051)
```

> As chaves de cripto (`WHATSAPP_CRIPTO_KEY`, `ONBOARDING_CRIPTO_KEY`, `BOLETO_CRIPTO_KEY`,
> `EMAIL_CRIPTO_KEY`) são definidas **uma vez** e **nunca alteradas** — trocar a chave torna o que já
> está cifrado irrecuperável. Gerar com:
> `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

> Não precisa de `SUPABASE_DB_URL`/`ADMIN_*` no runtime do app — essas são só do ferramental
> de banco (`scripts/*.mjs`), que roda na sua máquina, não no container.

### Rede / domínio
- **Port mapping:** container `3000`.
- **Domains:** adicione `crm.SEU-DOMINIO.com.br` → **HTTPS habilitado** (EasyPanel emite Let's Encrypt).
- **Health check:** `/api/health` (o Dockerfile já tem `HEALTHCHECK`; o EasyPanel também pode apontar para esse path).

---

## 3. Configurar URLs de Auth no Supabase

Supabase → **Authentication → URL Configuration**:
- **Site URL:** `https://crm.SEU-DOMINIO.com.br`
- **Redirect URLs (adicionar):**
  - `https://crm.SEU-DOMINIO.com.br/auth/confirmar`
  - `https://crm.SEU-DOMINIO.com.br/redefinir-senha`

> Sem isso, os links de **convite** e **recuperação de senha** apontam para o domínio errado e falham.
> O SMTP (Brevo) já está configurado e validado — não precisa mexer.

---

## 4. Admin de produção

O admin (`pedro@gomesadvocacia.com.br`) já existe no projeto Supabase e é `papel = admin` (ativo).
Nada a fazer. Se algum dia precisar recriar/promover um admin:
```bash
# na sua máquina, com .env.local apontando ao Supabase:
npm run admin:bootstrap
```

---

## 4.1 Jobs agendados (pg_cron) — **rodar após qualquer restore de banco**

Três jobs `pg_cron` sustentam automações que ninguém percebe funcionando — só percebe quando param:

| Job | Agenda | O que faz |
|---|---|---|
| `gerar-mensalidades-mensal` | `0 6 1 * *` | Gera as mensalidades do mês (função SQL). |
| `regua-cobranca-diaria` | `0 12 * * *` | `POST` em `/api/cron/regua-cobranca` (via `pg_net`). |
| `gerar-obrigacoes-mensal` | `0 12 1 * *` | `POST` em `/api/cron/gerar-obrigacoes` (via `pg_net`). |
| `tarefas-recorrentes-diaria` | `0 9 * * *` | `POST` em `/api/cron/tarefas-recorrentes` (via `pg_net`). Gera as ocorrências das tarefas recorrentes (RF-040). |

Os dois últimos enviam o `CRON_SECRET` no header `Authorization`. Por isso **não** vivem numa
migration (seria commitar o segredo); vivem num script que lê o segredo do ambiente.

> **Risco real:** um restore de backup pode deixar `cron.job` vazio. Sem esses jobs, a régua de
> cobrança e a geração mensal de obrigações param **silenciosamente** — a falha só apareceria no
> primeiro prazo perdido. Depois de todo restore, rode:

```bash
CRON_SECRET=<mesmo valor do EasyPanel> APP_URL=https://app.seusaldo.ai npm run cron:bootstrap
```

O script é **idempotente** (faz upsert pelo nome do job, preservando o `jobid`) e nunca imprime o
segredo. Para conferir o estado atual sem gravar nada:

```bash
CRON_SECRET=... APP_URL=https://app.seusaldo.ai npm run cron:bootstrap -- --dry-run
```

Ele recusa `APP_URL` que não seja `https` público — o cron roda **no banco**, não na sua máquina,
então `localhost` nunca funcionaria.

---

## 5. Verificação ponta a ponta (no domínio público)

1. `https://crm.SEU-DOMINIO.com.br/api/health` → `{"status":"ok"}`.
2. **Login** como admin.
3. **Convidar** um usuário → conferir e-mail de convite chegando → definir senha pelo link → entrar.
4. **Cliente:** cadastrar → **anexar** documento → **baixar** (gera log) → **inativar**.
5. Logar como **assistente** → confirmar honorário **invisível**.
6. Conferir headers em produção:
   ```bash
   curl -sI https://crm.SEU-DOMINIO.com.br/login | grep -iE "content-security|strict-transport|cross-origin"
   ```

---

## 5.1 Multi-tenant — um banco e um app por escritório (V9)

Cada escritório é um **projeto Supabase** + um **app no EasyPanel** + um **subdomínio**. Os dados são
isolados **fisicamente**: um escritório não lê o do outro nem com uma policy errada, porque o dado não está
no mesmo banco. O código é o mesmo para todos.

### Provisionar um escritório novo

```bash
SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_ORG_ID=... \
  npm run tenant:novo -- --slug contabilx --nome "Contabilidade X" --email admin@contabilx.com.br
```

Use `--dry-run` antes para conferir sem gastar um projeto. O script cria o projeto Supabase, roda as
migrations, **gera as chaves de cripto do escritório**, cria o admin, registra os 4 jobs de cron e grava
`tenants/<slug>.env` (fora do git, `chmod 600`). Depois, à mão: criar o app no EasyPanel, colar o env,
apontar o subdomínio e configurar as Auth URLs no Supabase.

> **Não existe `tenant:remover` — por decisão de segurança.** O `SUPABASE_ACCESS_TOKEN` destrói projetos
> inteiros; um script com esse poder e um argumento errado apagam o banco de um cliente real. Quem apaga é
> o humano, no painel, olhando para o nome do projeto.

### Rotina multi-tenant

| Comando | Quando |
|---|---|
| `npm run db:migrate:all` | **Antes** de cada deploy — uma coluna que o código espera e o banco não tem derruba o tenant. |
| `npm run cron:bootstrap:all` | Depois de qualquer **restore** de banco (os jobs somem). |
| `npm run db:test:all` | Após mudanças de RLS. |
| `npm run tenant:doctor` | Periodicamente: quem está atrasado, sem cron, sem admin, sem chave. |

Os `:all` **falham com código ≠ 0** se qualquer escritório falhar. A partir do segundo, esquecer um é a
falha silenciosa clássica: ele fica sem os crons e ninguém percebe até um prazo estourar.

### ⚠️ As chaves de cripto são o único dado sem backup

`WHATSAPP_CRIPTO_KEY`, `ONBOARDING_CRIPTO_KEY`, `BOLETO_CRIPTO_KEY`, `EMAIL_CRIPTO_KEY` e
**`NFSE_CERT_KEY`** (esta cifra os **certificados digitais A1 dos clientes**) **não são
recuperáveis de lugar nenhum** — nem do backup do banco, que guarda só o texto cifrado. Perdê-las torna
irrecuperáveis: certificado NFS-e, credenciais do WhatsApp, senha do SMTP, chaves de boleto e o **cofre de
acessos dos clientes**. Guarde o `tenants/<slug>.env` num cofre de senhas. (O envelope encryption do V10
resolve a rotação; ele **não** resolve a perda.)

O **`CRON_SECRET`** é a exceção: ele é recuperável, porque o banco precisa mandá-lo ao app no cabeçalho
`Authorization` — está, em texto claro, dentro do `command` dos jobs de `cron.job`.

Já `ZAPI_WEBHOOK_SECRET`, `BOLETO_WEBHOOK_SECRET` e as credenciais Clicksign são **rotacionáveis**: se
sumirem, gera-se outro e reconfigura-se no provedor. O `tenant:doctor` **falha** nas chaves de cripto e
apenas **avisa** nestas.

## 5.2 Envelope encryption (V10-B) — rotação de chave

As 5 chaves de domínio deixam de cifrar o dado diretamente. Agora há uma **chave-mestra**
(`MASTER_CRIPTO_KEY`) que cifra 5 **DEKs** (uma por domínio) guardadas em `chave_dados`. Cada DEK **é** o
valor da chave antiga do domínio — então **nada de dado é re-cifrado**. Rotacionar a mestra re-embrulha as
5 DEKs; o dado cifrado fica intacto.

### Migração (uma vez por escritório)

Ordem: **migration `0097` → `MASTER_CRIPTO_KEY` no env → deploy do código → `cripto:migrar`**.

```bash
# com MASTER_CRIPTO_KEY e as 5 chaves de domínio no ambiente:
npm run cripto:migrar
```

Cria as 5 DEKs e **auto-testa** decifrando um dado real de cada domínio; se algum falhar, faz rollback e não
grava nada. As 5 chaves de domínio **continuam no env como fallback** durante a transição — podem ser
removidas depois de validado (sobra só a mestra).

### Rotação da mestra

```bash
npm run cripto:rotacionar -- --nova <hex de 64>
```

Ordem: **banco (o script) → trocar `MASTER_CRIPTO_KEY` no EasyPanel → deploy**. O script re-embrulha e
auto-testa com a nova mestra antes de confirmar. O fallback (chaves de domínio no env) evita downtime se a
ordem escorregar.

### ⚠️ Agora o segredo irrecuperável é a MASTER

Com o envelope, a **`MASTER_CRIPTO_KEY`** é a chave que, se perdida, torna as DEKs (e todo o dado cifrado)
irrecuperáveis. Guarde-a no `tenants/<slug>.env` e num cofre de senhas. As 5 chaves de domínio, uma vez
migradas, viram **redundância** (a DEK guarda o mesmo valor, cifrada no banco, que tem backup).

## 5.3 Backup e restauração (RNF-06)

### Duas fontes, responsabilidades distintas

- **Backup do Supabase (fonte primária):** cobre o **projeto inteiro** — `public` (negócio), `auth`
  (usuários/login) e `storage` (arquivos). Automático (retenção do plano). É ele que se usa num restore
  real.
- **Dump próprio (redundância):** `npm run backup:dump -- --slug <slug>` (com `--env-file` do tenant) —
  `pg_dump` do schema **`public`** para `backups/<slug>/<data>.sql.gz`, retenção **7 diários + 4 semanais**,
  e envio a um bucket S3-compatível se `BACKUP_S3_*` estiver no ambiente. **Não** cobre auth/storage.
  Pré-requisito: `pg_dump` instalado (client tools do Postgres — `brew install libpq`).

**O que um restore NÃO traz sozinho:** as extensões `pg_cron`/`pg_net` e os 4 jobs de cron. O runbook os
recria.

### Runbook do ensaio de restauração (ritual trimestral)

1. **Restaurar num projeto NOVO** (nunca produção): Supabase → Backups → Restore → novo projeto.
2. Montar um `.env` do projeto restaurado: URL, service_role, e a **MESMA `MASTER_CRIPTO_KEY`** do original
   (sem ela as DEKs não desembrulham) + as 5 chaves de domínio (fallback) + `SUPABASE_DB_URL` do restaurado.
3. **Recriar o que o restore não traz:**
   - extensões: `create extension if not exists pg_net; create extension if not exists pg_cron;`
   - crons: `CRON_SECRET=... APP_URL=https://<restaurado> npm run cron:bootstrap` (com `--env-file` do restaurado).
4. **Provar:** `node --env-file=<env do restaurado> scripts/restore-verificar.mjs` → tudo ✓ = restore
   comprovado (dados, extensões, crons, admin, envelope e a cripto decifrando dado real).
5. **Apagar** o projeto descartável.

### Variáveis do backup na nuvem (opcional)

```
BACKUP_S3_ENDPOINT=s3.us-west-002.backblazeb2.com   # ou o endpoint AWS/Wasabi
BACKUP_S3_REGION=us-west-002
BACKUP_S3_BUCKET=saldo-backups
BACKUP_S3_KEY_ID=...        # marcar como secreto
BACKUP_S3_SECRET=...        # marcar como secreto
```

## 6. Release

```bash
git tag -a v0.1.0-fase1 -m "Fase 1 (Fundação) no ar"
git push --tags        # se houver remoto
```

---

## Notas

- **Migrations em produção:** já aplicadas via runner próprio (`npm run db:migrate`) no mesmo projeto.
  Para novas migrations no futuro: rode `npm run db:migrate` e `npm run db:test` localmente apontando ao projeto.
- **Atualizar o app:** na Opção A, basta `git push` (auto-deploy). Na Opção B, rebuild + push da imagem e
  redeploy no EasyPanel.
- **Rollback:** o EasyPanel mantém histórico de deploys; reverta para o anterior pela UI.

## Gotenberg (conversão de contrato para PDF — V3)

A geração de contrato (V3) entrega o **Word** sempre; para o **PDF**, o app chama um serviço
**Gotenberg** (LibreOffice headless via HTTP). Sem ele, a geração funciona entregando só o `.docx`.

1. No EasyPanel, **no mesmo projeto do app**, crie um serviço do tipo *App* a partir da imagem
   **`gotenberg/gotenberg:8`**. Porta interna **`3000`** (não precisa expor domínio público).
2. O hostname interno é o **nome do serviço** dentro do projeto. No EasyPanel o host costuma ser
   `<projeto>_<servico>` — confira no painel do serviço. Ex.: se o serviço se chama `gotenberg` no
   projeto `crm`, o host é `crm_gotenberg`.
3. No serviço do **app**, em *Environment*, defina **`GOTENBERG_URL`** apontando para o Gotenberg:
   `GOTENBERG_URL=http://crm_gotenberg:3000` (ajuste ao host real do passo 2).
4. **É variável de runtime** (não `NEXT_PUBLIC_`): basta **reiniciar** o app — **não precisa rebuild**.
5. Os contratos contêm dados pessoais: manter o Gotenberg **na mesma infraestrutura** (não usar
   conversores SaaS externos) atende à LGPD.
6. Teste: gere um contrato pela ficha do cliente — o `.pdf` deve aparecer nos Documentos junto ao
   `.docx`. Se sair só o Word com aviso "PDF não gerado", confira o host/porta em `GOTENBERG_URL`
   (o app loga o motivo da falha em `converterPdf`).

> Recursos: Gotenberg é gratuito (open-source). Consome pouca RAM em repouso; durante a conversão
> sobe ~200–400 MB por alguns segundos. Reserve essa folga no VPS.

## Clicksign (assinatura digital — V4)

A V4 envia o contrato gerado para assinatura na **Clicksign** e recebe o assinado de volta por webhook.

1. No painel da Clicksign, gere o **access_token** (comece no **sandbox** — sem validade jurídica —
   e troque para produção depois).
2. No serviço do **app** (EasyPanel), em *Environment*, defina — **runtime, só reiniciar, sem rebuild**:
   - `CLICKSIGN_URL` — `https://sandbox.clicksign.com/api/v3` (sandbox) ou `https://app.clicksign.com/api/v3` (produção)
   - `CLICKSIGN_TOKEN` — o access_token do ambiente
   - `CLICKSIGN_HMAC_SECRET` — um segredo forte (o mesmo cadastrado no webhook)
3. **Cadastre o webhook** na Clicksign apontando para **`https://<app>/api/webhooks/clicksign`**, usando
   o mesmo `CLICKSIGN_HMAC_SECRET` (o app valida o header `x-clicksign-signature`).
4. Trocar **sandbox → produção** muda só `CLICKSIGN_URL`/`CLICKSIGN_TOKEN` (e o webhook do painel de
   produção).

> Segredos nunca vão para o navegador (não são `NEXT_PUBLIC_`). O webhook é autenticado por HMAC.

## NFS-e nacional (V5)

O CRM emite a NFS-e dos honorários pela API nacional (Sefin), com o certificado A1 cifrado in-house.

1. Gere a chave de cifra do certificado: `openssl rand -hex 32` → valor de `NFSE_CERT_KEY`.
2. No serviço do **app** (EasyPanel), defina — **runtime, só reiniciar**:
   - `NFSE_CERT_KEY` — a chave gerada (nunca perca/mude: o certificado guardado é cifrado com ela).
   - `NFSE_URL_HOMOLOGACAO` — `https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional`
   - `NFSE_URL_PRODUCAO` — `https://sefin.nfse.gov.br/SefinNacional`
3. No app, em **Configurações → NFS-e**, preencha os **dados fiscais** do escritório e faça o **upload
   do certificado A1** (.pfx + senha). O certificado é validado e guardado **cifrado**.
4. Comece com o ambiente em **homologação** (produção restrita). Emita uma nota de teste e confira a
   autorização. Só troque `nfse_config.ambiente` para **produção** após validar.

> `NFSE_CERT_KEY` e a senha do certificado só existem no servidor. O certificado nunca vai ao browser.
