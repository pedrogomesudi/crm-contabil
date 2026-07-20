# RF-064 (devolução de acervo em rescisão) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** gerar sob demanda, na ficha do cliente, um pacote ZIP com o termo de acervo (NBC PG 01) + os documentos do cliente, para a devolução na rescisão.

**Architecture:** estende `montarTermoHtml` com a lista de arquivos; ação `gerarPacoteDevolucao` monta o termo (PDF) + baixa os documentos atuais e zipa com `pizzip` (servidor); seção `DevolucaoAcervo` na ficha dispara o download. **Sem migration.**

**Tech Stack:** Next 16 (server actions), TypeScript, Tailwind 4, Supabase (RLS/Storage), `pizzip`, vitest.

## Global Constraints

- Next 16: imports `@/*`; `middleware.ts` é `proxy.ts`.
- RBAC: papel só via `auth_papel()`.
- Guard `divida-ui`: controles sem `border` à mão → `controleCls`.
- Reusos: `montarTermoHtml`/`ACERVO_PADRAO` (`@/lib/legalizacao/termo`), `converterPdfHtml` (`@/lib/contrato/gerar`), `sanitizarHtml` (`@/lib/comercial/gerar-proposta`), `formatarEnderecoLinha` (`@/lib/comercial/proposta-template`), `agruparVersoes` (`@/lib/documentos/versoes`), `createAdminSupabase`/`createServerSupabase`, `getPerfilAtual`, `podeCriarCliente`, `PizZip` (`pizzip`).
- Sem rota nova, **sem migration**.
- Rodar antes de entregar: `lint`, `typecheck`, `test`, `format`, `build`. PR `develop`→`main`; tag após deploy; versão+CHANGELOG no mesmo PR.

---

### Task 1: Lógica pura — termo com arquivos + `nomeEntradaZip`

**Files:**
- Modify: `src/lib/legalizacao/termo.ts` (`DadosTermo.arquivos?` + segunda seção)
- Create: `src/lib/documentos/acervo.ts` (`nomeEntradaZip`)
- Test: `src/tests/legalizacao/termo-arquivos.test.ts`
- Test: `src/tests/documentos/acervo.test.ts`

**Interfaces:**
- `DadosTermo` ganha `arquivos?: string[]`.
- Produces: `nomeEntradaZip(nome: string, i: number): string`.

- [ ] **Step 1: Testes (falham)**

`src/tests/legalizacao/termo-arquivos.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { montarTermoHtml, type DadosTermo } from "@/lib/legalizacao/termo";

const base: DadosTermo = {
  tipo: "transferencia_saida",
  cliente: "Padaria X",
  marca: { nome: "Contabilidade Y", cnpj: null, enderecoLinha: "" },
  itens: ["Livros contábeis"],
  data: "2026-07-19",
  responsavel: "Pedro",
};

describe("montarTermoHtml com arquivos", () => {
  it("com arquivos, renderiza a segunda seção", () => {
    const html = montarTermoHtml({ ...base, arquivos: ["guia-07-2026.pdf", "balancete.pdf"] });
    expect(html).toContain("Documentos incluídos no pacote");
    expect(html).toContain("guia-07-2026.pdf");
    expect(html).toContain("Livros contábeis"); // categorias seguem
  });
  it("sem arquivos, não renderiza a segunda seção (não-regressão)", () => {
    const html = montarTermoHtml(base);
    expect(html).not.toContain("Documentos incluídos no pacote");
  });
});
```

`src/tests/documentos/acervo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { nomeEntradaZip } from "@/lib/documentos/acervo";

describe("nomeEntradaZip", () => {
  it("saneia e prefixa por índice (único)", () => {
    expect(nomeEntradaZip("Relatório Anual.pdf", 0)).toBe("1-Relatorio_Anual.pdf");
    expect(nomeEntradaZip("Relatório Anual.pdf", 1)).toBe("2-Relatorio_Anual.pdf");
  });
  it("nome vazio vira 'arquivo'", () => {
    expect(nomeEntradaZip("///", 4)).toBe("5-arquivo");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npx vitest run src/tests/legalizacao/termo-arquivos.test.ts src/tests/documentos/acervo.test.ts` — Expected: FAIL.

- [ ] **Step 3: `nomeEntradaZip`** (`src/lib/documentos/acervo.ts`)

```ts
function nomeSeguro(nome: string): string {
  const semAcento = nome.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const limpo = semAcento
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "")
    .replace(/[._]+$/, "");
  return limpo.length > 0 ? limpo.slice(0, 100) : "arquivo";
}

// Entrada única para o ZIP: prefixa por índice (1-based) para evitar colisão de nomes iguais.
export function nomeEntradaZip(nome: string, i: number): string {
  return `${i + 1}-${nomeSeguro(nome)}`;
}
```

- [ ] **Step 4: Termo com arquivos** — em `src/lib/legalizacao/termo.ts`:

1. `DadosTermo`: adicionar `arquivos?: string[];`.
2. No corpo de `montarTermoHtml`, antes do `return`, montar a segunda seção:

```ts
  const arquivosLi = (d.arquivos ?? [])
    .filter((a) => a.trim())
    .map((a) => `<li>${esc(a.trim())}</li>`)
    .join("");
  const secaoArquivos = arquivosLi
    ? `<p>Documentos incluídos no pacote:</p><ul>${arquivosLi}</ul>`
    : "";
```

3. No template, logo após `<ul>${itens}</ul>`, inserir `${secaoArquivos}`.

- [ ] **Step 5: Rodar e ver passar** — Run: `npx vitest run src/tests/legalizacao/termo-arquivos.test.ts src/tests/documentos/acervo.test.ts` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/legalizacao/termo.ts src/lib/documentos/acervo.ts src/tests/legalizacao/termo-arquivos.test.ts src/tests/documentos/acervo.test.ts
git commit -m "feat(rf064): termo com lista de arquivos + nomeEntradaZip"
```

---

### Task 2: Ação `gerarPacoteDevolucao`

**Files:**
- Create: `src/app/(app)/clientes/[id]/acervo-actions.ts`

**Interfaces:**
- Produces: `gerarPacoteDevolucao(clienteId: string): Promise<{ zipBase64?: string; nome?: string; erro?: string }>`

- [ ] **Step 1: Implementar**

```ts
"use server";
import { revalidatePath } from "next/cache";
import PizZip from "pizzip";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { montarTermoHtml, ACERVO_PADRAO } from "@/lib/legalizacao/termo";
import { converterPdfHtml } from "@/lib/contrato/gerar";
import { sanitizarHtml } from "@/lib/comercial/gerar-proposta";
import { formatarEnderecoLinha } from "@/lib/comercial/proposta-template";
import { agruparVersoes } from "@/lib/documentos/versoes";
import { nomeEntradaZip } from "@/lib/documentos/acervo";

const TETO_DOCS = 200;

export async function gerarPacoteDevolucao(
  clienteId: string,
): Promise<{ zipBase64?: string; nome?: string; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo || !podeCriarCliente(perfil.papel)) {
    return { erro: "Você não tem permissão para gerar o pacote." };
  }
  const supabase = await createServerSupabase();
  const { data: cli } = await supabase
    .from("clientes")
    .select("razao_social")
    .eq("id", clienteId)
    .maybeSingle();
  if (!cli) return { erro: "Cliente não encontrado ou sem permissão." };

  // Documentos atuais do cliente (RLS pela sessão).
  const { data: docsRaw } = await supabase
    .from("documentos")
    .select("id, nome, caminho_storage, substitui_id")
    .eq("cliente_id", clienteId)
    .order("enviado_em", { ascending: false })
    .limit(1000);
  const docs = agruparVersoes(
    (docsRaw ?? []).map((d) => ({
      id: d.id as string,
      substitui_id: (d.substitui_id as string | null) ?? null,
      nome: d.nome as string,
      caminho: d.caminho_storage as string,
    })),
  ).map((g) => g.atual);
  if (docs.length > TETO_DOCS) {
    return { erro: `Muitos documentos (${docs.length}). Baixe por partes na aba Documentos.` };
  }

  const { data: cfg } = await supabase
    .from("escritorio_config")
    .select("nome, cnpj, endereco")
    .eq("id", 1)
    .maybeSingle();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  const html = sanitizarHtml(
    montarTermoHtml({
      tipo: "transferencia_saida",
      cliente: (cli.razao_social as string) ?? "—",
      marca: {
        nome: (cfg?.nome as string | null) ?? null,
        cnpj: (cfg?.cnpj as string | null) ?? null,
        enderecoLinha: formatarEnderecoLinha((cfg?.endereco as Record<string, string> | null) ?? null),
      },
      itens: ACERVO_PADRAO,
      arquivos: docs.map((d) => d.nome),
      data: hoje,
      responsavel: perfil.nome,
    }),
  );
  const pdf = await converterPdfHtml(html);
  if (!pdf) return { erro: "Conversão do termo para PDF indisponível no momento. Tente novamente." };

  const admin = createAdminSupabase();
  const zip = new PizZip();
  zip.file("termo-acervo.pdf", pdf);
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i]!;
    const { data: blob } = await admin.storage.from("documentos").download(d.caminho);
    if (!blob) continue; // pula o que falhar; não aborta o pacote
    zip.file(`documentos/${nomeEntradaZip(d.nome, i)}`, Buffer.from(await blob.arrayBuffer()));
  }

  // Anexa o termo ao GED do cliente (trilha da devolução).
  const caminhoTermo = `${clienteId}/${crypto.randomUUID()}-termo-devolucao.pdf`;
  const up = await admin.storage.from("documentos").upload(caminhoTermo, pdf, { contentType: "application/pdf" });
  if (!up.error) {
    await admin.from("documentos").insert({
      cliente_id: clienteId,
      nome: "Termo de devolução de acervo — NBC PG 01",
      tipo: "legalização",
      caminho_storage: caminhoTermo,
      enviado_por: perfil.id,
    });
    revalidatePath(`/clientes/${clienteId}`);
  }

  const buf = zip.generate({ type: "nodebuffer" }) as Buffer;
  const nomeCli = (cli.razao_social as string).replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40) || "cliente";
  return { zipBase64: buf.toString("base64"), nome: `acervo-${nomeCli}.zip` };
}
```

- [ ] **Step 2: Typecheck** — Run: `npm run typecheck` — Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/clientes/[id]/acervo-actions.ts"
git commit -m "feat(rf064): gerarPacoteDevolucao (termo + documentos em ZIP)"
```

---

### Task 3: Seção `DevolucaoAcervo` + wiring na ficha

**Files:**
- Create: `src/components/clientes/DevolucaoAcervo.tsx`
- Modify: `src/app/(app)/clientes/[id]/page.tsx` (renderiza a seção)
- Test: `src/tests/clientes/devolucao-acervo.test.tsx`

**Interfaces:**
- Consumes: `gerarPacoteDevolucao` (T2).

- [ ] **Step 1: Render test (falha)**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/clientes/[id]/acervo-actions", () => ({ gerarPacoteDevolucao: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { DevolucaoAcervo } from "@/components/clientes/DevolucaoAcervo";

describe("DevolucaoAcervo", () => {
  it("mostra o botão de gerar o pacote", () => {
    const html = renderToStaticMarkup(<DevolucaoAcervo clienteId="c1" />);
    expect(html).toContain("Devolução de acervo");
    expect(html).toContain("Gerar pacote");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npx vitest run src/tests/clientes/devolucao-acervo.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implementar `DevolucaoAcervo`**

```tsx
"use client";
import { useState, useTransition } from "react";
import { Botao } from "@/components/ui/Botao";
import { gerarPacoteDevolucao } from "@/app/(app)/clientes/[id]/acervo-actions";

export function DevolucaoAcervo({ clienteId }: { clienteId: string }) {
  const [pend, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function gerar() {
    setErro(null);
    start(async () => {
      const r = await gerarPacoteDevolucao(clienteId);
      if (r.erro || !r.zipBase64 || !r.nome) {
        setErro(r.erro ?? "Falha ao gerar o pacote.");
        return;
      }
      const bytes = Uint8Array.from(atob(r.zipBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nome;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <section className="space-y-2 rounded-lg border border-linha bg-white p-4">
      <h3 className="text-sm font-semibold text-grafite">Devolução de acervo</h3>
      <p className="text-xs text-cinza">
        Gera um pacote (ZIP) com o Termo de acervo (NBC PG 01) e os documentos do cliente, para a entrega na
        rescisão do contrato.
      </p>
      <Botao type="button" variante="secundario" disabled={pend} onClick={gerar}>
        {pend ? "Gerando..." : "Gerar pacote de devolução (rescisão)"}
      </Botao>
      {erro && (
        <p role="alert" className="text-sm text-negativo">
          {erro}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npx vitest run src/tests/clientes/devolucao-acervo.test.tsx` — Expected: PASS.

- [ ] **Step 5: Wiring na ficha** — em `src/app/(app)/clientes/[id]/page.tsx`, importar `DevolucaoAcervo` e renderizá-la na aba cadastro (após `FlagsFiscaisSection`), com o mesmo gate:

```tsx
{podeCriarCliente(papel) && <DevolucaoAcervo clienteId={id} />}
```

- [ ] **Step 6: Verificar** — Run: `npm run typecheck && npx vitest run src/tests/clientes/ src/tests/ui/divida-ui.test.ts` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/clientes/DevolucaoAcervo.tsx "src/app/(app)/clientes/[id]/page.tsx" src/tests/clientes/devolucao-acervo.test.tsx
git commit -m "feat(rf064): secao Devolucao de acervo na ficha do cliente"
```

---

### Task 4: Release

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm test && npm run format && npm run build` — tudo verde.
- [ ] **Step 2:** bump de versão (minor) + CHANGELOG (mesmo PR).
- [ ] **Step 3:** **sem migration** — nada a aplicar no banco.
- [ ] **Step 4:** REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch (PR, merge, Implantar, `/api/health`, tag).

---

## Self-Review

- **Cobertura da spec:** termo com as duas listas (T1), `nomeEntradaZip` (T1), `gerarPacoteDevolucao` (termo + docs atuais + ZIP + anexa o termo + guarda de teto) (T2), seção na ficha com download (T3), release sem migration (T4). Fora de escopo respeitado (sem disparo automático, sem assinatura, sem expurgo).
- **Placeholders:** nenhum passo de código sem código; as edições em `termo.ts`/`page.tsx` indicam a inserção exata.
- **Consistência de tipos:** `DadosTermo.arquivos` (T1) consumido por `gerarPacoteDevolucao` (T2); `nomeEntradaZip` (T1) usado no ZIP (T2); `agruparVersoes` reusa a assinatura `{ id, substitui_id }`; `gerarPacoteDevolucao` retorna `{ zipBase64, nome, erro }` consumido pelo `DevolucaoAcervo` (T3).
