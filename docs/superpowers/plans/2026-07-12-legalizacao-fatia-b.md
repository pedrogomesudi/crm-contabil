# Legalização — Fatia B (editor de modelos) — Plano

> REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Admin cria/edita modelos de legalização e suas etapas (CRUD + reordenar). Sem migration (tabelas + RLS já existem).

## Global Constraints
- Gate `perfil.papel === "admin"` em todas as actions; RLS já reforça.
- `next/image`, alias `@/*`. Antes de commit: `lint && typecheck && test` (+ `db:test` se mexer em RLS).

---

### Task 1: Lib slugModelo (TDD)

**Files:** Create `src/lib/legalizacao/modelo.ts`, Test `src/tests/legalizacao/modelo.test.ts`

**Interface:** `slugModelo(nome: string, existentes: string[]): string`

- [ ] **Step 1: Teste (falhando)**

```ts
import { describe, it, expect } from "vitest";
import { slugModelo } from "@/lib/legalizacao/modelo";

describe("slugModelo", () => {
  it("kebab sem acento", () => { expect(slugModelo("Abertura Simples Nacional", [])).toBe("abertura-simples-nacional"); });
  it("resolve colisão", () => { expect(slugModelo("Baixa", ["baixa"])).toBe("baixa-2"); });
  it("fallback quando vazio", () => { expect(slugModelo("", [])).toMatch(/^modelo/); });
});
```

- [ ] **Step 2:** `npm test -- legalizacao/modelo` → FAIL.

- [ ] **Step 3: Implementar**

```ts
export function slugModelo(nome: string, existentes: string[]): string {
  const base = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "modelo";
  if (!existentes.includes(base)) return base;
  let i = 2;
  while (existentes.includes(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
```

- [ ] **Step 4:** `npm test -- legalizacao/modelo` → PASS. `typecheck && lint`.
- [ ] **Step 5:** commit `feat: slug de modelo de legalização`

---

### Task 2: Ações do editor (admin)

**Files:** Create `src/app/(app)/configuracoes/legalizacao/actions.ts`

**Interfaces:**
- `type EtapaModelo = { id: string; ordem: number; titulo: string; descricao: string|null; orgao: LegOrgao; prazoDias: number|null; responsavelPapel: string|null; anexoObrigatorio: boolean; avisarCliente: boolean }`
- `type ModeloView = { id: string; tipo: LegTipo; nome: string; ativo: boolean; etapas: number }`
- `type ModeloDetalhe = { id: string; tipo: LegTipo; nome: string; descricao: string|null; ativo: boolean; etapas: EtapaModelo[] }`
- `listarModelos()`, `obterModelo(id)`, `criarModelo(input)`, `salvarModelo(id, input)`, `excluirModelo(id)`, `salvarEtapa(input)`, `excluirEtapa(id)`, `reordenarEtapa(id, direcao)`

- [ ] **Step 1: Escrever `actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { slugModelo } from "@/lib/legalizacao/modelo";
import type { LegTipo, LegOrgao } from "@/lib/legalizacao/tipos";

export type EtapaModelo = { id: string; ordem: number; titulo: string; descricao: string | null; orgao: LegOrgao; prazoDias: number | null; responsavelPapel: string | null; anexoObrigatorio: boolean; avisarCliente: boolean };
export type ModeloView = { id: string; tipo: LegTipo; nome: string; ativo: boolean; etapas: number };
export type ModeloDetalhe = { id: string; tipo: LegTipo; nome: string; descricao: string | null; ativo: boolean; etapas: EtapaModelo[] };

const TIPOS = new Set<LegTipo>(["abertura_simples", "abertura_presumido", "alteracao_quadro", "transformacao", "baixa", "transferencia_entrada", "transferencia_saida"]);
const ORGAOS = new Set<LegOrgao>(["junta", "receita", "prefeitura", "sefaz", "bombeiros", "vigilancia", "outro"]);

async function admin() {
  const p = await getPerfilAtual();
  return p?.ativo && p.papel === "admin" ? p : null;
}

export async function listarModelos(): Promise<ModeloView[]> {
  if (!(await admin())) return [];
  const supabase = await createServerSupabase();
  const { data: tpls } = await supabase.from("legalizacao_template").select("id, tipo, nome, ativo").order("nome");
  const rows = tpls ?? [];
  const ids = rows.map((t) => t.id as string);
  const { data: etapas } = ids.length ? await supabase.from("legalizacao_template_etapa").select("template_id").in("template_id", ids) : { data: [] };
  const cont = new Map<string, number>();
  for (const e of etapas ?? []) cont.set(e.template_id as string, (cont.get(e.template_id as string) ?? 0) + 1);
  return rows.map((t) => ({ id: t.id as string, tipo: t.tipo as LegTipo, nome: t.nome as string, ativo: t.ativo as boolean, etapas: cont.get(t.id as string) ?? 0 }));
}

export async function obterModelo(id: string): Promise<ModeloDetalhe | null> {
  if (!(await admin())) return null;
  const supabase = await createServerSupabase();
  const { data: t } = await supabase.from("legalizacao_template").select("id, tipo, nome, descricao, ativo").eq("id", id).maybeSingle();
  if (!t) return null;
  const { data: etapas } = await supabase.from("legalizacao_template_etapa").select("id, ordem, titulo, descricao, orgao, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente").eq("template_id", id).order("ordem");
  return {
    id: t.id as string, tipo: t.tipo as LegTipo, nome: t.nome as string, descricao: (t.descricao as string | null) ?? null, ativo: t.ativo as boolean,
    etapas: (etapas ?? []).map((e) => ({ id: e.id as string, ordem: e.ordem as number, titulo: e.titulo as string, descricao: (e.descricao as string | null) ?? null, orgao: e.orgao as LegOrgao, prazoDias: (e.prazo_dias as number | null) ?? null, responsavelPapel: (e.responsavel_papel as string | null) ?? null, anexoObrigatorio: e.anexo_obrigatorio as boolean, avisarCliente: e.avisar_cliente as boolean })),
  };
}

export async function criarModelo(input: { tipo: string; nome: string; descricao: string | null }): Promise<{ id?: string; erro?: string }> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!TIPOS.has(input.tipo as LegTipo)) return { erro: "Tipo inválido." };
  const nome = input.nome.trim().slice(0, 160);
  if (!nome) return { erro: "Informe o nome." };
  const supabase = await createServerSupabase();
  const { data: existentesRaw } = await supabase.from("legalizacao_template").select("slug");
  const slug = slugModelo(nome, (existentesRaw ?? []).map((x) => x.slug as string));
  const { data, error } = await supabase.from("legalizacao_template").insert({ tipo: input.tipo, slug, nome, descricao: input.descricao }).select("id").single();
  if (error || !data) return { erro: "Falha ao criar." };
  revalidatePath("/configuracoes/legalizacao");
  return { id: data.id as string };
}

export async function salvarModelo(id: string, input: { nome: string; descricao: string | null; tipo: string; ativo: boolean }): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!TIPOS.has(input.tipo as LegTipo)) return { erro: "Tipo inválido." };
  const nome = input.nome.trim().slice(0, 160);
  if (!nome) return { erro: "Informe o nome." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("legalizacao_template").update({ nome, descricao: input.descricao, tipo: input.tipo, ativo: input.ativo }).eq("id", id);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath(`/configuracoes/legalizacao/${id}`);
  revalidatePath("/configuracoes/legalizacao");
  return { ok: true };
}

export async function excluirModelo(id: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("legalizacao_template").delete().eq("id", id);
  if (error) return { erro: "Falha ao excluir." };
  revalidatePath("/configuracoes/legalizacao");
  return { ok: true };
}

export async function salvarEtapa(input: { id?: string; templateId: string; titulo: string; descricao: string | null; orgao: string; prazoDias: number | null; responsavelPapel: string | null; anexoObrigatorio: boolean; avisarCliente: boolean }): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!ORGAOS.has(input.orgao as LegOrgao)) return { erro: "Órgão inválido." };
  const titulo = input.titulo.trim().slice(0, 200);
  if (!titulo) return { erro: "Informe o título da etapa." };
  const supabase = await createServerSupabase();
  const campos = { titulo, descricao: input.descricao, orgao: input.orgao, prazo_dias: input.prazoDias, responsavel_papel: input.responsavelPapel || null, anexo_obrigatorio: input.anexoObrigatorio, avisar_cliente: input.avisarCliente };
  if (input.id) {
    const { error } = await supabase.from("legalizacao_template_etapa").update(campos).eq("id", input.id);
    if (error) return { erro: "Falha ao salvar a etapa." };
  } else {
    const { data: maxRow } = await supabase.from("legalizacao_template_etapa").select("ordem").eq("template_id", input.templateId).order("ordem", { ascending: false }).limit(1).maybeSingle();
    const ordem = ((maxRow?.ordem as number | undefined) ?? 0) + 1;
    const { error } = await supabase.from("legalizacao_template_etapa").insert({ template_id: input.templateId, ordem, ...campos });
    if (error) return { erro: "Falha ao criar a etapa." };
  }
  revalidatePath(`/configuracoes/legalizacao/${input.templateId}`);
  return { ok: true };
}

export async function excluirEtapa(id: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const supabase = await createServerSupabase();
  const { data: e } = await supabase.from("legalizacao_template_etapa").select("template_id").eq("id", id).maybeSingle();
  const { error } = await supabase.from("legalizacao_template_etapa").delete().eq("id", id);
  if (error) return { erro: "Falha ao excluir a etapa." };
  if (e) revalidatePath(`/configuracoes/legalizacao/${e.template_id}`);
  return { ok: true };
}

export async function reordenarEtapa(id: string, direcao: "cima" | "baixo"): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const supabase = await createServerSupabase();
  const { data: atual } = await supabase.from("legalizacao_template_etapa").select("id, ordem, template_id").eq("id", id).maybeSingle();
  if (!atual) return { erro: "Etapa não encontrada." };
  const op = direcao === "cima" ? "lt" : "gt";
  const asc = direcao === "cima" ? false : true;
  const { data: vizinha } = await supabase.from("legalizacao_template_etapa")
    .select("id, ordem").eq("template_id", atual.template_id as string)[op]("ordem", atual.ordem as number)
    .order("ordem", { ascending: asc }).limit(1).maybeSingle();
  if (!vizinha) return { ok: true };
  await supabase.from("legalizacao_template_etapa").update({ ordem: vizinha.ordem }).eq("id", atual.id);
  await supabase.from("legalizacao_template_etapa").update({ ordem: atual.ordem }).eq("id", vizinha.id);
  revalidatePath(`/configuracoes/legalizacao/${atual.template_id}`);
  return { ok: true };
}
```

- [ ] **Step 2:** `lint && typecheck`.
- [ ] **Step 3:** commit `feat: ações do editor de modelos de legalização`

---

### Task 3: Lista de modelos + hub

**Files:**
- Create `src/app/(app)/configuracoes/legalizacao/page.tsx`
- Create `src/app/(app)/configuracoes/legalizacao/ModelosLista.tsx`
- Modify `src/app/(app)/configuracoes/page.tsx` (ITENS)

- [ ] **Step 1: page.tsx (server)** — gate admin (`redirect("/")`); `listarModelos()`; renderiza `PageHeader` + `ModelosLista`.
- [ ] **Step 2: ModelosLista.tsx (client)** — tabela (nome, tipo via `rotuloTipo`, nº etapas, ativo) com link `→ /configuracoes/legalizacao/{id}`; bloco "Novo modelo": `<select>` tipo (`LEGALIZACAO_TIPOS`) + input nome + `criarModelo` → `router.push` para o editor.
- [ ] **Step 3: hub** — em `configuracoes/page.tsx`, adicionar ao ITENS: `{ href: "/configuracoes/legalizacao", label: "Modelos de legalização", desc: "Processos societários e de legalização (etapas por órgão)." }`.
- [ ] **Step 4:** `lint && typecheck`.
- [ ] **Step 5:** commit `feat: lista de modelos de legalização + item no hub`

---

### Task 4: Editor do modelo (metadados + etapas)

**Files:**
- Create `src/app/(app)/configuracoes/legalizacao/[id]/page.tsx`
- Create `src/app/(app)/configuracoes/legalizacao/[id]/EditorModelo.tsx`

- [ ] **Step 1: page.tsx (server)** — gate admin; `obterModelo(id)` (senão `notFound()`); renderiza `EditorModelo`.
- [ ] **Step 2: EditorModelo.tsx (client)**:
  - metadados: nome, descrição, `<select>` tipo (`LEGALIZACAO_TIPOS`), checkbox ativo → `salvarModelo`; botão "Excluir modelo" (confirm) → `excluirModelo` + `router.push("/configuracoes/legalizacao")`.
  - etapas: lista ordenada; cada etapa com título, descrição, `<select>` órgão (`LEGALIZACAO_ORGAOS`), prazo (nº), `<select>` responsável por papel (admin/contador/assistente/financeiro ou "—"), checkboxes anexo obrigatório / avisar cliente; botões **↑ ↓** (`reordenarEtapa`), **salvar** (`salvarEtapa`), **remover** (`excluirEtapa`); botão "+ etapa" (cria em branco via `salvarEtapa` sem id, com título placeholder) — ou um formulário de nova etapa. Após cada ação, `router.refresh()`.
- [ ] **Step 3:** `lint && typecheck`.
- [ ] **Step 4:** commit `feat: editor de modelo de legalização (metadados + etapas + reordenar)`

---

### Task 5: RLS assert + docs

**Files:** Modify `supabase/tests/rls.test.sql`, `docs/DOCUMENTACAO.md`

- [ ] **Step 1: Assert** — contador NÃO cria template (barrado); admin cria.

```sql
-- ASSERT: legalizacao_template — só admin escreve
do $$
declare ok boolean;
begin
  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador
  ok := true;
  begin
    insert into legalizacao_template (tipo, slug, nome) values ('baixa','tpl-contador-rls','X');
    raise exception 'FALHA: contador criou template';
  exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'FALHA: contador criou template (sem erro)'; end if;
  reset role;
  raise notice 'OK: legalizacao_template só admin escreve';
end $$;
```

- [ ] **Step 2:** `npm run db:test 2>&1 | grep -icE "FALHA|error"` → `0`.
- [ ] **Step 3: docs** — em `DOCUMENTACAO.md` (Configurações): acrescentar **Modelos de legalização** (admin cria/edita modelos e etapas; completa RF-012). Atualizar a nota da seção Legalização (Fatia B entregue; falta só a Fatia C — termo NBC PG 01).
- [ ] **Step 4:** commit `test+docs: RLS do editor de modelos de legalização`

---

## Self-Review
- slugModelo → T1. ✔
- CRUD modelo/etapa + reordenar (admin, RLS reforça) → T2. ✔
- Lista + hub → T3. ✔
- Editor → T4. ✔
- RLS + docs → T5. ✔
- Sem migration (tabelas/RLS já existem). Excluir modelo não afeta processos (instâncias são cópias).
