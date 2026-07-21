# RF-080 Fatia B — API de leitura Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Endpoints `GET /api/v1` de leitura dos 4 recursos (clientes, títulos/boletos, obrigações, documentos), com envelope/paginação padronizados, serializadores que escondem colunas internas e rate limit por chave.

**Architecture:** Cada rota passa por `protegerRota(req, escopo, fn)` (autentica via Fatia A + rate limit + captura de erro), lê com `service_role`, aplica filtros/paginação e serializa. Libs puras (`http`, `rate-limit`, `serializar`) concentram a lógica testável.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (service_role), Vitest.

## Global Constraints

- Alias `@/*` → `./src/*`. **Fatia B** de 5 (spec `docs/superpowers/specs/2026-07-21-api-publica-webhooks-design.md`); reusa `autenticarApiKey` da Fatia A.
- **Sem migration.** Rate limit é **em memória por instância** (o deploy é 1 container/escritório) — sem Redis, sem write por request.
- Envelope de lista: `{ dados: [...], paginacao: { limit, offset, total } }`; item: `{ dados: {...} }`; erro: `{ erro: { codigo, mensagem } }`. Paginação `limit` (default 50, máx 200) + `offset`.
- **Serializadores escondem colunas internas** (nunca expor `caminho_storage`, `texto_extraido`, `dominio_snapshot`, `criado_por`, `responsavel_id`, `socios`/`representante` PII, etc.).
- `numeric` vira `Number()`; `date` fica string `YYYY-MM-DD`; `timestamptz` fica string ISO — sem conversão.
- Rodar `npm run lint/typecheck/test/format` antes de commitar; `git add -A` **depois** do `format`.

---

### Task 1: Lib `http.ts` (envelope + paginação) + testes

**Files:**
- Create: `src/lib/api/http.ts`
- Test: `src/tests/api/http.test.ts`

**Interfaces:**
- Produces: `normalizarPaginacao(rawLimit, rawOffset): { limit, offset }`; `okJson(dados, paginacao)`; `umJson(dados)`; `erroJson(codigo, mensagem, status, headers?)`.

- [ ] **Step 1: Testes que falham**

```ts
// src/tests/api/http.test.ts
import { describe, it, expect } from "vitest";
import { normalizarPaginacao } from "@/lib/api/http";

describe("normalizarPaginacao", () => {
  it("default 50/0 quando ausente", () => {
    expect(normalizarPaginacao(null, null)).toEqual({ limit: 50, offset: 0 });
  });
  it("respeita valores válidos", () => {
    expect(normalizarPaginacao("30", "60")).toEqual({ limit: 30, offset: 60 });
  });
  it("limita o limit a 200", () => {
    expect(normalizarPaginacao("9999", "0").limit).toBe(200);
  });
  it("valores inválidos/negativos caem no default", () => {
    expect(normalizarPaginacao("abc", "-5")).toEqual({ limit: 50, offset: 0 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/api/http.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
// src/lib/api/http.ts
import { NextResponse } from "next/server";

export function normalizarPaginacao(
  rawLimit: string | null,
  rawOffset: string | null,
): { limit: number; offset: number } {
  const l = Number(rawLimit);
  const o = Number(rawOffset);
  const limit = Number.isFinite(l) && l > 0 ? Math.min(Math.floor(l), 200) : 50;
  const offset = Number.isFinite(o) && o > 0 ? Math.floor(o) : 0;
  return { limit, offset };
}

export function okJson(dados: unknown[], paginacao: { limit: number; offset: number; total: number }): NextResponse {
  return NextResponse.json({ dados, paginacao });
}

export function umJson(dados: unknown): NextResponse {
  return NextResponse.json({ dados });
}

export function erroJson(
  codigo: string,
  mensagem: string,
  status: number,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json({ erro: { codigo, mensagem } }, { status, headers });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/api/http.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): lib http da API (envelope + paginação) + testes"
```

---

### Task 2: Lib `rate-limit.ts` + testes

**Files:**
- Create: `src/lib/api/rate-limit.ts`
- Test: `src/tests/api/rate-limit.test.ts`

**Interfaces:**
- Produces: `type EstadoRate = { janelaInicio: number; contador: number }`; `decidirRate(estado, agora, limite, janelaMs): { permitido, estado, restanteMs }`; `verificarRate(apiKeyId): { permitido, restanteMs }`.

- [ ] **Step 1: Testes que falham**

```ts
// src/tests/api/rate-limit.test.ts
import { describe, it, expect } from "vitest";
import { decidirRate } from "@/lib/api/rate-limit";

describe("decidirRate", () => {
  it("primeira chamada abre a janela com contador 1", () => {
    const r = decidirRate(undefined, 1000, 3, 60000);
    expect(r.permitido).toBe(true);
    expect(r.estado).toEqual({ janelaInicio: 1000, contador: 1 });
  });
  it("incrementa dentro da janela abaixo do limite", () => {
    const r = decidirRate({ janelaInicio: 1000, contador: 1 }, 1500, 3, 60000);
    expect(r.permitido).toBe(true);
    expect(r.estado.contador).toBe(2);
  });
  it("bloqueia ao atingir o limite", () => {
    const r = decidirRate({ janelaInicio: 1000, contador: 3 }, 1500, 3, 60000);
    expect(r.permitido).toBe(false);
    expect(r.restanteMs).toBe(59500);
  });
  it("reinicia a janela quando ela expira", () => {
    const r = decidirRate({ janelaInicio: 1000, contador: 3 }, 62000, 3, 60000);
    expect(r.permitido).toBe(true);
    expect(r.estado).toEqual({ janelaInicio: 62000, contador: 1 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/api/rate-limit.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/lib/api/rate-limit.ts
export type EstadoRate = { janelaInicio: number; contador: number };

// Janela fixa: decisão pura, testável. O chamador persiste o `estado`.
export function decidirRate(
  estado: EstadoRate | undefined,
  agora: number,
  limite: number,
  janelaMs: number,
): { permitido: boolean; estado: EstadoRate; restanteMs: number } {
  if (!estado || agora - estado.janelaInicio >= janelaMs) {
    return { permitido: true, estado: { janelaInicio: agora, contador: 1 }, restanteMs: 0 };
  }
  if (estado.contador >= limite) {
    return { permitido: false, estado, restanteMs: janelaMs - (agora - estado.janelaInicio) };
  }
  return { permitido: true, estado: { ...estado, contador: estado.contador + 1 }, restanteMs: 0 };
}

const LIMITE = 120;
const JANELA_MS = 60000;
// Em memória: o deploy é 1 container por escritório. Reinício zera os contadores (aceitável).
const mapa = new Map<string, EstadoRate>();

export function verificarRate(apiKeyId: string): { permitido: boolean; restanteMs: number } {
  const r = decidirRate(mapa.get(apiKeyId), Date.now(), LIMITE, JANELA_MS);
  mapa.set(apiKeyId, r.estado);
  return { permitido: r.permitido, restanteMs: r.restanteMs };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/api/rate-limit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): rate limit em memória (janela fixa) + testes"
```

---

### Task 3: Serializadores + `protegerRota` + testes

**Files:**
- Create: `src/lib/api/serializar.ts`
- Create: `src/lib/api/rota.ts`
- Test: `src/tests/api/serializar.test.ts`

**Interfaces:**
- Produces: constantes `COLS_CLIENTE/COLS_TITULO/COLS_BOLETO/COLS_OBRIGACAO/COLS_DOCUMENTO`; `serializarCliente/Titulo/Boleto/Obrigacao/Documento(row)`; `protegerRota(req, escopo, fn)`.

- [ ] **Step 1: Testes que falham**

```ts
// src/tests/api/serializar.test.ts
import { describe, it, expect } from "vitest";
import {
  serializarCliente,
  serializarTitulo,
  serializarBoleto,
  serializarObrigacao,
  serializarDocumento,
} from "@/lib/api/serializar";

describe("serializarCliente", () => {
  it("expõe identidade/fiscal e esconde colunas internas", () => {
    const dto = serializarCliente({
      id: "c1",
      razao_social: "ACME",
      cpf_cnpj: "11222333000181",
      status: "ativo",
      flag_tem_folha: true,
      contador_id: "u1",
      dominio_snapshot: { x: 1 },
      socios: [{ cpf: "x" }],
      criado_por: "u9",
    });
    expect(dto.razao_social).toBe("ACME");
    expect(dto.flags.tem_folha).toBe(true);
    expect(dto).not.toHaveProperty("contador_id");
    expect(dto).not.toHaveProperty("dominio_snapshot");
    expect(dto).not.toHaveProperty("socios");
    expect(dto).not.toHaveProperty("criado_por");
  });
});

describe("serializarTitulo", () => {
  it("valor vira number e recebido soma baixas não estornadas", () => {
    const dto = serializarTitulo({
      id: "t1",
      cliente_id: "c1",
      tipo: "RECEBER",
      valor: "100.00",
      competencia: "2026-07-01",
      vencimento: "2026-07-10",
      status: "ABERTO",
      baixa: [
        { valor_recebido: "40.00", estornada: false },
        { valor_recebido: "10.00", estornada: true },
      ],
    });
    expect(dto.valor).toBe(100);
    expect(dto.recebido).toBe(40);
    expect(dto).not.toHaveProperty("criado_por");
  });
});

describe("serializarBoleto", () => {
  it("valor vira number e esconde provedor/pdf_path", () => {
    const dto = serializarBoleto({
      id: "b1",
      titulo_id: "t1",
      valor: "50.00",
      status: "emitido",
      provedor: "inter",
      pdf_path: "x/y.pdf",
    });
    expect(dto.valor).toBe(50);
    expect(dto).not.toHaveProperty("provedor");
    expect(dto).not.toHaveProperty("pdf_path");
  });
});

describe("serializarObrigacao", () => {
  it("deriva status entregue e traz o nome via join", () => {
    const dto = serializarObrigacao({
      id: "o1",
      cliente_id: "c1",
      competencia: "2026-06-01",
      status: "pendente",
      entregue_em: "2026-07-05",
      obrigacao: { nome: "DAS", codigo: "DAS", esfera: "federal" },
      responsavel_id: "u1",
    });
    expect(dto.status).toBe("entregue");
    expect(dto.obrigacao.nome).toBe("DAS");
    expect(dto).not.toHaveProperty("responsavel_id");
  });
  it("sem entregue_em mantém o status do enum", () => {
    const dto = serializarObrigacao({ id: "o2", status: "pendente", entregue_em: null, obrigacao: { nome: "X" } });
    expect(dto.status).toBe("pendente");
  });
});

describe("serializarDocumento", () => {
  it("esconde caminho_storage e texto_extraido", () => {
    const dto = serializarDocumento({
      id: "d1",
      cliente_id: "c1",
      nome: "guia.pdf",
      caminho_storage: "c1/x.pdf",
      texto_extraido: "conteudo",
      texto_status: "ok",
    });
    expect(dto.nome).toBe("guia.pdf");
    expect(dto).not.toHaveProperty("caminho_storage");
    expect(dto).not.toHaveProperty("texto_extraido");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/api/serializar.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar serializadores**

```ts
// src/lib/api/serializar.ts
type Row = Record<string, unknown>;
const nOuNull = (v: unknown) => (v == null ? null : Number(v));
const umDoJoin = <T>(v: unknown): T | null => {
  const j = v as T | T[] | null;
  return Array.isArray(j) ? (j[0] ?? null) : (j ?? null);
};

export const COLS_CLIENTE =
  "id, tipo_pessoa, razao_social, nome_fantasia, cpf_cnpj, regime_tributario, inscricao_estadual, inscricao_municipal, email, telefone, telefone_ddi, endereco, cnae, porte, status, situacao_cadastral, optante_simples, flag_tem_folha, flag_contribui_icms, flag_contribui_iss, data_inicio, criado_em, atualizado_em";

export function serializarCliente(r: Row) {
  return {
    id: r.id,
    tipo_pessoa: r.tipo_pessoa,
    razao_social: r.razao_social,
    nome_fantasia: r.nome_fantasia ?? null,
    cpf_cnpj: r.cpf_cnpj ?? null,
    regime_tributario: r.regime_tributario,
    inscricao_estadual: r.inscricao_estadual ?? null,
    inscricao_municipal: r.inscricao_municipal ?? null,
    email: r.email ?? null,
    telefone: r.telefone ?? null,
    telefone_ddi: r.telefone_ddi ?? null,
    endereco: r.endereco ?? null,
    cnae: r.cnae ?? null,
    porte: r.porte ?? null,
    status: r.status,
    situacao_cadastral: r.situacao_cadastral ?? null,
    optante_simples: r.optante_simples ?? null,
    flags: {
      tem_folha: r.flag_tem_folha ?? null,
      contribui_icms: r.flag_contribui_icms ?? null,
      contribui_iss: r.flag_contribui_iss ?? null,
    },
    data_inicio: r.data_inicio ?? null,
    criado_em: r.criado_em,
    atualizado_em: r.atualizado_em,
  };
}

export const COLS_TITULO =
  "id, cliente_id, tipo, origem, descricao, valor, competencia, vencimento, status, criado_em, baixa(valor_recebido, estornada)";

export function serializarTitulo(r: Row) {
  const baixas = (Array.isArray(r.baixa) ? r.baixa : []) as { valor_recebido: unknown; estornada: unknown }[];
  const recebido = baixas.filter((b) => !b.estornada).reduce((s, b) => s + Number(b.valor_recebido), 0);
  return {
    id: r.id,
    cliente_id: r.cliente_id ?? null,
    tipo: r.tipo,
    origem: r.origem,
    descricao: r.descricao ?? null,
    valor: nOuNull(r.valor),
    recebido,
    competencia: r.competencia,
    vencimento: r.vencimento,
    status: r.status,
    criado_em: r.criado_em,
  };
}

export const COLS_BOLETO =
  "id, titulo_id, numero, nosso_numero, linha_digitavel, pix_copia_cola, url_pdf, valor, vencimento, status, criado_em";

export function serializarBoleto(r: Row) {
  return {
    id: r.id,
    titulo_id: r.titulo_id,
    numero: r.numero ?? null,
    nosso_numero: r.nosso_numero ?? null,
    linha_digitavel: r.linha_digitavel ?? null,
    pix_copia_cola: r.pix_copia_cola ?? null,
    url_pdf: r.url_pdf ?? null,
    valor: nOuNull(r.valor),
    vencimento: r.vencimento,
    status: r.status,
    criado_em: r.criado_em,
  };
}

export const COLS_OBRIGACAO =
  "id, cliente_id, competencia, vencimento_legal, vencimento_interno, status, entregue_em, criado_em, obrigacao(nome, codigo, esfera)";

export function serializarObrigacao(r: Row) {
  const o = umDoJoin<{ nome?: string; codigo?: string; esfera?: string }>(r.obrigacao);
  return {
    id: r.id,
    cliente_id: r.cliente_id ?? null,
    obrigacao: { nome: o?.nome ?? null, codigo: o?.codigo ?? null, esfera: o?.esfera ?? null },
    competencia: r.competencia,
    vencimento_legal: r.vencimento_legal ?? null,
    vencimento_interno: r.vencimento_interno ?? null,
    // "entregue" é derivado: não existe no enum (só pendente/dispensada).
    status: r.entregue_em ? "entregue" : r.status,
    entregue_em: r.entregue_em ?? null,
    criado_em: r.criado_em,
  };
}

export const COLS_DOCUMENTO =
  "id, cliente_id, nome, tipo, departamento, competencia, origem, enviado_em, substitui_id";

export function serializarDocumento(r: Row) {
  return {
    id: r.id,
    cliente_id: r.cliente_id,
    nome: r.nome,
    tipo: r.tipo ?? null,
    departamento: r.departamento ?? null,
    competencia: r.competencia ?? null,
    origem: r.origem ?? null,
    enviado_em: r.enviado_em,
    substitui_id: r.substitui_id ?? null,
  };
}
```

- [ ] **Step 4: Implementar `protegerRota`**

```ts
// src/lib/api/rota.ts
import { autenticarApiKey, type AutenticacaoApi } from "./auth";
import { verificarRate } from "./rate-limit";
import { erroJson } from "./http";

// Envelope de toda rota /api/v1: autentica (Fatia A) + rate limit + captura de erro.
export async function protegerRota(
  req: Request,
  escopo: string,
  fn: (auth: AutenticacaoApi) => Promise<Response>,
): Promise<Response> {
  const a = await autenticarApiKey(req, escopo);
  if (!a.auth) return erroJson("nao_autorizado", a.erro ?? "Não autorizado.", a.status ?? 401);
  const rl = verificarRate(a.auth.id);
  if (!rl.permitido) {
    return erroJson("rate_limit", "Muitas requisições — tente em instantes.", 429, {
      "Retry-After": String(Math.ceil(rl.restanteMs / 1000)),
    });
  }
  try {
    return await fn(a.auth);
  } catch (e) {
    console.error("API v1:", e instanceof Error ? e.message : e);
    return erroJson("erro_interno", "Erro ao processar a requisição.", 500);
  }
}
```

- [ ] **Step 5: Rodar testes, tipos e lint**

Run: `npx vitest run src/tests/api/serializar.test.ts && npm run typecheck && npm run lint`
Expected: testes passam; sem erros.

- [ ] **Step 6: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): serializadores dos recursos + protegerRota + testes"
```

---

### Task 4: Rotas de clientes

**Files:**
- Create: `src/app/api/v1/clientes/route.ts`
- Create: `src/app/api/v1/clientes/[id]/route.ts`

- [ ] **Step 1: Lista**

```ts
// src/app/api/v1/clientes/route.ts
import { protegerRota } from "@/lib/api/rota";
import { normalizarPaginacao, okJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serializarCliente, COLS_CLIENTE } from "@/lib/api/serializar";

export function GET(req: Request) {
  return protegerRota(req, "clientes:read", async () => {
    const url = new URL(req.url);
    const { limit, offset } = normalizarPaginacao(url.searchParams.get("limit"), url.searchParams.get("offset"));
    const admin = createAdminSupabase();
    let q = admin
      .from("clientes")
      .select(COLS_CLIENTE, { count: "exact" })
      .is("excluido_em", null)
      .order("razao_social")
      .range(offset, offset + limit - 1);
    const cpf = url.searchParams.get("cpf_cnpj");
    const status = url.searchParams.get("status");
    if (cpf) q = q.eq("cpf_cnpj", cpf.replace(/\D/g, ""));
    if (status) q = q.eq("status", status);
    const { data, count } = await q;
    return okJson((data ?? []).map(serializarCliente), { limit, offset, total: count ?? 0 });
  });
}
```

- [ ] **Step 2: Por id**

```ts
// src/app/api/v1/clientes/[id]/route.ts
import { protegerRota } from "@/lib/api/rota";
import { umJson, erroJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serializarCliente, COLS_CLIENTE } from "@/lib/api/serializar";

export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return protegerRota(req, "clientes:read", async () => {
    const { id } = await ctx.params;
    const admin = createAdminSupabase();
    const { data } = await admin.from("clientes").select(COLS_CLIENTE).eq("id", id).is("excluido_em", null).maybeSingle();
    if (!data) return erroJson("nao_encontrado", "Cliente não encontrado.", 404);
    return umJson(serializarCliente(data));
  });
}
```

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): GET /api/v1/clientes (lista + por id)"
```

---

### Task 5: Rotas de títulos e boletos

**Files:**
- Create: `src/app/api/v1/titulos/route.ts`
- Create: `src/app/api/v1/titulos/[id]/route.ts`
- Create: `src/app/api/v1/boletos/route.ts`

- [ ] **Step 1: Lista de títulos**

```ts
// src/app/api/v1/titulos/route.ts
import { protegerRota } from "@/lib/api/rota";
import { normalizarPaginacao, okJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serializarTitulo, COLS_TITULO } from "@/lib/api/serializar";

export function GET(req: Request) {
  return protegerRota(req, "titulos:read", async () => {
    const url = new URL(req.url);
    const { limit, offset } = normalizarPaginacao(url.searchParams.get("limit"), url.searchParams.get("offset"));
    const admin = createAdminSupabase();
    let q = admin
      .from("titulo")
      .select(COLS_TITULO, { count: "exact" })
      .order("vencimento", { ascending: false })
      .range(offset, offset + limit - 1);
    const clienteId = url.searchParams.get("cliente_id");
    const status = url.searchParams.get("status");
    const competencia = url.searchParams.get("competencia");
    const tipo = url.searchParams.get("tipo");
    if (clienteId) q = q.eq("cliente_id", clienteId);
    if (status) q = q.eq("status", status);
    if (competencia) q = q.eq("competencia", competencia);
    if (tipo) q = q.eq("tipo", tipo);
    const { data, count } = await q;
    return okJson((data ?? []).map(serializarTitulo), { limit, offset, total: count ?? 0 });
  });
}
```

- [ ] **Step 2: Título por id**

```ts
// src/app/api/v1/titulos/[id]/route.ts
import { protegerRota } from "@/lib/api/rota";
import { umJson, erroJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serializarTitulo, COLS_TITULO } from "@/lib/api/serializar";

export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return protegerRota(req, "titulos:read", async () => {
    const { id } = await ctx.params;
    const admin = createAdminSupabase();
    const { data } = await admin.from("titulo").select(COLS_TITULO).eq("id", id).maybeSingle();
    if (!data) return erroJson("nao_encontrado", "Título não encontrado.", 404);
    return umJson(serializarTitulo(data));
  });
}
```

- [ ] **Step 3: Lista de boletos**

```ts
// src/app/api/v1/boletos/route.ts
import { protegerRota } from "@/lib/api/rota";
import { normalizarPaginacao, okJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serializarBoleto, COLS_BOLETO } from "@/lib/api/serializar";

export function GET(req: Request) {
  return protegerRota(req, "titulos:read", async () => {
    const url = new URL(req.url);
    const { limit, offset } = normalizarPaginacao(url.searchParams.get("limit"), url.searchParams.get("offset"));
    const admin = createAdminSupabase();
    let q = admin
      .from("boleto")
      .select(COLS_BOLETO, { count: "exact" })
      .order("vencimento", { ascending: false })
      .range(offset, offset + limit - 1);
    const tituloId = url.searchParams.get("titulo_id");
    const status = url.searchParams.get("status");
    if (tituloId) q = q.eq("titulo_id", tituloId);
    if (status) q = q.eq("status", status);
    const { data, count } = await q;
    return okJson((data ?? []).map(serializarBoleto), { limit, offset, total: count ?? 0 });
  });
}
```

- [ ] **Step 4: Verificar**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): GET /api/v1/titulos e /boletos"
```

---

### Task 6: Rota de obrigações

**Files:**
- Create: `src/app/api/v1/obrigacoes/route.ts`
- Create: `src/app/api/v1/obrigacoes/[id]/route.ts`

- [ ] **Step 1: Lista**

```ts
// src/app/api/v1/obrigacoes/route.ts
import { protegerRota } from "@/lib/api/rota";
import { normalizarPaginacao, okJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serializarObrigacao, COLS_OBRIGACAO } from "@/lib/api/serializar";

export function GET(req: Request) {
  return protegerRota(req, "obrigacoes:read", async () => {
    const url = new URL(req.url);
    const { limit, offset } = normalizarPaginacao(url.searchParams.get("limit"), url.searchParams.get("offset"));
    const admin = createAdminSupabase();
    let q = admin
      .from("obrigacao_instancia")
      .select(COLS_OBRIGACAO, { count: "exact" })
      .order("vencimento_legal", { ascending: false })
      .range(offset, offset + limit - 1);
    const clienteId = url.searchParams.get("cliente_id");
    const competencia = url.searchParams.get("competencia");
    const entregue = url.searchParams.get("entregue"); // "true" | "false"
    if (clienteId) q = q.eq("cliente_id", clienteId);
    if (competencia) q = q.eq("competencia", competencia);
    if (entregue === "true") q = q.not("entregue_em", "is", null);
    if (entregue === "false") q = q.is("entregue_em", null);
    const { data, count } = await q;
    return okJson((data ?? []).map(serializarObrigacao), { limit, offset, total: count ?? 0 });
  });
}
```

- [ ] **Step 2: Por id**

```ts
// src/app/api/v1/obrigacoes/[id]/route.ts
import { protegerRota } from "@/lib/api/rota";
import { umJson, erroJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serializarObrigacao, COLS_OBRIGACAO } from "@/lib/api/serializar";

export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return protegerRota(req, "obrigacoes:read", async () => {
    const { id } = await ctx.params;
    const admin = createAdminSupabase();
    const { data } = await admin.from("obrigacao_instancia").select(COLS_OBRIGACAO).eq("id", id).maybeSingle();
    if (!data) return erroJson("nao_encontrado", "Obrigação não encontrada.", 404);
    return umJson(serializarObrigacao(data));
  });
}
```

- [ ] **Step 3: Verificar + commit**

Run: `npm run typecheck && npm run lint`
```bash
npm run format
git add -A
git commit -m "feat(rf080): GET /api/v1/obrigacoes (lista + por id)"
```

---

### Task 7: Rota de documentos + fechamento

**Files:**
- Create: `src/app/api/v1/documentos/route.ts`

- [ ] **Step 1: Lista (metadados)**

```ts
// src/app/api/v1/documentos/route.ts
import { protegerRota } from "@/lib/api/rota";
import { normalizarPaginacao, okJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serializarDocumento, COLS_DOCUMENTO } from "@/lib/api/serializar";

export function GET(req: Request) {
  return protegerRota(req, "documentos:read", async () => {
    const url = new URL(req.url);
    const { limit, offset } = normalizarPaginacao(url.searchParams.get("limit"), url.searchParams.get("offset"));
    const admin = createAdminSupabase();
    let q = admin
      .from("documentos")
      .select(COLS_DOCUMENTO, { count: "exact" })
      .order("enviado_em", { ascending: false })
      .range(offset, offset + limit - 1);
    const clienteId = url.searchParams.get("cliente_id");
    const tipo = url.searchParams.get("tipo");
    const competencia = url.searchParams.get("competencia");
    if (clienteId) q = q.eq("cliente_id", clienteId);
    if (tipo) q = q.eq("tipo", tipo);
    if (competencia) q = q.eq("competencia", competencia);
    const { data, count } = await q;
    return okJson((data ?? []).map(serializarDocumento), { limit, offset, total: count ?? 0 });
  });
}
```

- [ ] **Step 2: Suite completa + build**

Run: `npm test && npm run build`
Expected: todos os testes passam (incl. `api/*`); build lista `/api/v1/clientes`, `/api/v1/titulos`, `/api/v1/boletos`, `/api/v1/obrigacoes`, `/api/v1/documentos`.

- [ ] **Step 3: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): GET /api/v1/documentos (metadados)"
```

> **Release da Fatia B:** bump minor + CHANGELOG, PR, `verify` verde, **sem migration**, Implantar, confirmar `/api/health`, tag, sync develop. Fumaça: `curl -H "Authorization: Bearer <chave clientes:read>" ".../api/v1/clientes?limit=5"`.

---

## Self-Review

- **Cobertura (Fatia B da spec):** envelope/paginação (Task 1); rate limit por chave (Task 2); serializadores que escondem internos + `protegerRota` (Task 3); rotas clientes (4), títulos+boletos (5), obrigações (6), documentos (7). Cada rota checa o escopo (`<recurso>:read`).
- **Placeholders:** nenhum — todo passo traz código completo.
- **Consistência:** `protegerRota`/`normalizarPaginacao`/`okJson`/`umJson`/`erroJson` e os serializadores/COLS_* definidos nas Tasks 1–3 são consumidos por todas as rotas 4–7 com as mesmas assinaturas. `autenticarApiKey` vem da Fatia A.
- **Segurança:** colunas internas e PII (socios/representante/dominio_snapshot/caminho_storage/texto_extraido) nunca entram nos DTOs (testado); rate limit por chave com `Retry-After`; erros não vazam stack.
- **Escopo respeitado:** só leitura — escrita (C), webhooks (D) e docs (E) são as próximas fatias.
