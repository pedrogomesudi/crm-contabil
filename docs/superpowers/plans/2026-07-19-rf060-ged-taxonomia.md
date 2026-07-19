# RF-060 — GED: taxonomia (Fatia A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dar ao GED uma taxonomia — catálogo de tipos (admin), eixos departamento e competência no documento, upload classificado e filtros na listagem.

**Architecture:** catálogo `tipo_documento` (config admin) + colunas `documentos.tipo_id/departamento/competencia`. O `tipo` texto permanece (denormalizado com o nome do tipo, para não quebrar o caso `d.tipo === "Contrato"`). Filtros client-side numa tabela extraída para client component.

**Tech Stack:** Next 16 (App Router, server components + actions), TypeScript, Tailwind 4, Supabase (Postgres/RLS/Storage), vitest.

## Global Constraints

- Next 16: `middleware.ts` é `proxy.ts`; imports `@/*`; imagens só `next/image`.
- RBAC: papel só via `auth_papel()`; nunca do JWT.
- Migrations: runner `npm run db:migrate` (NÃO `supabase db push`); imutáveis após aplicadas; idempotentes; numerar após `0110`.
- Guard `divida-ui`: controles sem `border` à mão → `controleCls`/`Campo` (`@/components/ui/Campo`).
- Guard `rotas-alcancaveis`: `/configuracoes/*` coberto pelo hub — a nova sub-tela NÃO entra em `POR_SUBNAV`; linkar no hub `src/app/(app)/configuracoes/page.tsx` (array `ITENS`, sem `papeis` = só admin).
- Config screen admin-gated (`perfil.papel !== "admin"` → redirect); RLS config = leitura equipe / escrita admin.
- `enum departamento` = `contabil|fiscal|pessoal|societario` (`@/lib/clientes/departamentos`: `DEPARTAMENTOS`, `rotuloDepartamento`).
- Rodar antes de entregar: `lint`, `typecheck`, `test`, `format`, `build`. PR `develop`→`main`; tag após deploy; versão+CHANGELOG no mesmo PR.

---

### Task 1: Migration 0111 — `tipo_documento` + colunas em `documentos`

**Files:**
- Create: `supabase/migrations/0111_ged_taxonomia.sql`

**Interfaces:**
- Produces: `tipo_documento(id, nome, departamento, ordem, ativo, criado_em)`; colunas `documentos.tipo_id/departamento/competencia`.

- [ ] **Step 1: Escrever a migration**

```sql
-- RF-060 (Fatia A): taxonomia do GED — catálogo de tipos + eixos departamento/competência.
create table if not exists tipo_documento (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  departamento departamento,        -- sugerido; nullable
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table documentos add column if not exists tipo_id uuid references tipo_documento(id);
alter table documentos add column if not exists departamento departamento;
alter table documentos add column if not exists competencia date;

alter table tipo_documento enable row level security;
drop policy if exists tipo_documento_read  on tipo_documento;
drop policy if exists tipo_documento_write on tipo_documento;
create policy tipo_documento_read  on tipo_documento for select
  using (auth_papel() in ('admin','assistente','contador','financeiro'));
create policy tipo_documento_write on tipo_documento for all
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
```

- [ ] **Step 2: Conferir idempotência** (`create table/add column if not exists`, `drop policy if exists` antes de `create policy`). Confirmar que o tipo `departamento` existe (definido em migration anterior de enums/clientes).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0111_ged_taxonomia.sql
git commit -m "feat(rf060): migration 0111 taxonomia do GED (tipo_documento + eixos)"
```

> Aplicada em produção no release, antes de Implantar.

---

### Task 2: Lógica pura — `taxonomia.ts`

**Files:**
- Create: `src/lib/documentos/taxonomia.ts`
- Test: `src/tests/documentos/taxonomia.test.ts`

**Interfaces:**
- Produces:
  - `competenciaParaData(aaaaMM: string): string | null`
  - `competenciaRotulo(data: string | null): string`
  - `departamentoDoTipo(tipos: { id: string; departamento: string | null }[], tipoId: string): string | null`

- [ ] **Step 1: Escrever os testes (falham)**

```ts
import { describe, it, expect } from "vitest";
import { competenciaParaData, competenciaRotulo, departamentoDoTipo } from "@/lib/documentos/taxonomia";

describe("competenciaParaData", () => {
  it("mês válido vira o dia 1", () => expect(competenciaParaData("2026-07")).toBe("2026-07-01"));
  it("vazio é null", () => expect(competenciaParaData("")).toBeNull());
  it("formato inválido é null", () => {
    expect(competenciaParaData("2026-13")).toBeNull();
    expect(competenciaParaData("julho")).toBeNull();
  });
});

describe("competenciaRotulo", () => {
  it("data vira MM/AAAA", () => expect(competenciaRotulo("2026-07-01")).toBe("07/2026"));
  it("null vira travessão", () => expect(competenciaRotulo(null)).toBe("—"));
});

describe("departamentoDoTipo", () => {
  const tipos = [{ id: "a", departamento: "fiscal" }, { id: "b", departamento: null }];
  it("acha o departamento do tipo", () => expect(departamentoDoTipo(tipos, "a")).toBe("fiscal"));
  it("tipo sem departamento é null", () => expect(departamentoDoTipo(tipos, "b")).toBeNull());
  it("tipo inexistente é null", () => expect(departamentoDoTipo(tipos, "z")).toBeNull());
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/documentos/taxonomia.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// "2026-07" -> "2026-07-01"; vazio ou formato inválido (mês 1..12) -> null.
export function competenciaParaData(aaaaMM: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(aaaaMM.trim());
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}

// "2026-07-01" -> "07/2026"; null -> "—".
export function competenciaRotulo(data: string | null): string {
  if (!data) return "—";
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(data);
  return m ? `${m[2]}/${m[1]}` : "—";
}

export function departamentoDoTipo(
  tipos: { id: string; departamento: string | null }[],
  tipoId: string,
): string | null {
  return tipos.find((t) => t.id === tipoId)?.departamento ?? null;
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npx vitest run src/tests/documentos/taxonomia.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/documentos/taxonomia.ts src/tests/documentos/taxonomia.test.ts
git commit -m "feat(rf060): logica pura de taxonomia (competencia + departamento do tipo)"
```

---

### Task 3: Catálogo `tipo_documento` — actions + tela de config

**Files:**
- Create: `src/app/(app)/configuracoes/tipos-documento/actions.ts`
- Create: `src/app/(app)/configuracoes/tipos-documento/page.tsx`
- Create: `src/app/(app)/configuracoes/tipos-documento/TiposDocumentoLista.tsx`
- Modify: `src/app/(app)/configuracoes/page.tsx` (item no `ITENS`)
- Test: `src/tests/configuracoes/tipos-documento-lista.test.tsx`

**Interfaces:**
- Produces:
  - `type TipoDocRow = { id: string; nome: string; departamento: string | null; ordem: number; ativo: boolean }`
  - `listarTiposDocumento(): Promise<TipoDocRow[]>`
  - `carregarTiposAtivos(): Promise<{ id: string; nome: string; departamento: string | null }[]>`
  - `criarTipoDoc(fd: FormData): Promise<{ erro?: string }>`
  - `moverTipoDoc(id: string, dir: "cima" | "baixo"): Promise<{ erro?: string }>`
  - `alternarAtivoTipoDoc(id: string, ativo: boolean): Promise<{ erro?: string }>`
  - `removerTipoDoc(id: string): Promise<{ erro?: string }>`

- [ ] **Step 1: Implementar as actions**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { moverNaOrdem } from "@/lib/comercial/funilConfig";
import { DEPARTAMENTOS } from "@/lib/clientes/departamentos";

export type TipoDocRow = { id: string; nome: string; departamento: string | null; ordem: number; ativo: boolean };

const rev = () => revalidatePath("/configuracoes/tipos-documento");
const DEPS = DEPARTAMENTOS.map((d) => d.valor as string);

export async function listarTiposDocumento(): Promise<TipoDocRow[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("tipo_documento")
    .select("id, nome, departamento, ordem, ativo")
    .order("ordem");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    nome: r.nome as string,
    departamento: (r.departamento as string | null) ?? null,
    ordem: r.ordem as number,
    ativo: r.ativo as boolean,
  }));
}

export async function carregarTiposAtivos(): Promise<{ id: string; nome: string; departamento: string | null }[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("tipo_documento")
    .select("id, nome, departamento")
    .eq("ativo", true)
    .order("ordem");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    nome: r.nome as string,
    departamento: (r.departamento as string | null) ?? null,
  }));
}

export async function criarTipoDoc(fd: FormData): Promise<{ erro?: string }> {
  const nome = String(fd.get("nome") ?? "").trim();
  const depRaw = String(fd.get("departamento") ?? "").trim();
  const departamento = depRaw && DEPS.includes(depRaw) ? depRaw : null;
  if (!nome) return { erro: "Informe o nome do tipo." };
  const supabase = await createServerSupabase();
  const { data: max } = await supabase
    .from("tipo_documento")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ordem = ((max?.ordem as number | undefined) ?? -1) + 1;
  const { error } = await supabase.from("tipo_documento").insert({ nome, departamento, ordem });
  if (error) return { erro: "Não foi possível criar o tipo (sem permissão?)." };
  rev();
  return {};
}

export async function moverTipoDoc(id: string, dir: "cima" | "baixo"): Promise<{ erro?: string }> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("tipo_documento").select("id").order("ordem");
  const ids = (data ?? []).map((r) => r.id as string);
  const nova = moverNaOrdem(ids, id, dir);
  await Promise.all(nova.map((cid, i) => supabase.from("tipo_documento").update({ ordem: i }).eq("id", cid)));
  rev();
  return {};
}

export async function alternarAtivoTipoDoc(id: string, ativo: boolean): Promise<{ erro?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("tipo_documento").update({ ativo }).eq("id", id);
  if (error) return { erro: "Não foi possível alterar o tipo (sem permissão?)." };
  rev();
  return {};
}

export async function removerTipoDoc(id: string): Promise<{ erro?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("tipo_documento").delete().eq("id", id);
  if (error) return { erro: "Não foi possível remover o tipo (sem permissão?)." };
  rev();
  return {};
}
```

- [ ] **Step 2: Render test (falha)**

`src/tests/configuracoes/tipos-documento-lista.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/tipos-documento/actions", () => ({
  criarTipoDoc: vi.fn(), moverTipoDoc: vi.fn(), alternarAtivoTipoDoc: vi.fn(), removerTipoDoc: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { TiposDocumentoLista } from "@/app/(app)/configuracoes/tipos-documento/TiposDocumentoLista";

describe("TiposDocumentoLista", () => {
  it("lista os tipos e o formulário de adicionar", () => {
    const html = renderToStaticMarkup(
      <TiposDocumentoLista tipos={[{ id: "t1", nome: "Balancete", departamento: "contabil", ordem: 0, ativo: true }]} />,
    );
    expect(html).toContain("Balancete");
    expect(html).toContain("Adicionar tipo");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar** — Run: `npx vitest run src/tests/configuracoes/tipos-documento-lista.test.tsx` — Expected: FAIL.

- [ ] **Step 4: Implementar `TiposDocumentoLista`** (client — molde de `CamposCustomLista`, com select de departamento)

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Botao } from "@/components/ui/Botao";
import { controleCls } from "@/components/ui/Campo";
import { DEPARTAMENTOS, rotuloDepartamento } from "@/lib/clientes/departamentos";
import {
  criarTipoDoc, moverTipoDoc, alternarAtivoTipoDoc, removerTipoDoc,
  type TipoDocRow,
} from "@/app/(app)/configuracoes/tipos-documento/actions";

export function TiposDocumentoLista({ tipos }: { tipos: TipoDocRow[] }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const run = (fn: () => Promise<{ erro?: string }>) =>
    start(async () => {
      const r = await fn();
      setErro(r.erro ?? null);
      if (!r.erro) router.refresh();
    });

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {tipos.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-linha bg-white p-3 text-sm">
            <span className={t.ativo ? "text-grafite" : "text-cinza line-through"}>{t.nome}</span>
            {t.departamento && <span className="text-cinza">{rotuloDepartamento(t.departamento)}</span>}
            <span className="ml-auto flex items-center gap-2">
              <button type="button" disabled={pend} onClick={() => run(() => moverTipoDoc(t.id, "cima"))} aria-label="Subir">↑</button>
              <button type="button" disabled={pend} onClick={() => run(() => moverTipoDoc(t.id, "baixo"))} aria-label="Descer">↓</button>
              <button type="button" disabled={pend} onClick={() => run(() => alternarAtivoTipoDoc(t.id, !t.ativo))} className="underline">
                {t.ativo ? "desativar" : "ativar"}
              </button>
              <button type="button" disabled={pend} onClick={() => run(() => removerTipoDoc(t.id))} className="text-negativo underline">remover</button>
            </span>
          </li>
        ))}
        {tipos.length === 0 && <li className="text-sm text-cinza">Nenhum tipo cadastrado ainda.</li>}
      </ul>

      <form action={(fd) => run(() => criarTipoDoc(fd))} className="flex flex-wrap items-end gap-2 rounded-lg border border-linha bg-white p-3">
        <input name="nome" placeholder="nome do tipo" className={controleCls("compacto")} />
        <select name="departamento" defaultValue="" className={controleCls("compacto")}>
          <option value="">departamento (opcional)</option>
          {DEPARTAMENTOS.map((d) => (
            <option key={d.valor} value={d.valor}>{d.rotulo}</option>
          ))}
        </select>
        <Botao type="submit" variante="secundario" disabled={pend}>Adicionar tipo</Botao>
      </form>

      {erro && <p role="alert" className="text-sm text-negativo">{erro}</p>}
    </div>
  );
}
```

- [ ] **Step 5: `page.tsx`** (admin gate, molde de `campos-custom/page.tsx`)

```tsx
import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { TiposDocumentoLista } from "./TiposDocumentoLista";
import { listarTiposDocumento } from "./actions";

export const metadata = { title: "Tipos de documento" };

export default async function TiposDocumentoConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const tipos = await listarTiposDocumento();
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="Tipos de documento" subtitulo="Catálogo do GED — tipo e departamento sugerido" />
      <TiposDocumentoLista tipos={tipos} />
    </Container>
  );
}
```

- [ ] **Step 6: Link no hub** — adicionar ao array `ITENS` em `src/app/(app)/configuracoes/page.tsx`:

```tsx
  {
    href: "/configuracoes/tipos-documento",
    label: "Tipos de documento",
    desc: "Catálogo do GED — tipos e departamento, para classificar os arquivos do cliente.",
  },
```

- [ ] **Step 7: Rodar testes e guards** — Run: `npx vitest run src/tests/configuracoes/tipos-documento-lista.test.tsx src/tests/ui/rotas-alcancaveis.test.ts src/tests/ui/divida-ui.test.ts && npm run typecheck` — Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/configuracoes/tipos-documento" "src/app/(app)/configuracoes/page.tsx" src/tests/configuracoes/tipos-documento-lista.test.tsx
git commit -m "feat(rf060): catalogo tipo_documento (actions + tela de config + hub)"
```

---

### Task 4: Upload classificado

**Files:**
- Modify: `src/app/(app)/documentos/actions.ts` (`anexarDocumento`)
- Modify: `src/components/documentos/UploadDocumento.tsx` (props + campos tipo/departamento/competência)
- Modify: `src/components/documentos/DocumentosSection.tsx` (carrega `carregarTiposAtivos` e passa ao `UploadDocumento`)

**Interfaces:**
- Consumes: `carregarTiposAtivos` (T3), `competenciaParaData`/`departamentoDoTipo` (T2).

- [ ] **Step 1: `anexarDocumento` grava a taxonomia**

Em `src/app/(app)/documentos/actions.ts`, imports:
```ts
import { competenciaParaData } from "@/lib/documentos/taxonomia";
import { carregarTiposAtivos } from "@/app/(app)/configuracoes/tipos-documento/actions";
```
No corpo, após validar o arquivo e antes do insert, resolver a taxonomia do form:
```ts
  const tipoId = String(formData.get("tipo_id") ?? "") || null;
  const tipos = tipoId ? await carregarTiposAtivos() : [];
  const tipoSel = tipoId ? tipos.find((t) => t.id === tipoId) : undefined;
  if (tipoId && !tipoSel) return { erro: "Tipo de documento inválido." };
  const depRaw = String(formData.get("departamento") ?? "").trim();
  const departamento = depRaw || tipoSel?.departamento || null;
  const competencia = competenciaParaData(String(formData.get("competencia") ?? ""));
  const tipoLabel = tipoSel?.nome ?? (String(formData.get("tipo") ?? "").trim().slice(0, 60) || null);
```
E no `.insert({...})` de `documentos`, incluir:
```ts
    tipo: tipoLabel,
    tipo_id: tipoId,
    departamento,
    competencia,
```
(substituindo o `tipo` que antes vinha só do input livre).

- [ ] **Step 2: `UploadDocumento` recebe os tipos e ganha os campos**

Trocar a assinatura para `UploadDocumento({ clienteId, tipos }: { clienteId: string; tipos: { id: string; nome: string; departamento: string | null }[] })`. Substituir o campo "Tipo (opcional)" livre por:
- **Tipo**: `<select name="tipo_id">` com `<option value="">— tipo —</option>` + os `tipos`. Se `tipos.length === 0`, manter o input `name="tipo"` livre (fallback).
- **Departamento**: `<select name="departamento">` com `DEPARTAMENTOS` (opcional; vazio = usa o do tipo).
- **Competência**: `<input type="month" name="competencia">` (opcional).
Todos via `controleCls()`.

- [ ] **Step 3: `DocumentosSection` carrega os tipos**

Adicionar `import { carregarTiposAtivos } from "@/app/(app)/configuracoes/tipos-documento/actions";`, carregar `const tipos = await carregarTiposAtivos();` e passar `<UploadDocumento clienteId={clienteId} tipos={tipos} />`.

- [ ] **Step 4: Verificar** — Run: `npm run typecheck && npx vitest run src/tests/ui/divida-ui.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/documentos/actions.ts" src/components/documentos/UploadDocumento.tsx src/components/documentos/DocumentosSection.tsx
git commit -m "feat(rf060): upload classificado (tipo do catalogo + departamento + competencia)"
```

---

### Task 5: Listagem com colunas e filtros

**Files:**
- Create: `src/components/documentos/DocumentosTabela.tsx` (client — tabela + filtros)
- Modify: `src/components/documentos/DocumentosSection.tsx` (carrega os campos novos + nome do tipo + assinatura achatada; delega a tabela ao client)
- Test: `src/tests/documentos/documentos-tabela.test.tsx`

**Interfaces:**
- Consumes: `competenciaRotulo` (T2), `rotuloDepartamento` (`@/lib/clientes/departamentos`), `BotaoBaixar`/`BotaoExcluirDocumento`/`StatusAssinatura`/`EnviarAssinatura`.
- Produces (o item serializável passado à tabela):
  ```ts
  type DocItem = {
    id: string; nome: string; origem: string; enviado_em: string; visto: string | null;
    tipo: string | null; departamento: string | null; competencia: string | null;
    ehContrato: boolean; assinatura: { status: string; signatarios: { nome: string; papel: string; status: string }[] } | null;
  };
  ```

- [ ] **Step 1: Render test (falha)**

`src/tests/documentos/documentos-tabela.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/components/documentos/BotaoBaixar", () => ({ BotaoBaixar: () => null }));
vi.mock("@/components/documentos/BotaoExcluirDocumento", () => ({ BotaoExcluirDocumento: () => null }));
vi.mock("@/components/assinatura/StatusAssinatura", () => ({ StatusAssinatura: () => null }));
vi.mock("@/components/assinatura/EnviarAssinatura", () => ({ EnviarAssinatura: () => null }));
import { renderToStaticMarkup } from "react-dom/server";
import { DocumentosTabela } from "@/components/documentos/DocumentosTabela";

const doc = {
  id: "d1", nome: "guia.pdf", origem: "escritorio", enviado_em: "2026-07-19T00:00:00Z", visto: null,
  tipo: "Guia", departamento: "fiscal", competencia: "2026-07-01", ehContrato: false, assinatura: null,
};

describe("DocumentosTabela", () => {
  it("mostra colunas de departamento e competência", () => {
    const html = renderToStaticMarkup(
      <DocumentosTabela docs={[doc]} clienteId="c1" clienteNome="X" clienteEmail="x@x" podeGerenciar ehAdmin={false} />,
    );
    expect(html).toContain("Departamento");
    expect(html).toContain("Competência");
    expect(html).toContain("Guia");
    expect(html).toContain("07/2026");
    expect(html).toContain("Fiscal");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npx vitest run src/tests/documentos/documentos-tabela.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implementar `DocumentosTabela`** (client; filtros por departamento/tipo/competência via estado, filtrando o array em memória)

```tsx
"use client";
import { useMemo, useState } from "react";
import { formatarData } from "@/lib/format";
import { rotuloDepartamento } from "@/lib/clientes/departamentos";
import { competenciaRotulo } from "@/lib/documentos/taxonomia";
import { controleCls } from "@/components/ui/Campo";
import { BotaoBaixar } from "./BotaoBaixar";
import { BotaoExcluirDocumento } from "./BotaoExcluirDocumento";
import { StatusAssinatura } from "@/components/assinatura/StatusAssinatura";
import { EnviarAssinatura } from "@/components/assinatura/EnviarAssinatura";

type DocItem = {
  id: string; nome: string; origem: string; enviado_em: string; visto: string | null;
  tipo: string | null; departamento: string | null; competencia: string | null;
  ehContrato: boolean;
  assinatura: { status: string; signatarios: { nome: string; papel: string; status: string }[] } | null;
};

export function DocumentosTabela({
  docs, clienteId, clienteNome, clienteEmail, podeGerenciar, ehAdmin,
}: {
  docs: DocItem[]; clienteId: string; clienteNome: string; clienteEmail: string;
  podeGerenciar: boolean; ehAdmin: boolean;
}) {
  const [dep, setDep] = useState("");
  const [tipo, setTipo] = useState("");
  const [comp, setComp] = useState(""); // "YYYY-MM"

  const deps = useMemo(() => [...new Set(docs.map((d) => d.departamento).filter(Boolean))] as string[], [docs]);
  const tipos = useMemo(() => [...new Set(docs.map((d) => d.tipo).filter(Boolean))] as string[], [docs]);

  const filtrados = docs.filter(
    (d) =>
      (!dep || d.departamento === dep) &&
      (!tipo || d.tipo === tipo) &&
      (!comp || (d.competencia ?? "").startsWith(comp)),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select value={dep} onChange={(e) => setDep(e.target.value)} className={controleCls("compacto")}>
          <option value="">todos os departamentos</option>
          {deps.map((d) => <option key={d} value={d}>{rotuloDepartamento(d)}</option>)}
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={controleCls("compacto")}>
          <option value="">todos os tipos</option>
          {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input type="month" value={comp} onChange={(e) => setComp(e.target.value)} className={controleCls("compacto")} />
      </div>

      <div className="overflow-hidden rounded border border-linha">
        <table className="w-full text-sm">
          <caption className="sr-only">Documentos do cliente</caption>
          <thead className="bg-creme text-left text-cinza">
            <tr>
              <th className="p-2 font-medium">Nome</th>
              <th className="p-2 font-medium">Tipo</th>
              <th className="p-2 font-medium">Departamento</th>
              <th className="p-2 font-medium">Competência</th>
              <th className="p-2 font-medium">Enviado em</th>
              <th className="p-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((d) => (
              <tr key={d.id} className="border-t border-linha/70 align-top">
                <td className="p-2 text-texto">
                  {d.nome}
                  {d.origem === "cliente" && (
                    <span className="ml-2 rounded-full bg-violeta/10 px-2 py-0.5 text-xs text-violeta">enviado pelo cliente</span>
                  )}
                  <span className="ml-2 text-xs text-cinza">
                    {d.visto ? `· visto em ${formatarData(d.visto)}` : "· não visualizado"}
                  </span>
                </td>
                <td className="p-2 text-cinza">{d.tipo ?? "—"}</td>
                <td className="p-2 text-cinza">{d.departamento ? rotuloDepartamento(d.departamento) : "—"}</td>
                <td className="p-2 text-cinza">{competenciaRotulo(d.competencia)}</td>
                <td className="p-2 text-cinza"><time dateTime={d.enviado_em}>{formatarData(d.enviado_em)}</time></td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-2">
                    <BotaoBaixar documentoId={d.id} nome={d.nome} />
                    {ehAdmin && <BotaoExcluirDocumento documentoId={d.id} clienteId={clienteId} nome={d.nome} />}
                  </div>
                  {d.ehContrato && podeGerenciar && (
                    <div className="mt-2 space-y-2">
                      {d.assinatura && <StatusAssinatura status={d.assinatura.status} signatarios={d.assinatura.signatarios} />}
                      {(!d.assinatura || d.assinatura.status === "recusado" || d.assinatura.status === "cancelado") && (
                        <EnviarAssinatura documentoId={d.id} clienteId={clienteId} clienteNome={clienteNome} clienteEmail={clienteEmail} />
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr><td colSpan={6} className="p-3 text-center text-cinza-claro">Nenhum documento com esses filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npx vitest run src/tests/documentos/documentos-tabela.test.tsx` — Expected: PASS.

- [ ] **Step 5: `DocumentosSection` monta o `DocItem[]` e delega**

Em `DocumentosSection.tsx`:
- Ampliar o `select` de `documentos` para `"id, nome, tipo, tipo_id, departamento, competencia, enviado_em, origem"`.
- Manter o load de `assinaturas` e `vistos`.
- Montar `docs: DocItem[]` achatando: `visto = vistos.get(d.id) ?? null`; `ehContrato = d.tipo === "Contrato" && d.nome.toLowerCase().endsWith(".pdf")`; `assinatura = porDoc.get(d.id) ? { status, signatarios } : null` (mapear `assinatura_signatarios`).
- Substituir o bloco `<table>…</table>` inteiro por `<DocumentosTabela docs={docs} clienteId={clienteId} clienteNome={clienteNome} clienteEmail={clienteEmail} podeGerenciar={podeGerenciar} ehAdmin={ehAdmin} />` (mantendo o cabeçalho, o `UploadDocumento`, o tratamento de `error` e o "Nenhum documento anexado").

- [ ] **Step 6: Verificar** — Run: `npm run typecheck && npx vitest run src/tests/documentos/ src/tests/ui/divida-ui.test.ts` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/documentos/DocumentosTabela.tsx src/components/documentos/DocumentosSection.tsx src/tests/documentos/documentos-tabela.test.tsx
git commit -m "feat(rf060): listagem de documentos com departamento/competencia e filtros"
```

---

### Task 6: Release

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm test && npm run format && npm run build` — tudo verde.
- [ ] **Step 2:** bump de versão (minor) + CHANGELOG (mesmo PR).
- [ ] **Step 3:** aplicar migration 0111 em produção (`node --env-file=.env.producao.bak scripts/db-migrate.mjs`) **antes** de Implantar.
- [ ] **Step 4:** REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch (PR `develop`→`main`, `gh pr checks --watch`, merge). Implantar, confirmar `/api/health`, tag depois.

---

## Self-Review

- **Cobertura da spec (Fatia A):** catálogo `tipo_documento` + config admin (T1/T3), eixos departamento/competência em `documentos` (T1), lógica pura (T2), upload classificado com denormalização do `tipo` texto (T4), listagem com colunas + filtros preservando o caso `"Contrato"` (T5), release com migration em prod (T6). Versionamento é Fatia B (fora deste plano). Fora de escopo respeitado (sem OCR/busca/retenção).
- **Placeholders:** nenhum passo de código sem código.
- **Consistência de tipos:** `carregarTiposAtivos` (T3) alimenta T4; `competenciaParaData`/`competenciaRotulo`/`departamentoDoTipo` (T2) usados em T4/T5; `DocItem` (T5) montado em `DocumentosSection` a partir do select ampliado; `tipo` texto continua sendo a fonte do `ehContrato`.
