# V10-B — Envelope encryption — Plano de implementação

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.

**Objetivo:** rotação de chave sem re-cifrar dado. Cada DEK = a chave atual do domínio, guardada cifrada
pela `MASTER_CRIPTO_KEY`. Trocar a mestra re-embrulha 5 DEKs; o dado cifrado fica intacto.

**Arquitetura:** `chave_dados` (DEK por domínio, cifrada pela mestra); `cifrarDominio`/`decifrarDominio`
carregam+desembrulham a DEK (cache por processo), com **fallback** para a chave do env na transição. O
primitivo AES-256-GCM (`cifrar`/`decifrar`) **não muda**.

**Stack:** Node crypto, Postgres/RLS, scripts JS.

## Restrições globais

- **Zero re-cifragem de dado:** a DEK é idêntica à chave antiga → o ciphertext existente decifra sem tocar.
- **Os scripts auto-testam decifrando dado REAL** antes de gravar qualquer DEK. Nunca gravar uma DEK que não
  decifra.
- `chave_dados` sem policy de `authenticated` — só service_role lê a DEK cifrada.
- Fallback ligado durante a transição: `decifrarDominio` cai para `process.env.<CHAVE>` se a DEK não carregar.
- A mestra nunca é impressa (mascarada nos logs).
- Rodar `npm run lint && npm run typecheck && npm test && npm run build` antes de cada commit.

---

### Tarefa 1: Banco

**Arquivos:** Criar `supabase/migrations/0097_envelope.sql`; modificar `supabase/tests/rls.test.sql`

- [ ] **Passo 1: Migration**

```sql
-- V10-B: envelope encryption. Uma DEK por domínio, cifrada pela MASTER_CRIPTO_KEY.
create table if not exists chave_dados (
  dominio text primary key,          -- 'whatsapp','onboarding','boleto','email','nfse'
  dek_cifrado text not null,         -- a DEK, cifrada pela MASTER (iv:tag:ct)
  versao int not null default 1,
  atualizado_em timestamptz not null default now()
);

alter table chave_dados enable row level security;
-- SEM policy para authenticated: a DEK cifrada só é lida/escrita por service_role.
-- (Um usuário logado nunca vê a DEK; mesmo com a mestra, o ciphertext da DEK é inútil sem service_role.)
```

- [ ] **Passo 2:** `npm run db:migrate` → `0097` aplicada.
- [ ] **Passo 3: Assert de RLS:** com um role de usuário simulado (`_simular`), `select count(*) from
  chave_dados` deve dar **0** para admin, contador, financeiro e cliente do portal — ninguém autenticado lê.
  `npm run db:test`.
- [ ] **Passo 4: Commit**

```bash
git add supabase/migrations/0097_envelope.sql supabase/tests/rls.test.sql
git commit -m "feat(cripto): tabela chave_dados (DEK por dominio), service_role-only"
```

---

### Tarefa 2: Núcleo do envelope + testes

**Arquivos:** Criar `src/lib/cripto/dominios.ts`, `src/lib/cripto/master.ts`, `src/lib/cripto/envelope.ts`,
`src/tests/cripto/envelope.test.ts`

**Interfaces produzidas:**

```ts
// dominios.ts
export type Dominio = "whatsapp" | "onboarding" | "boleto" | "email" | "nfse";
export const DOMINIOS: Record<Dominio, string>;   // { whatsapp: "WHATSAPP_CRIPTO_KEY", ... }

// master.ts
export function masterKey(): string;              // MASTER_CRIPTO_KEY, valida 64 hex; throw claro se ausente

// envelope.ts (server-only)
export function embrulhar(dekHex: string, masterHex: string): string;   // = cifrar(Buffer.from(dek,'hex'), master)
export function desembrulhar(dekCifrado: string, masterHex: string): string; // -> dek hex
export async function cifrarDominio(dominio: Dominio, dados: Buffer): Promise<string>;
export async function decifrarDominio(dominio: Dominio, pacote: string): Promise<Buffer>;
export function limparCacheDek(): void;           // para os testes
```

- [ ] **Passo 1: Testes primeiro** (o embrulhar/desembrulhar é puro e testável; a parte de DB é a Tarefa 3)

```ts
import { describe, it, expect } from "vitest";
import { embrulhar, desembrulhar } from "@/lib/cripto/envelope";
import { cifrar, decifrar } from "@/lib/nfse/cripto";

const master = "a".repeat(64);
const dek = "b".repeat(64);

describe("envelope — embrulhar/desembrulhar a DEK", () => {
  it("desembrulhar reverte embrulhar", () => {
    expect(desembrulhar(embrulhar(dek, master), master)).toBe(dek);
  });

  it("mestra errada não desembrulha (GCM rejeita)", () => {
    const pacote = embrulhar(dek, master);
    expect(() => desembrulhar(pacote, "c".repeat(64))).toThrow();
  });

  it("a DEK desembrulhada decifra o que ela mesma cifrou (continuidade)", () => {
    // O ponto do desenho: a DEK É a chave antiga; o dado cifrado por ela decifra igual.
    const segredo = Buffer.from("token-secreto", "utf8");
    const ct = cifrar(segredo, dek);
    const dekRecuperada = desembrulhar(embrulhar(dek, master), master);
    expect(decifrar(ct, dekRecuperada).toString("utf8")).toBe("token-secreto");
  });
});
```

- [ ] **Passo 2:** `npm test -- envelope` → FAIL. Implementar. `embrulhar` = `cifrar(Buffer.from(dek,"hex"),
  master)`; `desembrulhar` = `decifrar(pacote, master).toString("hex")`. `masterKey()` valida
  `/^[0-9a-f]{64}$/`. `cifrarDominio`/`decifrarDominio` na Tarefa 3 (precisam do DB). `npm test -- envelope`
  → PASS.
- [ ] **Passo 3: Commit**

```bash
git add src/lib/cripto src/tests/cripto
git commit -m "feat(cripto): primitivas de envelope (embrulhar/desembrulhar a DEK com a mestra)"
```

---

### Tarefa 3: cifrarDominio/decifrarDominio com DEK do banco + fallback

**Arquivos:** Modificar `src/lib/cripto/envelope.ts`

- [ ] **Passo 1:** `dekDoDominio(dominio): Promise<string>`:
  1. cache em `Map<Dominio, string>` (a DEK **desembrulhada**, hex) — estável mesmo após rotação da mestra;
  2. `createAdminSupabase().from("chave_dados").select("dek_cifrado").eq("dominio", dominio)`;
  3. se achou → `desembrulhar(dek_cifrado, masterKey())`, cacheia, devolve;
  4. **fallback** → `process.env[DOMINIOS[dominio]]` (a chave antiga do env). Se nem isso existir, `throw`
     claro (`"cripto: sem DEK nem chave de env para <dominio>"`).
- [ ] **Passo 2:** `cifrarDominio` = `cifrar(dados, await dekDoDominio(d))`;
  `decifrarDominio` = `decifrar(pacote, await dekDoDominio(d))`.
- [ ] **Passo 3:** `limparCacheDek()` para os testes esvaziarem o cache.
- [ ] **Passo 4: Verificar e commitar**

```bash
npm run lint && npm run typecheck && npm test
git commit -am "feat(cripto): cifrarDominio/decifrarDominio com DEK do banco e fallback para o env"
```

---

### Tarefa 4: Migrar os call sites para o domínio

**Arquivos:** os 17 com uso de cifrar/decifrar + as 5 chaves. Um domínio por vez, testando entre eles.

**Cada domínio:** trocar `cifrar(buf, process.env.X)` por `await cifrarDominio("dom", buf)` e o inverso.

- [ ] **Passo 1: onboarding** — `src/lib/onboarding/credencial.ts`: `cifrarSenha`/`decifrarSenha` viram
  **async** (`cifrarDominio("onboarding", ...)`). Atualizar chamadores em `clientes/[id]/processo.ts`
  (já async). O teste `credencial.test.ts` seta `process.env.ONBOARDING_CRIPTO_KEY` → o **fallback** cobre
  (sem DB no teste); ajustar para `await`.
- [ ] **Passo 2: boleto** — `src/lib/boleto/cripto.ts`: `cifrarCredencial`/`decifrarCredencial` async;
  chamadores em `boleto/ativo.ts`, `configuracoes/boletos/actions.ts`.
- [ ] **Passo 3: email** — `src/lib/email/config.ts` e `configuracoes/email/actions.ts`:
  `decifrarDominio("email", ...)` / `cifrarDominio("email", ...)`.
- [ ] **Passo 4: whatsapp** — `configuracoes/whatsapp/actions.ts`, `atendimento/actions.ts`,
  `whatsapp/regua-motor.ts`, `nfse/lote/envio.ts`, `api/webhooks/zapi/[secret]/route.ts`.
- [ ] **Passo 5: nfse** — `clientes/[id]/nfse.ts`, `nfse-emitente.ts`, `configuracoes/nfse/actions.ts`,
  `nfse/danfse-cache.ts`.
- [ ] **Passo 6: Verificar** — `npm run lint && npm run typecheck && npm test && npm run build`. O
  `required(process.env.X, "X")` some dos call sites migrados (a validação passa a ser do `dekDoDominio`).
- [ ] **Passo 7: Commit**

```bash
git add -A
git commit -m "refactor(cripto): call sites usam cifrarDominio/decifrarDominio (envelope)"
```

---

### Tarefa 5: Scripts de migração e rotação

**Arquivos:** Criar `scripts/cripto-migrar.mjs`, `scripts/cripto-rotacionar.mjs`; modificar `package.json`

**Fontes de auto-teste** (dado real cifrado, por domínio):
`whatsapp` → `whatsapp_config.token_cifrado`; `nfse` → `nfse_certificado` (a coluna do PEM cifrado);
`boleto` → `boleto_config`; `onboarding` → `onboarding_processo_item.acesso_senha_cifrada`;
`email` → `email_config.smtp_senha_cifrada`/`api_chave_cifrada`. Se um domínio **não tem** dado cifrado
ainda, o auto-teste daquele domínio é pulado (não há o que provar) — mas registrado no log.

- [ ] **Passo 1: `cripto-migrar.mjs`** (`node --env-file`):
  1. exige `MASTER_CRIPTO_KEY` e as 5 chaves de domínio no env;
  2. para cada domínio: `dek = env[CHAVE]`; grava `chave_dados(dominio, embrulhar(dek, master))` — **não
     sobrescreve** se já existe (salvo `--forcar`);
  3. **auto-teste:** para cada domínio com dado cifrado, `desembrulhar` a DEK e `decifrar` um valor real; se
     falhar, **rollback e aborta** (usar uma transação: grava tudo, testa, só então `commit`);
  4. imprime o resumo (domínios migrados / testados / pulados).
- [ ] **Passo 2: `cripto-rotacionar.mjs`** (`--nova <hex>`):
  1. valida a nova mestra (64 hex);
  2. numa transação: para cada domínio, `dek = desembrulhar(dek_cifrado, MASTER atual)`;
     `update chave_dados set dek_cifrado = embrulhar(dek, novaMestra), versao = versao+1`;
  3. **auto-teste** com a nova: desembrulhar com a nova mestra e decifrar um valor real; falhou → rollback;
  4. imprime: *"Agora troque MASTER_CRIPTO_KEY no EasyPanel para a nova e faça deploy. ORDEM: banco →
     env → deploy."* (a nova mestra **não** é impressa por inteiro — mascarada).
- [ ] **Passo 3: `package.json`** — `"cripto:migrar"` e `"cripto:rotacionar"` (com `--env-file=.env.local`).
- [ ] **Passo 4: Verificar** — `npm run lint`. (Scripts fora do tsc/test.)
- [ ] **Passo 5: Commit**

```bash
git add scripts/cripto-migrar.mjs scripts/cripto-rotacionar.mjs package.json
git commit -m "feat(cripto): scripts de migracao e rotacao da mestra, com auto-teste em dado real"
```

---

### Tarefa 6: Provisionador e doctor

**Arquivos:** Modificar `scripts/tenant-novo.mjs`, `scripts/tenant-doctor.mjs`, `scripts/_tenants.mjs`

- [ ] **Passo 1:** `_tenants.mjs` — `MASTER_CRIPTO_KEY` entra em `CHAVES_CRIPTO` (é a chave crítica agora).
- [ ] **Passo 2:** `tenant-novo.mjs` — gera a `MASTER_CRIPTO_KEY`; depois das migrations e antes dos crons,
  roda `cripto-migrar` para o tenant novo (as 5 chaves de domínio + a mestra → DEKs). Escritório novo nasce
  com envelope.
- [ ] **Passo 3:** `tenant-doctor.mjs` — nova checagem: cada escritório tem `MASTER_CRIPTO_KEY` no env **e**
  as 5 linhas em `chave_dados`? Falta → aparece.
- [ ] **Passo 4: Verificar** — `npm run lint`. Rodar `tenant:doctor` (o `gomes` ainda não migrado deve
  acusar a falta das DEKs — esperado até a validação).
- [ ] **Passo 5: Commit**

```bash
git add scripts/
git commit -m "feat(cripto): provisionador migra o envelope; doctor confere DEKs e a mestra"
```

---

### Tarefa 7: Documentação, entrega e tag

- [ ] **Passo 1:** `docs/DEPLOY.md` — seção "Envelope encryption": a `MASTER_CRIPTO_KEY`, a **ordem de
  rollout** (migration → env → deploy → `cripto:migrar`), e o procedimento de **rotação** (banco → env →
  deploy). `docs/DOCUMENTACAO.md` (segurança) + `CHANGELOG.md`. Registrar que as 5 chaves de domínio podem
  sair do env **depois** de validado (o fallback deixa de ser necessário).
- [ ] **Passo 2:** Commit, merge `develop` → `main`, push.
- [ ] **Passo 3: Pedir ao usuário, explicitamente, NA ORDEM:**
  1. adicionar `MASTER_CRIPTO_KEY` no EasyPanel (valor que eu gero) — **mantendo** as 5 chaves de domínio;
  2. implantar;
  3. rodar `npm run cripto:migrar` (cria as DEKs e auto-testa com dado real);
  4. validar por mim (banco): as 5 DEKs existem; um token do WhatsApp e o certificado NFS-e decifram via
     `decifrarDominio`; o `doctor` fica verde.
- [ ] **Passo 4:** Após o "validei, deu certo": tag `v6.2.0`.
