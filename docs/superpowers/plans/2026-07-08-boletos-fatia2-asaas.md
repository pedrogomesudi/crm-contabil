# Boletos — Fatia 2: adaptador Asaas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o adaptador Asaas (contrato `ProvedorBoleto`) — emitir boleto híbrido (boleto+PIX) e interpretar o webhook de pagamento, testado sem rede.

**Architecture:** Um módulo `src/lib/boleto/asaas.ts` com funções puras (montagem de request + parsing + webhook) e uma fábrica `criarAdaptadorAsaas` que encadeia `fetch`. Spec: `docs/superpowers/specs/2026-07-08-boletos-fatia2-asaas-design.md`.

**Tech Stack:** TypeScript, Vitest, `fetch` global (server-side).

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`. (Sem migration; `build` opcional — não há rota nova.)
- Só o adaptador + testes; **não** ligar na UI/webhook (Fatia 4). Sem conta para construir/testar.
- API Asaas v3: header `access_token`; base prod `https://api.asaas.com/v3`, sandbox `https://api-sandbox.asaas.com/v3`.
- Branch: `git checkout -b feat/boletos-fatia2 develop`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `src/lib/boleto/asaas.ts` — **novo**: puras + fábrica `criarAdaptadorAsaas`.
- `src/tests/boleto/asaas.test.ts` — **novo**: unit das puras.
- `src/tests/boleto/asaas-emitir.test.ts` — **novo**: `emitir` com `fetch` mockado.

Consome os tipos da Fatia 1: `DadosEmissao`, `BoletoEmitido`, `EventoPagamento`, `ProvedorBoleto` (`src/lib/boleto/tipos.ts`).

---

## Task 1: Funções puras (TDD)

**Files:**
- Create: `src/lib/boleto/asaas.ts`
- Test: `src/tests/boleto/asaas.test.ts`

**Interfaces:**
- Consumes: `DadosEmissao`, `BoletoEmitido`, `EventoPagamento` (`./tipos`).
- Produces: `baseUrlAsaas`, `headersAsaas`, `corpoClienteAsaas`, `corpoCobrancaAsaas`, `parsearCobrancaAsaas`, `interpretarWebhookAsaas`.

- [ ] **Step 1: Testes**

```ts
import { describe, it, expect } from "vitest";
import { baseUrlAsaas, headersAsaas, corpoClienteAsaas, corpoCobrancaAsaas, parsearCobrancaAsaas, interpretarWebhookAsaas } from "@/lib/boleto/asaas";
import type { DadosEmissao } from "@/lib/boleto/tipos";

const dados: DadosEmissao = { valor: 100, vencimento: "2026-08-01", pagadorNome: "ACME", pagadorDocumento: "12345678000199", pagadorEmail: "a@b.com", descricao: "Honorário julho", seuNumero: "T-1" };

describe("asaas puras", () => {
  it("baseUrlAsaas", () => {
    expect(baseUrlAsaas("producao")).toBe("https://api.asaas.com/v3");
    expect(baseUrlAsaas("sandbox")).toBe("https://api-sandbox.asaas.com/v3");
  });
  it("headersAsaas", () => {
    expect(headersAsaas("k")).toEqual({ access_token: "k", "Content-Type": "application/json", "User-Agent": "SALDO CRM" });
  });
  it("corpoClienteAsaas com e sem email", () => {
    expect(corpoClienteAsaas(dados)).toEqual({ name: "ACME", cpfCnpj: "12345678000199", email: "a@b.com" });
    expect(corpoClienteAsaas({ ...dados, pagadorEmail: null })).toEqual({ name: "ACME", cpfCnpj: "12345678000199" });
  });
  it("corpoCobrancaAsaas", () => {
    expect(corpoCobrancaAsaas("cus_1", dados)).toEqual({ customer: "cus_1", billingType: "BOLETO", value: 100, dueDate: "2026-08-01", description: "Honorário julho", externalReference: "T-1" });
  });
  it("parsearCobrancaAsaas com identif+pix", () => {
    expect(parsearCobrancaAsaas({ id: "pay_1", bankSlipUrl: "http://slip" }, { identificationField: "123", nossoNumero: "9" }, { payload: "pixcc" })).toEqual({ provedorBoletoId: "pay_1", nossoNumero: "9", linhaDigitavel: "123", pixCopiaCola: "pixcc", urlPdf: "http://slip" });
  });
  it("parsearCobrancaAsaas sem identif/pix", () => {
    expect(parsearCobrancaAsaas({ id: "pay_2", invoiceUrl: "http://inv" }, null, null)).toEqual({ provedorBoletoId: "pay_2", nossoNumero: null, linhaDigitavel: null, pixCopiaCola: null, urlPdf: "http://inv" });
  });
  it("interpretarWebhookAsaas: pago", () => {
    expect(interpretarWebhookAsaas({ event: "PAYMENT_RECEIVED", payment: { id: "pay_1", value: 100, paymentDate: "2026-08-02" } })).toEqual({ provedorBoletoId: "pay_1", pago: true, valorPago: 100, pagoEm: "2026-08-02" });
  });
  it("interpretarWebhookAsaas: evento irrelevante → null", () => {
    expect(interpretarWebhookAsaas({ event: "PAYMENT_CREATED", payment: { id: "x" } })).toBe(null);
  });
  it("interpretarWebhookAsaas: payload inválido → null", () => {
    expect(interpretarWebhookAsaas("nada")).toBe(null);
    expect(interpretarWebhookAsaas({ event: "PAYMENT_RECEIVED" })).toBe(null);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- boleto/asaas.test` → FAIL.

- [ ] **Step 3: Implementar as puras em `asaas.ts`**

```ts
import type { DadosEmissao, BoletoEmitido, EventoPagamento, ProvedorBoleto } from "./tipos";

export function baseUrlAsaas(ambiente: "sandbox" | "producao"): string {
  return ambiente === "producao" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
}

export function headersAsaas(apiKey: string): Record<string, string> {
  return { access_token: apiKey, "Content-Type": "application/json", "User-Agent": "SALDO CRM" };
}

export function corpoClienteAsaas(dados: DadosEmissao): { name: string; cpfCnpj: string; email?: string } {
  const c: { name: string; cpfCnpj: string; email?: string } = { name: dados.pagadorNome, cpfCnpj: dados.pagadorDocumento };
  if (dados.pagadorEmail) c.email = dados.pagadorEmail;
  return c;
}

export function corpoCobrancaAsaas(customerId: string, dados: DadosEmissao): { customer: string; billingType: "BOLETO"; value: number; dueDate: string; description: string; externalReference: string } {
  return { customer: customerId, billingType: "BOLETO", value: dados.valor, dueDate: dados.vencimento, description: dados.descricao, externalReference: dados.seuNumero };
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export function parsearCobrancaAsaas(pagamento: Record<string, unknown>, identif: Record<string, unknown> | null, pix: Record<string, unknown> | null): BoletoEmitido {
  return {
    provedorBoletoId: String(pagamento.id ?? ""),
    nossoNumero: identif ? str(identif.nossoNumero) : null,
    linhaDigitavel: identif ? str(identif.identificationField) : null,
    pixCopiaCola: pix ? str(pix.payload) : null,
    urlPdf: str(pagamento.bankSlipUrl) ?? str(pagamento.invoiceUrl),
  };
}

export function interpretarWebhookAsaas(payload: unknown): EventoPagamento | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.event !== "string") return null;
  if (typeof p.payment !== "object" || p.payment === null) return null;
  if (p.event !== "PAYMENT_RECEIVED" && p.event !== "PAYMENT_CONFIRMED") return null;
  const pay = p.payment as Record<string, unknown>;
  return {
    provedorBoletoId: String(pay.id ?? ""),
    pago: true,
    valorPago: typeof pay.value === "number" ? pay.value : null,
    pagoEm: typeof pay.paymentDate === "string" ? pay.paymentDate : null,
  };
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- boleto/asaas.test` (PASS), `npm run lint`, `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/boleto/asaas.ts src/tests/boleto/asaas.test.ts
git commit -m "feat(boletos): funções puras do adaptador Asaas (TDD)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Fábrica criarAdaptadorAsaas (fetch)

**Files:**
- Modify: `src/lib/boleto/asaas.ts`
- Test: `src/tests/boleto/asaas-emitir.test.ts`

**Interfaces:**
- Consumes: as puras (Task 1); `ProvedorBoleto` (`./tipos`).
- Produces: `criarAdaptadorAsaas(apiKey, ambiente): ProvedorBoleto`.

- [ ] **Step 1: Teste com `fetch` mockado**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { criarAdaptadorAsaas } from "@/lib/boleto/asaas";

function fetchSeq(respostas: { ok?: boolean; status?: number; json: unknown }[]) {
  let i = 0;
  return vi.fn(async () => {
    const r = respostas[i++]!;
    return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.json } as unknown as Response;
  });
}

describe("criarAdaptadorAsaas.emitir", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("encadeia customer → payment → identif → pix", async () => {
    const fm = fetchSeq([
      { json: { id: "cus_1" } },
      { json: { id: "pay_1", bankSlipUrl: "http://slip" } },
      { json: { identificationField: "12345", nossoNumero: "999" } },
      { json: { payload: "pixcopia" } },
    ]);
    vi.stubGlobal("fetch", fm);
    const adap = criarAdaptadorAsaas("key", "sandbox");
    const r = await adap.emitir({ valor: 100, vencimento: "2026-08-01", pagadorNome: "ACME", pagadorDocumento: "123", pagadorEmail: null, descricao: "Honorário", seuNumero: "T-1" });
    expect(r).toEqual({ provedorBoletoId: "pay_1", nossoNumero: "999", linhaDigitavel: "12345", pixCopiaCola: "pixcopia", urlPdf: "http://slip" });
    expect(fm).toHaveBeenCalledTimes(4);
    expect(fm.mock.calls[0]![0]).toBe("https://api-sandbox.asaas.com/v3/customers");
  });
  it("erro no /payments lança", async () => {
    const fm = fetchSeq([
      { json: { id: "cus_1" } },
      { ok: false, status: 400, json: { errors: [{ description: "inválido" }] } },
    ]);
    vi.stubGlobal("fetch", fm);
    const adap = criarAdaptadorAsaas("key", "producao");
    await expect(adap.emitir({ valor: 1, vencimento: "2026-08-01", pagadorNome: "X", pagadorDocumento: "1", pagadorEmail: null, descricao: "d", seuNumero: "n" })).rejects.toThrow(/Asaas 400/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- asaas-emitir` → FAIL (`criarAdaptadorAsaas` não existe).

- [ ] **Step 3: Adicionar a fábrica ao final de `asaas.ts`**

```ts
export function criarAdaptadorAsaas(apiKey: string, ambiente: "sandbox" | "producao"): ProvedorBoleto {
  const base = baseUrlAsaas(ambiente);
  const headers = headersAsaas(apiKey);
  async function req(method: "GET" | "POST", path: string, body?: unknown): Promise<Record<string, unknown>> {
    const r = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) throw new Error(`Asaas ${r.status}: ${JSON.stringify(j.errors ?? j)}`);
    return j;
  }
  return {
    async emitir(dados: DadosEmissao): Promise<BoletoEmitido> {
      const cliente = await req("POST", "/customers", corpoClienteAsaas(dados));
      const pagamento = await req("POST", "/payments", corpoCobrancaAsaas(String(cliente.id ?? ""), dados));
      const id = String(pagamento.id ?? "");
      const identif = await req("GET", `/payments/${id}/identificationField`).catch(() => null);
      const pix = await req("GET", `/payments/${id}/pixQrCode`).catch(() => null);
      return parsearCobrancaAsaas(pagamento, identif, pix);
    },
    interpretarWebhook(payload: unknown): EventoPagamento | null {
      return interpretarWebhookAsaas(payload);
    },
  };
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- asaas-emitir` (PASS), `npm run lint && npm run typecheck && npm test` (tudo verde).

- [ ] **Step 5: Commit**

```bash
git add src/lib/boleto/asaas.ts src/tests/boleto/asaas-emitir.test.ts
git commit -m "feat(boletos): fábrica criarAdaptadorAsaas (emissão + webhook)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Boletos — adaptador Asaas:** implementado o adaptador do provedor Asaas (emissão de boleto híbrido
  boleto+PIX e interpretação do webhook de pagamento), pronto para ser ligado na emissão. Ainda não é
  acionado pela interface — isso vem na etapa de emissão.
```

- [ ] **Step 2: Commit + finalizar**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog do adaptador Asaas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois usar `superpowers:finishing-a-development-branch`. (Sem migration/segredos.)

---

## Self-Review

- **Cobertura do spec:** puras baseUrl/headers/corpoCliente/corpoCobranca/parsear/interpretarWebhook (T1) ✓; fábrica `criarAdaptadorAsaas` com emissão encadeada + erro que lança (T2) ✓; CHANGELOG (T3) ✓. Unit das puras (T1) + emissão com fetch mock (T2) ✓.
- **Placeholders:** nenhum — todo passo tem código concreto.
- **Consistência de tipos:** as puras consomem `DadosEmissao` e produzem `BoletoEmitido`/`EventoPagamento` da Fatia 1; a fábrica retorna `ProvedorBoleto` (assinaturas `emitir`/`interpretarWebhook` conforme o contrato). `parsearCobrancaAsaas` e `interpretarWebhookAsaas` reutilizados pela fábrica.
- **Escopo:** só o adaptador + testes. UI/webhook/emissão a partir do título (Fatia 4) e Inter (Fatia 3) fora.
