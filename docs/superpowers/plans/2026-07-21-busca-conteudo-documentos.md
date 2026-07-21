# RF-061 — Busca no conteúdo de documentos (PDF digital) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair o texto de PDFs digitais (inline no upload + backfill do acervo) e plugar a busca por conteúdo na busca de documentos existente.

**Architecture:** Coluna gerada `tsvector` em `documentos` alimentada por `texto_extraido`; extração com `unpdf` (JS puro) inline no upload; backfill one-shot para o acervo; filtro `.textSearch` na query que já existe. Uma release.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres FTS + Storage + service_role), Tailwind 4, Vitest, `unpdf`.

## Global Constraints

- Alias `@/*` → `./src/*`.
- **Alcance:** só PDF digital. Sem OCR. Imagens/escaneados → `texto_status='vazio'`.
- **Migration** `0124_documentos_conteudo.sql` idempotente (`add column if not exists`, `create index if not exists`), aplicada pelo runner `node --env-file=… scripts/db-migrate.mjs`. `to_tsvector('portuguese', …)` com config constante é IMMUTABLE (permitido em coluna gerada). Sem DB local.
- **Escrita do texto usa service_role** (`createAdminSupabase()`): não há policy de UPDATE em `documentos`. A leitura na busca roda com o cliente de sessão — a RLS `doc_select` já protege.
- **Extração é best-effort:** o upload já sucedeu antes de indexar; nenhuma falha de extração pode alterar o retorno `{ ok }` do upload.
- **Dependência nova:** `unpdf` (JS puro, sem binário). Scripts `.mjs` são JS standalone (fora do `tsc`, cobertos por ESLint) — o backfill importa `unpdf` direto e reescreve a normalização inline.
- Guard `divida-ui`: input escrito à mão usa `controleCls(...)`; sem `←` literal; sem `amber-\d`.
- Rodar `npm run lint`, `npm run typecheck`, `npm test`, `npm run format` antes de commitar; `git add -A` **depois** do `format`.

---

### Task 1: Migration `0124_documentos_conteudo.sql`

**Files:**
- Create: `supabase/migrations/0124_documentos_conteudo.sql`

**Interfaces:**
- Produces: colunas `texto_extraido text`, `texto_status text`, `conteudo tsvector` (gerada) e índice GIN em `documentos`.

- [ ] **Step 1: Escrever a migration**

```sql
-- RF-061: busca no conteúdo de PDFs digitais.
alter table documentos add column if not exists texto_extraido text;
alter table documentos add column if not exists texto_status text; -- null=pendente | 'ok' | 'vazio' | 'erro'
-- Coluna gerada: o app só escreve texto_extraido; o tsvector se deriva sozinho.
-- to_tsvector(regconfig_constante, text) é IMMUTABLE, então pode ser usada em coluna gerada.
alter table documentos
  add column if not exists conteudo tsvector
  generated always as (to_tsvector('portuguese', coalesce(texto_extraido, ''))) stored;
create index if not exists idx_documentos_conteudo on documentos using gin(conteudo);
```

- [ ] **Step 2: Conferência de sanidade (sem DB local)**

Run: `ls supabase/migrations/ | tail -2`
Expected: `0123_nps.sql` como última antes desta (esta é `0124`).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(rf061): migration 0124 (texto_extraido + conteudo tsvector + GIN)"
```

---

### Task 2: Lib de extração `extrair-texto.ts` + testes

**Files:**
- Modify: `package.json` (dependência `unpdf`)
- Create: `src/lib/documentos/extrair-texto.ts`
- Test: `src/tests/documentos/extrair-texto.test.ts`

**Interfaces:**
- Produces: `type ResultadoExtracao = { texto: string; status: "ok" | "vazio" }`; `classificarTexto(bruto: string): ResultadoExtracao`; `extrairTextoPdf(bytes: Uint8Array): Promise<ResultadoExtracao>`.

- [ ] **Step 1: Instalar a dependência**

Run: `npm install unpdf`
Expected: `unpdf` adicionado a `dependencies` no `package.json`.

- [ ] **Step 2: Escrever os testes que falham**

```ts
// src/tests/documentos/extrair-texto.test.ts
import { describe, it, expect } from "vitest";
import { classificarTexto } from "@/lib/documentos/extrair-texto";

describe("classificarTexto", () => {
  it("texto normal vira status ok com espaços colapsados", () => {
    const r = classificarTexto("  Contrato   de\n\nprestação\t de serviços ");
    expect(r.status).toBe("ok");
    expect(r.texto).toBe("Contrato de prestação de serviços");
  });
  it("só espaços/quebras vira vazio (provável digitalização)", () => {
    expect(classificarTexto("   \n\t  ").status).toBe("vazio");
  });
  it("string vazia vira vazio", () => {
    const r = classificarTexto("");
    expect(r.status).toBe("vazio");
    expect(r.texto).toBe("");
  });
  it("preserva o conteúdo ao normalizar", () => {
    expect(classificarTexto("Nota Fiscal 123 — R$ 1.000,00").texto).toBe("Nota Fiscal 123 — R$ 1.000,00");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/tests/documentos/extrair-texto.test.ts`
Expected: FAIL — `Cannot find module '@/lib/documentos/extrair-texto'`.

- [ ] **Step 4: Implementar a lib**

```ts
// src/lib/documentos/extrair-texto.ts
import { extractText, getDocumentProxy } from "unpdf";

export type ResultadoExtracao = { texto: string; status: "ok" | "vazio" };

// Normaliza espaços e decide o status a partir do texto bruto — puro/testável.
export function classificarTexto(bruto: string): ResultadoExtracao {
  const texto = bruto.replace(/\s+/g, " ").trim();
  return texto ? { texto, status: "ok" } : { texto: "", status: "vazio" };
}

// Extrai a camada de texto de um PDF digital. PDF escaneado devolve status 'vazio'.
// Erros do unpdf sobem para o chamador (que grava texto_status='erro').
export async function extrairTextoPdf(bytes: Uint8Array): Promise<ResultadoExtracao> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return classificarTexto(typeof text === "string" ? text : text.join(" "));
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/tests/documentos/extrair-texto.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 6: Verificar tipos e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf061): lib de extração de texto (unpdf) + classificarTexto + testes"
```

---

### Task 3: Indexação no upload

**Files:**
- Modify: `src/app/(app)/documentos/actions.ts`

**Interfaces:**
- Consumes: `extrairTextoPdf` (Task 2); colunas da Task 1.
- Produces: helper interno `indexarConteudo(admin, id, file)`; `anexarDocumento`/`anexarNovaVersao` passam a indexar após o insert.

- [ ] **Step 1: Importar a lib de extração**

No topo de `src/app/(app)/documentos/actions.ts`, adicionar:

```ts
import { extrairTextoPdf } from "@/lib/documentos/extrair-texto";
```

- [ ] **Step 2: Adicionar o helper de indexação**

Adicionar (perto do topo do módulo, após os imports/constantes). `admin` é o tipo devolvido por `createAdminSupabase()`:

```ts
// Indexa o conteúdo do PDF após o upload. Best-effort: o documento já foi gravado, então
// qualquer falha aqui só afeta a busca por conteúdo, nunca o upload. Sem OCR: não-PDF = 'vazio'.
async function indexarConteudo(admin: ReturnType<typeof createAdminSupabase>, id: string, file: File): Promise<void> {
  try {
    if (file.type !== "application/pdf") {
      await admin.from("documentos").update({ texto_status: "vazio" }).eq("id", id);
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { texto, status } = await extrairTextoPdf(bytes);
    await admin.from("documentos").update({ texto_extraido: texto || null, texto_status: status }).eq("id", id);
  } catch (e) {
    console.error("indexarConteudo:", e instanceof Error ? e.message : e);
    await admin.from("documentos").update({ texto_status: "erro" }).eq("id", id);
  }
}
```

- [ ] **Step 3: Ligar em `anexarDocumento`**

Trocar o insert para devolver o id e indexar antes do `revalidatePath`:

```ts
  const { data: novo, error: errInsert } = await admin
    .from("documentos")
    .insert({
      cliente_id: clienteId,
      nome: file.name,
      tipo: tipoLabel,
      tipo_id: tipoId,
      departamento,
      competencia,
      caminho_storage: caminho,
      enviado_por: perfil.id,
    })
    .select("id")
    .single();
  if (errInsert || !novo) {
    // Evita arquivo órfão no Storage se o registro no banco falhar.
    await admin.storage.from("documentos").remove([caminho]);
    console.error("anexarDocumento (insert):", errInsert?.message);
    return { erro: "Falha ao registrar o documento." };
  }

  await indexarConteudo(admin, novo.id, file);
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
```

- [ ] **Step 4: Ligar em `anexarNovaVersao`**

Mesma troca no insert dessa função:

```ts
  const { data: novo, error: errInsert } = await admin
    .from("documentos")
    .insert({
      cliente_id: clienteId,
      nome: file.name,
      tipo: antigo.tipo,
      tipo_id: antigo.tipo_id,
      departamento: antigo.departamento,
      competencia: antigo.competencia,
      caminho_storage: caminho,
      enviado_por: perfil.id,
      substitui_id: documentoAntigoId,
    })
    .select("id")
    .single();
  if (errInsert || !novo) {
    await admin.storage.from("documentos").remove([caminho]);
    console.error("anexarNovaVersao (insert):", errInsert?.message);
    return { erro: "Falha ao registrar a nova versão." };
  }

  await indexarConteudo(admin, novo.id, file);
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
```

- [ ] **Step 5: Verificar tipos e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf061): indexar conteúdo do PDF no upload (best-effort)"
```

---

### Task 4: Script de backfill do acervo

**Files:**
- Create: `scripts/backfill-conteudo.mjs`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (de `.env.*`); bucket `documentos`; colunas da Task 1; `unpdf`.
- Produces: script one-shot que indexa o acervo `.pdf` e marca não-PDF como `vazio`.

- [ ] **Step 1: Escrever o script**

```js
// scripts/backfill-conteudo.mjs
// Reprocessa o acervo: extrai o texto dos PDFs já no Storage e indexa (RF-061).
// One-shot (não é cron). Rode UMA vez:
//   node --env-file=.env.producao.bak scripts/backfill-conteudo.mjs
import { createClient } from "@supabase/supabase-js";
import { extractText, getDocumentProxy } from "unpdf";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY (use --env-file).");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

// Mesma normalização de classificarTexto (script é standalone, fora do bundle TS).
function classificar(bruto) {
  const texto = String(bruto ?? "").replace(/\s+/g, " ").trim();
  return texto ? { texto, status: "ok" } : { texto: "", status: "vazio" };
}

async function main() {
  const resumo = { ok: 0, vazio: 0, erro: 0 };
  // Pendentes que são PDF (pelo sufixo do caminho no Storage).
  const { data: pend, error } = await admin
    .from("documentos")
    .select("id, caminho_storage")
    .is("texto_status", null)
    .ilike("caminho_storage", "%.pdf");
  if (error) {
    console.error("Falha ao listar pendentes:", error.message);
    process.exit(1);
  }
  console.log(`${pend.length} PDF(s) pendente(s).`);

  for (const d of pend) {
    try {
      const dl = await admin.storage.from("documentos").download(d.caminho_storage);
      if (dl.error) throw dl.error;
      const bytes = new Uint8Array(await dl.data.arrayBuffer());
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: true });
      const { texto, status } = classificar(typeof text === "string" ? text : text.join(" "));
      await admin.from("documentos").update({ texto_extraido: texto || null, texto_status: status }).eq("id", d.id);
      resumo[status] += 1;
    } catch (e) {
      console.error(`erro em ${d.id}:`, e instanceof Error ? e.message : e);
      await admin.from("documentos").update({ texto_status: "erro" }).eq("id", d.id);
      resumo.erro += 1;
    }
  }

  // Não-PDF pendentes: sem OCR, ficam como 'vazio' (status completo).
  const { count } = await admin
    .from("documentos")
    .update({ texto_status: "vazio" }, { count: "exact" })
    .is("texto_status", null)
    .not("caminho_storage", "ilike", "%.pdf");
  console.log(`Resumo: ok=${resumo.ok} vazio=${resumo.vazio} erro=${resumo.erro}; não-PDF marcados=${count ?? 0}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Conferir sintaxe e lint**

Run: `node --check scripts/backfill-conteudo.mjs && npm run lint`
Expected: sem erros (o script é coberto por ESLint; roda só em produção, contra dados reais).

- [ ] **Step 3: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf061): script one-shot de backfill do conteúdo do acervo"
```

---

### Task 5: Plugue da busca por conteúdo

**Files:**
- Modify: `src/lib/documentos/busca-metadados.ts` (filtro `conteudo`)
- Modify: `src/app/(app)/documentos/actions.ts` (`buscarDocumentos` + `DocBusca`)
- Modify: `src/app/(app)/documentos/page.tsx` (campo do form)
- Modify: `src/components/documentos/TabelaResultadosBusca.tsx` (indicador `vazio`)

**Interfaces:**
- Consumes: coluna `conteudo`/`texto_status` (Task 1).
- Produces: `FiltroResolvido.conteudo`; `DocBusca.textoStatus`.

- [ ] **Step 1: Adicionar o filtro ao parsing**

Em `src/lib/documentos/busca-metadados.ts`: acrescentar `conteudo?: string;` ao tipo `FiltroResolvido` e, em `lerFiltroBusca`, antes do `return`:

```ts
  const conteudo = (sp.conteudo ?? "").trim().slice(0, 100) || undefined;
```

E incluir `conteudo` no objeto retornado.

- [ ] **Step 2: Plugar na query e expor `textoStatus`**

Em `src/app/(app)/documentos/actions.ts`:

- Acrescentar `textoStatus: string | null;` ao tipo `DocBusca`.
- No `select` de `buscarDocumentos`, adicionar `texto_status`:

```ts
    .select(
      "id, nome, tipo, departamento, competencia, enviado_em, substitui_id, cliente_id, texto_status, clientes(razao_social)",
    )
```

- Adicionar o filtro de conteúdo (após os filtros existentes, antes de `const { data } = await q;`):

```ts
  if (f.conteudo) q = q.textSearch("conteudo", f.conteudo, { type: "websearch", config: "portuguese" });
```

- No `map` das linhas, incluir:

```ts
      textoStatus: (d.texto_status as string | null) ?? null,
```

(`agruparVersoes` preserva o campo: o `rest` de `g.atual` já carrega `textoStatus`.)

- [ ] **Step 3: Adicionar o campo no form**

Em `src/app/(app)/documentos/page.tsx`, dentro do `<form>`, após o input `name="nome"`:

```tsx
        <input
          name="conteudo"
          defaultValue={filtro.conteudo ?? ""}
          placeholder="texto no conteúdo (PDF)"
          className={controleCls("compacto")}
        />
```

- [ ] **Step 4: Indicador de digitalização na tabela**

Em `src/components/documentos/TabelaResultadosBusca.tsx`, na célula do nome:

```tsx
              <td className="p-2 text-texto">
                {d.nome}
                {d.textoStatus === "vazio" && (
                  <span className="block text-xs text-cinza-claro">digitalização — sem texto pesquisável</span>
                )}
              </td>
```

- [ ] **Step 5: Verificar tipos, lint e guards**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 6: Suite completa + build**

Run: `npm test && npm run build`
Expected: todos os testes passam (incl. `extrair-texto.test.ts`); build conclui.

- [ ] **Step 7: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf061): busca por conteúdo no filtro de documentos + indicador de digitalização"
```

> **Release:** bump minor (→ 6.53.0) + CHANGELOG, PR, `verify` verde, aplicar migration `0124` em produção **antes** do deploy, Implantar, confirmar `/api/health`, **rodar o backfill** (`node --env-file=.env.producao.bak scripts/backfill-conteudo.mjs`) após o deploy, tag, sync develop.

---

## Self-Review

- **Cobertura da spec:** migration+índice (Task 1); lib `unpdf` + `classificarTexto` testável (Task 2); indexação inline best-effort no upload, ambas as funções (Task 3); backfill one-shot do acervo (Task 4); filtro `.textSearch` + form + indicador `vazio` (Task 5). Dependência `unpdf` instalada na Task 2.
- **Placeholders:** nenhum — todos os passos trazem o código exato, incluindo os trechos a inserir nos arquivos existentes.
- **Consistência de tipos:** `classificarTexto`/`extrairTextoPdf`/`ResultadoExtracao` definidos na Task 2 e consumidos na Task 3 e (reescritos inline) na Task 4; `FiltroResolvido.conteudo` (Task 5 §1) consumido em `buscarDocumentos` (§2); `DocBusca.textoStatus` (§2) consumido em `TabelaResultadosBusca` (§4). Nomes de coluna (`texto_extraido`, `texto_status`, `conteudo`) idênticos entre migration, upload, backfill e busca.
- **Best-effort garantido:** em `indexarConteudo` o try/catch envolve tudo; o upload já retornou sucesso do insert antes de indexar.
- **Fora de escopo respeitado:** sem OCR, sem snippet/`ts_headline`, sem `unaccent`, sem cron.
