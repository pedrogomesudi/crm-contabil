# Onboarding — v2: construtor de templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construtor completo de templates de onboarding na UI — criar/editar/ativar/excluir templates, CRUD e reordenação de blocos/itens, e escolher o template ao instanciar.

**Architecture:** Sem mudança de schema; helpers puros (slugify/reordenação); actions de template/bloco/mover; gerenciador de templates + editor por template (rota `[id]`) + seletor no formulário de instanciação. Spec: `docs/superpowers/specs/2026-07-08-onboarding-v2-construtor-templates-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase (Postgres/RLS), Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`. Todos passam.
- Sem migration. Gate `podeGerenciarModeloOnboarding` (admin) para escrever template/bloco/item; `podeCriarCliente` para ler/instanciar.
- Excluir template com processos → erro amigável (desativar). Reordenar troca valores de `ordem` (dois updates). Slug único (sufixo `-2/-3…`).
- Tokens SALDO na UI. Branch: `git checkout -b feat/onboarding-v2 develop`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `src/lib/onboarding/template-util.ts` — **novo**: `slugify`, `alvoTroca`.
- `src/tests/onboarding/template-util.test.ts` — **novo**.
- `src/app/(app)/onboarding/template-actions.ts` — **modificar**: templates/blocos/mover + `obterTemplate`.
- `src/app/(app)/clientes/[id]/processo.ts` — **modificar**: `iniciarProcesso(templateId)`.
- `src/components/onboarding/ProcessoSection.tsx` — **modificar**: seletor de template.
- `src/app/(app)/clientes/[id]/page.tsx` — **modificar**: passar templates ativos.
- `src/app/(app)/configuracoes/onboarding/page.tsx` — **modificar**: vira o gerenciador.
- `src/app/(app)/configuracoes/onboarding/GerenciadorTemplates.tsx` — **novo**.
- `src/app/(app)/configuracoes/onboarding/[id]/page.tsx` — **novo**: editor por template.
- `src/app/(app)/configuracoes/onboarding/EditorTemplate.tsx` — **modificar**: blocos + settings + ↑↓.
- Testes de smoke: `gerenciador-templates-render.test.tsx`, e o smoke do `EditorTemplate` (novo).

---

## Task 1: Helpers puros (TDD)

**Files:**
- Create: `src/lib/onboarding/template-util.ts`
- Test: `src/tests/onboarding/template-util.test.ts`

**Interfaces:**
- Produces: `slugify(nome: string): string`; `alvoTroca(itens: { id: string; ordem: number }[], id: string, direcao: "cima" | "baixo"): string | null`.

- [ ] **Step 1: Testes**

```ts
import { describe, it, expect } from "vitest";
import { slugify, alvoTroca } from "@/lib/onboarding/template-util";

describe("slugify", () => {
  it("acentos, espaços e símbolos", () => {
    expect(slugify("Abertura Simples")).toBe("abertura-simples");
    expect(slugify("Alteração de Quadro!")).toBe("alteracao-de-quadro");
    expect(slugify("  Baixa / Encerramento  ")).toBe("baixa-encerramento");
  });
});

describe("alvoTroca", () => {
  const itens = [{ id: "a", ordem: 1 }, { id: "b", ordem: 5 }, { id: "c", ordem: 9 }];
  it("meio: cima/baixo", () => {
    expect(alvoTroca(itens, "b", "cima")).toBe("a");
    expect(alvoTroca(itens, "b", "baixo")).toBe("c");
  });
  it("bordas → null", () => {
    expect(alvoTroca(itens, "a", "cima")).toBe(null);
    expect(alvoTroca(itens, "c", "baixo")).toBe(null);
  });
  it("id ausente → null", () => {
    expect(alvoTroca(itens, "x", "cima")).toBe(null);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- template-util` → FAIL.

- [ ] **Step 3: Implementar `template-util.ts`**

```ts
export function slugify(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function alvoTroca(itens: { id: string; ordem: number }[], id: string, direcao: "cima" | "baixo"): string | null {
  const ord = [...itens].sort((a, b) => a.ordem - b.ordem);
  const idx = ord.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  const alvo = direcao === "cima" ? idx - 1 : idx + 1;
  if (alvo < 0 || alvo >= ord.length) return null;
  return ord[alvo]!.id;
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- template-util` (PASS), `npm run lint`, `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding/template-util.ts src/tests/onboarding/template-util.test.ts
git commit -m "feat(onboarding): helpers slugify + alvoTroca (construtor de templates)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Actions de template (CRUD + obter + listar)

**Files:**
- Modify: `src/app/(app)/onboarding/template-actions.ts`

**Interfaces:**
- Consumes: `slugify` (Task 1).
- Produces: `TemplateView` (com `descricao`/`ativo`); `type TemplateResumo`; `obterTemplate(id)`, `listarTemplates()`, `listarTemplatesAtivos()`, `criarTemplate(nome, descricao)`, `salvarTemplate(id, nome, descricao, ativo)`, `excluirTemplate(id)`. Mantém `listarTemplate()`.

- [ ] **Step 1: Estender `TemplateView` e adicionar `import { slugify }`**

Trocar a linha do tipo:
```ts
export type TemplateView = { id: string; slug: string; nome: string; descricao: string | null; ativo: boolean; blocos: BlocoView[] } | null;
```
Adicionar no topo: `import { slugify } from "@/lib/onboarding/template-util";`.

- [ ] **Step 2: Extrair carga por id + atualizar `listarTemplate`**

Substituir a função `listarTemplate` por um par (carrega por id; a antiga acha o primeiro ativo):
```ts
async function carregarBlocos(supabase: Awaited<ReturnType<typeof createServerSupabase>>, tpl: { id: string; slug: string; nome: string; descricao: string | null; ativo: boolean }): Promise<NonNullable<TemplateView>> {
  const { data: blocos } = await supabase.from("onboarding_bloco").select("id, ordem, nome, prazo_bloco_dias").eq("template_id", tpl.id).order("ordem");
  const { data: itens } = await supabase.from("onboarding_template_item").select("id, bloco_id, codigo, titulo, descricao, tipo, responsavel_papel, prazo_dias, aplicavel_a, condicao_flags, condicao_modo, bloqueante, anexo_obrigatorio, alerta_risco, ordem, depende_de, campo_destino").in("bloco_id", (blocos ?? []).map((b) => b.id as string)).order("ordem");
  const porBloco = (bid: string): ItemTemplateView[] =>
    (itens ?? []).filter((i) => i.bloco_id === bid).map((i) => ({ id: i.id as string, blocoId: i.bloco_id as string, codigo: i.codigo as string, titulo: i.titulo as string, descricao: i.descricao as string | null, tipo: i.tipo as "padrao" | "acesso", responsavelPapel: i.responsavel_papel as string | null, prazoDias: i.prazo_dias as number | null, aplicavelA: (i.aplicavel_a as string[]) ?? [], condicaoFlags: (i.condicao_flags as string[]) ?? [], condicaoModo: i.condicao_modo as "any" | "all", bloqueante: i.bloqueante as boolean, anexoObrigatorio: i.anexo_obrigatorio as boolean, alertaRisco: i.alerta_risco as string | null, ordem: i.ordem as number, dependeDe: (i.depende_de as string[]) ?? [], campoDestino: i.campo_destino as string | null }));
  return { id: tpl.id, slug: tpl.slug, nome: tpl.nome, descricao: tpl.descricao, ativo: tpl.ativo, blocos: (blocos ?? []).map((b) => ({ id: b.id as string, ordem: b.ordem as number, nome: b.nome as string, prazoBlocoDias: b.prazo_bloco_dias as number | null, itens: porBloco(b.id as string) })) };
}

export async function listarTemplate(): Promise<TemplateView> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return null;
  const supabase = await createServerSupabase();
  const { data: tpl } = await supabase.from("onboarding_template").select("id, slug, nome, descricao, ativo").eq("ativo", true).order("criado_em").limit(1).maybeSingle();
  if (!tpl) return null;
  return carregarBlocos(supabase, tpl as { id: string; slug: string; nome: string; descricao: string | null; ativo: boolean });
}

export async function obterTemplate(templateId: string): Promise<TemplateView> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return null;
  const supabase = await createServerSupabase();
  const { data: tpl } = await supabase.from("onboarding_template").select("id, slug, nome, descricao, ativo").eq("id", templateId).maybeSingle();
  if (!tpl) return null;
  return carregarBlocos(supabase, tpl as { id: string; slug: string; nome: string; descricao: string | null; ativo: boolean });
}
```
(Se o `porBloco` já existia dentro do `listarTemplate` antigo, ele agora vive em `carregarBlocos`.)

- [ ] **Step 3: Listas + CRUD de template** — adicionar ao arquivo:

```ts
export type TemplateResumo = { id: string; nome: string; descricao: string | null; ativo: boolean; blocos: number; itens: number; processos: number };

export async function listarTemplates(): Promise<TemplateResumo[]> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return [];
  const supabase = await createServerSupabase();
  const { data: tpls } = await supabase.from("onboarding_template").select("id, nome, descricao, ativo").order("nome");
  if (!tpls || tpls.length === 0) return [];
  const ids = tpls.map((t) => t.id as string);
  const { data: blocos } = await supabase.from("onboarding_bloco").select("id, template_id").in("template_id", ids);
  const blocoIds = (blocos ?? []).map((b) => b.id as string);
  const { data: itens } = blocoIds.length ? await supabase.from("onboarding_template_item").select("bloco_id").in("bloco_id", blocoIds) : { data: [] as { bloco_id: string }[] };
  const { data: procs } = await supabase.from("onboarding_processo").select("template_id").in("template_id", ids);
  const blocoDoItem = new Map((blocos ?? []).map((b) => [b.id as string, b.template_id as string]));
  const nBlocos = new Map<string, number>();
  for (const b of blocos ?? []) nBlocos.set(b.template_id as string, (nBlocos.get(b.template_id as string) ?? 0) + 1);
  const nItens = new Map<string, number>();
  for (const i of itens ?? []) { const t = blocoDoItem.get(i.bloco_id as string); if (t) nItens.set(t, (nItens.get(t) ?? 0) + 1); }
  const nProcs = new Map<string, number>();
  for (const pr of procs ?? []) nProcs.set(pr.template_id as string, (nProcs.get(pr.template_id as string) ?? 0) + 1);
  return tpls.map((t) => ({ id: t.id as string, nome: t.nome as string, descricao: t.descricao as string | null, ativo: t.ativo as boolean, blocos: nBlocos.get(t.id as string) ?? 0, itens: nItens.get(t.id as string) ?? 0, processos: nProcs.get(t.id as string) ?? 0 }));
}

export async function listarTemplatesAtivos(): Promise<{ id: string; nome: string }[]> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("onboarding_template").select("id, nome").eq("ativo", true).order("nome");
  return (data ?? []).map((t) => ({ id: t.id as string, nome: t.nome as string }));
}

export async function criarTemplate(nome: string, descricao: string | null): Promise<{ id?: string; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  if (!nome.trim()) return { erro: "Informe o nome." };
  const supabase = await createServerSupabase();
  const base = slugify(nome) || "template";
  const { data: existentes } = await supabase.from("onboarding_template").select("slug");
  const usados = new Set((existentes ?? []).map((t) => t.slug as string));
  let slug = base;
  let n = 2;
  while (usados.has(slug)) slug = `${base}-${n++}`;
  const { data, error } = await supabase.from("onboarding_template").insert({ slug, nome: nome.trim(), descricao }).select("id").single();
  if (error || !data) return { erro: "Falha ao criar." };
  return { id: data.id as string };
}

export async function salvarTemplate(id: string, nome: string, descricao: string | null, ativo: boolean): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("onboarding_template").update({ nome: nome.trim(), descricao, ativo }).eq("id", id);
  return error ? { erro: "Falha ao salvar." } : { ok: true };
}

export async function excluirTemplate(id: string): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { count } = await supabase.from("onboarding_processo").select("id", { count: "exact", head: true }).eq("template_id", id);
  if ((count ?? 0) > 0) return { erro: "Há processos usando este template; desative-o em vez de excluir." };
  const { error } = await supabase.from("onboarding_template").delete().eq("id", id);
  return error ? { erro: "Falha ao excluir." } : { ok: true };
}
```

- [ ] **Step 4: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build` (sem erros).
```bash
git add "src/app/(app)/onboarding/template-actions.ts"
git commit -m "feat(onboarding): actions de template (CRUD, obter, listar)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Actions de bloco + reordenação

**Files:**
- Modify: `src/app/(app)/onboarding/template-actions.ts`

**Interfaces:**
- Consumes: `alvoTroca` (Task 1).
- Produces: `criarBloco`, `salvarBloco`, `removerBloco`, `moverBloco`, `moverItem`.

- [ ] **Step 1: Adicionar `import { slugify, alvoTroca }`** (trocar o import da Task 2 para incluir `alvoTroca`).

- [ ] **Step 2: Adicionar as actions**

```ts
export async function criarBloco(templateId: string, nome: string, prazoBlocoDias: number | null): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  if (!nome.trim()) return { erro: "Informe o nome do bloco." };
  const supabase = await createServerSupabase();
  const { data: existentes } = await supabase.from("onboarding_bloco").select("ordem").eq("template_id", templateId);
  const ordem = Math.max(0, ...(existentes ?? []).map((b) => b.ordem as number)) + 1;
  const { error } = await supabase.from("onboarding_bloco").insert({ template_id: templateId, nome: nome.trim(), prazo_bloco_dias: prazoBlocoDias, ordem, slug: `bloco-${ordem}` });
  return error ? { erro: "Falha ao criar bloco." } : { ok: true };
}

export async function salvarBloco(id: string, nome: string, prazoBlocoDias: number | null, ordem: number): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("onboarding_bloco").update({ nome: nome.trim(), prazo_bloco_dias: prazoBlocoDias, ordem }).eq("id", id);
  return error ? { erro: "Falha ao salvar bloco." } : { ok: true };
}

export async function removerBloco(id: string): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("onboarding_bloco").delete().eq("id", id);
  return error ? { erro: "Falha ao remover bloco." } : { ok: true };
}

async function trocarOrdem(tabela: "onboarding_bloco" | "onboarding_template_item", aId: string, bId: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from(tabela).select("id, ordem").in("id", [aId, bId]);
  const a = (data ?? []).find((r) => r.id === aId);
  const b = (data ?? []).find((r) => r.id === bId);
  if (!a || !b) return;
  await supabase.from(tabela).update({ ordem: b.ordem }).eq("id", aId);
  await supabase.from(tabela).update({ ordem: a.ordem }).eq("id", bId);
}

export async function moverBloco(id: string, direcao: "cima" | "baixo"): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: bloco } = await supabase.from("onboarding_bloco").select("template_id").eq("id", id).maybeSingle();
  if (!bloco) return { erro: "Bloco não encontrado." };
  const { data: irmaos } = await supabase.from("onboarding_bloco").select("id, ordem").eq("template_id", bloco.template_id as string);
  const alvo = alvoTroca((irmaos ?? []).map((b) => ({ id: b.id as string, ordem: b.ordem as number })), id, direcao);
  if (alvo) await trocarOrdem("onboarding_bloco", id, alvo);
  return { ok: true };
}

export async function moverItem(id: string, direcao: "cima" | "baixo"): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: item } = await supabase.from("onboarding_template_item").select("bloco_id").eq("id", id).maybeSingle();
  if (!item) return { erro: "Item não encontrado." };
  const { data: irmaos } = await supabase.from("onboarding_template_item").select("id, ordem").eq("bloco_id", item.bloco_id as string);
  const alvo = alvoTroca((irmaos ?? []).map((i) => ({ id: i.id as string, ordem: i.ordem as number })), id, direcao);
  if (alvo) await trocarOrdem("onboarding_template_item", id, alvo);
  return { ok: true };
}
```

- [ ] **Step 3: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build` (sem erros).
```bash
git add "src/app/(app)/onboarding/template-actions.ts"
git commit -m "feat(onboarding): actions de bloco + reordenação (mover)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `iniciarProcesso(templateId)` + seletor no formulário

**Files:**
- Modify: `src/app/(app)/clientes/[id]/processo.ts`
- Modify: `src/components/onboarding/ProcessoSection.tsx`
- Modify: `src/app/(app)/clientes/[id]/page.tsx`

**Interfaces:**
- Consumes: `listarTemplatesAtivos` (Task 2).
- Produces: `iniciarProcesso(clienteId, perfil, flags, dataInicio, templateId)`.

- [ ] **Step 1: `iniciarProcesso` recebe `templateId`** — em `processo.ts`:

Trocar a assinatura para `... dataInicio: string, templateId: string)` e a busca do template:
```ts
  const { data: tpl } = await supabase.from("onboarding_template").select("id").eq("id", templateId).eq("ativo", true).maybeSingle();
  if (!tpl) return { erro: "Template inválido ou inativo." };
```
(substitui o `.eq("ativo", true).order("criado_em").limit(1).maybeSingle()`).

- [ ] **Step 2: `ProcessoSection` — prop `templates` + seletor**

Na assinatura de props, adicionar `templates: { id: string; nome: string }[]`. Adicionar estado:
```ts
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? "");
```
No formulário de iniciar (branch `!processo` → `abrindo`), adicionar antes do seletor de perfil:
```tsx
              <label className="text-xs text-cinza">Template
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="mt-0.5 block rounded-lg border border-linha px-2 py-1.5 text-sm">
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </label>
```
E trocar a chamada de criar:
```tsx
              <Botao variante="primario" disabled={ocupado || !templateId} onClick={() => chamar(() => iniciarProcesso(clienteId, perfil, flags, dataInicio, templateId))}>Criar processo</Botao>
```
Se `templates.length === 0`, mostrar no lugar do botão "Iniciar processo" o aviso `Cadastre um template ativo em Configurações → Template de onboarding.` (condicional: quando `!processo && templates.length === 0`).

- [ ] **Step 3: Página do cliente — passar templates ativos**

Em `page.tsx`, no bloco `if (podeOnboarding) { ... }` adicionar:
```ts
    var templatesOnb: { id: string; nome: string }[] = [];
```
(na verdade, declarar `let templatesOnb: { id: string; nome: string }[] = [];` junto com `usuariosOnb`, e dentro do `if`:)
```ts
    templatesOnb = await listarTemplatesAtivos();
```
Import: `import { listarTemplatesAtivos } from "@/app/(app)/onboarding/template-actions";`.
No JSX, passar `templates={templatesOnb}` ao `<ProcessoSection ... />`.

- [ ] **Step 4: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde — o smoke do `ProcessoSection` precisa da prop nova).
Ajuste no smoke `processo-section-render.test.tsx`: adicionar `templates={[{ id: "t1", nome: "Padrão" }]}` às duas renderizações.
```bash
git add "src/app/(app)/clientes/[id]/processo.ts" src/components/onboarding/ProcessoSection.tsx "src/app/(app)/clientes/[id]/page.tsx" src/tests/onboarding/processo-section-render.test.tsx
git commit -m "feat(onboarding): escolher template ao instanciar processo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Gerenciador de templates (lista)

**Files:**
- Create: `src/app/(app)/configuracoes/onboarding/GerenciadorTemplates.tsx`
- Modify: `src/app/(app)/configuracoes/onboarding/page.tsx`
- Test: `src/tests/onboarding/gerenciador-templates-render.test.tsx`

**Interfaces:**
- Consumes: `listarTemplates`, `criarTemplate`, `salvarTemplate`, `excluirTemplate`, `semearTemplatePadrao`, `type TemplateResumo` (Task 2).

- [ ] **Step 1: Smoke test**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/onboarding/template-actions", () => ({ criarTemplate: vi.fn(), salvarTemplate: vi.fn(), excluirTemplate: vi.fn(), semearTemplatePadrao: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { GerenciadorTemplates } from "@/app/(app)/configuracoes/onboarding/GerenciadorTemplates";

describe("GerenciadorTemplates", () => {
  it("vazio mostra semear", () => {
    const html = renderToStaticMarkup(<GerenciadorTemplates templates={[]} />);
    expect(html).toContain("Semear template padrão");
  });
  it("lista templates", () => {
    const html = renderToStaticMarkup(<GerenciadorTemplates templates={[{ id: "t1", nome: "Onboarding padrão", descricao: null, ativo: true, blocos: 7, itens: 36, processos: 1 }]} />);
    expect(html).toContain("Onboarding padrão");
    expect(html).toContain("Novo template");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- gerenciador-templates-render` → FAIL.

- [ ] **Step 3: `GerenciadorTemplates.tsx`**

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { criarTemplate, salvarTemplate, excluirTemplate, semearTemplatePadrao, type TemplateResumo } from "@/app/(app)/onboarding/template-actions";
import { Botao } from "@/components/ui/Botao";

export function GerenciadorTemplates({ templates }: { templates: TemplateResumo[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [novo, setNovo] = useState<{ nome: string; descricao: string } | null>(null);

  async function chamar(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    router.refresh();
  }
  async function criar() {
    if (!novo) return;
    setOcupado(true);
    const r = await criarTemplate(novo.nome, novo.descricao || null);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    setNovo(null);
    if (r.id) router.push(`/configuracoes/onboarding/${r.id}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        {templates.length === 0 && (
          <Botao variante="secundario" disabled={ocupado} onClick={() => chamar(() => semearTemplatePadrao())}>Semear template padrão</Botao>
        )}
        <Botao variante="primario" disabled={ocupado} onClick={() => setNovo({ nome: "", descricao: "" })}>Novo template</Botao>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-cinza">Nenhum template. Semeie o padrão ou crie um novo.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-linha text-xs text-cinza">
                <th className="px-3 py-2 text-left font-medium">Template</th>
                <th className="px-3 py-2 text-right font-medium">Blocos</th>
                <th className="px-3 py-2 text-right font-medium">Itens</th>
                <th className="px-3 py-2 text-right font-medium">Processos</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-linha/60">
                  <td className="px-3 py-2">
                    <Link href={`/configuracoes/onboarding/${t.id}`} className="font-medium text-texto underline decoration-linha hover:decoration-verde">{t.nome}</Link>
                    {!t.ativo && <span className="ml-2 rounded bg-cinza/10 px-1.5 text-[10px] text-cinza">inativo</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.blocos}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.itens}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.processos}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => chamar(() => salvarTemplate(t.id, t.nome, t.descricao, !t.ativo))} className="mr-3 text-xs text-cinza underline">{t.ativo ? "Desativar" : "Ativar"}</button>
                    <button type="button" onClick={() => { if (confirm(`Excluir "${t.nome}"?`)) void chamar(() => excluirTemplate(t.id)); }} className="text-xs text-negativo underline">Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {novo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md space-y-2 rounded-2xl bg-white p-5">
            <h3 className="font-display text-sm font-semibold text-texto">Novo template</h3>
            <label className="block text-xs text-cinza">Nome
              <input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
            </label>
            <label className="block text-xs text-cinza">Descrição
              <textarea value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} rows={2} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Botao variante="fantasma" onClick={() => setNovo(null)}>Cancelar</Botao>
              <Botao variante="primario" disabled={ocupado || !novo.nome.trim()} onClick={criar}>Criar e abrir</Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Reescrever `configuracoes/onboarding/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { GerenciadorTemplates } from "./GerenciadorTemplates";
import { listarTemplates } from "@/app/(app)/onboarding/template-actions";

export default async function ConfigOnboardingPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const templates = await listarTemplates();
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4">
      <PageHeader titulo="Template de onboarding" subtitulo="Modelos de processo de entrada de clientes" />
      <GerenciadorTemplates templates={templates} />
    </main>
  );
}
```

- [ ] **Step 5: Rodar + suite** — `npm test -- gerenciador-templates-render` (PASS), depois `npm run lint && npm run typecheck && npm test && npm run build` (o `EditorTemplate` fica órfão temporariamente — ainda compila).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/configuracoes/onboarding/GerenciadorTemplates.tsx" "src/app/(app)/configuracoes/onboarding/page.tsx" src/tests/onboarding/gerenciador-templates-render.test.tsx
git commit -m "feat(onboarding): gerenciador de templates (lista)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Editor por template (blocos + settings + ↑↓)

**Files:**
- Create: `src/app/(app)/configuracoes/onboarding/[id]/page.tsx`
- Modify: `src/app/(app)/configuracoes/onboarding/EditorTemplate.tsx`
- Test: `src/tests/onboarding/editor-template-render.test.tsx`

**Interfaces:**
- Consumes: `obterTemplate` (Task 2); `salvarTemplate`, `criarBloco`, `salvarBloco`, `removerBloco`, `moverBloco`, `moverItem`, `salvarTemplateItem`, `removerTemplateItem` (Tasks 2/3); `TemplateView`, `ItemTemplateView` (Task 2).

- [ ] **Step 1: Rota do editor `[id]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditorTemplate } from "../EditorTemplate";
import { obterTemplate } from "@/app/(app)/onboarding/template-actions";

export default async function EditorTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const template = await obterTemplate(id);
  if (!template) notFound();
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4">
      <PageHeader titulo={template.nome} subtitulo="Blocos e itens do template" />
      <EditorTemplate template={template} />
    </main>
  );
}
```

- [ ] **Step 2: Smoke test do editor**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/onboarding/template-actions", () => ({ salvarTemplate: vi.fn(), criarBloco: vi.fn(), salvarBloco: vi.fn(), removerBloco: vi.fn(), moverBloco: vi.fn(), moverItem: vi.fn(), salvarTemplateItem: vi.fn(), removerTemplateItem: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { EditorTemplate } from "@/app/(app)/configuracoes/onboarding/EditorTemplate";

const template = { id: "t1", slug: "s", nome: "Padrão", descricao: null, ativo: true, blocos: [
  { id: "b1", ordem: 1, nome: "Formalização", prazoBlocoDias: 3, itens: [
    { id: "i1", blocoId: "b1", codigo: "1.1", titulo: "Contrato", descricao: null, tipo: "padrao" as const, responsavelPapel: "admin", prazoDias: 0, aplicavelA: ["*"], condicaoFlags: [], condicaoModo: "all" as const, bloqueante: true, anexoObrigatorio: true, alertaRisco: null, ordem: 1, dependeDe: [], campoDestino: null },
  ] },
] };

describe("EditorTemplate", () => {
  it("renderiza blocos e itens", () => {
    const html = renderToStaticMarkup(<EditorTemplate template={template} />);
    expect(html).toContain("Formalização");
    expect(html).toContain("Contrato");
    expect(html).toContain("+ bloco");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar** — `npm test -- editor-template-render` → FAIL (o `EditorTemplate` atual não aceita esse shape / não tem "+ bloco").

- [ ] **Step 4: Reescrever `EditorTemplate.tsx`** (com gestão de blocos + settings + ↑↓; reaproveita o modal de item já existente)

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { salvarTemplate, criarBloco, salvarBloco, removerBloco, moverBloco, moverItem, salvarTemplateItem, removerTemplateItem, type TemplateView, type ItemTemplateView } from "@/app/(app)/onboarding/template-actions";
import { Botao } from "@/components/ui/Botao";

const PERFIS = ["mei", "simples_sem_func", "simples_com_func", "presumido_real", "pf"];
type Tpl = NonNullable<TemplateView>;
type FormItem = Partial<ItemTemplateView>;
type FormBloco = { id?: string; nome: string; prazoBlocoDias: number | null; ordem: number };

export function EditorTemplate({ template }: { template: Tpl }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [form, setForm] = useState<FormItem | null>(null);
  const [bloco, setBloco] = useState<FormBloco | null>(null);
  const [nome, setNome] = useState(template.nome);
  const [descricao, setDescricao] = useState(template.descricao ?? "");
  const [ativo, setAtivo] = useState(template.ativo);

  async function chamar(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    setForm(null);
    setBloco(null);
    router.refresh();
  }
  function salvarItem() {
    if (!form || !form.blocoId) return;
    void chamar(() => salvarTemplateItem({ id: form.id, blocoId: form.blocoId!, codigo: form.codigo ?? "", titulo: form.titulo ?? "", descricao: form.descricao ?? null, tipo: (form.tipo ?? "padrao") as "padrao" | "acesso", responsavelPapel: form.responsavelPapel ?? null, prazoDias: form.prazoDias ?? null, aplicavelA: form.aplicavelA ?? ["*"], condicaoFlags: form.condicaoFlags ?? [], condicaoModo: (form.condicaoModo ?? "all") as "any" | "all", bloqueante: form.bloqueante ?? false, anexoObrigatorio: form.anexoObrigatorio ?? false, alertaRisco: form.alertaRisco ?? null, ordem: form.ordem ?? 0, dependeDe: form.dependeDe ?? [], campoDestino: form.campoDestino ?? null }));
  }
  function salvarBlocoForm() {
    if (!bloco) return;
    void chamar(() => (bloco.id ? salvarBloco(bloco.id, bloco.nome, bloco.prazoBlocoDias, bloco.ordem) : criarBloco(template.id, bloco.nome, bloco.prazoBlocoDias)));
  }

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-2xl border border-linha bg-white p-4">
        <h3 className="font-display text-sm font-semibold text-texto">Configurações</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 text-xs text-cinza">Nome<input value={nome} onChange={(e) => setNome(e.target.value)} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" /></label>
          <label className="flex items-center gap-1 text-xs text-cinza"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativo</label>
        </div>
        <label className="block text-xs text-cinza">Descrição<textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" /></label>
        <div className="flex justify-end"><Botao variante="secundario" disabled={ocupado} onClick={() => chamar(() => salvarTemplate(template.id, nome, descricao || null, ativo))}>Salvar configurações</Botao></div>
      </section>

      <div className="flex justify-end"><Botao variante="primario" onClick={() => setBloco({ nome: "", prazoBlocoDias: null, ordem: 0 })}>+ bloco</Botao></div>

      {template.blocos.map((b) => (
        <div key={b.id} className="space-y-1.5 rounded-2xl border border-linha bg-white p-3">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-[12px] font-semibold uppercase tracking-wide text-texto">{b.ordem}. {b.nome}</h3>
            {b.prazoBlocoDias != null && <span className="font-mono text-[11px] text-cinza-claro">D+{b.prazoBlocoDias}</span>}
            <button type="button" onClick={() => chamar(() => moverBloco(b.id, "cima"))} className="text-cinza-claro hover:text-verde">↑</button>
            <button type="button" onClick={() => chamar(() => moverBloco(b.id, "baixo"))} className="text-cinza-claro hover:text-verde">↓</button>
            <button type="button" onClick={() => setBloco({ id: b.id, nome: b.nome, prazoBlocoDias: b.prazoBlocoDias, ordem: b.ordem })} className="text-xs text-cinza underline">editar</button>
            <button type="button" onClick={() => { if (confirm(`Remover o bloco "${b.nome}" e seus itens?`)) void chamar(() => removerBloco(b.id)); }} className="text-xs text-negativo underline">remover</button>
            <button type="button" onClick={() => setForm({ blocoId: b.id, tipo: "padrao", aplicavelA: ["*"], condicaoModo: "all", ordem: (b.itens.at(-1)?.ordem ?? 0) + 1 })} className="ml-auto text-xs text-cinza underline">+ item</button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-linha">
            <table className="min-w-full text-sm">
              <tbody>
                {b.itens.map((i) => (
                  <tr key={i.id} className="border-b border-linha/60">
                    <td className="px-2 py-2 font-mono text-[11px] text-cinza-claro">{i.codigo}</td>
                    <td className="px-2 py-2 text-texto">{i.titulo}{i.bloqueante && <span className="ml-2 rounded bg-negativo/10 px-1.5 text-[10px] text-negativo">bloq.</span>}{i.tipo === "acesso" && <span className="ml-2 rounded bg-verde/10 px-1.5 text-[10px] text-verde">cofre</span>}</td>
                    <td className="px-2 py-2 font-mono text-[11px] text-cinza">{i.prazoDias != null ? `D+${i.prazoDias}` : "—"}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <button type="button" onClick={() => chamar(() => moverItem(i.id, "cima"))} className="mr-1 text-cinza-claro hover:text-verde">↑</button>
                      <button type="button" onClick={() => chamar(() => moverItem(i.id, "baixo"))} className="mr-3 text-cinza-claro hover:text-verde">↓</button>
                      <button type="button" onClick={() => setForm(i)} className="mr-3 text-xs text-cinza underline">editar</button>
                      <button type="button" onClick={() => chamar(() => removerTemplateItem(i.id))} className="text-xs text-negativo underline">remover</button>
                    </td>
                  </tr>
                ))}
                {b.itens.length === 0 && <tr><td colSpan={4} className="px-2 py-2 text-cinza-claro">Sem itens.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {bloco && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm space-y-2 rounded-2xl bg-white p-5">
            <h3 className="font-display text-sm font-semibold text-texto">{bloco.id ? "Editar bloco" : "Novo bloco"}</h3>
            <label className="block text-xs text-cinza">Nome<input value={bloco.nome} onChange={(e) => setBloco({ ...bloco, nome: e.target.value })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" /></label>
            <div className="flex gap-2">
              <label className="w-28 text-xs text-cinza">Prazo D+<input type="number" value={bloco.prazoBlocoDias ?? ""} onChange={(e) => setBloco({ ...bloco, prazoBlocoDias: e.target.value === "" ? null : Number(e.target.value) })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" /></label>
              {bloco.id && <label className="w-24 text-xs text-cinza">Ordem<input type="number" value={bloco.ordem} onChange={(e) => setBloco({ ...bloco, ordem: Number(e.target.value) })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" /></label>}
            </div>
            <div className="flex justify-end gap-2 pt-1"><Botao variante="fantasma" onClick={() => setBloco(null)}>Cancelar</Botao><Botao variante="primario" disabled={ocupado || !bloco.nome.trim()} onClick={salvarBlocoForm}>Salvar</Botao></div>
          </div>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md space-y-2 rounded-2xl bg-white p-5">
            <h3 className="font-display text-sm font-semibold text-texto">{form.id ? "Editar item" : "Novo item"}</h3>
            <div className="flex gap-2">
              <label className="w-24 text-xs text-cinza">Código<input value={form.codigo ?? ""} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" /></label>
              <label className="flex-1 text-xs text-cinza">Título<input value={form.titulo ?? ""} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" /></label>
            </div>
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-cinza">Responsável (papel)<select value={form.responsavelPapel ?? ""} onChange={(e) => setForm({ ...form, responsavelPapel: e.target.value || null })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm"><option value="">—</option>{["admin", "contador", "assistente", "financeiro"].map((pp) => <option key={pp} value={pp}>{pp}</option>)}</select></label>
              <label className="w-24 text-xs text-cinza">Prazo D+<input type="number" value={form.prazoDias ?? ""} onChange={(e) => setForm({ ...form, prazoDias: e.target.value === "" ? null : Number(e.target.value) })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" /></label>
              <label className="w-28 text-xs text-cinza">Tipo<select value={form.tipo ?? "padrao"} onChange={(e) => setForm({ ...form, tipo: e.target.value as "padrao" | "acesso" })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm"><option value="padrao">Padrão</option><option value="acesso">Cofre</option></select></label>
            </div>
            <fieldset className="text-xs text-cinza"><legend>Aplicável aos perfis</legend>
              <label className="mr-3 inline-flex items-center gap-1"><input type="checkbox" checked={(form.aplicavelA ?? []).includes("*")} onChange={(e) => setForm({ ...form, aplicavelA: e.target.checked ? ["*"] : [] })} /> todos</label>
              {PERFIS.map((pf) => <label key={pf} className="mr-3 inline-flex items-center gap-1"><input type="checkbox" disabled={(form.aplicavelA ?? []).includes("*")} checked={(form.aplicavelA ?? []).includes(pf)} onChange={(e) => setForm({ ...form, aplicavelA: e.target.checked ? [...(form.aplicavelA ?? []).filter((x) => x !== "*"), pf] : (form.aplicavelA ?? []).filter((x) => x !== pf) })} /> {pf}</label>)}
            </fieldset>
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-cinza">Depende de (códigos, vírgula)<input value={(form.dependeDe ?? []).join(", ")} onChange={(e) => setForm({ ...form, dependeDe: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" placeholder="ex.: 4.6" /></label>
              <label className="flex-1 text-xs text-cinza">Grava em<select value={form.campoDestino ?? ""} onChange={(e) => setForm({ ...form, campoDestino: e.target.value || null })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm"><option value="">—</option><option value="competencia_inicial">Competência inicial</option></select></label>
            </div>
            <div className="flex gap-4 text-xs text-cinza">
              <label className="inline-flex items-center gap-1"><input type="checkbox" checked={form.bloqueante ?? false} onChange={(e) => setForm({ ...form, bloqueante: e.target.checked })} /> Bloqueante</label>
              <label className="inline-flex items-center gap-1"><input type="checkbox" checked={form.anexoObrigatorio ?? false} onChange={(e) => setForm({ ...form, anexoObrigatorio: e.target.checked })} /> Anexo obrigatório</label>
            </div>
            <div className="flex justify-end gap-2 pt-1"><Botao variante="fantasma" onClick={() => setForm(null)}>Cancelar</Botao><Botao variante="primario" disabled={ocupado || !(form.titulo ?? "").trim()} onClick={salvarItem}>Salvar</Botao></div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Remover `listarTemplate` (agora sem uso)**

Conferir: `grep -rn "listarTemplate\b" src` — só deve aparecer a definição em `template-actions.ts`. Remover a função `listarTemplate` (o gerenciador usa `listarTemplates`, o editor usa `obterTemplate`).

- [ ] **Step 6: Suite completa** — `npm test -- editor-template-render` (PASS), depois `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde; rota `/configuracoes/onboarding/[id]` compila).

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/configuracoes/onboarding/[id]/page.tsx" "src/app/(app)/configuracoes/onboarding/EditorTemplate.tsx" src/tests/onboarding/editor-template-render.test.tsx "src/app/(app)/onboarding/template-actions.ts"
git commit -m "feat(onboarding): editor por template (blocos + settings + reordenação)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Onboarding — construtor de templates:** Configurações → Template de onboarding vira um gerenciador de
  vários templates (criar, ativar/desativar, excluir) com editor por template — criar/editar/remover e
  **reordenar blocos e itens** (↑↓). Ao iniciar um processo, escolhe-se qual template aplicar.
```

- [ ] **Step 2: Commit + finalizar**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog do construtor de templates (v2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois usar `superpowers:finishing-a-development-branch`. (Sem migration, sem novos segredos.)

---

## Self-Review

- **Cobertura do spec:** helpers slugify/alvoTroca (T1) ✓; actions template CRUD + obter/listar (T2) ✓; blocos + mover (T3) ✓; iniciarProcesso(templateId) + seletor (T4) ✓; gerenciador (T5) ✓; editor por template com blocos/settings/↑↓ (T6) ✓; CHANGELOG (T7) ✓. Testes unit (T1) + smoke gerenciador/editor (T5/T6) ✓.
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Consistência de tipos:** `TemplateView` ampliado (descricao/ativo) em T2, consumido por T6; `TemplateResumo` (T2) → T5; `obterTemplate`/`listarTemplates`/`listarTemplatesAtivos` (T2) usados em T4/T5/T6; `criarBloco`/`salvarBloco`/`removerBloco`/`moverBloco`/`moverItem` (T3) → T6; `slugify`/`alvoTroca` (T1) → T2/T3; `iniciarProcesso(...,templateId)` (T4) chamado com o mesmo shape na UI. `salvarTemplateItem`/`removerTemplateItem` reutilizados. Smoke do `ProcessoSection` atualizado (prop `templates`) no T4.
- **Sequência sem quebra:** T2 mantém `listarTemplate` até o T6 removê-lo (após T5 tirar seu único consumidor). `EditorTemplate` fica órfão entre T5 e T6 (compila). 
- **Escopo:** só v2. Ciclo C fora.
