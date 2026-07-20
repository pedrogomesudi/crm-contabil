# 2ª via em PDF do boleto (Inter) — Fatia B (portal) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O cliente baixa a 2ª via em PDF do próprio boleto do Inter, na aba Boletos do portal.

**Architecture:** Reusa `garantirPdfBoleto`/`assinarPdfBoleto` da Fatia A. Prereq: `adaptadorAtivo` passa a ler `boleto_config` via admin (a config é admin-only por RLS; o cliente do portal não a lê, então a geração preguiçosa precisa do service_role — os gates das actions seguem sendo a fronteira de segurança). Ação `urlBoletoPdf` no portal (gate cliente + RLS de titularidade + rastreio RF-053) + botão no portal/boletos.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Storage), Tailwind 4, vitest + `renderToStaticMarkup`.

## Global Constraints

- Portal = papel `cliente`; todo download segue o padrão: lê o registro pela RLS do usuário (prova titularidade), só então assina a URL com service_role.
- Gate equipe (Fatia A) inalterado. A troca de `adaptadorAtivo` para admin não muda quem emite — `emitirBoleto` já é `podeGerenciarFinanceiro`.
- Storage/segredos server-only; URL assinada de vida curta (60s).
- Guard `divida-ui`: sem `border` estático em input; sem `←`/`amber-\d`.
- `package.json.version` sobe com o CHANGELOG no mesmo PR; `versao.test.ts` exige que batam.

---

### Task 1: `adaptadorAtivo` lê a config via admin (prereq do portal)

**Files:**
- Modify: `src/lib/boleto/ativo.ts`

**Interfaces:**
- Produces: `adaptadorAtivo()` com o mesmo retorno de hoje (`{ adaptador, provedor } | { erro }`), mas lendo `boleto_config` via `createAdminSupabase()` — funciona independentemente da RLS do chamador.

- [ ] **Step 1: Trocar a fonte da config para admin**

Em `src/lib/boleto/ativo.ts`:

(a) trocar o import:

```ts
import { createAdminSupabase } from "@/lib/supabase/admin";
```

(remover `import { createServerSupabase } from "@/lib/supabase/server";` se não for mais usado)

(b) trocar a obtenção do client (a linha `const supabase = await createServerSupabase();`) por:

```ts
  const supabase = createAdminSupabase();
```

> `createAdminSupabase()` é síncrono (não usa `await`), diferente de `createServerSupabase()`. O resto da função (select de `boleto_config`, decifragem, criação do adaptador) permanece igual.

- [ ] **Step 2: Verificar que a suíte não quebrou**

Run: `npm run typecheck && npm test 2>&1 | grep -E "Test Files|Tests "`
Expected: typecheck sem erros; todos os testes passam (não há teste que fixe a fonte RLS de `adaptadorAtivo`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/boleto/ativo.ts
git commit -m "refactor(boleto): adaptadorAtivo lê a config via admin (habilita PDF no portal)"
```

---

### Task 2: Ação `urlBoletoPdf` no portal + botão em Boletos

**Files:**
- Modify: `src/app/(portal)/portal/actions.ts` (nova ação)
- Create: `src/app/(portal)/portal/boletos/BaixarBoletoPdf.tsx`
- Modify: `src/app/(portal)/portal/boletos/page.tsx` (renderizar o botão)
- Test: `src/tests/boleto/baixar-boleto-pdf-render.test.tsx`

**Interfaces:**
- Consumes: `garantirPdfBoleto`, `assinarPdfBoleto` de `@/app/(app)/financeiro/contas-a-receber/boleto-pdf`; helpers privados `gate`/`registrar` do próprio `portal/actions.ts`.
- Produces:
  - `urlBoletoPdf(id: string): Promise<{ url?: string; erro?: string }>`
  - `BaixarBoletoPdf({ id }: { id: string })` — botão cliente que chama `urlBoletoPdf` e baixa.

- [ ] **Step 1: Add the portal action**

Em `src/app/(portal)/portal/actions.ts`, adicionar o import e a ação:

```ts
import { garantirPdfBoleto, assinarPdfBoleto } from "@/app/(app)/financeiro/contas-a-receber/boleto-pdf";
```

```ts
export async function urlBoletoPdf(id: string): Promise<{ url?: string; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  // RLS (boleto_portal_sel) prova que o boleto é do próprio cliente.
  const { data: b } = await supabase.from("boleto").select("id, numero, url_pdf").eq("id", id).maybeSingle();
  if (!b) return { erro: "Boleto não encontrado." };
  let url: string | null;
  if (b.url_pdf) url = b.url_pdf as string;
  else {
    const caminho = await garantirPdfBoleto(id);
    if (!caminho) return { erro: "PDF não disponível." };
    url = await assinarPdfBoleto(caminho, Number(b.numero));
  }
  if (!url) return { erro: "Falha ao gerar o link." };
  await registrar(perfil.clienteId!, perfil.id, "boleto", id);
  return { url };
}
```

- [ ] **Step 2: Write the client button**

```tsx
// src/app/(portal)/portal/boletos/BaixarBoletoPdf.tsx
"use client";
import { useState } from "react";
import { urlBoletoPdf } from "../actions";

export function BaixarBoletoPdf({ id }: { id: string }) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  async function baixar() {
    setErro("");
    setOcupado(true);
    const r = await urlBoletoPdf(id);
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
  }
  return (
    <span className="flex items-center gap-2">
      <button disabled={ocupado} onClick={baixar} className="text-verde underline disabled:opacity-60">
        baixar boleto (PDF)
      </button>
      {erro && <span className="text-negativo">{erro}</span>}
    </span>
  );
}
```

- [ ] **Step 3: Wire into the boletos page**

Em `src/app/(portal)/portal/boletos/page.tsx`:

(a) import:

```tsx
import { BaixarBoletoPdf } from "./BaixarBoletoPdf";
```

(b) no bloco de links por boleto, adicionar o botão para o caso Inter (sem `url_pdf`). Trocar:

```tsx
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {b.url_pdf && <LinkBoleto id={b.id as string} url={b.url_pdf as string} />}
                {b.pix_copia_cola && <span className="text-cinza">PIX copia e cola disponível no boleto</span>}
              </div>
```

por:

```tsx
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {b.url_pdf ? (
                  <LinkBoleto id={b.id as string} url={b.url_pdf as string} />
                ) : (
                  <BaixarBoletoPdf id={b.id as string} />
                )}
                {b.pix_copia_cola && <span className="text-cinza">PIX copia e cola disponível no boleto</span>}
              </div>
```

- [ ] **Step 4: Write the render test**

```tsx
// src/tests/boleto/baixar-boleto-pdf-render.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BaixarBoletoPdf } from "@/app/(portal)/portal/boletos/BaixarBoletoPdf";

describe("BaixarBoletoPdf", () => {
  it("mostra o botão de baixar o PDF", () => {
    const html = renderToStaticMarkup(<BaixarBoletoPdf id="b1" />);
    expect(html).toContain("baixar boleto (PDF)");
  });
});
```

- [ ] **Step 5: Run the render test**

Run: `npx vitest run src/tests/boleto/baixar-boleto-pdf-render.test.tsx`
Expected: PASS (não usa `useRouter` — sem mock).

- [ ] **Step 6: Full gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tudo verde.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(portal)/portal/actions.ts" "src/app/(portal)/portal/boletos/BaixarBoletoPdf.tsx" "src/app/(portal)/portal/boletos/page.tsx" src/tests/boleto/baixar-boleto-pdf-render.test.tsx
git commit -m "feat(boleto): 2ª via em PDF do boleto no portal do cliente"
```

---

## Self-Review

**1. Spec coverage (Fatia B):**
- Ação `urlBoletoPdf` (gate cliente + RLS de titularidade + rastreio RF-053) → Task 2. ✅
- Botão "baixar boleto (PDF)" no portal/boletos → Task 2. ✅
- Geração preguiçosa funciona no portal (config via admin) → Task 1 (prereq). ✅
- Reuso de `garantirPdfBoleto`/`assinarPdfBoleto` (Fatia A) → Task 2. ✅
- Asaas segue com `LinkBoleto` (url_pdf); Inter usa o botão novo → Task 2 (ternário). ✅

**2. Placeholder scan:** Nenhum TBD/TODO; todo passo com código. ✅

**3. Type consistency:** `urlBoletoPdf(id): Promise<{url?|erro?}>` consumido pelo `BaixarBoletoPdf`; `garantirPdfBoleto(id): Promise<string|null>` e `assinarPdfBoleto(path, numero)` já entregues na Fatia A com essas assinaturas. `gate`/`registrar` são privados de `portal/actions.ts` e já suportam `tipo: "boleto"`. ✅

**Nota de segurança:** a Task 1 amplia o alcance de `adaptadorAtivo` (passa a ignorar RLS na leitura da config). Isso é seguro porque (a) a função é server-only, (b) as credenciais são decifradas e usadas server-side, nunca retornadas, e (c) os chamadores (`emitirBoleto` equipe; `urlBoletoPdf` após prova de titularidade do boleto) mantêm o gate. A config em si nunca é exposta — só o adaptador pronto.
