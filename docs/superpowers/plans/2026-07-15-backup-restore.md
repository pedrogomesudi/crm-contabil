# V10-C — Backup e teste de restauração (RNF-06) — Plano de implementação

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.

**Objetivo:** dump próprio do `public` (redundância, com retenção 7+4 e envio S3-compatível), um verificador
pós-restore e um runbook de restauração testável. Fecha o V10.

**Arquitetura:** ferramental (`scripts/*.mjs`, JS puro). O dump usa `pg_dump` via `SUPABASE_DB_URL`; o envio
à nuvem é PutObject SigV4 próprio (sem SDK). O verificador reusa as checagens do `doctor` contra um banco
restaurado.

## Restrições globais

- **`backups/` no `.gitignore` ANTES de qualquer dump** — o dump contém dado de cliente.
- O dump próprio cobre **só `public`** (o que é nosso). `auth`/Storage = backup do Supabase. Não prometer o
  contrário — o runbook diz isso.
- `BACKUP_S3_*` e a mestra: só em env, nunca no git, mascarados no log. O verificador nunca imprime o valor
  decifrado.
- O ensaio é num projeto **descartável** — nunca produção.
- Rodar `npm run lint` antes de cada commit (scripts fora do tsc/test).

---

### Tarefa 1: Blindagem + dump local com retenção

**Arquivos:** Modificar `.gitignore`; criar `scripts/backup-dump.mjs`, `scripts/_retencao.mjs`; `package.json`

- [ ] **Passo 1:** `.gitignore` — acrescentar `/backups/` (antes de tudo).
- [ ] **Passo 2: `_retencao.mjs`** (pura, testável):

```js
// Decide o que manter: os 7 dumps diários mais recentes + o dump de cada domingo das
// últimas 4 semanas. Recebe a lista de nomes "AAAA-MM-DD.sql.gz" e devolve { manter, apagar }.
export function planoRetencao(nomes, hojeIso) { /* ... */ }
```

- [ ] **Passo 3: teste** `src/tests/_scripts/retencao.test.ts` — hmm, scripts não estão no tsc. Em vez
  disso, um teste dedicado em `scripts/__tests__` não roda no vitest (só `src/**`). **Decisão:** mover a
  função pura de retenção para `src/lib/backup/retencao.ts` (testável no vitest) e o script `.mjs` importa a
  lógica reimplementando-a? Não — para não duplicar, coloco a regra em `src/lib/backup/retencao.ts` e o
  script chama via um pequeno re-export `.mjs`. Mais simples: **implementar em `src/lib/backup/retencao.ts`
  (testada)** e o `backup-dump.mjs` reimplementa a MESMA regra com um teste que compara as duas? Excesso.
  **Escolha final:** a regra vive em `src/lib/backup/retencao.ts`, testada; o `backup-dump.mjs` a importa via
  `await import("../src/lib/backup/retencao.ts")` **não** — `.mjs` não resolve `.ts`. Então: a regra pura em
  `scripts/_retencao.mjs`, e um teste vitest que a importa de lá (vitest resolve `.mjs`). Ajustar o
  `include` do vitest para pegar `src/tests/**` (já pega). O teste importa `../../scripts/_retencao.mjs`.

```ts
// src/tests/backup/retencao.test.ts
import { describe, it, expect } from "vitest";
import { planoRetencao } from "../../../scripts/_retencao.mjs";

describe("planoRetencao (7 diários + 4 semanais)", () => {
  it("mantém os 7 mais recentes", () => {
    const nomes = Array.from({ length: 20 }, (_, i) => `2026-07-${String(i + 1).padStart(2, "0")}.sql.gz`);
    const { manter } = planoRetencao(nomes, "2026-07-20");
    expect(manter).toContain("2026-07-20.sql.gz");
    expect(manter).toContain("2026-07-14.sql.gz"); // 7º mais recente
  });
  it("mantém domingos além dos 7 diários e apaga o resto", () => {
    // 2026-07-05, 06-28, 06-21, 06-14 são domingos → mantidos como semanais
    const nomes = [
      "2026-07-20.sql.gz", "2026-07-05.sql.gz", "2026-06-28.sql.gz",
      "2026-06-21.sql.gz", "2026-06-14.sql.gz", "2026-05-10.sql.gz",
    ];
    const r = planoRetencao(nomes, "2026-07-20");
    expect(r.manter).toContain("2026-07-05.sql.gz");
    expect(r.apagar).toContain("2026-05-10.sql.gz"); // fora da janela
  });
});
```

- [ ] **Passo 4: `backup-dump.mjs`** — checa `pg_dump` (senão aborta com instrução); roda
  `pg_dump --schema=public --no-owner --no-privileges "$SUPABASE_DB_URL" | gzip` para
  `backups/<slug>/<hoje>.sql.gz`; aplica `planoRetencao` na pasta. (O envio S3 é a Tarefa 2.) O `<slug>` vem
  de um `--slug` obrigatório.
- [ ] **Passo 5:** `package.json` — `"backup:dump": "node scripts/backup-dump.mjs"`.
- [ ] **Passo 6: Verificar e commitar**

```bash
npm run lint && npm test -- retencao
git add .gitignore scripts/backup-dump.mjs scripts/_retencao.mjs src/tests/backup package.json
git commit -m "feat(backup): dump local do schema public com retencao 7+4"
```

---

### Tarefa 2: Envio S3-compatível (SigV4 próprio)

**Arquivos:** Criar `scripts/_s3.mjs`; modificar `scripts/backup-dump.mjs`

- [ ] **Passo 1: `_s3.mjs`** — `putObject({ endpoint, region, bucket, keyId, secret }, chave, corpoBuffer,
  contentType)`: assinatura **AWS SigV4** para `PUT https://<bucket>.<endpoint>/<chave>` (funciona com AWS S3
  e Backblaze B2 S3-compatível). Sem SDK: usa `node:crypto` (HMAC-SHA256, SHA256). Devolve ok/erro.
  Também `listObjects` e `deleteObject` para a retenção na nuvem.
- [ ] **Passo 2:** `backup-dump.mjs` — se `BACKUP_S3_BUCKET` (e as demais `BACKUP_S3_*`) estiverem no
  ambiente, **envia** o dump e **aplica a mesma retenção** na nuvem (lista, calcula `planoRetencao`, apaga).
  Sem as env → pula com aviso "nuvem não configurada; só cópia local".
- [ ] **Passo 3:** Documentar as env no `.env.local.example` (se existir) ou no comentário do script:
  `BACKUP_S3_ENDPOINT` (ex.: `s3.us-west-002.backblazeb2.com`), `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET`,
  `BACKUP_S3_KEY_ID`, `BACKUP_S3_SECRET`.
- [ ] **Passo 4: Verificar e commitar**

```bash
npm run lint
git add scripts/_s3.mjs scripts/backup-dump.mjs
git commit -m "feat(backup): envio do dump para bucket S3-compativel (SigV4, sem SDK)"
```

---

### Tarefa 3: Verificador pós-restore

**Arquivos:** Criar `scripts/restore-verificar.mjs`; modificar `package.json`

- [ ] **Passo 1: `restore-verificar.mjs`** (`--env-file <env do restaurado>`): conecta e checa, imprimindo
  ✓/✗ por item e saindo ≠ 0 se algo falhar:
  1. **dados:** contagem de tabelas `public` ≥ 87 e linhas > 0 em `clientes`, `titulo`, `usuarios`;
  2. **extensões:** `pg_cron`, `pg_net`;
  3. **crons:** os 4 jobs esperados;
  4. **admin:** ≥ 1 admin ativo;
  5. **envelope:** 5 linhas em `chave_dados`;
  6. **integridade cripto:** desembrulha a DEK de `whatsapp` com `MASTER_CRIPTO_KEY` do env e **decifra** o
     token real (se houver) — **sem imprimir** o valor.
- [ ] **Passo 2:** `package.json` — `"restore:verificar": "node scripts/restore-verificar.mjs"`.
- [ ] **Passo 3: Verificar e commitar**

```bash
npm run lint
git add scripts/restore-verificar.mjs package.json
git commit -m "feat(backup): verificador pos-restore (dados, extensoes, crons, admin, envelope, cripto)"
```

---

### Tarefa 4: Doctor — aviso de backup velho

**Arquivos:** Modificar `scripts/tenant-doctor.mjs`, `scripts/_tenants.mjs`

- [ ] **Passo 1:** `tenant-doctor.mjs` — **aviso** (não falha) se `backups/<slug>/` não existir ou o dump
  mais recente tiver mais de 8 dias ("sem backup recente"). É lembrete, não trava.
- [ ] **Passo 2:** `_tenants.mjs` — `BACKUP_S3_*` como segredos rotacionáveis (aviso se ausentes; o dump
  local já é cópia).
- [ ] **Passo 3: Verificar e commitar**

```bash
npm run lint && npm run tenant:doctor
git add scripts/
git commit -m "feat(backup): doctor avisa quando o backup local esta velho"
```

---

### Tarefa 5: Runbook, documentação e tag

- [ ] **Passo 1:** `docs/DEPLOY.md` — nova seção **"Backup e restauração (RNF-06)"**:
  - a **divisão de responsabilidade** (Supabase = projeto inteiro incl. auth/storage; dump próprio =
    redundância do `public`);
  - **política de retenção** (backup automático do Supabase + dumps 7+4);
  - **runbook do ensaio** (restaurar num projeto descartável → montar env com a MESMA mestra → recriar
    extensões + `cron:bootstrap` → `restore:verificar` → apagar o projeto), como ritual **trimestral**;
  - o **pré-requisito `pg_dump`** (instalar as client tools do Postgres).
  - `docs/DOCUMENTACAO.md` (infra) + `CHANGELOG.md`.
- [ ] **Passo 2:** Commit, merge `develop` → `main`, push.
- [ ] **Passo 3: Validar (parte eu, parte você):**
  - **eu:** rodo `backup:dump` para o `gomes` (gera o `.sql.gz` local) e confiro o conteúdo/tamanho; se você
    configurar `BACKUP_S3_*`, confiro o envio;
  - **você, o ensaio real (quando quiser):** restaurar o backup do Supabase num projeto descartável, seguir
    o runbook e ver o `restore:verificar` verde. (Opcional agora — a ferramenta fica pronta.)
- [ ] **Passo 4:** Após validar o dump: tag `v6.3.0` — **fecha o V10**.
