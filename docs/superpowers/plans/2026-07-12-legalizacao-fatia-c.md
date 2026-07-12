# Legalização — Fatia C (termo NBC PG 01) — Plano

> REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Gerar o Termo de Entrega/Recebimento de Acervo (NBC PG 01) em PDF nos processos de transferência, anexando ao acervo do cliente. Sem migration.

## Global Constraints
- Reusa `converterPdfHtml`/`sanitizarHtml` e a Marca (texto). HTML escapado.
- Antes de commit: `lint && typecheck && test`.

---

### Task 1: Lib termo (TDD)

**Files:** Create `src/lib/legalizacao/termo.ts`, Test `src/tests/legalizacao/termo.test.ts`

- [ ] **Step 1: Teste (falhando)**

```ts
import { describe, it, expect } from "vitest";
import { ACERVO_PADRAO, montarTermoHtml } from "@/lib/legalizacao/termo";

const base = {
  cliente: "Padaria X Ltda",
  marca: { nome: "Contab Y", cnpj: "11.222.333/0001-81", enderecoLinha: "Uberlândia/MG" },
  itens: ["Livros contábeis", "Guias pagas"],
  data: "2026-07-12",
  responsavel: "Ana",
};

describe("ACERVO_PADRAO", () => {
  it("tem itens", () => { expect(ACERVO_PADRAO.length).toBeGreaterThan(3); });
});

describe("montarTermoHtml", () => {
  it("entrada = recebimento; contém cliente, marca e itens", () => {
    const h = montarTermoHtml({ ...base, tipo: "transferencia_entrada" });
    expect(h).toMatch(/Recebimento/i);
    expect(h).toContain("Padaria X Ltda");
    expect(h).toContain("Contab Y");
    expect(h).toContain("Livros contábeis");
  });
  it("saída = entrega", () => {
    expect(montarTermoHtml({ ...base, tipo: "transferencia_saida" })).toMatch(/Entrega/i);
  });
  it("escapa HTML dos itens", () => {
    const h = montarTermoHtml({ ...base, tipo: "transferencia_entrada", itens: ["<script>x</script> & cia"] });
    expect(h).not.toMatch(/<script>x/);
    expect(h).toContain("&amp; cia");
  });
});
```

- [ ] **Step 2:** `npm test -- legalizacao/termo` → FAIL.

- [ ] **Step 3: Implementar `termo.ts`**

```ts
export const ACERVO_PADRAO: string[] = [
  "Livros contábeis (Diário, Razão) e LALUR",
  "Balancetes, balanços e demonstrações",
  "Guias de recolhimento pagas (federais, estaduais e municipais)",
  "Declarações e obrigações acessórias entregues (SPED, DCTFWeb, ECD/ECF)",
  "Notas fiscais de entrada e de saída",
  "Folhas de pagamento e obrigações trabalhistas (eSocial, FGTS)",
  "Contratos sociais e alterações societárias",
  "Certificado digital",
  "Procurações e acessos a portais (e-CAC, prefeitura, etc.)",
  "Extratos e conciliações bancárias",
];

export type DadosTermo = {
  tipo: "transferencia_entrada" | "transferencia_saida";
  cliente: string;
  marca: { nome: string | null; cnpj: string | null; enderecoLinha: string };
  itens: string[];
  data: string; // ISO yyyy-mm-dd
  responsavel: string | null;
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function dataBR(iso: string): string { return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`; }

export function montarTermoHtml(d: DadosTermo): string {
  const entrada = d.tipo === "transferencia_entrada";
  const acao = entrada ? "Recebimento" : "Entrega";
  const verbo = entrada ? "recebido do cliente abaixo identificado, da contabilidade anterior," : "entregue ao cliente abaixo identificado, ou à contabilidade sucessora,";
  const itens = d.itens.filter((i) => i.trim()).map((i) => `<li>${esc(i.trim())}</li>`).join("");
  const marcaLinha = [d.marca.cnpj && `CNPJ ${esc(d.marca.cnpj)}`, esc(d.marca.enderecoLinha)].filter(Boolean).join(" · ");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  body{font-family:-apple-system,system-ui,Arial,sans-serif;color:#111;max-width:720px;margin:32px auto;padding:0 16px;line-height:1.5}
  h1{font-size:18px;text-align:center;margin:0 0 4px}
  .sub{text-align:center;color:#555;font-size:12px;margin-bottom:20px}
  .marca{font-weight:600}
  ul{margin:12px 0 12px 20px}
  .assin{display:flex;gap:40px;margin-top:56px}
  .assin div{flex:1;text-align:center;border-top:1px solid #111;padding-top:6px;font-size:12px}
  .data{margin-top:28px}
</style></head><body>
  <p class="marca">${esc(d.marca.nome ?? "")}</p>
  ${marcaLinha ? `<p style="font-size:12px;color:#555;margin-top:2px">${marcaLinha}</p>` : ""}
  <h1>Termo de ${acao} de Acervo Documental</h1>
  <p class="sub">Em conformidade com a NBC PG 01</p>
  <p>Declaramos, para os devidos fins, que foi ${verbo} referente ao cliente
  <strong>${esc(d.cliente)}</strong>, o acervo documental composto pelos itens a seguir:</p>
  <ul>${itens}</ul>
  <p class="data">Local e data: ______________________, ${dataBR(d.data)}.</p>
  <div class="assin">
    <div>${esc(d.responsavel ?? "")}<br>${esc(d.marca.nome ?? "Escritório")}</div>
    <div>Cliente / Contabilidade ${entrada ? "anterior" : "sucessora"}</div>
  </div>
</body></html>`;
}
```

- [ ] **Step 4:** `npm test -- legalizacao/termo` → PASS. `typecheck && lint`.
- [ ] **Step 5:** commit `feat: termo de acervo NBC PG 01 (HTML + checklist padrão)`

---

### Task 2: Ação gerarTermoAcervo

**Files:** Modify `src/app/(app)/legalizacao/actions.ts`

- [ ] **Step 1:** Adicionar a função (imports: `createAdminSupabase`, `montarTermoHtml`, `sanitizarHtml`, `converterPdfHtml`, `formatarEnderecoLinha`):

```ts
export async function gerarTermoAcervo(processoId: string, input: { itens: string[]; data: string; responsavel: string | null }): Promise<{ pdfBase64?: string; nome?: string; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: proc } = await supabase.from("legalizacao_processo").select("id, cliente_id, tipo").eq("id", processoId).maybeSingle();
  if (!proc) return { erro: "Processo não encontrado." };
  const tipo = proc.tipo as string;
  if (tipo !== "transferencia_entrada" && tipo !== "transferencia_saida") return { erro: "O termo só se aplica a processos de transferência." };
  const { data: cli } = await supabase.from("clientes").select("razao_social").eq("id", proc.cliente_id as string).maybeSingle();
  const { data: cfg } = await supabase.from("escritorio_config").select("nome, cnpj, endereco").eq("id", 1).maybeSingle();

  const html = sanitizarHtml(montarTermoHtml({
    tipo: tipo as "transferencia_entrada" | "transferencia_saida",
    cliente: (cli?.razao_social as string) ?? "—",
    marca: { nome: (cfg?.nome as string | null) ?? null, cnpj: (cfg?.cnpj as string | null) ?? null, enderecoLinha: formatarEnderecoLinha((cfg?.endereco as Record<string, string> | null) ?? null) },
    itens: input.itens,
    data: input.data,
    responsavel: input.responsavel,
  }));
  const pdf = await converterPdfHtml(html);
  if (!pdf) return { erro: "Conversão para PDF indisponível no momento. Tente novamente." };

  // Anexa ao acervo (não aborta o download se falhar).
  const admin = createAdminSupabase();
  const caminho = `${proc.cliente_id}/${crypto.randomUUID()}-termo-acervo.pdf`;
  const up = await admin.storage.from("documentos").upload(caminho, pdf, { contentType: "application/pdf" });
  if (!up.error) {
    const perfil = await getPerfilAtual();
    await admin.from("documentos").insert({ cliente_id: proc.cliente_id, nome: "Termo de acervo — NBC PG 01", tipo: "legalização", caminho_storage: caminho, enviado_por: perfil?.id ?? null });
  }
  revalidatePath(`/clientes/${proc.cliente_id}`);
  return { pdfBase64: pdf.toString("base64"), nome: `termo-acervo-${processoId.slice(0, 8)}.pdf` };
}
```

(imports no topo do arquivo: `import { createAdminSupabase } from "@/lib/supabase/admin";` já existe; adicionar `montarTermoHtml` de `@/lib/legalizacao/termo`, `sanitizarHtml`/`converterPdfHtml` — `converterPdfHtml` de `@/lib/contrato/gerar`, `sanitizarHtml` de `@/lib/comercial/gerar-proposta`, `formatarEnderecoLinha` de `@/lib/comercial/proposta-template`.)

- [ ] **Step 2:** `lint && typecheck`.
- [ ] **Step 3:** commit `feat: ação de gerar termo de acervo (transferência)`

---

### Task 3: Tela no detalhe do processo

**Files:**
- Create `src/app/(app)/legalizacao/[id]/TermoAcervo.tsx`
- Modify `src/app/(app)/legalizacao/[id]/page.tsx`

- [ ] **Step 1: `TermoAcervo.tsx` (client)** — props `processoId`, `hoje`, `responsavelPadrao`. Estado: `data`, `responsavel`, `itens` (textarea pré-preenchida com `ACERVO_PADRAO.join("\n")`). Botão "Gerar termo" → `gerarTermoAcervo(processoId, { itens: itens.split("\n"), data, responsavel: responsavel||null })`; com `pdfBase64`, faz download (Blob) e `router.refresh()`.

- [ ] **Step 2: page.tsx** — se `proc.tipo` começa com `transferencia_`, renderizar `<TermoAcervo processoId={id} hoje={hoje} responsavelPadrao={perfil.nome} />` (acima ou abaixo das etapas). Import de `ACERVO_PADRAO` no componente.

- [ ] **Step 3:** `lint && typecheck && test`.
- [ ] **Step 4:** commit `feat: seção do termo de acervo no processo de transferência`

---

### Task 4: Documentação

- [ ] **Step 1:** `DOCUMENTACAO.md` (Legalização): registrar o **termo de entrega NBC PG 01** — gerado nos processos de transferência, checklist editável do acervo, PDF anexado ao acervo do cliente. Marcar **Fatia C concluída** → legalização (RF-011..014) fechada (salvo RF-013 parcial — aviso sem envio automático).
- [ ] **Step 2:** commit `docs: termo de entrega NBC PG 01 (Fatia C)`

---

## Self-Review
- Lib termo + checklist → T1. ✔
- Ação (só transferência, anexa ao acervo) → T2. ✔
- Tela → T3. ✔
- Docs → T4. ✔
- Sem migration; reusa converterPdfHtml + Marca + anexo documentos.
