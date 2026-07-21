# RF-080 Fatia A — Fundação de API keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Autenticação de máquina por API key (hash + escopos), UI admin de gestão e uma rota `/api/v1/ping` autenticada — a fundação sobre a qual as fatias B–E constroem.

**Architecture:** Tabela `api_key` com `key_hash` (sha256). Helper `autenticarApiKey` roda com service_role (sem sessão) e checa escopo. `/api/v1` sai do matcher do proxy. UI admin cria (mostra a chave uma vez), lista e revoga.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (service_role), `node:crypto`, Tailwind 4, Vitest.

## Global Constraints

- Alias `@/*` → `./src/*`. Esta é a **Fatia A** de 5 (spec em `docs/superpowers/specs/2026-07-21-api-publica-webhooks-design.md`).
- **API key nunca em claro no banco:** guarda-se `sha256(chave)`; a chave aparece **uma única vez** na criação.
- Rotas `/api/v1` rodam com `createAdminSupabase()` (sem sessão); o controle de acesso é o **escopo** da chave.
- **Migration** `0126_api_keys.sql` idempotente, aplicada pelo runner antes do deploy (sem DB local).
- Gate da UI/gestão = admin. Guard `divida-ui` (input à mão usa `controleCls`; sem `←`; sem `amber-\d`).
- Rodar `npm run lint/typecheck/test/format` antes de commitar; `git add -A` **depois** do `format`.

---

### Task 1: Migration `0126_api_keys.sql`

**Files:**
- Create: `supabase/migrations/0126_api_keys.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- RF-080 (Fatia A): API keys para a API pública.
create table if not exists api_key (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  key_hash text not null unique, -- sha256 hex da chave (nunca em claro)
  prefixo text not null,         -- primeiros ~10 chars, para exibição
  escopos text[] not null default '{}',
  criado_por uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  ultimo_uso timestamptz,
  revogada_em timestamptz
);
create index if not exists ix_api_key_hash on api_key(key_hash) where revogada_em is null;

alter table api_key enable row level security;
drop policy if exists api_key_admin on api_key;
create policy api_key_admin on api_key for all
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
```

- [ ] **Step 2: Sanidade**

Run: `ls supabase/migrations/ | tail -2`
Expected: `0125_monitoramento_receita.sql` como última antes desta.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(rf080): migration 0126 (api_key)"
```

---

### Task 2: Libs puras `chave.ts` + `escopos.ts` + testes

**Files:**
- Create: `src/lib/api/escopos.ts`
- Create: `src/lib/api/chave.ts`
- Test: `src/tests/api/chave.test.ts`

**Interfaces:**
- Produces: `ESCOPOS_API` (readonly array); `type EscopoApi`; `gerarChave(): { chave; hash; prefixo }`; `hashChave(chave): string`; `temEscopo(escopos, necessario?): boolean`.

- [ ] **Step 1: Escrever os escopos**

```ts
// src/lib/api/escopos.ts
export const ESCOPOS_API = [
  "clientes:read",
  "clientes:write",
  "titulos:read",
  "titulos:write",
  "obrigacoes:read",
  "obrigacoes:write",
  "documentos:read",
  "documentos:write",
] as const;
export type EscopoApi = (typeof ESCOPOS_API)[number];
```

- [ ] **Step 2: Escrever os testes que falham**

```ts
// src/tests/api/chave.test.ts
import { describe, it, expect } from "vitest";
import { gerarChave, hashChave, temEscopo } from "@/lib/api/chave";

describe("gerarChave", () => {
  it("gera chave sk_, prefixo de 10 chars e hash consistente", () => {
    const { chave, hash, prefixo } = gerarChave();
    expect(chave.startsWith("sk_")).toBe(true);
    expect(prefixo).toBe(chave.slice(0, 10));
    expect(hash).toBe(hashChave(chave));
    expect(hash).toHaveLength(64); // sha256 hex
  });
  it("gera chaves distintas a cada chamada", () => {
    expect(gerarChave().chave).not.toBe(gerarChave().chave);
  });
});

describe("hashChave", () => {
  it("é determinístico", () => {
    expect(hashChave("sk_abc")).toBe(hashChave("sk_abc"));
    expect(hashChave("sk_abc")).not.toBe(hashChave("sk_abd"));
  });
});

describe("temEscopo", () => {
  it("true quando o escopo está presente", () => {
    expect(temEscopo(["clientes:read"], "clientes:read")).toBe(true);
  });
  it("false quando ausente", () => {
    expect(temEscopo(["clientes:read"], "clientes:write")).toBe(false);
  });
  it("sem escopo necessário (ping) sempre passa", () => {
    expect(temEscopo([], undefined)).toBe(true);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/tests/api/chave.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 4: Implementar a lib**

```ts
// src/lib/api/chave.ts
import { randomBytes, createHash } from "node:crypto";

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function hashChave(chave: string): string {
  return createHash("sha256").update(chave).digest("hex");
}

// Chave sk_<32 chars base62>. A entropia (~190 bits) e o hash sha256 seguem o padrão da casa
// para segredos comparáveis (nunca revelados após a criação).
export function gerarChave(): { chave: string; hash: string; prefixo: string } {
  const bytes = randomBytes(32);
  let s = "";
  for (const b of bytes) s += ALFABETO[b % ALFABETO.length];
  const chave = `sk_${s}`;
  return { chave, hash: hashChave(chave), prefixo: chave.slice(0, 10) };
}

// Sem `necessario` (ex.: /ping) qualquer chave válida passa.
export function temEscopo(escopos: string[], necessario?: string): boolean {
  if (!necessario) return true;
  return escopos.includes(necessario);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/tests/api/chave.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): libs puras de API key (gerar/hash/escopo) + testes"
```

---

### Task 3: Helper de autenticação `autenticarApiKey`

**Files:**
- Create: `src/lib/api/auth.ts`

**Interfaces:**
- Consumes: `hashChave`, `temEscopo` (Task 2); `createAdminSupabase`.
- Produces: `type AutenticacaoApi = { id: string; escopos: string[] }`; `autenticarApiKey(req: Request, escopo?: string): Promise<{ auth?: AutenticacaoApi; status?: number; erro?: string }>`.

- [ ] **Step 1: Escrever o helper**

```ts
// src/lib/api/auth.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { hashChave, temEscopo } from "./chave";

export type AutenticacaoApi = { id: string; escopos: string[] };

// Autentica uma requisição da API pública por API key (Bearer). Roda com service_role: a API
// não tem sessão; o controle de acesso é o escopo. Retorna { auth } ou { status, erro }.
export async function autenticarApiKey(
  req: Request,
  escopo?: string,
): Promise<{ auth?: AutenticacaoApi; status?: number; erro?: string }> {
  const header = req.headers.get("authorization") ?? "";
  const chave = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!chave) return { status: 401, erro: "API key ausente (use Authorization: Bearer)." };

  const admin = createAdminSupabase();
  const { data } = await admin
    .from("api_key")
    .select("id, escopos, ultimo_uso")
    .eq("key_hash", hashChave(chave))
    .is("revogada_em", null)
    .maybeSingle();
  if (!data) return { status: 401, erro: "API key inválida ou revogada." };

  const escopos = (data.escopos as string[] | null) ?? [];
  if (!temEscopo(escopos, escopo)) return { status: 403, erro: `Escopo necessário: ${escopo}.` };

  // ultimo_uso best-effort, no máx 1x/min (evita um write por request).
  const ultimo = data.ultimo_uso ? Date.parse(data.ultimo_uso as string) : 0;
  if (Date.now() - ultimo > 60000) {
    await admin.from("api_key").update({ ultimo_uso: new Date().toISOString() }).eq("id", data.id);
  }
  return { auth: { id: data.id as string, escopos } };
}
```

- [ ] **Step 2: Verificar tipos e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): helper autenticarApiKey (service_role + escopo)"
```

---

### Task 4: Rota `GET /api/v1/ping` + excluir `/api/v1` do proxy

**Files:**
- Create: `src/app/api/v1/ping/route.ts`
- Modify: `src/proxy.ts` (matcher)

- [ ] **Step 1: Rota de ping**

```ts
// src/app/api/v1/ping/route.ts
import { NextResponse } from "next/server";
import { autenticarApiKey } from "@/lib/api/auth";

export async function GET(req: Request) {
  const r = await autenticarApiKey(req);
  if (!r.auth) {
    return NextResponse.json({ erro: { codigo: "nao_autorizado", mensagem: r.erro } }, { status: r.status });
  }
  return NextResponse.json({ ok: true, escopos: r.auth.escopos });
}
```

- [ ] **Step 2: Excluir `/api/v1` do matcher do proxy**

Em `src/proxy.ts`, no `matcher`, adicionar `api/v1` à lista negativa (o `proxy` renova sessão por
cookie; a API pública não tem cookie):

```ts
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|api/v1|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml)$).*)",
  ],
```

- [ ] **Step 3: Verificar tipos, lint e build**

Run: `npm run typecheck && npm run lint && npm run build 2>&1 | grep -iE "api/v1/ping|error"`
Expected: sem erros; a rota `/api/v1/ping` aparece no build.

- [ ] **Step 4: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): rota /api/v1/ping + exclui /api/v1 do proxy"
```

---

### Task 5: Gestão de chaves — actions + UI `/configuracoes/api`

**Files:**
- Create: `src/app/(app)/configuracoes/api/actions.ts`
- Create: `src/app/(app)/configuracoes/api/page.tsx`
- Create: `src/app/(app)/configuracoes/api/GestaoChaves.tsx`
- Modify: `src/app/(app)/configuracoes/page.tsx` (item no hub)

**Interfaces:**
- Consumes: `gerarChave`, `ESCOPOS_API` (Task 2).
- Produces: `criarApiKey(nome, escopos)`, `listarApiKeys()`, `revogarApiKey(id)`.

- [ ] **Step 1: Actions**

```ts
// src/app/(app)/configuracoes/api/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { gerarChave } from "@/lib/api/chave";
import { ESCOPOS_API } from "@/lib/api/escopos";

export type ApiKeyView = {
  id: string;
  nome: string;
  prefixo: string;
  escopos: string[];
  ultimoUso: string | null;
  revogadaEm: string | null;
};

async function admOk(): Promise<boolean> {
  const perfil = await getPerfilAtual();
  return !!perfil?.ativo && perfil.papel === "admin";
}

export async function listarApiKeys(): Promise<ApiKeyView[]> {
  if (!(await admOk())) return [];
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("api_key")
    .select("id, nome, prefixo, escopos, ultimo_uso, revogada_em")
    .order("criado_em", { ascending: false });
  return (data ?? []).map((k) => ({
    id: k.id as string,
    nome: k.nome as string,
    prefixo: k.prefixo as string,
    escopos: (k.escopos as string[] | null) ?? [],
    ultimoUso: (k.ultimo_uso as string | null) ?? null,
    revogadaEm: (k.revogada_em as string | null) ?? null,
  }));
}

export async function criarApiKey(nome: string, escopos: string[]): Promise<{ chave?: string; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || perfil.papel !== "admin") return { erro: "Sem permissão." };
  const nomeLimpo = nome.trim().slice(0, 80);
  if (!nomeLimpo) return { erro: "Dê um nome à chave." };
  const validos = escopos.filter((e) => (ESCOPOS_API as readonly string[]).includes(e));
  if (validos.length === 0) return { erro: "Selecione ao menos um escopo." };
  const { chave, hash, prefixo } = gerarChave();
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("api_key")
    .insert({ nome: nomeLimpo, key_hash: hash, prefixo, escopos: validos, criado_por: perfil.id });
  if (error) return { erro: "Falha ao criar a chave." };
  revalidatePath("/configuracoes/api");
  return { chave }; // devolvida UMA vez
}

export async function revogarApiKey(id: string): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || perfil.papel !== "admin") return { erro: "Sem permissão." };
  const admin = createAdminSupabase();
  const { error } = await admin.from("api_key").update({ revogada_em: new Date().toISOString() }).eq("id", id);
  if (error) return { erro: "Falha ao revogar." };
  revalidatePath("/configuracoes/api");
  return { ok: true };
}
```

- [ ] **Step 2: Componente de gestão (client)**

```tsx
// src/app/(app)/configuracoes/api/GestaoChaves.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { controleCls } from "@/components/ui/Campo";
import { Botao } from "@/components/ui/Botao";
import { formatarData } from "@/lib/format";
import { ESCOPOS_API } from "@/lib/api/escopos";
import { criarApiKey, revogarApiKey, type ApiKeyView } from "./actions";

export function GestaoChaves({ chaves }: { chaves: ApiKeyView[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [nome, setNome] = useState("");
  const [escopos, setEscopos] = useState<string[]>([]);
  const [criada, setCriada] = useState<string | null>(null);

  function toggle(e: string) {
    setEscopos((s) => (s.includes(e) ? s.filter((x) => x !== e) : [...s, e]));
  }

  async function criar(ev: React.FormEvent) {
    ev.preventDefault();
    setOcupado(true);
    const r = await criarApiKey(nome, escopos);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    setCriada(r.chave ?? null);
    setNome("");
    setEscopos([]);
    router.refresh();
  }

  async function revogar(id: string) {
    if (!confirm("Revogar esta chave? Integrações que a usam param de funcionar.")) return;
    const r = await revogarApiKey(id);
    if (r.erro) return alert(r.erro);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {criada && (
        <div className="rounded-2xl border border-verde/40 bg-creme p-4 text-sm">
          <p className="font-medium text-texto">Chave criada — copie agora, ela não será mostrada de novo:</p>
          <code className="mt-2 block break-all rounded-lg bg-white p-2 text-texto">{criada}</code>
          <button type="button" onClick={() => setCriada(null)} className="mt-2 text-xs text-cinza underline">
            Já copiei, ocultar
          </button>
        </div>
      )}

      <form onSubmit={criar} className="space-y-3 rounded-2xl border border-linha bg-white p-4">
        <h2 className="font-display text-sm font-semibold text-texto">Nova chave</h2>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome (ex.: Integração ERP)"
          className={`${controleCls("compacto")} block w-full`}
        />
        <div className="flex flex-wrap gap-2">
          {ESCOPOS_API.map((e) => (
            <label key={e} className="flex items-center gap-1.5 text-xs text-texto">
              <input type="checkbox" checked={escopos.includes(e)} onChange={() => toggle(e)} className="size-4" />
              {e}
            </label>
          ))}
        </div>
        <Botao type="submit" disabled={ocupado}>
          Criar chave
        </Botao>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-xs text-cinza">
              <th className="px-3 py-2 text-left font-medium">Nome</th>
              <th className="px-3 py-2 text-left font-medium">Prefixo</th>
              <th className="px-3 py-2 text-left font-medium">Escopos</th>
              <th className="px-3 py-2 text-right font-medium">Último uso</th>
              <th className="px-3 py-2 text-right font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {chaves.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-cinza">
                  Nenhuma chave.
                </td>
              </tr>
            ) : (
              chaves.map((k) => (
                <tr key={k.id} className="border-b border-linha/60">
                  <td className="px-3 py-2 text-texto">{k.nome}</td>
                  <td className="px-3 py-2 font-mono text-cinza">{k.prefixo}…</td>
                  <td className="px-3 py-2 text-xs text-cinza">{k.escopos.join(", ")}</td>
                  <td className="px-3 py-2 text-right text-cinza">
                    {k.ultimoUso ? formatarData(k.ultimoUso) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {k.revogadaEm ? (
                      <span className="text-xs text-cinza">revogada</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => revogar(k.id)}
                        className="rounded-lg border border-linha bg-white px-3 py-1.5 text-sm text-negativo hover:bg-creme"
                      >
                        Revogar
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Página (gate admin)**

```tsx
// src/app/(app)/configuracoes/api/page.tsx
import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { GestaoChaves } from "./GestaoChaves";
import { listarApiKeys } from "./actions";

export const metadata = { title: "API pública" };

export default async function ApiConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const chaves = await listarApiKeys();
  return (
    <Container largura="larga" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="API pública" subtitulo="Chaves de acesso para integrações externas (/api/v1)" />
      <GestaoChaves chaves={chaves} />
    </Container>
  );
}
```

- [ ] **Step 4: Item no hub**

Em `src/app/(app)/configuracoes/page.tsx`, adicionar ao array `ITENS`:

```ts
  {
    href: "/configuracoes/api",
    label: "API pública",
    desc: "Chaves de acesso e escopos para integrações externas via /api/v1.",
  },
```

- [ ] **Step 5: Verificar tipos, lint, suite e build**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: sem erros; todos os testes passam (incl. `api/chave.test.ts`); build conclui.

- [ ] **Step 6: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf080): UI admin de gestão de API keys (criar/listar/revogar)"
```

> **Release da Fatia A:** bump minor + CHANGELOG, PR, `verify` verde, aplicar `0126` em produção **antes** do deploy, Implantar, confirmar `/api/health`, tag, sync develop. Teste de fumaça: criar uma chave e `curl -H "Authorization: Bearer <chave>" https://app.seusaldo.ai/api/v1/ping`.

---

## Self-Review

- **Cobertura (Fatia A da spec):** tabela `api_key` (Task 1); libs de chave/escopo + testes (Task 2); `autenticarApiKey` service_role + escopo (Task 3); `/api/v1/ping` + exclusão do proxy (Task 4); UI admin criar/listar/revogar com "mostra a chave uma vez" (Task 5).
- **Placeholders:** nenhum — todo passo traz código/comando completo.
- **Consistência de tipos:** `gerarChave`/`hashChave`/`temEscopo` (Task 2) consumidos por `autenticarApiKey` (Task 3) e pelas actions (Task 5); `ESCOPOS_API` (Task 2) usado nas actions e no componente; `ApiKeyView` definido e consumido dentro da Task 5.
- **Segurança:** chave só em claro na resposta de criação; banco guarda `sha256`; auth em service_role checando `revogada_em` e escopo; `ultimo_uso` com throttle.
- **Escopo respeitado:** só a fundação — leitura/escrita/webhooks/docs são as fatias B–E.
