# Observabilidade — Fatia A (registro de erros + painel) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar erros server-side não tratados numa tabela e expô-los num painel admin, para o operador diagnosticar sem caçar no log do container.

**Architecture:** `src/instrumentation.ts` exporta `onRequestError` (hook do Next 16) que normaliza o erro via um helper puro (`montarEventoErro`) e grava em `evento_erro` (service_role, best-effort, pula runtime edge). Um painel `/configuracoes/observabilidade` (admin) lista os erros; a tabela é um componente puro testável.

**Tech Stack:** Next.js 16 (App Router, `instrumentation.ts`) · TypeScript · Supabase · Vitest.

## Global Constraints

- **Best-effort:** o `onRequestError` **nunca lança** (logar não pode derrubar o request) e **pula o runtime edge** (`process.env.NEXT_RUNTIME === "edge"` → return; o client admin é Node-only).
- **RLS:** `evento_erro` — leitura só `auth_papel()='admin'`; sem policy de insert (escrita via service_role).
- **Migration idempotente** (`create table if not exists`, `drop policy if exists`); aplicar por `npm run db:migrate`; **NÃO** `supabase db push`. Próximo número: **`0129`**.
- **Papel:** ler de `usuarios.papel` via `getPerfilAtual` / `auth_papel()`.
- **Sem segredo em log/aviso.** A `stack` é cortada (6000 chars) e a `mensagem` (2000).
- **Comandos antes de commitar:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`, `npm run build`.
- **Git:** `develop` → PR para `main` com `verify` verde.

**Fatos verificados:**
- `onRequestError(error: {digest:string}&Error, request: {path,method,headers}, context: {routerKind, routePath, routeType, renderSource, revalidateReason, renderType})` — tipo `Instrumentation.onRequestError` de `next`. Estável desde v15 (sem flag).
- Projeto em `src/` → arquivo é `src/instrumentation.ts`. Swallow best-effort com `catch { /* comentário */ }` é aceito pelo ESLint (padrão de `src/proxy.ts`).
- Primitivos: `Container` (`largura` estreita/padrao/larga), `PageHeader`, `Voltar`, `EmptyState({titulo, descricao?, acao?})`. Hub de config: array `ITENS` em `src/app/(app)/configuracoes/page.tsx`; rota alcançável pela regra `POR_HUB` (`/configuracoes/`) de `rotas-alcancaveis`.
- `createAdminSupabase()` (service_role). `auth_papel()` existe (SQL).

---

## File Structure

- `supabase/migrations/0129_evento_erro.sql` (Create) — tabela + RLS.
- `src/lib/observabilidade/eventoErro.ts` (Create) — helper puro `montarEventoErro`.
- `src/tests/observabilidade/eventoErro.test.ts` (Create) — testes do helper.
- `src/instrumentation.ts` (Create) — `onRequestError` → insert.
- `src/components/observabilidade/TabelaErros.tsx` (Create) — tabela pura + tipo `EventoErroView`.
- `src/tests/observabilidade/tabela-erros-render.test.tsx` (Create) — render da tabela.
- `src/app/(app)/configuracoes/observabilidade/page.tsx` (Create) — painel admin.
- `src/app/(app)/configuracoes/page.tsx` (Modify) — card "Observabilidade" no hub.

**Ordem:** migration → helper → instrumentation → painel → release.

---

### Task 1: Migration `evento_erro`

**Files:**
- Create: `supabase/migrations/0129_evento_erro.sql`

**Interfaces:**
- Produces: tabela `evento_erro` (leitura admin; escrita service_role).

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/0129_evento_erro.sql
-- Observabilidade Fatia A: registro de erros server-side capturados pelo onRequestError do Next.
-- Escrita via service_role (o hook roda fora da sessão do usuário); leitura só admin.
create table if not exists evento_erro (
  id         uuid primary key default gen_random_uuid(),
  criado_em  timestamptz not null default now(),
  mensagem   text not null,
  rota       text,
  metodo     text,
  digest     text,
  tipo_rota  text,
  stack      text,
  contexto   jsonb
);
create index if not exists idx_evento_erro_criado on evento_erro(criado_em desc);
alter table evento_erro enable row level security;
drop policy if exists evento_erro_sel on evento_erro;
create policy evento_erro_sel on evento_erro for select to authenticated using (auth_papel() = 'admin');
```

- [ ] **Step 2: Aplicar no banco de desenvolvimento**

Run: `npm run db:migrate`
Expected: `0129_evento_erro` registrada em `app_migrations`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0129_evento_erro.sql
git commit -m "feat(observabilidade): migration evento_erro (registro de erros server-side)"
```

---

### Task 2: Helper puro `montarEventoErro`

**Files:**
- Create: `src/lib/observabilidade/eventoErro.ts`
- Test: `src/tests/observabilidade/eventoErro.test.ts`

**Interfaces:**
- Produces:
  - `type EventoErroLinha = { mensagem: string; rota: string | null; metodo: string | null; digest: string | null; tipo_rota: string | null; stack: string | null; contexto: Record<string, unknown> }`
  - `montarEventoErro(err, request, context): EventoErroLinha` — defensivo (tudo `unknown`, nunca lança). Não inclui `criado_em` (default do banco).

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/tests/observabilidade/eventoErro.test.ts
import { describe, it, expect } from "vitest";
import { montarEventoErro } from "@/lib/observabilidade/eventoErro";

describe("montarEventoErro", () => {
  it("mapeia mensagem, rota, método, digest, tipo e contexto (só campos presentes)", () => {
    const linha = montarEventoErro(
      Object.assign(new Error("boom"), { digest: "abc", stack: "Error: boom\n at x" }),
      { path: "/financeiro", method: "POST" },
      {
        routerKind: "App Router",
        routePath: "/app/financeiro",
        routeType: "action",
        renderSource: "server-rendering",
      },
    );
    expect(linha.mensagem).toBe("boom");
    expect(linha.rota).toBe("/financeiro");
    expect(linha.metodo).toBe("POST");
    expect(linha.digest).toBe("abc");
    expect(linha.tipo_rota).toBe("action");
    expect(linha.stack).toContain("boom");
    expect(linha.contexto).toEqual({
      routerKind: "App Router",
      routePath: "/app/financeiro",
      renderSource: "server-rendering",
    });
  });

  it("campos ausentes viram null / (sem mensagem) e contexto vazio", () => {
    const linha = montarEventoErro({}, {}, {});
    expect(linha.mensagem).toBe("(sem mensagem)");
    expect(linha.rota).toBeNull();
    expect(linha.metodo).toBeNull();
    expect(linha.digest).toBeNull();
    expect(linha.tipo_rota).toBeNull();
    expect(linha.stack).toBeNull();
    expect(linha.contexto).toEqual({});
  });

  it("não lança com entrada nula/malformada e corta mensagem/stack", () => {
    const longa = "x".repeat(9000);
    const linha = montarEventoErro({ message: longa, stack: longa }, null, null);
    expect(linha.mensagem.length).toBe(2000);
    expect(linha.stack?.length).toBe(6000);
    expect(linha.rota).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/observabilidade/eventoErro.test.ts`
Expected: FAIL — import não resolve.

- [ ] **Step 3: Implementar**

```ts
// src/lib/observabilidade/eventoErro.ts
type ErroEntrada = { message?: unknown; stack?: unknown; digest?: unknown };
type RequestEntrada = { path?: unknown; method?: unknown };
type ContextEntrada = {
  routerKind?: unknown;
  routePath?: unknown;
  routeType?: unknown;
  renderSource?: unknown;
  revalidateReason?: unknown;
  renderType?: unknown;
};

export type EventoErroLinha = {
  mensagem: string;
  rota: string | null;
  metodo: string | null;
  digest: string | null;
  tipo_rota: string | null;
  stack: string | null;
  contexto: Record<string, unknown>;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function corta(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;
}

// Normaliza o erro capturado pelo onRequestError do Next numa linha de evento_erro. Defensivo:
// a origem é a borda do framework, então tudo é `unknown` e nada aqui pode lançar. Não inclui
// criado_em — o default do banco cobre.
export function montarEventoErro(
  err: ErroEntrada | null | undefined,
  request: RequestEntrada | null | undefined,
  context: ContextEntrada | null | undefined,
): EventoErroLinha {
  const e = err ?? {};
  const r = request ?? {};
  const c = context ?? {};
  const contexto: Record<string, unknown> = {};
  for (const k of ["routerKind", "routePath", "renderSource", "revalidateReason", "renderType"] as const) {
    if (c[k] !== undefined && c[k] !== null) contexto[k] = c[k];
  }
  return {
    mensagem: corta(e.message, 2000) ?? "(sem mensagem)",
    rota: str(r.path),
    metodo: str(r.method),
    digest: str(e.digest),
    tipo_rota: str(c.routeType),
    stack: corta(e.stack, 6000),
    contexto,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/observabilidade/eventoErro.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/observabilidade/eventoErro.ts src/tests/observabilidade/eventoErro.test.ts
git commit -m "feat(observabilidade): helper puro montarEventoErro"
```

---

### Task 3: `instrumentation.ts` — captura via `onRequestError`

**Files:**
- Create: `src/instrumentation.ts`

**Interfaces:**
- Consumes: `montarEventoErro` (Task 2); `createAdminSupabase`; tabela `evento_erro` (Task 1).

Sem teste unitário (hook de borda do framework + I/O). Cobertura: `montarEventoErro` (Task 2) + typecheck/build + smoke (forçar um erro e ver a linha na tabela).

- [ ] **Step 1: Criar o arquivo**

```ts
// src/instrumentation.ts
import type { Instrumentation } from "next";

// Captura erros server-side não tratados (route handler / server component / server action) e
// grava em evento_erro. Best-effort: nunca lança (logar não pode derrubar o request). Pula o
// runtime edge — o client admin é Node-only. Imports dinâmicos mantêm o módulo leve fora do Node.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME === "edge") return;
  try {
    const { montarEventoErro } = await import("@/lib/observabilidade/eventoErro");
    const { createAdminSupabase } = await import("@/lib/supabase/admin");
    const linha = montarEventoErro(err, request, context);
    await createAdminSupabase().from("evento_erro").insert(linha);
  } catch {
    // best-effort: registrar erro não pode derrubar o request.
  }
};
```

- [ ] **Step 2: Verificar (typecheck + lint + build)**

Run: `npm run typecheck && npx eslint src/instrumentation.ts && npm run build`
Expected: sem erros. (Se o typecheck reclamar da passagem dos tipos estritos do Next aos parâmetros frouxos do helper, confirmar que `montarEventoErro` aceita `unknown` — aceita, pois os tipos do Next são atribuíveis a `{message?:unknown;…}`.)

- [ ] **Step 3: Commit**

```bash
git add src/instrumentation.ts
git commit -m "feat(observabilidade): instrumentation onRequestError grava evento_erro"
```

---

### Task 4: Painel `/configuracoes/observabilidade`

**Files:**
- Create: `src/components/observabilidade/TabelaErros.tsx`
- Test: `src/tests/observabilidade/tabela-erros-render.test.tsx`
- Create: `src/app/(app)/configuracoes/observabilidade/page.tsx`
- Modify: `src/app/(app)/configuracoes/page.tsx`

**Interfaces:**
- Produces: `type EventoErroView`; componente puro `TabelaErros({ eventos })`.
- Consumes: `Container`, `PageHeader`, `Voltar`, `EmptyState`, `createAdminSupabase`, `getPerfilAtual`.

- [ ] **Step 1: Componente puro da tabela + render test (TDD)**

Teste primeiro:

```tsx
// src/tests/observabilidade/tabela-erros-render.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TabelaErros } from "@/components/observabilidade/TabelaErros";

const ev = {
  id: "e1",
  criadoEm: "2026-07-22T12:00:00Z",
  mensagem: "boom",
  rota: "/financeiro",
  metodo: "POST",
  digest: "abc",
  stack: "Error: boom\n at x",
};

describe("TabelaErros", () => {
  it("mostra a mensagem, a rota e o método de um erro", () => {
    const html = renderToStaticMarkup(<TabelaErros eventos={[ev]} />);
    expect(html).toContain("boom");
    expect(html).toContain("/financeiro");
    expect(html).toContain("POST");
  });
});
```

Run: `npx vitest run src/tests/observabilidade/tabela-erros-render.test.tsx`
Expected: FAIL — import não resolve.

Implementar:

```tsx
// src/components/observabilidade/TabelaErros.tsx
export type EventoErroView = {
  id: string;
  criadoEm: string;
  mensagem: string;
  rota: string | null;
  metodo: string | null;
  digest: string | null;
  stack: string | null;
};

export function TabelaErros({ eventos }: { eventos: EventoErroView[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-linha bg-white">
      <table className="w-full text-sm">
        <thead className="bg-creme text-left text-cinza">
          <tr>
            <th className="p-2 font-medium">Quando</th>
            <th className="p-2 font-medium">Rota</th>
            <th className="p-2 font-medium">Método</th>
            <th className="p-2 font-medium">Mensagem</th>
            <th className="p-2 font-medium">Digest</th>
          </tr>
        </thead>
        <tbody>
          {eventos.map((e) => (
            <tr key={e.id} className="border-t border-linha/70 align-top">
              <td className="whitespace-nowrap p-2 text-cinza">
                {new Date(e.criadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </td>
              <td className="p-2 text-cinza">{e.rota ?? "—"}</td>
              <td className="p-2 text-cinza">{e.metodo ?? "—"}</td>
              <td className="p-2">
                <details>
                  <summary className="cursor-pointer text-texto">{e.mensagem.slice(0, 120)}</summary>
                  <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap text-[11px] text-cinza">
                    {e.stack ?? "(sem stack)"}
                  </pre>
                </details>
              </td>
              <td className="whitespace-nowrap p-2 font-mono text-[11px] text-cinza-claro">{e.digest ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Run: `npx vitest run src/tests/observabilidade/tabela-erros-render.test.tsx`
Expected: PASS.

- [ ] **Step 2: Criar a página (gate admin, EmptyState quando vazio)**

```tsx
// src/app/(app)/configuracoes/observabilidade/page.tsx
import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { EmptyState } from "@/components/ui/EmptyState";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { TabelaErros, type EventoErroView } from "@/components/observabilidade/TabelaErros";

export const metadata = { title: "Observabilidade" };

export default async function ObservabilidadePage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");

  const admin = createAdminSupabase();
  const { data } = await admin
    .from("evento_erro")
    .select("id, criado_em, mensagem, rota, metodo, digest, stack")
    .order("criado_em", { ascending: false })
    .limit(100);

  const eventos: EventoErroView[] = (data ?? []).map((e) => ({
    id: e.id as string,
    criadoEm: e.criado_em as string,
    mensagem: e.mensagem as string,
    rota: (e.rota as string | null) ?? null,
    metodo: (e.metodo as string | null) ?? null,
    digest: (e.digest as string | null) ?? null,
    stack: (e.stack as string | null) ?? null,
  }));

  return (
    <Container largura="larga" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="Observabilidade" subtitulo="Erros do sistema registrados, para diagnóstico" />
      {eventos.length === 0 ? (
        <EmptyState titulo="Nenhum erro registrado" descricao="Erros server-side aparecem aqui quando ocorrem." />
      ) : (
        <TabelaErros eventos={eventos} />
      )}
    </Container>
  );
}
```

- [ ] **Step 3: Card no hub de Configurações**

Em `src/app/(app)/configuracoes/page.tsx`, no array `ITENS`, adicionar (perto do item de Segurança/Usuários):

```tsx
  {
    href: "/configuracoes/observabilidade",
    label: "Observabilidade",
    desc: "Erros do sistema registrados, para diagnóstico. Só admin.",
  },
```

- [ ] **Step 4: Verificar (typecheck + lint + testes de UI + build)**

Run: `npm run typecheck && npx eslint src/components/observabilidade/TabelaErros.tsx "src/app/(app)/configuracoes/observabilidade/page.tsx" "src/app/(app)/configuracoes/page.tsx" && npx vitest run src/tests/observabilidade src/tests/ui && npm run build`
Expected: sem erros; `rotas-alcancaveis` verde (rota sob `/configuracoes/`). `/configuracoes/observabilidade` no output do build.

- [ ] **Step 5: Commit**

```bash
git add src/components/observabilidade/TabelaErros.tsx src/tests/observabilidade/tabela-erros-render.test.tsx "src/app/(app)/configuracoes/observabilidade/page.tsx" "src/app/(app)/configuracoes/page.tsx"
git commit -m "feat(observabilidade): painel /configuracoes/observabilidade (erros registrados)"
```

---

### Task 5: Release 6.69.0

**Files:**
- Modify: `package.json`, `package-lock.json`, `CHANGELOG.md`

Produção em 6.68.0. **Tem migration** (`0129`) — aplicar em produção **antes** do deploy.

- [ ] **Step 1: Barra completa**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check && npm run build`
Expected: verde. (Se `format:check` falhar → `npm run format` e recommitar.)

- [ ] **Step 2: Bump (incluir lockfile)**

Run: `npm version minor --no-git-tag-version`
Expected: `6.69.0`. Incluir `package-lock.json` no commit.

- [ ] **Step 3: CHANGELOG (topo, acima de 6.68.0)**

```markdown
## [6.69.0] — 2026-07-22

### Adicionado

- **Registro de erros do sistema (observabilidade).** Erros server-side não tratados passam a ser
  gravados e ficam visíveis em **Configurações → Observabilidade** (só admin), com rota, mensagem,
  digest e stack — para diagnóstico sem depender do log do container. (Migration `0129`; captura via
  `instrumentation`/`onRequestError`, best-effort.)
```

- [ ] **Step 4: Teste de versão + suíte**

Run: `npx vitest run src/tests/versao.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Commit da release**

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): 6.69.0 — observabilidade (registro de erros + painel)"
```

- [ ] **Step 6: Finalizar (PR) — com a ordem migração→deploy**

`git push origin develop` → `gh pr create --base main --head develop` → aguardar as **duas** execuções do `verify` → **não** mergear sem autorização. Após merge (autorizado):
1. **Aplicar a migration em produção ANTES do deploy:** `node --env-file=.env.producao.bak scripts/db-migrate.mjs` (confirmar `0129`).
2. Implantar no EasyPanel → `/api/health` = `6.69.0`.
3. `npm run release:tag` (do `main`, árvore limpa) + push da tag → sincronizar `develop` com `main`.

---

## Self-Review

**1. Cobertura do spec (Fatia A):**
- Migration `evento_erro` (leitura admin, escrita service_role) → Task 1. ✅
- Helper puro `montarEventoErro` (normaliza, corta, defensivo) → Task 2. ✅
- `instrumentation.ts` `onRequestError` (best-effort, pula edge) → Task 3. ✅
- Painel `/configuracoes/observabilidade` (admin, tabela + EmptyState) + card no hub → Task 4. ✅
- Testes: helper + render da tabela → Tasks 2 e 4. ✅

**2. Placeholders:** nenhum.

**3. Consistência de tipos:** `montarEventoErro(err, request, context)` (Task 2) chamado igual no `instrumentation.ts` (Task 3). `EventoErroView` (Task 4) definido em `TabelaErros.tsx` e consumido pela página com o mesmo shape. Colunas do `select` batem com o `EventoErroView` (id, criado_em→criadoEm, mensagem, rota, metodo, digest, stack).

**4. Ordem migração×deploy:** a tabela precisa existir antes do 6.69.0 subir (o painel lê `evento_erro` e o `onRequestError` insere) — release aplica a migration em produção antes de Implantar. ✅

**Nota de execução:** smoke pós-deploy — forçar um erro server-side (ex.: rota inexistente que estoure, ou um erro proposital em ambiente controlado) e confirmar a linha em Configurações → Observabilidade. Retenção da tabela fica para depois (fora de escopo).
