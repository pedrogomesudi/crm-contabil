# Atendimento — nome do cliente + nova conversa por cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar razão social (empresa) + responsável (contato) no lugar do telefone quando a conversa casar com um cliente cadastrado, e permitir iniciar uma nova conversa escolhendo um cliente cadastrado.

**Architecture:** Read model resolve o cliente por telefone na listagem (helper puro `mapaClientesPorTelefone` + overlay no `Map<telefone, ConversaMeta>`); a UI mostra empresa/contato e ganha uma busca de clientes na "nova conversa". Spec: `docs/superpowers/specs/2026-07-07-atendimento-nome-cliente-nova-conversa-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Todos passam.
- Sem migration. Casa telefone→cliente só quando há **exatamente um** cliente com o número (ambíguo → mostra telefone). Usa `normalizarTelefone` (`mensagem.ts`).
- Tokens SALDO na UI. Branch: `git checkout -b feat/atendimento-nome-cliente develop`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `src/lib/whatsapp/inbox.ts` — **modificar**: `Conversa` (+`contato`), `ConversaMeta` (+`cliente`/`contato`), `agruparConversas` (override), `mapaClientesPorTelefone`.
- `src/tests/whatsapp/inbox.test.ts` — **modificar**: factory `conv`, teste `agruparConversas meta`, testes de `mapaClientesPorTelefone`.
- `src/app/(app)/atendimento/actions.ts` — **modificar**: `listarConversas` (semeia cliente/contato) + `listarClientesParaConversa`.
- `src/app/(app)/atendimento/Inbox.tsx` — **modificar**: item da lista (empresa/contato), cabeçalho, nova conversa com busca de clientes.
- `src/tests/atendimento/inbox-render.test.tsx` — **modificar**: literal `Conversa` (+`contato`).

---

## Task 1: `inbox.ts` — read model + `mapaClientesPorTelefone` (TDD)

**Files:**
- Modify: `src/lib/whatsapp/inbox.ts`
- Test: `src/tests/whatsapp/inbox.test.ts`

**Interfaces:**
- Produces:
  - `Conversa` com `contato: string | null`.
  - `ConversaMeta` com `cliente?: string | null` e `contato?: string | null`.
  - `mapaClientesPorTelefone(clientes: { razao_social: string; responsavel_nome: string | null; telefone: string | null }[]): Map<string, { razaoSocial: string; contato: string | null }>`.

- [ ] **Step 1: Atualizar/adicionar testes**

Em `src/tests/whatsapp/inbox.test.ts`:

(a) Adicionar `mapaClientesPorTelefone` ao import do topo.

(b) Na factory `conv`, adicionar `contato: null` aos defaults:

```ts
const conv = (over: Partial<Conversa>): Conversa => ({
  telefone: "5534999990000",
  cliente: null,
  contato: null,
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

(c) Substituir o `describe("agruparConversas meta", ...)` por (acrescenta cliente/contato):

```ts
describe("agruparConversas meta", () => {
  const msgs: MsgConversa[] = [
    { id: "1", telefone: "111", texto: "a", direcao: "IN", lida: true, criado_em: "2026-07-06T10:00:00Z", status: "RECEBIDO", cliente: "DA MENSAGEM", midiaTipo: null, midiaPath: null, midiaNome: null, midiaMime: null },
  ];
  it("sem meta → cliente vem da mensagem; contato null", () => {
    const [c] = agruparConversas(msgs);
    expect(c).toMatchObject({ cliente: "DA MENSAGEM", contato: null, status: "aberta", atendenteId: null });
  });
  it("meta.cliente/contato sobrepõem o da mensagem", () => {
    const meta = new Map([["111", { cliente: "DO CADASTRO", contato: "Breno", status: "pendente" as const }]]);
    const [c] = agruparConversas(msgs, meta);
    expect(c).toMatchObject({ cliente: "DO CADASTRO", contato: "Breno", status: "pendente" });
  });
});

describe("mapaClientesPorTelefone", () => {
  it("mapeia por telefone normalizado com razão social + contato", () => {
    const m = mapaClientesPorTelefone([{ razao_social: "ACME", responsavel_nome: "Ana", telefone: "(34) 99999-0000" }]);
    expect([...m.entries()]).toEqual([["5534999990000", { razaoSocial: "ACME", contato: "Ana" }]]);
  });
  it("ignora telefone vazio", () => {
    expect(mapaClientesPorTelefone([{ razao_social: "X", responsavel_nome: null, telefone: null }]).size).toBe(0);
  });
  it("descarta telefone ambíguo (2 clientes)", () => {
    const m = mapaClientesPorTelefone([
      { razao_social: "A", responsavel_nome: null, telefone: "5534999990000" },
      { razao_social: "B", responsavel_nome: null, telefone: "34 99999-0000" },
    ]);
    expect(m.size).toBe(0);
  });
});
```

> `normalizarTelefone` de um número BR de 11 dígitos com DDD 34 → `5534999990000` (com o 55). Se o teste
> do primeiro caso divergir do formato real de `normalizarTelefone`, ajuste o valor esperado para o que
> a função retorna (rode o teste e use o valor observado) — o importante é o mapeamento e o descarte de
> ambíguos.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/tests/whatsapp/inbox.test.ts`
Expected: FAIL (`mapaClientesPorTelefone` inexistente; `contato` ausente).

- [ ] **Step 3: Implementar em `inbox.ts`**

Adicionar o import no topo:
```ts
import { normalizarTelefone } from "@/lib/whatsapp/mensagem";
```

Estender `Conversa` e `ConversaMeta`:
```ts
export type Conversa = {
  telefone: string;
  cliente: string | null;
  contato: string | null;
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
  cliente?: string | null;
  contato?: string | null;
};
```

No `agruparConversas`, trocar a construção do `convs.push({...})` para usar o override e o contato:
```ts
    const md = meta.get(telefone);
    convs.push({
      telefone,
      cliente: md?.cliente ?? cliente,
      contato: md?.contato ?? null,
      ultima: ultima.texto,
      ultima_em: ultima.criado_em,
      nao_lidas: arr.filter((m) => m.direcao === "IN" && !m.lida).length,
      favorita: md?.favorita ?? false,
      status: md?.status ?? "aberta",
      atendenteId: md?.atendenteId ?? null,
      atendenteNome: md?.atendenteNome ?? null,
    });
```
(`cliente` local continua sendo `ordenadas.find((m) => m.cliente)?.cliente ?? null` — o fallback.)

Adicionar o helper (ex.: após `contadores`):
```ts
// Mapa telefone-normalizado → { razaoSocial, contato }. Só telefones com UM único cliente.
export function mapaClientesPorTelefone(
  clientes: { razao_social: string; responsavel_nome: string | null; telefone: string | null }[],
): Map<string, { razaoSocial: string; contato: string | null }> {
  const contagem = new Map<string, number>();
  const mapa = new Map<string, { razaoSocial: string; contato: string | null }>();
  for (const c of clientes) {
    const tel = normalizarTelefone(c.telefone ?? "");
    if (!tel) continue;
    contagem.set(tel, (contagem.get(tel) ?? 0) + 1);
    mapa.set(tel, { razaoSocial: c.razao_social, contato: c.responsavel_nome ?? null });
  }
  for (const [tel, n] of contagem) if (n > 1) mapa.delete(tel);
  return mapa;
}
```

- [ ] **Step 4: Rodar e ver passar + lint/typecheck**

Run: `npm test -- src/tests/whatsapp/inbox.test.ts && npm run lint && npm run typecheck`
Expected: testes passam. Se `tsc` acusar o literal `Conversa` do smoke sem `contato`, será corrigido no Task 3; para este commit, o `npm test` do inbox (verde) basta.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/inbox.ts src/tests/whatsapp/inbox.test.ts
git commit -m "feat(atendimento): resolve cliente/contato por telefone (read model + helper)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Actions — `listarConversas` (cliente/contato) + `listarClientesParaConversa`

**Files:**
- Modify: `src/app/(app)/atendimento/actions.ts`

**Interfaces:**
- Consumes: `mapaClientesPorTelefone` (Task 1); `normalizarTelefone` (já importado).
- Produces: `listarConversas` com cliente/contato do cadastro; `listarClientesParaConversa`.

- [ ] **Step 1: Import de `mapaClientesPorTelefone`**

No import de `@/lib/whatsapp/inbox` em `actions.ts`, adicionar `mapaClientesPorTelefone`:
```ts
import {
  agruparConversas,
  extensaoPorMime,
  mapaClientesPorTelefone,
  type Conversa,
  type MsgConversa,
  type ConversaMeta,
  type StatusConversa,
} from "@/lib/whatsapp/inbox";
```

- [ ] **Step 2: `listarConversas` semeia cliente/contato**

Substituir o corpo por:
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
  const { data: clientes } = await admin.from("clientes").select("razao_social, responsavel_nome, telefone");
  const mapaCli = mapaClientesPorTelefone(
    (clientes ?? []).map((c) => ({
      razao_social: c.razao_social as string,
      responsavel_nome: (c.responsavel_nome as string | null) ?? null,
      telefone: (c.telefone as string | null) ?? null,
    })),
  );
  const { data: convRows } = await admin.from("conversa").select("telefone, favorita, status, atendente_id");
  const { data: usuarios } = await admin.from("usuarios").select("id, nome");
  const nomePorId = new Map((usuarios ?? []).map((u) => [u.id as string, u.nome as string]));
  const meta = new Map<string, ConversaMeta>();
  for (const [tel, info] of mapaCli) meta.set(tel, { cliente: info.razaoSocial, contato: info.contato });
  for (const r of convRows ?? []) {
    const tel = r.telefone as string;
    const atendenteId = (r.atendente_id as string | null) ?? null;
    const anterior = meta.get(tel) ?? {};
    meta.set(tel, {
      ...anterior,
      favorita: r.favorita as boolean,
      status: ((r.status as string) ?? "aberta") as StatusConversa,
      atendenteId,
      atendenteNome: atendenteId ? (nomePorId.get(atendenteId) ?? null) : null,
    });
  }
  return agruparConversas(mapMsgs(data ?? []), meta);
}
```

- [ ] **Step 3: `listarClientesParaConversa` (ao final do arquivo)**

```ts
export async function listarClientesParaConversa(): Promise<{ razaoSocial: string; contato: string | null; telefone: string }[]> {
  if (!(await gate())) return [];
  const admin = createAdminSupabase();
  const { data } = await admin.from("clientes").select("razao_social, responsavel_nome, telefone").order("razao_social");
  const out: { razaoSocial: string; contato: string | null; telefone: string }[] = [];
  for (const c of data ?? []) {
    const tel = normalizarTelefone((c.telefone as string | null) ?? "");
    if (tel) out.push({ razaoSocial: c.razao_social as string, contato: (c.responsavel_nome as string | null) ?? null, telefone: tel });
  }
  return out;
}
```

- [ ] **Step 4: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: sem erros (o smoke pode acusar `Conversa` no `tsc` — corrigido no Task 3; `build` compila).

```bash
git add "src/app/(app)/atendimento/actions.ts"
git commit -m "feat(atendimento): listarConversas resolve cliente/contato + listarClientesParaConversa

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: UI — nome empresa/contato + nova conversa por cliente

**Files:**
- Modify: `src/app/(app)/atendimento/Inbox.tsx`
- Test: `src/tests/atendimento/inbox-render.test.tsx`

**Interfaces:**
- Consumes: `listarClientesParaConversa` (Task 2); `Conversa.contato`/`.cliente` (Task 1).

- [ ] **Step 1: Corrigir o literal do smoke**

Em `src/tests/atendimento/inbox-render.test.tsx`, adicionar `contato: null` ao objeto de `convs`:
```ts
const convs: Conversa[] = [
  { telefone: "111", cliente: "Moura Purcell", contato: "Breno", ultima: "oi", ultima_em: "2026-07-06T10:00:00Z", nao_lidas: 2, favorita: true, status: "aberta", atendenteId: null, atendenteNome: null },
];
```

- [ ] **Step 2: Import + estado dos clientes**

No import de `./actions`, adicionar `listarClientesParaConversa`. Dentro do componente, adicionar:
```ts
  const [clientesConv, setClientesConv] = useState<{ razaoSocial: string; contato: string | null; telefone: string }[]>([]);
  const [buscaCliente, setBuscaCliente] = useState("");
  useEffect(() => {
    start(async () => setClientesConv(await listarClientesParaConversa()));
  }, []);
```

E o filtro (perto de `convAtiva`):
```ts
  const clientesFiltrados = buscaCliente.trim()
    ? clientesConv
        .filter((c) => `${c.razaoSocial.toLowerCase()} ${c.telefone}`.includes(buscaCliente.trim().toLowerCase()))
        .slice(0, 8)
    : [];
```

- [ ] **Step 3: Busca de cliente no painel de nova conversa**

No bloco `{nova && (...)}`, ANTES do `<input value={novoTel} ...>`, inserir a busca:
```tsx
            <input
              value={buscaCliente}
              onChange={(e) => setBuscaCliente(e.target.value)}
              placeholder="Buscar cliente cadastrado…"
              className="w-full rounded-lg border border-linha bg-white px-3 py-2 focus:border-verde"
            />
            {clientesFiltrados.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-linha bg-white">
                {clientesFiltrados.map((cl) => (
                  <button
                    key={cl.telefone + cl.razaoSocial}
                    type="button"
                    onClick={() => {
                      setNovoTel(cl.telefone);
                      setBuscaCliente("");
                    }}
                    className="block w-full px-3 py-2 text-left hover:bg-creme"
                  >
                    <span className="font-medium text-texto">{cl.razaoSocial}</span>{" "}
                    <span className="font-mono text-[11px] text-cinza-claro">{cl.telefone}</span>
                  </button>
                ))}
              </div>
            )}
```

E, ao cancelar a nova conversa, limpar a busca: no `onClick` do botão "Cancelar" do painel nova, trocar
`onClick={() => setNova(false)}` por `onClick={() => { setNova(false); setBuscaCliente(""); }}`.

- [ ] **Step 4: Linha do contato no item da lista**

No item da conversa, entre a `<div>` do nome (linha com `{c.cliente ?? c.telefone}` + horário) e a
`<div>` da prévia, inserir:
```tsx
                {c.contato && <p className="truncate text-xs text-cinza-claro">{c.contato}</p>}
```

- [ ] **Step 5: Cabeçalho usa a conversa ativa**

No cabeçalho da thread, trocar o bloco do nome/telefone. Substituir:
```tsx
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-verde/10 text-xs font-semibold text-verde">
                {iniciais(contato?.razaoSocial ?? ativa)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-texto">{contato?.razaoSocial ?? ativa}</p>
                <p className="font-mono text-[11px] text-cinza-claro">{ativa}</p>
              </div>
```
por:
```tsx
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-verde/10 text-xs font-semibold text-verde">
                {iniciais(convAtiva?.cliente ?? ativa)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-texto">{convAtiva?.cliente ?? ativa}</p>
                {convAtiva?.contato && <p className="truncate text-xs text-cinza-claro">{convAtiva.contato}</p>}
                <p className="font-mono text-[11px] text-cinza-claro">{ativa}</p>
              </div>
```
(O painel do contato à direita continua usando o estado `contato` — sem mudança.)

- [ ] **Step 6: Suite completa**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tudo verde; smoke passa; rota `/atendimento` compila.

- [ ] **Step 7: Verificação visual (opcional)**

`npm run dev` → `/atendimento`: conversas de clientes cadastrados mostram razão social + contato; o lápis
abre a nova conversa com busca de clientes (clicar preenche o número).

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/atendimento/Inbox.tsx" src/tests/atendimento/inbox-render.test.tsx
git commit -m "feat(atendimento): nome empresa/contato na lista+cabeçalho e nova conversa por cliente

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: CHANGELOG + finalizar branch

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG**

Sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Atendimento — nome do cliente:** a conversa mostra a razão social (empresa) + o responsável (contato)
  do cadastro no lugar do telefone, casando pelo número; a "nova conversa" permite buscar um cliente
  cadastrado (além de digitar um número avulso).
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog do nome do cliente + nova conversa por cliente

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: Finalizar a branch**

Usar `superpowers:finishing-a-development-branch`.

---

## Self-Review

- **Cobertura do spec:** `Conversa.contato` + `ConversaMeta` + `agruparConversas` override + `mapaClientesPorTelefone` (T1) ✓; `listarConversas` semeia cliente/contato + `listarClientesParaConversa` (T2) ✓; UI item (empresa/contato) + cabeçalho + nova conversa com busca (T3) ✓; testes unit (T1) + smoke (T3) ✓; CHANGELOG (T4) ✓. Sem migration (correto).
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Consistência de tipos:** `Conversa.contato`/`ConversaMeta.{cliente,contato}` (T1) usados em T2/T3; `mapaClientesPorTelefone` retorna `{ razaoSocial, contato }` consumido no T2; `listarClientesParaConversa` retorna `{ razaoSocial, contato, telefone }` consumido no T3. `convAtiva` já existe no Inbox (Fatia C).
- **Nota de sequência:** ao fim do T1/T2 o `tsc` do smoke fica quebrado de propósito (literal `Conversa` sem `contato`); fecha no T3. Cada commit roda os testes relevantes; typecheck/build completos valem do T3 em diante.
