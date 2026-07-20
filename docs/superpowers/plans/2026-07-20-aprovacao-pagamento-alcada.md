# Aprovação de pagamento com alçada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** exigir aprovação (admin ≠ lançador) de despesas acima de uma alçada configurável, bloqueando a baixa até aprovar.

**Architecture:** `titulo.aprovacao` (null/pendente/aprovado) + `escritorio_config.alcada_pagamento`; lógica pura `requerAprovacao`/`podeAprovar`; `lancarDespesa` marca pendente, `registrarPagamento` bloqueia, `aprovarTitulo` libera; alçada na config; selo/botão em Contas a pagar.

**Tech Stack:** Next 16 (server actions), TypeScript, Tailwind 4, Supabase (Postgres/RLS), vitest.

## Global Constraints

- Next 16: imports `@/*`; `middleware.ts` é `proxy.ts`.
- RBAC: papel só via `auth_papel()`.
- Migrations: runner `npm run db:migrate`; imutáveis após aplicadas; idempotentes; numerar após `0114`.
- Guard `divida-ui`: controles sem `border` à mão → `controleCls`.
- `gate()` em `contas-a-pagar/actions.ts` = `podeGerenciarFinanceiro` (admin/financeiro); a aprovação exige `papel === "admin"` (checado por `podeAprovar`).
- `titulo` já tem `criado_por` (setado em `lancarDespesa`). `escritorio_config` é singleton `id=1` (admin).
- Rodar antes de entregar: `lint`, `typecheck`, `test`, `format`, `build`. PR `develop`→`main`; tag após deploy; versão+CHANGELOG no mesmo PR.

---

### Task 1: Migration 0115 — colunas de aprovação + alçada

**Files:**
- Create: `supabase/migrations/0115_aprovacao_pagamento.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Aprovação de pagamento com alçada.
alter table titulo add column if not exists aprovacao text check (aprovacao in ('pendente','aprovado'));
alter table titulo add column if not exists aprovado_por uuid references usuarios(id);
alter table titulo add column if not exists aprovado_em timestamptz;
alter table escritorio_config add column if not exists alcada_pagamento numeric(15,2);  -- null = sem alçada
```

- [ ] **Step 2: Conferir idempotência** (`add column if not exists`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0115_aprovacao_pagamento.sql
git commit -m "feat(fin): migration 0115 aprovacao de pagamento + alcada"
```

> Aplicada em produção no release, antes de Implantar.

---

### Task 2: Lógica pura — `requerAprovacao` + `podeAprovar`

**Files:**
- Create: `src/lib/financeiro/aprovacao.ts`
- Test: `src/tests/financeiro/aprovacao.test.ts`

**Interfaces:**
- Produces: `requerAprovacao(valor: number, alcada: number | null): boolean`; `podeAprovar(papel: string, perfilId: string, criadoPor: string | null): boolean`.

- [ ] **Step 1: Testes (falham)**

```ts
import { describe, it, expect } from "vitest";
import { requerAprovacao, podeAprovar } from "@/lib/financeiro/aprovacao";

describe("requerAprovacao", () => {
  it("sem alçada nunca requer", () => expect(requerAprovacao(9999, null)).toBe(false));
  it("acima da alçada requer", () => expect(requerAprovacao(1001, 1000)).toBe(true));
  it("igual ou abaixo não requer", () => {
    expect(requerAprovacao(1000, 1000)).toBe(false);
    expect(requerAprovacao(500, 1000)).toBe(false);
  });
});

describe("podeAprovar", () => {
  it("não-admin nunca aprova", () => expect(podeAprovar("financeiro", "u1", "u2")).toBe(false));
  it("admin não aprova a própria (segregação)", () => expect(podeAprovar("admin", "u1", "u1")).toBe(false));
  it("admin diferente do lançador aprova", () => expect(podeAprovar("admin", "u1", "u2")).toBe(true));
  it("criadoPor null: admin aprova", () => expect(podeAprovar("admin", "u1", null)).toBe(true));
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npx vitest run src/tests/financeiro/aprovacao.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// Requer aprovação quando há alçada e o valor a ultrapassa.
export function requerAprovacao(valor: number, alcada: number | null): boolean {
  return alcada != null && valor > alcada;
}

// Segregação: só admin aprova, e nunca a despesa que ele mesmo lançou.
export function podeAprovar(papel: string, perfilId: string, criadoPor: string | null): boolean {
  return papel === "admin" && perfilId !== criadoPor;
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npx vitest run src/tests/financeiro/aprovacao.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/financeiro/aprovacao.ts src/tests/financeiro/aprovacao.test.ts
git commit -m "feat(fin): logica pura requerAprovacao + podeAprovar"
```

---

### Task 3: Ações — marcar pendente, bloquear baixa, aprovar

**Files:**
- Modify: `src/app/(app)/financeiro/contas-a-pagar/actions.ts`

**Interfaces:**
- `TituloPagar` ganha `aprovacao: string | null` e `criadoPor: string | null`.
- Produces: `aprovarTitulo(tituloId: string): Promise<{ ok?: boolean; erro?: string }>`.

- [ ] **Step 1: `TituloPagar` + `listarTitulosPagar`**

- No `type TituloPagar`, adicionar `aprovacao: string | null;` e `criadoPor: string | null;`.
- No `.select(...)` de `listarTitulosPagar`, incluir `aprovacao, criado_por`; no map, `aprovacao: (t.aprovacao as string | null) ?? null` e `criadoPor: (t.criado_por as string | null) ?? null`.

- [ ] **Step 2: `lancarDespesa` marca pendente**

Após criar o `supabase` e antes de montar `rows`, carregar a alçada:

```ts
const { data: cfg } = await supabase.from("escritorio_config").select("alcada_pagamento").eq("id", 1).maybeSingle();
const alcada = (cfg?.alcada_pagamento as number | null) ?? null;
```

Import no topo: `import { requerAprovacao } from "@/lib/financeiro/aprovacao";`

No objeto de cada `row`, adicionar: `aprovacao: requerAprovacao(p.valor, alcada) ? "pendente" : null,` (o `criado_por: perfil.id` já existe).

- [ ] **Step 3: `registrarPagamento` bloqueia pendente**

Após validar os campos e criar o `supabase`, antes do `insert` da `baixa`:

```ts
const { data: tit } = await supabase.from("titulo").select("aprovacao").eq("id", tituloId).maybeSingle();
if (tit?.aprovacao === "pendente") return { erro: "Este pagamento aguarda aprovação." };
```

- [ ] **Step 4: `aprovarTitulo`** (nova; import `podeAprovar`)

```ts
export async function aprovarTitulo(tituloId: string): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: t } = await supabase.from("titulo").select("aprovacao, criado_por").eq("id", tituloId).maybeSingle();
  if (!t) return { erro: "Título não encontrado." };
  if (t.aprovacao !== "pendente") return { ok: true };
  if (!podeAprovar(perfil.papel, perfil.id, (t.criado_por as string | null) ?? null)) {
    return { erro: "Aprovação exige um admin diferente de quem lançou a despesa." };
  }
  const { error } = await supabase
    .from("titulo")
    .update({ aprovacao: "aprovado", aprovado_por: perfil.id, aprovado_em: new Date().toISOString() })
    .eq("id", tituloId);
  if (error) return { erro: "Falha ao aprovar." };
  revalidatePath(ROTA);
  return { ok: true };
}
```

- [ ] **Step 5: Typecheck** — Run: `npm run typecheck` — Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/financeiro/contas-a-pagar/actions.ts"
git commit -m "feat(fin): lancar marca pendente, baixa bloqueia, aprovarTitulo"
```

---

### Task 4: Alçada na configuração de pagamento

**Files:**
- Modify: `src/app/(app)/configuracoes/pagamento/actions.ts` (nova `salvarAlcada`)
- Modify: `src/app/(app)/configuracoes/pagamento/page.tsx` (carrega a alçada + form)

**Interfaces:**
- Produces: `salvarAlcada(formData: FormData): Promise<void>` (server action de form simples).

- [ ] **Step 1: Action**

```ts
export async function salvarAlcada(formData: FormData): Promise<void> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || perfil.papel !== "admin") return;
  const raw = String(formData.get("alcada") ?? "").trim().replace(/\./g, "").replace(",", ".");
  const alcada = raw === "" ? null : Number(raw);
  if (alcada != null && (!Number.isFinite(alcada) || alcada < 0)) return;
  const admin = createAdminSupabase();
  await admin.from("escritorio_config").update({ alcada_pagamento: alcada }).eq("id", 1);
  revalidatePath("/configuracoes/pagamento");
}
```

- [ ] **Step 2: `page.tsx` — carregar e renderizar o form**

Na `page.tsx` (admin), carregar `escritorio_config.alcada_pagamento`:

```ts
const { data: cfg } = await admin.from("escritorio_config").select("alcada_pagamento").eq("id", 1).maybeSingle();
const alcada = (cfg?.alcada_pagamento as number | null) ?? null;
```

E renderizar um bloco (server-action form) — controle via `controleCls`:

```tsx
<form action={salvarAlcada} className="max-w-md space-y-2 rounded-lg border border-linha bg-white p-4">
  <h2 className="text-sm font-semibold text-grafite">Alçada de aprovação</h2>
  <p className="text-xs text-cinza">Despesas acima deste valor exigem aprovação de outro admin. Vazio = sem alçada.</p>
  <label className="flex items-center gap-2 text-sm">
    R$
    <input name="alcada" type="number" step="0.01" min="0" defaultValue={alcada ?? ""} className={controleCls("compacto")} />
  </label>
  <button type="submit" className="rounded-lg bg-verde px-4 py-2 text-sm font-medium text-white hover:brightness-105">Salvar alçada</button>
</form>
```

(imports: `salvarAlcada`, `controleCls`.)

- [ ] **Step 3: Verificar** — Run: `npm run typecheck && npx vitest run src/tests/ui/divida-ui.test.ts` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/configuracoes/pagamento/actions.ts" "src/app/(app)/configuracoes/pagamento/page.tsx"
git commit -m "feat(fin): campo de alcada de aprovacao na config de pagamento"
```

---

### Task 5: UI — selo, aprovar e bloqueio em Contas a pagar

**Files:**
- Modify: `src/components/financeiro/ContasPagar.tsx` (props `papel`/`perfilId`; selo/aprovar/bloqueio)
- Modify: `src/app/(app)/financeiro/contas-a-pagar/page.tsx` (passa `papel`/`perfilId`)
- Test: `src/tests/financeiro/contas-pagar-aprovacao.test.tsx`

**Interfaces:**
- Consumes: `podeAprovar` (T2), `aprovarTitulo` (T3).

- [ ] **Step 1: Render test (falha)**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/financeiro/contas-a-pagar/actions", () => ({
  listarTitulosPagar: vi.fn(async () => [
    { id: "t1", fornecedor: "F", origem: "DESPESA_AVULSA", descricao: "Aluguel", competencia: "2026-07-01", vencimento: "2026-07-10", valor: 5000, somaBaixado: 0, status: "ABERTO", aprovacao: "pendente", criadoPor: "u2" },
  ]),
  gerarDespesasRecorrentes: vi.fn(),
  registrarPagamento: vi.fn(),
  aprovarTitulo: vi.fn(),
  lancarDespesa: vi.fn(),
}));
import { renderToStaticMarkup } from "react-dom/server";
import { ContasPagar } from "@/components/financeiro/ContasPagar";

// Estado inicial: a lista carrega via ação; o teste cobre a renderização base do componente.
describe("ContasPagar", () => {
  it("renderiza sem quebrar com papel/perfil (admin)", () => {
    const html = renderToStaticMarkup(
      <ContasPagar contas={[]} fornecedores={[]} categorias={[]} papel="admin" perfilId="u1" />,
    );
    expect(html).toContain("Contas a pagar");
  });
});
```

> Nota: a lista é carregada por ação (estado), então o render estático cobre a casca. A lógica de `podeAprovar` é testada em T2; o teste aqui garante que as novas props não quebram o componente. (Se o título/cabeçalho for outro, ajustar o `toContain` ao texto real.)

- [ ] **Step 2: Rodar e ver falhar** — Run: `npx vitest run src/tests/financeiro/contas-pagar-aprovacao.test.tsx` — Expected: FAIL (props novas ausentes na assinatura).

- [ ] **Step 3: `ContasPagar` — props + selo/aprovar/bloqueio**

- Ampliar a assinatura: `{ contas, fornecedores, categorias, papel, perfilId }: { …; papel: string; perfilId: string }`.
- Imports: `import { podeAprovar } from "@/lib/financeiro/aprovacao";` e `aprovarTitulo` do actions.
- Handler:

```tsx
const aprovar = (id: string) =>
  start(async () => {
    const r = await aprovarTitulo(id);
    setMsg(r.erro ?? "Aprovado.");
    if (!r.erro && competencia) setTitulos(await listarTitulosPagar(competencia));
  });
```

- Na célula de ações (onde hoje está o "Pagar"), tratar o pendente:

```tsx
<td className="p-2 text-right">
  {t.aprovacao === "pendente" ? (
    podeAprovar(papel, perfilId, t.criadoPor) ? (
      <button type="button" className="text-verde underline" onClick={() => aprovar(t.id)}>Aprovar</button>
    ) : (
      <span className="text-cinza-claro" title="Aguarda aprovação de outro admin">aguarda aprovação</span>
    )
  ) : saldo > 0 ? (
    <button type="button" className="text-blue-600 underline" onClick={() => setPagando(t.id)}>Pagar</button>
  ) : (
    <span className="text-cinza-claro">pago</span>
  )}
</td>
```

(A coluna de status pode exibir um selo extra "pendente aprovação" quando `t.aprovacao === "pendente"`, opcional.)

- [ ] **Step 4: `page.tsx` passa `papel`/`perfilId`**

Em `contas-a-pagar/page.tsx`, o `perfil` já é carregado; passar ao componente: `<ContasPagar ... papel={perfil.papel} perfilId={perfil.id} />`.

- [ ] **Step 5: Rodar e ver passar** — Run: `npx vitest run src/tests/financeiro/contas-pagar-aprovacao.test.tsx && npm run typecheck` — Expected: PASS.

- [ ] **Step 6: Verificar guards** — Run: `npx vitest run src/tests/ui/divida-ui.test.ts` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/financeiro/ContasPagar.tsx "src/app/(app)/financeiro/contas-a-pagar/page.tsx" src/tests/financeiro/contas-pagar-aprovacao.test.tsx
git commit -m "feat(fin): selo + aprovar + bloqueio de baixa em Contas a pagar"
```

---

### Task 6: Release

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm test && npm run format && npm run build` — tudo verde.
- [ ] **Step 2:** bump de versão (minor) + CHANGELOG (mesmo PR).
- [ ] **Step 3:** aplicar migration 0115 em produção (`node --env-file=.env.producao.bak scripts/db-migrate.mjs`) **antes** de Implantar.
- [ ] **Step 4:** REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch (PR, merge, Implantar, `/api/health`, tag).

---

## Self-Review

- **Cobertura da spec:** colunas de aprovação + alçada (T1), `requerAprovacao`/`podeAprovar` (T2), lançar marca pendente + baixa bloqueia + `aprovarTitulo` com segregação (T3), campo de alçada na config (T4), selo/aprovar/bloqueio na lista (T5), release com migration em prod (T6). Fora de escopo respeitado (sem faixas, sem RECEBER, sem notificação).
- **Placeholders:** nenhum passo de código sem código; as edições em `actions.ts`/`ContasPagar.tsx`/`page.tsx` indicam as inserções exatas; a nota do render test (T5) alerta para ajustar o `toContain` ao texto real do cabeçalho.
- **Consistência de tipos:** `requerAprovacao`/`podeAprovar` (T2) usados em T3/T5; `TituloPagar.aprovacao`/`criadoPor` (T3) consumidos por `ContasPagar` (T5); `aprovarTitulo` (T3) chamado no handler (T5); `alcada_pagamento` lido em `lancarDespesa` (T3) e gravado na config (T4).
