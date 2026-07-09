# Conciliação bancária — Fatia B (Casamento + baixas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Casar as movimentações importadas com o financeiro — marcar baixas conciliadas, criar baixas a partir de títulos, lançar avulsos, e um botão de conciliação automática.

**Architecture:** `baixa.conciliado_em` + origem `RECEITA_AVULSA`; motor puro de casamento (valor exato com sinal, TDD); actions de conciliar/criar/ignorar/reabrir/auto; UI acionável por linha na tela da Fatia A. Spec: `docs/superpowers/specs/2026-07-09-conciliacao-bancaria-fatiaB-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase, Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`.
- Gate: `podeGerenciarFinanceiro` (admin/financeiro).
- Casamento por **valor exato com sinal** (tolerância `< 0.005`); crédito→RECEBER, débito→PAGAR.
- CHECK do título: RECEBER exige `cliente_id`; PAGAR exige `fornecedor_id`. Avulso: crédito=`RECEITA_AVULSA`+cliente, débito=`DESPESA_AVULSA`+fornecedor.
- Baixas criadas pela conciliação: `forma_pagamento='TRANSFERENCIA'`. Reabrir **não apaga** a baixa.
- Migration idempotente; imutável após aplicada; `add value` primeiro e isolado (padrão 0033).
- Branch: `git checkout -b feat/conciliacao-fatiaB develop`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Deploy (pós-merge):** `develop → main → Implantar`; confirmar por histórico verde do EasyPanel (fix interno, sem rota nova).

---

## File Structure

- `supabase/migrations/0065_conciliacao_baixa.sql` — **novo**: enum `RECEITA_AVULSA` + `baixa.conciliado_em`.
- `src/lib/conciliacao/casar.ts` (+ test) — **novo**: motor de casamento.
- `src/app/(app)/financeiro/conciliacao/conciliar-actions.ts` — **novo**: actions.
- `src/app/(app)/financeiro/conciliacao/AcaoMovimento.tsx` — **novo**: ações por linha.
- `src/app/(app)/financeiro/conciliacao/Conciliacao.tsx` — **modificar**: coluna de ação + "Conciliar automáticos".
- `src/app/(app)/financeiro/conciliacao/page.tsx` — **modificar**: passar categorias/clientes/fornecedores.
- Test: `src/tests/conciliacao/acao-render.test.tsx`.

---

## Task 1: Migration — conciliado_em + RECEITA_AVULSA

**Files:**
- Create: `supabase/migrations/0065_conciliacao_baixa.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Conciliação Fatia B: origem de receita avulsa + marcador de conciliação na baixa.
alter type titulo_origem add value if not exists 'RECEITA_AVULSA';
alter table baixa add column if not exists conciliado_em date;
```

- [ ] **Step 2: Aplicar** — `npm run db:migrate` (esperado: `0065_conciliacao_baixa` aplicada, sem erro). ⚠️ Produção; imutável depois.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/0065_conciliacao_baixa.sql
git commit -m "feat(conciliacao): migration conciliado_em + RECEITA_AVULSA

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Motor de casamento (TDD)

**Files:**
- Create: `src/lib/conciliacao/casar.ts`
- Test: `src/tests/conciliacao/casar.test.ts`

**Interfaces:**
- Produces: `valorAssinadoBaixa`, `saldoTitulo`, `candidatosMovimento`, `autoCasar` + tipos `MovPendente`, `BaixaDisp`, `TituloAberto`, `CandBaixa`, `CandTitulo`, `Casamento`.

- [ ] **Step 1: Testes**

```ts
import { describe, it, expect } from "vitest";
import { valorAssinadoBaixa, saldoTitulo, candidatosMovimento, autoCasar, type BaixaDisp, type TituloAberto, type MovPendente } from "@/lib/conciliacao/casar";

describe("valorAssinadoBaixa / saldoTitulo", () => {
  it("assina pela natureza do título", () => {
    expect(valorAssinadoBaixa({ valorRecebido: 300, tipoTitulo: "RECEBER" })).toBe(300);
    expect(valorAssinadoBaixa({ valorRecebido: 89.9, tipoTitulo: "PAGAR" })).toBe(-89.9);
  });
  it("saldo = valor − baixado", () => {
    expect(saldoTitulo({ valor: 300, baixado: 0 })).toBe(300);
    expect(saldoTitulo({ valor: 300, baixado: 100 })).toBe(200);
  });
});

const baixas: BaixaDisp[] = [
  { baixaId: "b1", valorRecebido: 300, tipoTitulo: "RECEBER", data: "2026-08-20", clienteNome: "ACME" },
  { baixaId: "b2", valorRecebido: 89.9, tipoTitulo: "PAGAR", data: "2026-08-05", clienteNome: "" },
];
const titulos: TituloAberto[] = [
  { tituloId: "t1", valor: 500, baixado: 0, tipo: "RECEBER", vencimento: "2026-08-10", descricao: "Consultoria" },
];

describe("candidatosMovimento", () => {
  it("casa baixa por valor assinado (crédito)", () => {
    const r = candidatosMovimento({ id: "m1", valor: 300, data: "2026-08-21" }, baixas, titulos);
    expect(r.baixas.map((b) => b.baixaId)).toEqual(["b1"]);
    expect(r.titulos).toEqual([]);
  });
  it("casa título por saldo e tipo pelo sinal (crédito → RECEBER)", () => {
    const r = candidatosMovimento({ id: "m2", valor: 500, data: "2026-08-11" }, baixas, titulos);
    expect(r.titulos.map((t) => t.tituloId)).toEqual(["t1"]);
  });
  it("débito casa baixa PAGAR", () => {
    const r = candidatosMovimento({ id: "m3", valor: -89.9, data: "2026-08-06" }, baixas, titulos);
    expect(r.baixas.map((b) => b.baixaId)).toEqual(["b2"]);
  });
});

describe("autoCasar", () => {
  it("casa o 1:1 inequívoco", () => {
    const movs: MovPendente[] = [{ id: "m1", valor: 300, data: "2026-08-21" }, { id: "m2", valor: 500, data: "2026-08-11" }];
    const r = autoCasar(movs, baixas, titulos);
    expect(r).toEqual([
      { movimentoId: "m1", alvo: "baixa", alvoId: "b1" },
      { movimentoId: "m2", alvo: "titulo", alvoId: "t1" },
    ]);
  });
  it("não casa quando dois movimentos disputam o mesmo alvo", () => {
    const movs: MovPendente[] = [{ id: "m1", valor: 300, data: "2026-08-21" }, { id: "m1b", valor: 300, data: "2026-08-22" }];
    expect(autoCasar(movs, baixas, titulos)).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- conciliacao/casar` → FAIL.

- [ ] **Step 3: Implementar `casar.ts`**

```ts
export function valorAssinadoBaixa(b: { valorRecebido: number; tipoTitulo: "RECEBER" | "PAGAR" }): number {
  return b.tipoTitulo === "RECEBER" ? b.valorRecebido : -b.valorRecebido;
}
export function saldoTitulo(t: { valor: number; baixado: number }): number {
  return Math.round((t.valor - t.baixado) * 100) / 100;
}

export type MovPendente = { id: string; valor: number; data: string };
export type BaixaDisp = { baixaId: string; valorRecebido: number; tipoTitulo: "RECEBER" | "PAGAR"; data: string; clienteNome: string };
export type TituloAberto = { tituloId: string; valor: number; baixado: number; tipo: "RECEBER" | "PAGAR"; vencimento: string; descricao: string };
export type CandBaixa = { baixaId: string; data: string; clienteNome: string };
export type CandTitulo = { tituloId: string; vencimento: string; descricao: string; tipo: "RECEBER" | "PAGAR"; saldo: number };

const igual = (x: number, y: number) => Math.abs(x - y) < 0.005;
const dist = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));

export function candidatosMovimento(mov: MovPendente, baixas: BaixaDisp[], titulos: TituloAberto[]): { baixas: CandBaixa[]; titulos: CandTitulo[] } {
  const cb = baixas
    .filter((b) => igual(valorAssinadoBaixa(b), mov.valor))
    .sort((a, b) => dist(a.data, mov.data) - dist(b.data, mov.data))
    .map((b) => ({ baixaId: b.baixaId, data: b.data, clienteNome: b.clienteNome }));
  const tipoAlvo = mov.valor > 0 ? "RECEBER" : "PAGAR";
  const ct = titulos
    .filter((t) => t.tipo === tipoAlvo && igual(saldoTitulo(t), Math.abs(mov.valor)))
    .sort((a, b) => dist(a.vencimento, mov.data) - dist(b.vencimento, mov.data))
    .map((t) => ({ tituloId: t.tituloId, vencimento: t.vencimento, descricao: t.descricao, tipo: t.tipo, saldo: saldoTitulo(t) }));
  return { baixas: cb, titulos: ct };
}

export type Casamento = { movimentoId: string; alvo: "baixa" | "titulo"; alvoId: string };
export function autoCasar(movimentos: MovPendente[], baixas: BaixaDisp[], titulos: TituloAberto[]): Casamento[] {
  const prop: Casamento[] = [];
  for (const mov of movimentos) {
    const c = candidatosMovimento(mov, baixas, titulos);
    if (c.baixas.length + c.titulos.length !== 1) continue;
    if (c.baixas.length === 1) prop.push({ movimentoId: mov.id, alvo: "baixa", alvoId: c.baixas[0]!.baixaId });
    else prop.push({ movimentoId: mov.id, alvo: "titulo", alvoId: c.titulos[0]!.tituloId });
  }
  const contagem = new Map<string, number>();
  for (const p of prop) contagem.set(p.alvoId, (contagem.get(p.alvoId) ?? 0) + 1);
  return prop.filter((p) => contagem.get(p.alvoId) === 1);
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- conciliacao/casar` (PASS), `npm run lint`, `npm run typecheck`.

- [ ] **Step 5: Commit**
```bash
git add src/lib/conciliacao/casar.ts src/tests/conciliacao/casar.test.ts
git commit -m "feat(conciliacao): motor de casamento (candidatos + autoCasar) TDD

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Actions de conciliação

**Files:**
- Create: `src/app/(app)/financeiro/conciliacao/conciliar-actions.ts`

**Interfaces:**
- Consumes: motor (Task 2); `podeGerenciarFinanceiro`.
- Produces: `type CandidatosView`, `candidatosDoMovimento`, `conciliarComBaixa`, `conciliarComTitulo`, `criarLancamento`, `ignorarMovimento`, `reabrirMovimento`, `conciliarAutomaticos`, `listarCategoriasLancamento`, `listarClientesLancamento`, `listarFornecedoresLancamento`.

- [ ] **Step 1: Criar `conciliar-actions.ts`**

```ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { candidatosMovimento, autoCasar, type BaixaDisp, type TituloAberto, type MovPendente, type CandBaixa, type CandTitulo } from "@/lib/conciliacao/casar";

export type CandidatosView = { baixas: CandBaixa[]; titulos: CandTitulo[] };

const um = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarFinanceiro(p.papel)) return null;
  return p;
}

async function carregarMovimento(supabase: Awaited<ReturnType<typeof createServerSupabase>>, id: string) {
  const { data } = await supabase.from("movimento_bancario").select("id, conta_bancaria_id, data, valor, status").eq("id", id).maybeSingle();
  return data;
}

// Baixas da conta, não estornadas, com o mesmo |valor| e ainda não vinculadas a um movimento.
async function baixasDisponiveis(supabase: Awaited<ReturnType<typeof createServerSupabase>>, contaId: string, valorAbs: number): Promise<BaixaDisp[]> {
  const { data: linkadas } = await supabase.from("movimento_bancario").select("baixa_id").not("baixa_id", "is", null);
  const usadas = new Set((linkadas ?? []).map((r) => r.baixa_id as string));
  const { data } = await supabase.from("baixa").select("id, valor_recebido, data_recebimento, titulo:titulo_id(tipo, clientes(razao_social))").eq("conta_bancaria_id", contaId).eq("estornada", false).eq("valor_recebido", valorAbs);
  return (data ?? [])
    .filter((b) => !usadas.has(b.id as string))
    .map((b) => {
      const t = um(b.titulo as { tipo?: string; clientes?: unknown } | { tipo?: string; clientes?: unknown }[] | null);
      const cl = um(t?.clientes as { razao_social?: string } | { razao_social?: string }[] | null);
      return { baixaId: b.id as string, valorRecebido: Number(b.valor_recebido), tipoTitulo: (t?.tipo as "RECEBER" | "PAGAR") ?? "RECEBER", data: b.data_recebimento as string, clienteNome: cl?.razao_social ?? "" };
    });
}

// Títulos abertos do valor exato (saldo cheio) do tipo alvo.
async function titulosAbertos(supabase: Awaited<ReturnType<typeof createServerSupabase>>, tipo: "RECEBER" | "PAGAR", valorAbs: number): Promise<TituloAberto[]> {
  const { data } = await supabase.from("titulo").select("id, valor, tipo, vencimento, descricao, baixa(valor_recebido, estornada)").in("status", ["ABERTO", "VENCIDO"]).eq("tipo", tipo).eq("valor", valorAbs);
  return (data ?? []).map((t) => {
    const bxs = (Array.isArray(t.baixa) ? t.baixa : t.baixa ? [t.baixa] : []) as { valor_recebido: number; estornada: boolean }[];
    const baixado = bxs.filter((x) => !x.estornada).reduce((s, x) => s + Number(x.valor_recebido), 0);
    return { tituloId: t.id as string, valor: Number(t.valor), baixado, tipo: t.tipo as "RECEBER" | "PAGAR", vencimento: t.vencimento as string, descricao: (t.descricao as string | null) ?? "" };
  });
}

export async function candidatosDoMovimento(movimentoId: string): Promise<CandidatosView> {
  if (!(await gate())) return { baixas: [], titulos: [] };
  const supabase = await createServerSupabase();
  const mov = await carregarMovimento(supabase, movimentoId);
  if (!mov || mov.status !== "pendente") return { baixas: [], titulos: [] };
  const valor = Number(mov.valor);
  const valorAbs = Math.abs(valor);
  const tipo = valor > 0 ? "RECEBER" : "PAGAR";
  const [baixas, titulos] = await Promise.all([baixasDisponiveis(supabase, mov.conta_bancaria_id as string, valorAbs), titulosAbertos(supabase, tipo, valorAbs)]);
  return candidatosMovimento({ id: mov.id as string, valor, data: mov.data as string }, baixas, titulos);
}

export async function conciliarComBaixa(movimentoId: string, baixaId: string): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const hoje = hojeSP();
  const { error: e1 } = await supabase.from("movimento_bancario").update({ status: "conciliada", baixa_id: baixaId }).eq("id", movimentoId);
  if (e1) return { erro: e1.message };
  await supabase.from("baixa").update({ conciliado_em: hoje }).eq("id", baixaId);
  return { ok: true };
}

export async function conciliarComTitulo(movimentoId: string, tituloId: string): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const mov = await carregarMovimento(supabase, movimentoId);
  if (!mov) return { erro: "Movimento não encontrado." };
  const hoje = hojeSP();
  const { data: nova, error } = await supabase.from("baixa").insert({ titulo_id: tituloId, data_recebimento: mov.data, valor_recebido: Math.abs(Number(mov.valor)), conta_bancaria_id: mov.conta_bancaria_id, forma_pagamento: "TRANSFERENCIA", criado_por: perfil.id, conciliado_em: hoje }).select("id").single();
  if (error || !nova) return { erro: "Falha ao criar a baixa." };
  const { error: e2 } = await supabase.from("movimento_bancario").update({ status: "conciliada", baixa_id: nova.id }).eq("id", movimentoId);
  if (e2) return { erro: e2.message };
  return { ok: true };
}

export async function criarLancamento(movimentoId: string, input: { categoriaId: string; descricao: string; clienteId?: string; fornecedorId?: string }): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  if (!input.categoriaId) return { erro: "Selecione a categoria." };
  const supabase = await createServerSupabase();
  const mov = await carregarMovimento(supabase, movimentoId);
  if (!mov) return { erro: "Movimento não encontrado." };
  const valor = Number(mov.valor);
  const credito = valor > 0;
  if (credito && !input.clienteId) return { erro: "Selecione o cliente." };
  if (!credito && !input.fornecedorId) return { erro: "Selecione o fornecedor." };
  const tituloRow = {
    tipo: credito ? "RECEBER" : "PAGAR",
    origem: credito ? "RECEITA_AVULSA" : "DESPESA_AVULSA",
    cliente_id: credito ? input.clienteId : null,
    fornecedor_id: credito ? null : input.fornecedorId,
    valor: Math.abs(valor),
    competencia: `${(mov.data as string).slice(0, 7)}-01`,
    vencimento: mov.data,
    categoria_id: input.categoriaId,
    descricao: input.descricao || null,
    status: "ABERTO",
    criado_por: perfil.id,
  };
  const { data: titulo, error } = await supabase.from("titulo").insert(tituloRow).select("id").single();
  if (error || !titulo) return { erro: error?.message ?? "Falha ao criar o título." };
  const { data: nova, error: e2 } = await supabase.from("baixa").insert({ titulo_id: titulo.id, data_recebimento: mov.data, valor_recebido: Math.abs(valor), conta_bancaria_id: mov.conta_bancaria_id, forma_pagamento: "TRANSFERENCIA", criado_por: perfil.id, conciliado_em: hojeSP() }).select("id").single();
  if (e2 || !nova) return { erro: "Falha ao criar a baixa." };
  await supabase.from("movimento_bancario").update({ status: "conciliada", baixa_id: nova.id }).eq("id", movimentoId);
  return { ok: true };
}

export async function ignorarMovimento(movimentoId: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("movimento_bancario").update({ status: "ignorada" }).eq("id", movimentoId);
  return error ? { erro: error.message } : { ok: true };
}

export async function reabrirMovimento(movimentoId: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const mov = await carregarMovimento(supabase, movimentoId);
  if (!mov) return { erro: "Movimento não encontrado." };
  const baixaId = (mov as { baixa_id?: string | null }).baixa_id;
  const { error } = await supabase.from("movimento_bancario").update({ status: "pendente", baixa_id: null }).eq("id", movimentoId);
  if (error) return { erro: error.message };
  if (baixaId) await supabase.from("baixa").update({ conciliado_em: null }).eq("id", baixaId);
  return { ok: true };
}

export async function conciliarAutomaticos(contaId: string): Promise<{ conciliados: number } | { erro: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: pend } = await supabase.from("movimento_bancario").select("id, valor, data").eq("conta_bancaria_id", contaId).eq("status", "pendente");
  const movimentos: MovPendente[] = (pend ?? []).map((m) => ({ id: m.id as string, valor: Number(m.valor), data: m.data as string }));
  if (movimentos.length === 0) return { conciliados: 0 };
  const { data: linkadas } = await supabase.from("movimento_bancario").select("baixa_id").not("baixa_id", "is", null);
  const usadas = new Set((linkadas ?? []).map((r) => r.baixa_id as string));
  const { data: bx } = await supabase.from("baixa").select("id, valor_recebido, data_recebimento, titulo:titulo_id(tipo, clientes(razao_social))").eq("conta_bancaria_id", contaId).eq("estornada", false);
  const baixas: BaixaDisp[] = (bx ?? []).filter((b) => !usadas.has(b.id as string)).map((b) => {
    const t = um(b.titulo as { tipo?: string; clientes?: unknown } | { tipo?: string; clientes?: unknown }[] | null);
    const cl = um(t?.clientes as { razao_social?: string } | { razao_social?: string }[] | null);
    return { baixaId: b.id as string, valorRecebido: Number(b.valor_recebido), tipoTitulo: (t?.tipo as "RECEBER" | "PAGAR") ?? "RECEBER", data: b.data_recebimento as string, clienteNome: cl?.razao_social ?? "" };
  });
  const { data: tt } = await supabase.from("titulo").select("id, valor, tipo, vencimento, descricao, baixa(valor_recebido, estornada)").in("status", ["ABERTO", "VENCIDO"]);
  const titulos: TituloAberto[] = (tt ?? []).map((t) => {
    const bxs = (Array.isArray(t.baixa) ? t.baixa : t.baixa ? [t.baixa] : []) as { valor_recebido: number; estornada: boolean }[];
    const baixado = bxs.filter((x) => !x.estornada).reduce((s, x) => s + Number(x.valor_recebido), 0);
    return { tituloId: t.id as string, valor: Number(t.valor), baixado, tipo: t.tipo as "RECEBER" | "PAGAR", vencimento: t.vencimento as string, descricao: (t.descricao as string | null) ?? "" };
  });
  const casamentos = autoCasar(movimentos, baixas, titulos);
  let n = 0;
  for (const c of casamentos) {
    const r = c.alvo === "baixa" ? await conciliarComBaixa(c.movimentoId, c.alvoId) : await conciliarComTitulo(c.movimentoId, c.alvoId);
    if (r.ok) n += 1;
  }
  return { conciliados: n };
}

export async function listarCategoriasLancamento(): Promise<{ id: string; nome: string; natureza: string }[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("categoria").select("id, nome, natureza").eq("ativa", true).order("nome");
  return (data ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string, natureza: c.natureza as string }));
}

export async function listarClientesLancamento(): Promise<{ id: string; nome: string }[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("clientes").select("id, razao_social").is("excluido_em", null).order("razao_social");
  return (data ?? []).map((c) => ({ id: c.id as string, nome: c.razao_social as string }));
}

export async function listarFornecedoresLancamento(): Promise<{ id: string; nome: string }[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("fornecedor").select("id, nome").order("nome");
  return (data ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string }));
}
```

- [ ] **Step 2: Verificar + commit** — `npm run lint && npm run typecheck && npm run build`.
```bash
git add "src/app/(app)/financeiro/conciliacao/conciliar-actions.ts"
git commit -m "feat(conciliacao): actions de casamento/baixa/avulso/auto

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: UI — ações por linha + conciliar automáticos

**Files:**
- Create: `src/app/(app)/financeiro/conciliacao/AcaoMovimento.tsx`
- Modify: `src/app/(app)/financeiro/conciliacao/Conciliacao.tsx`
- Modify: `src/app/(app)/financeiro/conciliacao/page.tsx`
- Test: `src/tests/conciliacao/acao-render.test.tsx`

**Interfaces:**
- Consumes: actions da Task 3; `MovimentoView` (Fatia A).

- [ ] **Step 1: Smoke**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/financeiro/conciliacao/conciliar-actions", () => ({ candidatosDoMovimento: vi.fn(), conciliarComBaixa: vi.fn(), conciliarComTitulo: vi.fn(), criarLancamento: vi.fn(), ignorarMovimento: vi.fn(), reabrirMovimento: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { AcaoMovimento } from "@/app/(app)/financeiro/conciliacao/AcaoMovimento";

describe("AcaoMovimento", () => {
  it("linha pendente mostra Conciliar/Ignorar", () => {
    const html = renderToStaticMarkup(<AcaoMovimento mov={{ id: "1", data: "2026-08-20", descricao: "PIX", valor: 300, status: "pendente" }} categorias={[]} clientes={[]} fornecedores={[]} onDone={() => {}} />);
    expect(html).toContain("Conciliar");
    expect(html).toContain("Ignorar");
  });
  it("linha conciliada mostra Reabrir", () => {
    const html = renderToStaticMarkup(<AcaoMovimento mov={{ id: "1", data: "2026-08-20", descricao: "PIX", valor: 300, status: "conciliada" }} categorias={[]} clientes={[]} fornecedores={[]} onDone={() => {}} />);
    expect(html).toContain("Reabrir");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- conciliacao/acao-render` → FAIL.

- [ ] **Step 3: `AcaoMovimento.tsx`**

```tsx
"use client";
import { useState } from "react";
import { formatarMoeda } from "@/lib/format";
import type { MovimentoView } from "./actions";
import { candidatosDoMovimento, conciliarComBaixa, conciliarComTitulo, criarLancamento, ignorarMovimento, reabrirMovimento, type CandidatosView } from "./conciliar-actions";

type Opcao = { id: string; nome: string };

export function AcaoMovimento({ mov, categorias, clientes, fornecedores, onDone }: { mov: MovimentoView; categorias: { id: string; nome: string }[]; clientes: Opcao[]; fornecedores: Opcao[]; onDone: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [cand, setCand] = useState<CandidatosView | null>(null);
  const [lanc, setLanc] = useState(false);
  const [cat, setCat] = useState("");
  const [pessoa, setPessoa] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function abrir() {
    setAberto(true);
    setCand(await candidatosDoMovimento(mov.id));
  }
  async function acao(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.ok) onDone();
    else setErro(r.erro ?? "Erro");
  }
  async function lancar() {
    setErro("");
    const credito = mov.valor > 0;
    await acao(() => criarLancamento(mov.id, { categoriaId: cat, descricao: desc, clienteId: credito ? pessoa : undefined, fornecedorId: credito ? undefined : pessoa }));
  }

  if (mov.status !== "pendente") {
    return (
      <span className="flex items-center gap-2 text-xs">
        <span className="text-cinza">{mov.status}</span>
        <button type="button" disabled={busy} onClick={() => acao(() => reabrirMovimento(mov.id))} className="underline">Reabrir</button>
        {erro && <span className="text-negativo">{erro}</span>}
      </span>
    );
  }

  const credito = mov.valor > 0;
  const pessoas = credito ? clientes : fornecedores;
  return (
    <span className="flex flex-col gap-1 text-xs">
      {!aberto && <button type="button" onClick={abrir} className="w-fit rounded bg-verde px-2 py-0.5 font-medium text-white">Conciliar…</button>}
      {aberto && cand && (
        <span className="flex flex-col gap-1 rounded-lg border border-linha bg-white p-2">
          {cand.baixas.map((b) => (
            <button key={b.baixaId} type="button" disabled={busy} onClick={() => acao(() => conciliarComBaixa(mov.id, b.baixaId))} className="w-fit text-left text-verde underline">↔ baixa {b.clienteNome || "—"} · {b.data.slice(8, 10)}/{b.data.slice(5, 7)}</button>
          ))}
          {cand.titulos.map((t) => (
            <button key={t.tituloId} type="button" disabled={busy} onClick={() => acao(() => conciliarComTitulo(mov.id, t.tituloId))} className="w-fit text-left text-verde underline">↔ título {t.descricao || "—"} · {formatarMoeda(t.saldo)}</button>
          ))}
          {cand.baixas.length === 0 && cand.titulos.length === 0 && !lanc && (
            <span className="flex items-center gap-2">
              <span className="text-cinza">Sem correspondência.</span>
              <button type="button" onClick={() => setLanc(true)} className="text-verde underline">Criar lançamento</button>
              <button type="button" disabled={busy} onClick={() => acao(() => ignorarMovimento(mov.id))} className="text-cinza underline">Ignorar</button>
            </span>
          )}
          {lanc && (
            <span className="flex flex-col gap-1">
              <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} className="rounded border border-linha px-2 py-1">
                <option value="">{credito ? "Cliente…" : "Fornecedor…"}</option>
                {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded border border-linha px-2 py-1">
                <option value="">Categoria…</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descrição (opcional)" className="rounded border border-linha px-2 py-1" />
              <span className="flex gap-2">
                <button type="button" disabled={busy} onClick={lancar} className="rounded bg-verde px-2 py-0.5 font-medium text-white">Criar</button>
                <button type="button" onClick={() => setLanc(false)} className="text-cinza underline">Cancelar</button>
              </span>
            </span>
          )}
          {erro && <span className="text-negativo">{erro}</span>}
          <button type="button" onClick={() => setAberto(false)} className="w-fit text-cinza underline">fechar</button>
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Rodar e ver passar** — `npm test -- conciliacao/acao-render` → PASS.

- [ ] **Step 5: Integrar no `Conciliacao.tsx`** — adicionar props `categorias`/`clientes`/`fornecedores` à assinatura do componente; importar `AcaoMovimento` e `conciliarAutomaticos`; acrescentar uma coluna **"Ação"** no `<thead>` (após "Status") e, na linha da lista, uma célula `<td className="px-3 py-1.5"><AcaoMovimento mov={m} categorias={categorias} clientes={clientes} fornecedores={fornecedores} onDone={() => recarregar(conta, inicio, fim, status)} /></td>`; e um botão **"Conciliar automáticos"** ao lado do upload:
```tsx
        <button type="button" disabled={busy} onClick={async () => { setBusy(true); const r = await conciliarAutomaticos(conta); setBusy(false); if ("conciliados" in r) { setMsg(`${r.conciliados} conciliada(s) automaticamente.`); await recarregar(conta, inicio, fim, status); } else setMsg(r.erro); }} className="rounded-lg border border-linha px-3 py-1.5 text-sm">Conciliar automáticos</button>
```
(o `colSpan` do estado vazio da tabela passa de 4 para 5.)

- [ ] **Step 6: `page.tsx`** — carregar e passar as listas:
```tsx
import { listarCategoriasLancamento, listarClientesLancamento, listarFornecedoresLancamento } from "./conciliar-actions";
// ...dentro do componente, após contas:
  const [categorias, clientes, fornecedores] = await Promise.all([listarCategoriasLancamento(), listarClientesLancamento(), listarFornecedoresLancamento()]);
// ...e no JSX: <Conciliacao ... categorias={categorias} clientes={clientes} fornecedores={fornecedores} />
```

- [ ] **Step 7: Atualizar o smoke da Fatia A** — em `conciliacao-render.test.tsx`, o `<Conciliacao>` ganha as novas props obrigatórias: passar `categorias={[]} clientes={[]} fornecedores={[]}` no render; e adicionar ao `vi.mock` de `./actions`? não — mockar `./conciliar-actions` também (o `AcaoMovimento` importa dele): `vi.mock("@/app/(app)/financeiro/conciliacao/conciliar-actions", () => ({ candidatosDoMovimento: vi.fn(), conciliarComBaixa: vi.fn(), conciliarComTitulo: vi.fn(), criarLancamento: vi.fn(), ignorarMovimento: vi.fn(), reabrirMovimento: vi.fn(), conciliarAutomaticos: vi.fn() }))`.

- [ ] **Step 8: Rodar tudo** — `npm run lint && npm run typecheck && npm test && npm run build`.

- [ ] **Step 9: Commit**
```bash
git add "src/app/(app)/financeiro/conciliacao" src/tests/conciliacao/acao-render.test.tsx src/tests/conciliacao/conciliacao-render.test.tsx
git commit -m "feat(conciliacao): ações por linha (conciliar/avulso/ignorar) + auto

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Conciliação bancária (Fatia B):** casamento das movimentações com o financeiro — **conciliar** com
  baixa já lançada ou com título em aberto (cria a baixa), **criar lançamento avulso** (despesa com
  fornecedor / receita com cliente), **ignorar** e **reabrir**, além do botão **"Conciliar automáticos"**
  (casa os inequívocos por valor). Conclui a conciliação bancária.
```

- [ ] **Step 2: Commit + finalizar**
```bash
git add CHANGELOG.md
git commit -m "docs: changelog da Fatia B de conciliação bancária

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois: `superpowers:finishing-a-development-branch`. **Deploy:** `develop → main` + push + Implantar + validar pelo histórico verde do EasyPanel (sem rota nova).

---

## Self-Review

- **Cobertura do spec:** conciliado_em + RECEITA_AVULSA (T1) ✓; motor (T2) ✓; actions conciliar/título/avulso/ignorar/reabrir/auto + listas (T3) ✓; UI por linha + auto (T4) ✓; changelog (T5) ✓. Unit (T2) + smoke (T4 + fix do T4/A).
- **Placeholders:** nenhum — todo passo tem código. Dois pontos a conferir (marcados `>`): nome da coluna/tabela `fornecedor` e existência de `titulo.criado_por`.
- **Consistência de tipos:** `BaixaDisp`/`TituloAberto`/`MovPendente`/`CandBaixa`/`CandTitulo`/`Casamento` (T2) usados nas actions (T3); `CandidatosView` (T3) no `AcaoMovimento` (T4); `criarLancamento(movimentoId, {categoriaId, descricao, clienteId?, fornecedorId?})` consistente entre action e UI.
- **Segurança:** gate `podeGerenciarFinanceiro`; baixas criadas com `forma_pagamento='TRANSFERENCIA'`; reabrir não apaga baixa (só desvincula + limpa conciliado_em); CHECK do título respeitado (cliente/fornecedor por tipo).
- **Escopo:** fecha a conciliação. Casamento parcial e tolerância de valor ficam fora.
