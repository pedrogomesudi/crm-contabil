# RF-062 (retenção por tipo + alertas de expurgo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** retenção por tipo de documento + tela de revisão dos vencidos com expurgo manual + badge no menu. Sem apagar automático.

**Architecture:** `tipo_documento.retencao_meses` + view `documento_retencao` (`security_invoker`) que calcula `vence_em`; badge (count) no menu; tela `/documentos/retencao` (admin) lista vencidos e expurga reusando `excluirDocumento`.

**Tech Stack:** Next 16 (App Router, server actions), TypeScript, Tailwind 4, Supabase (Postgres/RLS/view), vitest.

## Global Constraints

- Next 16: imports `@/*`; `middleware.ts` é `proxy.ts`.
- RBAC: papel só via `auth_papel()`.
- Migrations: runner `npm run db:migrate`; imutáveis após aplicadas; idempotentes; numerar após `0113`. View: `create or replace view` (idempotente).
- Guard `divida-ui`: controles sem `border` à mão → `controleCls`.
- Guard `rotas-alcancaveis`: `/documentos/retencao` precisa ser alcançável — está sob `/documentos` (no menu) e abre por link/banner; registrar em `POR_ACAO` **ou** garantir alcance por menu. (Ver Task 4, step do guard.)
- Reusos: `dentroDaRetencao` (`@/lib/lgpd/retencao`) — referência; `excluirDocumento`/`BotaoBaixar`; `competenciaRotulo`/`rotuloDepartamento`; padrão de badge (`layout.tsx` → `Sidebar` → `menuDoPapel`, tipo `Badges` em `@/lib/ui/navegacao`).
- Rodar antes de entregar: `lint`, `typecheck`, `test`, `format`, `build`. PR `develop`→`main`; tag após deploy; versão+CHANGELOG no mesmo PR.

---

### Task 1: Migration 0114 — retenção por tipo + view `documento_retencao`

**Files:**
- Create: `supabase/migrations/0114_retencao_documentos.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- RF-062: retenção por tipo + view de vencimento de retenção.
alter table tipo_documento add column if not exists retencao_meses int;  -- null = usa o global

-- Calcula quando cada documento "vence" a retenção. security_invoker => respeita a RLS de documentos/clientes.
create or replace view documento_retencao with (security_invoker = true) as
select
  d.id, d.cliente_id, cl.razao_social as cliente_nome, d.nome, d.tipo, d.tipo_id,
  d.competencia, d.enviado_em, d.substitui_id,
  coalesce(td.retencao_meses, ec.retencao_meses) as meses_retencao,
  (coalesce(d.competencia, d.enviado_em::date)
     + (coalesce(td.retencao_meses, ec.retencao_meses) || ' months')::interval)::date as vence_em
from documentos d
left join tipo_documento td on td.id = d.tipo_id
left join clientes cl on cl.id = d.cliente_id
cross join (select retencao_meses from escritorio_config where id = 1) ec;
```

- [ ] **Step 2: Conferir idempotência** (`add column if not exists`, `create or replace view`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0114_retencao_documentos.sql
git commit -m "feat(rf062): migration 0114 retencao por tipo + view documento_retencao"
```

> Aplicada em produção no release, antes de Implantar.

---

### Task 2: Lógica pura — retenção (config)

**Files:**
- Create: `src/lib/documentos/retencao.ts`
- Test: `src/tests/documentos/retencao.test.ts`

**Interfaces:**
- Produces:
  - `mesesEfetivos(tipoMeses: number | null, global: number): number`
  - `descreverRetencao(tipoMeses: number | null, global: number): string`

- [ ] **Step 1: Escrever os testes (falham)**

```ts
import { describe, it, expect } from "vitest";
import { mesesEfetivos, descreverRetencao } from "@/lib/documentos/retencao";

describe("mesesEfetivos", () => {
  it("o tipo vence o global", () => expect(mesesEfetivos(24, 60)).toBe(24));
  it("null cai no global", () => expect(mesesEfetivos(null, 60)).toBe(60));
});

describe("descreverRetencao", () => {
  it("com prazo do tipo", () => expect(descreverRetencao(24, 60)).toBe("24 meses"));
  it("sem prazo do tipo usa o global (padrão)", () => expect(descreverRetencao(null, 60)).toBe("60 meses (padrão)"));
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npx vitest run src/tests/documentos/retencao.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
export function mesesEfetivos(tipoMeses: number | null, global: number): number {
  return tipoMeses ?? global;
}

export function descreverRetencao(tipoMeses: number | null, global: number): string {
  return tipoMeses != null ? `${tipoMeses} meses` : `${global} meses (padrão)`;
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npx vitest run src/tests/documentos/retencao.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/documentos/retencao.ts src/tests/documentos/retencao.test.ts
git commit -m "feat(rf062): logica pura de retencao (mesesEfetivos + descreverRetencao)"
```

---

### Task 3: Retenção por tipo na config

**Files:**
- Modify: `src/app/(app)/configuracoes/tipos-documento/actions.ts` (retorna `retencaoMeses`; `criarTipoDoc` lê retenção; nova `definirRetencaoTipo`)
- Modify: `src/app/(app)/configuracoes/tipos-documento/TiposDocumentoLista.tsx` (campo retenção por linha + no criar)
- Modify: `src/app/(app)/configuracoes/tipos-documento/page.tsx` (carrega o global e passa)

**Interfaces:**
- `TipoDocRow` ganha `retencaoMeses: number | null`.
- Produces: `definirRetencaoTipo(id: string, meses: number | null): Promise<{ erro?: string }>`.

- [ ] **Step 1: Actions**

Em `actions.ts`:
- `listarTiposDocumento`/`TipoDocRow`: incluir `retencao_meses` no `select` e mapear `retencaoMeses: (r.retencao_meses as number | null) ?? null`.
- `criarTipoDoc`: ler `const retStr = String(fd.get("retencao") ?? "").trim(); const retencao_meses = retStr ? Math.max(0, parseInt(retStr, 10)) || null : null;` e incluir no `insert`.
- Nova action:

```ts
export async function definirRetencaoTipo(id: string, meses: number | null): Promise<{ erro?: string }> {
  const supabase = await createServerSupabase();
  const valor = meses != null && Number.isFinite(meses) && meses >= 0 ? Math.floor(meses) : null;
  const { error } = await supabase.from("tipo_documento").update({ retencao_meses: valor }).eq("id", id);
  if (error) return { erro: "Não foi possível salvar a retenção (sem permissão?)." };
  rev();
  return {};
}
```

- [ ] **Step 2: UI — retenção por linha + no criar**

Em `TiposDocumentoLista.tsx` (recebe `global: number` como prop nova; importar `descreverRetencao`):
- Em cada `<li>`, após o departamento, um input numérico de retenção (`placeholder={`${global} (padrão)`}`, `defaultValue={t.retencaoMeses ?? ""}`) que no `onBlur` chama `run(() => definirRetencaoTipo(t.id, e.target.value === "" ? null : Number(e.target.value)))`. Via `controleCls("compacto")` + `w-24`.
- No `<form>` de criar, adicionar `<input name="retencao" type="number" min="0" placeholder="retenção (meses)" className={controleCls("compacto")} />`.

- [ ] **Step 3: page.tsx passa o global**

Em `page.tsx`: carregar `const { data: cfg } = await supabase.from("escritorio_config").select("retencao_meses").eq("id", 1).maybeSingle();` e passar `global={(cfg?.retencao_meses as number | null) ?? 60}` ao `<TiposDocumentoLista>`.

- [ ] **Step 4: Verificar** — Run: `npm run typecheck && npx vitest run src/tests/configuracoes/ src/tests/ui/divida-ui.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/configuracoes/tipos-documento"
git commit -m "feat(rf062): retencao por tipo na config (campo + action)"
```

---

### Task 4: Tela de vencidos + expurgo + badge + banner

**Files:**
- Modify: `src/app/(app)/documentos/actions.ts` (`listarVencidos`, `contarDocsVencidos`)
- Create: `src/components/documentos/BotaoExpurgar.tsx`
- Create: `src/components/documentos/TabelaRetencao.tsx`
- Create: `src/app/(app)/documentos/retencao/page.tsx`
- Modify: `src/lib/ui/navegacao.ts` (`Badges` ganha `docsVencidos`; badge no item Documentos)
- Modify: `src/app/(app)/layout.tsx` (computa `docsVencidos` para admin)
- Modify: `src/app/(app)/documentos/page.tsx` (banner "N vencidos" p/ admin)
- Modify: `src/tests/ui/rotas-alcancaveis.test.ts` (registrar `/documentos/retencao` em `POR_ACAO`)
- Test: `src/tests/documentos/tabela-retencao.test.tsx`

**Interfaces:**
- Produces:
  - `type DocVencido = { id: string; nome: string; clienteId: string; clienteNome: string; tipo: string | null; competencia: string | null; venceEm: string }`
  - `listarVencidos(): Promise<DocVencido[]>`
  - `contarDocsVencidos(): Promise<number>`

- [ ] **Step 1: Actions de vencidos**

Em `documentos/actions.ts`:

```ts
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export type DocVencido = {
  id: string; nome: string; clienteId: string; clienteNome: string;
  tipo: string | null; competencia: string | null; venceEm: string;
};

export async function listarVencidos(): Promise<DocVencido[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("documento_retencao")
    .select("id, nome, cliente_id, cliente_nome, tipo, competencia, vence_em")
    .lt("vence_em", hojeSP())
    .order("vence_em", { ascending: true })
    .limit(100);
  return (data ?? []).map((d) => ({
    id: d.id as string,
    nome: d.nome as string,
    clienteId: d.cliente_id as string,
    clienteNome: (d.cliente_nome as string | null) ?? "—",
    tipo: (d.tipo as string | null) ?? null,
    competencia: (d.competencia as string | null) ?? null,
    venceEm: d.vence_em as string,
  }));
}

export async function contarDocsVencidos(): Promise<number> {
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("documento_retencao")
    .select("id", { count: "exact", head: true })
    .lt("vence_em", hojeSP());
  return count ?? 0;
}
```

- [ ] **Step 2: `BotaoExpurgar` (confirm + excluir + refresh)**

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { excluirDocumento } from "@/app/(app)/documentos/actions";

export function BotaoExpurgar({ documentoId, clienteId, nome }: { documentoId: string; clienteId: string; nome: string }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  function expurgar() {
    if (!window.confirm(`Expurgar (excluir) “${nome}”? Esta ação não pode ser desfeita.`)) return;
    setErro(null);
    start(async () => {
      const r = await excluirDocumento(documentoId, clienteId);
      if (r.erro) setErro(r.erro);
      else router.refresh();
    });
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={expurgar} disabled={pend} className="text-negativo underline disabled:opacity-60">
        Expurgar
      </button>
      {erro && <span className="text-xs text-negativo">{erro}</span>}
    </span>
  );
}
```

- [ ] **Step 3: Render test da tabela (falha)**

`src/tests/documentos/tabela-retencao.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/components/documentos/BotaoBaixar", () => ({ BotaoBaixar: () => null }));
vi.mock("@/components/documentos/BotaoExpurgar", () => ({ BotaoExpurgar: () => null }));
import { renderToStaticMarkup } from "react-dom/server";
import { TabelaRetencao } from "@/components/documentos/TabelaRetencao";

const d = { id: "d1", nome: "guia.pdf", clienteId: "c1", clienteNome: "Padaria X", tipo: "Guia", competencia: "2019-07-01", venceEm: "2024-07-01" };

describe("TabelaRetencao", () => {
  it("mostra o vencido com vence_em", () => {
    const html = renderToStaticMarkup(<TabelaRetencao docs={[d]} />);
    expect(html).toContain("guia.pdf");
    expect(html).toContain("Padaria X");
    expect(html).toContain("Vence"); // cabeçalho
  });
  it("vazio", () => {
    expect(renderToStaticMarkup(<TabelaRetencao docs={[]} />)).toContain("Nenhum documento vencido");
  });
});
```

- [ ] **Step 4: Rodar e ver falhar** — Run: `npx vitest run src/tests/documentos/tabela-retencao.test.tsx` — Expected: FAIL.

- [ ] **Step 5: `TabelaRetencao`**

```tsx
import Link from "next/link";
import { formatarData } from "@/lib/format";
import { competenciaRotulo } from "@/lib/documentos/taxonomia";
import { BotaoBaixar } from "./BotaoBaixar";
import { BotaoExpurgar } from "./BotaoExpurgar";
import type { DocVencido } from "@/app/(app)/documentos/actions";

export function TabelaRetencao({ docs }: { docs: DocVencido[] }) {
  if (docs.length === 0) return <p className="text-sm text-cinza-claro">Nenhum documento vencido.</p>;
  return (
    <div className="overflow-hidden rounded border border-linha">
      <table className="w-full text-sm">
        <thead className="bg-creme text-left text-cinza">
          <tr>
            <th className="p-2 font-medium">Nome</th>
            <th className="p-2 font-medium">Cliente</th>
            <th className="p-2 font-medium">Tipo</th>
            <th className="p-2 font-medium">Competência</th>
            <th className="p-2 font-medium">Vence em</th>
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
              <td className="p-2 text-cinza">{competenciaRotulo(d.competencia)}</td>
              <td className="p-2 text-negativo"><time dateTime={d.venceEm}>{formatarData(d.venceEm)}</time></td>
              <td className="p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <BotaoBaixar documentoId={d.id} nome={d.nome} />
                  <BotaoExpurgar documentoId={d.id} clienteId={d.clienteId} nome={d.nome} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 6: Rodar e ver passar** — Run: `npx vitest run src/tests/documentos/tabela-retencao.test.tsx` — Expected: PASS.

- [ ] **Step 7: Página `/documentos/retencao` (admin)**

```tsx
import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { listarVencidos } from "../actions";
import { TabelaRetencao } from "@/components/documentos/TabelaRetencao";

export const metadata = { title: "Retenção de documentos" };

export default async function RetencaoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/documentos");
  const docs = await listarVencidos();
  return (
    <Container className="space-y-5 p-4">
      <Voltar href="/documentos" label="Documentos" />
      <PageHeader titulo="Retenção — documentos vencidos" subtitulo="Revise e expurgue os documentos que passaram do prazo de retenção" />
      <TabelaRetencao docs={docs} />
    </Container>
  );
}
```

- [ ] **Step 8: Badge no menu**

- Em `src/lib/ui/navegacao.ts`: `type Badges` ganha `docsVencidos: number`; no item `{ href: "/documentos", label: "Documentos" }`, adicionar `badge: badges.docsVencidos`.
- Em `src/app/(app)/layout.tsx`: `const docsVencidos = perfil.papel === "admin" ? await contarDocsVencidos() : 0;` (import de `contarDocsVencidos`) e incluir `docsVencidos` no objeto `badges` passado ao `<Sidebar>`.

- [ ] **Step 9: Banner em `/documentos`**

Em `src/app/(app)/documentos/page.tsx`: para admin, `const vencidos = perfil.papel === "admin" ? await contarDocsVencidos() : 0;` e, se `vencidos > 0`, renderizar acima do form um aviso com link:

```tsx
{perfil.papel === "admin" && vencidos > 0 && (
  <Link href="/documentos/retencao" className="block rounded-lg border border-linha bg-creme px-3 py-2 text-sm text-texto underline">
    {vencidos} documento(s) vencido(s) na retenção — revisar
  </Link>
)}
```
(import de `contarDocsVencidos` e `Link`.)

- [ ] **Step 10: Guard de rotas** — em `src/tests/ui/rotas-alcancaveis.test.ts`, adicionar `"/documentos/retencao"` ao array `POR_ACAO` (abre por link/banner, não por item de menu próprio).

- [ ] **Step 11: Verificar** — Run: `npm run typecheck && npx vitest run src/tests/documentos/ src/tests/ui/rotas-alcancaveis.test.ts src/tests/ui/divida-ui.test.ts` — Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add "src/app/(app)/documentos/actions.ts" src/components/documentos/BotaoExpurgar.tsx src/components/documentos/TabelaRetencao.tsx "src/app/(app)/documentos/retencao/page.tsx" src/lib/ui/navegacao.ts "src/app/(app)/layout.tsx" "src/app/(app)/documentos/page.tsx" src/tests/ui/rotas-alcancaveis.test.ts src/tests/documentos/tabela-retencao.test.tsx
git commit -m "feat(rf062): tela de vencidos + expurgo + badge + banner"
```

---

### Task 5: Release

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm test && npm run format && npm run build` — tudo verde.
- [ ] **Step 2:** bump de versão (minor) + CHANGELOG (mesmo PR).
- [ ] **Step 3:** aplicar migration 0114 em produção (`node --env-file=.env.producao.bak scripts/db-migrate.mjs`) **antes** de Implantar.
- [ ] **Step 4:** REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch (PR, merge, Implantar, `/api/health`, tag).

---

## Self-Review

- **Cobertura da spec:** retenção por tipo (`tipo_documento.retencao_meses`, T1/T3), view `documento_retencao` (T1), `mesesEfetivos`/`descreverRetencao` (T2), tela de vencidos + expurgo manual (T4), badge + banner (T4), release com migration em prod (T5). Fora de escopo respeitado (sem apagar automático, sem e-mail/cron).
- **Placeholders:** nenhum passo de código sem código; as edições em `actions.ts`/`TiposDocumentoLista.tsx` descrevem as inserções exatas (o restante dos arquivos não muda).
- **Consistência de tipos:** `DocVencido` (T4) consumido por `TabelaRetencao`; `Badges.docsVencidos` (T4) fluído de `layout.tsx` → `Sidebar` → `menuDoPapel`; `contarDocsVencidos`/`listarVencidos` consultam a view da T1; `descreverRetencao` (T2) usado na config (T3).
