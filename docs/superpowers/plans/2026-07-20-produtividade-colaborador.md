# RF-073 — Produtividade por colaborador Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relatório admin-only que mostra, por membro da equipe e num período, horas apontadas, tarefas concluídas, obrigações entregues e carteira atendida.

**Architecture:** Molde da rentabilidade — lib pura testável (`agruparProdutividade`) + action fina com service_role + página server com filtro de período e export. Sem migration (todas as colunas já existem).

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (service_role via `createAdminSupabase`), Tailwind 4, Vitest.

## Global Constraints

- Alias de import `@/*` → `./src/*`.
- Gate da tela e da action: `perfil.papel === "admin"` (admin-only, decisão do brainstorm).
- `concluida_em` é `timestamptz` (as demais colunas de data são `date`): o fim do período dessa query usa `` `${ate}T23:59:59` ``, senão tarefas concluídas no próprio dia `ate` ficam de fora.
- Universo de linhas = **toda a equipe ativa** (`PAPEIS_EQUIPE`), zeros inclusos — ausência de produção precisa aparecer.
- Guard `divida-ui`: em `className` de input escrito à mão, usar `controleCls(...)` (nunca `border` estático); sem caractere `←` literal (usar componente `Voltar`); sem classes `amber-\d` (usar tokens `atencao`).
- Rodar `npm run lint`, `npm run typecheck`, `npm test`, `npm run format` antes de commitar; `git add -A` **depois** do `format`.

---

### Task 1: Lib pura `agruparProdutividade` + testes

**Files:**
- Create: `src/lib/timesheet/produtividade.ts`
- Test: `src/tests/timesheet/produtividade.test.ts`

**Interfaces:**
- Consumes: nada (função pura, recebe dados já puxados).
- Produces: `type LinhaProdutividade = { usuarioId: string; nome: string; minutos: number; tarefas: number; obrigacoes: number; carteira: number }`; `type ApontamentoBruto = { usuario_id: string; cliente_id: string | null; minutos: number }`; `function agruparProdutividade(args: { equipe: { id: string; nome: string }[]; apontamentos: ApontamentoBruto[]; tarefasPorResponsavel: Record<string, number>; obrigacoesPorEntregador: Record<string, number> }): LinhaProdutividade[]`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/tests/timesheet/produtividade.test.ts
import { describe, it, expect } from "vitest";
import { agruparProdutividade, type ApontamentoBruto } from "@/lib/timesheet/produtividade";

const equipe = [
  { id: "u1", nome: "Ana" },
  { id: "u2", nome: "Bruno" },
  { id: "u3", nome: "Caio" }, // sem nenhuma atividade
];

describe("agruparProdutividade", () => {
  it("soma minutos por colaborador", () => {
    const apont: ApontamentoBruto[] = [
      { usuario_id: "u1", cliente_id: "c1", minutos: 60 },
      { usuario_id: "u1", cliente_id: "c1", minutos: 30 },
      { usuario_id: "u2", cliente_id: "c2", minutos: 120 },
    ];
    const r = agruparProdutividade({ equipe, apontamentos: apont, tarefasPorResponsavel: {}, obrigacoesPorEntregador: {} });
    expect(r.find((l) => l.usuarioId === "u1")!.minutos).toBe(90);
    expect(r.find((l) => l.usuarioId === "u2")!.minutos).toBe(120);
  });

  it("carteira = clientes distintos, ignora null e não conta duplicado", () => {
    const apont: ApontamentoBruto[] = [
      { usuario_id: "u1", cliente_id: "c1", minutos: 10 },
      { usuario_id: "u1", cliente_id: "c1", minutos: 10 }, // mesmo cliente
      { usuario_id: "u1", cliente_id: "c2", minutos: 10 },
      { usuario_id: "u1", cliente_id: null, minutos: 10 }, // sem cliente
    ];
    const r = agruparProdutividade({ equipe, apontamentos: apont, tarefasPorResponsavel: {}, obrigacoesPorEntregador: {} });
    expect(r.find((l) => l.usuarioId === "u1")!.carteira).toBe(2);
  });

  it("tarefas e obrigações vêm dos Records; ausente = 0", () => {
    const r = agruparProdutividade({
      equipe,
      apontamentos: [],
      tarefasPorResponsavel: { u1: 5 },
      obrigacoesPorEntregador: { u2: 3 },
    });
    expect(r.find((l) => l.usuarioId === "u1")!.tarefas).toBe(5);
    expect(r.find((l) => l.usuarioId === "u1")!.obrigacoes).toBe(0);
    expect(r.find((l) => l.usuarioId === "u2")!.obrigacoes).toBe(3);
  });

  it("membro sem nenhuma atividade aparece com tudo zero", () => {
    const r = agruparProdutividade({ equipe, apontamentos: [], tarefasPorResponsavel: {}, obrigacoesPorEntregador: {} });
    const caio = r.find((l) => l.usuarioId === "u3")!;
    expect(caio).toBeDefined();
    expect([caio.minutos, caio.tarefas, caio.obrigacoes, caio.carteira]).toEqual([0, 0, 0, 0]);
  });

  it("ordena por minutos desc, desempate por nome asc", () => {
    const apont: ApontamentoBruto[] = [
      { usuario_id: "u2", cliente_id: "c1", minutos: 100 },
      { usuario_id: "u1", cliente_id: "c1", minutos: 100 }, // empate com u2 → Ana antes de Bruno
    ];
    const r = agruparProdutividade({ equipe, apontamentos: apont, tarefasPorResponsavel: {}, obrigacoesPorEntregador: {} });
    expect(r.map((l) => l.usuarioId)).toEqual(["u1", "u2", "u3"]);
  });

  it("id fora da equipe (inativo que apontou no passado) não vira linha", () => {
    const apont: ApontamentoBruto[] = [{ usuario_id: "fantasma", cliente_id: "c1", minutos: 50 }];
    const r = agruparProdutividade({ equipe: [{ id: "u1", nome: "Ana" }], apontamentos: apont, tarefasPorResponsavel: {}, obrigacoesPorEntregador: {} });
    expect(r.map((l) => l.usuarioId)).toEqual(["u1"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/timesheet/produtividade.test.ts`
Expected: FAIL — `Cannot find module '@/lib/timesheet/produtividade'`.

- [ ] **Step 3: Implementar a lib**

```ts
// src/lib/timesheet/produtividade.ts
export type LinhaProdutividade = {
  usuarioId: string;
  nome: string;
  minutos: number; // horas apontadas, em minutos
  tarefas: number; // tarefas concluídas no período
  obrigacoes: number; // obrigações entregues no período
  carteira: number; // clientes distintos com hora apontada no período
};

// Apontamento já reduzido ao que a agregação precisa (a action projeta isto do banco).
export type ApontamentoBruto = { usuario_id: string; cliente_id: string | null; minutos: number };

// Universo = `equipe`: toda pessoa ativa vira uma linha, mesmo com tudo zero — ausência de
// produção precisa ser visível, não sumir. Ids fora da equipe (inativo que apontou no
// passado) não geram linha: o relatório não inventa colaborador.
export function agruparProdutividade(args: {
  equipe: { id: string; nome: string }[];
  apontamentos: ApontamentoBruto[];
  tarefasPorResponsavel: Record<string, number>;
  obrigacoesPorEntregador: Record<string, number>;
}): LinhaProdutividade[] {
  const { equipe, apontamentos, tarefasPorResponsavel, obrigacoesPorEntregador } = args;

  const minutosPorUsuario = new Map<string, number>();
  const clientesPorUsuario = new Map<string, Set<string>>();
  for (const a of apontamentos) {
    minutosPorUsuario.set(a.usuario_id, (minutosPorUsuario.get(a.usuario_id) ?? 0) + a.minutos);
    if (a.cliente_id) {
      const set = clientesPorUsuario.get(a.usuario_id) ?? new Set<string>();
      set.add(a.cliente_id);
      clientesPorUsuario.set(a.usuario_id, set);
    }
  }

  const linhas: LinhaProdutividade[] = equipe.map((u) => ({
    usuarioId: u.id,
    nome: u.nome,
    minutos: minutosPorUsuario.get(u.id) ?? 0,
    tarefas: tarefasPorResponsavel[u.id] ?? 0,
    obrigacoes: obrigacoesPorEntregador[u.id] ?? 0,
    carteira: clientesPorUsuario.get(u.id)?.size ?? 0,
  }));

  // Métrica-âncora é hora; desempate estável por nome.
  return linhas.sort((a, b) => b.minutos - a.minutos || a.nome.localeCompare(b.nome));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/timesheet/produtividade.test.ts`
Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf073): lib pura agruparProdutividade + testes"
```

---

### Task 2: Helper `listarEquipe` + action `relatorioProdutividade`

**Files:**
- Modify: `src/lib/clientes/colaboradores.ts` (adicionar `listarEquipe`; não tocar em `listarColaboradores`/`ehColaboradorValido`)
- Create: `src/app/(app)/financeiro/produtividade/actions.ts`

**Interfaces:**
- Consumes: `agruparProdutividade`, `type LinhaProdutividade` (Task 1); `PAPEIS_EQUIPE` de `@/lib/tipos`; `createAdminSupabase`, `getPerfilAtual`.
- Produces: `async function listarEquipe(): Promise<{ id: string; nome: string }[]>`; `async function relatorioProdutividade(de: string, ate: string): Promise<LinhaProdutividade[] | null>`.

- [ ] **Step 1: Adicionar `listarEquipe` ao helper**

Em `src/lib/clientes/colaboradores.ts`, adicionar o import de `PAPEIS_EQUIPE` no topo e a função abaixo (depois de `listarColaboradores`, antes de `ehColaboradorValido`). O `import "server-only"` e `createAdminSupabase` já existem no arquivo.

```ts
import { PAPEIS_EQUIPE } from "@/lib/tipos";

// Equipe COMPLETA e ativa (inclui financeiro, que aponta horas e conclui tarefas) —
// diferente de listarColaboradores, que exclui financeiro por ser lista de "responsável
// por departamento". A RLS de usuarios não permite listar, daí service_role.
export async function listarEquipe(): Promise<{ id: string; nome: string }[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("usuarios")
    .select("id, nome")
    .in("papel", PAPEIS_EQUIPE)
    .eq("ativo", true)
    .order("nome");
  if (error) {
    console.error("Falha ao listar equipe:", error.message);
    return [];
  }
  return data ?? [];
}
```

- [ ] **Step 2: Escrever a action**

```ts
// src/app/(app)/financeiro/produtividade/actions.ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { listarEquipe } from "@/lib/clientes/colaboradores";
import { agruparProdutividade, type LinhaProdutividade } from "@/lib/timesheet/produtividade";

// service_role: precisa listar a equipe (RLS de usuarios não deixa) e ler apontamentos,
// tarefas e obrigações de todo mundo. Gate admin-only: o relatório nomeia cada pessoa.
export async function relatorioProdutividade(de: string, ate: string): Promise<LinhaProdutividade[] | null> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || perfil.papel !== "admin") return null;

  const admin = createAdminSupabase();

  const [apontRes, tarefasRes, obrigRes, equipe] = await Promise.all([
    admin.from("apontamento").select("usuario_id, cliente_id, minutos").gte("data", de).lte("data", ate),
    // concluida_em é timestamptz (as outras datas são date): o fim do dia `ate` precisa
    // do T23:59:59, senão tarefa concluída no próprio dia `ate` fica de fora.
    admin
      .from("tarefa")
      .select("responsavel_id")
      .eq("status", "concluida")
      .gte("concluida_em", de)
      .lte("concluida_em", `${ate}T23:59:59`),
    admin
      .from("obrigacao_instancia")
      .select("entregue_por")
      .not("entregue_por", "is", null)
      .gte("entregue_em", de)
      .lte("entregue_em", ate),
    listarEquipe(),
  ]);

  const tarefasPorResponsavel: Record<string, number> = {};
  for (const t of tarefasRes.data ?? []) {
    const id = t.responsavel_id as string | null;
    if (id) tarefasPorResponsavel[id] = (tarefasPorResponsavel[id] ?? 0) + 1;
  }

  const obrigacoesPorEntregador: Record<string, number> = {};
  for (const o of obrigRes.data ?? []) {
    const id = o.entregue_por as string | null;
    if (id) obrigacoesPorEntregador[id] = (obrigacoesPorEntregador[id] ?? 0) + 1;
  }

  const apontamentos = (apontRes.data ?? []).map((a) => ({
    usuario_id: a.usuario_id as string,
    cliente_id: (a.cliente_id as string | null) ?? null,
    minutos: Number(a.minutos),
  }));

  return agruparProdutividade({ equipe, apontamentos, tarefasPorResponsavel, obrigacoesPorEntregador });
}
```

- [ ] **Step 3: Verificar tipos e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf073): listarEquipe + action relatorioProdutividade"
```

---

### Task 3: Página `/financeiro/produtividade`

**Files:**
- Create: `src/app/(app)/financeiro/produtividade/page.tsx`

**Interfaces:**
- Consumes: `relatorioProdutividade` (Task 2); `formatarHoras` de `@/lib/timesheet/apontamento`; `formatarData` de `@/lib/format`; `RelatorioExportavel` de `@/lib/exportar/tipos`; `BotaoExportar`, `Container`, `PageHeader`, `Voltar`, `controleCls`.
- Produces: rota `/financeiro/produtividade`.

- [ ] **Step 1: Escrever a página**

```tsx
// src/app/(app)/financeiro/produtividade/page.tsx
import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { BotaoExportar } from "@/components/ui/BotaoExportar";
import type { RelatorioExportavel } from "@/lib/exportar/tipos";
import { formatarData } from "@/lib/format";
import { formatarHoras } from "@/lib/timesheet/apontamento";
import { relatorioProdutividade } from "./actions";
import { controleCls } from "@/components/ui/Campo";

export const metadata = { title: "Produtividade por colaborador" };

export default async function ProdutividadePage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");

  const sp = await searchParams;
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const de = sp.de || `${hoje.slice(0, 7)}-01`;
  const ate = sp.ate || hoje;

  const linhas = await relatorioProdutividade(de, ate);
  if (!linhas) redirect("/");

  const totMin = linhas.reduce((s, l) => s + l.minutos, 0);
  const totTarefas = linhas.reduce((s, l) => s + l.tarefas, 0);
  const totObrig = linhas.reduce((s, l) => s + l.obrigacoes, 0);

  // Carteira NÃO soma no rodapé: o mesmo cliente pode ser atendido por duas pessoas, e
  // somar contaria em duplicidade. Fica "—", como % na rentabilidade.
  const relatorio: RelatorioExportavel = {
    titulo: "Produtividade por colaborador",
    subtitulo: `${formatarData(de)} a ${formatarData(ate)}`,
    colunas: [
      { chave: "nome", rotulo: "Colaborador", formato: "texto" },
      { chave: "horas", rotulo: "Horas", formato: "texto" },
      { chave: "tarefas", rotulo: "Tarefas concluídas", formato: "numero" },
      { chave: "obrigacoes", rotulo: "Obrigações entregues", formato: "numero" },
      { chave: "carteira", rotulo: "Carteira", formato: "numero" },
    ],
    linhas: linhas.map((l) => ({
      nome: l.nome,
      horas: formatarHoras(l.minutos),
      tarefas: l.tarefas,
      obrigacoes: l.obrigacoes,
      carteira: l.carteira,
    })),
    totais: {
      nome: "Total",
      horas: formatarHoras(totMin),
      tarefas: totTarefas,
      obrigacoes: totObrig,
      carteira: "—",
    },
  };

  return (
    <Container largura="larga" className="space-y-5 p-4">
      <Voltar href="/financeiro/cadastros" />
      <PageHeader
        titulo="Produtividade por colaborador"
        subtitulo="Horas, tarefas concluídas, obrigações entregues e carteira atendida por pessoa"
      />

      <form
        method="GET"
        className="flex flex-wrap items-end gap-2 rounded-2xl border border-linha bg-white p-3 text-sm"
      >
        <label className="text-xs text-cinza">
          De
          <input type="date" name="de" defaultValue={de} className={`${controleCls("compacto")} mt-0.5 block`} />
        </label>
        <label className="text-xs text-cinza">
          Até
          <input type="date" name="ate" defaultValue={ate} className={`${controleCls("compacto")} mt-0.5 block`} />
        </label>
        <button className="rounded-lg bg-verde px-3 py-1.5 text-white">Aplicar</button>
        <div className="ml-auto print:hidden">
          <BotaoExportar relatorio={relatorio} />
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-xs text-cinza">
              <th className="px-3 py-2 text-left font-medium">Colaborador</th>
              <th className="px-3 py-2 text-right font-medium">Horas</th>
              <th className="px-3 py-2 text-right font-medium">Tarefas</th>
              <th className="px-3 py-2 text-right font-medium">Obrigações</th>
              <th className="px-3 py-2 text-right font-medium">Carteira</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.usuarioId} className="border-b border-linha/60 hover:bg-creme">
                <td className="px-3 py-2 text-texto">{l.nome}</td>
                <td className="px-3 py-2 text-right text-cinza">{formatarHoras(l.minutos)}</td>
                <td className="px-3 py-2 text-right text-texto">{l.tarefas}</td>
                <td className="px-3 py-2 text-right text-texto">{l.obrigacoes}</td>
                <td className="px-3 py-2 text-right text-cinza">{l.carteira}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-linha bg-creme text-sm font-medium">
              <td className="px-3 py-2 text-texto">Total</td>
              <td className="px-3 py-2 text-right text-texto">{formatarHoras(totMin)}</td>
              <td className="px-3 py-2 text-right text-texto">{totTarefas}</td>
              <td className="px-3 py-2 text-right text-texto">{totObrig}</td>
              <td className="px-3 py-2 text-right text-cinza">—</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-cinza">
        <strong>Horas</strong> = tempo apontado no período. <strong>Tarefas</strong> = concluídas no período (por
        responsável). <strong>Obrigações</strong> = baixadas no período (por quem entregou). <strong>Carteira</strong> ={" "}
        clientes distintos com hora apontada. Toda a equipe ativa aparece — zero significa nada apontado/concluído no
        período. Ordenado por horas.
      </p>
    </Container>
  );
}
```

- [ ] **Step 2: Verificar tipos, lint e guards de UI**

Run: `npm run typecheck && npm run lint`
Expected: sem erros (incl. guards `divida-ui` e `rotas-alcancaveis` — a rota fica alcançável pelo link do hub na Task 4).

- [ ] **Step 3: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf073): pagina /financeiro/produtividade"
```

---

### Task 4: Link no hub `/financeiro/cadastros` (admin-only)

**Files:**
- Modify: `src/app/(app)/financeiro/cadastros/page.tsx`

**Interfaces:**
- Consumes: rota criada na Task 3; `perfil.papel` (a página já lê `perfil` no gate).
- Produces: item "Produtividade por colaborador" no hub, visível só para admin.

- [ ] **Step 1: Marcar o item como admin-only e filtrar**

Em `src/app/(app)/financeiro/cadastros/page.tsx`, adicionar o item logo após "Rentabilidade por cliente" no array `ITENS`, com a flag `adminOnly`:

```ts
  { href: "/financeiro/rentabilidade", label: "Rentabilidade por cliente" },
  { href: "/financeiro/produtividade", label: "Produtividade por colaborador", adminOnly: true },
```

- [ ] **Step 2: Filtrar `ITENS` por papel na renderização**

Ainda em `cadastros/page.tsx`, dentro do componente (após o gate `if (!perfil ...) redirect("/")`), derivar a lista visível e mapear sobre ela em vez de `ITENS`:

```tsx
  const itens = ITENS.filter((i) => !("adminOnly" in i && i.adminOnly) || perfil.papel === "admin");
```

Trocar `{ITENS.map((i) => (` por `{itens.map((i) => (`.

- [ ] **Step 3: Verificar tipos, lint e rotas alcançáveis**

Run: `npm run typecheck && npm run lint`
Expected: sem erros. `rotas-alcancaveis` passa porque a rota agora tem link de origem.

- [ ] **Step 4: Suite completa + build**

Run: `npm test && npm run build`
Expected: todos os testes passam (incl. `produtividade.test.ts`); build conclui.

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf073): link Produtividade no hub financeiro (admin-only)"
```

---

## Self-Review

- **Cobertura da spec:** lib pura + testes (Task 1) ✓; `listarEquipe` com `PAPEIS_EQUIPE` + action com gate admin e recorte `T23:59:59` (Task 2) ✓; página com filtro de período, tabela, export e totais com carteira "—" (Task 3) ✓; link no hub admin-only (Task 4) ✓. Sem migration (colunas já existem) ✓.
- **Placeholders:** nenhum — todo passo traz código/comando completo.
- **Consistência de tipos:** `LinhaProdutividade`/`ApontamentoBruto`/`agruparProdutividade` definidos na Task 1 e consumidos com a mesma assinatura na Task 2; a página consome o retorno `LinhaProdutividade[]` da action. `listarEquipe` retorna `{ id, nome }[]`, exatamente a forma que `agruparProdutividade` espera em `equipe`.
- **Fora de escopo respeitado:** nenhum custo salarial por pessoa, sem gráfico, sem drill-down, sem agrupamento por departamento.
