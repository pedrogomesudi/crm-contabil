# V9 — Multi-tenant (um banco e um app por escritório) — Plano de implementação

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.

**Objetivo:** transformar "subir o SALDO para um escritório" num comando repetível e auditável, e garantir
que **nenhum escritório fique para trás em silêncio** (sem migration, sem cron, sem admin).

**Arquitetura:** um projeto Supabase + um container por escritório. **O app não muda** — as 83 tabelas, 166
policies e 49 funções ficam intactas. O trabalho é **ferramental** (`scripts/*.mjs`, JS puro, fora do
`tsc`).

**Descoberta que simplifica tudo:** os scripts atuais (`db-migrate`, `db-test-rls`, `bootstrap-admin`,
`bootstrap-cron`) já leem **tudo de `process.env`** e são invocados com `--env-file`. Portanto os laços são
apenas: rodar o mesmo script com o `.env` de cada tenant. **Não reescrever os scripts existentes.**

## Restrições globais

- **NUNCA um comando que apague projeto/banco.** Sem `tenant:remover`, sem `--force`, sem `drop`. O token de
  administração do Supabase destrói projetos inteiros; um argumento errado apagaria o banco de um cliente
  real. Criar é automatizável; destruir fica com o humano, no painel.
- **Segredos nunca no git, nunca no log.** `tenants/*.env` no `.gitignore` **antes** de qualquer escrita;
  `SUPABASE_ACCESS_TOKEN` mascarado (`sbp_***`) em qualquer saída.
- **Idempotência:** rodar de novo não estraga. O provisionador retoma de onde parou.
- **Falha ruidosa:** os comandos `:all` saem com código ≠ 0 se **qualquer** tenant falhar. Um tenant
  esquecido não avisa ninguém sozinho.
- `scripts/*.mjs` é JS puro, coberto por ESLint, **fora** do `tsc` (já é a convenção do projeto).
- Rodar `npm run lint` antes de cada commit (typecheck/test não cobrem `scripts/`).

---

### Tarefa 1: Registro de escritórios e proteção dos segredos

**Arquivos:**
- Criar: `tenants/.gitignore`, `tenants/registry.example.json`
- Modificar: `.gitignore` (raiz)
- Criar: `scripts/_tenants.mjs`

- [ ] **Passo 1: Blindar os segredos ANTES de existir qualquer segredo**

`.gitignore` (raiz), acrescentar:

```
# Credenciais por escritório (multi-tenant). NUNCA versionar.
/tenants/*.env
```

`tenants/.gitignore`:

```
*.env
!registry.json
!registry.example.json
!.gitignore
```

- [ ] **Passo 2: `scripts/_tenants.mjs`** — a fonte única da lista de escritórios:

```js
// Registro dos escritórios (multi-tenant, um banco por escritório).
//   tenants/registry.json  -> metadados NÃO sensíveis (pode ser versionado)
//   tenants/<slug>.env     -> segredos (gitignored, chmod 600)
import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DIR_TENANTS = join(RAIZ, "tenants");
export const REGISTRY = join(DIR_TENANTS, "registry.json");

export function lerRegistry() {
  if (!existsSync(REGISTRY)) return { escritorios: [] };
  return JSON.parse(readFileSync(REGISTRY, "utf8"));
}

export function envDoTenant(slug) {
  return join(DIR_TENANTS, `${slug}.env`);
}

// Grava o .env do tenant com permissão restrita. NUNCA imprime o conteúdo.
export function gravarEnv(slug, vars) {
  mkdirSync(DIR_TENANTS, { recursive: true });
  const caminho = envDoTenant(slug);
  const corpo = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  writeFileSync(caminho, corpo, { mode: 0o600 });
  chmodSync(caminho, 0o600);
  return caminho;
}

export function salvarRegistry(reg) {
  mkdirSync(DIR_TENANTS, { recursive: true });
  writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + "\n");
}

// Mascara qualquer segredo em saídas de log.
export const mascarar = (s) => String(s ?? "").replace(/(sbp_|sb_secret_|eyJ)[A-Za-z0-9._-]+/g, "$1***");
```

- [ ] **Passo 3: Verificar** — `git check-ignore -v tenants/x.env` deve confirmar que está ignorado
  **antes** de qualquer credencial ser escrita.

- [ ] **Passo 4: Commit**

```bash
git add .gitignore tenants/.gitignore tenants/registry.example.json scripts/_tenants.mjs
git commit -m "feat(tenants): registro de escritorios com segredos fora do git"
```

---

### Tarefa 2: Provisionador — `tenant:novo`

**Arquivos:** Criar `scripts/tenant-novo.mjs`; modificar `package.json` (script)

**Uso:**
```
SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_ORG_ID=... npm run tenant:novo -- \
  --slug contabilx --nome "Contabilidade X" --email admin@contabilx.com.br [--dry-run]
```

- [ ] **Passo 1: Guardas, antes de tudo**

1. `--slug` só `[a-z0-9-]{3,30}` (vira subdomínio e nome de arquivo);
2. **aborta** se `tenants/<slug>.env` já existir **e** não estiver em `--retomar` (não sobrescrever
   credencial de um escritório vivo);
3. **aborta** se `git check-ignore tenants/<slug>.env` falhar — se o `.gitignore` não estiver no lugar,
   **não escreve segredo nenhum**;
4. exige `SUPABASE_ACCESS_TOKEN` e `SUPABASE_ORG_ID` no ambiente (nunca em arquivo).

- [ ] **Passo 2: Criar o projeto Supabase** (Management API)

```js
// POST https://api.supabase.com/v1/projects
// { organization_id, name, region, db_pass, plan }
// -> { id: project_ref, ... }
// Depois: GET /v1/projects/{ref} até status === 'ACTIVE_HEALTHY' (com timeout e backoff).
// E: GET /v1/projects/{ref}/api-keys  -> publishable + service_role
```

A senha do banco é **gerada** (`randomBytes(24)`) e guardada só no `.env` do tenant.
Em `--dry-run`, imprime o que faria e **para aqui**.

- [ ] **Passo 3: Montar o `.env` do tenant** — via `gravarEnv()`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable>
NEXT_PUBLIC_SITE_URL=https://<slug>.seusaldo.ai
SUPABASE_SERVICE_ROLE_KEY=<service_role>
SUPABASE_DB_URL=<session pooler, com a senha gerada>
CRON_SECRET=<hex 32>
WHATSAPP_CRIPTO_KEY=<hex 32>
ONBOARDING_CRIPTO_KEY=<hex 32>
BOLETO_CRIPTO_KEY=<hex 32>
EMAIL_CRIPTO_KEY=<hex 32>
ADMIN_EMAIL=<--email>
ADMIN_PASSWORD=<gerada, 20 chars>
ADMIN_NOME=<--nome>
```

**Cada tenant com as suas chaves** — vazar a de um não compromete os outros.

- [ ] **Passo 4: Rodar o que já existe, apontando para o tenant** — `spawnSync` com
  `node --env-file=tenants/<slug>.env scripts/<script>.mjs`, nesta ordem, **parando no primeiro erro**:

1. `db-migrate.mjs` (as 95 migrations);
2. `bootstrap-admin.mjs` (o admin do escritório);
3. `bootstrap-cron.mjs` (os 4 jobs, com `APP_URL=https://<slug>.seusaldo.ai`).

**Não reescrever esses scripts.** Eles já leem tudo de `process.env`.

- [ ] **Passo 5: Registrar e orientar**

Atualiza `tenants/registry.json` (slug, nome, subdomínio, `project_ref`, `criado_em`) e imprime:
- o **bloco de env** para colar no EasyPanel (com os segredos **visíveis**, pois é o que o operador precisa
  colar — mas avisando para não passar por chat/e-mail);
- o **checklist manual**: criar o app no EasyPanel apontando para o repo, colar o env, apontar o subdomínio
  `<slug>.seusaldo.ai`, configurar as Auth URLs no Supabase.

- [ ] **Passo 6: `package.json`**

```json
"tenant:novo": "node scripts/tenant-novo.mjs"
```

(Sem `--env-file`: o token vem do ambiente do operador.)

- [ ] **Passo 7: Verificar e commitar**

```bash
npm run lint
npm run tenant:novo -- --slug teste-dry --nome "Teste" --email a@b.com --dry-run   # não cria nada
git add scripts/tenant-novo.mjs package.json
git commit -m "feat(tenants): provisionador de escritorio (cria projeto, migra, admin, crons)"
```

---

### Tarefa 3: Laços — `:all` e o `doctor`

**Arquivos:** Criar `scripts/tenants-all.mjs`, `scripts/tenant-doctor.mjs`; modificar `package.json`

- [ ] **Passo 1: `tenants-all.mjs`** — roda um script para **todos** os tenants do registry:

```js
// Uso: node scripts/tenants-all.mjs <db-migrate|db-test-rls|bootstrap-cron>
// Roda o script com --env-file de CADA tenant. Falha ruidosa: sai com código 1 se
// QUALQUER tenant falhar — e diz quais. Um tenant esquecido não avisa ninguém sozinho.
```

Ao fim, um resumo: `contabilx OK · escritorio2 FALHOU (migration 0093)`, e `process.exit(1)` se houve
falha. Para o `bootstrap-cron`, injeta `APP_URL` do registry de cada um.

- [ ] **Passo 2: `package.json`**

```json
"db:migrate:all": "node scripts/tenants-all.mjs db-migrate",
"db:test:all": "node scripts/tenants-all.mjs db-test-rls",
"cron:bootstrap:all": "node scripts/tenants-all.mjs bootstrap-cron",
"tenant:doctor": "node scripts/tenant-doctor.mjs"
```

- [ ] **Passo 3: `tenant-doctor.mjs`** — o diagnóstico que impede a deriva silenciosa. Para **cada** tenant:

| Checagem | Como |
|---|---|
| Migrations em dia | `select count(*) from app_migrations` × arquivos em `supabase/migrations/` |
| Os 4 jobs de cron | `select jobname from cron.job` |
| Admin existe | `select count(*) from usuarios where papel='admin' and ativo` |
| Chaves presentes | as 5 chaves no `.env` do tenant (existência, **nunca imprimir o valor**) |
| App responde | `GET https://<sub>/login` → 200/307 |

Saída em tabela, com `✗` no que estiver errado e **exit 1** se algo falhar — para poder virar um check de
rotina.

- [ ] **Passo 4: Verificar e commitar**

```bash
npm run lint && npm run tenant:doctor    # com só o tenant atual registrado, deve passar
git add scripts/tenants-all.mjs scripts/tenant-doctor.mjs package.json
git commit -m "feat(tenants): laços :all com falha ruidosa e diagnostico de deriva"
```

---

### Tarefa 4: Adotar o escritório atual como o primeiro tenant

O SALDO em produção (`app.seusaldo.ai`) passa a ser **um tenant como outro qualquer** — senão ele fica de
fora dos laços e vira o primeiro a derivar.

- [ ] **Passo 1:** Gerar `tenants/gomes.env` a partir do `.env.local` atual (o operador faz; o script
  `tenant:adotar --slug <slug> --de .env.local --url https://app.seusaldo.ai` monta o arquivo e registra no
  `registry.json`, **sem** criar projeto nem rodar migration).
- [ ] **Passo 2:** `npm run tenant:doctor` → o tenant existente deve aparecer **verde** em tudo.
- [ ] **Passo 3: Commit** (só o `registry.json` e o script; o `.env` fica fora do git).

```bash
git add scripts/tenant-adotar.mjs tenants/registry.json package.json
git commit -m "feat(tenants): adota o escritorio atual como primeiro tenant"
```

---

### Tarefa 5: Documentação, entrega e tag

- [ ] **Passo 1:** `docs/DEPLOY.md` — nova seção **"Provisionar um escritório novo"** (o comando, o
  checklist do EasyPanel, as Auth URLs) e **"Rotina multi-tenant"** (`db:migrate:all` **antes** do deploy;
  `cron:bootstrap:all` depois de qualquer restore; `tenant:doctor` como checagem periódica).
  Registrar em destaque: **não existe comando de remover tenant, por decisão de segurança.**
- [ ] **Passo 2:** `docs/DOCUMENTACAO.md` (seção de arquitetura: um banco e um app por escritório; o que
  isso elimina — vazamento entre tenants — e o que custa) + `CHANGELOG.md`.
- [ ] **Passo 3:** Commit, merge `develop` → `main`, push.
- [ ] **Passo 4: Pedir ao usuário, explicitamente:**
  1. rodar `npm run tenant:adotar` para registrar o escritório atual e conferir o `tenant:doctor`;
  2. **o teste de verdade:** criar um **segundo escritório** (pode ser de teste) com `tenant:novo`, subir o
     app no EasyPanel com o env impresso, e entrar com o admin dele. É a única prova de que o
     provisionamento funciona ponta a ponta;
  3. rodar `npm run tenant:doctor` de novo — os **dois** verdes.
- [ ] **Passo 5:** Após o "validei, deu certo": tag **`v6.0.0`** (major — muda a topologia de implantação).
