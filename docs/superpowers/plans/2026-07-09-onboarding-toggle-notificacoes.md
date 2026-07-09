# Onboarding — interruptor de notificações de prazo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um interruptor (admin) em Configurações do onboarding para ligar/desligar os alertas de prazo in-app (badge + tela de alertas).

**Architecture:** Singleton `onboarding_config.alertas_ativos`; `contarAlertas`/`listarAlertas` respeitam o flag; interruptor `ToggleAlertas` na config do onboarding + aviso na tela de alertas. Spec: `docs/superpowers/specs/2026-07-09-onboarding-toggle-notificacoes-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase, Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`.
- Migration idempotente via `npm run db:migrate`. Escrita do flag só admin; leitura liberada (RLS).
- Branch: `git checkout -b feat/onboarding-toggle-alertas develop`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `supabase/migrations/0060_onboarding_config.sql` — **novo**.
- `src/app/(app)/onboarding/alertas-actions.ts` — **modificar**: obter/definir flag + gate em contar/listar.
- `src/app/(app)/configuracoes/onboarding/ToggleAlertas.tsx` — **novo**.
- `src/app/(app)/configuracoes/onboarding/page.tsx` — **modificar**: seção do interruptor.
- `src/app/(app)/onboarding/alertas/page.tsx` — **modificar**: aviso quando desligado.
- `src/tests/onboarding/toggle-alertas-render.test.tsx` — **novo**: smoke.

---

## Task 1: Migration — onboarding_config

**Files:**
- Create: `supabase/migrations/0060_onboarding_config.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Config do onboarding: liga/desliga os alertas de prazo in-app.
create table if not exists onboarding_config (
  id int primary key default 1,
  alertas_ativos boolean not null default true,
  atualizado_em timestamptz not null default now(),
  constraint onboarding_config_singleton check (id = 1)
);
alter table onboarding_config enable row level security;
drop policy if exists onboarding_config_sel on onboarding_config;
create policy onboarding_config_sel on onboarding_config for select using (true);
drop policy if exists onboarding_config_upd on onboarding_config;
create policy onboarding_config_upd on onboarding_config for update
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
insert into onboarding_config (id) values (1) on conflict (id) do nothing;
```

- [ ] **Step 2: Aplicar e verificar**

Run: `npm run db:migrate`
Expected: "1 migration(s) nova(s) aplicada(s)."
```bash
node --env-file=.env.local -e "import('./scripts/_db.mjs').then(async({makeClient})=>{const c=makeClient();await c.connect();const r=await c.query('select alertas_ativos from onboarding_config where id=1');console.log('alertas_ativos:', r.rows[0]?.alertas_ativos ?? 'SEM LINHA');await c.end();});"
```
Expected: `alertas_ativos: true`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0060_onboarding_config.sql
git commit -m "feat(onboarding): migration onboarding_config (flag de alertas)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Actions do flag + gate nos alertas

**Files:**
- Modify: `src/app/(app)/onboarding/alertas-actions.ts`

**Interfaces:**
- Produces: `obterAlertasAtivos()`, `definirAlertasAtivos(ativo)`.

- [ ] **Step 1: Import do `revalidatePath`**

No topo de `alertas-actions.ts`, após a linha `"use server";`, acrescentar:
```ts
import { revalidatePath } from "next/cache";
```

- [ ] **Step 2: Gate do flag em `listarAlertas` e `contarAlertas`**

Trocar:
```ts
  if (!p?.ativo || !podeCriarCliente(p.papel)) return [];
  return coletar(p.id);
```
por:
```ts
  if (!p?.ativo || !podeCriarCliente(p.papel)) return [];
  if (!(await obterAlertasAtivos())) return [];
  return coletar(p.id);
```
E trocar:
```ts
  if (!p?.ativo || !podeCriarCliente(p.papel)) return 0;
  return (await coletar(p.id)).length;
```
por:
```ts
  if (!p?.ativo || !podeCriarCliente(p.papel)) return 0;
  if (!(await obterAlertasAtivos())) return 0;
  return (await coletar(p.id)).length;
```

- [ ] **Step 3: Adicionar as actions do flag ao final do arquivo**

```ts
export async function obterAlertasAtivos(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("onboarding_config").select("alertas_ativos").eq("id", 1).maybeSingle();
  return Boolean(data?.alertas_ativos ?? true);
}

export async function definirAlertasAtivos(ativo: boolean): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || p.papel !== "admin") return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("onboarding_config").update({ alertas_ativos: ativo, atualizado_em: new Date().toISOString() }).eq("id", 1);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath("/configuracoes/onboarding");
  revalidatePath("/onboarding");
  return { ok: true };
}
```

- [ ] **Step 4: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build` (sem erros).
```bash
git add "src/app/(app)/onboarding/alertas-actions.ts"
git commit -m "feat(onboarding): flag alertas_ativos (obter/definir + gate)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: UI — interruptor + aviso

**Files:**
- Create: `src/app/(app)/configuracoes/onboarding/ToggleAlertas.tsx`
- Modify: `src/app/(app)/configuracoes/onboarding/page.tsx`
- Modify: `src/app/(app)/onboarding/alertas/page.tsx`
- Test: `src/tests/onboarding/toggle-alertas-render.test.tsx`

**Interfaces:**
- Consumes: `definirAlertasAtivos`, `obterAlertasAtivos` (Task 2).

- [ ] **Step 1: Smoke test**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/onboarding/alertas-actions", () => ({ definirAlertasAtivos: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { ToggleAlertas } from "@/app/(app)/configuracoes/onboarding/ToggleAlertas";

describe("ToggleAlertas", () => {
  it("mostra o estado ligado", () => {
    const html = renderToStaticMarkup(<ToggleAlertas ativoInicial={true} />);
    expect(html).toContain("Notificações de prazo");
    expect(html).toContain("ligadas");
  });
  it("mostra o estado desligado", () => {
    const html = renderToStaticMarkup(<ToggleAlertas ativoInicial={false} />);
    expect(html).toContain("desligadas");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- toggle-alertas-render` → FAIL.

- [ ] **Step 3: `ToggleAlertas.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { definirAlertasAtivos } from "@/app/(app)/onboarding/alertas-actions";

export function ToggleAlertas({ ativoInicial }: { ativoInicial: boolean }) {
  const router = useRouter();
  const [ativo, setAtivo] = useState(ativoInicial);
  const [ocupado, setOcupado] = useState(false);
  async function mudar(novo: boolean) {
    setAtivo(novo);
    setOcupado(true);
    const r = await definirAlertasAtivos(novo);
    setOcupado(false);
    if (r.erro) {
      setAtivo(!novo);
      return alert(r.erro);
    }
    router.refresh();
  }
  return (
    <label className="flex items-center gap-2 text-sm text-texto">
      <input type="checkbox" checked={ativo} disabled={ocupado} onChange={(e) => mudar(e.target.checked)} />
      Notificações de prazo {ativo ? "ligadas" : "desligadas"}
    </label>
  );
}
```

- [ ] **Step 4: Rodar e ver passar** — `npm test -- toggle-alertas-render` → PASS.

- [ ] **Step 5: Config do onboarding — seção do interruptor**

Substituir o conteúdo de `src/app/(app)/configuracoes/onboarding/page.tsx` por:
```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { GerenciadorTemplates } from "./GerenciadorTemplates";
import { ToggleAlertas } from "./ToggleAlertas";
import { listarTemplates } from "@/app/(app)/onboarding/template-actions";
import { obterAlertasAtivos } from "@/app/(app)/onboarding/alertas-actions";

export default async function ConfigOnboardingPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const templates = await listarTemplates();
  const alertasAtivos = await obterAlertasAtivos();
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4">
      <PageHeader titulo="Template de onboarding" subtitulo="Modelos de processo de entrada de clientes" />
      <section className="rounded-2xl border border-linha bg-white p-4">
        <h3 className="font-display text-sm font-semibold text-texto">Notificações de prazo</h3>
        <p className="mb-2 text-xs text-cinza">Liga/desliga o badge no menu e a tela de alertas de prazo do onboarding.</p>
        <ToggleAlertas ativoInicial={alertasAtivos} />
      </section>
      <GerenciadorTemplates templates={templates} />
    </main>
  );
}
```

- [ ] **Step 6: Tela de alertas — aviso quando desligado**

Em `src/app/(app)/onboarding/alertas/page.tsx`, trocar o import:
```tsx
import { listarAlertas } from "../alertas-actions";
```
por:
```tsx
import { listarAlertas, obterAlertasAtivos } from "../alertas-actions";
```
E trocar:
```tsx
  const alertas = await listarAlertas();
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <PageHeader titulo="Alertas de prazo" subtitulo="Itens do onboarding vencendo ou vencidos" />
      <AlertasView alertas={alertas} />
    </main>
```
por:
```tsx
  const alertas = await listarAlertas();
  const ativos = await obterAlertasAtivos();
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <PageHeader titulo="Alertas de prazo" subtitulo="Itens do onboarding vencendo ou vencidos" />
      {!ativos && <p className="rounded-lg bg-creme px-3 py-2 text-sm text-cinza">Notificações de prazo desativadas nas configurações.</p>}
      <AlertasView alertas={alertas} />
    </main>
```

- [ ] **Step 7: Suite completa** — `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde).

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/configuracoes/onboarding/ToggleAlertas.tsx" "src/app/(app)/configuracoes/onboarding/page.tsx" "src/app/(app)/onboarding/alertas/page.tsx" src/tests/onboarding/toggle-alertas-render.test.tsx
git commit -m "feat(onboarding): interruptor de notificações de prazo + aviso na tela

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Onboarding — ligar/desligar notificações de prazo:** em Configurações → Template de onboarding, o admin
  pode desativar os alertas de prazo (o badge no menu e a tela de alertas somem para todos). Vêm ligados
  por padrão.
```

- [ ] **Step 2: Commit + finalizar**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog do interruptor de notificações do onboarding

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois usar `superpowers:finishing-a-development-branch`. (Migration 0060 já aplicada; sem novos segredos.)

---

## Self-Review

- **Cobertura do spec:** `onboarding_config` + RLS + seed (T1) ✓; `obterAlertasAtivos`/`definirAlertasAtivos` + gate em contar/listar (T2) ✓; `ToggleAlertas` + seção na config + aviso na tela de alertas (T3) ✓; CHANGELOG (T4) ✓. Smoke (T3).
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Consistência de tipos:** `obterAlertasAtivos(): Promise<boolean>` e `definirAlertasAtivos(ativo): Promise<{ok?;erro?}>` (T2) consumidos pela config page e `ToggleAlertas` (T3); `contarAlertas`/`listarAlertas` chamam `obterAlertasAtivos` no mesmo arquivo. `perfil.papel !== "admin"` reusa o padrão da página de config.
- **Segurança:** escrita do flag só admin (action + RLS); leitura liberada (badge/alertas precisam ler); o gate de `podeCriarCliente` nos alertas continua.
- **Escopo:** só o interruptor sobre os alertas existentes. Sem push novo.
