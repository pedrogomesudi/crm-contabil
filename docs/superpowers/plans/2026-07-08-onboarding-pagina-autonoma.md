# Onboarding — página autônoma por cliente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao onboarding de cada cliente uma página própria (`/onboarding/[clienteId]`), tirando a seção do fim do cadastro e deixando lá só um link.

**Architecture:** Nova rota server que reaproveita a `ProcessoSection` com os mesmos dados que a ficha buscava; os links da lista/alertas apontam para ela; o cadastro perde a seção e ganha um link. Spec: `docs/superpowers/specs/2026-07-08-onboarding-pagina-autonoma-design.md`.

**Tech Stack:** Next.js 16 (App Router, Server Components), TypeScript, Supabase, Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`. Todos passam.
- Sem migration/tabela; nenhuma mudança em `ProcessoSection` nem nas actions do onboarding.
- Gate `podeCriarCliente` na rota; RLS de `clientes` isola o acesso.
- Tokens SALDO na UI. Branch: `git checkout -b feat/onboarding-pagina-autonoma develop`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `src/app/(app)/onboarding/[clienteId]/page.tsx` — **novo**: página autônoma do onboarding do cliente.
- `src/app/(app)/onboarding/ListaProcessos.tsx` — **modificar**: link → `/onboarding/{id}`.
- `src/app/(app)/onboarding/alertas/AlertasView.tsx` — **modificar**: link → `/onboarding/{id}`.
- `src/app/(app)/clientes/[id]/page.tsx` — **modificar**: remove a `ProcessoSection` + dados; adiciona link.

---

## Task 1: Rota autônoma `/onboarding/[clienteId]`

**Files:**
- Create: `src/app/(app)/onboarding/[clienteId]/page.tsx`

**Interfaces:**
- Consumes: `listarProcessoCliente` (de `clientes/[id]/processo`), `sugerirPerfil` (`@/lib/onboarding/processo`), `listarTemplatesAtivos` (`@/app/(app)/onboarding/template-actions`), `ProcessoSection`, `podeCriarCliente`/`podeRevelarCredencial`, `PageHeader`.

- [ ] **Step 1: Criar a página**

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente, podeRevelarCredencial } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProcessoSection } from "@/components/onboarding/ProcessoSection";
import { listarProcessoCliente } from "@/app/(app)/clientes/[id]/processo";
import { sugerirPerfil } from "@/lib/onboarding/processo";
import { listarTemplatesAtivos } from "@/app/(app)/onboarding/template-actions";

export default async function OnboardingClientePage({ params }: { params: Promise<{ clienteId: string }> }) {
  const { clienteId } = await params;
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const supabase = await createServerSupabase();
  const { data: cliente } = await supabase.from("clientes").select("id, razao_social, tipo_pessoa, regime_tributario").eq("id", clienteId).maybeSingle();
  if (!cliente) notFound();

  const proc = await listarProcessoCliente(clienteId);
  const { data: us } = await supabase.from("usuarios").select("id, nome").eq("ativo", true).order("nome");
  const usuarios = (us as { id: string; nome: string }[] | null) ?? [];
  const templates = await listarTemplatesAtivos();
  const { data: fin } = await supabase.from("clientes_financeiro").select("qtd_funcionarios").eq("cliente_id", clienteId).maybeSingle();
  const perfilSugerido = sugerirPerfil(String(cliente.tipo_pessoa ?? "PJ"), String(cliente.regime_tributario ?? ""), (fin?.qtd_funcionarios as number | null) ?? null);
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <PageHeader titulo={cliente.razao_social as string} subtitulo="Onboarding do cliente" />
      <Link href={`/clientes/${clienteId}`} className="text-sm text-verde underline">
        Ver cadastro completo
      </Link>
      {proc && (
        <ProcessoSection
          clienteId={clienteId}
          processo={proc.processo}
          itens={proc.itens}
          progresso={proc.progresso}
          usuarios={usuarios}
          podeRevelar={podeRevelarCredencial(perfil.papel)}
          perfilSugerido={perfilSugerido}
          hoje={hoje}
          templates={templates}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verificar** — Run: `npm run lint && npm run typecheck && npm run build` (sem erros; a rota `/onboarding/[clienteId]` aparece no output do build).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/onboarding/[clienteId]/page.tsx"
git commit -m "feat(onboarding): página autônoma de onboarding por cliente

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Apontar links e enxugar o cadastro

**Files:**
- Modify: `src/app/(app)/onboarding/ListaProcessos.tsx`
- Modify: `src/app/(app)/onboarding/alertas/AlertasView.tsx`
- Modify: `src/app/(app)/clientes/[id]/page.tsx`

**Interfaces:**
- Consumes: a rota `/onboarding/[clienteId]` (Task 1).

- [ ] **Step 1: `ListaProcessos.tsx` — link para a rota autônoma**

Trocar:
```tsx
                  <Link href={`/clientes/${o.clienteId}`} className="text-texto underline decoration-linha hover:decoration-verde">
```
por:
```tsx
                  <Link href={`/onboarding/${o.clienteId}`} className="text-texto underline decoration-linha hover:decoration-verde">
```

- [ ] **Step 2: `AlertasView.tsx` — link para a rota autônoma**

Trocar:
```tsx
                    <Link href={`/clientes/${a.clienteId}`} className="font-medium text-texto underline decoration-linha hover:decoration-verde">
```
por:
```tsx
                    <Link href={`/onboarding/${a.clienteId}`} className="font-medium text-texto underline decoration-linha hover:decoration-verde">
```

- [ ] **Step 3: Cadastro — remover imports do onboarding**

Em `src/app/(app)/clientes/[id]/page.tsx`, trocar o import de permissões (linha 5) para tirar `podeRevelarCredencial` (não mais usado):
```ts
import { podeAtribuirContador, podeVerHonorario, podeExcluirCliente, podeCriarCliente } from "@/lib/clientes/permissoes";
```
E **remover** as três linhas de import do onboarding (6–8/9):
```ts
import { ProcessoSection } from "@/components/onboarding/ProcessoSection";
import { listarProcessoCliente } from "./processo";
import { sugerirPerfil } from "@/lib/onboarding/processo";
import { listarTemplatesAtivos } from "@/app/(app)/onboarding/template-actions";
```
E **adicionar** o import do Link (no topo, junto aos demais):
```ts
import Link from "next/link";
```

- [ ] **Step 4: Cadastro — remover o carregamento dos dados do onboarding**

Remover o bloco inteiro (o trecho que começa em `const podeOnboarding = podeCriarCliente(papel);` e vai
até `const hojeOnb = new Date()...;`):
```ts
  const podeOnboarding = podeCriarCliente(papel);
  const proc = podeOnboarding ? await listarProcessoCliente(id) : null;
  let usuariosOnb: { id: string; nome: string }[] = [];
  let templatesOnb: { id: string; nome: string }[] = [];
  let perfilSugerido: "mei" | "simples_sem_func" | "simples_com_func" | "presumido_real" | "pf" = "simples_sem_func";
  if (podeOnboarding) {
    const { data: us } = await supabase.from("usuarios").select("id, nome").eq("ativo", true).order("nome");
    usuariosOnb = (us as { id: string; nome: string }[] | null) ?? [];
    templatesOnb = await listarTemplatesAtivos();
    const { data: fin } = await supabase.from("clientes_financeiro").select("qtd_funcionarios").eq("cliente_id", id).maybeSingle();
    perfilSugerido = sugerirPerfil(String(cliente.tipo_pessoa ?? "PJ"), String(cliente.regime_tributario ?? ""), (fin?.qtd_funcionarios as number | null) ?? null);
  }
  const hojeOnb = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
```

- [ ] **Step 5: Cadastro — remover a `ProcessoSection` do JSX e adicionar o link**

Remover o bloco JSX da seção (o `{proc && ( <ProcessoSection ... /> )}`):
```tsx
      {proc && (
        <ProcessoSection
          clienteId={id}
          processo={proc.processo}
          itens={proc.itens}
          progresso={proc.progresso}
          usuarios={usuariosOnb}
          podeRevelar={podeRevelarCredencial(papel)}
          perfilSugerido={perfilSugerido}
          hoje={hojeOnb}
          templates={templatesOnb}
        />
      )}
```
E, logo após o parágrafo da competência inicial (o `{(cliente as { competencia_inicial ... }).competencia_inicial && ( <p ...>...</p> )}`), adicionar o link:
```tsx
      {podeCriarCliente(papel) && (
        <Link href={`/onboarding/${id}`} className="text-sm text-verde underline">
          Abrir onboarding
        </Link>
      )}
```

- [ ] **Step 6: Suite completa** — Run: `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde; sem imports órfãos; a ficha do cliente e a rota autônoma compilam).

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/onboarding/ListaProcessos.tsx" "src/app/(app)/onboarding/alertas/AlertasView.tsx" "src/app/(app)/clientes/[id]/page.tsx"
git commit -m "feat(onboarding): links apontam para a página autônoma + cadastro enxuto

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Alterado`:
```markdown
- **Onboarding — página própria por cliente:** o onboarding de cada cliente agora abre em uma página
  dedicada (`/onboarding/[cliente]`), acessada pela lista de processos, pelos alertas e por um link no
  cadastro. O cadastro do cliente deixou de exibir a seção completa (ficou mais curto).
```
(Se ainda não houver a seção `### Alterado` sob `## [Não lançado]`, criá-la logo abaixo do título.)

- [ ] **Step 2: Commit + finalizar**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog da página autônoma de onboarding

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois usar `superpowers:finishing-a-development-branch`. (Sem migration/segredos.)

---

## Self-Review

- **Cobertura do spec:** rota autônoma com cabeçalho + `ProcessoSection` (T1) ✓; links de lista/alertas (T2 passos 1–2) ✓; cadastro perde a seção e ganha link, com limpeza de imports (T2 passos 3–5) ✓; CHANGELOG (T3) ✓.
- **Placeholders:** nenhum — todo passo tem código concreto.
- **Consistência de tipos:** a nova rota passa à `ProcessoSection` exatamente as mesmas props do uso atual (`clienteId, processo, itens, progresso, usuarios, podeRevelar, perfilSugerido, hoje, templates`); `listarProcessoCliente`/`sugerirPerfil`/`listarTemplatesAtivos` reutilizados sem alteração. Após a limpeza, o cadastro não referencia mais `podeRevelarCredencial`/`ProcessoSection`/etc.
- **Sem colisão de rota:** `/onboarding/alertas` (estático) tem prioridade sobre `/onboarding/[clienteId]` (dinâmico); ids são UUID.
- **Escopo:** só roteamento + mover a seção. Nenhuma mudança de comportamento do onboarding.
