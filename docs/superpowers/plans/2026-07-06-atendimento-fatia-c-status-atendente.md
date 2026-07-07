# Atendimento — Fatia C (status + atendente) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar às conversas um estado (aberta/pendente/finalizada) e um atendente responsável, com abas por status, seletores no cabeçalho, auto-assumir ao responder e reabrir ao receber.

**Architecture:** Estende a tabela `conversa` (status + atendente_id); o read model sobrepõe metadados por telefone via `Map<telefone, ConversaMeta>`; actions gerenciam status/atribuição; a UI ganha abas por status e seletores. Spec: `docs/superpowers/specs/2026-07-06-atendimento-fatia-c-status-atendente-design.md`.

**Tech Stack:** Next.js 16 (Server Actions + route handler), TypeScript, Supabase (Postgres/RLS), Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Todos passam.
- Migration nova em `supabase/migrations/`, aplicada por `npm run db:migrate` (NUNCA `supabase db push`). Idempotente. Atinge produção.
- Sem `ALTER TYPE`/enum novo (colunas `text`/uuid).
- Estados: `aberta` (default) | `pendente` | `finalizada`. Atendente = `usuarios` com papel admin/financeiro/contador.
- Tokens SALDO na UI.
- Branch: `git checkout -b feat/atendimento-status develop`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `supabase/migrations/0044_conversa_status.sql` — **novo**: colunas `status`/`atendente_id`.
- `src/lib/whatsapp/inbox.ts` — **modificar**: `StatusConversa`, `ConversaMeta`, `Conversa` (+status/atendente), `agruparConversas(meta)`, `FiltroAba` (novas abas), `filtrarConversas`, `contadores`.
- `src/tests/whatsapp/inbox.test.ts` — **modificar**: factory `conv`, testes de filtro/contadores/agrupar (meta).
- `src/app/(app)/atendimento/actions.ts` — **modificar**: `listarConversas` (meta), `listarAtendentes`, `definirStatus`, `atribuirAtendente`, `assumirConversa` + wire em `responder`/`enviarMidia`.
- `src/app/api/webhooks/zapi/[secret]/route.ts` — **modificar**: reabrir conversa finalizada ao receber.
- `src/app/(app)/atendimento/Inbox.tsx` — **modificar**: abas por status, seletores no cabeçalho, dica na lista.
- `src/tests/atendimento/inbox-render.test.tsx` — **modificar**: literal `Conversa` com novos campos.

---

## Task 1: Migration — `status` + `atendente_id`

**Files:**
- Create: `supabase/migrations/0044_conversa_status.sql`

- [ ] **Step 1: Criar a migration**

```sql
-- Fatia C: estado e responsável da conversa.
alter table conversa add column if not exists status text not null default 'aberta';   -- 'aberta' | 'pendente' | 'finalizada'
alter table conversa add column if not exists atendente_id uuid references usuarios(id);
```

- [ ] **Step 2: Aplicar**

Run: `npm run db:migrate`
Expected: aplica `0044_conversa_status` sem erro.

- [ ] **Step 3: Verificar as colunas**

Run:
```bash
node --env-file=.env.local -e "import('./scripts/_db.mjs').then(async({makeClient})=>{const c=makeClient();await c.connect();const r=await c.query(\"select column_name from information_schema.columns where table_name='conversa' order by column_name\");console.log(r.rows.map(x=>x.column_name));await c.end();});"
```
Expected: inclui `atendente_id`, `criado_em`, `favorita`, `status`, `telefone`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0044_conversa_status.sql
git commit -m "feat(atendimento): status + atendente_id na conversa

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `inbox.ts` — read model + abas por status (TDD)

**Files:**
- Modify: `src/lib/whatsapp/inbox.ts`
- Test: `src/tests/whatsapp/inbox.test.ts`

**Interfaces:**
- Produces:
  - `type StatusConversa = "aberta" | "pendente" | "finalizada"`.
  - `Conversa` com `status: StatusConversa; atendenteId: string | null; atendenteNome: string | null`.
  - `type ConversaMeta = { favorita?: boolean; status?: StatusConversa; atendenteId?: string | null; atendenteNome?: string | null }`.
  - `agruparConversas(msgs, meta?: Map<string, ConversaMeta>): Conversa[]`.
  - `type FiltroAba = "abertas" | "pendentes" | "finalizadas" | "favoritos"`.
  - `filtrarConversas`, `contadores` (por status).

- [ ] **Step 1: Reescrever os testes de filtro/contadores/agrupar-favoritos**

Em `src/tests/whatsapp/inbox.test.ts`:

(a) Atualizar a factory `conv` (topo do arquivo) para os novos defaults:

```ts
const conv = (over: Partial<Conversa>): Conversa => ({
  telefone: "5534999990000",
  cliente: null,
  ultima: "oi",
  ultima_em: "2026-07-06T12:00:00.000Z",
  nao_lidas: 0,
  favorita: false,
  status: "aberta",
  atendenteId: null,
  atendenteNome: null,
  ...over,
});
```

(b) Substituir o bloco `describe("filtrarConversas", ...)` inteiro por:

```ts
describe("filtrarConversas", () => {
  const convs = [
    conv({ telefone: "111", cliente: "Moura Purcell", status: "aberta", favorita: true }),
    conv({ telefone: "222", cliente: null, status: "pendente" }),
    conv({ telefone: "333", cliente: "Jessica", status: "finalizada" }),
    conv({ telefone: "444", cliente: "Aberta2", status: "aberta" }),
  ];
  it("aba abertas", () => {
    expect(filtrarConversas(convs, "abertas", "").map((c) => c.telefone)).toEqual(["111", "444"]);
  });
  it("aba pendentes", () => {
    expect(filtrarConversas(convs, "pendentes", "").map((c) => c.telefone)).toEqual(["222"]);
  });
  it("aba finalizadas", () => {
    expect(filtrarConversas(convs, "finalizadas", "").map((c) => c.telefone)).toEqual(["333"]);
  });
  it("aba favoritos (independe do status)", () => {
    expect(filtrarConversas(convs, "favoritos", "").map((c) => c.telefone)).toEqual(["111"]);
  });
  it("busca aplicada dentro da aba", () => {
    expect(filtrarConversas(convs, "abertas", "moura").map((c) => c.telefone)).toEqual(["111"]);
  });
});
```

(c) Substituir o bloco `describe("contadores", ...)` por:

```ts
describe("contadores", () => {
  it("conta por status + favoritos", () => {
    const convs = [
      conv({ status: "aberta", favorita: true }),
      conv({ status: "aberta" }),
      conv({ status: "pendente" }),
      conv({ status: "finalizada" }),
    ];
    expect(contadores(convs)).toEqual({ abertas: 2, pendentes: 1, finalizadas: 1, favoritos: 1 });
  });
});
```

(d) Substituir o bloco `describe("agruparConversas favoritos", ...)` por:

```ts
describe("agruparConversas meta", () => {
  const msgs: MsgConversa[] = [
    { id: "1", telefone: "111", texto: "a", direcao: "IN", lida: true, criado_em: "2026-07-06T10:00:00Z", status: "RECEBIDO", midiaTipo: null, midiaPath: null, midiaNome: null, midiaMime: null },
  ];
  it("sem meta → defaults (aberta, sem atendente, não favorita)", () => {
    const [c] = agruparConversas(msgs);
    expect(c).toMatchObject({ favorita: false, status: "aberta", atendenteId: null, atendenteNome: null });
  });
  it("com meta → sobrepõe favorita/status/atendente", () => {
    const meta = new Map([["111", { favorita: true, status: "pendente" as const, atendenteId: "u1", atendenteNome: "Pedro" }]]);
    const [c] = agruparConversas(msgs, meta);
    expect(c).toMatchObject({ favorita: true, status: "pendente", atendenteId: "u1", atendenteNome: "Pedro" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- inbox`
Expected: FAIL (defaults/abas/`meta` ainda não existem).

- [ ] **Step 3: Implementar em `inbox.ts`**

Substituir o tipo `Conversa`, o `FiltroAba`, `agruparConversas`, `filtrarConversas` e `contadores`:

```ts
export type StatusConversa = "aberta" | "pendente" | "finalizada";

export type Conversa = {
  telefone: string;
  cliente: string | null;
  ultima: string;
  ultima_em: string;
  nao_lidas: number;
  favorita: boolean;
  status: StatusConversa;
  atendenteId: string | null;
  atendenteNome: string | null;
};

export type ConversaMeta = {
  favorita?: boolean;
  status?: StatusConversa;
  atendenteId?: string | null;
  atendenteNome?: string | null;
};

export type FiltroAba = "abertas" | "pendentes" | "finalizadas" | "favoritos";

// Agrupa mensagens por telefone → conversas, mais recente primeiro. `meta` sobrepõe por telefone.
export function agruparConversas(msgs: MsgConversa[], meta: Map<string, ConversaMeta> = new Map()): Conversa[] {
  const porTel = new Map<string, MsgConversa[]>();
  for (const m of msgs) {
    const arr = porTel.get(m.telefone) ?? [];
    arr.push(m);
    porTel.set(m.telefone, arr);
  }
  const convs: Conversa[] = [];
  for (const [telefone, arr] of porTel) {
    const ordenadas = [...arr].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
    const ultima = ordenadas[ordenadas.length - 1]!;
    const cliente = ordenadas.find((m) => m.cliente)?.cliente ?? null;
    const md = meta.get(telefone);
    convs.push({
      telefone,
      cliente,
      ultima: ultima.texto,
      ultima_em: ultima.criado_em,
      nao_lidas: arr.filter((m) => m.direcao === "IN" && !m.lida).length,
      favorita: md?.favorita ?? false,
      status: md?.status ?? "aberta",
      atendenteId: md?.atendenteId ?? null,
      atendenteNome: md?.atendenteNome ?? null,
    });
  }
  return convs.sort((a, b) => b.ultima_em.localeCompare(a.ultima_em));
}

// Filtra por aba (status/favoritos) + busca (nome do cliente OU telefone), mantendo a ordem.
export function filtrarConversas(convs: Conversa[], aba: FiltroAba, busca: string): Conversa[] {
  const termo = busca.trim().toLowerCase();
  return convs.filter((c) => {
    if (aba === "favoritos") {
      if (!c.favorita) return false;
    } else if (c.status !== aba.slice(0, -1)) {
      // "abertas"→"aberta", "pendentes"→"pendente", "finalizadas"→"finalizada"
      return false;
    }
    if (termo) {
      const alvo = `${(c.cliente ?? "").toLowerCase()} ${c.telefone}`;
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });
}

// Contadores para as abas.
export function contadores(convs: Conversa[]): { abertas: number; pendentes: number; finalizadas: number; favoritos: number } {
  return {
    abertas: convs.filter((c) => c.status === "aberta").length,
    pendentes: convs.filter((c) => c.status === "pendente").length,
    finalizadas: convs.filter((c) => c.status === "finalizada").length,
    favoritos: convs.filter((c) => c.favorita).length,
  };
}
```

> Nota sobre `aba.slice(0, -1)`: `"abertas"→"aberta"`, `"pendentes"→"pendente"`, `"finalizadas"→"finalizada"`. Confere com `StatusConversa`.

- [ ] **Step 4: Rodar e ver passar + lint/typecheck**

Run: `npm test -- inbox && npm run lint && npm run typecheck`
Expected: testes passam. O `tsc` acusará a factory `conv` já atualizada (ok) e possíveis literais `Conversa` fora deste arquivo — nenhum em `inbox.test.ts` além da factory. (Os literais em `actions.ts`/`Inbox.tsx`/smoke são corrigidos nos Tasks 3/4.)

> Neste ponto `npm run typecheck` VAI falhar em `actions.ts` (listarConversas passa `Set`) e no smoke — isso é esperado e corrigido nos Tasks 3 e 4. Para o commit deste task, rodar só `npm test -- inbox` (verde) e seguir; o typecheck global fecha ao final do Task 4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/inbox.ts src/tests/whatsapp/inbox.test.ts
git commit -m "feat(atendimento): read model com status/atendente + abas por status

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Actions + webhook (status/atribuição/auto-assumir/reabrir)

**Files:**
- Modify: `src/app/(app)/atendimento/actions.ts`
- Modify: `src/app/api/webhooks/zapi/[secret]/route.ts`

**Interfaces:**
- Consumes: `agruparConversas(meta)`, `type ConversaMeta`, `type StatusConversa` (Task 2).
- Produces: `listarConversas` (com meta), `listarAtendentes`, `definirStatus`, `atribuirAtendente`.

- [ ] **Step 1: Imports em `actions.ts`**

Ajustar o import de `@/lib/whatsapp/inbox` para incluir os novos tipos:

```ts
import {
  agruparConversas,
  extensaoPorMime,
  type Conversa,
  type MsgConversa,
  type ConversaMeta,
  type StatusConversa,
} from "@/lib/whatsapp/inbox";
```

- [ ] **Step 2: `listarConversas` monta o `meta`**

Substituir o corpo de `listarConversas` por:

```ts
export async function listarConversas(): Promise<Conversa[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("whatsapp_mensagem")
    .select("id, telefone, texto, direcao, lida, criado_em, status, midia_tipo, midia_path, midia_nome, midia_mime, clientes(razao_social)")
    .order("criado_em", { ascending: false })
    .limit(500);
  const admin = createAdminSupabase();
  const { data: convRows } = await admin.from("conversa").select("telefone, favorita, status, atendente_id");
  const { data: usuarios } = await admin.from("usuarios").select("id, nome");
  const nomePorId = new Map((usuarios ?? []).map((u) => [u.id as string, u.nome as string]));
  const meta = new Map<string, ConversaMeta>();
  for (const r of convRows ?? []) {
    const atendenteId = (r.atendente_id as string | null) ?? null;
    meta.set(r.telefone as string, {
      favorita: r.favorita as boolean,
      status: ((r.status as string) ?? "aberta") as StatusConversa,
      atendenteId,
      atendenteNome: atendenteId ? (nomePorId.get(atendenteId) ?? null) : null,
    });
  }
  return agruparConversas(mapMsgs(data ?? []), meta);
}
```

- [ ] **Step 3: Novas actions + `assumirConversa` (ao final do arquivo)**

```ts
export async function listarAtendentes(): Promise<{ id: string; nome: string }[]> {
  if (!(await gate())) return [];
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("usuarios")
    .select("id, nome")
    .in("papel", ["admin", "financeiro", "contador"])
    .eq("ativo", true)
    .order("nome");
  return (data ?? []).map((u) => ({ id: u.id as string, nome: u.nome as string }));
}

export async function definirStatus(telefone: string, status: StatusConversa): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("conversa").upsert({ telefone, status }, { onConflict: "telefone" });
  return error ? { erro: "Falha ao mudar o status." } : { ok: true };
}

export async function atribuirAtendente(telefone: string, atendenteId: string | null): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("conversa").upsert({ telefone, atendente_id: atendenteId }, { onConflict: "telefone" });
  return error ? { erro: "Falha ao atribuir." } : { ok: true };
}

// Auto-assumir + reabrir: quem responde assume se estava sem atendente; finalizada volta a aberta.
async function assumirConversa(admin: ReturnType<typeof createAdminSupabase>, telefone: string, atendenteId: string) {
  const { data: row } = await admin.from("conversa").select("status, atendente_id").eq("telefone", telefone).maybeSingle();
  const novoAtendente = (row?.atendente_id as string | null) ?? atendenteId;
  const statusAtual = (row?.status as string | undefined) ?? "aberta";
  const novoStatus = statusAtual === "finalizada" ? "aberta" : statusAtual;
  await admin.from("conversa").upsert({ telefone, atendente_id: novoAtendente, status: novoStatus }, { onConflict: "telefone" });
}
```

- [ ] **Step 4: Wire `assumirConversa` em `responder` e `enviarMidia`**

Em `responder`, logo antes do `return r.ok ? { ok: true } : ...` final:

```ts
  if (r.ok) await assumirConversa(admin, telefone, perfil.id).catch(() => {});
```

Em `enviarMidia`, também antes do `return r.ok ? ...`:

```ts
  if (r.ok) await assumirConversa(admin, telefone, perfil.id).catch(() => {});
```

- [ ] **Step 5: Webhook reabre conversa finalizada ao receber**

Em `src/app/api/webhooks/zapi/[secret]/route.ts`, adicionar — logo após **cada** insert de mensagem IN (o do bloco `if (msg.midia)` e o de texto), antes do respectivo `return NextResponse.json({ ok: true })`:

```ts
    await admin.from("conversa").update({ status: "aberta" }).eq("telefone", tel).eq("status", "finalizada");
```

- [ ] **Step 6: Verificar tudo**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: sem erros (typecheck global fecha aqui, exceto o smoke — corrigido no Task 4 se ainda acusar). Se o smoke `inbox-render` acusar `Conversa` sem os novos campos, será corrigido no Task 4; rodar `npm run build` que ignora testes.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/atendimento/actions.ts" "src/app/api/webhooks/zapi/[secret]/route.ts"
git commit -m "feat(atendimento): actions de status/atribuição + auto-assumir + reabrir no recebimento

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: UI — abas por status + seletores no cabeçalho

**Files:**
- Modify: `src/app/(app)/atendimento/Inbox.tsx`
- Test: `src/tests/atendimento/inbox-render.test.tsx`

**Interfaces:**
- Consumes: `definirStatus`, `atribuirAtendente`, `listarAtendentes` (Task 3); `type StatusConversa`, `FiltroAba` (Task 2).

- [ ] **Step 1: Corrigir o literal do smoke**

Em `src/tests/atendimento/inbox-render.test.tsx`, no array `convs`, adicionar os campos novos ao objeto:

```ts
const convs: Conversa[] = [
  { telefone: "111", cliente: "Moura Purcell", ultima: "oi", ultima_em: "2026-07-06T10:00:00Z", nao_lidas: 2, favorita: true, status: "aberta", atendenteId: null, atendenteNome: null },
];
```

- [ ] **Step 2: Imports + estado dos atendentes**

No import de `./actions`, adicionar `definirStatus`, `atribuirAtendente`, `listarAtendentes`. No import de `@/lib/whatsapp/inbox`, adicionar `type StatusConversa`. Trocar as ABAS e o estado inicial:

```ts
const ABAS: { id: FiltroAba; label: string }[] = [
  { id: "abertas", label: "Abertas" },
  { id: "pendentes", label: "Pendentes" },
  { id: "finalizadas", label: "Finalizadas" },
  { id: "favoritos", label: "Favoritos" },
];
```

No corpo do componente, trocar `useState<FiltroAba>("todas")` por `useState<FiltroAba>("abertas")` e adicionar:

```tsx
  const [atendentes, setAtendentes] = useState<{ id: string; nome: string }[]>([]);
  useEffect(() => {
    start(async () => setAtendentes(await listarAtendentes()));
  }, []);
```

- [ ] **Step 3: Contador das abas + conversa ativa + handlers**

O contador por aba agora casa pela chave (`cont[a.id]`). Substituir, dentro do `.map(ABAS)`, a linha do `n`:

```tsx
            const n = cont[a.id];
```

Adicionar, perto dos outros derivados (após `const visiveis = ...`):

```tsx
  const convAtiva = conversas.find((c) => c.telefone === ativa) ?? null;
```

E os handlers (perto de `enviar`):

```tsx
  const mudarStatus = (status: StatusConversa) =>
    start(async () => {
      if (!ativa) return;
      setConversas((cs) => cs.map((c) => (c.telefone === ativa ? { ...c, status } : c)));
      await definirStatus(ativa, status);
      setConversas(await listarConversas());
    });

  const mudarAtendente = (valor: string) =>
    start(async () => {
      if (!ativa) return;
      const atendenteId = valor || null;
      setConversas((cs) => cs.map((c) => (c.telefone === ativa ? { ...c, atendenteId } : c)));
      await atribuirAtendente(ativa, atendenteId);
      setConversas(await listarConversas());
    });
```

- [ ] **Step 4: Seletores no cabeçalho da thread**

No cabeçalho da conversa (o `<div className="flex items-center gap-3 border-b border-linha bg-white px-5 py-3">`), adicionar, após o `<div className="min-w-0">…telefone…</div>`, um grupo à direita:

```tsx
              <div className="ml-auto flex items-center gap-2">
                <select
                  value={convAtiva?.status ?? "aberta"}
                  onChange={(e) => mudarStatus(e.target.value as StatusConversa)}
                  className="rounded-lg border border-linha bg-white px-2 py-1 text-xs text-texto focus:border-verde"
                >
                  <option value="aberta">Aberta</option>
                  <option value="pendente">Pendente</option>
                  <option value="finalizada">Finalizada</option>
                </select>
                <select
                  value={convAtiva?.atendenteId ?? ""}
                  onChange={(e) => mudarAtendente(e.target.value)}
                  className="max-w-[10rem] rounded-lg border border-linha bg-white px-2 py-1 text-xs text-texto focus:border-verde"
                >
                  <option value="">Não atribuído</option>
                  {atendentes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                    </option>
                  ))}
                </select>
              </div>
```

- [ ] **Step 5: Dica de status/atendente no item da lista**

No item da conversa, na linha do nome (`<div className="flex items-baseline justify-between gap-2">`), depois do `<span>` do nome, adicionar um chip de status quando não for aberta; e mostrar o primeiro nome do atendente na linha da prévia. Substituir a `<div className="flex items-center justify-between gap-2">` da prévia por:

```tsx
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-cinza-claro">
                    {c.status !== "aberta" && (
                      <span className="mr-1 rounded bg-linha px-1 py-0.5 text-[10px] text-cinza">
                        {c.status === "pendente" ? "pendente" : "finalizada"}
                      </span>
                    )}
                    {c.atendenteNome ? `${c.atendenteNome.split(" ")[0]} · ` : ""}
                    {c.ultima}
                  </span>
                  {c.nao_lidas > 0 && (
                    <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-verde px-1 text-[11px] font-semibold text-white">
                      {c.nao_lidas}
                    </span>
                  )}
                </div>
```

- [ ] **Step 6: Suite completa**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tudo verde; rota `/atendimento` compila; smoke `inbox-render` passa.

- [ ] **Step 7: Verificação visual (opcional)**

`npm run dev` → `/atendimento`: abas Abertas/Pendentes/Finalizadas/Favoritos; abrir uma conversa mostra os seletores de status e atendente; mudar status move a conversa entre as abas.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/atendimento/Inbox.tsx" src/tests/atendimento/inbox-render.test.tsx
git commit -m "feat(atendimento): abas por status + seletores de status/atendente na thread

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: CHANGELOG + finalizar branch

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG**

Sob `## [Não lançado]` → `### Adicionado`:

```markdown
- **Atendimento — status e atendente (Fatia C):** cada conversa tem estado (aberta/pendente/finalizada)
  e responsável; abas por status; quem responde assume a conversa; receber ou responder reabre uma
  conversa finalizada.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog do Atendimento Fatia C (status + atendente)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: Finalizar a branch**

Usar `superpowers:finishing-a-development-branch`.

---

## Self-Review

- **Cobertura do spec:** migration status/atendente (T1) ✓; read model + abas + `agruparConversas(meta)` + `filtrarConversas`/`contadores` (T2) ✓; `listarConversas` meta + `listarAtendentes` + `definirStatus`/`atribuirAtendente` + `assumirConversa` (auto-assumir/reabrir) + wire responder/enviarMidia (T3) ✓; reabrir no recebimento no webhook (T3 passo 5) ✓; UI abas + seletores + dica na lista (T4) ✓; testes unit (T2) + smoke (T4) ✓; CHANGELOG (T5) ✓.
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Consistência de tipos:** `StatusConversa`/`ConversaMeta`/`Conversa.{status,atendenteId,atendenteNome}`/`FiltroAba` definidos no T2 e usados no T3 (actions) e T4 (UI); colunas SQL `status`/`atendente_id` idênticas em T1, T3 (queries/upserts) e webhook; `contadores` retorna chaves `abertas/pendentes/finalizadas/favoritos` = ids das ABAS (T4 usa `cont[a.id]`).
- **Nota de sequência:** ao fim do T2 o typecheck global fica quebrado de propósito (actions/smoke); fecha no T4. Cada commit intermediário roda os testes unitários relevantes; o `npm run build`/typecheck completos passam a valer do T4 em diante.
