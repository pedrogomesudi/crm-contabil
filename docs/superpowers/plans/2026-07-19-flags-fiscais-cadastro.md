# Flags fiscais explícitas no cadastro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** permitir sobrescrever (tri-state Auto/Sim/Não) as três flags fiscais que o motor de obrigações hoje deriva, fechando o domínio Cadastro do cliente.

**Architecture:** 3 colunas nullable em `clientes` (`null` = Auto); `resolverFlag(explícito ?? derivado)` no motor; seção "Flags fiscais" na aba cadastro.

**Tech Stack:** Next 16 (App Router, server actions), TypeScript, Tailwind 4, Supabase (Postgres/RLS), vitest.

## Global Constraints

- Next 16: `middleware.ts` é `proxy.ts`; imports `@/*`.
- RBAC: papel só via `auth_papel()`.
- Migrations: runner `npm run db:migrate`; imutáveis após aplicadas; idempotentes; numerar após `0112`.
- Guard `divida-ui`: controles sem `border` à mão → `controleCls` (`@/components/ui/Campo`).
- Sem rota nova → `rotas-alcancaveis` não muda.
- Rodar antes de entregar: `lint`, `typecheck`, `test`, `format`, `build`. PR `develop`→`main`; tag após deploy; versão+CHANGELOG no mesmo PR.

---

### Task 1: Migration 0113 — colunas de flag

**Files:**
- Create: `supabase/migrations/0113_flags_fiscais.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Flags fiscais explícitas no cadastro (sobrescrita tri-state; null = Auto/deriva).
alter table clientes add column if not exists flag_tem_folha       boolean;
alter table clientes add column if not exists flag_contribui_icms  boolean;
alter table clientes add column if not exists flag_contribui_iss   boolean;
```

- [ ] **Step 2: Conferir idempotência** (`add column if not exists`; sem default — clientes atuais ficam `null` = Auto).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0113_flags_fiscais.sql
git commit -m "feat(flags-fiscais): migration 0113 colunas nullable de flag no cliente"
```

> Aplicada em produção no release, antes de Implantar.

---

### Task 2: Lógica pura — `resolverFlag`

**Files:**
- Create: `src/lib/obrigacoes/flags.ts`
- Test: `src/tests/obrigacoes/flags.test.ts`

**Interfaces:**
- Produces: `resolverFlag(explicito: boolean | null, derivado: boolean): boolean`

- [ ] **Step 1: Escrever os testes (falham)**

```ts
import { describe, it, expect } from "vitest";
import { resolverFlag } from "@/lib/obrigacoes/flags";

describe("resolverFlag", () => {
  it("explícito true vence a derivação", () => expect(resolverFlag(true, false)).toBe(true));
  it("explícito false vence a derivação", () => expect(resolverFlag(false, true)).toBe(false));
  it("null cai no derivado", () => {
    expect(resolverFlag(null, true)).toBe(true);
    expect(resolverFlag(null, false)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npx vitest run src/tests/obrigacoes/flags.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// O explícito manda; null cai na derivação atual.
export function resolverFlag(explicito: boolean | null, derivado: boolean): boolean {
  return explicito ?? derivado;
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npx vitest run src/tests/obrigacoes/flags.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/obrigacoes/flags.ts src/tests/obrigacoes/flags.test.ts
git commit -m "feat(flags-fiscais): resolverFlag (explicito ?? derivado)"
```

---

### Task 3: Motor usa o explícito sobre o derivado

**Files:**
- Modify: `src/lib/obrigacoes/motor.ts`

**Interfaces:**
- Consumes: `resolverFlag` (T2).

- [ ] **Step 1: Ampliar o `select` de `clientes`**

Na string do `.select(...)` (que hoje termina em `... regime_vigencia(vigente_de, regime)`), acrescentar as três colunas:

```
"id, tipo_pessoa, regime_tributario, cnae, inscricao_estadual, inscricao_municipal, contador_id, endereco, competencia_inicial, data_inicio, flag_tem_folha, flag_contribui_icms, flag_contribui_iss, clientes_financeiro(qtd_funcionarios), regime_vigencia(vigente_de, regime)"
```

- [ ] **Step 2: Resolver o explícito no bloco `flags`**

Importar no topo: `import { resolverFlag } from "./flags";`

Substituir o bloco atual:

```ts
      flags: {
        tem_folha: (qtd ?? 0) > 0,
        contribui_icms: !!cl.inscricao_estadual,
        contribui_iss: !!cl.inscricao_municipal,
      },
```

por:

```ts
      flags: {
        tem_folha: resolverFlag((cl.flag_tem_folha as boolean | null) ?? null, (qtd ?? 0) > 0),
        contribui_icms: resolverFlag((cl.flag_contribui_icms as boolean | null) ?? null, !!cl.inscricao_estadual),
        contribui_iss: resolverFlag((cl.flag_contribui_iss as boolean | null) ?? null, !!cl.inscricao_municipal),
      },
```

- [ ] **Step 3: Verificar** — Run: `npm run typecheck && npx vitest run src/tests/obrigacoes/` — Expected: PASS (com `flag_* = null`, a incidência é idêntica à de hoje).

- [ ] **Step 4: Commit**

```bash
git add src/lib/obrigacoes/motor.ts
git commit -m "feat(flags-fiscais): motor usa a flag explicita quando definida"
```

---

### Task 4: Seção "Flags fiscais" + action + wiring

**Files:**
- Create: `src/app/(app)/clientes/[id]/flags-actions.ts`
- Create: `src/components/clientes/FlagsFiscaisSection.tsx`
- Modify: `src/app/(app)/clientes/[id]/page.tsx` (carrega flags + derivados; renderiza a seção)
- Test: `src/tests/clientes/flags-fiscais-section.test.tsx`

**Interfaces:**
- Produces:
  - `salvarFlagFiscal(clienteId: string, campo: "folha" | "icms" | "iss", valor: boolean | null): Promise<{ erro?: string }>`
  - `FlagsFiscaisSection` props: `{ clienteId; podeEditar; valores: { folha: boolean|null; icms: boolean|null; iss: boolean|null }; derivados: { folha: boolean; icms: boolean; iss: boolean } }`

- [ ] **Step 1: Implementar a action**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";

const COLUNA = { folha: "flag_tem_folha", icms: "flag_contribui_icms", iss: "flag_contribui_iss" } as const;

export async function salvarFlagFiscal(
  clienteId: string,
  campo: "folha" | "icms" | "iss",
  valor: boolean | null,
): Promise<{ erro?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("clientes")
    .update({ [COLUNA[campo]]: valor })
    .eq("id", clienteId);
  if (error) return { erro: "Não foi possível salvar a flag (sem permissão?)." };
  revalidatePath(`/clientes/${clienteId}`);
  return {};
}
```

- [ ] **Step 2: Render test (falha)**

`src/tests/clientes/flags-fiscais-section.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/clientes/[id]/flags-actions", () => ({ salvarFlagFiscal: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { FlagsFiscaisSection } from "@/components/clientes/FlagsFiscaisSection";

describe("FlagsFiscaisSection", () => {
  it("renderiza as três flags tri-state e o valor derivado", () => {
    const html = renderToStaticMarkup(
      <FlagsFiscaisSection
        clienteId="c1"
        podeEditar
        valores={{ folha: null, icms: true, iss: null }}
        derivados={{ folha: true, icms: false, iss: false }}
      />,
    );
    expect(html).toContain("Flags fiscais");
    expect(html).toContain("Contribui ICMS");
    expect(html).toContain("Auto"); // opção Auto presente
  });
});
```

- [ ] **Step 3: Rodar e ver falhar** — Run: `npx vitest run src/tests/clientes/flags-fiscais-section.test.tsx` — Expected: FAIL.

- [ ] **Step 4: Implementar `FlagsFiscaisSection`**

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { controleCls } from "@/components/ui/Campo";
import { salvarFlagFiscal } from "@/app/(app)/clientes/[id]/flags-actions";

type Tri = boolean | null;
type Campo = "folha" | "icms" | "iss";
const ROTULO: Record<Campo, string> = {
  folha: "Tem folha (funcionários)",
  icms: "Contribui ICMS",
  iss: "Contribui ISS",
};
const DICA: Record<Campo, string> = {
  folha: "nº de funcionários > 0",
  icms: "tem inscrição estadual",
  iss: "tem inscrição municipal",
};
const paraValor = (s: string): Tri => (s === "sim" ? true : s === "nao" ? false : null);
const paraSelect = (v: Tri): string => (v === true ? "sim" : v === false ? "nao" : "");

export function FlagsFiscaisSection({
  clienteId,
  podeEditar,
  valores,
  derivados,
}: {
  clienteId: string;
  podeEditar: boolean;
  valores: Record<Campo, Tri>;
  derivados: Record<Campo, boolean>;
}) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const mudar = (campo: Campo, s: string) =>
    start(async () => {
      const r = await salvarFlagFiscal(clienteId, campo, paraValor(s));
      setErro(r.erro ?? null);
      if (!r.erro) router.refresh();
    });

  return (
    <section className="space-y-3 rounded-lg border border-linha bg-white p-4">
      <h3 className="text-sm font-semibold text-grafite">Flags fiscais</h3>
      <p className="text-xs text-cinza">
        Determinam a incidência de obrigações. &quot;Auto&quot; deriva das inscrições e da folha; mudar vale para a
        próxima geração.
      </p>
      <div className="space-y-2">
        {(Object.keys(ROTULO) as Campo[]).map((campo) => (
          <label key={campo} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-48 text-grafite">{ROTULO[campo]}</span>
            <select
              className={controleCls("compacto")}
              value={paraSelect(valores[campo])}
              disabled={!podeEditar || pend}
              onChange={(e) => mudar(campo, e.target.value)}
            >
              <option value="">Auto → {derivados[campo] ? "Sim" : "Não"} ({DICA[campo]})</option>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </label>
        ))}
      </div>
      {erro && (
        <p role="alert" className="text-sm text-negativo">
          {erro}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Rodar e ver passar** — Run: `npx vitest run src/tests/clientes/flags-fiscais-section.test.tsx` — Expected: PASS.

- [ ] **Step 6: Wiring no `page.tsx` do cliente**

Em `src/app/(app)/clientes/[id]/page.tsx`:

1. No `.select(...)` de `clientes`, acrescentar `flag_tem_folha, flag_contribui_icms, flag_contribui_iss`.
2. Carregar o `qtd_funcionarios` (para derivar `tem_folha`):

```tsx
const { data: fin } = await supabase
  .from("clientes_financeiro")
  .select("qtd_funcionarios")
  .eq("cliente_id", id)
  .maybeSingle();
const cf = cliente as {
  inscricao_estadual: string | null;
  inscricao_municipal: string | null;
  flag_tem_folha: boolean | null;
  flag_contribui_icms: boolean | null;
  flag_contribui_iss: boolean | null;
};
const derivadosFiscais = {
  folha: ((fin?.qtd_funcionarios as number | null) ?? 0) > 0,
  icms: !!cf.inscricao_estadual,
  iss: !!cf.inscricao_municipal,
};
const valoresFiscais = {
  folha: cf.flag_tem_folha ?? null,
  icms: cf.flag_contribui_icms ?? null,
  iss: cf.flag_contribui_iss ?? null,
};
```

3. Importar `FlagsFiscaisSection` e renderizá-la após a `VinculosSection` (mesmo gate `podeCriarCliente(papel)`):

```tsx
{podeCriarCliente(papel) && (
  <FlagsFiscaisSection
    clienteId={id}
    podeEditar={podeCriarCliente(papel)}
    valores={valoresFiscais}
    derivados={derivadosFiscais}
  />
)}
```

- [ ] **Step 7: Verificar** — Run: `npm run typecheck && npx vitest run src/tests/clientes/ src/tests/ui/divida-ui.test.ts` — Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/clientes/[id]/flags-actions.ts" src/components/clientes/FlagsFiscaisSection.tsx "src/app/(app)/clientes/[id]/page.tsx" src/tests/clientes/flags-fiscais-section.test.tsx
git commit -m "feat(flags-fiscais): secao tri-state na aba cadastro + action"
```

---

### Task 5: Release

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm test && npm run format && npm run build` — tudo verde.
- [ ] **Step 2:** bump de versão (minor) + CHANGELOG (mesmo PR) — fecha o domínio Cadastro.
- [ ] **Step 3:** aplicar migration 0113 em produção (`node --env-file=.env.producao.bak scripts/db-migrate.mjs`) **antes** de Implantar.
- [ ] **Step 4:** REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch (PR, merge, Implantar, `/api/health`, tag).

---

## Self-Review

- **Cobertura da spec:** 3 colunas nullable (T1), `resolverFlag` (T2), merge no motor preservando a derivação quando `null` (T3), seção tri-state com o derivado ao lado + action + wiring (T4), release com migration em prod (T5). Fora de escopo respeitado (só as 3 flags; sem regeneração retroativa; sem catálogo).
- **Placeholders:** nenhum passo de código sem código.
- **Consistência de tipos:** `resolverFlag` (T2) consumido no motor (T3); `salvarFlagFiscal(campo)` (T4) mapeia para as colunas da migration (T1); `FlagsFiscaisSection` recebe `valores`/`derivados` montados no `page.tsx` a partir das mesmas colunas + `qtd_funcionarios`/inscrições.
