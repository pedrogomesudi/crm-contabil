# Boletos — Fatia 3: adaptador Inter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o adaptador Banco Inter (contrato `ProvedorBoleto`) — emitir boleto (BoléPix) via OAuth2+mTLS e interpretar o webhook, testado sem rede.

**Architecture:** Módulo `src/lib/boleto/inter.ts` com funções puras (URLs, corpos de token/cobrança, parsing, webhook) e uma fábrica `criarAdaptadorInter` que faz OAuth (token cacheado), mTLS via `undici.Agent` e encadeia `fetch`. Estende `DadosEmissao` com o endereço do pagador. Spec: `docs/superpowers/specs/2026-07-08-boletos-fatia3-inter-design.md`.

**Tech Stack:** TypeScript, Vitest, `fetch` global + `undici.Agent` (mTLS).

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`.
- Só o adaptador + testes; **não** ligar na UI/webhook (Fatia 4). Sem conta para construir/testar.
- API Inter: base prod `https://cdpj.partners.bancointer.com.br`, sandbox `https://cdpj-sandbox.partners.uatinter.co`; OAuth `client_credentials` (x-www-form-urlencoded) + mTLS; header `x-conta-corrente` na cobrança.
- Extensão de `DadosEmissao` é **opcional** (não quebra o Asaas).
- Branch: `git checkout -b feat/boletos-fatia3 develop`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `src/lib/boleto/tipos.ts` — **modificar**: `DadosEmissao` ganha `pagadorEndereco?`.
- `src/lib/boleto/inter.ts` — **novo**: puras + fábrica `criarAdaptadorInter`.
- `src/tests/boleto/inter.test.ts` — **novo**: unit das puras.
- `src/tests/boleto/inter-emitir.test.ts` — **novo**: `emitir` com `fetch` mockado.

---

## Task 1: DadosEmissao + funções puras (TDD)

**Files:**
- Modify: `src/lib/boleto/tipos.ts`
- Create: `src/lib/boleto/inter.ts`
- Test: `src/tests/boleto/inter.test.ts`

**Interfaces:**
- Consumes: `DadosEmissao`, `BoletoEmitido`, `EventoPagamento` (`./tipos`).
- Produces: `baseUrlInter`, `corpoTokenInter`, `tipoPessoaPorDoc`, `corpoCobrancaInter`, `parsearConsultaInter`, `interpretarWebhookInter`; `DadosEmissao.pagadorEndereco?`.

- [ ] **Step 1: Estender `DadosEmissao`**

Em `src/lib/boleto/tipos.ts`, trocar o tipo `DadosEmissao` por (acrescentando o último campo):
```ts
export type DadosEmissao = {
  valor: number;
  vencimento: string; // YYYY-MM-DD
  pagadorNome: string;
  pagadorDocumento: string; // CPF/CNPJ (dígitos)
  pagadorEmail: string | null;
  descricao: string;
  seuNumero: string;
  pagadorEndereco?: { cep: string; logradouro: string; numero: string; bairro: string; cidade: string; uf: string } | null;
};
```

- [ ] **Step 2: Testes das puras**

```ts
import { describe, it, expect } from "vitest";
import { baseUrlInter, corpoTokenInter, tipoPessoaPorDoc, corpoCobrancaInter, parsearConsultaInter, interpretarWebhookInter } from "@/lib/boleto/inter";
import type { DadosEmissao } from "@/lib/boleto/tipos";

const dados: DadosEmissao = { valor: 100, vencimento: "2026-08-01", pagadorNome: "ACME", pagadorDocumento: "12345678000199", pagadorEmail: "a@b.com", descricao: "Honorário", seuNumero: "T-1", pagadorEndereco: { cep: "38400000", logradouro: "Rua X", numero: "10", bairro: "Centro", cidade: "Uberlândia", uf: "MG" } };

describe("inter puras", () => {
  it("baseUrlInter", () => {
    expect(baseUrlInter("producao")).toEqual({ oauth: "https://cdpj.partners.bancointer.com.br/oauth/v2/token", cobranca: "https://cdpj.partners.bancointer.com.br/cobranca/v3" });
    expect(baseUrlInter("sandbox").oauth).toBe("https://cdpj-sandbox.partners.uatinter.co/oauth/v2/token");
  });
  it("corpoTokenInter", () => {
    expect(corpoTokenInter("cid", "sec")).toEqual({ grant_type: "client_credentials", client_id: "cid", client_secret: "sec", scope: "boleto-cobranca.read boleto-cobranca.write" });
  });
  it("tipoPessoaPorDoc", () => {
    expect(tipoPessoaPorDoc("12345678901")).toBe("FISICA");
    expect(tipoPessoaPorDoc("12.345.678/0001-99")).toBe("JURIDICA");
  });
  it("corpoCobrancaInter com endereço", () => {
    const c = corpoCobrancaInter(dados) as { valorNominal: number; pagador: Record<string, unknown> };
    expect(c.valorNominal).toBe(100);
    expect(c.pagador).toMatchObject({ cpfCnpj: "12345678000199", tipoPessoa: "JURIDICA", nome: "ACME", email: "a@b.com", cep: "38400000", endereco: "Rua X", numero: "10", bairro: "Centro", cidade: "Uberlândia", uf: "MG" });
  });
  it("corpoCobrancaInter sem endereço → strings vazias", () => {
    const c = corpoCobrancaInter({ ...dados, pagadorEndereco: null, pagadorEmail: null }) as { pagador: Record<string, unknown> };
    expect(c.pagador).toMatchObject({ cep: "", endereco: "", cidade: "" });
    expect(c.pagador.email).toBeUndefined();
  });
  it("parsearConsultaInter", () => {
    expect(parsearConsultaInter("cod-1", { boleto: { linhaDigitavel: "123", nossoNumero: "9" }, pix: { pixCopiaECola: "pixcc" } })).toEqual({ provedorBoletoId: "cod-1", nossoNumero: "9", linhaDigitavel: "123", pixCopiaCola: "pixcc", urlPdf: null });
  });
  it("interpretarWebhookInter: recebido", () => {
    expect(interpretarWebhookInter({ codigoSolicitacao: "cod-1", situacao: "RECEBIDO", valorNominal: 100, dataHoraSituacao: "2026-08-02T10:00:00Z" })).toEqual({ provedorBoletoId: "cod-1", pago: true, valorPago: 100, pagoEm: "2026-08-02T10:00:00Z" });
  });
  it("interpretarWebhookInter: situação irrelevante / inválido → null", () => {
    expect(interpretarWebhookInter({ codigoSolicitacao: "cod-1", situacao: "EM_PROCESSAMENTO" })).toBe(null);
    expect(interpretarWebhookInter("nada")).toBe(null);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar** — `npm test -- boleto/inter.test` → FAIL.

- [ ] **Step 4: Implementar as puras em `inter.ts`**

```ts
import type { DadosEmissao, BoletoEmitido, EventoPagamento } from "./tipos";

export function baseUrlInter(ambiente: "sandbox" | "producao"): { oauth: string; cobranca: string } {
  const host = ambiente === "producao" ? "https://cdpj.partners.bancointer.com.br" : "https://cdpj-sandbox.partners.uatinter.co";
  return { oauth: `${host}/oauth/v2/token`, cobranca: `${host}/cobranca/v3` };
}

export function corpoTokenInter(clientId: string, clientSecret: string): Record<string, string> {
  return { grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret, scope: "boleto-cobranca.read boleto-cobranca.write" };
}

export function tipoPessoaPorDoc(documento: string): "FISICA" | "JURIDICA" {
  return documento.replace(/\D/g, "").length === 11 ? "FISICA" : "JURIDICA";
}

export function corpoCobrancaInter(dados: DadosEmissao): Record<string, unknown> {
  const e = dados.pagadorEndereco ?? null;
  const pagador: Record<string, unknown> = {
    cpfCnpj: dados.pagadorDocumento,
    tipoPessoa: tipoPessoaPorDoc(dados.pagadorDocumento),
    nome: dados.pagadorNome,
    cep: e?.cep ?? "",
    endereco: e?.logradouro ?? "",
    numero: e?.numero ?? "",
    bairro: e?.bairro ?? "",
    cidade: e?.cidade ?? "",
    uf: e?.uf ?? "",
  };
  if (dados.pagadorEmail) pagador.email = dados.pagadorEmail;
  return { seuNumero: dados.seuNumero, valorNominal: dados.valor, dataVencimento: dados.vencimento, numDiasAgenda: 60, pagador };
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export function parsearConsultaInter(codigoSolicitacao: string, consulta: Record<string, unknown>): BoletoEmitido {
  const boleto = (typeof consulta.boleto === "object" && consulta.boleto !== null ? consulta.boleto : {}) as Record<string, unknown>;
  const pix = (typeof consulta.pix === "object" && consulta.pix !== null ? consulta.pix : {}) as Record<string, unknown>;
  return {
    provedorBoletoId: codigoSolicitacao,
    nossoNumero: str(boleto.nossoNumero),
    linhaDigitavel: str(boleto.linhaDigitavel),
    pixCopiaCola: str(pix.pixCopiaECola),
    urlPdf: null,
  };
}

export function interpretarWebhookInter(payload: unknown): EventoPagamento | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.codigoSolicitacao !== "string" || typeof p.situacao !== "string") return null;
  if (p.situacao !== "RECEBIDO" && p.situacao !== "MARCADO_RECEBIDO" && p.situacao !== "PAGO") return null;
  return {
    provedorBoletoId: p.codigoSolicitacao,
    pago: true,
    valorPago: typeof p.valorNominal === "number" ? p.valorNominal : null,
    pagoEm: typeof p.dataHoraSituacao === "string" ? p.dataHoraSituacao : null,
  };
}
```

- [ ] **Step 5: Rodar + verificar** — `npm test -- boleto/inter.test` (PASS); `npm test -- boleto/asaas` (ainda PASS — extensão não quebrou); `npm run lint`, `npm run typecheck`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/boleto/tipos.ts src/lib/boleto/inter.ts src/tests/boleto/inter.test.ts
git commit -m "feat(boletos): funções puras do adaptador Inter + endereço do pagador (TDD)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Fábrica criarAdaptadorInter (OAuth + mTLS)

**Files:**
- Modify: `src/lib/boleto/inter.ts`
- Test: `src/tests/boleto/inter-emitir.test.ts`

**Interfaces:**
- Consumes: as puras (Task 1); `ProvedorBoleto` (`./tipos`); `Agent` (`undici`).
- Produces: `criarAdaptadorInter(clientId, clientSecret, contaCorrente, certPem, keyPem, ambiente): ProvedorBoleto`.

- [ ] **Step 1: Teste com `fetch` mockado**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { criarAdaptadorInter } from "@/lib/boleto/inter";

function fetchSeq(respostas: { ok?: boolean; status?: number; json: unknown }[]) {
  let i = 0;
  return vi.fn(async () => {
    const r = respostas[i++]!;
    return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.json } as unknown as Response;
  });
}

describe("criarAdaptadorInter.emitir", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("token → cobrancas → consulta e envia x-conta-corrente", async () => {
    const fm = fetchSeq([
      { json: { access_token: "tok", expires_in: 3600 } },
      { json: { codigoSolicitacao: "cod-1" } },
      { json: { boleto: { linhaDigitavel: "123", nossoNumero: "9" }, pix: { pixCopiaECola: "pixcc" } } },
    ]);
    vi.stubGlobal("fetch", fm);
    const adap = criarAdaptadorInter("cid", "sec", "99999", "certpem", "keypem", "producao");
    const r = await adap.emitir({ valor: 100, vencimento: "2026-08-01", pagadorNome: "ACME", pagadorDocumento: "12345678000199", pagadorEmail: null, descricao: "Honorário", seuNumero: "T-1", pagadorEndereco: { cep: "38400000", logradouro: "Rua X", numero: "10", bairro: "Centro", cidade: "Uberlândia", uf: "MG" } });
    expect(r).toEqual({ provedorBoletoId: "cod-1", nossoNumero: "9", linhaDigitavel: "123", pixCopiaCola: "pixcc", urlPdf: null });
    expect(fm).toHaveBeenCalledTimes(3);
    const initCobranca = (fm.mock.calls[1] as unknown[])[1] as { headers: Record<string, string> };
    expect(initCobranca.headers["x-conta-corrente"]).toBe("99999");
  });
  it("erro no token lança", async () => {
    const fm = fetchSeq([{ ok: false, status: 401, json: { message: "unauthorized" } }]);
    vi.stubGlobal("fetch", fm);
    const adap = criarAdaptadorInter("cid", "sec", "99999", "certpem", "keypem", "sandbox");
    await expect(adap.emitir({ valor: 1, vencimento: "2026-08-01", pagadorNome: "X", pagadorDocumento: "1", pagadorEmail: null, descricao: "d", seuNumero: "n" })).rejects.toThrow(/Inter token 401/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- inter-emitir` → FAIL (`criarAdaptadorInter` não existe).

- [ ] **Step 3: Adicionar imports + a fábrica ao final de `inter.ts`**

No topo de `inter.ts`, trocar o import de tipos para incluir `ProvedorBoleto` e adicionar o `Agent`:
```ts
import type { DadosEmissao, BoletoEmitido, EventoPagamento, ProvedorBoleto } from "./tipos";
import { Agent } from "undici";
```
Ao final do arquivo:
```ts
export function criarAdaptadorInter(clientId: string, clientSecret: string, contaCorrente: string, certPem: string, keyPem: string, ambiente: "sandbox" | "producao"): ProvedorBoleto {
  const urls = baseUrlInter(ambiente);
  const dispatcher = new Agent({ connect: { cert: certPem, key: keyPem } });
  let token: { valor: string; expiraEm: number } | null = null;

  async function obterToken(): Promise<string> {
    const agora = Date.now();
    if (token && token.expiraEm > agora + 30000) return token.valor;
    const body = new URLSearchParams(corpoTokenInter(clientId, clientSecret)).toString();
    const r = await fetch(urls.oauth, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, dispatcher } as RequestInit & { dispatcher: Agent });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) throw new Error(`Inter token ${r.status}: ${JSON.stringify(j)}`);
    const exp = typeof j.expires_in === "number" ? j.expires_in : 3600;
    token = { valor: String(j.access_token ?? ""), expiraEm: agora + exp * 1000 };
    return token.valor;
  }

  async function req(method: "GET" | "POST", path: string, tk: string, body?: unknown): Promise<Record<string, unknown>> {
    const r = await fetch(`${urls.cobranca}${path}`, { method, headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json", "x-conta-corrente": contaCorrente }, body: body === undefined ? undefined : JSON.stringify(body), dispatcher } as RequestInit & { dispatcher: Agent });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) throw new Error(`Inter ${r.status}: ${JSON.stringify(j)}`);
    return j;
  }

  return {
    async emitir(dados: DadosEmissao): Promise<BoletoEmitido> {
      const tk = await obterToken();
      const criada = await req("POST", "/cobrancas", tk, corpoCobrancaInter(dados));
      const cod = String(criada.codigoSolicitacao ?? "");
      const consulta = await req("GET", `/cobrancas/${cod}`, tk);
      return parsearConsultaInter(cod, consulta);
    },
    interpretarWebhook(payload: unknown): EventoPagamento | null {
      return interpretarWebhookInter(payload);
    },
  };
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- inter-emitir` (PASS); `npm run lint && npm run typecheck && npm test` (tudo verde). Se `undici` não resolver no ambiente, confirmar que já é dependência transitiva do Next (é); não adicionar ao `package.json`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/boleto/inter.ts src/tests/boleto/inter-emitir.test.ts
git commit -m "feat(boletos): fábrica criarAdaptadorInter (OAuth2 + mTLS + emissão)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Boletos — adaptador Inter:** implementado o adaptador do Banco Inter (emissão de boleto BoléPix via
  OAuth2 + mTLS e interpretação do webhook), pronto para ser ligado na emissão. Ainda não é acionado pela
  interface — isso vem na etapa de emissão. Nomes de campo/situação podem exigir acerto no primeiro teste
  ao vivo com a conta Inter.
```

- [ ] **Step 2: Commit + finalizar**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog do adaptador Inter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois usar `superpowers:finishing-a-development-branch`. (Sem migration/segredos.)

---

## Self-Review

- **Cobertura do spec:** `DadosEmissao.pagadorEndereco?` (T1) ✓; puras baseUrl/token/tipoPessoa/corpoCobranca/parsearConsulta/interpretarWebhook (T1) ✓; fábrica com OAuth cacheado + mTLS undici + emissão encadeada + `x-conta-corrente` (T2) ✓; CHANGELOG com o caveat (T3) ✓. Unit (T1) + emissão com fetch mock (T2) ✓.
- **Placeholders:** nenhum — todo passo tem código concreto.
- **Consistência de tipos:** as puras consomem `DadosEmissao` (agora com `pagadorEndereco?`) e produzem `BoletoEmitido`/`EventoPagamento`; a fábrica retorna `ProvedorBoleto`; `criarAdaptadorInter` reusa `baseUrlInter`/`corpoTokenInter`/`corpoCobrancaInter`/`parsearConsultaInter`/`interpretarWebhookInter`. Extensão opcional de `DadosEmissao` não quebra o Asaas (T1 Step 5 confirma).
- **Escopo:** só o adaptador Inter + testes. UI/webhook/emissão a partir do título (Fatia 4) fora.
