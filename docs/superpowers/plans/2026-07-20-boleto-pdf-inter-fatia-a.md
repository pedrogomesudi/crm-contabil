# 2ª via em PDF do boleto (Inter) — Fatia A (equipe) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botão "Baixar PDF (2ª via)" nos boletos do Inter, na tela da equipe (Contas a Receber) — busca o PDF do Inter na 1ª vez, guarda no Storage e serve por URL assinada de download.

**Architecture:** Adaptador ganha `pdf()` (Inter); lib `garantirPdfBoleto` orquestra busca+upload+persistência do caminho; ação `urlBoletoPdfEquipe` devolve URL assinada; `BoletoTitulo` ganha o botão. Base64→bytes via Buffer; download via `createSignedUrl(..., { download })`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Storage), Tailwind 4, vitest + `renderToStaticMarkup`.

## Global Constraints

- Gate equipe = `podeGerenciarFinanceiro`. Storage sempre via `createAdminSupabase()` (service_role); bucket privado.
- Migrations imutáveis; nova idempotente (`add column if not exists`, `insert ... on conflict do nothing`).
- Guard `divida-ui`: sem `border` estático em input escrito à mão; sem `←`/`amber-\d`.
- Imports `@/*`. Rodar antes de commitar: `npm run lint && npm run typecheck && npm test && npm run format && npm run build`.
- **Endpoint do Inter a confirmar ao vivo:** o boleto de teste já emitido permite validar o formato real
  de `GET /cobranca/v3/cobrancas/{cod}/pdf` (JSON `{pdf: base64}` vs bytes crus) antes de finalizar a Task 3.

---

### Task 1: Lógica pura `extrairPdfBase64Inter`

**Files:**
- Modify: `src/lib/boleto/inter.ts` (adicionar a função pura)
- Test: `src/tests/boleto/inter-pdf.test.ts`

**Interfaces:**
- Produces: `extrairPdfBase64Inter(resp: Record<string, unknown>): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/boleto/inter-pdf.test.ts
import { describe, it, expect } from "vitest";
import { extrairPdfBase64Inter } from "@/lib/boleto/inter";

describe("extrairPdfBase64Inter", () => {
  it("retorna o base64 quando presente", () => {
    expect(extrairPdfBase64Inter({ pdf: "JVBERi0xLjQK" })).toBe("JVBERi0xLjQK");
  });
  it("retorna null quando ausente", () => {
    expect(extrairPdfBase64Inter({})).toBeNull();
  });
  it("retorna null quando vazio ou tipo errado", () => {
    expect(extrairPdfBase64Inter({ pdf: "" })).toBeNull();
    expect(extrairPdfBase64Inter({ pdf: 123 as unknown as string })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/boleto/inter-pdf.test.ts`
Expected: FAIL (`extrairPdfBase64Inter` não exportada).

- [ ] **Step 3: Implement**

Em `src/lib/boleto/inter.ts`, adicionar após `parsearConsultaInter`:

```ts
// A exportação de PDF do Inter devolve o arquivo em base64 no campo `pdf`.
export function extrairPdfBase64Inter(resp: Record<string, unknown>): string | null {
  const p = resp.pdf;
  return typeof p === "string" && p.length > 0 ? p : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/boleto/inter-pdf.test.ts`
Expected: PASS (3 asserts).

- [ ] **Step 5: Commit**

```bash
git add src/lib/boleto/inter.ts src/tests/boleto/inter-pdf.test.ts
git commit -m "feat(boleto): extrairPdfBase64Inter (lógica pura)"
```

---

### Task 2: Migration — coluna `pdf_path` e bucket `boletos`

**Files:**
- Create: `supabase/migrations/0120_boleto_pdf.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 2ª via em PDF do boleto: caminho do arquivo guardado no Storage + bucket privado.
alter table boleto add column if not exists pdf_path text;
insert into storage.buckets (id, name, public) values ('boletos', 'boletos', false)
  on conflict (id) do nothing;
```

- [ ] **Step 2: Verify idempotency**

Run: `grep -cE "if not exists|on conflict" supabase/migrations/0120_boleto_pdf.sql`
Expected: 2.

> Aplicada em produção via `node --env-file=.env.producao.bak scripts/db-migrate.mjs` antes do Implantar.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0120_boleto_pdf.sql
git commit -m "feat(boleto): coluna pdf_path e bucket boletos (0120)"
```

---

### Task 3: Adaptador — `pdf()` na interface e no Inter

**Files:**
- Modify: `src/lib/boleto/tipos.ts` (interface)
- Modify: `src/lib/boleto/inter.ts` (método no adaptador)

**Interfaces:**
- Consumes: `extrairPdfBase64Inter` (Task 1); `req`/`obterToken` internos do adaptador.
- Produces: `ProvedorBoleto.pdf?(provedorBoletoId: string): Promise<string | null>` — base64 ou null.

- [ ] **Step 1: Add the optional method to the interface**

Em `src/lib/boleto/tipos.ts`, na interface `ProvedorBoleto`:

```ts
export interface ProvedorBoleto {
  emitir(dados: DadosEmissao): Promise<BoletoEmitido>;
  interpretarWebhook(payload: unknown): EventoPagamento | null;
  pdf?(provedorBoletoId: string): Promise<string | null>;
}
```

- [ ] **Step 2: Implement `pdf` no adaptador do Inter**

Em `src/lib/boleto/inter.ts`, dentro do objeto retornado por `criarAdaptadorInter` (junto de `emitir`/`interpretarWebhook`):

```ts
    async pdf(codigoSolicitacao: string): Promise<string | null> {
      const tk = await obterToken();
      const j = await req("GET", `/cobrancas/${codigoSolicitacao}/pdf`, tk);
      return extrairPdfBase64Inter(j);
    },
```

- [ ] **Step 3: Validar o formato real com o boleto vivo**

Confirme, com o `provedor_boleto_id` do boleto de teste já emitido, que `GET /cobranca/v3/cobrancas/{cod}/pdf`
devolve JSON `{pdf: "<base64>"}` (e não bytes crus). Consulta read-only pelo banco de produção:

Run: `node --env-file=.env.producao.bak -e 'import("pg").then(async ({default:pg})=>{const c=new pg.Client({connectionString:process.env.SUPABASE_DB_URL});await c.connect();const r=await c.query("select provedor, provedor_boleto_id, numero from boleto where provedor=\x27inter\x27 order by criado_em desc limit 1");console.log(r.rows);await c.end();})'`

Se o retorno do Inter for **bytes crus** em vez de JSON, ajuste o `pdf()` para ler `arrayBuffer()` e devolver o base64 (`Buffer.from(await r.arrayBuffer()).toString("base64")`) — mantendo `extrairPdfBase64Inter` só para o caso JSON. (A validação HTTP de fato ocorre no teste manual da Task 5.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: sem erros (Asaas não implementa `pdf`, que é opcional).

- [ ] **Step 5: Commit**

```bash
git add src/lib/boleto/tipos.ts src/lib/boleto/inter.ts
git commit -m "feat(boleto): método pdf() no adaptador do Inter"
```

---

### Task 4: Lib `garantirPdfBoleto` + ação `urlBoletoPdfEquipe`

**Files:**
- Create: `src/app/(app)/financeiro/contas-a-receber/boleto-pdf.ts`
- Modify: `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts`

**Interfaces:**
- Consumes: `adaptadorAtivo` de `@/lib/boleto/ativo`; `createAdminSupabase`.
- Produces:
  - `garantirPdfBoleto(boletoId: string): Promise<string | null>` — caminho no Storage (ou null).
  - `assinarPdfBoleto(path: string, numero: number): Promise<string | null>` — URL assinada de download.
  - `urlBoletoPdfEquipe(boletoId: string): Promise<{ url?: string; erro?: string }>`

- [ ] **Step 1: Write the shared lib**

```ts
// src/app/(app)/financeiro/contas-a-receber/boleto-pdf.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { adaptadorAtivo } from "@/lib/boleto/ativo";

// Garante o PDF do boleto no Storage e devolve o caminho; null se o provedor não expõe PDF.
export async function garantirPdfBoleto(boletoId: string): Promise<string | null> {
  const admin = createAdminSupabase();
  const { data: b } = await admin
    .from("boleto")
    .select("id, provedor, provedor_boleto_id, pdf_path")
    .eq("id", boletoId)
    .maybeSingle();
  if (!b) return null;
  if (b.pdf_path) return b.pdf_path as string;
  if (b.provedor !== "inter" || !b.provedor_boleto_id) return null;
  const ativo = await adaptadorAtivo();
  if ("erro" in ativo || typeof ativo.adaptador.pdf !== "function") return null;
  const base64 = await ativo.adaptador.pdf(b.provedor_boleto_id as string);
  if (!base64) return null;
  const caminho = `${boletoId}.pdf`;
  const buf = Buffer.from(base64, "base64");
  const up = await admin.storage.from("boletos").upload(caminho, buf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (up.error) return null;
  await admin.from("boleto").update({ pdf_path: caminho }).eq("id", boletoId);
  return caminho;
}

export async function assinarPdfBoleto(path: string, numero: number): Promise<string | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.storage
    .from("boletos")
    .createSignedUrl(path, 60, { download: `boleto-${numero}.pdf` });
  return data?.signedUrl ?? null;
}
```

- [ ] **Step 2: Add the equipe action**

Em `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts`, adicionar o import e a ação:

```ts
import { garantirPdfBoleto, assinarPdfBoleto } from "./boleto-pdf";
```

```ts
export async function urlBoletoPdfEquipe(boletoId: string): Promise<{ url?: string; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: b } = await supabase
    .from("boleto")
    .select("id, numero, url_pdf")
    .eq("id", boletoId)
    .maybeSingle();
  if (!b) return { erro: "Boleto não encontrado." };
  if (b.url_pdf) return { url: b.url_pdf as string };
  const caminho = await garantirPdfBoleto(boletoId);
  if (!caminho) return { erro: "PDF não disponível para este boleto." };
  const url = await assinarPdfBoleto(caminho, Number(b.numero));
  if (!url) return { erro: "Falha ao gerar o PDF." };
  return { url };
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/financeiro/contas-a-receber/boleto-pdf.ts" "src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts"
git commit -m "feat(boleto): garantirPdfBoleto + ação urlBoletoPdfEquipe"
```

---

### Task 5: Botão "Baixar PDF (2ª via)" no `BoletoTitulo`

**Files:**
- Modify: `src/components/financeiro/BoletoTitulo.tsx`
- Test: `src/tests/financeiro/boleto-titulo-pdf.test.tsx`

**Interfaces:**
- Consumes: `urlBoletoPdfEquipe` (Task 4).

- [ ] **Step 1: Add the button**

Em `src/components/financeiro/BoletoTitulo.tsx`:

(a) import:

```tsx
import { emitirBoleto, urlBoletoPdfEquipe, type BoletoView } from "@/app/(app)/financeiro/contas-a-receber/boleto-actions";
```

(b) handler dentro do componente:

```tsx
  async function baixarPdf() {
    const r = await urlBoletoPdfEquipe(boleto!.id);
    if (r.erro) return alert(r.erro);
    if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
  }
```

(c) no bloco do boleto existente (após o link condicional de `boleto.urlPdf`), adicionar o botão para o caso Inter (sem `urlPdf`):

```tsx
      {!boleto.urlPdf && (
        <button type="button" onClick={baixarPdf} className="block text-left underline">
          Baixar PDF (2ª via)
        </button>
      )}
```

- [ ] **Step 2: Write the render test**

```tsx
// src/tests/financeiro/boleto-titulo-pdf.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BoletoTitulo } from "@/components/financeiro/BoletoTitulo";

const base = { id: "b1", numero: 7, provedor: "inter", linhaDigitavel: "0001", pixCopiaCola: null, status: "emitido" };

describe("BoletoTitulo — 2ª via em PDF", () => {
  it("boleto Inter (sem urlPdf) mostra 'Baixar PDF (2ª via)'", () => {
    const html = renderToStaticMarkup(
      <BoletoTitulo tituloId="t1" boleto={{ ...base, urlPdf: null }} onMudou={() => {}} />,
    );
    expect(html).toContain("Baixar PDF (2ª via)");
  });
  it("boleto com urlPdf (Asaas) mostra o link 'PDF' e não o botão novo", () => {
    const html = renderToStaticMarkup(
      <BoletoTitulo tituloId="t1" boleto={{ ...base, urlPdf: "https://x/y.pdf" }} onMudou={() => {}} />,
    );
    expect(html).toContain(">PDF<");
    expect(html).not.toContain("Baixar PDF (2ª via)");
  });
});
```

- [ ] **Step 3: Run the render test**

Run: `npx vitest run src/tests/financeiro/boleto-titulo-pdf.test.tsx`
Expected: PASS (2 asserts). (Não usa `useRouter` — sem mock.)

- [ ] **Step 4: Full gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add "src/components/financeiro/BoletoTitulo.tsx" src/tests/financeiro/boleto-titulo-pdf.test.tsx
git commit -m "feat(boleto): botão Baixar PDF (2ª via) no BoletoTitulo"
```

---

## Self-Review

**1. Spec coverage (Fatia A):**
- Adaptador `pdf()` (Inter) + `extrairPdfBase64Inter` → Tasks 1, 3. ✅
- Migration `pdf_path` + bucket `boletos` → Task 2. ✅
- `garantirPdfBoleto`/`assinarPdfBoleto` (lazy fetch + store + signed download URL) → Task 4. ✅
- Ação equipe + botão no `BoletoTitulo` → Tasks 4, 5. ✅
- Asaas segue usando `url_pdf` (link "PDF" atual; botão novo só quando `!urlPdf`) → Task 5. ✅

**2. Placeholder scan:** Nenhum TBD/TODO; todo passo com código. A incerteza do formato do endpoint está tratada como passo de validação ao vivo (Task 3, Step 3), não como placeholder. ✅

**3. Type consistency:** `garantirPdfBoleto(id): Promise<string|null>` e `assinarPdfBoleto(path, numero)` usadas na ação; `urlBoletoPdfEquipe` devolve `{url?|erro?}` consumido no `BoletoTitulo`. `pdf?` opcional na interface — `adaptadorAtivo().adaptador.pdf` verificado com `typeof === "function"`. `BoletoView` já tem `id`, `numero`, `urlPdf`. ✅
