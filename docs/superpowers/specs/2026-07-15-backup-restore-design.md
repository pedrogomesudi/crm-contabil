# V10-C — Backup e teste de restauração (RNF-06) — Design

**Data:** 2026-07-15
**Requisito (RNF-06):** *"Backups automáticos com política de retenção e teste periódico de restauração."*
**Urgência do gap analysis:** *"os jobs pg_cron foram criados direto no banco — um restore não os recria; a
falha só seria percebida no primeiro prazo perdido."* (A ferramenta disso — `cron:bootstrap` — já existe;
falta amarrar num procedimento e num verificador.)

---

## 1. A divisão de responsabilidade (o eixo honesto)

Um restore completo do escritório tem **duas fontes**, e o desenho não pode fingir que uma cobre a outra:

- **Backup do Supabase (a fonte primária):** cobre o **projeto inteiro** — `public` (dados do negócio),
  `auth` (usuários/login, geridos pelo GoTrue) e `storage` (arquivos). É o backup automático diário do
  Supabase, e é ele que se usa num restore real.
- **Dump próprio (redundância):** um `pg_dump` do schema **`public`** — os dados do negócio, o que é nosso e
  insubstituível. **Não** cobre `auth` nem os arquivos do Storage de forma confiável (território do
  Supabase). É a segunda cópia, independente do Supabase, contra o cenário de perder o acesso ao projeto.

**O que um restore NÃO traz de volta sozinho** (e o runbook trata): as extensões `pg_cron`/`pg_net` e os
**4 jobs de cron**. Sem isso, a régua e a geração de obrigações param em silêncio.

## 2. Entregas

### 2.1 Dump próprio agendável — `scripts/backup-dump.mjs`

`npm run backup:dump` (com o `--env-file` do tenant):
1. `pg_dump --schema=public --no-owner --no-privileges` via `SUPABASE_DB_URL` → gzip;
2. grava em `backups/<slug>/<AAAA-MM-DD>.sql.gz` (pasta **fora do git**);
3. **envia para a nuvem** (S3-compatível: AWS S3 ou Backblaze B2) se `BACKUP_S3_*` estiver no ambiente —
   PutObject com assinatura SigV4 própria (sem SDK, sem CLI externa; o dump comprimido cabe num PutObject);
4. **retenção 7+4:** mantém os **7 diários** mais recentes + **4 semanais** (o de cada domingo), apaga o
   resto — local e (opcional) na nuvem.
- Se o `pg_dump` não estiver instalado, **aborta com instrução clara** (é ferramenta de cliente do Postgres).

### 2.2 Verificador pós-restore — `scripts/restore-verificar.mjs`

`npm run restore:verificar -- --env-file <env do projeto restaurado>`: roda contra um banco **restaurado**
(o projeto descartável do ensaio) e confirma que tudo voltou:

| Checagem | Como |
|---|---|
| Dados do negócio | contagem de tabelas `public` e linhas > 0 nas principais (clientes, titulo, nfse…) |
| Extensões | `pg_cron` e `pg_net` presentes |
| Jobs de cron | os 4 esperados (após o `cron:bootstrap` do runbook) |
| Admin | ≥ 1 admin ativo |
| Envelope | as 5 DEKs em `chave_dados` |
| Integridade cripto | decifra um dado real (ex.: token do WhatsApp) com a mestra do env |

Sai com código ≠ 0 se algo faltar — serve como o "teste" que o RNF-06 exige.

### 2.3 Runbook de restauração — `docs/DEPLOY.md`

Passo a passo, para o ensaio periódico (trimestral) e para a emergência real:
1. No Supabase: **restaurar o backup num projeto NOVO** (não em produção) — Backups → Restore → novo projeto.
2. Montar um `.env` do projeto restaurado (URL, service_role, a **mesma** `MASTER_CRIPTO_KEY` do original —
   sem ela as DEKs não desembrulham).
3. **Recriar o que o restore não traz:** extensões (`create extension pg_net; pg_cron`) e os crons
   (`cron:bootstrap` apontando para a URL do projeto restaurado).
4. `npm run restore:verificar` → tudo verde = restore comprovado.
5. Apagar o projeto descartável.
- E a **política de retenção**: o backup automático do Supabase (retenção do plano) + os dumps 7+4.

## 3. Segurança

- `backups/` no `.gitignore` **antes** de qualquer dump (o dump contém dado de cliente).
- `BACKUP_S3_*` (endpoint, região, bucket, key id, secret) só em env, nunca no git, mascarados no log.
- O verificador **nunca imprime** o valor decifrado — só ✓/✗.
- O ensaio é num projeto **descartável** — nunca toca produção (decisão do usuário).

## 4. Provisionador e doctor

- **Nada obrigatório muda no provisionamento.** Opcionalmente, o `tenant:doctor` ganha um aviso se
  `backups/<slug>/` estiver vazio ou com o dump mais recente há mais de N dias ("sem backup recente").
- `BACKUP_S3_*` entram como **segredos rotacionáveis** no doctor (aviso, não falha — o dump local já é uma cópia).

## 5. Fora desta fatia

Backup automático agendado num servidor sempre-ligado (por ora, roda na máquina do operador ou onde ele
agendar); restore de `auth`/Storage por fora do Supabase (usa-se o backup do Supabase); PITR como rotina
(fica para emergência real).

## 6. Validação

Rodar `backup:dump` e conferir o `.sql.gz` local (e na nuvem, se configurada). Depois, um **ensaio real**:
restaurar o backup do Supabase num projeto descartável, seguir o runbook e ver o `restore:verificar` ficar
verde — a prova de que o restore funciona ponta a ponta. Apagar o projeto ao final.

**Versão:** `v6.3.0` (feature) — e **fecha o marco V10**.
