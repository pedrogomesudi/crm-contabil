# RF-061 (busca por metadados) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** uma página central `/documentos` para buscar documentos por nome + tipo + departamento + competência + cliente, RLS-escopada, mostrando só as versões atuais.

**Architecture:** lógica pura `lerFiltroBusca` (searchParams → filtro + intervalo do mês); action `buscarDocumentos` (query RLS + `agruparVersoes`); página server com `<form method="get">` + tabela de resultados; item de menu.

**Tech Stack:** Next 16 (App Router, server component + searchParams), TypeScript, Tailwind 4, Supabase (RLS), vitest. **Sem migration.**

## Global Constraints

- Next 16: imports `@/*`; `middleware.ts` é `proxy.ts`.
- RBAC: papel só via `auth_papel()`.
- Guard `divida-ui`: controles sem `border` à mão → `controleCls` (`@/components/ui/Campo`).
- Guard `rotas-alcancaveis`: uma rota nova precisa estar **alcançável pelo menu** (`menuDoPapel` em `src/lib/ui/navegacao.ts`) — adicionar `/documentos` lá cobre o guard (não precisa de `POR_SUBNAV`).
- Reusos: `escapeLike` (`@/lib/clientes/busca`), `competenciaParaData`/`competenciaRotulo` (`@/lib/documentos/taxonomia`), `agruparVersoes` (`@/lib/documentos/versoes`), `carregarTiposAtivos` (`@/app/(app)/configuracoes/tipos-documento/actions`), `rotuloDepartamento`/`DEPARTAMENTOS` (`@/lib/clientes/departamentos`), `BotaoBaixar` (`@/components/documentos/BotaoBaixar`).
- Rodar antes de entregar: `lint`, `typecheck`, `test`, `format`, `build`. PR `develop`→`main`; tag após deploy; versão+CHANGELOG no mesmo PR. **Sem migration.**

---

### Task 1: Lógica pura — `lerFiltroBusca`

**Files:**
- Create: `src/lib/documentos/busca-metadados.ts`
- Test: `src/tests/documentos/busca-metadados.test.ts`

**Interfaces:**
- Produces:
  - `type FiltroResolvido = { nome?: string; tipoId?: string; departamento?: string; clienteId?: string; competencia?: string; compInicio?: string; compFim?: string }`
  - `lerFiltroBusca(sp: Record<string, string | undefined>): FiltroResolvido`

- [ ] **Step 1: Escrever os testes (falham)**

```ts
import { describe, it, expect } from "vitest";
import { lerFiltroBusca } from "@/lib/documentos/busca-metadados";

describe("lerFiltroBusca", () => {
  it("competência vira o intervalo do mês", () => {
    const f = lerFiltroBusca({ competencia: "2026-07" });
    expect(f.compInicio).toBe("2026-07-01");
    expect(f.compFim).toBe("2026-08-01");
  });
  it("dezembro vira janeiro do ano seguinte", () => {
    const f = lerFiltroBusca({ competencia: "2026-12" });
    expect(f.compInicio).toBe("2026-12-01");
    expect(f.compFim).toBe("2027-01-01");
  });
  it("competência inválida é omitida", () => {
    expect(lerFiltroBusca({ competencia: "2026-13" }).compInicio).toBeUndefined();
    expect(lerFiltroBusca({ competencia: "xx" }).competencia).toBeUndefined();
  });
  it("nome é preservado (trim) e vazios são omitidos", () => {
    const f = lerFiltroBusca({ nome: "  guia ", tipo: "", departamento: "fiscal" });
    expect(f.nome).toBe("guia");
    expect(f.tipoId).toBeUndefined();
    expect(f.departamento).toBe("fiscal");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npx vitest run src/tests/documentos/busca-metadados.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
import { competenciaParaData } from "./taxonomia";

export type FiltroResolvido = {
  nome?: string;
  tipoId?: string;
  departamento?: string;
  clienteId?: string;
  competencia?: string;
  compInicio?: string;
  compFim?: string;
};

// "2026-12" -> "2027-01-01"; "2026-07" -> "2026-08-01".
function primeiroDiaMesSeguinte(aaaaMM: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(aaaaMM);
  if (!m) return null;
  let ano = Number(m[1]);
  let mes = Number(m[2]) + 1;
  if (mes > 12) {
    mes = 1;
    ano += 1;
  }
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}

export function lerFiltroBusca(sp: Record<string, string | undefined>): FiltroResolvido {
  const nome = (sp.nome ?? "").trim().slice(0, 100) || undefined;
  const tipoId = (sp.tipo ?? "").trim() || undefined;
  const departamento = (sp.departamento ?? "").trim() || undefined;
  const clienteId = (sp.cliente ?? "").trim() || undefined;
  const competencia = /^\d{4}-\d{2}$/.test(sp.competencia ?? "") ? sp.competencia : undefined;
  const compInicio = competencia ? (competenciaParaData(competencia) ?? undefined) : undefined;
  const compFim = competencia ? (primeiroDiaMesSeguinte(competencia) ?? undefined) : undefined;
  return { nome, tipoId, departamento, clienteId, competencia, compInicio, compFim };
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npx vitest run src/tests/documentos/busca-metadados.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/documentos/busca-metadados.ts src/tests/documentos/busca-metadados.test.ts
git commit -m "feat(rf061): lerFiltroBusca (searchParams -> filtro + intervalo do mes)"
```

---

### Task 2: Action `buscarDocumentos`

**Files:**
- Modify: `src/app/(app)/documentos/actions.ts`

**Interfaces:**
- Consumes: `FiltroResolvido` (T1), `escapeLike`, `agruparVersoes`.
- Produces:
  - `type DocBusca = { id: string; nome: string; clienteId: string; clienteNome: string; tipo: string | null; departamento: string | null; competencia: string | null; enviado_em: string }`
  - `buscarDocumentos(f: FiltroResolvido): Promise<DocBusca[]>`

- [ ] **Step 1: Implementar** (novo bloco em `documentos/actions.ts`; imports no topo)

```ts
import { escapeLike } from "@/lib/clientes/busca";
import { agruparVersoes } from "@/lib/documentos/versoes";
import type { FiltroResolvido } from "@/lib/documentos/busca-metadados";

export type DocBusca = {
  id: string;
  nome: string;
  clienteId: string;
  clienteNome: string;
  tipo: string | null;
  departamento: string | null;
  competencia: string | null;
  enviado_em: string;
};

export async function buscarDocumentos(f: FiltroResolvido): Promise<DocBusca[]> {
  const supabase = await createServerSupabase();
  let q = supabase
    .from("documentos")
    .select("id, nome, tipo, departamento, competencia, enviado_em, substitui_id, cliente_id, clientes(razao_social)")
    .order("enviado_em", { ascending: false })
    .limit(100);
  if (f.nome) q = q.ilike("nome", `%${escapeLike(f.nome)}%`);
  if (f.tipoId) q = q.eq("tipo_id", f.tipoId);
  if (f.departamento) q = q.eq("departamento", f.departamento);
  if (f.clienteId) q = q.eq("cliente_id", f.clienteId);
  if (f.compInicio) q = q.gte("competencia", f.compInicio);
  if (f.compFim) q = q.lt("competencia", f.compFim);
  const { data } = await q;

  const linhas = (data ?? []).map((d) => {
    const cli = d.clientes as unknown as { razao_social: string } | null;
    return {
      id: d.id as string,
      nome: d.nome as string,
      substitui_id: (d.substitui_id as string | null) ?? null,
      clienteId: d.cliente_id as string,
      clienteNome: cli?.razao_social ?? "—",
      tipo: (d.tipo as string | null) ?? null,
      departamento: (d.departamento as string | null) ?? null,
      competencia: (d.competencia as string | null) ?? null,
      enviado_em: d.enviado_em as string,
    };
  });
  // Só versões atuais entre os resultados (versões substituídas herdam a taxonomia, então
  // ambas aparecem quando o filtro casa — agruparVersoes mantém só a atual).
  return agruparVersoes(linhas).map((g) => {
    const { substitui_id, ...rest } = g.atual;
    void substitui_id;
    return rest;
  });
}
```

- [ ] **Step 2: Typecheck** — Run: `npm run typecheck` — Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/documentos/actions.ts"
git commit -m "feat(rf061): buscarDocumentos (filtros RLS + so versoes atuais)"
```

---

### Task 3: Página `/documentos` + tabela + item de menu

**Files:**
- Create: `src/components/documentos/TabelaResultadosBusca.tsx`
- Create: `src/app/(app)/documentos/page.tsx`
- Modify: `src/lib/ui/navegacao.ts` (item "Documentos" no menu)
- Test: `src/tests/documentos/tabela-resultados-busca.test.tsx`

**Interfaces:**
- Consumes: `DocBusca` (T2), `BotaoBaixar`, `competenciaRotulo`, `rotuloDepartamento`.

- [ ] **Step 1: Render test da tabela (falha)**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/components/documentos/BotaoBaixar", () => ({ BotaoBaixar: () => null }));
import { renderToStaticMarkup } from "react-dom/server";
import { TabelaResultadosBusca } from "@/components/documentos/TabelaResultadosBusca";

const doc = {
  id: "d1", nome: "guia.pdf", clienteId: "c1", clienteNome: "Padaria X",
  tipo: "Guia", departamento: "fiscal", competencia: "2026-07-01", enviado_em: "2026-07-19T00:00:00Z",
};

describe("TabelaResultadosBusca", () => {
  it("mostra nome, cliente e competência", () => {
    const html = renderToStaticMarkup(<TabelaResultadosBusca docs={[doc]} />);
    expect(html).toContain("guia.pdf");
    expect(html).toContain("Padaria X");
    expect(html).toContain("07/2026");
    expect(html).toContain("Fiscal");
  });
  it("estado vazio", () => {
    const html = renderToStaticMarkup(<TabelaResultadosBusca docs={[]} />);
    expect(html).toContain("Nenhum documento");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npx vitest run src/tests/documentos/tabela-resultados-busca.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implementar `TabelaResultadosBusca`** (server-safe/presentational)

```tsx
import Link from "next/link";
import { formatarData } from "@/lib/format";
import { rotuloDepartamento, type Departamento } from "@/lib/clientes/departamentos";
import { competenciaRotulo } from "@/lib/documentos/taxonomia";
import { BotaoBaixar } from "./BotaoBaixar";
import type { DocBusca } from "@/app/(app)/documentos/actions";

export function TabelaResultadosBusca({ docs }: { docs: DocBusca[] }) {
  if (docs.length === 0) return <p className="text-sm text-cinza-claro">Nenhum documento encontrado.</p>;
  return (
    <div className="overflow-hidden rounded border border-linha">
      <table className="w-full text-sm">
        <thead className="bg-creme text-left text-cinza">
          <tr>
            <th className="p-2 font-medium">Nome</th>
            <th className="p-2 font-medium">Cliente</th>
            <th className="p-2 font-medium">Tipo</th>
            <th className="p-2 font-medium">Departamento</th>
            <th className="p-2 font-medium">Competência</th>
            <th className="p-2 font-medium">Enviado em</th>
            <th className="p-2 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="border-t border-linha/70">
              <td className="p-2 text-texto">{d.nome}</td>
              <td className="p-2">
                <Link href={`/clientes/${d.clienteId}?aba=documentos`} className="underline">{d.clienteNome}</Link>
              </td>
              <td className="p-2 text-cinza">{d.tipo ?? "—"}</td>
              <td className="p-2 text-cinza">{d.departamento ? rotuloDepartamento(d.departamento as Departamento) : "—"}</td>
              <td className="p-2 text-cinza">{competenciaRotulo(d.competencia)}</td>
              <td className="p-2 text-cinza"><time dateTime={d.enviado_em}>{formatarData(d.enviado_em)}</time></td>
              <td className="p-2"><BotaoBaixar documentoId={d.id} nome={d.nome} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npx vitest run src/tests/documentos/tabela-resultados-busca.test.tsx` — Expected: PASS.

- [ ] **Step 5: Página `/documentos/page.tsx`** (server; `<form method="get">` para os filtros)

```tsx
import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { controleCls } from "@/components/ui/Campo";
import { DEPARTAMENTOS } from "@/lib/clientes/departamentos";
import { carregarTiposAtivos } from "@/app/(app)/configuracoes/tipos-documento/actions";
import { lerFiltroBusca } from "@/lib/documentos/busca-metadados";
import { buscarDocumentos } from "./actions";
import { TabelaResultadosBusca } from "@/components/documentos/TabelaResultadosBusca";

export const metadata = { title: "Documentos" };
const EQUIPE = ["admin", "assistente", "contador", "financeiro"];

export default async function DocumentosBuscaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const perfil = await getPerfilAtual();
  if (!perfil || !EQUIPE.includes(perfil.papel)) redirect("/");
  const sp = await searchParams;
  const filtro = lerFiltroBusca(sp);

  const supabase = await createServerSupabase();
  const [{ data: clientes }, tipos, docs] = await Promise.all([
    supabase.from("clientes").select("id, razao_social").is("excluido_em", null).order("razao_social").limit(500),
    carregarTiposAtivos(),
    buscarDocumentos(filtro),
  ]);

  return (
    <Container className="space-y-5 p-4">
      <PageHeader titulo="Documentos" subtitulo="Busca por nome, tipo, departamento, competência e cliente" />
      <form method="get" className="flex flex-wrap items-end gap-2">
        <input name="nome" defaultValue={filtro.nome ?? ""} placeholder="nome do arquivo" className={controleCls("compacto")} />
        <select name="tipo" defaultValue={filtro.tipoId ?? ""} className={controleCls("compacto")}>
          <option value="">todos os tipos</option>
          {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
        <select name="departamento" defaultValue={filtro.departamento ?? ""} className={controleCls("compacto")}>
          <option value="">todos os departamentos</option>
          {DEPARTAMENTOS.map((d) => <option key={d.valor} value={d.valor}>{d.rotulo}</option>)}
        </select>
        <input type="month" name="competencia" defaultValue={filtro.competencia ?? ""} className={controleCls("compacto")} />
        <select name="cliente" defaultValue={filtro.clienteId ?? ""} className={controleCls("compacto")}>
          <option value="">todos os clientes</option>
          {(clientes ?? []).map((c) => <option key={c.id as string} value={c.id as string}>{c.razao_social as string}</option>)}
        </select>
        <button type="submit" className="rounded-lg bg-verde px-4 py-2 text-sm font-medium text-white hover:brightness-105">Buscar</button>
      </form>
      <TabelaResultadosBusca docs={docs} />
    </Container>
  );
}
```

- [ ] **Step 6: Item de menu** — em `src/lib/ui/navegacao.ts`, no grupo que tem `"/clientes"`/`"/obrigacoes"`, adicionar (para a equipe) o item de Documentos. Ex.: logo após `{ href: "/clientes", label: "Clientes" }`:

```ts
        { href: "/documentos", label: "Documentos" },
```
(se o grupo for gated por `equipe`, o item herda; senão, condicionar a `["admin","assistente","contador","financeiro"].includes(papel)` conforme o padrão local.)

- [ ] **Step 7: Verificar** — Run: `npm run typecheck && npx vitest run src/tests/documentos/ src/tests/ui/rotas-alcancaveis.test.ts src/tests/ui/divida-ui.test.ts` — Expected: PASS (a rota `/documentos` fica alcançável pelo menu).

- [ ] **Step 8: Commit**

```bash
git add src/components/documentos/TabelaResultadosBusca.tsx "src/app/(app)/documentos/page.tsx" src/lib/ui/navegacao.ts src/tests/documentos/tabela-resultados-busca.test.tsx
git commit -m "feat(rf061): pagina de busca de documentos + item de menu"
```

---

### Task 4: Release

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm test && npm run format && npm run build` — tudo verde.
- [ ] **Step 2:** bump de versão (minor) + CHANGELOG (mesmo PR).
- [ ] **Step 3:** **sem migration** — nada a aplicar no banco.
- [ ] **Step 4:** REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch (PR, merge, Implantar, `/api/health`, tag).

---

## Self-Review

- **Cobertura da spec:** `lerFiltroBusca` (T1), `buscarDocumentos` RLS + versões atuais (T2), página `/documentos` com filtros + tabela + link para o cliente + baixar, item de menu (T3), release sem migration (T4). Fora de escopo respeitado (sem full-text/OCR/trigram).
- **Placeholders:** nenhum passo de código sem código; o passo do menu (T3 step 6) referencia o grupo real de `navegacao.ts` — inserir conforme o gate `equipe` já existente.
- **Consistência de tipos:** `FiltroResolvido` (T1) consumido por `buscarDocumentos` (T2); `DocBusca` (T2) consumido por `TabelaResultadosBusca` (T3); reusos de `competenciaRotulo`/`rotuloDepartamento`/`agruparVersoes`/`escapeLike` conferem com as assinaturas existentes.
