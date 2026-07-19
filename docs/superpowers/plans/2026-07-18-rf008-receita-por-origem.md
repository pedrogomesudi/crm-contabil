# RF-008 — Relatório de receita por origem — Plano

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.
> Spec: `docs/superpowers/specs/2026-07-18-rf008-receita-por-origem-design.md`.

**Objetivo:** a tela **Receita por origem** (`/comercial/receita`) — por fonte da oportunidade: quantidade
de ganhos, valor ganho e valor de proposta aceita (mensal e único), num período navegável.

**Arquitetura:** lógica pura `receitaPorOrigem`/`totalReceita` (testável), uma server action que carrega
oportunidades ganhas + propostas aceitas, e a tela client com o seletor de período (reusa `periodoBounds`).
Sem migration.

**Stack:** Next.js 16 (Server Actions), Supabase, TypeScript, vitest.

## Global Constraints

- **Sem migration** — usa `oportunidade` (`etapa`/`origem`/`valor_estimado`/`fechado_em`), `proposta`
  (`status`/`oportunidade_id`), `proposta_item` (`valor`/`recorrencia`).
- **Agrupa por `origem` como texto**; vazia/só-espaços → `"Sem origem"`. Não normaliza variações.
- **Proposta aceita:** mensal e único **separados**; soma os itens de **todas** as propostas `aceita` da
  oportunidade.
- **Período** ancorado em `fechado_em`; seletor navegável (reusa `periodoBounds`/`Granularidade` de
  `@/lib/comercial/metricas`) + opção **"Todo o histórico"** (passa `inicio=fim=null`).
- **Gate:** `podeCriarCliente(papel)` (como as demais telas do comercial).
- Reusar `Container`/`PageHeader`/`SubNav`/`controleCls`. **Registrar a rota** em
  `src/tests/ui/rotas-alcancaveis.test.ts` (`POR_SUBNAV`).
- **`main` protegido:** PR `develop → main`, `verify` verde. Release com bump + CHANGELOG. Deploy só código.
- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`,
  `npm run build`.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/lib/comercial/receita.ts` | **Criar** — `receitaPorOrigem`, `totalReceita` | 1 |
| `src/tests/comercial/receita.test.ts` | **Criar** — testes da lógica | 1 |
| `src/app/(app)/comercial/receita/actions.ts` | **Criar** — `carregarReceitaPorOrigem` | 2 |
| `src/app/(app)/comercial/receita/page.tsx` | **Criar** — página server | 3 |
| `src/app/(app)/comercial/receita/ReceitaPorOrigem.tsx` | **Criar** — client (período + tabela) | 3 |
| `src/tests/comercial/receita-render.test.tsx` | **Criar** — render | 3 |
| `src/app/(app)/comercial/page.tsx` | **Modificar** — aba no SubNav | 3 |
| `src/tests/ui/rotas-alcancaveis.test.ts` | **Modificar** — registrar a rota | 3 |
| `CHANGELOG.md` + `package.json` | **Modificar** — release 6.17.0 | 4 |

---

### Task 1: Lógica pura `receita.ts`

**Files:**
- Create: `src/lib/comercial/receita.ts`
- Test: `src/tests/comercial/receita.test.ts`

**Interfaces:**
- Produces:
  - `type LinhaReceita = { origem: string | null; valorGanho: number; propostaMensal: number; propostaUnico: number }`
  - `type FonteReceita = { origem: string; ganhos: number; valorGanho: number; propostaMensal: number; propostaUnico: number }`
  - `receitaPorOrigem(linhas: LinhaReceita[]): FonteReceita[]`
  - `totalReceita(fontes: FonteReceita[]): Omit<FonteReceita, "origem">`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import { receitaPorOrigem, totalReceita } from "@/lib/comercial/receita";

const linhas = [
  { origem: "Indicação João", valorGanho: 5000, propostaMensal: 500, propostaUnico: 0 },
  { origem: "Indicação João", valorGanho: 7400, propostaMensal: 1000, propostaUnico: 900 },
  { origem: "Google", valorGanho: 6800, propostaMensal: 800, propostaUnico: 0 },
  { origem: "  ", valorGanho: 2000, propostaMensal: 0, propostaUnico: 0 },
  { origem: null, valorGanho: 300, propostaMensal: 0, propostaUnico: 0 },
];

describe("receitaPorOrigem", () => {
  const fontes = receitaPorOrigem(linhas);
  it("agrupa por origem e soma cada coluna; vazia → 'Sem origem'", () => {
    const joao = fontes.find((f) => f.origem === "Indicação João");
    expect(joao).toEqual({ origem: "Indicação João", ganhos: 2, valorGanho: 12400, propostaMensal: 1500, propostaUnico: 900 });
    const sem = fontes.find((f) => f.origem === "Sem origem");
    expect(sem).toEqual({ origem: "Sem origem", ganhos: 2, valorGanho: 2300, propostaMensal: 0, propostaUnico: 0 });
  });
  it("ordena por valorGanho desc", () => {
    expect(fontes.map((f) => f.origem)).toEqual(["Indicação João", "Google", "Sem origem"]);
  });
});

describe("totalReceita", () => {
  it("soma todas as fontes", () => {
    expect(totalReceita(receitaPorOrigem(linhas))).toEqual({
      ganhos: 5,
      valorGanho: 21500,
      propostaMensal: 2300,
      propostaUnico: 900,
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/receita.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
export type LinhaReceita = { origem: string | null; valorGanho: number; propostaMensal: number; propostaUnico: number };
export type FonteReceita = { origem: string; ganhos: number; valorGanho: number; propostaMensal: number; propostaUnico: number };

const SEM_ORIGEM = "Sem origem";

export function receitaPorOrigem(linhas: LinhaReceita[]): FonteReceita[] {
  const mapa = new Map<string, FonteReceita>();
  for (const l of linhas) {
    const chave = (l.origem ?? "").trim() || SEM_ORIGEM;
    const f = mapa.get(chave) ?? { origem: chave, ganhos: 0, valorGanho: 0, propostaMensal: 0, propostaUnico: 0 };
    f.ganhos += 1;
    f.valorGanho += l.valorGanho;
    f.propostaMensal += l.propostaMensal;
    f.propostaUnico += l.propostaUnico;
    mapa.set(chave, f);
  }
  return [...mapa.values()].sort((a, b) => b.valorGanho - a.valorGanho || a.origem.localeCompare(b.origem));
}

export function totalReceita(fontes: FonteReceita[]): Omit<FonteReceita, "origem"> {
  return fontes.reduce(
    (t, f) => ({
      ganhos: t.ganhos + f.ganhos,
      valorGanho: t.valorGanho + f.valorGanho,
      propostaMensal: t.propostaMensal + f.propostaMensal,
      propostaUnico: t.propostaUnico + f.propostaUnico,
    }),
    { ganhos: 0, valorGanho: 0, propostaMensal: 0, propostaUnico: 0 },
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/comercial/receita.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comercial/receita.ts src/tests/comercial/receita.test.ts
git commit -m "feat(comercial): receitaPorOrigem + totalReceita (logica pura)"
```

---

### Task 2: Server action `carregarReceitaPorOrigem`

**Files:**
- Create: `src/app/(app)/comercial/receita/actions.ts`

**Interfaces:**
- Consumes: `LinhaReceita` (Task 1).
- Produces: `carregarReceitaPorOrigem(inicio: string | null, fim: string | null): Promise<LinhaReceita[]>`
  (gate `podeCriarCliente`; `inicio`/`fim` `null` = sem filtro de data).

- [ ] **Step 1: Escrever o arquivo**

```ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import type { LinhaReceita } from "@/lib/comercial/receita";

export async function carregarReceitaPorOrigem(
  inicio: string | null,
  fim: string | null,
): Promise<LinhaReceita[]> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return [];
  const supabase = await createServerSupabase();

  let q = supabase.from("oportunidade").select("id, origem, valor_estimado").eq("etapa", "ganho");
  if (inicio && fim) q = q.gte("fechado_em", inicio).lt("fechado_em", fim);
  const { data: ops } = await q;
  const ganhas = ops ?? [];
  if (ganhas.length === 0) return [];

  const ids = ganhas.map((o) => o.id as string);
  // Propostas aceitas dessas oportunidades + seus itens (soma por recorrência, por oportunidade).
  const { data: props } = await supabase
    .from("proposta")
    .select("id, oportunidade_id")
    .eq("status", "aceita")
    .in("oportunidade_id", ids);
  const propostas = props ?? [];
  const propToOp = new Map(propostas.map((pr) => [pr.id as string, pr.oportunidade_id as string]));
  const somas = new Map<string, { mensal: number; unico: number }>(); // por oportunidade_id
  if (propostas.length > 0) {
    const { data: itens } = await supabase
      .from("proposta_item")
      .select("proposta_id, valor, recorrencia")
      .in("proposta_id", [...propToOp.keys()]);
    for (const it of itens ?? []) {
      const opId = propToOp.get(it.proposta_id as string);
      if (!opId) continue;
      const s = somas.get(opId) ?? { mensal: 0, unico: 0 };
      if (it.recorrencia === "mensal") s.mensal += Number(it.valor);
      else s.unico += Number(it.valor);
      somas.set(opId, s);
    }
  }

  return ganhas.map((o) => {
    const s = somas.get(o.id as string) ?? { mensal: 0, unico: 0 };
    return {
      origem: (o.origem as string | null) ?? null,
      valorGanho: o.valor_estimado != null ? Number(o.valor_estimado) : 0,
      propostaMensal: s.mensal,
      propostaUnico: s.unico,
    };
  });
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck`
Expected: aponta só a página/o client da Task 3 (ainda não existem). O actions compila.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/comercial/receita/actions.ts"
git commit -m "feat(comercial): carregarReceitaPorOrigem (oportunidades ganhas + propostas aceitas)"
```

---

### Task 3: Tela + aba no SubNav

**Files:**
- Create: `src/app/(app)/comercial/receita/page.tsx`
- Create: `src/app/(app)/comercial/receita/ReceitaPorOrigem.tsx`
- Test: `src/tests/comercial/receita-render.test.tsx`
- Modify: `src/app/(app)/comercial/page.tsx` (aba no SubNav)
- Modify: `src/tests/ui/rotas-alcancaveis.test.ts` (registrar a rota)

**Interfaces:**
- Consumes: `carregarReceitaPorOrigem` (Task 2), `receitaPorOrigem`/`totalReceita` (Task 1),
  `periodoBounds`/`Granularidade` (`@/lib/comercial/metricas`).
- Produces: a tela `/comercial/receita`.

- [ ] **Step 1: Página server**

```tsx
import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { ReceitaPorOrigem } from "./ReceitaPorOrigem";
import { carregarReceitaPorOrigem } from "./actions";
import { periodoBounds } from "@/lib/comercial/metricas";

export const metadata = { title: "Receita por origem" };

export default async function ReceitaPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const { inicio, fim } = periodoBounds("mes", hoje, 0);
  const linhas = await carregarReceitaPorOrigem(inicio, fim);
  return (
    <Container largura="padrao" className="space-y-5 p-4">
      <Voltar href="/comercial" label="Comercial" />
      <PageHeader titulo="Receita por origem" subtitulo="Quanto cada fonte trouxe de receita" />
      <ReceitaPorOrigem linhasIniciais={linhas} hoje={hoje} />
    </Container>
  );
}
```

- [ ] **Step 2: Teste de render**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/comercial/receita/actions", () => ({ carregarReceitaPorOrigem: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { ReceitaPorOrigem } from "@/app/(app)/comercial/receita/ReceitaPorOrigem";
import type { LinhaReceita } from "@/lib/comercial/receita";

const linhas: LinhaReceita[] = [
  { origem: "Google", valorGanho: 6800, propostaMensal: 800, propostaUnico: 0 },
  { origem: null, valorGanho: 2000, propostaMensal: 0, propostaUnico: 0 },
];

describe("ReceitaPorOrigem", () => {
  it("renderiza a tabela com fontes e total", () => {
    const html = renderToStaticMarkup(<ReceitaPorOrigem linhasIniciais={linhas} hoje="2026-07-18" />);
    expect(html).toContain("Google");
    expect(html).toContain("Sem origem");
    expect(html).toContain("Total");
    expect(html).toContain("Valor ganho");
  });
  it("estado vazio", () => {
    const html = renderToStaticMarkup(<ReceitaPorOrigem linhasIniciais={[]} hoje="2026-07-18" />);
    expect(html).toContain("Nenhum negócio ganho no período");
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/receita-render.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 4: Client `ReceitaPorOrigem`**

Requisitos (client, `"use client"`):
- Props: `linhasIniciais: LinhaReceita[]`, `hoje: string`.
- Estado: `gran` (`Granularidade`, default `"mes"`), `offset` (0), `tudo` (bool, default false),
  `linhas` (`LinhaReceita[]`, init `linhasIniciais`), `ocupado`.
- Um helper `brl`. `fontes = receitaPorOrigem(linhas)`, `total = totalReceita(fontes)`.
- **Seletor de período:** um `<select>` de granularidade (Mês/Trimestre/Semestre/Ano), ← → para o `offset`,
  o rótulo do período (`periodoBounds(gran, hoje, offset).rotulo`), e um botão **"Todo o histórico"**
  (alterna `tudo`). Ao mudar qualquer um, chamar `recarregar()`:
  ```ts
  async function recarregar(g = gran, o = offset, t = tudo) {
    setOcupado(true);
    const { inicio, fim } = periodoBounds(g, hoje, o);
    const novas = await carregarReceitaPorOrigem(t ? null : inicio, t ? null : fim);
    setLinhas(novas);
    setOcupado(false);
  }
  ```
  (com `tudo` ligado, o seletor de período fica desabilitado; o rótulo mostra "Todo o histórico".)
- **Tabela:** cabeçalho Origem · Ganhos · **Valor ganho** · Proposta mensal · Proposta único; uma linha por
  `fonte` (mensal com sufixo "/mês"); **rodapé** com `total` (mesmas colunas, "Total" na 1ª). Números com
  `tabular-nums`, colunas de valor alinhadas à direita.
- Vazio (`fontes.length === 0`): uma linha/aviso **"Nenhum negócio ganho no período"**.
- `<select>`/inputs usam `controleCls("compacto")` (sem `border` próprio — regra `divida-ui`).

- [ ] **Step 5: Aba no SubNav + rota registrada**

Em `comercial/page.tsx`, no `SubNav`, acrescentar `{ href: "/comercial/receita", label: "Receita" }`. Em
`src/tests/ui/rotas-alcancaveis.test.ts`, adicionar `"/comercial/receita"` ao array `POR_SUBNAV`.

- [ ] **Step 6: Rodar e verificar**

Run: `npx vitest run src/tests/comercial/receita-render.test.tsx src/tests/ui/rotas-alcancaveis.test.ts && npm run typecheck && npm run lint`
Expected: PASS + limpo.

- [ ] **Step 7: Conferência na tela** — `npm run dev`: criar/ganhar 2-3 oportunidades com origens
  diferentes (e uma proposta aceita), abrir `/comercial/receita`, conferir a tabela, o período e o "Todo o
  histórico". **Mostrar ao Pedro.**

- [ ] **Step 8: `format` e commit**

```bash
npm run format
git add -A
git commit -m "feat(comercial): tela Receita por origem (/comercial/receita)"
```

---

### Task 4: Release 6.17.0

**Files:** `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Verificação completa**

```bash
npm run lint && npm run typecheck && npm test && npm run format && npm run build
npx prettier --check .
```

- [ ] **Step 2: Bump + CHANGELOG**

- `package.json`: `6.16.0` → `6.17.0`.
- `CHANGELOG.md`: `## [6.17.0] — <data>` com `### Adicionado` (relatório de receita por origem: valor ganho
  + proposta aceita mensal/único, por fonte, com período). **Fecha a RF-008.**
- Conferir `npx vitest run src/tests/versao.test.ts`.

- [ ] **Step 3: PR**

```bash
git push origin develop
gh pr create --base main --head develop --title "RF-008: relatório de receita por origem (v6.17.0)"
gh pr checks --watch
```

- [ ] **Step 4: Release (com o Pedro)**

> **Sem migration.** Sequência: merge → **Implantar** → confirmar `6.17.0` no `/api/health` → **tag**.

## Self-Review (cobertura da spec)

- `receitaPorOrigem`/`totalReceita` (agrupa, "Sem origem", ordena, soma) → Task 1.
- Carga: ganhas no período + propostas aceitas somadas por recorrência → Task 2.
- Tela com período navegável + "Todo o histórico", tabela + rodapé, estado vazio → Task 3.
- Aba no SubNav + rota registrada → Task 3.
- Sem migration → nenhuma tarefa de banco.
