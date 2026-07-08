# Onboarding — Ciclo C: gatilho de consultoria Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar uma oportunidade no funil comercial, ligada ao cliente, a partir de qualquer item do onboarding (botão manual) — fechando o Ciclo C.

**Architecture:** 1 coluna (`onboarding_processo_item.oportunidade_id`) para idempotência/estado; action `gerarOportunidadeConsultoria` que insere em `oportunidade` e vincula; botão por item na `ProcessoSection`. Spec: `docs/superpowers/specs/2026-07-08-onboarding-ciclo-c-consultoria-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase (Postgres/RLS), Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`. Todos passam.
- Migration idempotente via `npm run db:migrate` (banco compartilhado, atinge prod). Imutável após aplicada.
- Gate `podeCriarCliente`; RLS de `onboarding_processo_item` isola por cliente; `oportunidade` por papel.
- Tokens SALDO na UI (violeta `#7C5CFF` = `text-violeta`). Branch: `git checkout -b feat/onboarding-consultoria develop`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `supabase/migrations/0055_onboarding_oportunidade_consultoria.sql` — **novo**: coluna.
- `src/app/(app)/clientes/[id]/processo.ts` — **modificar**: `gerarOportunidadeConsultoria` + `oportunidadeId` na view/select.
- `src/components/onboarding/ProcessoSection.tsx` — **modificar**: botão/link por item.
- `src/tests/onboarding/processo-section-render.test.tsx` — **modificar**: fixture + asserts.

---

## Task 1: Migration — coluna oportunidade_id

**Files:**
- Create: `supabase/migrations/0055_onboarding_oportunidade_consultoria.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Ciclo C: vínculo item de onboarding → oportunidade de consultoria gerada.
alter table onboarding_processo_item
  add column if not exists oportunidade_id uuid references oportunidade(id);
```

- [ ] **Step 2: Aplicar e verificar**

Run: `npm run db:migrate`
Expected: "1 migration(s) nova(s) aplicada(s)."
```bash
node --env-file=.env.local -e "import('./scripts/_db.mjs').then(async({makeClient})=>{const c=makeClient();await c.connect();const r=await c.query(\"select column_name from information_schema.columns where table_name='onboarding_processo_item' and column_name='oportunidade_id'\");console.log('coluna:', r.rows[0]?.column_name ?? 'FALTANDO');await c.end();});"
```
Expected: `coluna: oportunidade_id`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0055_onboarding_oportunidade_consultoria.sql
git commit -m "feat(onboarding): coluna oportunidade_id no item de processo (Ciclo C)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Action + view (oportunidadeId)

**Files:**
- Modify: `src/app/(app)/clientes/[id]/processo.ts`

**Interfaces:**
- Consumes: `oportunidade` (Task 1); `podeCriarCliente`, `revalidatePath`, `createServerSupabase`, `getPerfilAtual` (já importados no arquivo).
- Produces: `gerarOportunidadeConsultoria(itemId: string): Promise<{ ok?: boolean; erro?: string }>`; `ItemProcessoView` com `oportunidadeId: string | null`.

- [ ] **Step 1: `ItemProcessoView` ganha `oportunidadeId`**

Na definição de `ItemProcessoView`, acrescentar ao final do objeto (antes do `}`):
```ts
; oportunidadeId: string | null }
```
Concretamente, trocar o trecho final `...; anexoNome: string | null; temAnexo: boolean };` por
`...; anexoNome: string | null; temAnexo: boolean; oportunidadeId: string | null };`.

- [ ] **Step 2: `listarProcessoCliente` — trazer e mapear a coluna**

No `SELECT` de `listarProcessoCliente`, acrescentar `oportunidade_id` à lista de colunas (após `anexo_nome`).
No `.map(...)` que monta `ItemProcessoView`, acrescentar ao objeto:
```ts
      oportunidadeId: (r.oportunidade_id as string | null) ?? null,
```
(logo após `temAnexo: !!r.anexo_path`).

- [ ] **Step 3: Adicionar a action `gerarOportunidadeConsultoria`**

Adicionar ao final de `processo.ts`:
```ts
export async function gerarOportunidadeConsultoria(itemId: string): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: item } = await supabase.from("onboarding_processo_item").select("id, titulo, alerta_risco, descricao, processo_id, oportunidade_id").eq("id", itemId).maybeSingle();
  if (!item) return { erro: "Item não encontrado." };
  if (item.oportunidade_id) return { ok: true };
  const { data: proc } = await supabase.from("onboarding_processo").select("cliente_id").eq("id", item.processo_id as string).maybeSingle();
  if (!proc) return { erro: "Processo não encontrado." };
  const clienteId = proc.cliente_id as string;
  const { data: cli } = await supabase.from("clientes").select("razao_social").eq("id", clienteId).maybeSingle();
  const razao = (cli?.razao_social as string) ?? "Cliente";
  const { data: nova, error } = await supabase.from("oportunidade").insert({
    prospect_nome: razao,
    cliente_id: clienteId,
    servico_interesse: `Consultoria: ${item.titulo as string}`,
    origem: "Onboarding",
    responsavel_id: p.id,
    observacoes: (item.alerta_risco as string | null) ?? (item.descricao as string | null) ?? null,
    etapa: "novo",
  }).select("id").single();
  if (error || !nova) return { erro: "Falha ao gerar oportunidade." };
  await supabase.from("onboarding_processo_item").update({ oportunidade_id: nova.id as string }).eq("id", itemId);
  revalidatePath(`/onboarding/${clienteId}`);
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
```

- [ ] **Step 4: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build` (sem erros).
```bash
git add "src/app/(app)/clientes/[id]/processo.ts"
git commit -m "feat(onboarding): action gerarOportunidadeConsultoria + oportunidadeId na view

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Botão na ProcessoSection

**Files:**
- Modify: `src/components/onboarding/ProcessoSection.tsx`
- Test: `src/tests/onboarding/processo-section-render.test.tsx`

**Interfaces:**
- Consumes: `gerarOportunidadeConsultoria` + `ItemProcessoView.oportunidadeId` (Task 2); wrapper `chamar` e estado `ocupado` (já existentes).

- [ ] **Step 1: Atualizar o smoke (fixture + asserts)**

Em `src/tests/onboarding/processo-section-render.test.tsx`:
- No item `id: "1"`, acrescentar `oportunidadeId: "op1"` ao objeto (antes do `}`).
- No item `id: "2"`, acrescentar `oportunidadeId: null` ao objeto.
- Dentro do teste que renderiza o processo com itens (o que usa `itens={itens}`), acrescentar ao final:
```tsx
    expect(html).toContain("Gerar oportunidade de consultoria");
    expect(html).toContain("ver no funil");
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- processo-section-render`
Expected: FAIL (os textos ainda não existem; e o tipo exige `oportunidadeId`).

- [ ] **Step 3: Imports na `ProcessoSection`**

Acrescentar no topo `import Link from "next/link";`. E incluir `gerarOportunidadeConsultoria` no import existente de `processo`:
```tsx
import { iniciarProcesso, salvarProcessoItem, removerProcessoItem, revelarSenha, anexarProcessoItem, urlAnexoProcessoItem, removerAnexoProcessoItem, gerarOportunidadeConsultoria, type ItemProcessoView, type ProcessoView } from "@/app/(app)/clientes/[id]/processo";
```

- [ ] **Step 4: Adicionar a linha de ação por item**

Logo após a linha do alerta de risco:
```tsx
                  {it.alertaRisco && <p className="mt-1 rounded bg-negativo/10 px-2 py-1 text-xs text-negativo">⚠ {it.alertaRisco}</p>}
```
acrescentar:
```tsx
                  <div className="mt-1 text-xs">
                    {it.oportunidadeId ? (
                      <span className="text-cinza">Oportunidade de consultoria criada ✓ <Link href="/comercial" className="text-verde underline">ver no funil</Link></span>
                    ) : (
                      <button type="button" disabled={ocupado} onClick={() => void chamar(() => gerarOportunidadeConsultoria(it.id))} className="text-violeta underline">Gerar oportunidade de consultoria</button>
                    )}
                  </div>
```

- [ ] **Step 5: Rodar e ver passar** — `npm test -- processo-section-render`
Expected: PASS.

- [ ] **Step 6: Verificação completa** — `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde).

- [ ] **Step 7: Commit**

```bash
git add src/components/onboarding/ProcessoSection.tsx src/tests/onboarding/processo-section-render.test.tsx
git commit -m "feat(onboarding): botão 'Gerar oportunidade de consultoria' por item

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Onboarding × Comercial — gatilho de consultoria:** em qualquer item do processo de onboarding, um botão
  **"Gerar oportunidade de consultoria"** cria uma oportunidade no funil comercial já ligada ao cliente
  (serviço "Consultoria: …", etapa Novo). O item passa a mostrar "criada ✓ · ver no funil". Fecha o Ciclo C.
```

- [ ] **Step 2: Commit + finalizar**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog do gatilho de consultoria (Ciclo C)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois usar `superpowers:finishing-a-development-branch`. (Migration 0055 já aplicada; sem novos segredos.)

---

## Self-Review

- **Cobertura do spec:** coluna `oportunidade_id` (T1) ✓; action `gerarOportunidadeConsultoria` idempotente + `oportunidadeId` na view/select (T2) ✓; botão/link por item na `ProcessoSection` (T3) ✓; CHANGELOG (T4) ✓. Smoke (T3) ✓.
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Consistência de tipos:** `ItemProcessoView.oportunidadeId` (T2) consumido pela `ProcessoSection` (T3) e pelo fixture do smoke; `gerarOportunidadeConsultoria(itemId)` (T2) chamado via `chamar` (T3); campos da `oportunidade` (prospect_nome, cliente_id, servico_interesse, origem, responsavel_id, observacoes, etapa) batem com a tabela 0054.
- **Segurança:** gate `podeCriarCliente`; leituras/escritas pelo client de sessão (RLS por cliente no item; por papel na oportunidade); idempotente (não duplica se `oportunidade_id` já setado).
- **Sequência sem quebra:** T2 adiciona `oportunidadeId` à view (não usado ainda pela UI → build verde); T3 usa e atualiza o smoke junto. T1 antes de T2 (coluna).
- **Escopo:** só o gatilho manual. Automação/flag/métricas fora. Fecha o Ciclo C.
