# Read Receipts (✓/✓✓/✓✓ verde) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar em cada mensagem enviada o estado de entrega/leitura (✓ enviado · ✓✓ entregue · ✓✓ verde lido · ! erro), usando os eventos de status do Z-API.

**Architecture:** Captura o `messageId` no envio (coluna `z_message_id`), o webhook passa a tratar eventos de status atualizando o `status` da mensagem OUT por `z_message_id` (só avança), e a UI renderiza o check conforme o status. Spec: `docs/superpowers/specs/2026-07-06-read-receipts-design.md`.

**Tech Stack:** Next.js 16 (route handler + Server Actions), TypeScript, Supabase (Postgres enum/RLS), Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Todos devem passar.
- Migration: arquivo novo em `supabase/migrations/`, aplicado por `npm run db:migrate` (NUNCA `supabase db push`). Idempotente. Atinge produção.
- Gotcha Postgres: **não** usar um valor de enum novo na MESMA migration que o adiciona. Aqui a migration só faz `add value`; o uso é em runtime (app/UPDATE) — seguro.
- Ciclo do `status` OUT: `ENVIADO`→`ENTREGUE`→`LIDO` (+`ERRO`). `RECEBIDO` é só de IN.
- Tokens SALDO na UI: `verde`, `cinza-claro`, `negativo`.
- Branch: `git checkout -b feat/read-receipts develop`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `supabase/migrations/0042_status_entrega.sql` — **novo**: adiciona `ENTREGUE`/`LIDO` ao enum `whatsapp_status`.
- `src/lib/whatsapp/inbox.ts` — **modificar**: `MsgConversa` (+`status`), helpers `extrairStatusZapi`, `marcaEntrega` (+ tipos `StatusEntrega`, `MarcaEntrega`).
- `src/tests/whatsapp/inbox.test.ts` — **modificar**: testes dos dois helpers.
- `src/app/api/webhooks/zapi/[secret]/route.ts` — **modificar**: tratar eventos de status.
- `src/app/(app)/atendimento/actions.ts` — **modificar**: `responder` captura `messageId`; `mapMsgs` mapeia `status`; selects de `listarConversas`/`abrirConversa` incluem `status`.
- `src/app/(app)/atendimento/Inbox.tsx` — **modificar**: renderizar o check no balão OUT.

---

## Task 1: Migration — valores de enum `ENTREGUE`/`LIDO`

**Files:**
- Create: `supabase/migrations/0042_status_entrega.sql`

**Interfaces:**
- Produces: enum `whatsapp_status` com os valores `ENTREGUE` e `LIDO`.

- [ ] **Step 1: Criar a migration**

Criar `supabase/migrations/0042_status_entrega.sql`:

```sql
-- Read receipts: estados de entrega/leitura da mensagem OUT.
-- Só ADD VALUE (uso ocorre em runtime, outra transação) — seguro quanto ao gotcha do Postgres.
alter type whatsapp_status add value if not exists 'ENTREGUE';
alter type whatsapp_status add value if not exists 'LIDO';
```

- [ ] **Step 2: Aplicar**

Run: `npm run db:migrate`
Expected: aplica `0042_status_entrega` sem erro.

- [ ] **Step 3: Verificar os valores no enum**

Run:
```bash
node --env-file=.env.local -e "import('./scripts/_db.mjs').then(async({makeClient})=>{const c=makeClient();await c.connect();const r=await c.query(\"select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='whatsapp_status' order by e.enumsortorder\");console.log(r.rows.map(x=>x.enumlabel));await c.end();});"
```
Expected: inclui `ENVIADO`, `ERRO`, `RECEBIDO`, `ENTREGUE`, `LIDO`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0042_status_entrega.sql
git commit -m "feat(atendimento): enum ENTREGUE/LIDO para read receipts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Helpers puros `extrairStatusZapi` + `marcaEntrega` (TDD)

**Files:**
- Modify: `src/lib/whatsapp/inbox.ts`
- Test: `src/tests/whatsapp/inbox.test.ts`

**Interfaces:**
- Produces:
  - `MsgConversa` estendido com `status: string`.
  - `type StatusEntrega = "ENVIADO" | "ENTREGUE" | "LIDO"`.
  - `extrairStatusZapi(payload: unknown): { status: StatusEntrega; ids: string[] } | null`.
  - `type MarcaEntrega = "enviado" | "entregue" | "lido" | "erro"`.
  - `marcaEntrega(status: string, direcao: "IN" | "OUT"): MarcaEntrega | null`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `src/tests/whatsapp/inbox.test.ts` (e incluir os nomes no import do topo: `extrairStatusZapi`, `marcaEntrega`):

```ts
describe("extrairStatusZapi", () => {
  it("SENT → ENVIADO com id via messageId", () => {
    expect(extrairStatusZapi({ status: "SENT", messageId: "M1", phone: "553400" })).toEqual({
      status: "ENVIADO",
      ids: ["M1"],
    });
  });
  it("RECEIVED → ENTREGUE com ids[]", () => {
    expect(extrairStatusZapi({ status: "RECEIVED", ids: ["A", "B"] })).toEqual({
      status: "ENTREGUE",
      ids: ["A", "B"],
    });
  });
  it("READ e PLAYED → LIDO", () => {
    expect(extrairStatusZapi({ status: "READ", ids: ["A"] })?.status).toBe("LIDO");
    expect(extrairStatusZapi({ status: "PLAYED", ids: ["A"] })?.status).toBe("LIDO");
  });
  it("id único via campo id", () => {
    expect(extrairStatusZapi({ status: "READ", id: "Z9" })).toEqual({ status: "LIDO", ids: ["Z9"] });
  });
  it("status desconhecido → null", () => {
    expect(extrairStatusZapi({ status: "TYPING", ids: ["A"] })).toBeNull();
  });
  it("sem status → null", () => {
    expect(extrairStatusZapi({ ids: ["A"] })).toBeNull();
  });
  it("sem ids → null", () => {
    expect(extrairStatusZapi({ status: "READ" })).toBeNull();
  });
});

describe("marcaEntrega", () => {
  it("IN → null", () => {
    expect(marcaEntrega("LIDO", "IN")).toBeNull();
  });
  it("mapeia cada status OUT", () => {
    expect(marcaEntrega("ENVIADO", "OUT")).toBe("enviado");
    expect(marcaEntrega("ENTREGUE", "OUT")).toBe("entregue");
    expect(marcaEntrega("LIDO", "OUT")).toBe("lido");
    expect(marcaEntrega("ERRO", "OUT")).toBe("erro");
  });
  it("status irreconhecível → null", () => {
    expect(marcaEntrega("RECEBIDO", "OUT")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- inbox`
Expected: FAIL (`extrairStatusZapi`/`marcaEntrega` inexistentes).

- [ ] **Step 3: Implementar em `inbox.ts`**

Adicionar `status` ao tipo `MsgConversa`:

```ts
export type MsgConversa = {
  telefone: string;
  texto: string;
  direcao: "IN" | "OUT";
  lida: boolean;
  criado_em: string;
  cliente?: string | null;
  status: string;
};
```

E adicionar os helpers (ex.: logo após `extrairMensagemZapi`):

```ts
export type StatusEntrega = "ENVIADO" | "ENTREGUE" | "LIDO";

// Extrai um evento de status do payload do Z-API. null se não for evento de status reconhecível.
export function extrairStatusZapi(payload: unknown): { status: StatusEntrega; ids: string[] } | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  const bruto = typeof p.status === "string" ? p.status.toUpperCase() : "";
  if (!bruto) return null;
  const mapa: Record<string, StatusEntrega> = {
    SENT: "ENVIADO",
    RECEIVED: "ENTREGUE",
    DELIVERED: "ENTREGUE",
    DELIVERY_ACK: "ENTREGUE",
    READ: "LIDO",
    PLAYED: "LIDO",
    READ_SELF: "LIDO",
  };
  const status = mapa[bruto];
  if (!status) return null;
  const ids: string[] = [];
  if (Array.isArray(p.ids)) for (const x of p.ids) if (typeof x === "string" && x) ids.push(x);
  if (typeof p.messageId === "string" && p.messageId) ids.push(p.messageId);
  if (typeof p.id === "string" && p.id) ids.push(p.id);
  const unicos = [...new Set(ids)];
  return unicos.length ? { status, ids: unicos } : null;
}

export type MarcaEntrega = "enviado" | "entregue" | "lido" | "erro";

// Ícone de entrega para a UI. Só para OUT; null para IN/sem status.
export function marcaEntrega(status: string, direcao: "IN" | "OUT"): MarcaEntrega | null {
  if (direcao !== "OUT") return null;
  switch (status) {
    case "ERRO":
      return "erro";
    case "LIDO":
      return "lido";
    case "ENTREGUE":
      return "entregue";
    case "ENVIADO":
      return "enviado";
    default:
      return null;
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- inbox`
Expected: PASS.

> `status` agora é **obrigatório** em `MsgConversa`. Os literais `MsgConversa[]` já existentes nos
> testes (`describe("agruparConversas"...)` e `describe("agruparConversas favoritos"...)`) não têm
> `status` e vão quebrar o `tsc`. Em cada um desses objetos literais, adicionar `status: "RECEBIDO"`
> (para `direcao:"IN"`) ou `status: "ENVIADO"` (para `direcao:"OUT"`). O `npm test` (Vitest) roda com
> transpile sem checagem estrita, então pode passar mesmo assim; o `tsc` do Step 5 é quem acusa —
> corrija ali se necessário.

- [ ] **Step 5: Lint + typecheck (pega literais de MsgConversa quebrados)**

Run: `npm run lint && npm run typecheck`
Expected: sem erros. Se `tsc` acusar `MsgConversa` sem `status` em algum teste, adicione `status: "ENVIADO"` ao literal e rode de novo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp/inbox.ts src/tests/whatsapp/inbox.test.ts
git commit -m "feat(atendimento): helpers extrairStatusZapi + marcaEntrega (read receipts)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Webhook — tratar eventos de status

**Files:**
- Modify: `src/app/api/webhooks/zapi/[secret]/route.ts`

**Interfaces:**
- Consumes: `extrairStatusZapi` (Task 2); `createAdminSupabase`, `extrairMensagemZapi` (já importados).

- [ ] **Step 1: Importar `extrairStatusZapi`**

Ajustar o import de `@/lib/whatsapp/inbox` no topo do route:

```ts
import { extrairMensagemZapi, extrairStatusZapi } from "@/lib/whatsapp/inbox";
```

- [ ] **Step 2: Tratar status quando não for mensagem recebida**

Substituir a linha:

```ts
  const msg = extrairMensagemZapi(payload);
  if (!msg) return NextResponse.json({ ok: true, ignored: true });
```

por:

```ts
  const msg = extrairMensagemZapi(payload);
  if (!msg) {
    const ev = extrairStatusZapi(payload);
    if (ev) {
      // Só AVANÇA o estado (nunca rebaixa; tolera ordem invertida via lista de anteriores).
      const anteriores = ev.status === "ENTREGUE" ? ["ENVIADO"] : ev.status === "LIDO" ? ["ENVIADO", "ENTREGUE"] : [];
      if (anteriores.length) {
        const admin = createAdminSupabase();
        await admin
          .from("whatsapp_mensagem")
          .update({ status: ev.status })
          .in("z_message_id", ev.ids)
          .eq("direcao", "OUT")
          .in("status", anteriores);
      }
      return NextResponse.json({ ok: true, status: ev.status });
    }
    // Instrumentação temporária: captura payloads de status desconhecidos p/ calibrar o parser.
    const p = (payload ?? {}) as Record<string, unknown>;
    if (p.status) console.log("zapi status payload:", JSON.stringify(payload).slice(0, 400));
    return NextResponse.json({ ok: true, ignored: true });
  }
```

- [ ] **Step 3: Lint + typecheck + build**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: sem erros; a rota `/api/webhooks/zapi/[secret]` compila.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/webhooks/zapi/[secret]/route.ts"
git commit -m "feat(atendimento): webhook processa eventos de status (entregue/lido)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Envio captura `messageId` + `mapMsgs` status + selects + UI

**Files:**
- Modify: `src/app/(app)/atendimento/actions.ts`
- Modify: `src/app/(app)/atendimento/Inbox.tsx`

**Interfaces:**
- Consumes: `marcaEntrega` (Task 2); `MsgConversa.status` (Task 2).

- [ ] **Step 1: `mapMsgs` mapeia `status`**

Em `actions.ts`, na função `mapMsgs`, incluir `status` no tipo do row e no retorno. Substituir o corpo do `.map` para acrescentar `status`:

```ts
function mapMsgs(rows: unknown[]): MsgConversa[] {
  return (rows ?? []).map((row) => {
    const m = row as {
      telefone: string;
      texto: string;
      direcao: "IN" | "OUT";
      lida: boolean;
      criado_em: string;
      status?: string;
      clientes?: { razao_social?: string } | { razao_social?: string }[] | null;
    };
    const cl = Array.isArray(m.clientes) ? m.clientes[0] : m.clientes;
    return {
      telefone: m.telefone,
      texto: m.texto,
      direcao: m.direcao,
      lida: m.lida,
      criado_em: m.criado_em,
      status: m.status ?? "",
      cliente: (cl as { razao_social?: string } | null)?.razao_social ?? null,
    };
  });
}
```

- [ ] **Step 2: Incluir `status` nos dois selects**

Em `actions.ts`, nas duas queries que alimentam `mapMsgs`, adicionar `status` à lista de colunas:

`listarConversas`:
```ts
    .select("telefone, texto, direcao, lida, criado_em, status, clientes(razao_social)")
```
`abrirConversa`:
```ts
    .select("telefone, texto, direcao, lida, criado_em, status, clientes(razao_social)")
```

- [ ] **Step 3: `responder` captura o `messageId` e grava em `z_message_id`**

Em `actions.ts`, no `responder`, substituir o bloco do insert (hoje: resolve cliente + `admin.from(...).insert({...})`) para extrair o id e gravar, com fallback em colisão do índice único:

```ts
  const resp = (r.resposta ?? {}) as { messageId?: string; id?: string; zaapId?: string };
  const zId = r.ok ? resp.messageId ?? resp.id ?? null : null;
  const linha = {
    cliente_id: clienteId ?? null,
    telefone,
    texto: t,
    status: r.ok ? "ENVIADO" : "ERRO",
    direcao: "OUT" as const,
    lida: true,
    resposta: (r.resposta ?? r.erro) as object,
    criado_por: perfil.id,
    z_message_id: zId,
  };
  const { error: insErr } = await admin.from("whatsapp_mensagem").insert(linha);
  if (insErr && String(insErr.message).includes("duplicate")) {
    // colisão improvável de messageId: grava a mensagem sem o id (perde só o rastreio dela)
    await admin.from("whatsapp_mensagem").insert({ ...linha, z_message_id: null });
  }
```

> Manter a resolução de `clienteId` (linhas com `admin.from("clientes").select("id, telefone")` +
> `casados`) exatamente como está, logo acima deste bloco.

- [ ] **Step 4: Renderizar o check no balão OUT**

Em `Inbox.tsx`, importar `marcaEntrega` do módulo de inbox (adicionar ao import existente de `@/lib/whatsapp/inbox`). No balão da thread, dentro do `<span>` do horário do balão OUT, acrescentar o check. Substituir o `<span>` do horário:

```tsx
                      <span className="mt-0.5 block text-right font-mono text-[10px] text-cinza-claro">
                        {horaMsg(m.criado_em)}
                      </span>
```

por:

```tsx
                      <span className="mt-0.5 flex items-center justify-end gap-1 font-mono text-[10px] text-cinza-claro">
                        {horaMsg(m.criado_em)}
                        <Check marca={marcaEntrega(m.status, m.direcao)} />
                      </span>
```

E adicionar o componente `Check` ao final do arquivo (junto do `Linha`):

```tsx
function Check({ marca }: { marca: import("@/lib/whatsapp/inbox").MarcaEntrega | null }) {
  if (!marca) return null;
  if (marca === "erro") return <span className="text-negativo">!</span>;
  const duplo = marca === "entregue" || marca === "lido";
  const cor = marca === "lido" ? "text-verde" : "text-cinza-claro";
  return <span className={cor}>{duplo ? "✓✓" : "✓"}</span>;
}
```

- [ ] **Step 5: Suite completa + lint + typecheck + build**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tudo verde; rota `/atendimento` compila; o smoke `inbox-render` continua passando.

> O smoke não alcança os balões (as mensagens carregam via `abrirConversa` assíncrono, que não roda no
> `renderToStaticMarkup`), então a lógica do check é coberta pelos testes unitários de `marcaEntrega`
> (Task 2). O visual é validado no deploy.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/atendimento/actions.ts" "src/app/(app)/atendimento/Inbox.tsx"
git commit -m "feat(atendimento): captura messageId no envio + check de entrega/leitura na thread

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: CHANGELOG + finalizar branch

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Registrar no CHANGELOG**

Adicionar sob `## [Não lançado]` → `### Adicionado`:

```markdown
- **Atendimento — recibos de entrega/leitura:** cada mensagem enviada mostra `✓` (enviada), `✓✓`
  (entregue) e `✓✓` em verde (lida), via eventos de status do Z-API casados pelo `messageId`.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog dos read receipts do Atendimento

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: Finalizar a branch**

Usar a skill `superpowers:finishing-a-development-branch` para verificar testes e escolher merge/deploy.

> **Passo operacional pós-deploy (usuário):** no Z-API, preencher o webhook **"Ao atualizar status"**
> com a mesma URL do webhook de recebimento
> (`https://app.seusaldo.ai/api/webhooks/zapi/<ZAPI_WEBHOOK_SECRET>`). Sem isso, os checks ficam em `✓`.

---

## Self-Review

- **Cobertura do spec:** enum ENTREGUE/LIDO (T1) ✓; helpers `extrairStatusZapi`+`marcaEntrega`+`MsgConversa.status` (T2) ✓; webhook de status com avanço-sem-rebaixar + instrumentação (T3) ✓; captura de `messageId` no envio com fallback de colisão (T4 passo 3) ✓; `mapMsgs`+selects com `status` (T4 passos 1-2) ✓; UI dos checks (T4 passo 4) ✓; passo operacional do webhook "Ao atualizar status" (T5) ✓; CHANGELOG (T5) ✓.
- **Desvio consciente do spec:** o spec citava um "smoke de mensagem OUT LIDO"; como os balões carregam via `abrirConversa` assíncrono (fora do `renderToStaticMarkup`), a lógica do check fica coberta pelos testes unitários de `marcaEntrega` — o visual é validado no deploy. Registrado no T4 passo 5.
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Consistência de tipos:** `StatusEntrega`/`MarcaEntrega`/`MsgConversa.status` definidos no T2 e usados no T3 (`extrairStatusZapi`) e T4 (`marcaEntrega`, `Check`); nomes de status (`ENVIADO/ENTREGUE/LIDO/ERRO`) idênticos em enum (T1), webhook (T3) e UI (T4).
