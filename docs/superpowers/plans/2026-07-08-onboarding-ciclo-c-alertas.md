# Onboarding — Ciclo C: alertas de prazo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alertas in-app de itens do onboarding vencendo/vencidos — tela dedicada, filtro "só os meus" e badge no menu.

**Architecture:** Helpers puros de severidade; actions ao vivo (`listarAlertas`/`contarAlertas`) sobre `onboarding_processo_item` (RLS isola por cliente); tela `/onboarding/alertas` + link em `/onboarding` + badge no Sidebar. Sem tabela/cron/migration. Spec: `docs/superpowers/specs/2026-07-08-onboarding-ciclo-c-alertas-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase, Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`. Todos passam.
- Sem migration/cron/tabela. Gate `podeCriarCliente`; a RLS de `onboarding_processo_item` já isola por cliente.
- Datas puras `YYYY-MM-DD`; `hoje` no fuso de São Paulo (`toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })`).
- Janela padrão: 3 dias. Severidades: em_breve / vencido / critico (vencido há +7 dias).
- Tokens SALDO na UI. Branch: `git checkout -b feat/onboarding-ciclo-c develop`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `src/lib/onboarding/alertas.ts` — **novo**: `classificarAlerta`, `ordemSeveridade`.
- `src/tests/onboarding/alertas.test.ts` — **novo**.
- `src/app/(app)/onboarding/alertas-actions.ts` — **novo**: `listarAlertas`, `contarAlertas`.
- `src/app/(app)/onboarding/alertas/AlertasView.tsx` — **novo**.
- `src/app/(app)/onboarding/alertas/page.tsx` — **novo**.
- `src/tests/onboarding/alertas-view-render.test.tsx` — **novo**: smoke.
- `src/app/(app)/onboarding/page.tsx` — **modificar**: link "Alertas de prazo (N)".
- `src/components/Sidebar.tsx` — **modificar**: prop `alertasOnboarding` + badge.
- `src/app/(app)/layout.tsx` — **modificar**: busca a contagem e passa ao Sidebar.

---

## Task 1: Helpers puros (TDD)

**Files:**
- Create: `src/lib/onboarding/alertas.ts`
- Test: `src/tests/onboarding/alertas.test.ts`

**Interfaces:**
- Produces: `type SeveridadeAlerta = "em_breve" | "vencido" | "critico"`; `classificarAlerta(prazo, hoje, janelaDias?): SeveridadeAlerta | null`; `ordemSeveridade(sev): number`.

- [ ] **Step 1: Testes**

```ts
import { describe, it, expect } from "vitest";
import { classificarAlerta, ordemSeveridade } from "@/lib/onboarding/alertas";

describe("classificarAlerta", () => {
  const hoje = "2026-07-10";
  it("hoje e dentro da janela → em_breve", () => {
    expect(classificarAlerta("2026-07-10", hoje)).toBe("em_breve");
    expect(classificarAlerta("2026-07-13", hoje)).toBe("em_breve");
  });
  it("fora da janela → null", () => {
    expect(classificarAlerta("2026-07-14", hoje)).toBe(null);
  });
  it("vencido até 7 dias", () => {
    expect(classificarAlerta("2026-07-09", hoje)).toBe("vencido");
    expect(classificarAlerta("2026-07-03", hoje)).toBe("vencido");
  });
  it("vencido há +7 dias → critico", () => {
    expect(classificarAlerta("2026-07-02", hoje)).toBe("critico");
  });
  it("prazo inválido → null", () => {
    expect(classificarAlerta("xyz", hoje)).toBe(null);
  });
});

describe("ordemSeveridade", () => {
  it("critico < vencido < em_breve", () => {
    expect(ordemSeveridade("critico")).toBeLessThan(ordemSeveridade("vencido"));
    expect(ordemSeveridade("vencido")).toBeLessThan(ordemSeveridade("em_breve"));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- onboarding/alertas` → FAIL.

- [ ] **Step 3: Implementar `src/lib/onboarding/alertas.ts`**

```ts
export type SeveridadeAlerta = "em_breve" | "vencido" | "critico";

export function classificarAlerta(prazo: string, hoje: string, janelaDias = 3): SeveridadeAlerta | null {
  const pz = Date.parse(`${prazo}T00:00:00Z`);
  const hj = Date.parse(`${hoje}T00:00:00Z`);
  if (Number.isNaN(pz) || Number.isNaN(hj)) return null;
  const d = Math.round((pz - hj) / 86400000);
  if (d > janelaDias) return null;
  if (d >= 0) return "em_breve";
  if (d >= -7) return "vencido";
  return "critico";
}

export function ordemSeveridade(sev: SeveridadeAlerta): number {
  return sev === "critico" ? 0 : sev === "vencido" ? 1 : 2;
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- onboarding/alertas` (PASS), `npm run lint`, `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding/alertas.ts src/tests/onboarding/alertas.test.ts
git commit -m "feat(onboarding): helpers de classificação de alertas de prazo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Actions — listar/contar alertas

**Files:**
- Create: `src/app/(app)/onboarding/alertas-actions.ts`

**Interfaces:**
- Consumes: `classificarAlerta`, `ordemSeveridade`, `SeveridadeAlerta` (Task 1); `podeCriarCliente`.
- Produces: `type AlertaView`; `listarAlertas(): Promise<AlertaView[]>`; `contarAlertas(): Promise<number>`.

- [ ] **Step 1: Criar `alertas-actions.ts`**

```ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { classificarAlerta, ordemSeveridade, type SeveridadeAlerta } from "@/lib/onboarding/alertas";

export type AlertaView = { itemId: string; clienteId: string; razaoSocial: string; blocoNome: string; codigo: string | null; titulo: string; prazo: string; severidade: SeveridadeAlerta; bloqueante: boolean; responsavelNome: string | null; meu: boolean };

function hojeSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

async function coletar(usuarioId: string): Promise<AlertaView[]> {
  const supabase = await createServerSupabase();
  const { data: itens } = await supabase
    .from("onboarding_processo_item")
    .select("id, processo_id, bloco_nome, codigo, titulo, prazo, bloqueante, responsavel_id")
    .eq("status", "pendente")
    .not("prazo", "is", null);
  const rows = itens ?? [];
  if (rows.length === 0) return [];
  const procIds = [...new Set(rows.map((r) => r.processo_id as string))];
  const { data: procs } = await supabase.from("onboarding_processo").select("id, cliente_id, clientes(razao_social)").in("id", procIds);
  const procMap = new Map<string, { clienteId: string; razao: string }>();
  for (const pr of procs ?? []) {
    const cli = Array.isArray(pr.clientes) ? pr.clientes[0] : pr.clientes;
    procMap.set(pr.id as string, { clienteId: pr.cliente_id as string, razao: (cli?.razao_social as string) ?? "—" });
  }
  const respIds = [...new Set(rows.map((r) => r.responsavel_id as string | null).filter((x): x is string => !!x))];
  const usMap = new Map<string, string>();
  if (respIds.length) {
    const { data: us } = await supabase.from("usuarios").select("id, nome").in("id", respIds);
    for (const u of us ?? []) usMap.set(u.id as string, u.nome as string);
  }
  const hoje = hojeSP();
  const out: AlertaView[] = [];
  for (const r of rows) {
    const sev = classificarAlerta(r.prazo as string, hoje);
    if (!sev) continue;
    const pr = procMap.get(r.processo_id as string);
    const respId = r.responsavel_id as string | null;
    out.push({
      itemId: r.id as string,
      clienteId: pr?.clienteId ?? "",
      razaoSocial: pr?.razao ?? "—",
      blocoNome: r.bloco_nome as string,
      codigo: (r.codigo as string | null) ?? null,
      titulo: r.titulo as string,
      prazo: r.prazo as string,
      severidade: sev,
      bloqueante: r.bloqueante as boolean,
      responsavelNome: respId ? (usMap.get(respId) ?? null) : null,
      meu: respId === usuarioId,
    });
  }
  out.sort((a, b) => ordemSeveridade(a.severidade) - ordemSeveridade(b.severidade) || a.prazo.localeCompare(b.prazo));
  return out;
}

export async function listarAlertas(): Promise<AlertaView[]> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return [];
  return coletar(p.id);
}

export async function contarAlertas(): Promise<number> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return 0;
  return (await coletar(p.id)).length;
}
```

- [ ] **Step 2: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build` (sem erros).
```bash
git add "src/app/(app)/onboarding/alertas-actions.ts"
git commit -m "feat(onboarding): actions listarAlertas + contarAlertas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Tela de alertas + link em /onboarding

**Files:**
- Create: `src/app/(app)/onboarding/alertas/AlertasView.tsx`
- Create: `src/app/(app)/onboarding/alertas/page.tsx`
- Modify: `src/app/(app)/onboarding/page.tsx`
- Test: `src/tests/onboarding/alertas-view-render.test.tsx`

**Interfaces:**
- Consumes: `type AlertaView`, `listarAlertas`, `contarAlertas` (Task 2).

- [ ] **Step 1: Smoke test**

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AlertasView } from "@/app/(app)/onboarding/alertas/AlertasView";
import type { AlertaView } from "@/app/(app)/onboarding/alertas-actions";

const alertas: AlertaView[] = [
  { itemId: "1", clienteId: "c1", razaoSocial: "DGX LTDA", blocoNome: "Transição", codigo: "4.7", titulo: "Passivos ocultos", prazo: "2026-07-01", severidade: "critico", bloqueante: false, responsavelNome: "Ana", meu: true },
  { itemId: "2", clienteId: "c2", razaoSocial: "ACME LTDA", blocoNome: "Formalização", codigo: "1.1", titulo: "Contrato", prazo: "2026-07-12", severidade: "em_breve", bloqueante: true, responsavelNome: null, meu: false },
];

describe("AlertasView", () => {
  it("vazio", () => {
    expect(renderToStaticMarkup(<AlertasView alertas={[]} />)).toContain("Nenhum alerta");
  });
  it("agrupa por severidade", () => {
    const html = renderToStaticMarkup(<AlertasView alertas={alertas} />);
    expect(html).toContain("Passivos ocultos");
    expect(html).toContain("Contrato");
    expect(html).toContain("Crítico");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- alertas-view-render` → FAIL.

- [ ] **Step 3: `AlertasView.tsx`**

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import type { AlertaView } from "../alertas-actions";

const SEV = [
  { k: "critico", l: "Crítico (vencido há +7 dias)", cls: "text-negativo" },
  { k: "vencido", l: "Vencido", cls: "text-negativo" },
  { k: "em_breve", l: "Vence em breve", cls: "text-cinza" },
] as const;
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function AlertasView({ alertas }: { alertas: AlertaView[] }) {
  const [soMeus, setSoMeus] = useState(false);
  const lista = soMeus ? alertas.filter((a) => a.meu) : alertas;
  return (
    <div className="space-y-4">
      <div className="flex gap-3 text-sm">
        <button type="button" onClick={() => setSoMeus(false)} className={!soMeus ? "font-semibold text-verde" : "text-cinza"}>Todos</button>
        <button type="button" onClick={() => setSoMeus(true)} className={soMeus ? "font-semibold text-verde" : "text-cinza"}>Só os meus</button>
      </div>
      {lista.length === 0 ? (
        <p className="text-sm text-cinza">Nenhum alerta de prazo.</p>
      ) : (
        SEV.map((s) => {
          const doGrupo = lista.filter((a) => a.severidade === s.k);
          if (doGrupo.length === 0) return null;
          return (
            <div key={s.k} className="space-y-1.5">
              <h3 className={`font-display text-xs font-semibold uppercase tracking-wide ${s.cls}`}>{s.l} ({doGrupo.length})</h3>
              {doGrupo.map((a) => (
                <div key={a.itemId} className="rounded-lg border border-linha bg-white px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/clientes/${a.clienteId}`} className="font-medium text-texto underline decoration-linha hover:decoration-verde">{a.razaoSocial}</Link>
                    {a.bloqueante && <span className="rounded bg-negativo/10 px-1.5 text-[10px] text-negativo">bloqueante</span>}
                    <span className={`ml-auto tabular-nums ${s.cls}`}>{dataBR(a.prazo)}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-cinza">
                    {a.codigo ? `${a.codigo} · ` : ""}{a.titulo} — {a.blocoNome}
                    {a.responsavelNome ? ` · resp. ${a.responsavelNome}` : ""}
                  </div>
                </div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar** — `npm test -- alertas-view-render` → PASS.

- [ ] **Step 5: `alertas/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { AlertasView } from "./AlertasView";
import { listarAlertas } from "../alertas-actions";

export default async function AlertasPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const alertas = await listarAlertas();
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <PageHeader titulo="Alertas de prazo" subtitulo="Itens do onboarding vencendo ou vencidos" />
      <AlertasView alertas={alertas} />
    </main>
  );
}
```

- [ ] **Step 6: Link em `/onboarding` (lista de processos)**

Em `src/app/(app)/onboarding/page.tsx`, importar `import Link from "next/link";` e `import { contarAlertas } from "./alertas-actions";`. Após obter `itens`, adicionar `const nAlertas = await contarAlertas();` e, no JSX (logo abaixo do `PageHeader`), adicionar:
```tsx
      <div>
        <Link href="/onboarding/alertas" className="text-sm text-verde underline">
          Alertas de prazo{nAlertas > 0 ? ` (${nAlertas})` : ""}
        </Link>
      </div>
```

- [ ] **Step 7: Suite completa** — `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde; rota `/onboarding/alertas` compila).

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/onboarding/alertas" "src/app/(app)/onboarding/page.tsx" src/tests/onboarding/alertas-view-render.test.tsx
git commit -m "feat(onboarding): tela de alertas de prazo + link em /onboarding

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Badge no Sidebar

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `contarAlertas` (Task 2).

- [ ] **Step 1: `Sidebar` — prop + badge**

Trocar a assinatura e o array `itens`, e a renderização:
```tsx
export function Sidebar({ papel, nome, alertasOnboarding = 0 }: { papel: Papel; nome: string; alertasOnboarding?: number }) {
```
Na linha do Onboarding no array `itens`, incluir o badge:
```tsx
    ...(podeCriarCliente(papel) ? [{ href: "/onboarding", label: "Onboarding", badge: alertasOnboarding }] : []),
```
(os demais itens não têm `badge`; o tipo do array aceita `badge?: number`.)
Na renderização do `Link` (dentro do `.map`), antes de `{it.label}` trocar por:
```tsx
            <span className="flex items-center justify-between gap-2">
              {it.label}
              {"badge" in it && (it as { badge?: number }).badge ? (
                <span className="rounded-full bg-negativo px-1.5 text-[10px] font-semibold text-white">{(it as { badge?: number }).badge}</span>
              ) : null}
            </span>
```

- [ ] **Step 2: `layout.tsx` — buscar contagem e passar**

Em `src/app/(app)/layout.tsx`, importar `import { podeCriarCliente } from "@/lib/clientes/permissoes";` e `import { contarAlertas } from "@/app/(app)/onboarding/alertas-actions";`. Após obter `perfil`, adicionar:
```tsx
  const alertasOnboarding = podeCriarCliente(perfil.papel) ? await contarAlertas() : 0;
```
E passar ao componente: `<Sidebar papel={perfil.papel} nome={perfil.nome} alertasOnboarding={alertasOnboarding} />`.

- [ ] **Step 3: Suite completa** — `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde).

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.tsx "src/app/(app)/layout.tsx"
git commit -m "feat(onboarding): badge de alertas de prazo no menu

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Onboarding — alertas de prazo:** tela `/onboarding/alertas` lista os itens do processo vencendo (nos
  próximos 3 dias) ou vencidos, agrupados por severidade (vence em breve / vencido / crítico), com o
  responsável e link para o cliente; filtro "só os meus". Um badge no menu mostra a contagem. Respeita o
  isolamento por cliente (contador vê só os seus).
```

- [ ] **Step 2: Commit + finalizar**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog dos alertas de prazo (Ciclo C)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois usar `superpowers:finishing-a-development-branch`. (Sem migration/segredos.)

---

## Self-Review

- **Cobertura do spec:** helpers classificar/ordem (T1) ✓; actions listar/contar (T2) ✓; tela + filtro "só os meus" + link (T3) ✓; badge no menu (T4) ✓; CHANGELOG (T5) ✓. Testes unit (T1) + smoke (T3) ✓. Sem migration/cron/tabela (correto).
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Consistência de tipos:** `SeveridadeAlerta` (T1) usado em `AlertaView` (T2), consumido por `AlertasView`/tela (T3); `classificarAlerta`/`ordemSeveridade` (T1) usados no `coletar` (T2); `listarAlertas`/`contarAlertas` (T2) → T3/T4. `AlertasView` importa só `type AlertaView` (sem dep de runtime do módulo server) → smoke não precisa de mock.
- **Segurança:** a RLS de `onboarding_processo_item` já restringe aos clientes visíveis; gate `podeCriarCliente`; badge só consulta para quem gerencia cliente.
- **Escopo:** só Ciclo C in-app. Push (e-mail/WhatsApp), cron, consultoria e gatilho comercial fora.
