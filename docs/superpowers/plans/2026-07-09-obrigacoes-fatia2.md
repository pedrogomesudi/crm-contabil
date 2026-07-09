# Obrigações — Fatia 2 (Baixa com comprovante + Painel de riscos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar baixa nas obrigações com comprovante obrigatório (quem/quando) e um painel de riscos que mostra o que está vencendo/vencido/sem responsável.

**Architecture:** Estende `obrigacao`/`obrigacao_instancia` (colunas de entrega + flag de comprovante), reusa o padrão de anexo do onboarding (Storage `documentos` + signed URL 60s) e o `classificarAlerta`; helpers puros para risco (TDD); status "entregue" **derivado** de `entregue_em IS NOT NULL` (sem mexer no enum). Spec: `docs/superpowers/specs/2026-07-09-obrigacoes-fatia2-design.md`.

**Tech Stack:** Next.js 16 (Server Actions + Storage), TypeScript, Supabase, Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`.
- Gate: instâncias/baixa/painel = `podeCriarCliente`; flag na matriz = admin. RLS de `obrigacao_instancia` já isola por cliente via `EXISTS`.
- **Status "entregue" é derivado** (`entregue_em IS NOT NULL`) — NÃO adicionar valor ao enum (o runner de migrations roda cada arquivo em transação; `ALTER TYPE ADD VALUE` é problemático aí).
- Anexo: bucket `documentos`, ≤10 MB, tipos `application/pdf`/`image/png`/`image/jpeg`; upload/URL via `createAdminSupabase()`.
- Migration idempotente; imutável após aplicada (`npm run db:migrate` atinge produção).
- Branch: `git checkout -b feat/obrigacoes-fatia2 develop`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Deploy (pós-merge):** `develop → main → Implantar` e validar por `curl` (o EasyPanel builda `main`).

---

## File Structure

- `supabase/migrations/0062_obrigacao_baixa.sql` — **novo**: flag + colunas de entrega.
- `src/lib/obrigacoes/risco.ts` (+ test) — **novo**: classificação e agrupamento de risco.
- `src/app/(app)/obrigacoes/baixa-actions.ts` — **novo**: `darBaixa`/`reabrir`/`alternarDispensa`/`urlComprovante`.
- `src/app/(app)/obrigacoes/actions.ts` — **modificar**: estender `InstanciaView`/`listarInstancias`; add `listarRiscos`/`contarRiscos`.
- `src/app/(app)/obrigacoes/AcoesInstancia.tsx` — **novo**: ações de baixa por linha (compartilhado).
- `src/app/(app)/obrigacoes/Calendario.tsx` + `clientes/[id]/ObrigacoesCliente.tsx` — **modificar**: usar `AcoesInstancia`.
- `src/app/(app)/obrigacoes/riscos/page.tsx` + `PainelRiscosView.tsx` (+ smoke) — **novo**: painel.
- `src/app/(app)/configuracoes/obrigacoes/{actions.ts,EditorMatriz.tsx}` — **modificar**: flag `comprovante_obrigatorio`.
- `src/components/Sidebar.tsx` + `src/app/(app)/layout.tsx` — **modificar**: badge de riscos.

---

## Task 1: Migration — flag + colunas de entrega

**Files:**
- Create: `supabase/migrations/0062_obrigacao_baixa.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Obrigações Fatia 2: comprovante configurável + entrega (quem/quando). Status "entregue" é derivado
-- de entregue_em IS NOT NULL — sem alterar o enum (o runner roda em transação).
alter table obrigacao add column if not exists comprovante_obrigatorio boolean not null default true;
alter table obrigacao_instancia add column if not exists comprovante_path text;
alter table obrigacao_instancia add column if not exists entregue_em date;
alter table obrigacao_instancia add column if not exists entregue_por uuid references usuarios(id);
alter table obrigacao_instancia add column if not exists observacao text;
```

- [ ] **Step 2: Aplicar** — `npm run db:migrate` (esperado: `0062_obrigacao_baixa` aplicada, sem erro). ⚠️ Atinge produção; imutável depois.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0062_obrigacao_baixa.sql
git commit -m "feat(obrigacoes): migration de baixa (comprovante + entrega)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Helper de risco (TDD)

**Files:**
- Create: `src/lib/obrigacoes/risco.ts`
- Test: `src/tests/obrigacoes/risco.test.ts`

**Interfaces:**
- Produces: `type RiscoBucket`, `classificarRisco`, `type ItemRisco`, `type GrupoRisco`, `type PainelRiscos`, `montarPainel`.

- [ ] **Step 1: Testes**

```ts
import { describe, it, expect } from "vitest";
import { classificarRisco, montarPainel, type ItemRisco } from "@/lib/obrigacoes/risco";

const hoje = "2026-07-15";
const item = (over: Partial<ItemRisco>): ItemRisco => ({ id: "x", clienteNome: "C", obrigacaoNome: "O", competencia: "2026-06-01", periodicidade: "mensal", vencimentoInterno: hoje, vencimentoLegal: hoje, responsavelId: "u1", responsavelNome: "Ana", ...over });

describe("classificarRisco", () => {
  it("classifica nas fronteiras", () => {
    expect(classificarRisco("2026-07-14", hoje)).toBe("vencida");
    expect(classificarRisco("2026-07-15", hoje)).toBe("vencendo_hoje");
    expect(classificarRisco("2026-07-16", hoje)).toBe("no_prazo");
  });
});

describe("montarPainel", () => {
  const itens: ItemRisco[] = [
    item({ id: "a", vencimentoInterno: "2026-07-10", responsavelId: "u1", responsavelNome: "Ana" }), // vencida
    item({ id: "b", vencimentoInterno: "2026-07-15", responsavelId: "u1", responsavelNome: "Ana" }), // hoje
    item({ id: "c", vencimentoInterno: "2026-07-20", responsavelId: null, responsavelNome: null }), // sem resp
    item({ id: "d", vencimentoInterno: "2026-07-08", responsavelId: "u2", responsavelNome: "Bruno" }), // vencida
  ];
  it("resume as contagens", () => {
    const p = montarPainel(itens, hoje);
    expect(p.resumo).toEqual({ vencendoHoje: 1, vencidas: 2, semResponsavel: 1 });
  });
  it("põe 'sem responsável' no topo e agrupa o resto por nome", () => {
    const p = montarPainel(itens, hoje);
    expect(p.grupos[0]!.responsavelId).toBeNull();
    expect(p.grupos.map((g) => g.responsavelNome)).toEqual([null, "Ana", "Bruno"]);
  });
  it("ordena por atraso (interno asc) dentro do grupo", () => {
    const p = montarPainel(itens, hoje);
    const ana = p.grupos.find((g) => g.responsavelId === "u1")!;
    expect(ana.itens.map((i) => i.id)).toEqual(["a", "b"]); // 10 antes de 15
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- obrigacoes/risco` → FAIL.

- [ ] **Step 3: Implementar `risco.ts`**

```ts
export type RiscoBucket = "vencida" | "vencendo_hoje" | "no_prazo";
export function classificarRisco(vencimentoInterno: string, hoje: string): RiscoBucket {
  if (vencimentoInterno < hoje) return "vencida";
  if (vencimentoInterno === hoje) return "vencendo_hoje";
  return "no_prazo";
}

export type ItemRisco = { id: string; clienteNome: string; obrigacaoNome: string; competencia: string; periodicidade: string; vencimentoInterno: string; vencimentoLegal: string; responsavelId: string | null; responsavelNome: string | null };
export type GrupoRisco = { responsavelId: string | null; responsavelNome: string | null; itens: ItemRisco[] };
export type PainelRiscos = { resumo: { vencendoHoje: number; vencidas: number; semResponsavel: number }; grupos: GrupoRisco[] };

export function montarPainel(itens: ItemRisco[], hoje: string): PainelRiscos {
  let vencendoHoje = 0;
  let vencidas = 0;
  let semResponsavel = 0;
  const mapa = new Map<string, GrupoRisco>();
  for (const it of itens) {
    const r = classificarRisco(it.vencimentoInterno, hoje);
    if (r === "vencendo_hoje") vencendoHoje++;
    else if (r === "vencida") vencidas++;
    if (it.responsavelId === null) semResponsavel++;
    const chave = it.responsavelId ?? "__nulo__";
    const g = mapa.get(chave) ?? { responsavelId: it.responsavelId, responsavelNome: it.responsavelNome, itens: [] };
    g.itens.push(it);
    mapa.set(chave, g);
  }
  const grupos = [...mapa.values()];
  for (const g of grupos) g.itens.sort((a, b) => a.vencimentoInterno.localeCompare(b.vencimentoInterno));
  grupos.sort((a, b) => {
    if (a.responsavelId === null) return -1;
    if (b.responsavelId === null) return 1;
    return (a.responsavelNome ?? "").localeCompare(b.responsavelNome ?? "");
  });
  return { resumo: { vencendoHoje, vencidas, semResponsavel }, grupos };
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- obrigacoes/risco` (PASS), `npm run lint`, `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/obrigacoes/risco.ts src/tests/obrigacoes/risco.test.ts
git commit -m "feat(obrigacoes): helper de risco (classificação + painel) TDD

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Actions de baixa + extensão da listagem

**Files:**
- Create: `src/app/(app)/obrigacoes/baixa-actions.ts`
- Modify: `src/app/(app)/obrigacoes/actions.ts`

**Interfaces:**
- Produces: `darBaixa`, `reabrir`, `alternarDispensa`, `urlComprovante`; `InstanciaView` estendida; `listarInstancias` com campos de entrega.

- [ ] **Step 1: `baixa-actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeCriarCliente } from "@/lib/clientes/permissoes";

const MAX_ANEXO = 10 * 1024 * 1024;
const TIPOS = ["application/pdf", "image/png", "image/jpeg"];
const nomeSeguro = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return null;
  return p;
}

async function instanciaComContexto(supabase: Awaited<ReturnType<typeof createServerSupabase>>, id: string) {
  const { data } = await supabase.from("obrigacao_instancia").select("id, cliente_id, comprovante_path, entregue_em, status, obrigacao(comprovante_obrigatorio)").eq("id", id).maybeSingle();
  return data;
}

export async function darBaixa(instanciaId: string, formData: FormData): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const inst = await instanciaComContexto(supabase, instanciaId);
  if (!inst) return { erro: "Instância não encontrada ou sem permissão." };
  const obr = (Array.isArray(inst.obrigacao) ? inst.obrigacao[0] : inst.obrigacao) as { comprovante_obrigatorio?: boolean } | null;
  const file = formData.get("comprovante");
  const observacao = String(formData.get("observacao") ?? "").trim() || null;
  const data = String(formData.get("data") ?? "") || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const temArquivo = file instanceof File && file.size > 0;

  if (obr?.comprovante_obrigatorio && !temArquivo) return { erro: "Comprovante obrigatório para esta obrigação." };
  let comprovantePath: string | null = inst.comprovante_path as string | null;
  const admin = createAdminSupabase();
  if (temArquivo) {
    const f = file as File;
    if (f.size > MAX_ANEXO) return { erro: "Arquivo acima de 10 MB." };
    if (!TIPOS.includes(f.type)) return { erro: "Tipo não permitido (PDF, PNG ou JPG)." };
    const caminho = `obrigacoes/${inst.cliente_id}/${instanciaId}/${crypto.randomUUID()}-${nomeSeguro(f.name)}`;
    const up = await admin.storage.from("documentos").upload(caminho, f, { contentType: f.type });
    if (up.error) return { erro: "Falha no upload." };
    comprovantePath = caminho;
  }
  const { error } = await admin.from("obrigacao_instancia").update({ status: "pendente", entregue_em: data, entregue_por: perfil.id, observacao, comprovante_path: comprovantePath }).eq("id", instanciaId);
  if (error) {
    if (temArquivo && comprovantePath) await admin.storage.from("documentos").remove([comprovantePath]);
    return { erro: "Falha ao registrar a baixa." };
  }
  revalidatePath("/obrigacoes");
  revalidatePath(`/clientes/${inst.cliente_id}`);
  return { ok: true };
}

export async function reabrir(instanciaId: string): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const inst = await instanciaComContexto(supabase, instanciaId);
  if (!inst) return { erro: "Instância não encontrada." };
  const admin = createAdminSupabase();
  if (inst.comprovante_path) await admin.storage.from("documentos").remove([inst.comprovante_path as string]);
  const { error } = await admin.from("obrigacao_instancia").update({ status: "pendente", entregue_em: null, entregue_por: null, observacao: null, comprovante_path: null }).eq("id", instanciaId);
  if (error) return { erro: "Falha ao reabrir." };
  revalidatePath("/obrigacoes");
  revalidatePath(`/clientes/${inst.cliente_id}`);
  return { ok: true };
}

export async function alternarDispensa(instanciaId: string, dispensar: boolean): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const inst = await instanciaComContexto(supabase, instanciaId);
  if (!inst) return { erro: "Instância não encontrada." };
  if (dispensar && inst.entregue_em) return { erro: "Já entregue; reabra antes de dispensar." };
  const { error } = await supabase.from("obrigacao_instancia").update({ status: dispensar ? "dispensada" : "pendente" }).eq("id", instanciaId);
  if (error) return { erro: "Falha ao atualizar." };
  revalidatePath("/obrigacoes");
  revalidatePath(`/clientes/${inst.cliente_id}`);
  return { ok: true };
}

export async function urlComprovante(instanciaId: string): Promise<{ url?: string; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("obrigacao_instancia").select("comprovante_path").eq("id", instanciaId).maybeSingle();
  if (!data?.comprovante_path) return { erro: "Sem comprovante." };
  const admin = createAdminSupabase();
  const { data: signed, error } = await admin.storage.from("documentos").createSignedUrl(data.comprovante_path as string, 60);
  if (error || !signed?.signedUrl) return { erro: "Não foi possível gerar o link." };
  return { url: signed.signedUrl };
}
```

- [ ] **Step 2: Estender `InstanciaView` e `listarInstancias`** em `actions.ts`.

Trocar a definição de `InstanciaView` por (adiciona campos de entrega; `status` passa a ser o **derivado** "pendente"/"entregue"/"dispensada"):
```ts
export type InstanciaView = { id: string; clienteNome: string; obrigacaoNome: string; obrigacaoCodigo: string; periodicidade: string; competencia: string; vencimentoLegal: string; vencimentoInterno: string; status: string; responsavelNome: string | null; meu: boolean; entregueEm: string | null; entreguePorNome: string | null; temComprovante: boolean; comprovanteObrigatorio: boolean };
```

No `listarInstancias`, trocar o `.select(...)` e o `.map(...)`:
```ts
  let q = supabase
    .from("obrigacao_instancia")
    .select("id, competencia, vencimento_legal, vencimento_interno, status, responsavel_id, entregue_em, comprovante_path, obrigacao(nome, codigo, periodicidade, comprovante_obrigatorio), clientes(razao_social), responsavel:responsavel_id(nome), entregador:entregue_por(nome)")
    .gte("vencimento_legal", ini)
    .lte("vencimento_legal", fim)
    .order("vencimento_legal");
  if (opts?.clienteId) q = q.eq("cliente_id", opts.clienteId);
  const { data } = await q;
  return (data ?? []).map((r) => {
    const o = um(r.obrigacao as { nome?: string; codigo?: string; periodicidade?: string; comprovante_obrigatorio?: boolean } | { nome?: string; codigo?: string; periodicidade?: string; comprovante_obrigatorio?: boolean }[] | null);
    const cl = um(r.clientes as { razao_social?: string } | { razao_social?: string }[] | null);
    const resp = um(r.responsavel as { nome?: string } | { nome?: string }[] | null);
    const ent = um(r.entregador as { nome?: string } | { nome?: string }[] | null);
    const entregueEm = (r.entregue_em as string | null) ?? null;
    const status = entregueEm ? "entregue" : (r.status as string);
    return {
      id: r.id as string,
      clienteNome: cl?.razao_social ?? "—",
      obrigacaoNome: o?.nome ?? "—",
      obrigacaoCodigo: o?.codigo ?? "",
      periodicidade: o?.periodicidade ?? "mensal",
      competencia: r.competencia as string,
      vencimentoLegal: r.vencimento_legal as string,
      vencimentoInterno: r.vencimento_interno as string,
      status,
      responsavelNome: resp?.nome ?? null,
      meu: (r.responsavel_id as string | null) === perfil.id,
      entregueEm,
      entreguePorNome: ent?.nome ?? null,
      temComprovante: !!r.comprovante_path,
      comprovanteObrigatorio: o?.comprovante_obrigatorio ?? true,
    };
  });
```

- [ ] **Step 3: Verificar + commit** — `npm run lint && npm run typecheck` (pode quebrar o smoke da Fatia 1 por campos novos — será corrigido na Task 5; typecheck do app deve passar). `npm run build`.
```bash
git add "src/app/(app)/obrigacoes/baixa-actions.ts" "src/app/(app)/obrigacoes/actions.ts"
git commit -m "feat(obrigacoes): actions de baixa + campos de entrega na listagem

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Flag comprovante_obrigatorio na matriz

**Files:**
- Modify: `src/app/(app)/configuracoes/obrigacoes/actions.ts`
- Modify: `src/app/(app)/configuracoes/obrigacoes/EditorMatriz.tsx`

- [ ] **Step 1: `actions.ts`** — em `ObrigacaoRow` adicionar `comprovanteObrigatorio: boolean;`; no `listarMatriz` mapear `comprovanteObrigatorio: (r.comprovante_obrigatorio as boolean) ?? true`; no `salvarObrigacao` incluir `comprovante_obrigatorio: input.comprovanteObrigatorio` no `row`.

- [ ] **Step 2: `EditorMatriz.tsx`** — no objeto `vazio` adicionar `comprovanteObrigatorio: true`; na área de checkboxes do formulário, ao lado de "antecipa"/"ativa", acrescentar:
```tsx
            <label className="flex items-center gap-1 text-sm text-cinza"><input type="checkbox" checked={form.comprovanteObrigatorio} onChange={(e) => setForm({ ...form, comprovanteObrigatorio: e.target.checked })} />comprovante obrigatório</label>
```

- [ ] **Step 3: Verificar + commit** — `npm run lint && npm run typecheck && npm test -- obrigacoes/matriz-render`.
```bash
git add "src/app/(app)/configuracoes/obrigacoes/actions.ts" "src/app/(app)/configuracoes/obrigacoes/EditorMatriz.tsx"
git commit -m "feat(obrigacoes): flag de comprovante obrigatório na matriz

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> Nota: o smoke `matriz-render.test.tsx` usa `ObrigacaoRow` sem o novo campo → adicionar `comprovanteObrigatorio: true` ao fixture nesse teste (senão TS2741). Fazer no mesmo commit.

---

## Task 5: Ações de baixa por linha (UI compartilhada)

**Files:**
- Create: `src/app/(app)/obrigacoes/AcoesInstancia.tsx`
- Modify: `src/app/(app)/obrigacoes/Calendario.tsx`
- Modify: `src/app/(app)/clientes/[id]/ObrigacoesCliente.tsx`
- Modify: `src/tests/obrigacoes/calendario-render.test.tsx` (fixture com campos novos)

**Interfaces:**
- Consumes: `darBaixa`/`reabrir`/`alternarDispensa`/`urlComprovante` (Task 3); `InstanciaView` estendida.
- Produces: componente `AcoesInstancia`.

- [ ] **Step 1: `AcoesInstancia.tsx`**

```tsx
"use client";
import { useState } from "react";
import { darBaixa, reabrir, alternarDispensa, urlComprovante } from "./baixa-actions";
import type { InstanciaView } from "./actions";

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function AcoesInstancia({ inst, onDone }: { inst: InstanciaView; onDone: () => void }) {
  const [form, setForm] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function confirmar() {
    setErro("");
    if (inst.comprovanteObrigatorio && !arquivo) { setErro("Comprovante obrigatório."); return; }
    setBusy(true);
    const fd = new FormData();
    if (arquivo) fd.set("comprovante", arquivo);
    fd.set("observacao", obs);
    const r = await darBaixa(inst.id, fd);
    setBusy(false);
    if (r.ok) { setForm(false); setArquivo(null); setObs(""); onDone(); }
    else setErro(r.erro ?? "Erro");
  }
  async function acao(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.ok) onDone(); else setErro(r.erro ?? "Erro");
  }
  async function verComprovante() {
    const r = await urlComprovante(inst.id);
    if (r.url) window.open(r.url, "_blank", "noopener"); else setErro(r.erro ?? "Erro");
  }

  if (inst.status === "entregue") {
    return (
      <span className="flex flex-wrap items-center gap-2 text-xs text-cinza">
        <span className="text-verde">✓ entregue{inst.entregueEm ? ` em ${dataBR(inst.entregueEm)}` : ""}{inst.entreguePorNome ? ` por ${inst.entreguePorNome}` : ""}</span>
        {inst.temComprovante && <button type="button" onClick={verComprovante} className="text-verde underline">comprovante</button>}
        <button type="button" disabled={busy} onClick={() => acao(() => reabrir(inst.id))} className="underline">reabrir</button>
        {erro && <span className="text-negativo">{erro}</span>}
      </span>
    );
  }
  if (inst.status === "dispensada") {
    return (
      <span className="flex items-center gap-2 text-xs text-cinza">
        dispensada
        <button type="button" disabled={busy} onClick={() => acao(() => alternarDispensa(inst.id, false))} className="underline">reativar</button>
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-1 text-xs">
      <span className="flex items-center gap-2">
        <button type="button" onClick={() => setForm((v) => !v)} className="rounded bg-verde px-2 py-0.5 font-medium text-white">Dar baixa</button>
        <button type="button" disabled={busy} onClick={() => acao(() => alternarDispensa(inst.id, true))} className="text-cinza underline">dispensar</button>
      </span>
      {form && (
        <span className="flex flex-col gap-1 rounded-lg border border-linha bg-white p-2">
          <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observação (opcional)" className="rounded border border-linha px-2 py-1" />
          <span className="flex items-center gap-2">
            <button type="button" disabled={busy} onClick={confirmar} className="rounded bg-verde px-2 py-0.5 font-medium text-white">Confirmar</button>
            <button type="button" onClick={() => setForm(false)} className="text-cinza underline">cancelar</button>
          </span>
          {inst.comprovanteObrigatorio && <span className="text-cinza">Comprovante obrigatório (PDF/PNG/JPG ≤ 10 MB).</span>}
          {erro && <span className="text-negativo">{erro}</span>}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Usar no `Calendario.tsx`** — importar `AcoesInstancia`; a coluna "Status" (última) passa a renderizar, além do selo, as ações: substituir o conteúdo da célula de status por:
```tsx
                  <td className="px-3 py-1.5">
                    <div className="flex flex-col gap-1">
                      {sev && inst.status === "pendente" ? <span className={`w-fit rounded px-1.5 py-0.5 text-xs ${SELO[sev]}`}>{sev.replace("_", " ")}</span> : null}
                      <AcoesInstancia inst={r} onDone={() => recarregar(ano, mes)} />
                    </div>
                  </td>
```
(Renomear a variável do `.map((r) =>` mantém `r`; `sev` já é calculado a partir de `r.vencimentoInterno`. `inst` não existe no escopo — usar `r`.) Corrigir para: `sev && r.status === "pendente"`.

- [ ] **Step 3: Usar no `ObrigacoesCliente.tsx`** — importar `AcoesInstancia`; adicionar uma coluna "Ações" na tabela renderizando `<AcoesInstancia inst={r} onDone={async () => setLista(await listarInstancias(ano, mes, { clienteId }))} />` (a função de reload já existe no componente; extrair para uma `recarregar()` reutilizável).

- [ ] **Step 4: Corrigir o smoke da Fatia 1** — em `calendario-render.test.tsx`, completar o fixture `InstanciaView` com os campos novos:
```tsx
{ ...tudo anterior..., entregueEm: null, entreguePorNome: null, temComprovante: false, comprovanteObrigatorio: true }
```

- [ ] **Step 5: Rodar tudo** — `npm run lint && npm run typecheck && npm test && npm run build`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/obrigacoes/AcoesInstancia.tsx" "src/app/(app)/obrigacoes/Calendario.tsx" "src/app/(app)/clientes/[id]/ObrigacoesCliente.tsx" src/tests/obrigacoes/calendario-render.test.tsx
git commit -m "feat(obrigacoes): ações de baixa/dispensa por linha (calendário + ficha)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Painel de riscos + badge no menu

**Files:**
- Modify: `src/app/(app)/obrigacoes/actions.ts` (add `listarRiscos`/`contarRiscos`)
- Create: `src/app/(app)/obrigacoes/riscos/page.tsx`
- Create: `src/app/(app)/obrigacoes/riscos/PainelRiscosView.tsx`
- Modify: `src/components/Sidebar.tsx`, `src/app/(app)/layout.tsx`
- Test: `src/tests/obrigacoes/painel-render.test.tsx`

**Interfaces:**
- Consumes: `montarPainel`, `PainelRiscos`, `ItemRisco` (Task 2); `classificarAlerta`.
- Produces: `listarRiscos`, `contarRiscos`.

- [ ] **Step 1: Actions `listarRiscos`/`contarRiscos`** em `actions.ts`

```ts
import { montarPainel, classificarRisco, type PainelRiscos, type ItemRisco } from "@/lib/obrigacoes/risco";

export async function listarRiscos(opts?: { soMeus?: boolean }): Promise<PainelRiscos> {
  const perfil = await gate();
  if (!perfil) return { resumo: { vencendoHoje: 0, vencidas: 0, semResponsavel: 0 }, grupos: [] };
  const supabase = await createServerSupabase();
  let q = supabase.from("obrigacao_instancia").select("id, competencia, vencimento_legal, vencimento_interno, responsavel_id, entregue_em, obrigacao(nome, periodicidade), clientes(razao_social), responsavel:responsavel_id(nome)").eq("status", "pendente").is("entregue_em", null);
  if (opts?.soMeus) q = q.eq("responsavel_id", perfil.id);
  const { data } = await q;
  const itens: ItemRisco[] = (data ?? []).map((r) => {
    const o = um(r.obrigacao as { nome?: string; periodicidade?: string } | { nome?: string; periodicidade?: string }[] | null);
    const cl = um(r.clientes as { razao_social?: string } | { razao_social?: string }[] | null);
    const resp = um(r.responsavel as { nome?: string } | { nome?: string }[] | null);
    return { id: r.id as string, clienteNome: cl?.razao_social ?? "—", obrigacaoNome: o?.nome ?? "—", competencia: r.competencia as string, periodicidade: o?.periodicidade ?? "mensal", vencimentoInterno: r.vencimento_interno as string, vencimentoLegal: r.vencimento_legal as string, responsavelId: (r.responsavel_id as string | null) ?? null, responsavelNome: resp?.nome ?? null };
  });
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return montarPainel(itens, hoje);
}

export async function contarRiscos(): Promise<number> {
  const perfil = await gate();
  if (!perfil) return 0;
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("obrigacao_instancia").select("vencimento_interno").eq("status", "pendente").is("entregue_em", null);
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return (data ?? []).filter((r) => classificarRisco(r.vencimento_interno as string, hoje) !== "no_prazo").length;
}
```
(`gate` e `um` já existem no arquivo, da Fatia 1.)

- [ ] **Step 2: Smoke test**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/obrigacoes/actions", () => ({ listarRiscos: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { PainelRiscosView } from "@/app/(app)/obrigacoes/riscos/PainelRiscosView";
import type { PainelRiscos } from "@/lib/obrigacoes/risco";

const painel: PainelRiscos = { resumo: { vencendoHoje: 1, vencidas: 2, semResponsavel: 1 }, grupos: [
  { responsavelId: null, responsavelNome: null, itens: [{ id: "c", clienteNome: "ACME", obrigacaoNome: "PGDAS-D", competencia: "2026-06-01", periodicidade: "mensal", vencimentoInterno: "2026-07-20", vencimentoLegal: "2026-07-20", responsavelId: null, responsavelNome: null }] },
] };

describe("PainelRiscosView", () => {
  it("mostra os cartões e o grupo sem responsável", () => {
    const html = renderToStaticMarkup(<PainelRiscosView painel={painel} hoje="2026-07-15" />);
    expect(html).toContain("Vencidas");
    expect(html).toContain("Sem responsável");
    expect(html).toContain("ACME");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar** — `npm test -- obrigacoes/painel-render` → FAIL.

- [ ] **Step 4: `PainelRiscosView.tsx`**

```tsx
"use client";
import { useState } from "react";
import { classificarAlerta } from "@/lib/onboarding/alertas";
import { listarRiscos } from "../actions";
import type { PainelRiscos } from "@/lib/obrigacoes/risco";

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const SELO: Record<string, string> = { em_breve: "bg-creme text-texto", vencido: "bg-negativo/10 text-negativo", critico: "bg-negativo text-white" };

export function PainelRiscosView({ painel: ini, hoje }: { painel: PainelRiscos; hoje: string }) {
  const [painel, setPainel] = useState(ini);
  const [soMeus, setSoMeus] = useState(false);
  async function recarregar(m: boolean) {
    setSoMeus(m);
    setPainel(await listarRiscos({ soMeus: m }));
  }
  const Card = ({ titulo, n, cor }: { titulo: string; n: number; cor?: string }) => (
    <div className="rounded-2xl border border-linha bg-white p-4">
      <div className={`text-2xl font-bold ${cor ?? "text-texto"}`}>{n}</div>
      <div className="text-xs text-cinza">{titulo}</div>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div className="grid grid-cols-3 gap-3">
          <Card titulo="Vencendo hoje" n={painel.resumo.vencendoHoje} />
          <Card titulo="Vencidas" n={painel.resumo.vencidas} cor="text-negativo" />
          <Card titulo="Sem responsável" n={painel.resumo.semResponsavel} />
        </div>
        <label className="flex items-center gap-1 text-sm text-cinza"><input type="checkbox" checked={soMeus} onChange={(e) => recarregar(e.target.checked)} />só os meus</label>
      </div>
      {painel.grupos.length === 0 && <p className="rounded-2xl border border-linha bg-white px-3 py-4 text-sm text-cinza">Nenhuma obrigação em aberto.</p>}
      {painel.grupos.map((g) => (
        <div key={g.responsavelId ?? "nulo"} className="space-y-1">
          <h3 className={`text-sm font-semibold ${g.responsavelId === null ? "text-negativo" : "text-texto"}`}>{g.responsavelNome ?? "Sem responsável"}</h3>
          <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
            <table className="min-w-full text-sm">
              <tbody>
                {g.itens.map((it) => {
                  const sev = classificarAlerta(it.vencimentoInterno, hoje);
                  return (
                    <tr key={it.id} className="border-b border-linha/60">
                      <td className="px-3 py-1.5 text-texto">{it.clienteNome}</td>
                      <td className="px-3 py-1.5">{it.obrigacaoNome}</td>
                      <td className="px-3 py-1.5">{dataBR(it.vencimentoInterno)}</td>
                      <td className="px-3 py-1.5">{sev ? <span className={`rounded px-1.5 py-0.5 text-xs ${SELO[sev]}`}>{sev.replace("_", " ")}</span> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: `riscos/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { PainelRiscosView } from "./PainelRiscosView";
import { listarRiscos } from "../actions";

export default async function RiscosPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const painel = await listarRiscos();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4">
      <PageHeader titulo="Riscos de obrigações" subtitulo="Vencendo hoje, vencidas e sem responsável" />
      <PainelRiscosView painel={painel} hoje={hoje} />
    </main>
  );
}
```

- [ ] **Step 6: Badge no menu** — em `layout.tsx`: `import { contarRiscos } from "@/app/(app)/obrigacoes/actions";` e `const riscosObrigacoes = podeCriarCliente(perfil.papel) ? await contarRiscos() : 0;`, passar `riscosObrigacoes={riscosObrigacoes}` ao `<Sidebar>`. Em `Sidebar.tsx`: adicionar `riscosObrigacoes` à assinatura de props (`{ ..., riscosObrigacoes = 0 }`) e no item de Obrigações usar `{ href: "/obrigacoes", label: "Obrigações", badge: riscosObrigacoes || undefined }`.

- [ ] **Step 7: Link "Ver riscos"** — no `Calendario.tsx`, ao lado do botão "Gerar competência", um `<a href="/obrigacoes/riscos" className="rounded-lg border border-linha px-3 py-1.5 text-sm">Ver riscos</a>`.

- [ ] **Step 8: Rodar tudo** — `npm test -- obrigacoes/painel-render` (PASS), `npm run lint && npm run typecheck && npm test && npm run build`.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(app)/obrigacoes/actions.ts" "src/app/(app)/obrigacoes/riscos" "src/app/(app)/obrigacoes/Calendario.tsx" src/components/Sidebar.tsx "src/app/(app)/layout.tsx" src/tests/obrigacoes/painel-render.test.tsx
git commit -m "feat(obrigacoes): painel de riscos + badge no menu

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Obrigações e Compliance (Fatia 2):** **baixa de obrigação** com comprovante (anexo PDF/PNG/JPG,
  obrigatório por obrigação via flag na matriz) registrando quem entregou e quando, além de dispensar
  e reabrir; **painel de riscos** (`/obrigacoes/riscos`) com Vencendo hoje / Vencidas / Sem responsável,
  agrupado por responsável, e badge no menu.
```

- [ ] **Step 2: Commit + finalizar**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog da Fatia 2 de Obrigações

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois: `superpowers:finishing-a-development-branch`. **Deploy:** merge `develop → main` + push + Implantar + validar `/obrigacoes/riscos` por curl (307).

---

## Self-Review

- **Cobertura do spec:** flag + colunas de entrega (T1) ✓; helper de risco (T2) ✓; baixa/reabrir/dispensa/comprovante + listagem estendida (T3) ✓; flag na matriz (T4) ✓; ações por linha no calendário/ficha (T5) ✓; painel + badge (T6) ✓; changelog (T7) ✓. Unit (T2) + smoke (T5 corrige o da Fatia 1; T6 painel).
- **Placeholders:** nenhum — todo passo tem código.
- **Consistência de tipos:** `InstanciaView` estendida (T3) consumida por `AcoesInstancia`/`Calendario`/`ObrigacoesCliente` (T5); `PainelRiscos`/`ItemRisco` (T2) em `listarRiscos` (T6) e `PainelRiscosView` (T6); `ObrigacaoRow.comprovanteObrigatorio` (T4). `status` derivado ("pendente"/"entregue"/"dispensada") coerente entre `listarInstancias` e `AcoesInstancia`.
- **Decisão registrada:** status "entregue" derivado de `entregue_em` (sem `ALTER TYPE ADD VALUE`, que quebra no runner transacional).
- **Fixtures a atualizar (sinalizado):** `matriz-render.test.tsx` (+`comprovanteObrigatorio`) na T4; `calendario-render.test.tsx` (+4 campos) na T5.
- **Segurança:** gate `podeCriarCliente` + RLS por cliente; comprovante validado no servidor; signed URL 60s; flag na matriz só admin.
- **Escopo:** baixa + painel. Escalonamento, suspensão/retroativos e conformidade (Fatia 3) fora.
