# Observabilidade — Fatia B (dead-man switch dos crons) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ser avisado quando um cron parar de rodar ou falhar: cada cron pinga o healthchecks.io no sucesso (e `/fail` se estourar); o healthchecks.io alerta por e-mail quando um ping esperado não chega.

**Architecture:** Um helper `src/lib/observabilidade/healthcheck.ts` com `urlDoHealthcheck` (puro, resolve a URL a partir do env `HEALTHCHECK_URLS`), `pingHealthcheck` (I/O best-effort) e `executarCronComPing` (envolve o trabalho de um cron: ping de sucesso ao fim, ping `/fail` + re-lança na exceção). Os 7 crons passam a chamar o wrapper numa linha. Sem migration.

**Tech Stack:** Next.js 16 (route handlers) · TypeScript · Vitest.

## Global Constraints

- **Best-effort:** `pingHealthcheck` **nunca lança** (um ping não pode quebrar o cron). Sem `HEALTHCHECK_URLS` configurado, tudo é no-op — comportamento dos crons inalterado.
- **Ordem cron:** o ping ocorre **depois** da autorização (dentro do trabalho), então uma chamada 401 não pinga.
- **Re-lança na falha:** `executarCronComPing` pinga `/fail` e **re-lança** o erro, para o 500 e o `onRequestError` (Fatia A) continuarem valendo.
- **Sem migration.**
- **Comandos antes de commitar:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`, `npm run build`.
- **Git:** `develop` → PR para `main` com `verify` verde.

**Fatos verificados:**
- Os 7 crons (`src/app/api/cron/<nome>/route.ts`) têm a mesma forma: `export async function POST`, `if (!autorizado(req)) return 401`, `const resumo = await <trabalho>()`, `return NextResponse.json(resumo)`. Nenhum tem try/catch (erro → 500, capturado pela Fatia A).
- Nomes/linhas de trabalho:
  - `gerar-obrigacoes`: `await gerarInstancias(createAdminSupabase(), ano, mes)`
  - `followup-proposta`: `await processarFollowup(hoje)`
  - `tarefas-recorrentes`: `await processarRecorrencias(hoje)`
  - `entregar-webhooks`: `NextResponse.json(await drenarWebhooks())` (sem variável `resumo`)
  - `regua-cobranca`: `await processarRegua(hoje)`
  - `sincronizar-boletos`: `await sincronizarBoletosCore()`
  - `monitorar-receita`: `await monitorarReceitaCore()`
- `AbortSignal.timeout` disponível no runtime Node do projeto.

---

## File Structure

- `src/lib/observabilidade/healthcheck.ts` (Create) — `urlDoHealthcheck` (puro) + `pingHealthcheck` + `executarCronComPing`.
- `src/tests/observabilidade/healthcheck.test.ts` (Create) — testes de `urlDoHealthcheck`.
- `src/app/api/cron/<nome>/route.ts` (Modify ×7) — envolver o trabalho com `executarCronComPing`.

---

### Task 1: Helper do healthcheck

**Files:**
- Create: `src/lib/observabilidade/healthcheck.ts`
- Test: `src/tests/observabilidade/healthcheck.test.ts`

**Interfaces:**
- Produces:
  - `urlDoHealthcheck(mapaJson: string | undefined, nome: string, estado: "success" | "fail"): string | null` (puro).
  - `pingHealthcheck(nome: string, estado?: "success" | "fail"): Promise<void>` (I/O best-effort).
  - `executarCronComPing<T>(nome: string, trabalho: () => Promise<T>): Promise<T>`.

- [ ] **Step 1: Escrever o teste que falha (parte pura)**

```ts
// src/tests/observabilidade/healthcheck.test.ts
import { describe, it, expect } from "vitest";
import { urlDoHealthcheck } from "@/lib/observabilidade/healthcheck";

const MAPA = JSON.stringify({
  "gerar-obrigacoes": "https://hc-ping.com/abc",
  "regua-cobranca": "https://hc-ping.com/def/",
});

describe("urlDoHealthcheck", () => {
  it("success devolve a URL base", () => {
    expect(urlDoHealthcheck(MAPA, "gerar-obrigacoes", "success")).toBe("https://hc-ping.com/abc");
  });

  it("fail acrescenta /fail (sem barra dupla)", () => {
    expect(urlDoHealthcheck(MAPA, "gerar-obrigacoes", "fail")).toBe("https://hc-ping.com/abc/fail");
    expect(urlDoHealthcheck(MAPA, "regua-cobranca", "fail")).toBe("https://hc-ping.com/def/fail");
  });

  it("env ausente, JSON inválido ou nome desconhecido => null", () => {
    expect(urlDoHealthcheck(undefined, "gerar-obrigacoes", "success")).toBeNull();
    expect(urlDoHealthcheck("{nao é json", "gerar-obrigacoes", "success")).toBeNull();
    expect(urlDoHealthcheck(MAPA, "inexistente", "success")).toBeNull();
    expect(urlDoHealthcheck(JSON.stringify({ "x": 123 }), "x", "success")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/observabilidade/healthcheck.test.ts`
Expected: FAIL — import não resolve.

- [ ] **Step 3: Implementar**

```ts
// src/lib/observabilidade/healthcheck.ts

// Resolve a URL de ping do healthchecks.io para um cron, a partir de um env JSON `{ [cron]: urlBase }`.
// Puro/defensivo: env ausente, JSON inválido ou nome sem url → null (ping vira no-op). `fail` acrescenta
// "/fail" à base (sem barra dupla).
export function urlDoHealthcheck(
  mapaJson: string | undefined,
  nome: string,
  estado: "success" | "fail",
): string | null {
  if (!mapaJson) return null;
  let mapa: Record<string, unknown>;
  try {
    mapa = JSON.parse(mapaJson) as Record<string, unknown>;
  } catch {
    return null;
  }
  const base = mapa?.[nome];
  if (typeof base !== "string" || base.length === 0) return null;
  return estado === "fail" ? `${base.replace(/\/$/, "")}/fail` : base;
}

// Pinga o healthchecks.io. Best-effort: sem URL configurada é no-op, e um ping que falha NÃO
// propaga (não pode quebrar o cron).
export async function pingHealthcheck(nome: string, estado: "success" | "fail" = "success"): Promise<void> {
  const url = urlDoHealthcheck(process.env.HEALTHCHECK_URLS, nome, estado);
  if (!url) return;
  try {
    await fetch(url, { method: "POST", signal: AbortSignal.timeout(5000) });
  } catch {
    // best-effort: um ping não pode quebrar o cron.
  }
}

// Envolve o trabalho de um cron: pinga sucesso ao terminar; na exceção, pinga /fail e RE-LANÇA
// (para o 500 e o onRequestError continuarem valendo).
export async function executarCronComPing<T>(nome: string, trabalho: () => Promise<T>): Promise<T> {
  try {
    const resultado = await trabalho();
    await pingHealthcheck(nome, "success");
    return resultado;
  } catch (e) {
    await pingHealthcheck(nome, "fail");
    throw e;
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/observabilidade/healthcheck.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar (typecheck + lint)**

Run: `npm run typecheck && npx eslint src/lib/observabilidade/healthcheck.ts`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/observabilidade/healthcheck.ts src/tests/observabilidade/healthcheck.test.ts
git commit -m "feat(observabilidade): helper de healthcheck (ping + wrapper de cron)"
```

---

### Task 2: Envolver os 7 crons

**Files:**
- Modify: `src/app/api/cron/gerar-obrigacoes/route.ts`
- Modify: `src/app/api/cron/followup-proposta/route.ts`
- Modify: `src/app/api/cron/tarefas-recorrentes/route.ts`
- Modify: `src/app/api/cron/entregar-webhooks/route.ts`
- Modify: `src/app/api/cron/regua-cobranca/route.ts`
- Modify: `src/app/api/cron/sincronizar-boletos/route.ts`
- Modify: `src/app/api/cron/monitorar-receita/route.ts`

**Interfaces:**
- Consumes: `executarCronComPing` (Task 1).

Sem teste unitário (route handlers de cron não têm harness). Verificação: typecheck/lint/build.

Em cada arquivo: adicionar o import `import { executarCronComPing } from "@/lib/observabilidade/healthcheck";` e envolver a linha do trabalho.

- [ ] **Step 1: `gerar-obrigacoes`**

Adicionar o import (junto dos demais) e trocar:

```ts
  const resumo = await gerarInstancias(createAdminSupabase(), ano, mes);
```

por:

```ts
  const resumo = await executarCronComPing("gerar-obrigacoes", () => gerarInstancias(createAdminSupabase(), ano, mes));
```

- [ ] **Step 2: `followup-proposta`**

Import + trocar:

```ts
  const resumo = await processarFollowup(hoje);
```

por:

```ts
  const resumo = await executarCronComPing("followup-proposta", () => processarFollowup(hoje));
```

- [ ] **Step 3: `tarefas-recorrentes`**

Import + trocar:

```ts
  const resumo = await processarRecorrencias(hoje);
```

por:

```ts
  const resumo = await executarCronComPing("tarefas-recorrentes", () => processarRecorrencias(hoje));
```

- [ ] **Step 4: `entregar-webhooks`**

Import + trocar:

```ts
  return NextResponse.json(await drenarWebhooks());
```

por:

```ts
  return NextResponse.json(await executarCronComPing("entregar-webhooks", () => drenarWebhooks()));
```

- [ ] **Step 5: `regua-cobranca`**

Import + trocar:

```ts
  const resumo = await processarRegua(hoje);
```

por:

```ts
  const resumo = await executarCronComPing("regua-cobranca", () => processarRegua(hoje));
```

- [ ] **Step 6: `sincronizar-boletos`**

Import + trocar:

```ts
  const resumo = await sincronizarBoletosCore();
```

por:

```ts
  const resumo = await executarCronComPing("sincronizar-boletos", () => sincronizarBoletosCore());
```

- [ ] **Step 7: `monitorar-receita`**

Import + trocar:

```ts
  const resumo = await monitorarReceitaCore();
```

por:

```ts
  const resumo = await executarCronComPing("monitorar-receita", () => monitorarReceitaCore());
```

- [ ] **Step 8: Verificar (typecheck + lint + build + suíte)**

Run: `npm run typecheck && npx eslint src/app/api/cron && npm test && npm run build`
Expected: sem erros; suíte verde.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/cron
git commit -m "feat(observabilidade): crons pingam healthchecks.io (dead-man switch)"
```

---

### Task 3: Release 6.70.0

**Files:**
- Modify: `package.json`, `package-lock.json`, `CHANGELOG.md`

Produção em 6.69.0. **Sem migration.**

- [ ] **Step 1: Barra completa**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check && npm run build`
Expected: verde. (Se `format:check` falhar → `npm run format` e recommitar.)

- [ ] **Step 2: Bump (incluir lockfile)**

Run: `npm version minor --no-git-tag-version`
Expected: `6.70.0`. Incluir `package-lock.json` no commit.

- [ ] **Step 3: CHANGELOG (topo, acima de 6.69.0)**

```markdown
## [6.70.0] — 2026-07-22

### Adicionado

- **Monitor de crons (dead-man switch).** Cada rotina automática (gerar obrigações, régua de
  cobrança, sincronizar boletos, webhooks, follow-up, tarefas recorrentes, monitorar Receita) pinga
  um monitor externo (healthchecks.io) ao concluir — e sinaliza falha se estourar. Configurável pelo
  env `HEALTHCHECK_URLS` (sem ele, é no-op). O monitor avisa por e-mail quando um cron para de rodar.
```

- [ ] **Step 4: Teste de versão + suíte**

Run: `npx vitest run src/tests/versao.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Commit da release**

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): 6.70.0 — dead-man switch dos crons (healthchecks.io)"
```

- [ ] **Step 6: Finalizar (PR)**

`git push origin develop` → `gh pr create --base main --head develop` → aguardar as **duas** execuções do `verify` → **não** mergear sem autorização. Após merge (autorizado): sem migration → Implantar → `/api/health` = `6.70.0` → `npm run release:tag` + push da tag → sincronizar `develop` com `main`.

**Operação (pós-deploy, com o usuário):** criar um check por cron no healthchecks.io (com o período esperado de cada um) e preencher o env `HEALTHCHECK_URLS` no container (JSON `{ "gerar-obrigacoes": "https://hc-ping.com/<uuid>", … }`). Sem o env, os pings ficam no-op e nada muda.

---

## Self-Review

**1. Cobertura do spec (Fatia B):**
- `urlDoHealthcheck` (puro, testado) → Task 1. ✅
- `pingHealthcheck` (I/O best-effort, no-op sem env) → Task 1. ✅
- Envolver os 7 crons (ping sucesso / `/fail` + re-lança) → Task 2. ✅
- Env `HEALTHCHECK_URLS` (JSON) + operação healthchecks.io → Task 3 (nota de operação). ✅

**2. Placeholders:** nenhum.

**3. Consistência de tipos:** `executarCronComPing<T>(nome, trabalho)` (Task 1) chamado igual nos 7 crons (Task 2), preservando o tipo de retorno de cada trabalho (o `resumo` continua com o mesmo shape que ia para `NextResponse.json`). `urlDoHealthcheck(mapaJson, nome, estado)` idem entre Task 1 e `pingHealthcheck`.

**Nota de execução:** o valor real só aparece com o env preenchido e os checks criados no healthchecks.io (passo de operação). Enquanto isso, o código é inerte (no-op) — seguro para subir antes de configurar.
