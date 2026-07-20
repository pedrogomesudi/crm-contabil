# Cobrança avulsa — Fatia A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir criar uma cobrança avulsa (título a receber em aberto) para um cliente existente na tela Contas a Receber, opcionalmente já emitindo o boleto — sem depender de honorário recorrente.

**Architecture:** Ação nova `criarCobrancaAvulsa` que insere um `titulo` RECEBER/RECEITA_AVULSA/ABERTO (espelha a receita avulsa da conciliação, sem baixa) e, se pedido, reusa `emitirBoleto(tituloId)` que já existe. Validação em lib pura testada. Form novo (componente próprio) na tela Contas a Receber. `emitirBoleto`/`listarTitulos`/`listarBoletosDaCompetencia` não mudam.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, Tailwind 4, vitest + `renderToStaticMarkup`.

## Global Constraints

- Gate financeiro = `podeGerenciarFinanceiro` (admin/financeiro); a RLS de `titulo` só deixa admin/financeiro escrever.
- `titulo` RECEBER exige `cliente_id NOT NULL` (chk_titulo_tipo). Origem `RECEITA_AVULSA` já existe (0065).
- Categoria **obrigatória** no avulso (coerência com a DRE). Competência = mês do vencimento (dia 01).
- Guard `divida-ui`: inputs sem `border` estático escrito à mão — usar `controleCls` de `@/components/ui/Campo`; sem `←`/`amber-\d`.
- Imports `@/*`. Rodar antes de commitar: `npm run lint && npm run typecheck && npm test && npm run format && npm run build`.

---

### Task 1: Lógica pura de validação da cobrança avulsa

**Files:**
- Create: `src/lib/financeiro/cobranca-avulsa.ts`
- Test: `src/tests/financeiro/cobranca-avulsa.test.ts`

**Interfaces:**
- Produces:
  - `type EntradaAvulsa = { clienteId: string; valor: number; vencimento: string; categoriaId: string }`
  - `competenciaDoVencimento(vencimento: string): string` — "YYYY-MM-01"
  - `validarCobrancaAvulsa(e: EntradaAvulsa): { ok: true } | { ok: false; erro: string }`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/financeiro/cobranca-avulsa.test.ts
import { describe, it, expect } from "vitest";
import { validarCobrancaAvulsa, competenciaDoVencimento } from "@/lib/financeiro/cobranca-avulsa";

const ok = { clienteId: "c1", valor: 100, vencimento: "2026-08-10", categoriaId: "cat1" };

describe("competenciaDoVencimento", () => {
  it("usa o mês do vencimento no dia 01", () => {
    expect(competenciaDoVencimento("2026-08-10")).toBe("2026-08-01");
  });
});

describe("validarCobrancaAvulsa", () => {
  it("aceita entrada completa", () => {
    expect(validarCobrancaAvulsa(ok)).toEqual({ ok: true });
  });
  it("recusa sem cliente", () => {
    const r = validarCobrancaAvulsa({ ...ok, clienteId: "" });
    expect(r.ok).toBe(false);
  });
  it("recusa valor zero ou negativo", () => {
    expect(validarCobrancaAvulsa({ ...ok, valor: 0 }).ok).toBe(false);
    expect(validarCobrancaAvulsa({ ...ok, valor: -5 }).ok).toBe(false);
  });
  it("recusa sem categoria", () => {
    expect(validarCobrancaAvulsa({ ...ok, categoriaId: "" }).ok).toBe(false);
  });
  it("recusa vencimento fora de YYYY-MM-DD", () => {
    expect(validarCobrancaAvulsa({ ...ok, vencimento: "10/08/2026" }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/financeiro/cobranca-avulsa.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implement**

```ts
// src/lib/financeiro/cobranca-avulsa.ts
export type EntradaAvulsa = { clienteId: string; valor: number; vencimento: string; categoriaId: string };

// Competência da receita avulsa: mês do vencimento, dia 01 (padrão da conciliação).
export function competenciaDoVencimento(vencimento: string): string {
  return `${vencimento.slice(0, 7)}-01`;
}

export function validarCobrancaAvulsa(e: EntradaAvulsa): { ok: true } | { ok: false; erro: string } {
  if (!e.clienteId) return { ok: false, erro: "Selecione o cliente." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.vencimento)) return { ok: false, erro: "Vencimento inválido." };
  if (!(e.valor > 0)) return { ok: false, erro: "Informe um valor maior que zero." };
  if (!e.categoriaId) return { ok: false, erro: "Selecione a categoria." };
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/financeiro/cobranca-avulsa.test.ts`
Expected: PASS (7 asserts).

- [ ] **Step 5: Commit**

```bash
git add src/lib/financeiro/cobranca-avulsa.ts src/tests/financeiro/cobranca-avulsa.test.ts
git commit -m "feat(avulsa): lógica pura de validação da cobrança avulsa"
```

---

### Task 2: Ações — listar clientes/categorias e criar a cobrança avulsa

**Files:**
- Modify: `src/app/(app)/financeiro/contas-a-receber/actions.ts`

**Interfaces:**
- Consumes: `validarCobrancaAvulsa`, `competenciaDoVencimento` (Task 1); `emitirBoleto` de `./boleto-actions`.
- Produces:
  - `listarClientesAtivos(): Promise<{ id: string; nome: string }[]>`
  - `listarCategoriasReceita(): Promise<{ id: string; nome: string }[]>`
  - `type ResultadoAvulsa = { ok: true; tituloId: string; avisoBoleto?: string } | { erro: string }`
  - `criarCobrancaAvulsa(input: { clienteId: string; valor: number; vencimento: string; categoriaId: string; descricao: string }, emitirBoletoAgora: boolean): Promise<ResultadoAvulsa>`

- [ ] **Step 1: Add the imports**

No topo de `src/app/(app)/financeiro/contas-a-receber/actions.ts`, junto aos imports existentes:

```ts
import { validarCobrancaAvulsa, competenciaDoVencimento } from "@/lib/financeiro/cobranca-avulsa";
import { emitirBoleto } from "./boleto-actions";
```

- [ ] **Step 2: Add the listing actions**

Adicione ao arquivo (após `listarTitulos`):

```ts
export async function listarClientesAtivos(): Promise<{ id: string; nome: string }[]> {
  if (!(await gateGerir())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("clientes")
    .select("id, razao_social")
    .is("excluido_em", null)
    .order("razao_social");
  return (data ?? []).map((c) => ({ id: c.id as string, nome: c.razao_social as string }));
}

export async function listarCategoriasReceita(): Promise<{ id: string; nome: string }[]> {
  if (!(await gateGerir())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("categoria")
    .select("id, nome, natureza")
    .eq("ativa", true)
    .eq("natureza", "RECEITA")
    .order("nome");
  return (data ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string }));
}
```

> Nota: se a coluna `categoria.natureza` usar outro literal para receita (confirme no schema — 0026),
> ajuste o `.eq("natureza", ...)`. O valor deve ser o mesmo que a conciliação trata como receita.

- [ ] **Step 3: Add the create action**

```ts
export type ResultadoAvulsa = { ok: true; tituloId: string; avisoBoleto?: string } | { erro: string };

export async function criarCobrancaAvulsa(
  input: { clienteId: string; valor: number; vencimento: string; categoriaId: string; descricao: string },
  emitirBoletoAgora: boolean,
): Promise<ResultadoAvulsa> {
  const perfil = await gateGerir();
  if (!perfil) return { erro: "Sem permissão." };
  const v = validarCobrancaAvulsa(input);
  if (!v.ok) return { erro: v.erro };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("titulo")
    .insert({
      tipo: "RECEBER",
      origem: "RECEITA_AVULSA",
      status: "ABERTO",
      cliente_id: input.clienteId,
      valor: input.valor,
      vencimento: input.vencimento,
      competencia: competenciaDoVencimento(input.vencimento),
      categoria_id: input.categoriaId,
      descricao: input.descricao.trim() || null,
      criado_por: perfil.id,
    })
    .select("id")
    .single();
  if (error || !data) return { erro: "Falha ao criar a cobrança." };
  const tituloId = data.id as string;
  revalidatePath(ROTA);
  if (emitirBoletoAgora) {
    const b = await emitirBoleto(tituloId);
    if (b.erro) return { ok: true, tituloId, avisoBoleto: b.erro };
  }
  return { ok: true, tituloId };
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: sem erros. (Confirme que `emitirBoleto` é exportada de `./boleto-actions` — é.)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/financeiro/contas-a-receber/actions.ts"
git commit -m "feat(avulsa): ação criarCobrancaAvulsa + listagem de clientes/categorias"
```

---

### Task 3: UI — form "Nova cobrança avulsa" + rótulo "Avulsa"

**Files:**
- Create: `src/components/financeiro/NovaCobrancaAvulsa.tsx`
- Modify: `src/components/financeiro/ContasReceber.tsx`
- Test: `src/tests/financeiro/nova-cobranca-avulsa.test.tsx`

**Interfaces:**
- Consumes: `criarCobrancaAvulsa`, `listarClientesAtivos`, `listarCategoriasReceita` (Task 2).
- Produces: `NovaCobrancaAvulsa({ clientes, categorias, onCriado }: { clientes: {id;nome}[]; categorias: {id;nome}[]; onCriado: (competencia: string) => void })`.

- [ ] **Step 1: Write the component**

```tsx
// src/components/financeiro/NovaCobrancaAvulsa.tsx
"use client";
import { useState } from "react";
import { controleCls } from "@/components/ui/Campo";
import { criarCobrancaAvulsa } from "@/app/(app)/financeiro/contas-a-receber/actions";
import { competenciaDoVencimento } from "@/lib/financeiro/cobranca-avulsa";

type Opcao = { id: string; nome: string };

export function NovaCobrancaAvulsa({
  clientes,
  categorias,
  onCriado,
}: {
  clientes: Opcao[];
  categorias: Opcao[];
  onCriado: (competencia: string) => void;
}) {
  const [cliente, setCliente] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [categoria, setCategoria] = useState("");
  const [emitir, setEmitir] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function salvar() {
    setMsg("");
    setBusy(true);
    const r = await criarCobrancaAvulsa(
      { clienteId: cliente, valor: Number(valor), vencimento, categoriaId: categoria, descricao },
      emitir,
    );
    setBusy(false);
    if ("erro" in r) {
      setMsg(r.erro);
      return;
    }
    if (r.avisoBoleto) setMsg(`Cobrança criada, mas o boleto falhou: ${r.avisoBoleto}`);
    onCriado(competenciaDoVencimento(vencimento));
    setDescricao("");
    setValor("");
    setVencimento("");
    setCategoria("");
    setEmitir(false);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-linha bg-white p-3">
      <h2 className="text-sm font-semibold text-grafite">Nova cobrança avulsa</h2>
      <select value={cliente} onChange={(e) => setCliente(e.target.value)} className={controleCls("compacto")}>
        <option value="">Cliente…</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
      <input
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        placeholder="Descrição"
        className={controleCls("compacto")}
      />
      <div className="flex gap-2">
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          type="number"
          step="0.01"
          min="0"
          placeholder="Valor (R$)"
          className={controleCls("compacto")}
        />
        <input
          value={vencimento}
          onChange={(e) => setVencimento(e.target.value)}
          type="date"
          className={controleCls("compacto")}
        />
      </div>
      <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={controleCls("compacto")}>
        <option value="">Categoria…</option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={emitir} onChange={(e) => setEmitir(e.target.checked)} />
        Emitir boleto agora
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={salvar}
          className="rounded-lg bg-verde px-3 py-1 font-medium text-white hover:brightness-105 disabled:opacity-60"
        >
          Criar cobrança
        </button>
        {msg && <span className="text-cinza">{msg}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into ContasReceber + rótulo "Avulsa"**

Em `src/components/financeiro/ContasReceber.tsx`:

(a) imports (junto aos existentes):

```tsx
import { listarClientesAtivos, listarCategoriasReceita } from "@/app/(app)/financeiro/contas-a-receber/actions";
import { NovaCobrancaAvulsa } from "./NovaCobrancaAvulsa";
```

(b) estado + carga preguiçosa das listas, dentro do componente (após os outros `useState`):

```tsx
  const [avulsaAberta, setAvulsaAberta] = useState(false);
  const [clientesAv, setClientesAv] = useState<{ id: string; nome: string }[]>([]);
  const [categoriasAv, setCategoriasAv] = useState<{ id: string; nome: string }[]>([]);

  const abrirAvulsa = () =>
    start(async () => {
      if (clientesAv.length === 0) setClientesAv(await listarClientesAtivos());
      if (categoriasAv.length === 0) setCategoriasAv(await listarCategoriasReceita());
      setAvulsaAberta(true);
    });

  const aposCriarAvulsa = (competencia: string) => {
    setAvulsaAberta(false);
    const mesDoVenc = competencia.slice(0, 7);
    setMes(mesDoVenc);
    start(async () => {
      setTitulos(await listarTitulos(competencia));
      setBoletos(await listarBoletosDaCompetencia(competencia));
    });
  };
```

(c) botão + form: logo após o bloco de botões `<div className="flex flex-wrap items-end gap-2">…</div>` (antes de `{msg && …}`), adicione:

```tsx
      <div>
        <button
          onClick={abrirAvulsa}
          disabled={pend}
          className="rounded border border-linha px-3 py-1 disabled:opacity-60"
        >
          Nova cobrança avulsa
        </button>
      </div>
      {avulsaAberta && (
        <NovaCobrancaAvulsa clientes={clientesAv} categorias={categoriasAv} onCriado={aposCriarAvulsa} />
      )}
```

(d) rótulo de origem (linha ~116): trocar

```tsx
                    <td className="p-2">{t.origem === "DECIMO_TERCEIRO" ? "13º" : "Mensalidade"}</td>
```

por

```tsx
                    <td className="p-2">
                      {t.origem === "DECIMO_TERCEIRO" ? "13º" : t.origem === "RECEITA_AVULSA" ? "Avulsa" : "Mensalidade"}
                    </td>
```

- [ ] **Step 3: Write the render test**

```tsx
// src/tests/financeiro/nova-cobranca-avulsa.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NovaCobrancaAvulsa } from "@/components/financeiro/NovaCobrancaAvulsa";

const clientes = [{ id: "c1", nome: "Padaria X" }];
const categorias = [{ id: "cat1", nome: "Serviços avulsos" }];

describe("NovaCobrancaAvulsa", () => {
  it("mostra os campos, a categoria e o checkbox de boleto", () => {
    const html = renderToStaticMarkup(
      <NovaCobrancaAvulsa clientes={clientes} categorias={categorias} onCriado={vi.fn()} />,
    );
    expect(html).toContain("Nova cobrança avulsa");
    expect(html).toContain("Padaria X");
    expect(html).toContain("Serviços avulsos");
    expect(html).toContain("Emitir boleto agora");
    expect(html).toContain("Criar cobrança");
  });
});
```

- [ ] **Step 4: Run the render test**

Run: `npx vitest run src/tests/financeiro/nova-cobranca-avulsa.test.tsx`
Expected: PASS. (Não usa `useRouter` — sem necessidade de mock de `next/navigation`.)

- [ ] **Step 5: Full gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tudo verde. (Inputs usam `controleCls` — sem `border` estático; sem `amber`/`←`.)

- [ ] **Step 6: Commit**

```bash
git add "src/components/financeiro/NovaCobrancaAvulsa.tsx" "src/components/financeiro/ContasReceber.tsx" src/tests/financeiro/nova-cobranca-avulsa.test.tsx
git commit -m "feat(avulsa): form Nova cobrança avulsa + rótulo Avulsa na lista"
```

---

## Self-Review

**1. Spec coverage (Fatia A):**
- Lógica pura de validação + competência do vencimento → Task 1. ✅
- Ação `criarCobrancaAvulsa` (título RECEBER/RECEITA_AVULSA/ABERTO, categoria obrigatória, checkbox de boleto com falha não perdendo o título) → Task 2. ✅
- Form + botão "Nova cobrança avulsa" na tela Contas a Receber → Task 3. ✅
- Rótulo "Avulsa" na lista → Task 3 (d). ✅
- `emitirBoleto`/`listarTitulos`/`listarBoletosDaCompetencia` sem mudança → confirmado (reuso). ✅

**2. Placeholder scan:** Nenhum TBD/TODO; todo passo com código completo. ✅

**3. Type consistency:** `validarCobrancaAvulsa`/`competenciaDoVencimento` usadas de forma idêntica na action e no componente. `ResultadoAvulsa` (`{ok:true; tituloId; avisoBoleto?}` | `{erro}`) tratada no componente com `"erro" in r`. `criarCobrancaAvulsa(input, emitirBoletoAgora)` bate com a chamada do componente. Listas `{id;nome}[]` consistentes entre action, ContasReceber e NovaCobrancaAvulsa. ✅

**Nota de dependência:** confirmado — `categoria_natureza` é enum `('RECEITA','DESPESA')` em `0026_financeiro_cadastros.sql:9`, com categorias de receita já semeadas ("Honorários eventuais", "Outras receitas"). O `.eq("natureza", "RECEITA")` está correto.
