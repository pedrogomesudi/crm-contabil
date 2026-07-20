# Sincronização de boletos com o Inter — Fatia A (manual) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um botão "Sincronizar boletos pagos (Inter)" em Contas a Receber que consulta a situação dos boletos em aberto no Inter e baixa os que já estão pagos — cobrindo pagamentos que o webhook perdeu.

**Architecture:** Adaptador consulta a situação (`consultarPagamento`); a baixa hoje embutida no webhook é extraída para `baixarBoletoPago` (usada por webhook e sync, idempotente); um core sem sessão (`sincronizarBoletosCore`, admin) é chamado pela action gateada.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (service_role), Tailwind 4, vitest + `renderToStaticMarkup`.

## Global Constraints

- Gate da action = `podeGerenciarFinanceiro`; o core usa `createAdminSupabase()` (sem sessão).
- Baixa idempotente: só baixa boleto `status` ≠ `pago`/`cancelado`, e exige `conta_bancaria_id`.
- Endpoint/shape do Inter (`GET /cobrancas/{cod}`, `cobranca.situacao`) confirmados no clique real; ajusto se divergir.
- Imports `@/*`. Guard `divida-ui`: sem `border` estático em input; sem `←`/`amber-\d`. Sem migration.
- Rodar antes de commitar: `npm run lint && npm run typecheck && npm test && npm run format && npm run build`.

---

### Task 1: Lógica pura `interpretarSituacaoInter`

**Files:**
- Modify: `src/lib/boleto/inter.ts`
- Test: `src/tests/boleto/situacao.test.ts`

**Interfaces:**
- Produces: `interpretarSituacaoInter(cod: string, resp: Record<string, unknown>): EventoPagamento | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/boleto/situacao.test.ts
import { describe, it, expect } from "vitest";
import { interpretarSituacaoInter } from "@/lib/boleto/inter";

describe("interpretarSituacaoInter", () => {
  it("pago para RECEBIDO, lê valor e data", () => {
    const r = interpretarSituacaoInter("cod1", {
      cobranca: { situacao: "RECEBIDO", valorTotalRecebido: 5, dataSituacao: "2026-07-20" },
    });
    expect(r).toEqual({ provedorBoletoId: "cod1", pago: true, valorPago: 5, pagoEm: "2026-07-20" });
  });
  it("pago para MARCADO_RECEBIDO e PAGO", () => {
    expect(interpretarSituacaoInter("c", { cobranca: { situacao: "MARCADO_RECEBIDO" } })?.pago).toBe(true);
    expect(interpretarSituacaoInter("c", { cobranca: { situacao: "PAGO" } })?.pago).toBe(true);
  });
  it("null para A_RECEBER ou sem cobranca", () => {
    expect(interpretarSituacaoInter("c", { cobranca: { situacao: "A_RECEBER" } })).toBeNull();
    expect(interpretarSituacaoInter("c", {})).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/boleto/situacao.test.ts`
Expected: FAIL (função não existe).

- [ ] **Step 3: Implement**

Em `src/lib/boleto/inter.ts`, após `interpretarWebhookInter`:

```ts
// Interpreta a situação vinda do GET /cobrancas/{cod} (reconciliação/sincronização).
export function interpretarSituacaoInter(cod: string, resp: Record<string, unknown>): EventoPagamento | null {
  const cob = typeof resp.cobranca === "object" && resp.cobranca !== null ? (resp.cobranca as Record<string, unknown>) : null;
  const situacao = cob?.situacao;
  if (situacao !== "RECEBIDO" && situacao !== "MARCADO_RECEBIDO" && situacao !== "PAGO") return null;
  const valor = cob && typeof cob.valorTotalRecebido === "number" ? (cob.valorTotalRecebido as number) : null;
  const data = cob && typeof cob.dataSituacao === "string" ? (cob.dataSituacao as string) : null;
  return { provedorBoletoId: cod, pago: true, valorPago: valor, pagoEm: data };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/boleto/situacao.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/boleto/inter.ts src/tests/boleto/situacao.test.ts
git commit -m "feat(sync-boleto): interpretarSituacaoInter (lógica pura)"
```

---

### Task 2: Adaptador — `consultarPagamento`

**Files:**
- Modify: `src/lib/boleto/tipos.ts` (interface)
- Modify: `src/lib/boleto/inter.ts` (método)

**Interfaces:**
- Consumes: `interpretarSituacaoInter` (Task 1); `req`/`obterToken`.
- Produces: `ProvedorBoleto.consultarPagamento?(provedorBoletoId: string): Promise<EventoPagamento | null>`.

- [ ] **Step 1: Add to the interface**

Em `src/lib/boleto/tipos.ts`, `ProvedorBoleto`:

```ts
  consultarPagamento?(provedorBoletoId: string): Promise<EventoPagamento | null>;
```

- [ ] **Step 2: Implement no Inter**

Em `src/lib/boleto/inter.ts`, no objeto do adaptador (junto de `consultarWebhook`):

```ts
    async consultarPagamento(codigoSolicitacao: string): Promise<EventoPagamento | null> {
      const tk = await obterToken();
      const j = await req("GET", `/cobrancas/${codigoSolicitacao}`, tk);
      return interpretarSituacaoInter(codigoSolicitacao, j);
    },
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sem erros (opcional; Asaas não implementa).

- [ ] **Step 4: Commit**

```bash
git add src/lib/boleto/tipos.ts src/lib/boleto/inter.ts
git commit -m "feat(sync-boleto): consultarPagamento no adaptador do Inter"
```

---

### Task 3: Extrair `baixarBoletoPago` e usar no webhook

**Files:**
- Create: `src/lib/boleto/baixar.ts`
- Modify: `src/app/api/webhooks/boleto/[secret]/route.ts`

**Interfaces:**
- Consumes: `dadosBaixaBoleto`, `type EventoPagamento`.
- Produces: `baixarBoletoPago(admin, boleto, evento, contaBancariaId, hoje): Promise<boolean>` — true se baixou (novo).

- [ ] **Step 1: Write the shared function**

```ts
// src/lib/boleto/baixar.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dadosBaixaBoleto } from "./baixa";
import type { EventoPagamento } from "./tipos";

type BoletoBaixa = { id: string; titulo_id: string; valor: number; status: string };

// Cria a baixa de um boleto pago e marca o boleto como pago. Idempotente: não age
// se já está pago/cancelado ou se não há conta de destino. Usado pelo webhook e pela sync.
export async function baixarBoletoPago(
  admin: SupabaseClient,
  boleto: BoletoBaixa,
  evento: EventoPagamento,
  contaBancariaId: string | null,
  hoje: string,
): Promise<boolean> {
  if (boleto.status === "pago" || boleto.status === "cancelado") return false;
  if (!contaBancariaId) return false;
  const d = dadosBaixaBoleto(evento, Number(boleto.valor), hoje);
  const { error } = await admin.from("baixa").insert({
    titulo_id: boleto.titulo_id,
    data_recebimento: d.dataRecebimento,
    valor_recebido: d.valorRecebido,
    conta_bancaria_id: contaBancariaId,
    forma_pagamento: "BOLETO",
  });
  if (error) return false;
  await admin.from("boleto").update({ status: "pago", atualizado_em: new Date().toISOString() }).eq("id", boleto.id);
  return true;
}
```

- [ ] **Step 2: Refactor the webhook route to use it**

Em `src/app/api/webhooks/boleto/[secret]/route.ts`: (a) importar `baixarBoletoPago`; (b) trocar o corpo do `for` pela busca do boleto + chamada da função.

Import (junto aos existentes):

```ts
import { baixarBoletoPago } from "@/lib/boleto/baixar";
```

Trocar o bloco do `for` (do `const { data: bol }` até o `baixados++;`) por:

```ts
  for (const ev of eventos) {
    const evento = interpretar(ev);
    if (!evento || !evento.pago) continue;
    const { data: bol } = await admin
      .from("boleto")
      .select("id, titulo_id, valor, status")
      .eq("provedor_boleto_id", evento.provedorBoletoId)
      .maybeSingle();
    if (!bol) continue;
    const baixou = await baixarBoletoPago(
      admin,
      { id: bol.id as string, titulo_id: bol.titulo_id as string, valor: Number(bol.valor), status: bol.status as string },
      evento,
      cfg.conta_bancaria_id as string | null,
      hoje,
    );
    if (baixou) baixados++;
  }
```

- [ ] **Step 3: Verify (build + webhook unaffected)**

Run: `npm run typecheck && npm test 2>&1 | grep -E "Test Files|Tests "`
Expected: sem erros; todos os testes passam (a lógica pura `dadosBaixaBoleto` não mudou).

- [ ] **Step 4: Commit**

```bash
git add src/lib/boleto/baixar.ts "src/app/api/webhooks/boleto/[secret]/route.ts"
git commit -m "refactor(boleto): extrai baixarBoletoPago (webhook + futura sync)"
```

---

### Task 4: Core da sincronização + action

**Files:**
- Create: `src/app/(app)/financeiro/contas-a-receber/sincronizar.ts`
- Modify: `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts`

**Interfaces:**
- Consumes: `adaptadorAtivo`, `baixarBoletoPago`, `createAdminSupabase`.
- Produces:
  - `sincronizarBoletosCore(): Promise<{ baixados: number }>`
  - `sincronizarBoletosInter(): Promise<{ baixados?: number; erro?: string }>`

- [ ] **Step 1: Write the core**

```ts
// src/app/(app)/financeiro/contas-a-receber/sincronizar.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { adaptadorAtivo } from "@/lib/boleto/ativo";
import { baixarBoletoPago } from "@/lib/boleto/baixar";

// Consulta no Inter a situação dos boletos em aberto e baixa os que já estão pagos.
// Roda sem sessão (service_role) — usado pela action gateada e pelo cron.
export async function sincronizarBoletosCore(): Promise<{ baixados: number }> {
  const admin = createAdminSupabase();
  const { data: cfg } = await admin
    .from("boleto_config")
    .select("provedor, conta_bancaria_id")
    .eq("id", 1)
    .maybeSingle();
  if (!cfg || cfg.provedor !== "inter") return { baixados: 0 };
  const ativo = await adaptadorAtivo();
  if ("erro" in ativo || typeof ativo.adaptador.consultarPagamento !== "function") return { baixados: 0 };
  const { data: boletos } = await admin
    .from("boleto")
    .select("id, titulo_id, valor, status, provedor_boleto_id")
    .eq("provedor", "inter")
    .eq("status", "emitido");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  let baixados = 0;
  for (const b of boletos ?? []) {
    if (!b.provedor_boleto_id) continue;
    const evento = await ativo.adaptador.consultarPagamento(b.provedor_boleto_id as string);
    if (!evento || !evento.pago) continue;
    const baixou = await baixarBoletoPago(
      admin,
      { id: b.id as string, titulo_id: b.titulo_id as string, valor: Number(b.valor), status: b.status as string },
      evento,
      cfg.conta_bancaria_id as string | null,
      hoje,
    );
    if (baixou) baixados++;
  }
  return { baixados };
}
```

- [ ] **Step 2: Add the action**

Em `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts`, importar e adicionar:

```ts
import { sincronizarBoletosCore } from "./sincronizar";
```

```ts
export async function sincronizarBoletosInter(): Promise<{ baixados?: number; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  try {
    const r = await sincronizarBoletosCore();
    revalidatePath("/financeiro/contas-a-receber");
    return { baixados: r.baixados };
  } catch (e) {
    return { erro: `Falha na sincronização: ${(e as Error).message}` };
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/financeiro/contas-a-receber/sincronizar.ts" "src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts"
git commit -m "feat(sync-boleto): core e ação de sincronização com o Inter"
```

---

### Task 5: Botão em Contas a Receber

**Files:**
- Modify: `src/components/financeiro/ContasReceber.tsx`
- Test: `src/tests/financeiro/sincronizar-boletos-render.test.tsx`

**Interfaces:**
- Consumes: `sincronizarBoletosInter`.

- [ ] **Step 1: Add imports + handler + button**

Em `src/components/financeiro/ContasReceber.tsx`:

(a) adicionar `sincronizarBoletosInter` ao import de `boleto-actions`:

```tsx
import {
  listarBoletosDaCompetencia,
  sincronizarBoletosInter,
  type BoletoView,
} from "@/app/(app)/financeiro/contas-a-receber/boleto-actions";
```

(b) handler (junto dos outros, dentro do componente):

```tsx
  const sincronizar = () =>
    start(async () => {
      const r = await sincronizarBoletosInter();
      setMsg(r.erro ?? `${r.baixados ?? 0} boleto(s) baixado(s).`);
      if (!r.erro && competencia) {
        setTitulos(await listarTitulos(competencia));
        setBoletos(await listarBoletosDaCompetencia(competencia));
      }
    });
```

(c) botão — no bloco onde está o botão "Nova cobrança avulsa":

```tsx
      <div className="flex flex-wrap gap-2">
        <button
          onClick={abrirAvulsa}
          disabled={pend}
          className="rounded border border-linha px-3 py-1 disabled:opacity-60"
        >
          Nova cobrança avulsa
        </button>
        <button
          onClick={sincronizar}
          disabled={pend}
          className="rounded border border-linha px-3 py-1 disabled:opacity-60"
        >
          Sincronizar boletos pagos (Inter)
        </button>
      </div>
```

> Nota: o botão "Nova cobrança avulsa" hoje está dentro de um `<div>` próprio; ao aplicar, substitua esse
> `<div>` pelo bloco acima (os dois botões lado a lado).

- [ ] **Step 2: Write the render test**

```tsx
// src/tests/financeiro/sincronizar-boletos-render.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { ContasReceber } from "@/components/financeiro/ContasReceber";

describe("ContasReceber — sincronização", () => {
  it("mostra o botão de sincronizar boletos", () => {
    const html = renderToStaticMarkup(<ContasReceber contas={[]} automacaoInicial={false} />);
    expect(html).toContain("Sincronizar boletos pagos (Inter)");
  });
});
```

- [ ] **Step 3: Run the render test**

Run: `npx vitest run src/tests/financeiro/sincronizar-boletos-render.test.tsx`
Expected: PASS.

- [ ] **Step 4: Full gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add "src/components/financeiro/ContasReceber.tsx" src/tests/financeiro/sincronizar-boletos-render.test.tsx
git commit -m "feat(sync-boleto): botão Sincronizar boletos pagos em Contas a Receber"
```

---

## Self-Review

**1. Spec coverage (Fatia A):**
- Adaptador `consultarPagamento` + `interpretarSituacaoInter` → Tasks 1, 2. ✅
- Extração `baixarBoletoPago` + webhook usa a mesma → Task 3. ✅
- `sincronizarBoletosCore` (admin, sem sessão) + action gateada → Task 4. ✅
- Botão em Contas a Receber → Task 5. ✅
- Idempotência (guard pago/cancelado + conta) → Task 3 (na função compartilhada). ✅

**2. Placeholder scan:** Nenhum TBD/TODO; todo passo com código. A incerteza do shape do GET é validação em prod (não placeholder). ✅

**3. Type consistency:** `EventoPagamento` reusado; `interpretarSituacaoInter(cod, resp)` e `consultarPagamento(cod)` batem; `baixarBoletoPago(admin, boleto, evento, conta, hoje)` idêntica no webhook (Task 3) e no core (Task 4); `sincronizarBoletosInter` devolve `{baixados?|erro?}` consumido no botão. `gate()` já existe em `boleto-actions.ts` (`podeGerenciarFinanceiro`). ✅

**Nota:** o botão "Nova cobrança avulsa" hoje é um `<div>` isolado no `ContasReceber.tsx`; a Task 5 o substitui por um `<div>` com os dois botões. Confirmar o trecho ao aplicar.
