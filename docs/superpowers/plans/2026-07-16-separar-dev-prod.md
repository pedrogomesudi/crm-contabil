# Separar o banco de dev do de produção — Plano

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit
> (quando houver o que commitar). Spec: `docs/superpowers/specs/2026-07-16-separar-dev-prod-design.md`.

**Objetivo:** o `.env.local` passa a apontar para um banco de desenvolvimento próprio e vazio, e nenhum
comando de dev alcança mais o banco que atende o app em produção.

**Arquitetura:** org nova no Free com um projeto vazio (`crm-contabil-dev`); produção (`xeuujpop…`) não é
tocada. Provisionamento com o ferramental que já existe (`db:migrate`, `cripto:migrar`,
`admin:bootstrap`), sem crons e com chaves de cripto próprias.

**Stack:** Supabase (Postgres/Auth), scripts `.mjs` do projeto, Node 22.

## Restrições globais

- **Nada escreve em produção.** Antes de qualquer comando que grave, provar que o alvo é o dev (Tarefa 3).
  Esta é a única regra que, se quebrada, custa caro.
- **Chaves de dev são geradas, nunca copiadas** de produção (`openssl rand -hex 32`).
- **Segredos nunca vão para o git.** `.env*` já é ignorado; conferir antes de gravar qualquer arquivo.
- **Nunca imprimir valor de segredo** no terminal — só nomes e comprimentos.
- Produção hoje: host `xeuujpopxvqzmqzjubpn`. Se um comando de escrita apontar para esse host, abortar.

## Pré-requisito (humano, no painel do Supabase)

Sem isto a Tarefa 2 não começa:

1. Criar uma **organização nova** (plano **Free**) — ex.: `pedro-dev`.
2. Nela, criar o projeto **`crm-contabil-dev`**, região **`sa-east-1`** (mesma de produção).
3. Coletar, em Project Settings → API e em Connect → **Session pooler**:
   - `NEXT_PUBLIC_SUPABASE_URL` (`https://<ref>.supabase.co`)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (**Publishable key**, formato `sb_publishable_…` — a anon JWT legada
     é rejeitada com 401 neste projeto)
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_DB_URL` (URI do **Session pooler**; URL-encode a senha — `#` vira `%23`)

---

### Tarefa 1: Baseline de produção e backup do acesso

Roda **antes** de qualquer mudança, com o `.env.local` ainda apontando para produção. O baseline é o que,
no fim, prova que produção não foi tocada.

- [ ] **Passo 1: Registrar o baseline de produção**

Os scripts temporários nascem **dentro do projeto** (`./tmp-*.mjs`), não em `/tmp`: o import ESM
`./scripts/_db.mjs` resolve relativo ao **arquivo**, então de `/tmp` daria `ERR_MODULE_NOT_FOUND`. Eles
são apagados no encerramento; o `.gitignore` não os cobre, então não deixe nenhum para trás.

```bash
cd /Users/pedrogomes/crm-contabil
cat > ./tmp-baseline.mjs <<'EOF'
import { makeClient } from "./scripts/_db.mjs";
const c = makeClient();
await c.connect();
const { rows } = await c.query(`
  select (select count(*) from clientes)::int as clientes,
         (select count(*) from usuarios)::int as usuarios,
         (select count(*) from app_migrations)::int as migrations,
         current_setting('server_version') as pg`);
console.log(JSON.stringify(rows[0]));
await c.end();
EOF
node --env-file=.env.local ./tmp-baseline.mjs | tee ./tmp-baseline-prod.json
```

Expected: um JSON com as contagens (ex.: `{"clientes":N,"usuarios":M,"migrations":97,...}`). **Guarde o
número de `clientes`** — a Tarefa 5 compara contra ele.

- [ ] **Passo 2: Backup do acesso a produção**

```bash
cp .env.local .env.producao.bak
chmod 600 .env.producao.bak
```

- [ ] **Passo 3: Provar que o backup não vaza para o git**

```bash
git check-ignore -v .env.producao.bak
git status --porcelain | grep -c "env.producao.bak" || true
```

Expected: o `check-ignore` responde `.gitignore:34:.env*` e o `grep -c` devolve `0` (nada a commitar).
Se aparecer no `git status`, **pare** e ajuste o `.gitignore` antes de seguir.

Sem commit nesta tarefa (nada versionado mudou).

---

### Tarefa 2: Apontar o `.env.local` para o dev e gerar as chaves

**Pré-requisito:** as 4 credenciais do projeto novo em mãos.

**Arquivos:**

- Modifica: `.env.local` (não versionado)

- [ ] **Passo 1: Gerar as 7 chaves de dev**

Geradas, nunca copiadas de produção — uma chave de produção num `.env.local` daria a um erro de dev o
poder de decifrar dado real.

```bash
for k in MASTER_CRIPTO_KEY WHATSAPP_CRIPTO_KEY ONBOARDING_CRIPTO_KEY BOLETO_CRIPTO_KEY EMAIL_CRIPTO_KEY NFSE_CERT_KEY CRON_SECRET; do
  echo "$k=$(openssl rand -hex 32)"
done > /tmp/chaves-dev.env
wc -l /tmp/chaves-dev.env
```

Expected: `7 /tmp/chaves-dev.env`.

- [ ] **Passo 2: Escrever o `.env.local` do dev**

Parta do `.env.local.example`, preencha as 4 credenciais do projeto novo, some as 7 chaves do passo 1 e
mantenha o que já era de sandbox (`CLICKSIGN_URL`, `NFSE_AMBIENTE=homologacao`,
`NEXT_PUBLIC_SITE_URL=http://localhost:3000`). Reaproveite do `.env.producao.bak` **apenas**
`CLICKSIGN_TOKEN` e `CLICKSIGN_HMAC_SECRET` (são do sandbox do Clicksign, não de produção).

- [ ] **Passo 3: Conferir que não sobrou credencial de produção**

```bash
grep -c "xeuujpopxvqzmqzjubpn" .env.local
```

Expected: `0`. Qualquer outro número significa que ficou credencial de produção — corrija antes de seguir.

```bash
grep -o "^[A-Z_]*" .env.local | sort | tr '\n' ' '
```

Expected: inclui `MASTER_CRIPTO_KEY`, as 5 de domínio, `CRON_SECRET`, `SUPABASE_DB_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ADMIN_*`.

Sem commit (arquivo não versionado).

---

### Tarefa 3: A guarda — provar que o alvo é o dev

**A tarefa mais importante do plano.** É o que impede rodar `admin:bootstrap` em produção por engano.
Nada da Tarefa 4 roda antes desta passar.

- [ ] **Passo 1: Escrever a guarda**

```bash
cat > ./tmp-guarda.mjs <<'EOF'
// Aborta se o .env.local apontar para produção ou para um banco com dados.
import { makeClient } from "./scripts/_db.mjs";
const PROD = "xeuujpopxvqzmqzjubpn";
const url = process.env.SUPABASE_DB_URL ?? "";
const publica = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (url.includes(PROD) || publica.includes(PROD)) {
  console.error("✗ ABORTAR: o .env.local ainda aponta para PRODUÇÃO.");
  process.exit(1);
}
const c = makeClient();
await c.connect();
const { rows } = await c.query(
  `select to_regclass('public.clientes') is not null as tem_schema,
          coalesce((select count(*) from information_schema.tables
                    where table_schema='public'),0)::int as tabelas`);
if (rows[0].tem_schema) {
  const { rows: n } = await c.query("select count(*)::int as n from clientes");
  if (n[0].n > 0) {
    console.error(`✗ ABORTAR: o banco alvo tem ${n[0].n} clientes — não é um dev vazio.`);
    process.exit(1);
  }
}
console.log(`✓ alvo seguro: fora de produção, ${rows[0].tabelas} tabelas no public, 0 clientes`);
await c.end();
EOF
node --env-file=.env.local ./tmp-guarda.mjs
```

Expected: `✓ alvo seguro: fora de produção, 0 tabelas no public, 0 clientes` (o banco é novo, então
`public` está vazio e `clientes` nem existe ainda).

- [ ] **Passo 2: Provar que a guarda realmente barra produção**

Uma guarda que nunca disse "não" não é guarda — é decoração. Teste contra o backup de produção:

```bash
node --env-file=.env.producao.bak ./tmp-guarda.mjs; echo "exit=$?"
```

Expected: `✗ ABORTAR: o .env.local ainda aponta para PRODUÇÃO.` e `exit=1`.

---

### Tarefa 4: Provisionar o dev

Só rode se a Tarefa 3 passou **nesta ordem** — o `cripto:migrar` depende do schema, e o
`admin:bootstrap` é o primeiro comando que escreve dado de gente.

- [ ] **Passo 1: Aplicar as 97 migrations**

```bash
npm run db:migrate 2>&1 | tail -5
```

Expected: termina sem erro; as migrations aplicadas aparecem em `app_migrations`.

- [ ] **Passo 2: Conferir o schema**

```bash
node --env-file=.env.local -e "
import('./scripts/_db.mjs').then(async ({makeClient}) => {
  const c = makeClient(); await c.connect();
  const { rows } = await c.query('select count(*)::int as n from app_migrations');
  console.log('migrations aplicadas:', rows[0].n);
  await c.end();
})"
```

Expected: `migrations aplicadas: 97`.

- [ ] **Passo 3: Criar as 5 DEKs (envelope encryption)**

Fácil de esquecer e o dev quebra sem isto: a migration cria `chave_dados` **vazia**; é o `cripto:migrar`
que embrulha cada chave de domínio com a `MASTER_CRIPTO_KEY`. (É o que o `tenant:novo` faz na linha 292 —
e aqui não passamos por ele.)

```bash
npm run cripto:migrar 2>&1 | tail -6
```

Expected: cria as 5 DEKs, sem erro. Sem dado cifrado no banco novo, o auto-teste não tem o que testar.

- [ ] **Passo 4: Criar o admin**

```bash
npm run admin:bootstrap 2>&1 | tail -4
```

Expected: admin criado com o `ADMIN_EMAIL` do `.env.local`.

- [ ] **Passo 5: Rodar os testes de RLS — agora sem medo**

```bash
npm run db:test 2>&1 | tail -5
```

Expected: verde. (Este comando sempre rodou contra produção; é a primeira vez que roda em terra firme.)

- [ ] **Passo 6: Conferir as 5 DEKs e a saúde do ambiente**

```bash
npm run tenant:doctor 2>&1 | tail -12 || true
```

Expected: reporta as 5 DEKs presentes. Se o `doctor` cobrar coisas de tenant (registry/app), ignore —
o dev não é um escritório registrado, por decisão da spec.

---

### Tarefa 5: Verificar a separação com evidência

- [ ] **Passo 1: O app sobe e fala com o dev**

```bash
npm run dev > /tmp/dev.log 2>&1 &
sleep 6
curl -s -o /dev/null -w "login: http=%{http_code}\n" http://localhost:3000/login
kill %1
```

Expected: `login: http=200`.

- [ ] **Passo 2: O dev está vazio e não conhece produção**

```bash
node --env-file=.env.local -e "
import('./scripts/_db.mjs').then(async ({makeClient}) => {
  const c = makeClient(); await c.connect();
  const { rows } = await c.query('select count(*)::int as n from clientes');
  console.log('clientes no dev:', rows[0].n);
  await c.end();
})"
```

Expected: `clientes no dev: 0`.

- [ ] **Passo 3: Provar que produção não foi tocada**

O passo que fecha o plano: compare com o baseline da Tarefa 1.

```bash
node --env-file=.env.producao.bak ./tmp-baseline.mjs
cat ./tmp-baseline-prod.json
```

Expected: os dois JSON **idênticos** — mesmo número de `clientes`, `usuarios` e `migrations`. Qualquer
diferença significa que algo escreveu em produção: pare e investigue antes de qualquer outra coisa.

---

### Tarefa 6: Documentar o que faltava

O `.env.local.example` não lista nenhuma das 6 chaves de cripto — foi por isso que o dev nunca teve as
features cifradas funcionando. Quem montar o próximo ambiente não deve descobrir isso na marra.

**Arquivos:**

- Modifica: `.env.local.example`
- Modifica: `docs/DEPLOY.md`

- [ ] **Passo 1: Completar o `.env.local.example`**

Acrescente, com o mesmo tom das outras entradas (comentário explicando o porquê, valor vazio):

```bash
# Envelope encryption (V10-B). A mestra cifra as 5 DEKs em `chave_dados`; as de domínio
# são o valor de cada DEK. Gerar: openssl rand -hex 32. NUNCA reaproveite as de produção.
MASTER_CRIPTO_KEY=
WHATSAPP_CRIPTO_KEY=
ONBOARDING_CRIPTO_KEY=
BOLETO_CRIPTO_KEY=
EMAIL_CRIPTO_KEY=

# Segredo dos endpoints de cron (pg_cron chama a app com ele). openssl rand -hex 32.
CRON_SECRET=
```

- [ ] **Passo 2: Registrar no DEPLOY.md que dev ≠ produção**

Na seção de ambientes, deixe explícito: o `.env.local` aponta para o projeto **de desenvolvimento** (org
Free, `crm-contabil-dev`), e produção vive noutra organização, com os segredos no painel do EasyPanel.
Diga o motivo em uma linha: dev e produção compartilhavam o mesmo banco, então qualquer engano local
acertava cliente real. Inclua o passo a passo de montar um dev novo (as Tarefas 2-4 em 5 linhas).

- [ ] **Passo 3: Verificar e commitar**

```bash
npx prettier --write .env.local.example docs/DEPLOY.md
npm run format:check 2>&1 | tail -1
git status --porcelain   # confirmar que NENHUM .env real aparece
git add .env.local.example docs/DEPLOY.md
git commit -m "docs: dev tem banco proprio; example lista as chaves de cripto que faltavam"
```

Expected: `All matched files use Prettier code style!` e o `git status` sem nenhum `.env.local` ou
`.env.producao.bak`.

- [ ] **Passo 4: Entregar por PR (o `main` é protegido)**

```bash
git push origin develop
gh pr create --base main --head develop --title "docs: dev com banco proprio"
gh pr checks --watch
gh pr merge --merge
```

---

## Encerramento

- [ ] Apagar os temporários: `rm -f ./tmp-baseline.mjs ./tmp-guarda.mjs ./tmp-baseline-prod.json /tmp/chaves-dev.env` e conferir com `git status --porcelain` que nada sobrou
- [ ] **Manter** o `.env.producao.bak` (é o acesso a produção; fora do git, `chmod 600`).
- [ ] Avisar o humano: o projeto Free pausa após 7 dias sem uso — despausar é um clique no painel.
