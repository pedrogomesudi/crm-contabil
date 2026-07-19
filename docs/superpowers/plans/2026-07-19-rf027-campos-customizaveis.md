# RF-027 — Campos customizáveis por escritório — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** deixar o admin definir campos extras (nome, tipo, obrigatoriedade) que aparecem no formulário de cadastro do cliente e são gravados por cliente; um campo obrigatório bloqueia o salvar.

**Architecture:** catálogo `campo_custom` (config admin) + valores em `clientes.campos_custom` (jsonb). Lógica pura `validarCampos` valida tipo (bloqueia sempre) e sinaliza obrigatórios vazios em `faltando` (Fatia A ignora; Fatia B bloqueia). Campos renderizados dentro do `FormCliente`; validação no `criarCliente`/`atualizarCliente`.

**Tech Stack:** Next 16 (App Router, server components + actions), TypeScript, Tailwind 4, Supabase (Postgres/RLS), vitest + `react-dom/server`.

## Global Constraints

- Next 16: `middleware.ts` é `proxy.ts`; imports via `@/*`; imagens só `next/image`.
- RBAC: papel só de `usuarios.papel` via `auth_papel()`; nunca do JWT.
- Migrations: runner `npm run db:migrate` (NÃO `supabase db push`); imutáveis após aplicadas; idempotentes. Numerar após a última (`0108`).
- Guard `divida-ui`: controles sem `border` à mão → `controleCls` (`@/components/ui/Campo`).
- Guard `rotas-alcancaveis`: `/configuracoes/*` é coberto pelo hub (`r.startsWith("/configuracoes/")`) — a nova sub-tela **não** entra em `POR_SUBNAV`; basta linkar no hub `src/app/(app)/configuracoes/page.tsx` (array `ITENS`).
- Rodar antes de entregar: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`, `npm run build`.
- Entrega por PR `develop`→`main` (verify verde), tag só após deploy confirmado no `/api/health`.
- `package.json.version` + CHANGELOG no mesmo PR (`versao.test.ts` exige bater).
- Config screen: admin-gated (`perfil.papel !== "admin"` → redirect); RLS config = leitura equipe / escrita admin (padrão `0103`); reordenar com `moverNaOrdem(ids, id, dir)` de `@/lib/comercial/funilConfig`.

---

# FATIA A — Catálogo + preenchimento (validação de tipo; obrigatório ainda não bloqueia)

### Task A1: Migration 0109 — `campo_custom` + `clientes.campos_custom` + RLS

**Files:**
- Create: `supabase/migrations/0109_campos_customizaveis.sql`

**Interfaces:**
- Produces: `campo_custom(id, nome, tipo, obrigatorio, opcoes text[], ordem, ativo, criado_em)`; coluna `clientes.campos_custom jsonb not null default '{}'`.

- [ ] **Step 1: Escrever a migration**

```sql
-- RF-027: campos customizáveis por escritório.
create table if not exists campo_custom (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('texto','numero','data','booleano','lista')),
  obrigatorio boolean not null default false,
  opcoes text[],            -- usado só quando tipo = 'lista'
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table clientes add column if not exists campos_custom jsonb not null default '{}'::jsonb;

alter table campo_custom enable row level security;
drop policy if exists campo_custom_read  on campo_custom;
drop policy if exists campo_custom_write on campo_custom;
create policy campo_custom_read  on campo_custom for select using (auth_papel() in ('admin','assistente','contador'));
create policy campo_custom_write on campo_custom for all
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
```

- [ ] **Step 2: Conferir idempotência** (`create table if not exists`, `add column if not exists`, `drop policy if exists` antes de `create policy`). Nenhuma migration aplicada editada.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0109_campos_customizaveis.sql
git commit -m "feat(rf027): migration 0109 campos customizaveis"
```

> Aplicada em produção no release da Fatia A, antes de Implantar.

---

### Task A2: Lógica pura — `validarCampos` (+ extrair `ehDataValida`)

**Files:**
- Create: `src/lib/validation/data.ts`
- Modify: `src/lib/validation/cliente.ts` (importar `ehDataValida` do novo util em vez da função local)
- Create: `src/lib/clientes/campos-custom.ts`
- Test: `src/tests/clientes/campos-custom.test.ts`

**Interfaces:**
- Produces:
  - `ehDataValida(s: string): boolean` (em `@/lib/validation/data`)
  - `type CampoTipo = "texto" | "numero" | "data" | "booleano" | "lista"`
  - `type CampoDef = { id: string; nome: string; tipo: CampoTipo; obrigatorio: boolean; opcoes: string[] }`
  - `validarCampos(defs: CampoDef[], crus: Record<string, string>): { ok: true; valores: Record<string, unknown>; faltando: string[] } | { erro: string }`

- [ ] **Step 1: Extrair `ehDataValida` para util**

Criar `src/lib/validation/data.ts`:

```ts
// Valida data de calendário real (não só o formato): "2026-13-45" é rejeitada.
export function ehDataValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
```

Em `src/lib/validation/cliente.ts`: remover a função local `ehDataValida` e adicionar no topo `import { ehDataValida } from "@/lib/validation/data";` (o resto do arquivo usa o mesmo nome, então nada mais muda).

- [ ] **Step 2: Escrever os testes (falham)**

`src/tests/clientes/campos-custom.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validarCampos, type CampoDef } from "@/lib/clientes/campos-custom";

const def = (over: Partial<CampoDef>): CampoDef => ({
  id: "f1", nome: "Campo", tipo: "texto", obrigatorio: false, opcoes: [], ...over,
});

describe("validarCampos", () => {
  it("normaliza cada tipo", () => {
    const defs = [
      def({ id: "t", tipo: "texto" }),
      def({ id: "n", tipo: "numero" }),
      def({ id: "d", tipo: "data" }),
      def({ id: "b", tipo: "booleano" }),
      def({ id: "l", tipo: "lista", opcoes: ["A", "B"] }),
    ];
    const r = validarCampos(defs, { t: " oi ", n: "12", d: "2026-07-19", b: "on", l: "B" });
    expect(r).toEqual({
      ok: true,
      valores: { t: "oi", n: 12, d: "2026-07-19", b: true, l: "B" },
      faltando: [],
    });
  });

  it("número não-numérico é erro de tipo", () => {
    const r = validarCampos([def({ id: "n", nome: "Faturamento", tipo: "numero" })], { n: "abc" });
    expect(r).toEqual({ erro: 'O campo "Faturamento" deve ser um número.' });
  });

  it("data inválida é erro de tipo", () => {
    const r = validarCampos([def({ id: "d", nome: "Abertura", tipo: "data" })], { d: "2026-13-45" });
    expect(r).toEqual({ erro: 'O campo "Abertura" tem uma data inválida.' });
  });

  it("lista fora das opções é erro de tipo", () => {
    const r = validarCampos([def({ id: "l", nome: "Segmento", tipo: "lista", opcoes: ["A"] })], { l: "Z" });
    expect(r).toEqual({ erro: 'Opção inválida para "Segmento".' });
  });

  it("obrigatório vazio vai para faltando (não bloqueia aqui)", () => {
    const r = validarCampos([def({ id: "t", nome: "RG", obrigatorio: true })], { t: "" });
    expect(r).toEqual({ ok: true, valores: {}, faltando: ["RG"] });
  });

  it("booleano opcional ausente é false e não falta", () => {
    const r = validarCampos([def({ id: "b", nome: "VIP", tipo: "booleano", obrigatorio: true })], { b: "" });
    expect(r).toEqual({ ok: true, valores: { b: false }, faltando: [] });
  });

  it("valor cru sem definição correspondente é ignorado", () => {
    const r = validarCampos([def({ id: "t" })], { t: "x", fantasma: "y" });
    expect(r).toEqual({ ok: true, valores: { t: "x" }, faltando: [] });
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/tests/clientes/campos-custom.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 4: Implementar**

`src/lib/clientes/campos-custom.ts`:

```ts
import { ehDataValida } from "@/lib/validation/data";

export type CampoTipo = "texto" | "numero" | "data" | "booleano" | "lista";
export type CampoDef = { id: string; nome: string; tipo: CampoTipo; obrigatorio: boolean; opcoes: string[] };

type Ok = { ok: true; valores: Record<string, unknown>; faltando: string[] };

export function validarCampos(defs: CampoDef[], crus: Record<string, string>): Ok | { erro: string } {
  const valores: Record<string, unknown> = {};
  const faltando: string[] = [];

  for (const d of defs) {
    const bruto = (crus[d.id] ?? "").trim();

    if (d.tipo === "booleano") {
      valores[d.id] = bruto !== ""; // checkbox: "on" quando marcado, "" quando não
      continue;
    }

    if (bruto === "") {
      if (d.obrigatorio) faltando.push(d.nome);
      continue; // vazio não entra no jsonb
    }

    switch (d.tipo) {
      case "numero": {
        const n = Number(bruto);
        if (!Number.isFinite(n)) return { erro: `O campo "${d.nome}" deve ser um número.` };
        valores[d.id] = n;
        break;
      }
      case "data": {
        if (!ehDataValida(bruto)) return { erro: `O campo "${d.nome}" tem uma data inválida.` };
        valores[d.id] = bruto;
        break;
      }
      case "lista": {
        if (!d.opcoes.includes(bruto)) return { erro: `Opção inválida para "${d.nome}".` };
        valores[d.id] = bruto;
        break;
      }
      default:
        valores[d.id] = bruto; // texto
    }
  }

  return { ok: true, valores, faltando };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/tests/clientes/campos-custom.test.ts src/tests/ -t "cliente"` — ou ao menos o arquivo novo + o suite de validação de cliente para garantir que a extração de `ehDataValida` não quebrou nada.
Run: `npx vitest run src/tests/clientes/campos-custom.test.ts && npm run typecheck`
Expected: PASS, sem erros de tipo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validation/data.ts src/lib/validation/cliente.ts src/lib/clientes/campos-custom.ts src/tests/clientes/campos-custom.test.ts
git commit -m "feat(rf027): validarCampos (tipos + faltando) e util ehDataValida"
```

---

### Task A3: Actions do catálogo (config admin)

**Files:**
- Create: `src/app/(app)/configuracoes/campos-custom/actions.ts`

**Interfaces:**
- Consumes: `moverNaOrdem` (`@/lib/comercial/funilConfig`), `createServerSupabase`, `CampoDef` (A2).
- Produces:
  - `listarCamposCustom(): Promise<CampoRow[]>` onde `CampoRow = CampoDef & { ordem: number; ativo: boolean }`
  - `carregarCamposAtivos(): Promise<CampoDef[]>` (para o form; só `ativo=true`, ordenados)
  - `criarCampo(fd: FormData): Promise<{ erro?: string }>`
  - `moverCampo(id: string, dir: "cima" | "baixo"): Promise<{ erro?: string }>`
  - `alternarAtivo(id: string, ativo: boolean): Promise<{ erro?: string }>`
  - `removerCampo(id: string): Promise<{ erro?: string }>`

- [ ] **Step 1: Implementar**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { moverNaOrdem } from "@/lib/comercial/funilConfig";
import type { CampoDef, CampoTipo } from "@/lib/clientes/campos-custom";

export type CampoRow = CampoDef & { ordem: number; ativo: boolean };

const TIPOS: CampoTipo[] = ["texto", "numero", "data", "booleano", "lista"];
const rev = () => revalidatePath("/configuracoes/campos-custom");

function mapRow(r: Record<string, unknown>): CampoRow {
  return {
    id: r.id as string,
    nome: r.nome as string,
    tipo: r.tipo as CampoTipo,
    obrigatorio: r.obrigatorio as boolean,
    opcoes: (r.opcoes as string[] | null) ?? [],
    ordem: r.ordem as number,
    ativo: r.ativo as boolean,
  };
}

export async function listarCamposCustom(): Promise<CampoRow[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("campo_custom")
    .select("id, nome, tipo, obrigatorio, opcoes, ordem, ativo")
    .order("ordem");
  return (data ?? []).map(mapRow);
}

export async function carregarCamposAtivos(): Promise<CampoDef[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("campo_custom")
    .select("id, nome, tipo, obrigatorio, opcoes")
    .eq("ativo", true)
    .order("ordem");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    nome: r.nome as string,
    tipo: r.tipo as CampoTipo,
    obrigatorio: r.obrigatorio as boolean,
    opcoes: (r.opcoes as string[] | null) ?? [],
  }));
}

export async function criarCampo(fd: FormData): Promise<{ erro?: string }> {
  const nome = String(fd.get("nome") ?? "").trim();
  const tipo = String(fd.get("tipo") ?? "") as CampoTipo;
  const obrigatorio = fd.get("obrigatorio") != null;
  if (!nome) return { erro: "Informe o nome do campo." };
  if (!TIPOS.includes(tipo)) return { erro: "Tipo inválido." };
  const opcoes =
    tipo === "lista"
      ? String(fd.get("opcoes") ?? "")
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean)
      : null;
  if (tipo === "lista" && (!opcoes || opcoes.length === 0)) return { erro: "Uma lista precisa de opções." };

  const supabase = await createServerSupabase();
  const { data: max } = await supabase
    .from("campo_custom")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ordem = ((max?.ordem as number | undefined) ?? -1) + 1;
  const { error } = await supabase.from("campo_custom").insert({ nome, tipo, obrigatorio, opcoes, ordem });
  if (error) return { erro: "Não foi possível criar o campo (sem permissão?)." };
  rev();
  return {};
}

export async function moverCampo(id: string, dir: "cima" | "baixo"): Promise<{ erro?: string }> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("campo_custom").select("id").order("ordem");
  const ids = (data ?? []).map((r) => r.id as string);
  const nova = moverNaOrdem(ids, id, dir);
  await Promise.all(nova.map((cid, i) => supabase.from("campo_custom").update({ ordem: i }).eq("id", cid)));
  rev();
  return {};
}

export async function alternarAtivo(id: string, ativo: boolean): Promise<{ erro?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("campo_custom").update({ ativo }).eq("id", id);
  if (error) return { erro: "Não foi possível alterar o campo (sem permissão?)." };
  rev();
  return {};
}

export async function removerCampo(id: string): Promise<{ erro?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("campo_custom").delete().eq("id", id);
  if (error) return { erro: "Não foi possível remover o campo (sem permissão?)." };
  rev();
  return {};
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/configuracoes/campos-custom/actions.ts"
git commit -m "feat(rf027): actions do catalogo de campos customizaveis"
```

---

### Task A4: Tela de configuração + link no hub

**Files:**
- Create: `src/app/(app)/configuracoes/campos-custom/page.tsx`
- Create: `src/app/(app)/configuracoes/campos-custom/CamposCustomLista.tsx`
- Modify: `src/app/(app)/configuracoes/page.tsx` (item no array `ITENS`)
- Test: `src/tests/configuracoes/campos-custom-lista.test.tsx`

**Interfaces:**
- Consumes: `listarCamposCustom`/`criarCampo`/`moverCampo`/`alternarAtivo`/`removerCampo` (A3), `CampoRow` (A3).

- [ ] **Step 1: Render test (falha)**

`src/tests/configuracoes/campos-custom-lista.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/campos-custom/actions", () => ({
  criarCampo: vi.fn(), moverCampo: vi.fn(), alternarAtivo: vi.fn(), removerCampo: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { CamposCustomLista } from "@/app/(app)/configuracoes/campos-custom/CamposCustomLista";

describe("CamposCustomLista", () => {
  it("lista os campos e o formulário de adicionar", () => {
    const html = renderToStaticMarkup(
      <CamposCustomLista campos={[{ id: "f1", nome: "Segmento", tipo: "lista", obrigatorio: true, opcoes: ["A"], ordem: 0, ativo: true }]} />,
    );
    expect(html).toContain("Segmento");
    expect(html).toContain("Adicionar campo");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/configuracoes/campos-custom-lista.test.tsx`
Expected: FAIL (componente não existe).

- [ ] **Step 3: Implementar `CamposCustomLista`**

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Botao } from "@/components/ui/Botao";
import { controleCls } from "@/components/ui/Campo";
import {
  criarCampo,
  moverCampo,
  alternarAtivo,
  removerCampo,
  type CampoRow,
} from "@/app/(app)/configuracoes/campos-custom/actions";

const TIPO_ROTULO: Record<string, string> = {
  texto: "Texto", numero: "Número", data: "Data", booleano: "Sim/Não", lista: "Lista",
};

export function CamposCustomLista({ campos }: { campos: CampoRow[] }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [tipo, setTipo] = useState("texto");

  const run = (fn: () => Promise<{ erro?: string }>) =>
    start(async () => {
      const r = await fn();
      setErro(r.erro ?? null);
      if (!r.erro) router.refresh();
    });

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {campos.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-linha bg-white p-3 text-sm">
            <span className={c.ativo ? "text-grafite" : "text-cinza line-through"}>{c.nome}</span>
            <span className="text-cinza">{TIPO_ROTULO[c.tipo]}</span>
            {c.obrigatorio && <span className="text-cinza">obrigatório</span>}
            {c.tipo === "lista" && <span className="text-cinza">[{c.opcoes.join(", ")}]</span>}
            <span className="ml-auto flex items-center gap-2">
              <button type="button" disabled={pend} onClick={() => run(() => moverCampo(c.id, "cima"))} aria-label="Subir">↑</button>
              <button type="button" disabled={pend} onClick={() => run(() => moverCampo(c.id, "baixo"))} aria-label="Descer">↓</button>
              <button type="button" disabled={pend} onClick={() => run(() => alternarAtivo(c.id, !c.ativo))} className="underline">
                {c.ativo ? "desativar" : "ativar"}
              </button>
              <button type="button" disabled={pend} onClick={() => run(() => removerCampo(c.id))} className="text-negativo underline">
                remover
              </button>
            </span>
          </li>
        ))}
        {campos.length === 0 && <li className="text-sm text-cinza">Nenhum campo customizado ainda.</li>}
      </ul>

      <form
        action={(fd) => run(() => criarCampo(fd))}
        className="flex flex-wrap items-end gap-2 rounded-lg border border-linha bg-white p-3"
      >
        <input name="nome" placeholder="nome do campo" className={controleCls("compacto")} />
        <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className={controleCls("compacto")}>
          {Object.entries(TIPO_ROTULO).map(([v, r]) => (
            <option key={v} value={v}>{r}</option>
          ))}
        </select>
        {tipo === "lista" && (
          <input name="opcoes" placeholder="opções (vírgula)" className={controleCls("compacto")} />
        )}
        <label className="flex items-center gap-1 text-sm text-cinza">
          <input type="checkbox" name="obrigatorio" /> obrigatório
        </label>
        <Botao type="submit" variante="secundario" disabled={pend}>Adicionar campo</Botao>
      </form>

      {erro && <p role="alert" className="text-sm text-negativo">{erro}</p>}
    </div>
  );
}
```

> **Nota `divida-ui`:** os `<input>`/`<select>` acima usam `controleCls` — sem `border` à mão. O checkbox nu é permitido (o guard só olha border em input/select/textarea com classe de borda escrita à mão).

- [ ] **Step 4: `page.tsx` (admin gate)**

```tsx
import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { CamposCustomLista } from "./CamposCustomLista";
import { listarCamposCustom } from "./actions";

export const metadata = { title: "Campos customizáveis" };

export default async function CamposCustomConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const campos = await listarCamposCustom();
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="Campos customizáveis" subtitulo="Campos extras do cadastro do cliente — tipo e obrigatoriedade" />
      <CamposCustomLista campos={campos} />
    </Container>
  );
}
```

- [ ] **Step 5: Link no hub** — adicionar ao array `ITENS` em `src/app/(app)/configuracoes/page.tsx`:

```tsx
  {
    href: "/configuracoes/campos-custom",
    label: "Campos do cadastro",
    desc: "Campos extras do cliente — texto, número, data, sim/não e lista.",
  },
```

- [ ] **Step 6: Rodar testes e guards**

Run: `npx vitest run src/tests/configuracoes/campos-custom-lista.test.tsx src/tests/ui/divida-ui.test.ts src/tests/ui/rotas-alcancaveis.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/configuracoes/campos-custom/page.tsx" "src/app/(app)/configuracoes/campos-custom/CamposCustomLista.tsx" "src/app/(app)/configuracoes/page.tsx" src/tests/configuracoes/campos-custom-lista.test.tsx
git commit -m "feat(rf027): tela de config dos campos customizaveis + link no hub"
```

---

### Task A5: Render no `FormCliente` + gravação nas actions

**Files:**
- Create: `src/components/clientes/CamposComplementares.tsx`
- Modify: `src/components/FormCliente.tsx` (props `camposCustom`/`valoresCustom` + a nova `<Secao>`)
- Modify: `src/app/(app)/clientes/actions.ts` (extrair + validar + gravar em `criarCliente` e `atualizarCliente`)
- Modify: `src/app/(app)/clientes/[id]/page.tsx` e `src/app/(app)/clientes/novo/page.tsx` (carregar `camposCustom` e passar ao form; na edição, passar `valoresCustom`)
- Test: `src/tests/clientes/campos-complementares.test.tsx`

**Interfaces:**
- Consumes: `CampoDef` (A2), `carregarCamposAtivos` + `validarCampos`.
- Produces: `CamposComplementares({ campos, valores }: { campos: CampoDef[]; valores: Record<string, unknown> })`.

- [ ] **Step 1: Render test (falha)**

`src/tests/clientes/campos-complementares.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CamposComplementares } from "@/components/clientes/CamposComplementares";

describe("CamposComplementares", () => {
  it("renderiza um controle por campo, pré-preenchendo o valor atual", () => {
    const html = renderToStaticMarkup(
      <CamposComplementares
        campos={[
          { id: "seg", nome: "Segmento", tipo: "lista", obrigatorio: true, opcoes: ["Comércio", "Serviço"] },
          { id: "fat", nome: "Faturamento", tipo: "numero", obrigatorio: false, opcoes: [] },
        ]}
        valores={{ fat: 5000 }}
      />,
    );
    expect(html).toContain("Segmento");
    expect(html).toContain("Comércio");
    expect(html).toContain('name="custom_fat"');
    expect(html).toContain("5000");
  });

  it("nada renderiza quando não há campos", () => {
    const html = renderToStaticMarkup(<CamposComplementares campos={[]} valores={{}} />);
    expect(html).toBe("");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/clientes/campos-complementares.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `CamposComplementares`**

```tsx
import { controleCls } from "@/components/ui/Campo";
import type { CampoDef } from "@/lib/clientes/campos-custom";

export function CamposComplementares({
  campos,
  valores,
}: {
  campos: CampoDef[];
  valores: Record<string, unknown>;
}) {
  if (campos.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {campos.map((c) => {
        const nome = `custom_${c.id}`;
        const atual = valores[c.id];
        const label = (
          <span className="text-sm text-cinza">
            {c.nome}
            {c.obrigatorio && " *"}
          </span>
        );
        if (c.tipo === "booleano") {
          return (
            <label key={c.id} className="flex items-center gap-2">
              <input type="checkbox" name={nome} defaultChecked={atual === true} />
              {label}
            </label>
          );
        }
        return (
          <label key={c.id} className="flex flex-col gap-1">
            {label}
            {c.tipo === "lista" ? (
              <select name={nome} defaultValue={typeof atual === "string" ? atual : ""} className={controleCls()}>
                <option value="">—</option>
                {c.opcoes.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                name={nome}
                type={c.tipo === "numero" ? "number" : c.tipo === "data" ? "date" : "text"}
                defaultValue={atual == null ? "" : String(atual)}
                className={controleCls()}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/clientes/campos-complementares.test.tsx`
Expected: PASS.

- [ ] **Step 5: Ligar no `FormCliente`**

Em `src/components/FormCliente.tsx`:

1. `import { CamposComplementares } from "@/components/clientes/CamposComplementares";` e `import type { CampoDef } from "@/lib/clientes/campos-custom";`.
2. No tipo `Props`, adicionar: `camposCustom: CampoDef[]; valoresCustom: Record<string, unknown>;`.
3. Na desestruturação da função, incluir `camposCustom, valoresCustom`.
4. Antes do bloco `{estado.erro && (`, adicionar a seção (só aparece se houver campos):

```tsx
      {camposCustom.length > 0 && (
        <Secao titulo="Informações complementares">
          <CamposComplementares campos={camposCustom} valores={valoresCustom} />
        </Secao>
      )}
```

- [ ] **Step 6: Gravar nas actions**

Em `src/app/(app)/clientes/actions.ts`:

1. Imports no topo: `import { carregarCamposAtivos } from "@/app/(app)/configuracoes/campos-custom/actions";` e `import { validarCampos } from "@/lib/clientes/campos-custom";`.
2. Um helper (no mesmo arquivo) que lê os valores crus e valida:

```ts
async function lerCamposCustom(formData: FormData): Promise<{ valores: Record<string, unknown> } | { erro: string }> {
  const defs = await carregarCamposAtivos();
  const crus: Record<string, string> = {};
  for (const d of defs) crus[d.id] = String(formData.get(`custom_${d.id}`) ?? "");
  const r = validarCampos(defs, crus);
  if ("erro" in r) return { erro: r.erro };
  // Fatia A: `faltando` é ignorado (obrigatório ainda não bloqueia).
  return { valores: r.valores };
}
```

3. Em `criarCliente`, após validar o `parsed` e antes do `insert`, chamar o helper e injetar no payload:

```ts
  const cc = await lerCamposCustom(formData);
  if ("erro" in cc) return { erro: cc.erro };
```

E no `.insert({ ... })` adicionar `campos_custom: cc.valores,`.

4. Em `atualizarCliente`, o mesmo: chamar `lerCamposCustom`, retornar em erro, e no `.update({ ... })` adicionar `campos_custom: cc.valores,`.

- [ ] **Step 7: Carregar os campos nas páginas de cadastro**

Em `src/app/(app)/clientes/[id]/page.tsx` (edição): importar `carregarCamposAtivos`, chamar `const camposCustom = await carregarCamposAtivos();` e passar ao `FormCliente`:

```tsx
              camposCustom={camposCustom}
              valoresCustom={(cliente as { campos_custom?: Record<string, unknown> }).campos_custom ?? {}}
```

E adicionar `campos_custom` ao `.select(...)` de `clientes`.

Em `src/app/(app)/clientes/novo/page.tsx` (criação): carregar `carregarCamposAtivos()` e passar `camposCustom={camposCustom} valoresCustom={{}}` ao `FormCliente`.

> **Nota:** se o `FormCliente` for usado em outro ponto (ex.: criar a partir de oportunidade), passar `camposCustom={[]} valoresCustom={{}}` lá para não quebrar o tipo — buscar usos com `grep -rn "FormCliente" src/app`.

- [ ] **Step 8: Verificar tudo**

Run: `npm run typecheck && npx vitest run src/tests/clientes/ src/tests/ui/divida-ui.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/clientes/CamposComplementares.tsx src/components/FormCliente.tsx "src/app/(app)/clientes/actions.ts" "src/app/(app)/clientes/[id]/page.tsx" "src/app/(app)/clientes/novo/page.tsx" src/tests/clientes/campos-complementares.test.tsx
git commit -m "feat(rf027): campos customizaveis no FormCliente (render + gravacao)"
```

---

### Task A6: Release da Fatia A

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm test && npm run format && npm run build` — tudo verde.
- [ ] **Step 2:** bump de versão (minor) + CHANGELOG (mesmo PR).
- [ ] **Step 3:** aplicar migration 0109 em produção (`node --env-file=.env.producao.bak scripts/db-migrate.mjs`) **antes** de Implantar.
- [ ] **Step 4:** REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch (PR `develop`→`main`, `gh pr checks --watch`, merge). Implantar, confirmar `/api/health`, tag depois.

---

# FATIA B — Obrigatoriedade bloqueia o salvar

### Task B1: `faltando` passa a bloquear em `criarCliente`/`atualizarCliente`

**Files:**
- Modify: `src/app/(app)/clientes/actions.ts` (o helper `lerCamposCustom`)

**Interfaces:**
- Consumes: o `faltando` que `validarCampos` já devolve (A2).

- [ ] **Step 1: Bloquear quando houver obrigatório vazio**

No helper `lerCamposCustom`, trocar o comentário "Fatia A ignora" por a checagem:

```ts
  const r = validarCampos(defs, crus);
  if ("erro" in r) return { erro: r.erro };
  if (r.faltando.length > 0) return { erro: `Preencha os campos obrigatórios: ${r.faltando.join(", ")}.` };
  return { valores: r.valores };
```

- [ ] **Step 2: Verificar**

Run: `npm run typecheck && npx vitest run src/tests/clientes/`
Expected: PASS (a lógica de `faltando` já foi testada em A2; aqui é só o consumo).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/clientes/actions.ts"
git commit -m "feat(rf027): campo obrigatorio bloqueia o salvar do cliente"
```

---

### Task B2: Release da Fatia B

- [ ] **Step 1:** suíte completa (`lint`/`typecheck`/`test`/`format`/`build`).
- [ ] **Step 2:** bump de versão + CHANGELOG (fecha o RF-027).
- [ ] **Step 3:** sem migration nova → nada a aplicar em produção.
- [ ] **Step 4:** REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch (PR, merge, Implantar, `/api/health`, tag).

---

## Self-Review

- **Cobertura da spec:** 5 tipos (A2 `validarCampos` + A5 render), jsonb `clientes.campos_custom` (A1/A5), catálogo `campo_custom` + config admin (A1/A3/A4), integração no `FormCliente` com validação de tipo server-side (A5), obrigatório bloqueando (B1), RLS config (A1), reordenar por setas (A3/A4), link no hub sem `POR_SUBNAV` (A4). Fora de escopo respeitado (sem filtro/relatório; sem `FormConstituicao`; sem outras entidades).
- **Placeholders:** nenhum passo de código sem código; a única "Nota" (checar outros usos de `FormCliente`) é uma verificação pontual, não lacuna.
- **Consistência de tipos:** `CampoDef`/`CampoTipo` (A2) reusados em A3 (`CampoRow = CampoDef & …`), A4, A5; `validarCampos` devolve `{ ok, valores, faltando }` consumido igual em A5 (ignora `faltando`) e B1 (bloqueia com `faltando`); `carregarCamposAtivos` (A3) alimenta A5 (form) e as actions.
