# Cancelar boleto e cancelar título — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cancelar um boleto (mantendo o título, para reemitir) e cancelar um título inteiro (título → CANCELADO + cancela o boleto ativo no Inter), resolvendo cobranças duplicadas/erradas.

**Architecture:** Guardas puras decidem o que é cancelável; o adaptador cancela no Inter; um core compartilhado cancela o boleto no Inter e marca `cancelado`; duas ações gateadas expõem os fluxos; botões em Contas a Receber.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (service_role), Tailwind 4, vitest + `renderToStaticMarkup`.

## Global Constraints

- Gate = `podeGerenciarFinanceiro` (helper `gate()` já em `boleto-actions.ts`). Motivo obrigatório (padrão do estorno: `trim().length >= 3`).
- Cancelamento **lógico** (status), não exclusão. Se o cancelamento no Inter falhar, **não** cancela o título.
- Endpoint do Inter (`POST /cobrancas/{cod}/cancelamento`, corpo `{ motivoCancelamento }`) confirmado no clique real.
- Imports `@/*`. Guard `divida-ui`: sem `border` estático em input; sem `←`/`amber-\d`. Sem migration.
- Rodar antes de commitar: `npm run lint && npm run typecheck && npm test && npm run format && npm run build`.

---

### Task 1: Guardas puras

**Files:**
- Create: `src/lib/boleto/cancelamento.ts`
- Test: `src/tests/boleto/cancelamento.test.ts`

**Interfaces:**
- Produces:
  - `podeCancelarBoleto(status: string): boolean`
  - `podeCancelarTitulo(status: string, somaBaixado: number): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/boleto/cancelamento.test.ts
import { describe, it, expect } from "vitest";
import { podeCancelarBoleto, podeCancelarTitulo } from "@/lib/boleto/cancelamento";

describe("podeCancelarBoleto", () => {
  it("só emitido", () => {
    expect(podeCancelarBoleto("emitido")).toBe(true);
    expect(podeCancelarBoleto("pago")).toBe(false);
    expect(podeCancelarBoleto("cancelado")).toBe(false);
  });
});

describe("podeCancelarTitulo", () => {
  it("ABERTO/VENCIDO sem baixa sim", () => {
    expect(podeCancelarTitulo("ABERTO", 0)).toBe(true);
    expect(podeCancelarTitulo("VENCIDO", 0)).toBe(true);
  });
  it("com baixa ou já baixado/cancelado não", () => {
    expect(podeCancelarTitulo("ABERTO", 50)).toBe(false);
    expect(podeCancelarTitulo("BAIXADO", 0)).toBe(false);
    expect(podeCancelarTitulo("BAIXADO_PARCIAL", 0)).toBe(false);
    expect(podeCancelarTitulo("CANCELADO", 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/boleto/cancelamento.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implement**

```ts
// src/lib/boleto/cancelamento.ts
export function podeCancelarBoleto(status: string): boolean {
  return status === "emitido";
}

export function podeCancelarTitulo(status: string, somaBaixado: number): boolean {
  return (status === "ABERTO" || status === "VENCIDO") && somaBaixado <= 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/boleto/cancelamento.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/boleto/cancelamento.ts src/tests/boleto/cancelamento.test.ts
git commit -m "feat(cancelar): guardas puras de cancelamento"
```

---

### Task 2: Adaptador — `cancelar`

**Files:**
- Modify: `src/lib/boleto/tipos.ts` (interface)
- Modify: `src/lib/boleto/inter.ts` (método)

**Interfaces:**
- Produces: `ProvedorBoleto.cancelar?(provedorBoletoId: string, motivo: string): Promise<void>`.

- [ ] **Step 1: Add to the interface**

Em `src/lib/boleto/tipos.ts`, `ProvedorBoleto`:

```ts
  cancelar?(provedorBoletoId: string, motivo: string): Promise<void>;
```

- [ ] **Step 2: Implement no Inter**

Em `src/lib/boleto/inter.ts`, no objeto do adaptador (junto de `consultarPagamento`):

```ts
    async cancelar(codigoSolicitacao: string, motivo: string): Promise<void> {
      const tk = await obterToken();
      await req("POST", `/cobrancas/${codigoSolicitacao}/cancelamento`, tk, { motivoCancelamento: motivo });
    },
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sem erros (opcional; Asaas não implementa).

- [ ] **Step 4: Commit**

```bash
git add src/lib/boleto/tipos.ts src/lib/boleto/inter.ts
git commit -m "feat(cancelar): método cancelar no adaptador do Inter"
```

---

### Task 3: Core `cancelarBoletoNoInter`

**Files:**
- Create: `src/lib/boleto/cancelar-exec.ts`

**Interfaces:**
- Consumes: `adaptadorAtivo`, `podeCancelarBoleto`.
- Produces: `cancelarBoletoNoInter(admin, boleto: { id; provedor; provedor_boleto_id; status }, motivo): Promise<void>` — cancela no Inter (se emitido + inter) e marca `cancelado`. Lança em falha do Inter.

- [ ] **Step 1: Write the module**

```ts
// src/lib/boleto/cancelar-exec.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adaptadorAtivo } from "./ativo";
import { podeCancelarBoleto } from "./cancelamento";

type BoletoCancel = { id: string; provedor: string; provedor_boleto_id: string | null; status: string };

// Cancela o boleto no Inter (quando emitido + provedor inter) e marca status='cancelado'.
// Idempotente: não age em boleto já pago/cancelado. Lança se o cancelamento no Inter falhar.
export async function cancelarBoletoNoInter(admin: SupabaseClient, boleto: BoletoCancel, motivo: string): Promise<void> {
  if (!podeCancelarBoleto(boleto.status)) return;
  if (boleto.provedor === "inter" && boleto.provedor_boleto_id) {
    const ativo = await adaptadorAtivo();
    if (!("erro" in ativo) && typeof ativo.adaptador.cancelar === "function") {
      await ativo.adaptador.cancelar(boleto.provedor_boleto_id, motivo);
    }
  }
  await admin.from("boleto").update({ status: "cancelado", atualizado_em: new Date().toISOString() }).eq("id", boleto.id);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/boleto/cancelar-exec.ts
git commit -m "feat(cancelar): core cancelarBoletoNoInter"
```

---

### Task 4: Ações `cancelarBoleto` e `cancelarTitulo`

**Files:**
- Modify: `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts`

**Interfaces:**
- Consumes: `cancelarBoletoNoInter`, `podeCancelarTitulo`, `createAdminSupabase`.
- Produces:
  - `cancelarBoleto(boletoId: string, motivo: string): Promise<{ ok?: boolean; erro?: string }>`
  - `cancelarTitulo(tituloId: string, motivo: string): Promise<{ ok?: boolean; erro?: string }>`

- [ ] **Step 1: Add imports**

Em `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts`:

```ts
import { createAdminSupabase } from "@/lib/supabase/admin";
import { cancelarBoletoNoInter } from "@/lib/boleto/cancelar-exec";
import { podeCancelarTitulo } from "@/lib/boleto/cancelamento";
```

- [ ] **Step 2: Add `cancelarBoleto`**

```ts
export async function cancelarBoleto(boletoId: string, motivo: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  if (!motivo || motivo.trim().length < 3) return { erro: "Informe a justificativa do cancelamento." };
  const admin = createAdminSupabase();
  const { data: b } = await admin
    .from("boleto")
    .select("id, provedor, provedor_boleto_id, status")
    .eq("id", boletoId)
    .maybeSingle();
  if (!b) return { erro: "Boleto não encontrado." };
  if (b.status !== "emitido") return { erro: "Só é possível cancelar boleto emitido." };
  try {
    await cancelarBoletoNoInter(
      admin,
      {
        id: b.id as string,
        provedor: b.provedor as string,
        provedor_boleto_id: (b.provedor_boleto_id as string | null) ?? null,
        status: b.status as string,
      },
      motivo.trim(),
    );
  } catch (e) {
    return { erro: `Falha ao cancelar no provedor: ${(e as Error).message}` };
  }
  revalidatePath("/financeiro/contas-a-receber");
  return { ok: true };
}
```

- [ ] **Step 3: Add `cancelarTitulo`**

```ts
export async function cancelarTitulo(tituloId: string, motivo: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  if (!motivo || motivo.trim().length < 3) return { erro: "Informe a justificativa do cancelamento." };
  const admin = createAdminSupabase();
  const { data: t } = await admin
    .from("titulo")
    .select("id, status, baixa(valor_recebido, estornada)")
    .eq("id", tituloId)
    .maybeSingle();
  if (!t) return { erro: "Título não encontrado." };
  const somaBaixado = ((t.baixa ?? []) as { valor_recebido: number; estornada: boolean }[])
    .filter((x) => !x.estornada)
    .reduce((s, x) => s + Number(x.valor_recebido), 0);
  if (!podeCancelarTitulo(t.status as string, somaBaixado))
    return { erro: "Título não pode ser cancelado (baixado, pago ou já cancelado)." };
  const { data: bol } = await admin
    .from("boleto")
    .select("id, provedor, provedor_boleto_id, status")
    .eq("titulo_id", tituloId)
    .eq("status", "emitido")
    .maybeSingle();
  if (bol) {
    try {
      await cancelarBoletoNoInter(
        admin,
        {
          id: bol.id as string,
          provedor: bol.provedor as string,
          provedor_boleto_id: (bol.provedor_boleto_id as string | null) ?? null,
          status: bol.status as string,
        },
        motivo.trim(),
      );
    } catch (e) {
      return { erro: `Falha ao cancelar o boleto no provedor: ${(e as Error).message}` };
    }
  }
  await admin.from("titulo").update({ status: "CANCELADO" }).eq("id", tituloId);
  revalidatePath("/financeiro/contas-a-receber");
  return { ok: true };
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts"
git commit -m "feat(cancelar): ações cancelarBoleto e cancelarTitulo"
```

---

### Task 5: UI — botões de cancelar

**Files:**
- Modify: `src/components/financeiro/BoletoTitulo.tsx`
- Modify: `src/components/financeiro/ContasReceber.tsx`
- Test: `src/tests/financeiro/cancelar-boleto-render.test.tsx`

**Interfaces:**
- Consumes: `cancelarBoleto`, `cancelarTitulo`, `podeCancelarTitulo`.

- [ ] **Step 1: "Cancelar boleto" no BoletoTitulo**

Em `src/components/financeiro/BoletoTitulo.tsx`:

(a) adicionar `cancelarBoleto` ao import de `boleto-actions`:

```tsx
import {
  emitirBoleto,
  urlBoletoPdfEquipe,
  cancelarBoleto,
  type BoletoView,
} from "@/app/(app)/financeiro/contas-a-receber/boleto-actions";
```

(b) handler dentro do componente:

```tsx
  async function cancelar() {
    const motivo = prompt("Motivo do cancelamento do boleto?") ?? "";
    if (motivo.trim().length < 3) return;
    const r = await cancelarBoleto(boleto!.id, motivo);
    if (r.erro) return alert(r.erro);
    onMudou();
  }
```

(c) no bloco do boleto existente, após "Boleto #… · status", quando `emitido`, o botão:

```tsx
      {boleto.status === "emitido" && (
        <button type="button" onClick={cancelar} className="block text-left text-negativo underline">
          Cancelar boleto
        </button>
      )}
```

- [ ] **Step 2: "Cancelar título" no ContasReceber**

Em `src/components/financeiro/ContasReceber.tsx`:

(a) imports:

```tsx
import { cancelarTitulo } from "@/app/(app)/financeiro/contas-a-receber/boleto-actions";
import { podeCancelarTitulo } from "@/lib/boleto/cancelamento";
```

(b) na célula de ações (`<td className="p-2 text-right">`), após o botão "Cobrar (WhatsApp)" e antes do `<div className="mt-1"><BoletoTitulo .../></div>`, adicionar:

```tsx
                      {podeCancelarTitulo(status, t.somaBaixado) && (
                        <button
                          type="button"
                          className="ml-2 text-negativo underline"
                          onClick={() =>
                            start(async () => {
                              const motivo = prompt("Motivo do cancelamento do título?") ?? "";
                              if (motivo.trim().length < 3) return;
                              const r = await cancelarTitulo(t.id, motivo);
                              setMsg(r.erro ?? "Título cancelado.");
                              if (!r.erro) {
                                setTitulos(await listarTitulos(competencia));
                                setBoletos(await listarBoletosDaCompetencia(competencia));
                              }
                            })
                          }
                        >
                          Cancelar
                        </button>
                      )}
```

- [ ] **Step 3: Write the render test**

```tsx
// src/tests/financeiro/cancelar-boleto-render.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BoletoTitulo } from "@/components/financeiro/BoletoTitulo";

const base = { id: "b1", numero: 7, provedor: "inter", linhaDigitavel: "0001", pixCopiaCola: null, urlPdf: null };

describe("BoletoTitulo — cancelar", () => {
  it("boleto emitido mostra 'Cancelar boleto'", () => {
    const html = renderToStaticMarkup(
      <BoletoTitulo tituloId="t1" boleto={{ ...base, status: "emitido" }} onMudou={() => {}} />,
    );
    expect(html).toContain("Cancelar boleto");
  });
  it("boleto pago não mostra 'Cancelar boleto'", () => {
    const html = renderToStaticMarkup(
      <BoletoTitulo tituloId="t1" boleto={{ ...base, status: "pago" }} onMudou={() => {}} />,
    );
    expect(html).not.toContain("Cancelar boleto");
  });
});
```

- [ ] **Step 4: Run the render test**

Run: `npx vitest run src/tests/financeiro/cancelar-boleto-render.test.tsx`
Expected: PASS. (`BoletoTitulo` não usa `useRouter`; sem mock.)

- [ ] **Step 5: Full gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add "src/components/financeiro/BoletoTitulo.tsx" "src/components/financeiro/ContasReceber.tsx" src/tests/financeiro/cancelar-boleto-render.test.tsx
git commit -m "feat(cancelar): botões Cancelar boleto e Cancelar título"
```

---

## Self-Review

**1. Spec coverage:**
- Guardas puras `podeCancelarBoleto`/`podeCancelarTitulo` → Task 1. ✅
- Adaptador `cancelar` (Inter) → Task 2. ✅
- Core `cancelarBoletoNoInter` (cancela no Inter + marca cancelado; lança em falha) → Task 3. ✅
- Ações `cancelarBoleto` (mantém título) e `cancelarTitulo` (título CANCELADO + cancela boleto ativo; aborta se o Inter falhar) → Task 4. ✅
- Botões "Cancelar boleto" (BoletoTitulo) e "Cancelar título" (linha) com motivo/prompt → Task 5. ✅
- Guardas de estado (não cancela pago/baixado) → Tasks 1, 4. ✅

**2. Placeholder scan:** Nenhum TBD/TODO; todo passo com código. A incerteza do endpoint é validação em prod. ✅

**3. Type consistency:** `podeCancelarBoleto(status)`/`podeCancelarTitulo(status, somaBaixado)` usadas na UI e nas ações; `cancelarBoletoNoInter(admin, boleto, motivo)` idêntica nas duas ações; `BoletoView` já tem `status`; `TituloView` tem `status`/`somaBaixado` (o `status` derivado da linha, ABERTO/VENCIDO, é o passado ao guard). `cancelarBoleto`/`cancelarTitulo` devolvem `{ok?|erro?}` consumidos nos handlers. ✅
