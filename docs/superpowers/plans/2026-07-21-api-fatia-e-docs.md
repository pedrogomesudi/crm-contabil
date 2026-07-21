# RF-080 Fatia E — Documentação OpenAPI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Servir um documento OpenAPI 3.1 importável em `/api/v1/openapi.json` (Postman/Insomnia/n8n/Zapier) e uma página de referência pública e legível em `/docs`.

**Architecture:** Documento OpenAPI construído em uma função pura (`documentoOpenApi()`) a partir de uma lista declarativa de endpoints; servido por um route handler. Página `/docs` **dependency-free** que renderiza a referência a partir do mesmo objeto — sem viewer de CDN (respeita o CSP `script-src 'self'`).

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest.

## Global Constraints

- Alias `@/*` → `./src/*`. **Fatia E** (última) de 5 (spec `docs/superpowers/specs/2026-07-21-api-publica-webhooks-design.md`).
- **Sem migration. Sem dependência nova.** O viewer é auto-renderizado (o CSP bloqueia CDN e, em prod, `unsafe-eval`; Scalar/Redoc via bundle fica como possível evolução futura).
- `GET /api/v1/openapi.json` e `/docs` são **públicos** (sem API key) — é documentação. `/api/v1/openapi.json` já está fora do matcher do `proxy.ts` (Fatia A). `/docs` mora fora de `(app)`/`(portal)`, então não passa pelo gate de sessão.
- O documento cobre os endpoints das fatias B–C (leitura + escrita) e o esquema de segurança **bearer** (API key com escopos).
- Rodar `npm run lint/typecheck/test/format`; `git add -A` **depois** do `format`.

---

### Task 1: Documento OpenAPI + rota + testes

**Files:**
- Create: `src/lib/api/openapi.ts`
- Create: `src/app/api/v1/openapi.json/route.ts`
- Test: `src/tests/api/openapi.test.ts`

**Interfaces:**
- Produces: `type EndpointDoc = { metodo: string; caminho: string; escopo?: string; resumo: string; params?: { nome: string; em: "query"|"path"; descricao: string }[] }`; `ENDPOINTS: EndpointDoc[]`; `documentoOpenApi(): object`.

- [ ] **Step 1: Testes que falham**

```ts
// src/tests/api/openapi.test.ts
import { describe, it, expect } from "vitest";
import { documentoOpenApi, ENDPOINTS } from "@/lib/api/openapi";

describe("documentoOpenApi", () => {
  const doc = documentoOpenApi() as {
    openapi: string;
    paths: Record<string, Record<string, unknown>>;
    components: { securitySchemes: Record<string, unknown> };
  };
  it("é um OpenAPI 3.1 com esquema de segurança bearer", () => {
    expect(doc.openapi.startsWith("3.1")).toBe(true);
    expect(doc.components.securitySchemes).toHaveProperty("apiKey");
  });
  it("tem um path por endpoint declarado", () => {
    for (const e of ENDPOINTS) {
      expect(doc.paths[e.caminho]?.[e.metodo.toLowerCase()]).toBeTruthy();
    }
  });
  it("inclui clientes (GET+POST) e a baixa de título (POST)", () => {
    expect(doc.paths["/clientes"]).toHaveProperty("get");
    expect(doc.paths["/clientes"]).toHaveProperty("post");
    expect(doc.paths["/titulos/{id}/baixa"]).toHaveProperty("post");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/tests/api/openapi.test.ts` → FAIL.

- [ ] **Step 3: Implementar o documento**

```ts
// src/lib/api/openapi.ts
export type EndpointDoc = {
  metodo: "GET" | "POST" | "PATCH";
  caminho: string;
  escopo?: string;
  resumo: string;
  params?: { nome: string; em: "query" | "path"; descricao: string }[];
  multipart?: boolean;
};

const paginacao = [
  { nome: "limit", em: "query" as const, descricao: "Máximo por página (default 50, máx 200)." },
  { nome: "offset", em: "query" as const, descricao: "Deslocamento para paginação." },
];
const idPath = [{ nome: "id", em: "path" as const, descricao: "UUID do recurso." }];

export const ENDPOINTS: EndpointDoc[] = [
  { metodo: "GET", caminho: "/ping", resumo: "Testa a credencial; devolve os escopos da chave." },
  { metodo: "GET", caminho: "/clientes", escopo: "clientes:read", resumo: "Lista clientes.", params: [...paginacao, { nome: "cpf_cnpj", em: "query", descricao: "Filtra por CNPJ (só dígitos)." }, { nome: "status", em: "query", descricao: "ativo | inativo." }] },
  { metodo: "POST", caminho: "/clientes", escopo: "clientes:write", resumo: "Cria um cliente (corpo = objeto de cliente; endereco opcional)." },
  { metodo: "GET", caminho: "/clientes/{id}", escopo: "clientes:read", resumo: "Detalha um cliente.", params: idPath },
  { metodo: "PATCH", caminho: "/clientes/{id}", escopo: "clientes:write", resumo: "Edita um cliente (exige campo atualizado_em para concorrência).", params: idPath },
  { metodo: "GET", caminho: "/titulos", escopo: "titulos:read", resumo: "Lista títulos.", params: [...paginacao, { nome: "cliente_id", em: "query", descricao: "Filtra por cliente." }, { nome: "status", em: "query", descricao: "ABERTO | BAIXADO | ..." }, { nome: "competencia", em: "query", descricao: "AAAA-MM-DD." }, { nome: "tipo", em: "query", descricao: "RECEBER | PAGAR." }] },
  { metodo: "POST", caminho: "/titulos", escopo: "titulos:write", resumo: "Cria uma cobrança avulsa (clienteId, valor, vencimento, categoriaId, descricao)." },
  { metodo: "GET", caminho: "/titulos/{id}", escopo: "titulos:read", resumo: "Detalha um título.", params: idPath },
  { metodo: "POST", caminho: "/titulos/{id}/baixa", escopo: "titulos:write", resumo: "Registra um recebimento (valorRecebido, dataRecebimento, contaBancariaId, formaPagamento).", params: idPath },
  { metodo: "GET", caminho: "/boletos", escopo: "titulos:read", resumo: "Lista boletos.", params: [...paginacao, { nome: "titulo_id", em: "query", descricao: "Filtra por título." }, { nome: "status", em: "query", descricao: "emitido | pago | cancelado | erro." }] },
  { metodo: "GET", caminho: "/obrigacoes", escopo: "obrigacoes:read", resumo: "Lista obrigações.", params: [...paginacao, { nome: "cliente_id", em: "query", descricao: "Filtra por cliente." }, { nome: "competencia", em: "query", descricao: "AAAA-MM-DD." }, { nome: "entregue", em: "query", descricao: "true | false." }] },
  { metodo: "GET", caminho: "/obrigacoes/{id}", escopo: "obrigacoes:read", resumo: "Detalha uma obrigação.", params: idPath },
  { metodo: "PATCH", caminho: "/obrigacoes/{id}", escopo: "obrigacoes:write", resumo: "Marca a obrigação como entregue (data, observacao; comprovante via multipart).", params: idPath, multipart: true },
  { metodo: "GET", caminho: "/documentos", escopo: "documentos:read", resumo: "Lista documentos (metadados).", params: [...paginacao, { nome: "cliente_id", em: "query", descricao: "Filtra por cliente." }, { nome: "tipo", em: "query", descricao: "Filtra por tipo." }, { nome: "competencia", em: "query", descricao: "AAAA-MM-DD." }] },
  { metodo: "POST", caminho: "/documentos", escopo: "documentos:write", resumo: "Envia um documento (multipart: cliente_id, arquivo, tipo_id?, departamento?, competencia?).", multipart: true },
];

export function documentoOpenApi(): object {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of ENDPOINTS) {
    const op: Record<string, unknown> = {
      summary: e.resumo,
      security: e.escopo ? [{ apiKey: [] }] : [{ apiKey: [] }],
      parameters: (e.params ?? []).map((p) => ({
        name: p.nome,
        in: p.em,
        required: p.em === "path",
        schema: { type: "string" },
        description: p.descricao,
      })),
      responses: {
        "200": { description: "OK" },
        "401": { description: "API key ausente ou inválida." },
        ...(e.escopo ? { "403": { description: `Escopo necessário: ${e.escopo}.` } } : {}),
      },
    };
    if (e.escopo) op["x-escopo"] = e.escopo;
    if (e.multipart) op["requestBody"] = { content: { "multipart/form-data": { schema: { type: "object" } } } };
    else if (e.metodo === "POST" || e.metodo === "PATCH")
      op["requestBody"] = { content: { "application/json": { schema: { type: "object" } } } };
    paths[e.caminho] = { ...(paths[e.caminho] ?? {}), [e.metodo.toLowerCase()]: op };
  }
  return {
    openapi: "3.1.0",
    info: { title: "SALDO API", version: "1", description: "API pública do SALDO. Autentique com Authorization: Bearer <api_key>." },
    servers: [{ url: "/api/v1" }],
    components: {
      securitySchemes: { apiKey: { type: "http", scheme: "bearer", description: "API key gerada em Configurações → API pública." } },
    },
    security: [{ apiKey: [] }],
    paths,
  };
}
```

- [ ] **Step 4: Rota**

```ts
// src/app/api/v1/openapi.json/route.ts
import { NextResponse } from "next/server";
import { documentoOpenApi } from "@/lib/api/openapi";

export function GET() {
  return NextResponse.json(documentoOpenApi());
}
```

- [ ] **Step 5: Passar** — `npx vitest run src/tests/api/openapi.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): documento OpenAPI + GET /api/v1/openapi.json + testes"
```

---

### Task 2: Página de referência pública `/docs`

**Files:**
- Create: `src/app/docs/page.tsx`
- Modify: `src/app/(app)/configuracoes/api/page.tsx` (link para a doc)

- [ ] **Step 1: Página**

Página pública (fora de `(app)`/`(portal)`), server component, sem auth. Renderiza a referência a partir de `ENDPOINTS` (dependency-free; nenhum script de terceiros → respeita o CSP).

```tsx
// src/app/docs/page.tsx
import { ENDPOINTS } from "@/lib/api/openapi";

export const metadata = { title: "SALDO API — Documentação" };

export default function DocsPage() {
  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
      <h1>SALDO API</h1>
      <p>
        API pública em <code>/api/v1</code>. Autentique com o header{" "}
        <code>Authorization: Bearer &lt;api_key&gt;</code> (chaves em Configurações → API pública). Especificação
        importável em <a href="/api/v1/openapi.json">/api/v1/openapi.json</a>.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginTop: 24 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
            <th style={{ padding: "8px 6px" }}>Método</th>
            <th style={{ padding: "8px 6px" }}>Caminho</th>
            <th style={{ padding: "8px 6px" }}>Escopo</th>
            <th style={{ padding: "8px 6px" }}>Descrição</th>
          </tr>
        </thead>
        <tbody>
          {ENDPOINTS.map((e) => (
            <tr key={`${e.metodo} ${e.caminho}`} style={{ borderBottom: "1px solid #eee", verticalAlign: "top" }}>
              <td style={{ padding: "8px 6px", fontWeight: 600 }}>{e.metodo}</td>
              <td style={{ padding: "8px 6px", fontFamily: "ui-monospace, monospace" }}>/api/v1{e.caminho}</td>
              <td style={{ padding: "8px 6px", color: "#666" }}>{e.escopo ?? "—"}</td>
              <td style={{ padding: "8px 6px" }}>
                {e.resumo}
                {e.params && e.params.length > 0 && (
                  <div style={{ color: "#888", fontSize: 12, marginTop: 4 }}>
                    {e.params.map((p) => `${p.nome} (${p.em})`).join(", ")}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 2: Link a partir da tela de chaves**

Em `src/app/(app)/configuracoes/api/page.tsx`, no subtítulo do `PageHeader`, mencionar a doc (ou adicionar um parágrafo com `<a href="/docs">`), para o admin achar a referência. Exemplo mínimo — trocar o subtítulo:

```tsx
      <PageHeader
        titulo="API pública"
        subtitulo="Chaves de acesso para integrações externas (/api/v1). Documentação em /docs."
      />
```

- [ ] **Step 3: Verificar + suite + build**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: sem erros; build lista `/docs` e `/api/v1/openapi.json`.

- [ ] **Step 4: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): página pública de referência /docs + link na tela de chaves"
```

> **Release da Fatia E:** bump minor + CHANGELOG, PR, `verify` verde, **sem migration**, Implantar, health, tag, sync. Com esta fatia o **RF-080 fica completo** (A–E). Fumaça: `curl https://app.seusaldo.ai/api/v1/openapi.json` (público, 200) e abrir `/docs`.

---

## Self-Review

- **Cobertura (Fatia E da spec):** `openapi.json` gerado dos endpoints declarados + esquema de segurança bearer (Task 1); página de referência pública (Task 2). Ambos públicos e CSP-safe.
- **Desvio consciente vs spec:** a spec previa um viewer bundlado (Scalar/Redoc); dado o CSP (`script-src 'self'`, sem `unsafe-eval` em prod) e para não adicionar dependência pesada, a doc é **auto-renderizada** — o `openapi.json` (o artefato que importa para automação/RF-083) fica idêntico e importável. Um viewer interativo pode vir depois.
- **Placeholders:** nenhum — todo passo traz código completo.
- **Consistência:** `ENDPOINTS`/`documentoOpenApi` (Task 1) consumidos pela rota e pela página (Task 2); os caminhos e escopos batem com as rotas reais das fatias B–C.
- **Escopo:** fecha o RF-080. `titulo.criado` de mensalidade (SQL) segue deferido da Fatia D.
