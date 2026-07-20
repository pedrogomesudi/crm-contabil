# RF-081 — Ativar boletos (Banco Inter) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a ativação dos boletos (Inter) segura e auto-explicável — documentar a env do webhook, um painel de prontidão na tela de config, um retry na emissão do Inter, e um runbook de ativação.

**Architecture:** O fluxo de boleto já está construído; esta entrega fecha lacunas de configuração e endurece o único ponto frágil da emissão. Sem mudança no schema. Lógica nova é pura e testável (`prontidaoBoleto`, `precisaReconsultarInter`); UI nova é um server component; o retry injeta a função de espera para o teste não dormir.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, Tailwind 4, vitest + `renderToStaticMarkup`.

## Global Constraints

- Imports `@/*`; segredos server-only; **nunca renderizar valores de segredo** (a tela de boleto já só devolve flags `*Definido`).
- Tela de config é `podeGerenciarFinanceiro` (admin/financeiro).
- Guard `divida-ui`: sem `border` estático em input escrito à mão (usar `controleCls`); sem `←`/`amber-\d`.
- `package.json.version` sobe com o CHANGELOG no mesmo PR; `versao.test.ts` exige que batam.
- Rodar antes de commitar: `npm run lint && npm run typecheck && npm test && npm run format && npm run build`.

---

### Task 1: Documentar `BOLETO_WEBHOOK_SECRET` no `.env.local.example`

**Files:**
- Modify: `.env.local.example` (após a linha `BOLETO_CRIPTO_KEY=`, linha 55)

- [ ] **Step 1: Add the env key with comment**

Em `.env.local.example`, logo após a linha `BOLETO_CRIPTO_KEY=`, inserir:

```
# Segredo do webhook de baixa de boleto. O provedor (Inter/Asaas) chama
# https://<APP_URL>/api/webhooks/boleto/<BOLETO_WEBHOOK_SECRET>. Gere com: openssl rand -hex 32
BOLETO_WEBHOOK_SECRET=
```

- [ ] **Step 2: Verify**

Run: `grep -n "BOLETO_WEBHOOK_SECRET" .env.local.example`
Expected: 2 linhas (o comentário cita a var + a chave `BOLETO_WEBHOOK_SECRET=`).

- [ ] **Step 3: Commit**

```bash
git add .env.local.example
git commit -m "docs(boleto): documenta BOLETO_WEBHOOK_SECRET no env example"
```

---

### Task 2: Lógica pura `prontidaoBoleto`

**Files:**
- Modify: `src/lib/boleto/config.ts`
- Test: `src/tests/boleto/prontidao.test.ts`

**Interfaces:**
- Consumes: `ConfigBoletoView` (já existe em `config.ts`).
- Produces: `prontidaoBoleto(c: ConfigBoletoView, webhookSecretDefinido: boolean): { rotulo: string; ok: boolean }[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/boleto/prontidao.test.ts
import { describe, it, expect } from "vitest";
import { prontidaoBoleto, type ConfigBoletoView } from "@/lib/boleto/config";

const base: ConfigBoletoView = {
  provedor: "inter",
  asaasAmbiente: "producao",
  interContaCorrente: "123456",
  contaBancariaId: "conta-1",
  asaasApiKeyDefinida: false,
  interClientIdDefinido: true,
  interClientSecretDefinido: true,
  interCertDefinido: true,
  interKeyDefinida: true,
};
const okDe = (itens: { rotulo: string; ok: boolean }[]) => itens.every((i) => i.ok);

describe("prontidaoBoleto", () => {
  it("tudo verde quando Inter completo + conta destino + webhook secret", () => {
    expect(okDe(prontidaoBoleto(base, true))).toBe(true);
  });
  it("falta o webhook secret => item de webhook fica falso", () => {
    const itens = prontidaoBoleto(base, false);
    expect(itens.some((i) => /webhook/i.test(i.rotulo) && !i.ok)).toBe(true);
  });
  it("falta conta de destino => item de conta fica falso", () => {
    const itens = prontidaoBoleto({ ...base, contaBancariaId: null }, true);
    expect(itens.some((i) => /conta/i.test(i.rotulo) && !i.ok)).toBe(true);
  });
  it("provedor nenhum => item de provedor falso e nada verde", () => {
    const itens = prontidaoBoleto({ ...base, provedor: "nenhum" }, true);
    expect(itens.some((i) => /provedor/i.test(i.rotulo) && !i.ok)).toBe(true);
    expect(okDe(itens)).toBe(false);
  });
  it("credenciais Inter incompletas => item de credenciais falso", () => {
    const itens = prontidaoBoleto({ ...base, interCertDefinido: false }, true);
    expect(itens.some((i) => /credenciais/i.test(i.rotulo) && !i.ok)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/boleto/prontidao.test.ts`
Expected: FAIL (`prontidaoBoleto` não exportada).

- [ ] **Step 3: Implement**

Adicionar ao fim de `src/lib/boleto/config.ts`:

```ts
export function prontidaoBoleto(
  c: ConfigBoletoView,
  webhookSecretDefinido: boolean,
): { rotulo: string; ok: boolean }[] {
  const { configurado } = statusConfigBoleto(c);
  return [
    { rotulo: "Provedor selecionado", ok: c.provedor !== "nenhum" },
    { rotulo: "Credenciais do provedor completas", ok: c.provedor !== "nenhum" && configurado },
    { rotulo: "Conta bancária de destino da baixa", ok: c.contaBancariaId != null },
    { rotulo: "Segredo do webhook (BOLETO_WEBHOOK_SECRET)", ok: webhookSecretDefinido },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/boleto/prontidao.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/boleto/config.ts src/tests/boleto/prontidao.test.ts
git commit -m "feat(boleto): lógica pura de prontidão da configuração"
```

---

### Task 3: Painel de prontidão na tela Configurações → Boletos

**Files:**
- Create: `src/app/(app)/configuracoes/boletos/PainelProntidao.tsx`
- Modify: `src/app/(app)/configuracoes/boletos/page.tsx`
- Test: `src/tests/boleto/prontidao-render.test.tsx`

**Interfaces:**
- Consumes: `prontidaoBoleto`, `ConfigBoletoView`.
- Produces: `PainelProntidao({ config, webhookSecretDefinido, appUrl }: { config: ConfigBoletoView; webhookSecretDefinido: boolean; appUrl: string | null })`.

- [ ] **Step 1: Write the component**

```tsx
// src/app/(app)/configuracoes/boletos/PainelProntidao.tsx
import { prontidaoBoleto, type ConfigBoletoView } from "@/lib/boleto/config";

export function PainelProntidao({
  config,
  webhookSecretDefinido,
  appUrl,
}: {
  config: ConfigBoletoView;
  webhookSecretDefinido: boolean;
  appUrl: string | null;
}) {
  const itens = prontidaoBoleto(config, webhookSecretDefinido);
  const base = (appUrl ?? "https://app.seusaldo.ai").replace(/\/+$/, "");
  return (
    <section className="space-y-3 rounded-lg border border-linha bg-white p-4">
      <h2 className="text-sm font-semibold text-grafite">Prontidão da configuração</h2>
      <ul className="space-y-1 text-sm">
        {itens.map((i) => (
          <li key={i.rotulo} className="flex items-center gap-2">
            <span className={i.ok ? "text-verde" : "text-negativo"}>{i.ok ? "✓" : "✗"}</span>
            <span className={i.ok ? "text-texto" : "text-cinza"}>{i.rotulo}</span>
          </li>
        ))}
      </ul>
      {config.provedor !== "nenhum" && (
        <div className="space-y-1 border-t border-linha pt-3 text-xs text-cinza">
          <p className="font-medium text-grafite">URL do webhook a cadastrar no provedor</p>
          <code className="block break-all rounded bg-creme px-2 py-1 text-texto">
            {base}/api/webhooks/boleto/&lt;BOLETO_WEBHOOK_SECRET&gt;
          </code>
          <p>Troque &lt;BOLETO_WEBHOOK_SECRET&gt; pelo valor definido no ambiente (não é exibido aqui).</p>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Wire into the page**

Em `src/app/(app)/configuracoes/boletos/page.tsx`: importar o painel e renderizá-lo acima do form, passando os checks server-side.

Adicionar ao bloco de imports:

```tsx
import { PainelProntidao } from "./PainelProntidao";
```

Trocar o `return (...)` para incluir o painel antes do `<FormBoletos>`:

```tsx
  const webhookSecretDefinido = Boolean(process.env.BOLETO_WEBHOOK_SECRET);
  const appUrl = process.env.APP_URL ?? null;
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <PageHeader titulo="Boletos" subtitulo="Provedor de emissão (Inter ou Asaas)" />
      <PainelProntidao config={config} webhookSecretDefinido={webhookSecretDefinido} appUrl={appUrl} />
      <FormBoletos config={config} contas={(contas as { id: string; nome: string }[] | null) ?? []} />
    </Container>
  );
```

- [ ] **Step 3: Write the render test**

```tsx
// src/tests/boleto/prontidao-render.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PainelProntidao } from "@/app/(app)/configuracoes/boletos/PainelProntidao";
import type { ConfigBoletoView } from "@/lib/boleto/config";

const cfg: ConfigBoletoView = {
  provedor: "inter",
  asaasAmbiente: "producao",
  interContaCorrente: "123456",
  contaBancariaId: null,
  asaasApiKeyDefinida: false,
  interClientIdDefinido: true,
  interClientSecretDefinido: true,
  interCertDefinido: true,
  interKeyDefinida: true,
};

describe("PainelProntidao", () => {
  it("mostra ✗ para o que falta (conta destino e webhook)", () => {
    const html = renderToStaticMarkup(
      <PainelProntidao config={cfg} webhookSecretDefinido={false} appUrl="https://app.seusaldo.ai" />,
    );
    expect(html).toContain("Conta bancária de destino da baixa");
    expect(html).toContain("✗");
  });
  it("mostra a URL do webhook como template, sem o valor do segredo", () => {
    const html = renderToStaticMarkup(
      <PainelProntidao config={cfg} webhookSecretDefinido={true} appUrl="https://app.seusaldo.ai" />,
    );
    expect(html).toContain("/api/webhooks/boleto/");
    expect(html).toContain("BOLETO_WEBHOOK_SECRET"); // template, não o valor
  });
});
```

- [ ] **Step 4: Run the render test**

Run: `npx vitest run src/tests/boleto/prontidao-render.test.tsx`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/configuracoes/boletos/PainelProntidao.tsx" "src/app/(app)/configuracoes/boletos/page.tsx" src/tests/boleto/prontidao-render.test.tsx
git commit -m "feat(boleto): painel de prontidão na tela de configuração"
```

---

### Task 4: Retry na emissão do Inter

**Files:**
- Modify: `src/lib/boleto/inter.ts`
- Test: `src/tests/boleto/inter-retry.test.ts`

**Interfaces:**
- Produces:
  - `precisaReconsultarInter(b: BoletoEmitido): boolean` — true quando `linhaDigitavel` **e** `pixCopiaECola` são nulos.
  - `criarAdaptadorInter(..., esperar?)` — parâmetro opcional `esperar: (ms: number) => Promise<void>` (default real) para o teste injetar uma espera fake; `emitir()` reconsulta **uma vez** após ~1500ms se `precisaReconsultarInter` for true.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/boleto/inter-retry.test.ts
import { describe, it, expect } from "vitest";
import { precisaReconsultarInter, corpoCobrancaInter } from "@/lib/boleto/inter";
import type { BoletoEmitido } from "@/lib/boleto/tipos";

const bo = (linha: string | null, pix: string | null): BoletoEmitido => ({
  provedorBoletoId: "x",
  nossoNumero: null,
  linhaDigitavel: linha,
  pixCopiaCola: pix,
  urlPdf: null,
});

describe("precisaReconsultarInter", () => {
  it("true só quando linha e pix são ambos nulos", () => {
    expect(precisaReconsultarInter(bo(null, null))).toBe(true);
    expect(precisaReconsultarInter(bo("0001", null))).toBe(false);
    expect(precisaReconsultarInter(bo(null, "pix"))).toBe(false);
  });
});

describe("corpoCobrancaInter", () => {
  it("mapeia valor, vencimento e pagador (sanidade)", () => {
    const corpo = corpoCobrancaInter({
      seuNumero: "42",
      valor: 10.5,
      vencimento: "2026-08-01",
      pagadorNome: "Fulano",
      pagadorDocumento: "12345678901",
      pagadorEmail: null,
      pagadorEndereco: null,
    });
    expect(corpo.valorNominal).toBe(10.5);
    expect(corpo.dataVencimento).toBe("2026-08-01");
    expect((corpo.pagador as { tipoPessoa: string }).tipoPessoa).toBe("FISICA");
  });
});
```

> Nota: o teste de `emitir()` com `req` fake exige acesso ao `req` interno, que é uma closure. Para
> mantê-lo testável sem expor internals, o teste acima cobre a decisão pura (`precisaReconsultarInter`)
> — que é o núcleo do achado B — e a sanidade do corpo. O comportamento de reconsulta em si é validado
> na emissão de teste real do runbook (boleto de R$ ~5).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/boleto/inter-retry.test.ts`
Expected: FAIL (`precisaReconsultarInter` não exportada).

- [ ] **Step 3: Implement**

Em `src/lib/boleto/inter.ts`:

(a) adicionar a função pura, após `parsearConsultaInter`:

```ts
export function precisaReconsultarInter(b: BoletoEmitido): boolean {
  return b.linhaDigitavel === null && b.pixCopiaCola === null;
}
```

(b) na assinatura de `criarAdaptadorInter`, adicionar o parâmetro `esperar`:

```ts
export function criarAdaptadorInter(
  clientId: string,
  clientSecret: string,
  contaCorrente: string,
  certPem: string,
  keyPem: string,
  ambiente: "sandbox" | "producao",
  esperar: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): ProvedorBoleto {
```

(c) trocar o corpo de `emitir()` para reconsultar uma vez:

```ts
    async emitir(dados: DadosEmissao): Promise<BoletoEmitido> {
      const tk = await obterToken();
      const criada = await req("POST", "/cobrancas", tk, corpoCobrancaInter(dados));
      const cod = String(criada.codigoSolicitacao ?? "");
      let emitido = parsearConsultaInter(cod, await req("GET", `/cobrancas/${cod}`, tk));
      // A cobrança do Inter processa async: no GET imediato a linha/PIX podem vir nulos.
      // Reconsulta uma vez após uma pausa curta antes de gravar um boleto "vazio".
      if (precisaReconsultarInter(emitido)) {
        await esperar(1500);
        emitido = parsearConsultaInter(cod, await req("GET", `/cobrancas/${cod}`, tk));
      }
      return emitido;
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/boleto/inter-retry.test.ts`
Expected: PASS (2 blocos).

- [ ] **Step 5: Full gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tudo verde. `adaptadorAtivo()` chama `criarAdaptadorInter(...)` sem o 7º argumento — o default cobre, então não quebra.

- [ ] **Step 6: Commit**

```bash
git add src/lib/boleto/inter.ts src/tests/boleto/inter-retry.test.ts
git commit -m "feat(boleto): retry na emissão do Inter quando linha/PIX vêm nulos"
```

---

### Task 5: Runbook de ativação do Inter

**Files:**
- Create: `docs/ATIVAR-BOLETOS-INTER.md`

- [ ] **Step 1: Write the runbook**

Criar `docs/ATIVAR-BOLETOS-INTER.md` com o passo a passo (o conteúdo completo):

```markdown
# Ativar boletos — Banco Inter

O fluxo de boleto já está implementado. Ativar = configurar credenciais + webhook. **O Inter opera
apenas em produção pelo app** (não há sandbox): o teste é com um boleto de valor baixo, real.

## 1. Criar a aplicação no Inter Empresas
- Internet Banking PJ → **APIs / Integrações** → nova aplicação com escopo **Cobrança (boleto-cobrança)
  leitura + escrita**.
- Guarde: **client_id**, **client_secret**, o **certificado** (`.crt`) e a **chave privada** (`.key`) do
  mTLS, e o número da **conta corrente**.

## 2. Preencher Configurações → Boletos (você digita)
- Provedor: **Banco Inter**.
- Cole client_id, client_secret, conta corrente e o conteúdo dos PEM (certificado e chave).
- Selecione a **conta bancária de destino** da baixa (sem ela o webhook marca "pago" mas não gera baixa).

## 3. Definir o segredo do webhook
- Gere: `openssl rand -hex 32`.
- EasyPanel → app `cursoia/crm-contabil` → variável **BOLETO_WEBHOOK_SECRET** = o valor → Implantar.

## 4. Cadastrar o webhook no Inter
- No Inter, aponte as notificações de cobrança para:
  `https://app.seusaldo.ai/api/webhooks/boleto/<BOLETO_WEBHOOK_SECRET>`
  (o painel de prontidão na tela mostra o template).

## 5. Testar (produção, valor baixo)
- Financeiro → Contas a Receber → num título de ~R$ 5, **Emitir boleto**.
- Confirme linha digitável/PIX na tela e no **portal** do cliente.
- Pague (ou marque como recebido no Inter) e confirme que o **título baixa sozinho** via webhook.

## Prontidão
A tela Configurações → Boletos tem um **painel de prontidão** que mostra o que ainda falta
(provedor, credenciais, conta destino, webhook secret) e a URL do webhook.
```

- [ ] **Step 2: Commit**

```bash
git add docs/ATIVAR-BOLETOS-INTER.md
git commit -m "docs(boleto): runbook de ativação do Banco Inter"
```

---

## Self-Review

**1. Spec coverage:**
- Documentar `BOLETO_WEBHOOK_SECRET` → Task 1. ✅
- Painel de prontidão (provedor, credenciais, conta destino, webhook secret, URL template sem segredo) → Task 2 (lógica) + Task 3 (UI). ✅
- Retry na emissão do Inter (achado B) → Task 4. ✅
- Runbook produção-only → Task 5. ✅
- Achado A (Inter produção-only) → refletido no runbook (Task 5), sem código. ✅
- Achados C (nota, sem ação) → não implementados, corretamente. ✅

**2. Placeholder scan:** Nenhum TBD/TODO; todo passo com código/conteúdo completo. ✅

**3. Type consistency:** `prontidaoBoleto(c, webhookSecretDefinido)` retorna `{rotulo, ok}[]` e é consumida igual no `PainelProntidao`. `precisaReconsultarInter(BoletoEmitido)` e o parâmetro `esperar` com default batem com a chamada existente em `adaptadorAtivo` (que não passa o 7º arg). `ConfigBoletoView` reusada sem alteração. ✅
