# Conciliação parcial + tolerância — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** um título pode ser pago por vários movimentos (parcial), com tolerância de valor configurável; o auto-casamento segue só no exato.

**Architecture:** `escritorio_config.tolerancia_conciliacao`; `casar.ts` recebe a tolerância e oferece títulos com `saldo ≥ |mov|−tol` (flag `parcial`); `conciliarComTitulo` aceita `BAIXADO_PARCIAL` e troca o guard; o trigger `recalcular_status_titulo` cuida do status.

**Tech Stack:** Next 16 (server actions), TypeScript, Tailwind 4, Supabase (Postgres/RLS), vitest.

## Global Constraints

- Next 16: imports `@/*`; `middleware.ts` é `proxy.ts`.
- RBAC: papel só via `auth_papel()`; conciliação é `gate()` (admin/financeiro).
- Migrations: runner `npm run db:migrate`; imutáveis após aplicadas; idempotentes; numerar após `0115`.
- Guard `divida-ui`: controles sem `border` à mão → `controleCls`.
- O trigger `recalcular_status_titulo` (`0029`) já define `ABERTO`/`BAIXADO`/`BAIXADO_PARCIAL` pela soma das baixas — **não gerir status** nesta fatia.
- `uq_movimento_baixa` permanece (1 baixa ↔ 1 movimento; N baixas por título é permitido).
- Rodar antes de entregar: `lint`, `typecheck`, `test`, `format`, `build`. PR `develop`→`main`; tag após deploy; versão+CHANGELOG no mesmo PR.

---

### Task 1: Migration 0116 — tolerância de conciliação

**Files:**
- Create: `supabase/migrations/0116_tolerancia_conciliacao.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Conciliação parcial: tolerância de valor configurável.
alter table escritorio_config add column if not exists tolerancia_conciliacao numeric(15,2) not null default 0.01;
```

- [ ] **Step 2: Conferir idempotência** (`add column if not exists` com default).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0116_tolerancia_conciliacao.sql
git commit -m "feat(fin): migration 0116 tolerancia de conciliacao"
```

> Aplicada em produção no release, antes de Implantar.

---

### Task 2: Lógica pura — tolerância + candidatos parciais

**Files:**
- Modify: `src/lib/conciliacao/casar.ts`
- Test: `src/tests/conciliacao/parcial.test.ts` (novo; não mexer nos testes existentes além do necessário)

**Interfaces:**
- `CandTitulo` ganha `parcial: boolean`.
- `candidatosMovimento(mov, baixas, titulos, tol)` e `autoCasar(movimentos, baixas, titulos, tol)` ganham `tol: number` (default `0`).
- Produces: `casaValor(x: number, y: number, tol: number): boolean`.

- [ ] **Step 1: Escrever os testes (falham)**

```ts
import { describe, it, expect } from "vitest";
import { candidatosMovimento, autoCasar, type BaixaDisp, type TituloAberto } from "@/lib/conciliacao/casar";

const semBaixas: BaixaDisp[] = [];
const tit = (id: string, valor: number, baixado = 0): TituloAberto => ({
  tituloId: id, valor, baixado, tipo: "RECEBER", vencimento: "2026-07-10", descricao: id,
});

describe("candidatosMovimento (parcial)", () => {
  it("saldo igual ao movimento é candidato exato (parcial=false)", () => {
    const r = candidatosMovimento({ id: "m", valor: 100, data: "2026-07-10" }, semBaixas, [tit("t", 100)], 0.01);
    expect(r.titulos).toHaveLength(1);
    expect(r.titulos[0]!.parcial).toBe(false);
  });
  it("saldo maior que o movimento é candidato PARCIAL", () => {
    const r = candidatosMovimento({ id: "m", valor: 40, data: "2026-07-10" }, semBaixas, [tit("t", 100)], 0.01);
    expect(r.titulos[0]!.parcial).toBe(true);
  });
  it("saldo menor que o movimento (fora da tolerância) é excluído", () => {
    const r = candidatosMovimento({ id: "m", valor: 100, data: "2026-07-10" }, semBaixas, [tit("t", 40)], 0.01);
    expect(r.titulos).toHaveLength(0);
  });
  it("exatos vêm antes de parciais na ordem", () => {
    const r = candidatosMovimento(
      { id: "m", valor: 100, data: "2026-07-10" }, semBaixas, [tit("maior", 500), tit("exato", 100)], 0.01,
    );
    expect(r.titulos[0]!.tituloId).toBe("exato");
  });
});

describe("autoCasar não aplica parcial", () => {
  it("com só um candidato parcial, não propõe nada", () => {
    const r = autoCasar([{ id: "m", valor: 40, data: "2026-07-10" }], semBaixas, [tit("t", 100)], 0.01);
    expect(r).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npx vitest run src/tests/conciliacao/parcial.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementar em `casar.ts`**

1. Adicionar o comparador com tolerância (e manter `igual` como `casaValor(x,y,0.005)` se ainda usado, ou substituir):

```ts
export const casaValor = (x: number, y: number, tol: number) => Math.abs(x - y) <= tol;
```

2. `CandTitulo` ganha `parcial: boolean;`.

3. `candidatosMovimento(mov, baixas, titulos, tol = 0)`:
   - baixas: `casaValor(valorAssinadoBaixa(b), mov.valor, tol)` (era `igual`).
   - títulos: filtrar `t.tipo === tipoAlvo && saldoTitulo(t) >= Math.abs(mov.valor) - tol`; mapear com
     `parcial: saldoTitulo(t) > Math.abs(mov.valor) + tol`; ordenar **exatos primeiro** e depois por proximidade
     de data; `.slice(0, 20)`.

```ts
export function candidatosMovimento(
  mov: MovPendente, baixas: BaixaDisp[], titulos: TituloAberto[], tol = 0,
): { baixas: CandBaixa[]; titulos: CandTitulo[] } {
  const cb = baixas
    .filter((b) => casaValor(valorAssinadoBaixa(b), mov.valor, tol))
    .sort((a, b) => dist(a.data, mov.data) - dist(b.data, mov.data))
    .map((b) => ({ baixaId: b.baixaId, data: b.data, clienteNome: b.clienteNome }));
  const tipoAlvo = mov.valor > 0 ? "RECEBER" : "PAGAR";
  const abs = Math.abs(mov.valor);
  const ct = titulos
    .filter((t) => t.tipo === tipoAlvo && saldoTitulo(t) >= abs - tol)
    .sort((a, b) => {
      const pa = saldoTitulo(a) > abs + tol ? 1 : 0;
      const pb = saldoTitulo(b) > abs + tol ? 1 : 0;
      return pa - pb || dist(a.vencimento, mov.data) - dist(b.vencimento, mov.data);
    })
    .slice(0, 20)
    .map((t) => ({
      tituloId: t.tituloId, vencimento: t.vencimento, descricao: t.descricao, tipo: t.tipo,
      saldo: saldoTitulo(t), parcial: saldoTitulo(t) > abs + tol,
    }));
  return { baixas: cb, titulos: ct };
}
```

4. `autoCasar(movimentos, baixas, titulos, tol = 0)`: passa `tol` e considera **só exatos** (ignora parciais):

```ts
export function autoCasar(movimentos: MovPendente[], baixas: BaixaDisp[], titulos: TituloAberto[], tol = 0): Casamento[] {
  const prop: Casamento[] = [];
  for (const mov of movimentos) {
    const c = candidatosMovimento(mov, baixas, titulos, tol);
    const titExatos = c.titulos.filter((t) => !t.parcial);
    if (c.baixas.length + titExatos.length !== 1) continue;
    if (c.baixas.length === 1) prop.push({ movimentoId: mov.id, alvo: "baixa", alvoId: c.baixas[0]!.baixaId });
    else prop.push({ movimentoId: mov.id, alvo: "titulo", alvoId: titExatos[0]!.tituloId });
  }
  const contagem = new Map<string, number>();
  for (const p of prop) contagem.set(p.alvoId, (contagem.get(p.alvoId) ?? 0) + 1);
  return prop.filter((p) => contagem.get(p.alvoId) === 1);
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npx vitest run src/tests/conciliacao/` — Expected: PASS (rodar TODA a pasta; ajustar testes existentes de `candidatosMovimento`/`autoCasar` que agora recebem `tol` ou esperavam exato-only, se houver — os defaults `tol=0` preservam a assinatura, mas a inclusão de parciais pode exigir atualizar asserções antigas).

- [ ] **Step 5: Commit**

```bash
git add src/lib/conciliacao/casar.ts src/tests/conciliacao/parcial.test.ts
git commit -m "feat(fin): candidatos parciais + tolerancia em casar.ts"
```

---

### Task 3: Ações — parcial + tolerância

**Files:**
- Modify: `src/app/(app)/financeiro/conciliacao/conciliar-actions.ts`

- [ ] **Step 1: Carregar a tolerância**

Adicionar um helper que lê a config (fallback 0,01):

```ts
async function tolerancia(supabase: Awaited<ReturnType<typeof createServerSupabase>>): Promise<number> {
  const { data } = await supabase.from("escritorio_config").select("tolerancia_conciliacao").eq("id", 1).maybeSingle();
  return Number(data?.tolerancia_conciliacao ?? 0.01);
}
```

- [ ] **Step 2: `titulosAbertos` — parcial-fit**

Trocar a assinatura para `titulosAbertos(supabase, tipo, valorAbs, tol)` e:
- no `.select`, `.in("status", ["ABERTO", "VENCIDO", "BAIXADO_PARCIAL"])`; **remover** o `.eq("valor", valorAbs)`;
- após computar `baixado`/`saldo` (o `TituloAberto` já carrega `valor`/`baixado`), devolver **todos** os títulos do
  tipo (o `candidatosMovimento` filtra por `saldo >= valorAbs - tol` e ordena). Limitar a query (ex.: `.limit(300)`).

(O `saldoTitulo` do puro usa `valor - baixado`; o `titulosAbertos` já devolve `valor` e `baixado`, então basta
não filtrar por `valor` no SQL e deixar o puro decidir.)

- [ ] **Step 3: `candidatosDoMovimento` passa a tolerância**

Onde chama `candidatosMovimento(mov, baixas, titulos)` e `titulosAbertos(...)`, passar `tol` (obtido por
`tolerancia(supabase)`): `titulosAbertos(supabase, tipo, valorAbs, tol)` e `candidatosMovimento(mov, baixas,
titulos, tol)`.

- [ ] **Step 4: `conciliarComTitulo` — parcial + guard**

- Aceitar o status parcial: `if (!["ABERTO", "VENCIDO", "BAIXADO_PARCIAL"].includes(tit.status as string)) return { erro: "Título indisponível." };`
- Substituir o guard exato:

```ts
const tol = await tolerancia(supabase);
const saldo = saldoTitulo({ valor: Number(tit.valor), baixado });
if (Math.abs(Number(mov.valor)) > saldo + tol) {
  return { erro: "O valor do movimento supera o saldo do título." };
}
```

(a baixa segue `valor_recebido = |mov.valor|`; o trigger recalcula o status para `BAIXADO_PARCIAL`/`BAIXADO`.)

- [ ] **Step 5: Typecheck** — Run: `npm run typecheck` — Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/financeiro/conciliacao/conciliar-actions.ts"
git commit -m "feat(fin): conciliacao parcial nas actions (titulosAbertos + guard + tolerancia)"
```

---

### Task 4: UI — tolerância na tela + rótulo "parcial"

**Files:**
- Modify: `src/app/(app)/financeiro/conciliacao/actions.ts` (nova `salvarTolerancia`)
- Modify: `src/app/(app)/financeiro/conciliacao/page.tsx` (carrega a tolerância + form admin)
- Modify: `src/app/(app)/financeiro/conciliacao/AcaoMovimento.tsx` (rótulo "pagamento parcial" no candidato)
- Modify: `src/tests/conciliacao/parcial.test.ts` (já cobre o puro; sem novo teste de UI obrigatório)

**Interfaces:**
- Produces: `salvarTolerancia(formData: FormData): Promise<void>` (server action; admin).

- [ ] **Step 1: Action `salvarTolerancia`** (em `conciliacao/actions.ts`)

```ts
export async function salvarTolerancia(formData: FormData): Promise<void> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || perfil.papel !== "admin") return;
  const raw = String(formData.get("tolerancia") ?? "").trim().replace(",", ".");
  const tol = Number(raw);
  if (!Number.isFinite(tol) || tol < 0) return;
  const admin = createAdminSupabase();
  await admin.from("escritorio_config").update({ tolerancia_conciliacao: tol }).eq("id", 1);
  revalidatePath("/financeiro/conciliacao");
}
```

(imports: `getPerfilAtual`, `createAdminSupabase`, `revalidatePath`.)

- [ ] **Step 2: Campo na `page.tsx`** — carregar `escritorio_config.tolerancia_conciliacao` e, para admin, renderizar um form (server action) com um `input` numérico (`controleCls`) e um botão "Salvar". Texto: "Tolerância de valor (R$) para casar movimentos."

- [ ] **Step 3: Rótulo "parcial" no `AcaoMovimento.tsx`** — onde os candidatos-título são renderizados (usam `CandTitulo`), quando `t.parcial`, exibir um selo **"pagamento parcial"** e o saldo (`formatarMoeda(t.saldo)`), ao lado do título. O clique segue chamando `conciliarComTitulo(mov.id, t.tituloId)`.

> Nota: confirmar o ponto exato de render dos candidatos-título em `AcaoMovimento.tsx` (grep `titulos.map` / `conciliarComTitulo`) e inserir o selo condicional; controles/rótulos sem `border` à mão.

- [ ] **Step 4: Verificar** — Run: `npm run typecheck && npx vitest run src/tests/conciliacao/ src/tests/ui/divida-ui.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/financeiro/conciliacao/actions.ts" "src/app/(app)/financeiro/conciliacao/page.tsx" "src/app/(app)/financeiro/conciliacao/AcaoMovimento.tsx"
git commit -m "feat(fin): tolerancia na tela + rotulo de pagamento parcial"
```

---

### Task 5: Release

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm test && npm run format && npm run build` — tudo verde.
- [ ] **Step 2:** bump de versão (minor) + CHANGELOG (mesmo PR).
- [ ] **Step 3:** aplicar migration 0116 em produção (`node --env-file=.env.producao.bak scripts/db-migrate.mjs`) **antes** de Implantar.
- [ ] **Step 4:** REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch (PR, merge, Implantar, `/api/health`, tag).

---

## Self-Review

- **Cobertura da spec:** tolerância na config (T1/T4), candidatos parciais + tolerância na lógica pura (T2), `titulosAbertos`/`conciliarComTitulo` parcial + guard + `BAIXADO_PARCIAL` (T3), campo de tolerância + rótulo parcial na UI (T4), release com migration em prod (T5). Fora de escopo respeitado (sem conferência de saldo, sem N títulos↔1 movimento). O status fica com o trigger existente.
- **Placeholders:** nenhum passo de código sem código; as duas Notas (ajustar testes antigos de casar; ponto de render em AcaoMovimento) são verificações pontuais.
- **Consistência de tipos:** `CandTitulo.parcial` (T2) consumido pela UI (T4); `tol` fluído de `tolerancia()` (T3) para `candidatosMovimento`/`titulosAbertos` (T2/T3); `salvarTolerancia`/campo (T4) gravam `tolerancia_conciliacao` lido em T3.
