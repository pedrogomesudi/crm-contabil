# Comercial — Kanban arrastável Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover as oportunidades arrastando os cards entre as colunas do funil (Kanban), mantendo as setas ← → e Ganho/Perdido.

**Architecture:** Drag-and-drop nativo do HTML no `QuadroComercial.tsx` — cards ativos `draggable`, colunas como alvos que chamam a action existente `definirEtapa`. Sem dependência, migration ou mudança de action. Spec: `docs/superpowers/specs/2026-07-08-comercial-kanban-design.md`.

**Tech Stack:** Next.js 16 (client component), TypeScript, Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`. Todos passam.
- Sem migration, dependência nova, nem mudança de schema/action (reaproveita `definirEtapa`).
- Tokens SALDO na UI. Branch: `git checkout -b feat/comercial-kanban develop`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `src/app/(app)/comercial/QuadroComercial.tsx` — **modificar**: estado de arraste + colunas como alvo + cards `draggable`.
- `src/tests/comercial/quadro-render.test.tsx` — **modificar**: assert de `draggable`.

---

## Task 1: Kanban arrastável no QuadroComercial

**Files:**
- Modify: `src/app/(app)/comercial/QuadroComercial.tsx`
- Test: `src/tests/comercial/quadro-render.test.tsx`

**Interfaces:**
- Consumes: `definirEtapa`, `EtapaOportunidade` (via os tipos já importados no arquivo), `etapaAdjacente`/`resumoFunil`/`ETAPAS_ATIVAS` (já importados).

- [ ] **Step 1: Adicionar o assert de `draggable` ao smoke**

Em `src/tests/comercial/quadro-render.test.tsx`, dentro do teste "renderiza colunas e card ativo", acrescentar ao final:
```tsx
    expect(html).toContain('draggable="true"');
```
(Fica logo após `expect(html).toContain("Padaria Sol");`.)

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- quadro-render`
Expected: FAIL (o HTML ainda não tem `draggable="true"`).

- [ ] **Step 3: Importar o tipo `EtapaOportunidade` no componente**

No topo de `QuadroComercial.tsx`, incluir `EtapaOportunidade` no import do funil:
```tsx
import { ETAPAS_ATIVAS, etapaAdjacente, resumoFunil, rotuloEtapa, type EtapaOportunidade } from "@/lib/comercial/funil";
```

- [ ] **Step 4: Adicionar estado de arraste + handler de soltura**

Logo abaixo de `const [form, setForm] = useState<...>(null);`, adicionar:
```tsx
  const [arrastando, setArrastando] = useState<{ id: string; etapa: EtapaOportunidade } | null>(null);
  const [sobreColuna, setSobreColuna] = useState<EtapaOportunidade | null>(null);

  function soltarNa(etapa: EtapaOportunidade) {
    const a = arrastando;
    setArrastando(null);
    setSobreColuna(null);
    if (a && a.etapa !== etapa) void chamar(() => definirEtapa(a.id, etapa));
  }
```

- [ ] **Step 5: Tornar as colunas alvos de soltura (com realce)**

Substituir a abertura da `<div>` da coluna:
```tsx
            <div key={col.chave} className="min-w-[240px] flex-1 space-y-2">
```
por:
```tsx
            <div
              key={col.chave}
              onDragOver={(e) => { e.preventDefault(); setSobreColuna(col.chave); }}
              onDragLeave={() => setSobreColuna((s) => (s === col.chave ? null : s))}
              onDrop={(e) => { e.preventDefault(); soltarNa(col.chave); }}
              className={`min-w-[240px] flex-1 space-y-2 rounded-lg ${sobreColuna === col.chave ? "ring-1 ring-verde" : ""}`}
            >
```

- [ ] **Step 6: Tornar os cards ativos arrastáveis**

Substituir a abertura da `<div>` do card ativo:
```tsx
                <div key={o.id} className="space-y-1 rounded-lg border border-linha bg-white px-2.5 py-2 text-sm">
```
por:
```tsx
                <div
                  key={o.id}
                  draggable
                  onDragStart={() => setArrastando({ id: o.id, etapa: o.etapa })}
                  onDragEnd={() => { setArrastando(null); setSobreColuna(null); }}
                  className="space-y-1 rounded-lg border border-linha bg-white px-2.5 py-2 text-sm cursor-grab"
                >
```

- [ ] **Step 7: Rodar e ver passar** — `npm test -- quadro-render`
Expected: PASS (2 testes).

- [ ] **Step 8: Verificação completa** — `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde).

- [ ] **Step 9: Commit**

```bash
git add "src/app/(app)/comercial/QuadroComercial.tsx" src/tests/comercial/quadro-render.test.tsx
git commit -m "feat(comercial): Kanban arrastável no quadro (drag-and-drop nativo)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Alterado`:
```markdown
- **Comercial — Kanban:** no quadro do funil, agora dá para **arrastar os cards** entre as colunas
  (Novo → Contato feito → Proposta enviada → Negociação); ao soltar, a etapa muda. As setas ← → e os
  botões Ganho/Perdido continuam (fallback no celular).
```
(Se ainda não houver `### Alterado` sob `## [Não lançado]`, criá-la logo abaixo do título.)

- [ ] **Step 2: Commit + finalizar**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog do Kanban do comercial

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois usar `superpowers:finishing-a-development-branch`. (Sem migration/segredos.)

---

## Self-Review

- **Cobertura do spec:** cards ativos `draggable` + `onDragStart`/`onDragEnd` (T1 passo 6) ✓; colunas como alvo com realce + `onDrop`→`definirEtapa` (T1 passos 4–5) ✓; setas/Ganho/Perdido/editar preservados (não tocados) ✓; "Fechados" não arrasta (só os cards ativos ganham `draggable`) ✓; teste de `draggable` (T1 passos 1–2) ✓; CHANGELOG (T2) ✓.
- **Placeholders:** nenhum — todos os passos têm código concreto.
- **Consistência de tipos:** `EtapaOportunidade` importado (passo 3) e usado no estado/handler (passos 4–6); `soltarNa` usa o wrapper `chamar` e a action `definirEtapa` já existentes; `col.chave`/`o.etapa` são `EtapaOportunidade`.
- **Escopo:** só o quadro; sem migration/dependência/action nova.
