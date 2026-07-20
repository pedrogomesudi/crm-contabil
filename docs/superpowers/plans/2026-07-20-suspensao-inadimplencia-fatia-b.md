# Suspensão por Inadimplência — Fatia B (trava do portal) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Travar granularmente o portal do cliente suspenso — bloquear documentos, notas, guias e a abertura de novas solicitações/uploads, mantendo visíveis os boletos e a situação financeira para o cliente se regularizar.

**Architecture:** Defesa em profundidade — RLS no banco (função `auth_cliente_suspenso()` + recriação das policies portal com `and not auth_cliente_suspenso()`) somada a um gate de UI (banner no layout + tela de bloqueio nas páginas travadas). A Fatia A já entregou `clientes.suspenso` (0117); esta fatia só o consome.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + RLS), Tailwind 4, vitest + `renderToStaticMarkup`.

## Global Constraints

- Papel via `usuarios.papel`/`auth_papel()`; cliente do portal via `auth_cliente_id()` — nunca do JWT.
- Migration nova idempotente (`create or replace function`, `drop policy if exists ... ; create policy ...`). Aplicada por `npm run db:migrate`.
- **Manter `clientes_portal_sel` liberada** — o cliente precisa ler o próprio `suspenso` (banner) e `razao_social`. Travar só documentos/nfse/obrigacao_instancia + os inserts (nova solicitação, upload).
- **Manter `titulo_portal_sel` e `boleto_portal_sel` intactas** — situação financeira e boletos seguem visíveis ao suspenso.
- Preservar VERBATIM os ramos de equipe (`auth_papel() in (...)`) das policies que têm OR — só o ramo do cliente ganha `and not auth_cliente_suspenso()`.
- `next/image`, imports `@/*`. Guard `divida-ui`: sem `border` estático em input escrito à mão; sem `←`/`amber-\d`.
- Rodar antes de commitar: `npm run lint && npm run typecheck && npm test && npm run format && npm run build`.

---

### Task 1: Migration 0118 — função `auth_cliente_suspenso()` e recriação das policies

**Files:**
- Create: `supabase/migrations/0118_portal_trava_suspensao.sql`

**Interfaces:**
- Produces (banco):
  - função `auth_cliente_suspenso() returns boolean` (security definer, stable) — true se o cliente logado está suspenso.
  - policies recriadas: `documentos_portal_sel`, `nfse_portal_sel`, `obrig_portal_sel` (SELECT + `and not auth_cliente_suspenso()`); `documentos_portal_ins`, `solicitacao_ins` (INSERT, ramo do cliente + `and not auth_cliente_suspenso()`).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0118_portal_trava_suspensao.sql
-- RF Financeiro: suspensão por inadimplência (Fatia B — trava do portal).
-- O cliente suspenso perde acesso a documentos, notas e guias e não abre nova
-- solicitação nem envia documento; boletos e situação financeira seguem visíveis.

-- Espelha auth_cliente_id() (0085) com o search_path endurecido de auth_papel() (0011).
create or replace function auth_cliente_suspenso() returns boolean
  language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(c.suspenso, false)
  from usuarios u
  join clientes c on c.id = u.cliente_id
  where u.id = auth.uid() and u.papel = 'cliente' and u.ativo
$$;
revoke all on function auth_cliente_suspenso() from public;
grant execute on function auth_cliente_suspenso() to authenticated;

-- LEITURA travada: documentos, notas, guias.
drop policy if exists documentos_portal_sel on documentos;
create policy documentos_portal_sel on documentos for select to authenticated
  using (cliente_id = auth_cliente_id() and not auth_cliente_suspenso());

drop policy if exists nfse_portal_sel on nfse;
create policy nfse_portal_sel on nfse for select to authenticated
  using (cliente_id = auth_cliente_id() and not auth_cliente_suspenso());

drop policy if exists obrig_portal_sel on obrigacao_instancia;
create policy obrig_portal_sel on obrigacao_instancia for select to authenticated
  using (cliente_id = auth_cliente_id() and not auth_cliente_suspenso());

-- INTERAÇÃO travada: envio de documento e abertura de nova solicitação.
-- Preserva o ramo de equipe das policies com OR — só o ramo do cliente ganha a trava.
drop policy if exists documentos_portal_ins on documentos;
create policy documentos_portal_ins on documentos for insert to authenticated
  with check (cliente_id = auth_cliente_id() and origem = 'cliente' and not auth_cliente_suspenso());

drop policy if exists solicitacao_ins on solicitacao;
create policy solicitacao_ins on solicitacao for insert to authenticated with check (
  (cliente_id = auth_cliente_id() and status = 'aberta' and not auth_cliente_suspenso())
  or (auth_papel() in ('admin','assistente','contador') and exists (select 1 from clientes c where c.id = cliente_id))
);
```

- [ ] **Step 2: Verify idempotency + preservation**

Run: `grep -cE "drop policy if exists|create or replace" supabase/migrations/0118_portal_trava_suspensao.sql`
Expected: ≥ 6.

Confirme visualmente: (a) `titulo_portal_sel`/`boleto_portal_sel`/`clientes_portal_sel` NÃO aparecem no arquivo (seguem intactas da 0085); (b) o ramo de equipe de `solicitacao_ins` está idêntico ao original (`auth_papel() in ('admin','assistente','contador') and exists (...)`).

> Aplicada em produção via `node --env-file=.env.producao.bak scripts/db-migrate.mjs` antes do Implantar. RLS validada por `npm run db:test` quando houver Session pooler.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0118_portal_trava_suspensao.sql
git commit -m "feat(suspensao): trava RLS do portal para cliente suspenso (0118)"
```

---

### Task 2: Componente `AvisoSuspensao` + helper `portalSuspenso()`

**Files:**
- Create: `src/lib/portal/suspensao.ts`
- Create: `src/components/portal/AvisoSuspensao.tsx`
- Test: `src/tests/portal/aviso-suspensao.test.tsx`

**Interfaces:**
- Produces:
  - `portalSuspenso(): Promise<boolean>` — lê `clientes.suspenso` do cliente logado (via RLS, memoizado por request).
  - `AvisoSuspensao({ variante, recurso }: { variante: "banner" | "bloqueio"; recurso?: string })` — server component; `banner` = faixa no topo; `bloqueio` = tela cheia da seção travada.

- [ ] **Step 1: Write the helper**

```ts
// src/lib/portal/suspensao.ts
import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";

// true se o cliente logado no portal está suspenso. Memoizado por request:
// layout e páginas chamam sem repetir a query. RLS (clientes_portal_sel) devolve
// só o próprio cadastro.
export const portalSuspenso = cache(async (): Promise<boolean> => {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("clientes").select("suspenso").maybeSingle();
  return Boolean(data?.suspenso);
});
```

- [ ] **Step 2: Write the failing test**

```tsx
// src/tests/portal/aviso-suspensao.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AvisoSuspensao } from "@/components/portal/AvisoSuspensao";

describe("AvisoSuspensao", () => {
  it("banner cita pendência financeira e os boletos", () => {
    const html = renderToStaticMarkup(<AvisoSuspensao variante="banner" />);
    expect(html).toContain("suspenso");
    expect(html).toContain("boletos");
  });
  it("bloqueio nomeia o recurso travado", () => {
    const html = renderToStaticMarkup(<AvisoSuspensao variante="bloqueio" recurso="Documentos" />);
    expect(html).toContain("Documentos");
    expect(html).toContain("boletos");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/tests/portal/aviso-suspensao.test.tsx`
Expected: FAIL (componente não existe).

- [ ] **Step 4: Write the component**

```tsx
// src/components/portal/AvisoSuspensao.tsx
import Link from "next/link";

// Aviso de acesso suspenso por pendência financeira. `banner` = faixa no topo
// (todas as telas); `bloqueio` = ocupa a seção travada (documentos/notas/guias).
export function AvisoSuspensao({ variante, recurso }: { variante: "banner" | "bloqueio"; recurso?: string }) {
  if (variante === "banner") {
    return (
      <div className="rounded-lg border border-negativo/40 bg-negativo/5 px-4 py-3 text-sm text-negativo" role="alert">
        Acesso parcialmente suspenso por pendência financeira. Regularize os{" "}
        <Link href="/portal/boletos" className="font-medium underline">
          boletos
        </Link>{" "}
        para reativar.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-linha bg-white p-8 text-center" role="alert">
      <h1 className="text-base font-semibold text-texto">{recurso ?? "Este recurso"} indisponível</h1>
      <p className="mt-2 text-sm text-cinza">
        O acesso está suspenso por pendência financeira. Assim que os boletos em aberto forem pagos, ele volta
        automaticamente.
      </p>
      <Link
        href="/portal/boletos"
        className="mt-4 inline-block rounded-lg bg-verde px-4 py-2 text-sm font-medium text-white"
      >
        Ver boletos
      </Link>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/tests/portal/aviso-suspensao.test.tsx`
Expected: PASS (4 assertions).

- [ ] **Step 6: Commit**

```bash
git add src/lib/portal/suspensao.ts src/components/portal/AvisoSuspensao.tsx src/tests/portal/aviso-suspensao.test.tsx
git commit -m "feat(suspensao): componente de aviso e helper portalSuspenso"
```

---

### Task 3: Ligar o gate de UI — banner no layout + bloqueio nas 3 páginas

**Files:**
- Modify: `src/app/(portal)/layout.tsx`
- Modify: `src/app/(portal)/portal/documentos/page.tsx`
- Modify: `src/app/(portal)/portal/notas/page.tsx`
- Modify: `src/app/(portal)/portal/guias/page.tsx`

**Interfaces:**
- Consumes: `portalSuspenso` de `@/lib/portal/suspensao`; `AvisoSuspensao` de `@/components/portal/AvisoSuspensao`.

- [ ] **Step 1: Banner no layout**

Em `src/app/(portal)/layout.tsx`: (a) trocar o select do cliente para incluir `suspenso`; (b) importar `AvisoSuspensao`; (c) renderizar o banner dentro do `<main>` quando suspenso.

Trocar a linha 27:

```tsx
  const { data: cliente } = await supabase.from("clientes").select("razao_social, suspenso").maybeSingle();
```

Adicionar ao bloco de imports (após a linha 7):

```tsx
import { AvisoSuspensao } from "@/components/portal/AvisoSuspensao";
```

Trocar a linha 62 (o `<main>`):

```tsx
      <main className="mx-auto max-w-[1280px] space-y-4 p-4">
        {cliente?.suspenso ? <AvisoSuspensao variante="banner" /> : null}
        {children}
      </main>
```

- [ ] **Step 2: Bloqueio na página de documentos**

Em `src/app/(portal)/portal/documentos/page.tsx`, adicionar o import e o early-return no topo do componente, ANTES da query.

Imports (junto aos existentes):

```tsx
import { portalSuspenso } from "@/lib/portal/suspensao";
import { AvisoSuspensao } from "@/components/portal/AvisoSuspensao";
```

No início de `PortalDocumentosPage`, antes de `const supabase = ...`:

```tsx
  if (await portalSuspenso()) return <AvisoSuspensao variante="bloqueio" recurso="Documentos" />;
```

- [ ] **Step 3: Bloqueio na página de notas**

Em `src/app/(portal)/portal/notas/page.tsx`, mesmos imports e, no início de `PortalNotasPage` antes da query:

```tsx
  if (await portalSuspenso()) return <AvisoSuspensao variante="bloqueio" recurso="Notas fiscais" />;
```

- [ ] **Step 4: Bloqueio na página de guias**

Em `src/app/(portal)/portal/guias/page.tsx`, mesmos imports e, no início de `PortalGuiasPage` antes da query:

```tsx
  if (await portalSuspenso()) return <AvisoSuspensao variante="bloqueio" recurso="Guias" />;
```

- [ ] **Step 5: Full gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tudo verde. (`divida-ui` ok — o banner usa `border-negativo/40`, não `border` estático de input; sem `amber`/`←`.)

- [ ] **Step 6: Commit**

```bash
git add "src/app/(portal)/layout.tsx" "src/app/(portal)/portal/documentos/page.tsx" "src/app/(portal)/portal/notas/page.tsx" "src/app/(portal)/portal/guias/page.tsx"
git commit -m "feat(suspensao): banner no portal e bloqueio de documentos/notas/guias"
```

---

## Self-Review

**1. Spec coverage (Fatia B):**
- Função `auth_cliente_suspenso()` → Task 1. ✅
- RLS bloqueando documentos/notas/guias → Task 1 (recria os 3 `_portal_sel`). ✅
- RLS bloqueando nova solicitação + upload → Task 1 (`solicitacao_ins`, `documentos_portal_ins`, ramo do cliente). ✅
- Títulos e boletos liberados → Task 1 não toca `titulo_portal_sel`/`boleto_portal_sel`. ✅
- Ler solicitações existentes liberado → `solicitacao_sel` e `solic_msg_*` não são tocadas. ✅
- Banner de UI no portal → Task 3 (layout). ✅
- Tela de bloqueio nas páginas travadas → Task 3 (documentos/notas/guias). ✅
- `clientes_portal_sel` mantida (banner lê `suspenso`) → Task 1 não a toca; layout lê `suspenso`. ✅

**2. Placeholder scan:** Nenhum TBD/TODO; todo passo com código completo. ✅

**3. Type consistency:** `portalSuspenso(): Promise<boolean>` e `AvisoSuspensao({variante, recurso})` usados de forma idêntica no layout e nas 3 páginas. Nomes de policy e tabelas conferidos contra 0085/0086/0087 (via exploração). Ramo de equipe de `solicitacao_ins` copiado verbatim. ✅

**Nota de escopo:** o bloqueio de **upload de documento** (`documentos_portal_ins`) vai além da tabela literal do spec (que lista "nova solicitação"), mas é a mesma intenção — travar interações do cliente suspenso — e evita a incoerência de bloquear a leitura de documentos mantendo o envio aberto.
