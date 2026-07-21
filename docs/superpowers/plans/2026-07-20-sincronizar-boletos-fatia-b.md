# Sincronização de boletos com o Inter — Fatia B (cron) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um cron diário que roda a sincronização de boletos com o Inter sozinho, pegando qualquer pagamento que o webhook perdeu.

**Architecture:** Rota `/api/cron/sincronizar-boletos` autenticada por `CRON_SECRET` (padrão dos outros crons) chama o `sincronizarBoletosCore` já existente (Fatia A). Um job `pg_cron` no `bootstrap-cron.mjs` chama essa rota diariamente.

**Tech Stack:** Next.js 16 App Router (route handler), Supabase (pg_cron), `scripts/bootstrap-cron.mjs` (JS puro).

## Global Constraints

- Cron autenticado por `CRON_SECRET` via `timingSafeEqual` (mesmo padrão de `tarefas-recorrentes`).
- `bootstrap-cron.mjs` é a fonte de verdade dos jobs; aplicado em produção com
  `node --env-file=.env.producao.bak scripts/bootstrap-cron.mjs` (passo operacional no release, DEPOIS do
  deploy — a rota precisa existir antes de o job chamá-la).
- `scripts/*.mjs` são cobertos por ESLint mas fora do `tsc` (não estão no include do tsconfig).
- Sem migration. `package.json.version` sobe com o CHANGELOG no mesmo PR; `versao.test.ts` exige que batam.
- Rodar antes de commitar: `npm run lint && npm run typecheck && npm test && npm run format && npm run build`.

---

### Task 1: Rota de cron `/api/cron/sincronizar-boletos`

**Files:**
- Create: `src/app/api/cron/sincronizar-boletos/route.ts`

**Interfaces:**
- Consumes: `sincronizarBoletosCore` de `@/app/(app)/financeiro/contas-a-receber/sincronizar` (Fatia A).

- [ ] **Step 1: Write the route**

```ts
// src/app/api/cron/sincronizar-boletos/route.ts
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sincronizarBoletosCore } from "@/app/(app)/financeiro/contas-a-receber/sincronizar";

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(segredo);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const resumo = await sincronizarBoletosCore();
  return NextResponse.json(resumo);
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build 2>&1 | tail -3`
Expected: sem erros; a rota `/api/cron/sincronizar-boletos` aparece no output do build.

- [ ] **Step 3: Verify auth (sem token = 401)**

> Só verificável em produção após o deploy: `curl -s -o /dev/null -w "%{http_code}" -X POST https://app.seusaldo.ai/api/cron/sincronizar-boletos` → 401. Deixe anotado para o pós-deploy.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/cron/sincronizar-boletos/route.ts"
git commit -m "feat(sync-boleto): rota de cron /api/cron/sincronizar-boletos"
```

---

### Task 2: Job no `bootstrap-cron.mjs`

**Files:**
- Modify: `scripts/bootstrap-cron.mjs` (array `JOBS`)

**Interfaces:**
- Consumes: helper `httpPost(caminho, comBody)` já existente no script.

- [ ] **Step 1: Add the job**

Em `scripts/bootstrap-cron.mjs`, no array `JOBS`, adicionar (após o `followup-proposta-diaria`):

```js
  {
    nome: "sincronizar-boletos-diaria",
    agenda: "0 14 * * *",
    comando: httpPost("sincronizar-boletos", true),
    nota: "reconcilia boletos pagos no Inter que o webhook perdeu (RF-081)",
  },
```

> Agenda `0 14 * * *` = 14:00 UTC (11:00 em Brasília), fora do cluster das 12:00 UTC dos outros jobs
> HTTP. `httpPost(..., true)` envia com body `'{}'`, como os demais jobs POST.

- [ ] **Step 2: Verify (lint do script + dry-run local opcional)**

Run: `npm run lint 2>&1 | tail -3`
Expected: sem erros de ESLint no script.

> O `--dry-run` real precisa de `SUPABASE_DB_URL` (Session pooler) e não roda no CI; a aplicação em
> produção é o passo operacional abaixo.

- [ ] **Step 3: Commit**

```bash
git add scripts/bootstrap-cron.mjs
git commit -m "feat(sync-boleto): job pg_cron diário de sincronização de boletos"
```

---

## Pós-deploy (operacional, no release)

Ordem obrigatória: a rota precisa existir antes do job chamá-la.

1. Merge → **Implantar** (a rota `/api/cron/sincronizar-boletos` fica no ar).
2. Confirmar `/api/health` = nova versão + `curl -X POST .../api/cron/sincronizar-boletos` → 401 (auth ok).
3. **Aplicar o cron:** `node --env-file=.env.producao.bak scripts/bootstrap-cron.mjs` — registra/atualiza o
   job `sincronizar-boletos-diaria` no `pg_cron` (idempotente; preserva os outros jobs).
4. (Opcional) confirmar no banco que o job entrou: `select jobname, schedule from cron.job`.

## Self-Review

**1. Spec coverage (Fatia B):**
- Rota `/api/cron/sincronizar-boletos` autenticada por `CRON_SECRET` → Task 1. ✅
- Job diário no `bootstrap-cron.mjs` → Task 2. ✅
- Reuso do `sincronizarBoletosCore` (Fatia A) → Task 1. ✅
- Aplicação operacional do cron → seção Pós-deploy. ✅

**2. Placeholder scan:** Nenhum TBD/TODO; código completo. ✅

**3. Type consistency:** `sincronizarBoletosCore(): Promise<{ baixados: number }>` consumida pela rota; `httpPost(caminho, comBody)` já existe no script e é usada como os outros jobs. Padrão de `autorizado` idêntico ao `tarefas-recorrentes`. ✅
