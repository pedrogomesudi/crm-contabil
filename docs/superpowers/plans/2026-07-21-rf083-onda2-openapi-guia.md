# RF-083 Onda 2 — OpenAPI enriquecido + guia Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enriquecer o OpenAPI com `components.schemas` dos recursos + `content`/schema em respostas e request bodies (hoje `type:object` genérico), e publicar um guia de integração (`docs/INTEGRACAO.md` + seção de webhooks no `/docs`).

**Architecture:** Schemas hand-authored espelhando os serializadores (`src/lib/api/serializar.ts`); `documentoOpenApi()` passa a referenciá-los por `$ref`. Guia em markdown + seção HTML na página `/docs`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest.

## Global Constraints

- Alias `@/*` → `./src/*`. **Onda 2** de 2 do RF-083 (spec `docs/superpowers/specs/2026-07-21-automacao-integracao-design.md`).
- **Sem migration.** `documentoOpenApi()` permanece lib pura e testável.
- Os schemas espelham exatamente a saída dos serializadores da Fatia B (mesmos campos).
- Rodar `npm run lint/typecheck/test/format`; `git add -A` **depois** do `format`.

---

### Task 1: `components.schemas` + `content` no OpenAPI

**Files:**
- Modify: `src/lib/api/openapi.ts`
- Modify: `src/tests/api/openapi.test.ts`

**Interfaces:**
- `EndpointDoc` ganha `recurso?: "Cliente"|"Titulo"|"Boleto"|"Obrigacao"|"Documento"`, `lista?: boolean`, `bodySchema?: string`.

- [ ] **Step 1: Adicionar os schemas**

Em `src/lib/api/openapi.ts`, acrescentar (antes de `documentoOpenApi`):

```ts
const nul = (t: string) => ({ type: [t, "null"] });
const SCHEMAS: Record<string, unknown> = {
  Paginacao: {
    type: "object",
    properties: { limit: { type: "integer" }, offset: { type: "integer" }, total: { type: "integer" } },
  },
  Erro: {
    type: "object",
    properties: {
      erro: { type: "object", properties: { codigo: { type: "string" }, mensagem: { type: "string" } } },
    },
  },
  Cliente: {
    type: "object",
    properties: {
      id: { type: "string" },
      tipo_pessoa: { type: "string" },
      razao_social: { type: "string" },
      nome_fantasia: nul("string"),
      cpf_cnpj: nul("string"),
      regime_tributario: { type: "string" },
      inscricao_estadual: nul("string"),
      inscricao_municipal: nul("string"),
      email: nul("string"),
      telefone: nul("string"),
      telefone_ddi: nul("string"),
      endereco: nul("object"),
      cnae: nul("string"),
      porte: nul("string"),
      status: { type: "string" },
      situacao_cadastral: nul("string"),
      optante_simples: nul("boolean"),
      flags: {
        type: "object",
        properties: { tem_folha: nul("boolean"), contribui_icms: nul("boolean"), contribui_iss: nul("boolean") },
      },
      data_inicio: nul("string"),
      criado_em: { type: "string" },
      atualizado_em: { type: "string" },
    },
  },
  Titulo: {
    type: "object",
    properties: {
      id: { type: "string" },
      cliente_id: nul("string"),
      tipo: { type: "string" },
      origem: { type: "string" },
      descricao: nul("string"),
      valor: nul("number"),
      recebido: { type: "number" },
      competencia: { type: "string" },
      vencimento: { type: "string" },
      status: { type: "string" },
      criado_em: { type: "string" },
    },
  },
  Boleto: {
    type: "object",
    properties: {
      id: { type: "string" },
      titulo_id: { type: "string" },
      numero: nul("integer"),
      nosso_numero: nul("string"),
      linha_digitavel: nul("string"),
      pix_copia_cola: nul("string"),
      url_pdf: nul("string"),
      valor: nul("number"),
      vencimento: { type: "string" },
      status: { type: "string" },
      criado_em: { type: "string" },
    },
  },
  Obrigacao: {
    type: "object",
    properties: {
      id: { type: "string" },
      cliente_id: nul("string"),
      obrigacao: {
        type: "object",
        properties: { nome: nul("string"), codigo: nul("string"), esfera: nul("string") },
      },
      competencia: { type: "string" },
      vencimento_legal: nul("string"),
      vencimento_interno: nul("string"),
      status: { type: "string" },
      entregue_em: nul("string"),
      criado_em: { type: "string" },
    },
  },
  Documento: {
    type: "object",
    properties: {
      id: { type: "string" },
      cliente_id: { type: "string" },
      nome: { type: "string" },
      tipo: nul("string"),
      departamento: nul("string"),
      competencia: nul("string"),
      origem: nul("string"),
      enviado_em: { type: "string" },
      substitui_id: nul("string"),
    },
  },
  ClienteInput: {
    type: "object",
    required: ["tipo_pessoa", "razao_social", "cpf_cnpj", "regime_tributario"],
    properties: {
      tipo_pessoa: { type: "string", enum: ["PJ", "PF", "MEI"] },
      razao_social: { type: "string" },
      cpf_cnpj: { type: "string" },
      regime_tributario: { type: "string" },
      email: { type: "string" },
      telefone: { type: "string" },
      endereco: { type: "object" },
      atualizado_em: { type: "string", description: "Obrigatório no PATCH (controle de concorrência)." },
    },
  },
  TituloInput: {
    type: "object",
    required: ["clienteId", "valor", "vencimento", "categoriaId"],
    properties: {
      clienteId: { type: "string" },
      valor: { type: "number" },
      vencimento: { type: "string" },
      categoriaId: { type: "string" },
      descricao: { type: "string" },
    },
  },
  BaixaInput: {
    type: "object",
    required: ["valorRecebido", "dataRecebimento", "contaBancariaId", "formaPagamento"],
    properties: {
      valorRecebido: { type: "number" },
      dataRecebimento: { type: "string" },
      juros: { type: "number" },
      multa: { type: "number" },
      desconto: { type: "number" },
      contaBancariaId: { type: "string" },
      formaPagamento: { type: "string" },
    },
  },
};

const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
const respLista = (r: string) => ({
  type: "object",
  properties: { dados: { type: "array", items: ref(r) }, paginacao: ref("Paginacao") },
});
const respItem = (r: string) => ({ type: "object", properties: { dados: ref(r) } });
```

- [ ] **Step 2: Anotar os endpoints com recurso/lista/bodySchema**

No tipo `EndpointDoc`, adicionar:

```ts
  recurso?: "Cliente" | "Titulo" | "Boleto" | "Obrigacao" | "Documento";
  lista?: boolean;
  bodySchema?: string;
```

E anotar as entradas de `ENDPOINTS` (adicionar as chaves; as demais entradas seguem sem):
- `GET /clientes` → `recurso: "Cliente", lista: true`; `POST /clientes` → `recurso: "Cliente", bodySchema: "ClienteInput"`; `GET /clientes/{id}` → `recurso: "Cliente"`; `PATCH /clientes/{id}` → `recurso: "Cliente", bodySchema: "ClienteInput"`.
- `GET /titulos` → `recurso: "Titulo", lista: true`; `POST /titulos` → `recurso: "Titulo", bodySchema: "TituloInput"`; `GET /titulos/{id}` → `recurso: "Titulo"`; `POST /titulos/{id}/baixa` → `bodySchema: "BaixaInput"`.
- `GET /boletos` → `recurso: "Boleto", lista: true`.
- `GET /obrigacoes` → `recurso: "Obrigacao", lista: true`; `GET /obrigacoes/{id}` → `recurso: "Obrigacao"`; `PATCH /obrigacoes/{id}` → (multipart, sem bodySchema JSON).
- `GET /documentos` → `recurso: "Documento", lista: true`.

- [ ] **Step 3: Usar os schemas na montagem**

Em `documentoOpenApi`, trocar o bloco de `responses` e `requestBody` por:

```ts
    const resp200 = e.recurso
      ? { description: "OK", content: { "application/json": { schema: e.lista ? respLista(e.recurso) : respItem(e.recurso) } } }
      : { description: "OK" };
    const op: Record<string, unknown> = {
      summary: e.resumo,
      security: [{ apiKey: [] }],
      parameters: (e.params ?? []).map((p) => ({
        name: p.nome,
        in: p.em,
        required: p.em === "path",
        schema: { type: "string" },
        description: p.descricao,
      })),
      responses: {
        "200": resp200,
        "401": { description: "API key ausente ou inválida.", content: { "application/json": { schema: ref("Erro") } } },
        ...(e.escopo
          ? { "403": { description: `Escopo necessário: ${e.escopo}.`, content: { "application/json": { schema: ref("Erro") } } } }
          : {}),
      },
    };
    if (e.escopo) op["x-escopo"] = e.escopo;
    if (e.multipart) op["requestBody"] = { content: { "multipart/form-data": { schema: { type: "object" } } } };
    else if (e.bodySchema)
      op["requestBody"] = { content: { "application/json": { schema: ref(e.bodySchema) } } };
```

E no objeto retornado, incluir os schemas em `components`:

```ts
    components: {
      securitySchemes: {
        apiKey: { type: "http", scheme: "bearer", description: "API key gerada em Configurações → API pública." },
      },
      schemas: SCHEMAS,
    },
```

- [ ] **Step 4: Atualizar os testes**

Acrescentar a `src/tests/api/openapi.test.ts`:

```ts
  it("expõe components.schemas dos recursos", () => {
    const d = documentoOpenApi() as { components: { schemas: Record<string, unknown> } };
    expect(d.components.schemas).toHaveProperty("Cliente");
    expect(d.components.schemas).toHaveProperty("Titulo");
  });
  it("a lista de clientes referencia o schema Cliente no 200", () => {
    const d = documentoOpenApi() as { paths: Record<string, Record<string, { responses: Record<string, { content?: Record<string, { schema?: unknown }> }> }>> };
    const schema = d.paths["/clientes"].get.responses["200"].content?.["application/json"]?.schema as {
      properties?: { dados?: { items?: { $ref?: string } } };
    };
    expect(schema?.properties?.dados?.items?.$ref).toBe("#/components/schemas/Cliente");
  });
```

- [ ] **Step 5: Rodar testes, tipos e lint**

Run: `npx vitest run src/tests/api/openapi.test.ts && npm run typecheck && npm run lint`
Expected: passa; sem erros.

- [ ] **Step 6: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf083): OpenAPI com components.schemas + content em respostas/bodies"
```

---

### Task 2: Guia de integração + seção de webhooks no `/docs`

**Files:**
- Create: `docs/INTEGRACAO.md`
- Modify: `src/app/docs/page.tsx`

- [ ] **Step 1: Guia em markdown**

```markdown
<!-- docs/INTEGRACAO.md -->
# Guia de integração (API + webhooks)

A API pública do SALDO permite ler e escrever dados e receber eventos por webhook. Serve para
automações no Make, n8n, Zapier ou um sistema próprio.

## 1. Autenticação

Gere uma chave em **Configurações → API pública** (escolha os escopos). Envie em toda requisição:

```
Authorization: Bearer sk_sua_chave
```

Teste com `GET /api/v1/ping` (devolve os escopos da chave) e veja os endpoints em
`GET /api/v1/openapi.json` (importável no Make/Insomnia/Postman) ou em `/docs`.

## 2. Ler e escrever

- Listagens paginam por `limit` (máx 200) e `offset`, no envelope `{ dados: [...], paginacao }`.
- Escrita: `POST /clientes`, `POST /titulos`, `POST /titulos/{id}/baixa`,
  `PATCH /obrigacoes/{id}`, `POST /documentos` (multipart). Erros vêm como
  `{ erro: { codigo, mensagem } }`.
- O `PATCH /clientes/{id}` exige `atualizado_em` (controle de concorrência).

## 3. Webhooks de saída

Cadastre uma URL **https pública** em **Configurações → Webhooks de saída** e escolha os eventos
(veja `GET /api/v1/eventos`): `cliente.criado`, `cliente.atualizado`, `titulo.criado`,
`titulo.pago`, `obrigacao.entregue`, `documento.enviado`.

Cada entrega é um `POST` com corpo:

```json
{ "id": "<uuid da entrega>", "evento": "titulo.pago", "criado_em": "2026-07-21T10:00:00Z", "dados": { } }
```

e headers `X-Webhook-Id`, `X-Webhook-Timestamp`, `X-Webhook-Tentativa` e `X-Assinatura`.

### Verificar a assinatura (HMAC-SHA256)

Compare `X-Assinatura` (`sha256=<hex>`) com o HMAC do **corpo cru** usando o segredo do endpoint:

```js
import { createHmac } from "node:crypto";
const esperado = "sha256=" + createHmac("sha256", SEGREDO).update(corpoCru).digest("hex");
if (esperado !== req.headers["x-assinatura"]) rejeitar();
```

### Deduplicar

Use o `X-Webhook-Id` (= `id` do corpo): reentregas por retry repetem o mesmo id. Ignore ids já
processados.

Use o botão **Enviar teste** na tela de webhooks para validar sua URL e a verificação da assinatura.
```

- [ ] **Step 2: Seção de webhooks no `/docs`**

Em `src/app/docs/page.tsx`, importar `EVENTOS_WEBHOOK` e adicionar, após a tabela de endpoints, uma seção com a lista de eventos, o formato do envelope e a dica de verificação da assinatura:

```tsx
import { EVENTOS_WEBHOOK } from "@/lib/webhooks/sinal";
```

```tsx
      <h2 style={{ marginTop: 32 }}>Webhooks de saída</h2>
      <p>
        Cadastre uma URL https em Configurações → Webhooks. Eventos disponíveis:{" "}
        {EVENTOS_WEBHOOK.map((e) => (
          <code key={e} style={{ marginRight: 8 }}>
            {e}
          </code>
        ))}
        . Cada entrega é um POST com o corpo{" "}
        <code>{`{ id, evento, criado_em, dados }`}</code> e os headers <code>X-Webhook-Id</code>,{" "}
        <code>X-Webhook-Timestamp</code>, <code>X-Webhook-Tentativa</code> e <code>X-Assinatura</code>{" "}
        (HMAC-SHA256 do corpo cru). Deduplique pelo <code>X-Webhook-Id</code>. Guia completo em{" "}
        <code>docs/INTEGRACAO.md</code>.
      </p>
```

- [ ] **Step 3: Verificar + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: sem erros; `/docs` compila.

- [ ] **Step 4: Commit**

```bash
npm run format
git add -A
git commit -m "docs(rf083): guia de integração + seção de webhooks no /docs"
```

---

### Task 3: Fechamento

- [ ] **Step 1: Suite completa + build + fumaça local do openapi**

Run: `npm test && npm run build`
Expected: todos passam; build ok.

- [ ] **Step 2: Conferir o openapi tem schemas** (opcional, local)

Run: `node -e "const {documentoOpenApi}=require('./src/lib/api/openapi.ts')" 2>/dev/null || echo "checar via teste"`
(o teste da Task 1 já cobre; este passo é só lembrete de que a verificação real é a suíte.)

> **Release Onda 2:** bump minor + CHANGELOG, PR, `verify` verde, **sem migration**, Implantar, health, tag, sync. Com esta onda o **RF-083 fica completo** (no que é versionável no repo). Fumaça: `curl .../api/v1/openapi.json | jq '.components.schemas | keys'` deve listar Cliente/Titulo/... e abrir `/docs`.

---

## Self-Review

- **Cobertura (Onda 2 da spec):** `components.schemas` dos 5 recursos + envelopes + inputs, e `content` em respostas/bodies (Task 1); guia `docs/INTEGRACAO.md` + seção no `/docs` (Task 2).
- **Placeholders:** nenhum — schemas e trechos completos.
- **Fidelidade:** os schemas espelham exatamente os serializadores da Fatia B (mesmos campos, mesmos nulos).
- **Consistência:** `EndpointDoc` estendido e consumido só dentro de `openapi.ts`; `EVENTOS_WEBHOOK` reusado no guia.
- **Fecha o RF-083** no que é versionável; publicar apps de marca nos portais segue fora do repo.
