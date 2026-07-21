# RF-080 Fatia C — API de escrita Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Endpoints de escrita `POST/PATCH /api/v1` para criar/editar cliente, criar título + baixa, marcar obrigação entregue e enviar documento — cada um reusando o **núcleo** de regra extraído da Server Action correspondente.

**Architecture:** Para cada operação, extrai-se um `xNucleo(input, ctx)` puro-de-sessão (recebe `SupabaseClient` + `autorId`, sem `getPerfilAtual`/`revalidatePath`/`redirect`), no estilo de `gerarInstancias` (`src/lib/obrigacoes/motor.ts:30`). A action passa a: FormData→objeto→núcleo→efeitos de UI. A rota API: `req.json()`/`req.formData()`→schema zod→núcleo→envelope.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (service_role), zod, Vitest.

## Global Constraints

- Alias `@/*` → `./src/*`. **Fatia C** de 5 (spec `docs/superpowers/specs/2026-07-21-api-publica-webhooks-design.md`); reusa `protegerRota`/`autenticarApiKey`/`erroJson`/`umJson` das fatias A–B.
- **Duas ondas de release:** C1 = Tasks 1–4 (cliente, título, baixa) · C2 = Tasks 5–7 (obrigação, documento). Cada onda é um release próprio. Sem migration.
- **Autoria `autorId`:** todas as colunas de autoria são nullable. A action passa `perfil.id`; a API passa `null` (auditoria sem usuário é aceitável no v1). `criado_por` de cliente é forçado por trigger a `auth.uid()` — sob service_role vira `null` (ok).
- **Núcleo nunca contém** `getPerfilAtual`, `revalidatePath`, `redirect`, `formData.get`. Efeitos que a API NÃO dispara: emissão de boleto (título avulso), `update` de oportunidade→"ganho" (cliente).
- **Concorrência otimista** de cliente (`.eq("atualizado_em", esperado)`) é preservada: o PATCH da API exige `atualizado_em`.
- **v1 da API de cliente NÃO grava** `representante`/`campos_custom` (UI-only); passa `null`/`{}`.
- Gate na API = **escopo** (`clientes:write`, `titulos:write`, `obrigacoes:write`, `documentos:write`); a RLS não protege (service_role).
- Multipart: `req.formData()` devolve `File` igual ao da action; limites 10 MB e `["application/pdf","image/png","image/jpeg"]`.
- Comportamento das actions permanece idêntico (testes existentes verdes). Rodar `npm run lint/typecheck/test/format`; `git add -A` **depois** do `format`.

---

## ONDA C1 — cliente + título + baixa

### Task 1: Schemas zod de escrita + testes

**Files:**
- Create: `src/lib/validation/api-escrita.ts`
- Test: `src/tests/validation/api-escrita.test.ts`

**Interfaces:**
- Produces: `tituloAvulsoSchema`, `baixaSchema`, `documentoMetaSchema`, `obrigacaoBaixaSchema` (+ tipos inferidos).

- [ ] **Step 1: Testes que falham**

```ts
// src/tests/validation/api-escrita.test.ts
import { describe, it, expect } from "vitest";
import { tituloAvulsoSchema, baixaSchema } from "@/lib/validation/api-escrita";

describe("tituloAvulsoSchema", () => {
  it("aceita payload válido", () => {
    const r = tituloAvulsoSchema.safeParse({
      clienteId: "11111111-1111-1111-1111-111111111111",
      valor: 100,
      vencimento: "2026-08-10",
      categoriaId: "22222222-2222-2222-2222-222222222222",
      descricao: "Serviço avulso",
    });
    expect(r.success).toBe(true);
  });
  it("rejeita valor não positivo e data inválida", () => {
    expect(tituloAvulsoSchema.safeParse({ clienteId: "x", valor: 0, vencimento: "10/08" }).success).toBe(false);
  });
});

describe("baixaSchema", () => {
  it("aplica defaults de juros/multa/desconto", () => {
    const r = baixaSchema.safeParse({
      tituloId: "11111111-1111-1111-1111-111111111111",
      valorRecebido: 50,
      dataRecebimento: "2026-08-01",
      contaBancariaId: "33333333-3333-3333-3333-333333333333",
      formaPagamento: "pix",
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.juros).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/tests/validation/api-escrita.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/lib/validation/api-escrita.ts
import { z } from "zod";

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve ser YYYY-MM-DD");

export const tituloAvulsoSchema = z.object({
  clienteId: z.uuid("clienteId inválido"),
  valor: z.number().positive("valor deve ser > 0"),
  vencimento: dataIso,
  categoriaId: z.uuid("categoriaId inválido"),
  descricao: z.string().trim().max(300).optional().default(""),
});
export type TituloAvulsoInput = z.infer<typeof tituloAvulsoSchema>;

export const baixaSchema = z.object({
  tituloId: z.uuid(),
  valorRecebido: z.number().positive(),
  dataRecebimento: dataIso,
  juros: z.number().min(0).optional().default(0),
  multa: z.number().min(0).optional().default(0),
  desconto: z.number().min(0).optional().default(0),
  contaBancariaId: z.uuid(),
  formaPagamento: z.string().min(1),
});
export type BaixaApiInput = z.infer<typeof baixaSchema>;

export const documentoMetaSchema = z.object({
  tipoId: z.uuid().optional(),
  departamento: z.string().trim().optional(),
  competencia: z.string().trim().optional(),
  tipo: z.string().trim().max(60).optional(),
});

export const obrigacaoBaixaSchema = z.object({
  data: dataIso.optional(),
  observacao: z.string().trim().max(2000).optional(),
});
```

- [ ] **Step 4: Passar** — `npx vitest run src/tests/validation/api-escrita.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): schemas zod de escrita da API + testes"
```

---

### Task 2: Cliente — núcleo `gravar.ts` + refactor da action + rotas

**Files:**
- Create: `src/lib/clientes/gravar.ts`
- Modify: `src/app/(app)/clientes/actions.ts` (delegar ao núcleo)
- Create: `src/app/api/v1/clientes/route.ts` (adicionar `POST`)
- Create: `src/app/api/v1/clientes/[id]/route.ts` (adicionar `PATCH`)

**Interfaces:**
- Produces: `type ClienteEscrita = { dados: ClienteInput; endereco: Record<string,string>|null; representante: Record<string,string>|null; camposCustom: Record<string,unknown> }`; `criarClienteNucleo(input, ctx)`; `atualizarClienteNucleo(id, input & { atualizadoEmEsperado }, ctx)` onde `ctx = { db, autorId }`.

- [ ] **Step 1: Escrever o núcleo**

```ts
// src/lib/clientes/gravar.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClienteInput } from "@/lib/validation/cliente";
import { ehColaboradorValido } from "@/lib/clientes/colaboradores";
import { ehContadorValido } from "@/lib/clientes/contadores";

export type CtxEscrita = { db: SupabaseClient; autorId: string | null };
export type ClienteEscrita = {
  dados: ClienteInput;
  endereco: Record<string, string> | null;
  representante: Record<string, string> | null;
  camposCustom: Record<string, unknown>;
};
type Dup = { id: string; status: string | null; razao_social: string | null };
export type ResultadoCriar =
  | { ok: true; id: string }
  | { ok: false; codigo: "contador_invalido" | "duplicado" | "erro"; erro: string; duplicado?: Dup };
export type ResultadoAtualizar =
  | { ok: true }
  | { ok: false; codigo: "contador_invalido" | "conflito" | "duplicado" | "erro"; erro: string };

const limparVazios = (d: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) out[k] = v === "" || v === undefined ? null : v;
  return out;
};

export async function criarClienteNucleo(input: ClienteEscrita, ctx: CtxEscrita): Promise<ResultadoCriar> {
  if (input.dados.contador_id && !(await ehContadorValido(input.dados.contador_id))) {
    return { ok: false, codigo: "contador_invalido", erro: "Contador selecionado é inválido." };
  }
  const payload = limparVazios({ ...input.dados });
  delete payload.status; // DB default 'ativo'
  const { data, error } = await ctx.db
    .from("clientes")
    .insert({
      ...payload,
      endereco: input.endereco,
      representante: input.representante,
      campos_custom: input.camposCustom,
    })
    .select("id, status, razao_social");
  if (error) {
    if (error.code === "23505") {
      const { data: ex } = await ctx.db
        .from("clientes")
        .select("id, status, razao_social")
        .eq("cpf_cnpj", input.dados.cpf_cnpj)
        .maybeSingle();
      return {
        ok: false,
        codigo: "duplicado",
        erro: "CPF/CNPJ já cadastrado.",
        duplicado: ex
          ? { id: ex.id as string, status: (ex.status as string) ?? null, razao_social: (ex.razao_social as string) ?? null }
          : undefined,
      };
    }
    return { ok: false, codigo: "erro", erro: "Não foi possível salvar o cliente." };
  }
  if (!data || data.length === 0) return { ok: false, codigo: "erro", erro: "Não foi possível salvar o cliente." };
  return { ok: true, id: data[0]!.id as string };
}

export async function atualizarClienteNucleo(
  clienteId: string,
  input: ClienteEscrita & { atualizadoEmEsperado: string },
  ctx: CtxEscrita,
): Promise<ResultadoAtualizar> {
  if (!input.atualizadoEmEsperado) return { ok: false, codigo: "conflito", erro: "Recarregue e tente novamente." };
  if (input.dados.contador_id && !(await ehContadorValido(input.dados.contador_id))) {
    return { ok: false, codigo: "contador_invalido", erro: "Contador selecionado é inválido." };
  }
  const { data, error } = await ctx.db
    .from("clientes")
    .update({
      ...limparVazios({ ...input.dados }),
      endereco: input.endereco,
      representante: input.representante,
      campos_custom: input.camposCustom,
    })
    .eq("id", clienteId)
    .eq("atualizado_em", input.atualizadoEmEsperado)
    .select("id");
  if (error) {
    if (error.code === "23505") return { ok: false, codigo: "duplicado", erro: "CPF/CNPJ já cadastrado em outro cliente." };
    return { ok: false, codigo: "erro", erro: "Não foi possível atualizar o cliente." };
  }
  if (!data || data.length === 0) return { ok: false, codigo: "conflito", erro: "Sem permissão ou alterado por outra pessoa. Recarregue." };
  return { ok: true };
}

// eslint: ehColaboradorValido é reexportado só para não quebrar imports existentes se houver.
void ehColaboradorValido;
```

(Se `ehColaboradorValido` não for necessário, remova o import e o `void`.)

- [ ] **Step 2: Refatorar `criarCliente`/`atualizarCliente` para delegar ao núcleo**

Em `src/app/(app)/clientes/actions.ts`, substituir o corpo de insert/update das duas actions por: montar `ClienteEscrita` a partir do FormData (reusando `montarEndereco`/`montarRepresentante`/`lerCamposCustom` já existentes) e chamar o núcleo com `ctx = { db: await createServerSupabase(), autorId: perfil?.id ?? null }`. Mapear o resultado ao `EstadoCliente` preservando `reativarId`/`duplicadoId`:

```ts
// criarCliente — após validar e montar cc:
  const r = await criarClienteNucleo(
    { dados: parsed.data, endereco: montarEndereco(formData), representante: montarRepresentante(formData), camposCustom: cc.valores },
    { db: await createServerSupabase(), autorId: null }, // criado_por é forçado por trigger
  );
  if (!r.ok) {
    if (r.codigo === "duplicado" && r.duplicado) {
      const nome = r.duplicado.razao_social ? ` (${r.duplicado.razao_social})` : "";
      if (r.duplicado.status === "inativo")
        return { erro: `CPF/CNPJ já cadastrado em um cliente INATIVO${nome}.`, reativarId: r.duplicado.id, duplicadoId: r.duplicado.id };
      return { erro: `CPF/CNPJ já cadastrado${nome}.`, duplicadoId: r.duplicado.id };
    }
    return { erro: r.erro };
  }
  const novoId = r.id;
  revalidatePath("/clientes");
  if (oportunidadeId) {
    const supabase = await createServerSupabase();
    await supabase.from("oportunidade").update({ cliente_id: novoId, etapa: "ganho", atualizado_em: new Date().toISOString() }).eq("id", oportunidadeId);
    redirect(`/onboarding/${novoId}`);
  }
  redirect("/clientes?ok=1");
```

```ts
// atualizarCliente — após validar/cc/original:
  const r = await atualizarClienteNucleo(
    clienteId,
    { dados: parsed.data, endereco: montarEndereco(formData), representante: montarRepresentante(formData), camposCustom: cc.valores, atualizadoEmEsperado: original },
    { db: await createServerSupabase(), autorId: null },
  );
  if (!r.ok) return { erro: r.erro };
  revalidatePath(`/clientes/${clienteId}`);
  redirect("/clientes?ok=1");
```

- [ ] **Step 3: Rotas POST/PATCH**

```ts
// src/app/api/v1/clientes/route.ts — ADICIONAR ao arquivo existente (que já tem GET):
import { erroJson, umJson } from "@/lib/api/http";
import { clienteSchema } from "@/lib/validation/cliente";
import { criarClienteNucleo } from "@/lib/clientes/gravar";

export function POST(req: Request) {
  return protegerRota(req, "clientes:write", async () => {
    const body = await req.json().catch(() => null);
    const parsed = clienteSchema.safeParse(body);
    if (!parsed.success) return erroJson("validacao", parsed.error.issues[0]?.message ?? "Payload inválido.", 422);
    const endereco = (body?.endereco && typeof body.endereco === "object" ? body.endereco : null) as Record<string, string> | null;
    const r = await criarClienteNucleo(
      { dados: parsed.data, endereco, representante: null, camposCustom: {} },
      { db: createAdminSupabase(), autorId: null },
    );
    if (!r.ok) return erroJson(r.codigo, r.erro, r.codigo === "duplicado" ? 409 : 400);
    return umJson({ id: r.id });
  });
}
```

```ts
// src/app/api/v1/clientes/[id]/route.ts — ADICIONAR PATCH:
import { erroJson } from "@/lib/api/http";
import { clienteSchema } from "@/lib/validation/cliente";
import { atualizarClienteNucleo } from "@/lib/clientes/gravar";

export function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return protegerRota(req, "clientes:write", async () => {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    const atualizadoEm = String(body?.atualizado_em ?? "");
    if (!atualizadoEm) return erroJson("precondicao", "Envie 'atualizado_em' (controle de concorrência).", 428);
    const parsed = clienteSchema.safeParse(body);
    if (!parsed.success) return erroJson("validacao", parsed.error.issues[0]?.message ?? "Payload inválido.", 422);
    const endereco = (body?.endereco && typeof body.endereco === "object" ? body.endereco : null) as Record<string, string> | null;
    const r = await atualizarClienteNucleo(
      id,
      { dados: parsed.data, endereco, representante: null, camposCustom: {}, atualizadoEmEsperado: atualizadoEm },
      { db: createAdminSupabase(), autorId: null },
    );
    if (!r.ok) return erroJson(r.codigo, r.erro, r.codigo === "conflito" ? 409 : r.codigo === "duplicado" ? 409 : 400);
    return umJson({ ok: true });
  });
}
```

- [ ] **Step 4: Verificar** — `npm run typecheck && npm run lint && npm test` (as actions de cliente têm testes que devem seguir verdes).

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): núcleo gravarCliente + POST/PATCH /api/v1/clientes"
```

---

### Task 3: Título avulso — núcleo + refactor + POST

**Files:**
- Create: `src/lib/financeiro/gravar-titulo.ts`
- Modify: `src/app/(app)/financeiro/contas-a-receber/actions.ts`
- Create: `src/app/api/v1/titulos/route.ts` (adicionar `POST`)

- [ ] **Step 1: Núcleo**

```ts
// src/lib/financeiro/gravar-titulo.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validarCobrancaAvulsa } from "@/lib/financeiro/cobranca-avulsa";

const competenciaDoVencimento = (v: string) => `${v.slice(0, 7)}-01`;

export type TituloAvulsoNucleoInput = {
  clienteId: string;
  valor: number;
  vencimento: string;
  categoriaId: string;
  descricao: string;
};
export async function criarTituloAvulsoNucleo(
  input: TituloAvulsoNucleoInput,
  ctx: { db: SupabaseClient; autorId: string | null },
): Promise<{ ok: true; tituloId: string } | { ok: false; codigo: "validacao" | "duplicado" | "erro"; erro: string }> {
  const v = validarCobrancaAvulsa(input);
  if (!v.ok) return { ok: false, codigo: "validacao", erro: v.erro };
  const { data, error } = await ctx.db
    .from("titulo")
    .insert({
      tipo: "RECEBER",
      origem: "RECEITA_AVULSA",
      status: "ABERTO",
      cliente_id: input.clienteId,
      valor: input.valor,
      vencimento: input.vencimento,
      competencia: competenciaDoVencimento(input.vencimento),
      categoria_id: input.categoriaId,
      descricao: input.descricao.trim() || null,
      criado_por: ctx.autorId,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, codigo: "duplicado", erro: "Já existe cobrança desse tipo nesta competência." };
    return { ok: false, codigo: "erro", erro: "Falha ao criar a cobrança." };
  }
  return { ok: true, tituloId: data.id as string };
}
```

- [ ] **Step 2: Refatorar `criarCobrancaAvulsa`** para chamar o núcleo com `ctx = { db: await createServerSupabase(), autorId: perfil.id }`, mantendo o gate, o `revalidatePath(ROTA)` e a orquestração opcional `emitirBoletoAgora`.

- [ ] **Step 3: Rota POST**

```ts
// src/app/api/v1/titulos/route.ts — ADICIONAR:
import { erroJson, umJson } from "@/lib/api/http";
import { tituloAvulsoSchema } from "@/lib/validation/api-escrita";
import { criarTituloAvulsoNucleo } from "@/lib/financeiro/gravar-titulo";

export function POST(req: Request) {
  return protegerRota(req, "titulos:write", async () => {
    const body = await req.json().catch(() => null);
    const parsed = tituloAvulsoSchema.safeParse(body);
    if (!parsed.success) return erroJson("validacao", parsed.error.issues[0]?.message ?? "Payload inválido.", 422);
    const r = await criarTituloAvulsoNucleo(parsed.data, { db: createAdminSupabase(), autorId: null });
    if (!r.ok) return erroJson(r.codigo, r.erro, r.codigo === "duplicado" ? 409 : 400);
    return umJson({ id: r.tituloId });
  });
}
```

- [ ] **Step 4: Verificar** — `npm run typecheck && npm run lint`.

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): núcleo criarTituloAvulso + POST /api/v1/titulos"
```

---

### Task 4: Baixa de título — núcleo + refactor + POST + fechamento C1

**Files:**
- Create: `src/lib/financeiro/gravar-baixa.ts`
- Modify: `src/app/(app)/financeiro/contas-a-receber/actions.ts`
- Create: `src/app/api/v1/titulos/[id]/baixa/route.ts`

- [ ] **Step 1: Núcleo**

```ts
// src/lib/financeiro/gravar-baixa.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type BaixaNucleoInput = {
  tituloId: string;
  dataRecebimento: string;
  valorRecebido: number;
  juros?: number;
  multa?: number;
  desconto?: number;
  contaBancariaId: string;
  formaPagamento: string;
};
export async function registrarBaixaNucleo(
  input: BaixaNucleoInput,
  ctx: { db: SupabaseClient; autorId: string | null },
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!input.tituloId || !(input.valorRecebido > 0) || !input.contaBancariaId || !input.formaPagamento || !input.dataRecebimento)
    return { ok: false, erro: "Preencha valor, data, conta e forma." };
  // O trigger recalcular_status_titulo atualiza titulo.status a partir das baixas.
  const { error } = await ctx.db.from("baixa").insert({
    titulo_id: input.tituloId,
    data_recebimento: input.dataRecebimento,
    valor_recebido: input.valorRecebido,
    juros: input.juros ?? 0,
    multa: input.multa ?? 0,
    desconto: input.desconto ?? 0,
    conta_bancaria_id: input.contaBancariaId,
    forma_pagamento: input.formaPagamento,
    criado_por: ctx.autorId,
  });
  if (error) return { ok: false, erro: "Falha ao registrar a baixa." };
  return { ok: true };
}
```

- [ ] **Step 2: Refatorar `registrarBaixa`** para ler o FormData, montar `BaixaNucleoInput` e chamar o núcleo com `autorId: perfil.id`, mantendo `gateGerir` e `revalidatePath(ROTA)`.

- [ ] **Step 3: Rota POST**

```ts
// src/app/api/v1/titulos/[id]/baixa/route.ts
import { protegerRota } from "@/lib/api/rota";
import { erroJson, umJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { baixaSchema } from "@/lib/validation/api-escrita";
import { registrarBaixaNucleo } from "@/lib/financeiro/gravar-baixa";

export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return protegerRota(req, "titulos:write", async () => {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    const parsed = baixaSchema.safeParse({ ...body, tituloId: id });
    if (!parsed.success) return erroJson("validacao", parsed.error.issues[0]?.message ?? "Payload inválido.", 422);
    const r = await registrarBaixaNucleo(parsed.data, { db: createAdminSupabase(), autorId: null });
    if (!r.ok) return erroJson("erro", r.erro, 400);
    return umJson({ ok: true });
  });
}
```

- [ ] **Step 4: Suite + build** — `npm run typecheck && npm run lint && npm test && npm run build` (rotas de escrita aparecem no build).

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): núcleo registrarBaixa + POST /api/v1/titulos/:id/baixa"
```

> **Release C1:** bump minor + CHANGELOG, PR, `verify` verde, sem migration, Implantar, health, tag, sync.

---

## ONDA C2 — obrigação entregue + upload de documento

### Task 5: Obrigação entregue — núcleo + refactor + PATCH

**Files:**
- Create: `src/lib/obrigacoes/gravar-baixa.ts`
- Modify: `src/app/(app)/obrigacoes/baixa-actions.ts`
- Create: `src/app/api/v1/obrigacoes/[id]/route.ts` (adicionar `PATCH`)

- [ ] **Step 1: Núcleo** (recebe o comprovante já como bytes; a validação de obrigatoriedade/tipo/tamanho e o upload ficam aqui)

```ts
// src/lib/obrigacoes/gravar-baixa.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX = 10 * 1024 * 1024;
const TIPOS = ["application/pdf", "image/png", "image/jpeg"];
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const nomeSeguro = (n: string) => n.replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^[._]+/, "").slice(0, 100) || "arquivo";

export type BaixaObrigacaoInput = {
  instanciaId: string;
  data?: string;
  observacao?: string | null;
  comprovante?: { bytes: Uint8Array; nome: string; mime: string } | null;
};
export async function darBaixaObrigacaoNucleo(
  input: BaixaObrigacaoInput,
  ctx: { admin: SupabaseClient; autorId: string | null },
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { data: inst } = await ctx.admin
    .from("obrigacao_instancia")
    .select("cliente_id, comprovante_path, obrigacao(comprovante_obrigatorio)")
    .eq("id", input.instanciaId)
    .maybeSingle();
  if (!inst) return { ok: false, erro: "Instância não encontrada." };
  const obr = (Array.isArray(inst.obrigacao) ? inst.obrigacao[0] : inst.obrigacao) as { comprovante_obrigatorio?: boolean } | null;
  const tem = !!input.comprovante && input.comprovante.bytes.byteLength > 0;
  if (obr?.comprovante_obrigatorio && !tem) return { ok: false, erro: "Comprovante obrigatório para esta obrigação." };

  let comprovantePath: string | null = (inst.comprovante_path as string | null) ?? null;
  if (tem && input.comprovante) {
    if (input.comprovante.bytes.byteLength > MAX) return { ok: false, erro: "Arquivo acima de 10 MB." };
    if (!TIPOS.includes(input.comprovante.mime)) return { ok: false, erro: "Tipo não permitido (PDF, PNG ou JPG)." };
    const caminho = `obrigacoes/${inst.cliente_id}/${input.instanciaId}/${crypto.randomUUID()}-${nomeSeguro(input.comprovante.nome)}`;
    const up = await ctx.admin.storage.from("documentos").upload(caminho, input.comprovante.bytes, { contentType: input.comprovante.mime });
    if (up.error) return { ok: false, erro: "Falha no upload." };
    comprovantePath = caminho;
  }
  const { error } = await ctx.admin
    .from("obrigacao_instancia")
    .update({
      status: "pendente",
      entregue_em: input.data || hojeSP(),
      entregue_por: ctx.autorId,
      observacao: input.observacao ?? null,
      comprovante_path: comprovantePath,
    })
    .eq("id", input.instanciaId);
  if (error) {
    if (tem && comprovantePath) await ctx.admin.storage.from("documentos").remove([comprovantePath]);
    return { ok: false, erro: "Falha ao registrar a baixa." };
  }
  return { ok: true };
}
```

- [ ] **Step 2: Refatorar `darBaixa`** (`baixa-actions.ts`) para extrair o `File` do FormData → `{ bytes: new Uint8Array(await file.arrayBuffer()), nome, mime }` e chamar o núcleo com `ctx = { admin: createAdminSupabase(), autorId: perfil.id }`, mantendo `gate()` e os dois `revalidatePath`.

- [ ] **Step 3: Rota PATCH (multipart ou JSON sem comprovante)**

```ts
// src/app/api/v1/obrigacoes/[id]/route.ts — ADICIONAR PATCH:
import { erroJson, umJson } from "@/lib/api/http";
import { obrigacaoBaixaSchema } from "@/lib/validation/api-escrita";
import { darBaixaObrigacaoNucleo } from "@/lib/obrigacoes/gravar-baixa";

export function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return protegerRota(req, "obrigacoes:write", async () => {
    const { id } = await ctx.params;
    const tipo = req.headers.get("content-type") ?? "";
    let campos: { data?: string; observacao?: string } = {};
    let comprovante: { bytes: Uint8Array; nome: string; mime: string } | null = null;
    if (tipo.includes("multipart/form-data")) {
      const fd = await req.formData();
      campos = { data: String(fd.get("data") ?? "") || undefined, observacao: String(fd.get("observacao") ?? "") || undefined };
      const f = fd.get("comprovante");
      if (f instanceof File && f.size > 0)
        comprovante = { bytes: new Uint8Array(await f.arrayBuffer()), nome: f.name, mime: f.type };
    } else {
      campos = (await req.json().catch(() => ({}))) as { data?: string; observacao?: string };
    }
    const parsed = obrigacaoBaixaSchema.safeParse(campos);
    if (!parsed.success) return erroJson("validacao", parsed.error.issues[0]?.message ?? "Payload inválido.", 422);
    const r = await darBaixaObrigacaoNucleo(
      { instanciaId: id, data: parsed.data.data, observacao: parsed.data.observacao ?? null, comprovante },
      { admin: createAdminSupabase(), autorId: null },
    );
    if (!r.ok) return erroJson("erro", r.erro, 400);
    return umJson({ ok: true });
  });
}
```

- [ ] **Step 4: Verificar** — `npm run typecheck && npm run lint && npm test`.

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): núcleo darBaixaObrigacao + PATCH /api/v1/obrigacoes/:id"
```

---

### Task 6: Upload de documento — núcleo + refactor + POST

**Files:**
- Create: `src/lib/documentos/gravar.ts`
- Modify: `src/app/(app)/documentos/actions.ts`
- Create: `src/app/api/v1/documentos/route.ts` (adicionar `POST`)

- [ ] **Step 1: Núcleo** (extrai o corpo de `anexarDocumento`; recebe o arquivo já como `File`/bytes)

```ts
// src/lib/documentos/gravar.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { competenciaParaData } from "@/lib/documentos/taxonomia";
import { carregarTiposAtivos } from "@/app/(app)/configuracoes/tipos-documento/actions";
import { extrairTextoPdf } from "@/lib/documentos/extrair-texto";

const MAX = 10 * 1024 * 1024;
const TIPOS_OK = ["application/pdf", "image/png", "image/jpeg"];
const nomeSeguro = (n: string) => n.replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^[._]+/, "").slice(0, 100) || "arquivo";

async function indexar(admin: SupabaseClient, id: string, mime: string, bytes: Uint8Array) {
  try {
    if (mime !== "application/pdf") {
      await admin.from("documentos").update({ texto_status: "vazio" }).eq("id", id);
      return;
    }
    const { texto, status } = await extrairTextoPdf(bytes);
    await admin.from("documentos").update({ texto_extraido: texto || null, texto_status: status }).eq("id", id);
  } catch {
    await admin.from("documentos").update({ texto_status: "erro" }).eq("id", id);
  }
}

export type DocumentoUploadInput = {
  clienteId: string;
  arquivo: { bytes: Uint8Array; nome: string; mime: string };
  tipoId?: string | null;
  departamentoManual?: string;
  competenciaRaw?: string;
  tipoTextoLivre?: string;
};
export async function anexarDocumentoNucleo(
  input: DocumentoUploadInput,
  ctx: { admin: SupabaseClient; autorId: string | null },
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const { bytes, nome, mime } = input.arquivo;
  if (!bytes.byteLength) return { ok: false, erro: "Arquivo vazio." };
  if (bytes.byteLength > MAX) return { ok: false, erro: "Arquivo acima de 10 MB." };
  if (!TIPOS_OK.includes(mime)) return { ok: false, erro: "Tipo não permitido (PDF, PNG ou JPG)." };

  const caminho = `${input.clienteId}/${crypto.randomUUID()}-${nomeSeguro(nome)}`;
  const up = await ctx.admin.storage.from("documentos").upload(caminho, bytes, { contentType: mime });
  if (up.error) return { ok: false, erro: "Falha no upload do arquivo." };

  const tipoId = input.tipoId || null;
  const tipos = tipoId ? await carregarTiposAtivos() : [];
  const tipoSel = tipoId ? tipos.find((t) => t.id === tipoId) : undefined;
  if (tipoId && !tipoSel) {
    await ctx.admin.storage.from("documentos").remove([caminho]);
    return { ok: false, erro: "Tipo de documento inválido." };
  }
  const departamento = (input.departamentoManual ?? "").trim() || tipoSel?.departamento || null;
  const competencia = competenciaParaData(input.competenciaRaw ?? "");
  const tipoLabel = tipoSel?.nome ?? ((input.tipoTextoLivre ?? "").trim().slice(0, 60) || null);

  const { data: novo, error } = await ctx.admin
    .from("documentos")
    .insert({ cliente_id: input.clienteId, nome, tipo: tipoLabel, tipo_id: tipoId, departamento, competencia, caminho_storage: caminho, enviado_por: ctx.autorId })
    .select("id")
    .single();
  if (error || !novo) {
    await ctx.admin.storage.from("documentos").remove([caminho]);
    return { ok: false, erro: "Falha ao registrar o documento." };
  }
  await indexar(ctx.admin, novo.id as string, mime, bytes);
  return { ok: true, id: novo.id as string };
}
```

- [ ] **Step 2: Refatorar `anexarDocumento`/`anexarNovaVersao`** para chamar `anexarDocumentoNucleo` (extraindo o `File` → bytes), mantendo o gate, a checagem RLS "usuário enxerga o cliente" e o `revalidatePath`. (O helper local `indexarConteudo` pode ser removido em favor do núcleo, ou mantido — decida ao refatorar sem alterar comportamento.)

- [ ] **Step 3: Rota POST (multipart)**

```ts
// src/app/api/v1/documentos/route.ts — ADICIONAR:
import { erroJson, umJson } from "@/lib/api/http";
import { anexarDocumentoNucleo } from "@/lib/documentos/gravar";

export function POST(req: Request) {
  return protegerRota(req, "documentos:write", async () => {
    const tipo = req.headers.get("content-type") ?? "";
    if (!tipo.includes("multipart/form-data")) return erroJson("validacao", "Envie multipart/form-data.", 415);
    const fd = await req.formData();
    const clienteId = String(fd.get("cliente_id") ?? "");
    const f = fd.get("arquivo");
    if (!clienteId) return erroJson("validacao", "cliente_id é obrigatório.", 422);
    if (!(f instanceof File) || f.size === 0) return erroJson("validacao", "arquivo é obrigatório.", 422);
    const r = await anexarDocumentoNucleo(
      {
        clienteId,
        arquivo: { bytes: new Uint8Array(await f.arrayBuffer()), nome: f.name, mime: f.type },
        tipoId: String(fd.get("tipo_id") ?? "") || null,
        departamentoManual: String(fd.get("departamento") ?? ""),
        competenciaRaw: String(fd.get("competencia") ?? ""),
        tipoTextoLivre: String(fd.get("tipo") ?? ""),
      },
      { admin: createAdminSupabase(), autorId: null },
    );
    if (!r.ok) return erroJson("erro", r.erro, 400);
    return umJson({ id: r.id });
  });
}
```

- [ ] **Step 4: Verificar** — `npm run typecheck && npm run lint && npm test`.

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): núcleo anexarDocumento + POST /api/v1/documentos (multipart)"
```

---

### Task 7: Fechamento C2

- [ ] **Step 1: Suite completa + build**

Run: `npm test && npm run build`
Expected: todos os testes passam; build lista `POST`/`PATCH` nas rotas `/api/v1/*`.

- [ ] **Step 2: Fumaça manual documentada** (no PR): exemplos `curl` de POST cliente, POST título, POST baixa, PATCH obrigação, POST documento (multipart) com uma chave `*:write`.

> **Release C2:** bump minor + CHANGELOG, PR, `verify` verde, sem migration, Implantar, health, tag, sync.

---

## Self-Review

- **Cobertura (Fatia C da spec):** schemas (Task 1); cliente criar/editar (2); título avulso (3); baixa (4); obrigação entregue (5); documento upload (6). Cada rota checa `<recurso>:write`.
- **Reuso, não reimplementação:** cada núcleo é extraído da action e a **action passa a chamá-lo** — a validação/regra vive num lugar só. `validarCobrancaAvulsa`/`clienteSchema`/`ehContadorValido` reusados; trigger de status herdado.
- **Placeholders:** as etapas de "refatorar a action" descrevem a substituição exata; os núcleos e rotas trazem código completo.
- **Riscos tratados:** `autorId` nullable (API passa `null`); nenhum `revalidatePath`/`redirect`/`emitirBoleto`/oportunidade dentro do núcleo; concorrência otimista de cliente exposta como `atualizado_em` (428 se ausente); multipart via `req.formData()`.
- **Consistência:** `CtxEscrita`/`autorId` e os schemas de `api-escrita` são consumidos por actions e rotas com as mesmas assinaturas.
- **Escopo respeitado:** só escrita — webhooks (D) e docs (E) são as próximas fatias.
