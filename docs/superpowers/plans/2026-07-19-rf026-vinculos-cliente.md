# RF-026 — Vínculos entre entidades — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dar ao cadastro do cliente os vínculos manuais entre entidades — grupo econômico, matriz/filial e sócios em comum — e deixar o aviso de CPF/CNPJ duplicado citar o cliente existente com link.

**Architecture:** três estruturas explícitas no Postgres (`grupo_economico`+`clientes.grupo_id`; `clientes.matriz_id` auto-ref; `socio`+`cliente_socio`), lógica pura de consolidação em `src/lib/clientes/vinculos.ts`, server actions em `src/app/(app)/clientes/[id]/vinculos-actions.ts`, e uma `VinculosSection` na aba cadastro. O aviso de duplicidade reusa a detecção que já existe em `criarCliente`.

**Tech Stack:** Next 16 (App Router, server components + server actions), TypeScript, Tailwind 4, Supabase (Postgres/RLS), vitest + `react-dom/server` para render tests.

## Global Constraints

- Next 16: `middleware.ts` é `proxy.ts`; imports via alias `@/*`; imagens só `next/image`.
- Papel (RBAC): ler só de `usuarios.papel` via `auth_papel()`; nunca do JWT/`app_metadata`.
- Migrations: aplicadas pelo runner `npm run db:migrate` (NÃO `supabase db push`); **imutáveis** após aplicadas; **idempotentes** (`create table if not exists`, `add column if not exists`, `drop policy if exists ... ; create policy ...`). Migration nova numerada após a última existente.
- Guard `divida-ui` (`src/tests/ui/divida-ui.test.ts`): inputs **não** podem declarar `border` estático → usar `ring-1 ring-inset ring-linha`.
- Rodar antes de commitar/entregar: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`, `npm run build`. O CI roda os mesmos + `format:check`.
- Entrega por PR: `git push origin develop` → `gh pr create --base main --head develop` → `gh pr checks --watch` → `gh pr merge --merge`. Tag só **depois** do deploy confirmado no `/api/health`.
- Deploy NÃO é automático: migration aplicada em produção via runner **antes** de clicar Implantar; confirmar versão em `https://app.seusaldo.ai/api/health`.
- `package.json.version` sobe junto com o CHANGELOG **no mesmo PR** (`src/tests/versao.test.ts` exige que batam).

---

# FATIA A — Grupo econômico + matriz/filial + aviso de duplicidade amigável

### Task A1: Migration 0107 — colunas de vínculo, `grupo_economico` e RLS

**Files:**
- Create: `supabase/migrations/0107_vinculos_cliente.sql`

**Interfaces:**
- Produces: tabela `grupo_economico(id uuid, nome text, criado_em timestamptz)`; colunas `clientes.grupo_id uuid`, `clientes.matriz_id uuid`; constraint `clientes_matriz_nao_self`.

- [ ] **Step 1: Escrever a migration**

```sql
-- RF-026 (Fatia A): grupo econômico + matriz/filial.
create table if not exists grupo_economico (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

alter table clientes add column if not exists grupo_id  uuid references grupo_economico(id) on delete set null;
alter table clientes add column if not exists matriz_id uuid references clientes(id)        on delete set null;
do $$ begin
  alter table clientes drop constraint if exists clientes_matriz_nao_self;
  alter table clientes add  constraint clientes_matriz_nao_self check (matriz_id is null or matriz_id <> id);
end $$;

-- RLS: dicionário compartilhado — leitura para a equipe, escrita admin/assistente.
alter table grupo_economico enable row level security;
drop policy if exists grupo_economico_read  on grupo_economico;
drop policy if exists grupo_economico_write on grupo_economico;
create policy grupo_economico_read  on grupo_economico for select
  using (auth_papel() in ('admin','assistente','contador'));
create policy grupo_economico_write on grupo_economico for all
  using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));
```

- [ ] **Step 2: Conferir idempotência e formato**

Reler o arquivo: `create table if not exists`, `add column if not exists`, `drop constraint if exists` antes de `add constraint`, `drop policy if exists` antes de `create policy`. Nenhuma edição de migration já aplicada.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0107_vinculos_cliente.sql
git commit -m "feat(rf026): migration 0107 grupo economico + matriz/filial"
```

> **Aplicação em produção:** roda no release da Fatia A (via `node --env-file=.env.producao.bak scripts/db-migrate.mjs`), **antes** de Implantar. Não aplicar agora.

---

### Task A2: Lógica pura — `consolidarRelacionadas` e `validarNovaMatriz`

**Files:**
- Create: `src/lib/clientes/vinculos.ts`
- Test: `src/tests/clientes/vinculos.test.ts`

**Interfaces:**
- Produces:
  - `type VinculoTipo = "grupo" | "matriz" | "filial" | "socio"`
  - `type EmpresaRelacionada = { clienteId: string; nome: string; tipos: VinculoTipo[] }`
  - `consolidarRelacionadas(self: string, fontes: { tipo: VinculoTipo; empresas: { clienteId: string; nome: string }[] }[]): EmpresaRelacionada[]`
  - `validarNovaMatriz(clienteId: string, matrizId: string, matrizEhFilial: boolean): string | null`

- [ ] **Step 1: Escrever os testes (falham)**

```ts
import { describe, it, expect } from "vitest";
import { consolidarRelacionadas, validarNovaMatriz } from "@/lib/clientes/vinculos";

describe("consolidarRelacionadas", () => {
  it("dedup por clienteId e acumula tipos", () => {
    const r = consolidarRelacionadas("self", [
      { tipo: "grupo", empresas: [{ clienteId: "b", nome: "B" }] },
      { tipo: "socio", empresas: [{ clienteId: "b", nome: "B" }, { clienteId: "c", nome: "C" }] },
    ]);
    expect(r).toEqual([
      { clienteId: "b", nome: "B", tipos: ["grupo", "socio"] },
      { clienteId: "c", nome: "C", tipos: ["socio"] },
    ]);
  });

  it("exclui o próprio cliente", () => {
    const r = consolidarRelacionadas("self", [
      { tipo: "grupo", empresas: [{ clienteId: "self", nome: "Eu" }, { clienteId: "b", nome: "B" }] },
    ]);
    expect(r).toEqual([{ clienteId: "b", nome: "B", tipos: ["grupo"] }]);
  });

  it("lista vazia quando não há fontes", () => {
    expect(consolidarRelacionadas("self", [])).toEqual([]);
  });
});

describe("validarNovaMatriz", () => {
  it("recusa o próprio cliente como matriz", () => {
    expect(validarNovaMatriz("a", "a", false)).toBe("Um cliente não pode ser a própria matriz.");
  });
  it("recusa uma filial como matriz", () => {
    expect(validarNovaMatriz("a", "b", true)).toBe("O cliente escolhido já é uma filial; escolha a matriz dele.");
  });
  it("aceita uma matriz válida", () => {
    expect(validarNovaMatriz("a", "b", false)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/clientes/vinculos.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
export type VinculoTipo = "grupo" | "matriz" | "filial" | "socio";
export type EmpresaRelacionada = { clienteId: string; nome: string; tipos: VinculoTipo[] };

export function consolidarRelacionadas(
  self: string,
  fontes: { tipo: VinculoTipo; empresas: { clienteId: string; nome: string }[] }[],
): EmpresaRelacionada[] {
  const porId = new Map<string, EmpresaRelacionada>();
  const ordem: string[] = [];
  for (const { tipo, empresas } of fontes) {
    for (const e of empresas) {
      if (e.clienteId === self) continue;
      let atual = porId.get(e.clienteId);
      if (!atual) {
        atual = { clienteId: e.clienteId, nome: e.nome, tipos: [] };
        porId.set(e.clienteId, atual);
        ordem.push(e.clienteId);
      }
      if (!atual.tipos.includes(tipo)) atual.tipos.push(tipo);
    }
  }
  return ordem.map((id) => porId.get(id)!);
}

export function validarNovaMatriz(
  clienteId: string,
  matrizId: string,
  matrizEhFilial: boolean,
): string | null {
  if (matrizId === clienteId) return "Um cliente não pode ser a própria matriz.";
  if (matrizEhFilial) return "O cliente escolhido já é uma filial; escolha a matriz dele.";
  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/clientes/vinculos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clientes/vinculos.ts src/tests/clientes/vinculos.test.ts
git commit -m "feat(rf026): logica pura de vinculos (consolidar + validar matriz)"
```

---

### Task A3: Actions de grupo e matriz/filial

**Files:**
- Create: `src/app/(app)/clientes/[id]/vinculos-actions.ts`

**Interfaces:**
- Consumes: `validarNovaMatriz` (A2), `createServerSupabase` (`@/lib/supabase/server`).
- Produces:
  - `definirGrupo(clienteId: string, grupoId: string | null): Promise<{ erro?: string }>`
  - `criarGrupo(clienteId: string, nome: string): Promise<{ erro?: string }>`
  - `definirMatriz(clienteId: string, matrizId: string | null): Promise<{ erro?: string }>`

- [ ] **Step 1: Implementar as actions**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { validarNovaMatriz } from "@/lib/clientes/vinculos";

const rev = (id: string) => revalidatePath(`/clientes/${id}`);

export async function definirGrupo(clienteId: string, grupoId: string | null): Promise<{ erro?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("clientes").update({ grupo_id: grupoId }).eq("id", clienteId);
  if (error) return { erro: "Não foi possível alterar o grupo (sem permissão?)." };
  rev(clienteId);
  return {};
}

export async function criarGrupo(clienteId: string, nome: string): Promise<{ erro?: string }> {
  const limpo = nome.trim();
  if (!limpo) return { erro: "Informe o nome do grupo." };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("grupo_economico").insert({ nome: limpo }).select("id").single();
  if (error || !data) return { erro: "Não foi possível criar o grupo (sem permissão?)." };
  return definirGrupo(clienteId, data.id as string);
}

export async function definirMatriz(clienteId: string, matrizId: string | null): Promise<{ erro?: string }> {
  const supabase = await createServerSupabase();
  if (matrizId) {
    const { data: alvo } = await supabase
      .from("clientes")
      .select("matriz_id")
      .eq("id", matrizId)
      .maybeSingle();
    const erro = validarNovaMatriz(clienteId, matrizId, alvo?.matriz_id != null);
    if (erro) return { erro };
  }
  const { error } = await supabase.from("clientes").update({ matriz_id: matrizId }).eq("id", clienteId);
  if (error) return { erro: "Não foi possível definir a matriz (sem permissão?)." };
  rev(clienteId);
  return {};
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/clientes/[id]/vinculos-actions.ts
git commit -m "feat(rf026): actions de grupo e matriz/filial"
```

---

### Task A4: `VinculosSection` (grupo + matriz/filial) e wiring na página

**Files:**
- Create: `src/components/clientes/VinculosSection.tsx`
- Modify: `src/app/(app)/clientes/[id]/page.tsx` (carregar dados + renderizar a seção após `LegalizacaoSection`)
- Test: `src/tests/clientes/vinculos-section.test.tsx`

**Interfaces:**
- Consumes: `definirGrupo`/`criarGrupo`/`definirMatriz` (A3), `EmpresaRelacionada` (A2).
- Produces (props do componente presentacional):
  ```ts
  type VinculosProps = {
    clienteId: string;
    podeEditar: boolean;
    grupo: { id: string; nome: string } | null;
    gruposDisponiveis: { id: string; nome: string }[];
    matriz: { id: string; razao_social: string } | null;
    filiais: { id: string; razao_social: string }[];
    candidatosMatriz: { id: string; razao_social: string }[];
    relacionadas: EmpresaRelacionada[];
  };
  ```

- [ ] **Step 1: Escrever o render test (falha)**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/clientes/[id]/vinculos-actions", () => ({
  definirGrupo: vi.fn(), criarGrupo: vi.fn(), definirMatriz: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { VinculosSection } from "@/components/clientes/VinculosSection";

describe("VinculosSection", () => {
  it("renderiza grupo, matriz/filial e empresas relacionadas", () => {
    const html = renderToStaticMarkup(
      <VinculosSection
        clienteId="a"
        podeEditar
        grupo={{ id: "g1", nome: "Grupo Alfa" }}
        gruposDisponiveis={[{ id: "g1", nome: "Grupo Alfa" }]}
        matriz={null}
        filiais={[{ id: "f1", razao_social: "Filial Um" }]}
        candidatosMatriz={[]}
        relacionadas={[{ clienteId: "f1", nome: "Filial Um", tipos: ["filial"] }]}
      />,
    );
    expect(html).toContain("Vínculos");
    expect(html).toContain("Grupo Alfa");
    expect(html).toContain("Filial Um");
  });

  it("sem border estático nos inputs (guard divida-ui)", () => {
    const html = renderToStaticMarkup(
      <VinculosSection
        clienteId="a" podeEditar grupo={null} gruposDisponiveis={[]}
        matriz={null} filiais={[]} candidatosMatriz={[]} relacionadas={[]}
      />,
    );
    expect(html).not.toMatch(/<(input|select)[^>]*\bborder\b/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/clientes/vinculos-section.test.tsx`
Expected: FAIL (componente não existe).

- [ ] **Step 3: Implementar `VinculosSection`**

```tsx
"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Botao } from "@/components/ui/Botao";
import { controleCls } from "@/components/ui/Campo";
import type { EmpresaRelacionada, VinculoTipo } from "@/lib/clientes/vinculos";
import { definirGrupo, criarGrupo, definirMatriz } from "@/app/(app)/clientes/[id]/vinculos-actions";

const ROTULO: Record<VinculoTipo, string> = {
  grupo: "mesmo grupo", matriz: "matriz", filial: "filial", socio: "mesmo sócio",
};

type VinculosProps = {
  clienteId: string;
  podeEditar: boolean;
  grupo: { id: string; nome: string } | null;
  gruposDisponiveis: { id: string; nome: string }[];
  matriz: { id: string; razao_social: string } | null;
  filiais: { id: string; razao_social: string }[];
  candidatosMatriz: { id: string; razao_social: string }[];
  relacionadas: EmpresaRelacionada[];
};

export function VinculosSection(props: VinculosProps) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [novoGrupo, setNovoGrupo] = useState("");

  const run = (fn: () => Promise<{ erro?: string }>) =>
    start(async () => {
      const r = await fn();
      setErro(r.erro ?? null);
      if (!r.erro) router.refresh();
    });

  return (
    <section className="rounded-lg border border-linha bg-white p-4 space-y-4">
      <h3 className="text-sm font-semibold text-grafite">Vínculos</h3>

      {/* Grupo econômico */}
      <div className="space-y-2">
        <p className="text-sm text-cinza">
          Grupo econômico: <span className="text-grafite">{props.grupo?.nome ?? "sem grupo"}</span>
        </p>
        {props.podeEditar && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={controleCls("compacto")}
              value={props.grupo?.id ?? ""}
              disabled={pend}
              onChange={(e) => run(() => definirGrupo(props.clienteId, e.target.value || null))}
            >
              <option value="">sem grupo</option>
              {props.gruposDisponiveis.map((g) => (
                <option key={g.id} value={g.id}>{g.nome}</option>
              ))}
            </select>
            <input
              className={controleCls("compacto")}
              placeholder="novo grupo"
              value={novoGrupo}
              disabled={pend}
              onChange={(e) => setNovoGrupo(e.target.value)}
            />
            <Botao
              type="button"
              variante="secundario"
              disabled={pend || !novoGrupo.trim()}
              onClick={() => run(async () => { const r = await criarGrupo(props.clienteId, novoGrupo); if (!r.erro) setNovoGrupo(""); return r; })}
            >
              Criar e vincular
            </Botao>
          </div>
        )}
      </div>

      {/* Matriz / filial */}
      <div className="space-y-2">
        {props.matriz ? (
          <p className="text-sm text-cinza">
            Filial de{" "}
            <Link href={`/clientes/${props.matriz.id}`} className="underline">{props.matriz.razao_social}</Link>
          </p>
        ) : (
          <p className="text-sm text-cinza">
            Matriz{props.filiais.length > 0 ? " de:" : " (sem filiais)"}
          </p>
        )}
        {props.filiais.length > 0 && (
          <ul className="text-sm">
            {props.filiais.map((f) => (
              <li key={f.id}>
                <Link href={`/clientes/${f.id}`} className="underline">{f.razao_social}</Link>
              </li>
            ))}
          </ul>
        )}
        {props.podeEditar && !props.matriz && (
          <select
            className={controleCls("compacto")}
            value=""
            disabled={pend}
            onChange={(e) => run(() => definirMatriz(props.clienteId, e.target.value || null))}
          >
            <option value="">definir matriz…</option>
            {props.candidatosMatriz.map((c) => (
              <option key={c.id} value={c.id}>{c.razao_social}</option>
            ))}
          </select>
        )}
        {props.podeEditar && props.matriz && (
          <Botao type="button" variante="secundario" disabled={pend} onClick={() => run(() => definirMatriz(props.clienteId, null))}>
            Desvincular da matriz
          </Botao>
        )}
      </div>

      {/* Empresas relacionadas */}
      {props.relacionadas.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-grafite">Empresas relacionadas</p>
          <ul className="text-sm">
            {props.relacionadas.map((r) => (
              <li key={r.clienteId}>
                <Link href={`/clientes/${r.clienteId}`} className="underline">{r.nome}</Link>{" "}
                <span className="text-cinza">({r.tipos.map((t) => ROTULO[t]).join(", ")})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {erro && <p role="alert" className="text-sm text-negativo">{erro}</p>}
    </section>
  );
}
```

> **Nota de wiring:** caminhos confirmados — `Botao` em `@/components/ui/Botao`, `controleCls` em `@/components/ui/Campo`. `controleCls("compacto")` deve produzir `ring-1 ring-inset ring-linha`, nunca `border` (guard `divida-ui`).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/clientes/vinculos-section.test.tsx`
Expected: PASS.

- [ ] **Step 5: Carregar os dados e renderizar na página**

Em `src/app/(app)/clientes/[id]/page.tsx`:

1. Adicionar `grupo_id, matriz_id` ao `.select(...)` de `clientes` (linha ~75).
2. Após o load do cliente, carregar os dados de vínculo (grupo/matriz/filiais/candidatos) e montar `relacionadas` com `consolidarRelacionadas` (fontes `grupo` e `filial`/`matriz`; a fonte `socio` entra na Fatia B).
3. Importar `VinculosSection` e renderizá-la logo após o bloco de `LegalizacaoSection` (dentro de `aba === "cadastro"`), gated por `podeCriarCliente(papel)`, passando `podeEditar={podeCriarCliente(papel)}`.

```tsx
// imports
import { VinculosSection } from "@/components/clientes/VinculosSection";
import { consolidarRelacionadas } from "@/lib/clientes/vinculos";

// após `if (!cliente) notFound();`
const cli = cliente as { grupo_id: string | null; matriz_id: string | null };
const [{ data: grupoRow }, { data: gruposRows }, { data: filiaisRows }, { data: matrizRow }, { data: gruposMatesRows }, { data: candMatrizRows }] =
  await Promise.all([
    cli.grupo_id ? supabase.from("grupo_economico").select("id, nome").eq("id", cli.grupo_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("grupo_economico").select("id, nome").order("nome"),
    supabase.from("clientes").select("id, razao_social").eq("matriz_id", id),
    cli.matriz_id ? supabase.from("clientes").select("id, razao_social").eq("id", cli.matriz_id).maybeSingle() : Promise.resolve({ data: null }),
    cli.grupo_id ? supabase.from("clientes").select("id, razao_social").eq("grupo_id", cli.grupo_id) : Promise.resolve({ data: [] }),
    supabase.from("clientes").select("id, razao_social").is("matriz_id", null).neq("id", id).order("razao_social"),
  ]);

const filiais = (filiaisRows ?? []).map((f) => ({ id: f.id as string, razao_social: f.razao_social as string }));
const relacionadas = consolidarRelacionadas(id, [
  { tipo: "grupo", empresas: (gruposMatesRows ?? []).map((g) => ({ clienteId: g.id as string, nome: g.razao_social as string })) },
  { tipo: "filial", empresas: filiais.map((f) => ({ clienteId: f.id, nome: f.razao_social })) },
  ...(matrizRow ? [{ tipo: "matriz" as const, empresas: [{ clienteId: matrizRow.id as string, nome: matrizRow.razao_social as string }] }] : []),
]);
```

```tsx
{/* após o bloco de LegalizacaoSection, dentro de aba === "cadastro" */}
{podeCriarCliente(papel) && (
  <VinculosSection
    clienteId={id}
    podeEditar={podeCriarCliente(papel)}
    grupo={grupoRow ? { id: grupoRow.id as string, nome: grupoRow.nome as string } : null}
    gruposDisponiveis={(gruposRows ?? []).map((g) => ({ id: g.id as string, nome: g.nome as string }))}
    matriz={matrizRow ? { id: matrizRow.id as string, razao_social: matrizRow.razao_social as string } : null}
    filiais={filiais}
    candidatosMatriz={(candMatrizRows ?? []).map((c) => ({ id: c.id as string, razao_social: c.razao_social as string }))}
    relacionadas={relacionadas}
  />
)}
```

- [ ] **Step 6: Verificar build e guards**

Run: `npm run typecheck && npx vitest run src/tests/ui/divida-ui.test.ts src/tests/clientes/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/clientes/VinculosSection.tsx src/tests/clientes/vinculos-section.test.tsx "src/app/(app)/clientes/[id]/page.tsx"
git commit -m "feat(rf026): VinculosSection (grupo + matriz/filial) na aba cadastro"
```

---

### Task A5: Aviso de duplicidade amigável (nome + link)

**Files:**
- Modify: `src/app/(app)/clientes/estados.ts` (adicionar `duplicadoId`)
- Modify: `src/app/(app)/clientes/actions.ts` (branch `23505` de `criarCliente`)
- Modify: `src/components/FormCliente.tsx` (link para o cliente existente)

**Interfaces:**
- Consumes/Produces: `type EstadoCliente = { erro?: string; reativarId?: string; duplicadoId?: string }`.

- [ ] **Step 1: Estender o estado**

Em `estados.ts`:

```ts
export type EstadoCliente = { erro?: string; reativarId?: string; duplicadoId?: string };
```

- [ ] **Step 2: Enriquecer as mensagens em `criarCliente`**

Substituir o bloco `23505` (`actions.ts:102-115`) por:

```ts
    if (error.code === "23505") {
      const { data: existente } = await supabase
        .from("clientes")
        .select("id, status, razao_social")
        .eq("cpf_cnpj", parsed.data.cpf_cnpj)
        .maybeSingle();
      const nome = existente?.razao_social ? ` (${existente.razao_social})` : "";
      if (existente?.status === "inativo") {
        return { erro: `CPF/CNPJ já cadastrado em um cliente INATIVO${nome}.`, reativarId: existente.id, duplicadoId: existente.id };
      }
      if (existente?.status === "ativo") {
        return { erro: `CPF/CNPJ já cadastrado em um cliente ativo${nome}.`, duplicadoId: existente?.id };
      }
      return { erro: `CPF/CNPJ já cadastrado${nome}. Procure um administrador.`, duplicadoId: existente?.id };
    }
```

- [ ] **Step 3: Mostrar o link no `FormCliente`**

Substituir o bloco de `estado.reativarId` (`FormCliente.tsx:358-365`) por um link genérico que cobre ativo e inativo:

```tsx
          {estado.duplicadoId && (
            <>
              {" "}
              <Link href={`/clientes/${estado.duplicadoId}`} className="underline">
                Abrir cliente existente
              </Link>
            </>
          )}
```

- [ ] **Step 4: Verificar typecheck e testes**

Run: `npm run typecheck && npx vitest run`
Expected: PASS (nenhum teste referenciava o texto exato das mensagens; se algum quebrar, ajustar a asserção para o novo texto).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/clientes/estados.ts" "src/app/(app)/clientes/actions.ts" src/components/FormCliente.tsx
git commit -m "feat(rf026): aviso de CPF/CNPJ duplicado cita nome e da link"
```

---

### Task A6: Release da Fatia A

- [ ] **Step 1: Suíte completa**

Run: `npm run lint && npm run typecheck && npm test && npm run format && npm run build`
Expected: tudo verde.

- [ ] **Step 2: Bump de versão + CHANGELOG** (minor, no mesmo PR — `versao.test.ts` exige bater).

- [ ] **Step 3: Aplicar a migration 0107 em produção** (runner), **antes** de Implantar.

```bash
node --env-file=.env.producao.bak scripts/db-migrate.mjs
```

- [ ] **Step 4: Finalizar a branch** — REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch (PR `develop`→`main`, `gh pr checks --watch`, merge). Implantar no EasyPanel, confirmar `/api/health`, **depois** a tag.

---

# FATIA B — Sócios em comum

### Task B1: Migration 0108 — `socio` + `cliente_socio` e RLS

**Files:**
- Create: `supabase/migrations/0108_socios_cliente.sql`

**Interfaces:**
- Produces: `socio(id uuid, nome text, cpf text unique, criado_em)`; `cliente_socio(cliente_id, socio_id)` PK composta.

- [ ] **Step 1: Escrever a migration**

```sql
-- RF-026 (Fatia B): sócios em comum.
create table if not exists socio (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text not null unique,
  criado_em timestamptz not null default now()
);

create table if not exists cliente_socio (
  cliente_id uuid not null references clientes(id) on delete cascade,
  socio_id  uuid not null references socio(id)     on delete cascade,
  primary key (cliente_id, socio_id)
);

alter table socio         enable row level security;
alter table cliente_socio enable row level security;
drop policy if exists socio_read  on socio;
drop policy if exists socio_write on socio;
create policy socio_read  on socio for select using (auth_papel() in ('admin','assistente','contador'));
create policy socio_write on socio for all
  using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));
drop policy if exists cliente_socio_read  on cliente_socio;
drop policy if exists cliente_socio_write on cliente_socio;
create policy cliente_socio_read  on cliente_socio for select using (auth_papel() in ('admin','assistente','contador'));
create policy cliente_socio_write on cliente_socio for all
  using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));
```

- [ ] **Step 2: Conferir idempotência**; **Step 3: Commit**

```bash
git add supabase/migrations/0108_socios_cliente.sql
git commit -m "feat(rf026): migration 0108 socios em comum"
```

> Aplicada em produção no release da Fatia B, antes de Implantar.

---

### Task B2: Actions de sócio

**Files:**
- Modify: `src/app/(app)/clientes/[id]/vinculos-actions.ts`

**Interfaces:**
- Produces:
  - `adicionarSocio(clienteId: string, nome: string, cpf: string): Promise<{ erro?: string }>`
  - `removerSocio(clienteId: string, socioId: string): Promise<{ erro?: string }>`

- [ ] **Step 1: Implementar**

```ts
export async function adicionarSocio(clienteId: string, nome: string, cpf: string): Promise<{ erro?: string }> {
  const nomeLimpo = nome.trim();
  const cpfDigitos = cpf.replace(/\D/g, "");
  if (!nomeLimpo || !cpfDigitos) return { erro: "Informe nome e CPF do sócio." };
  const supabase = await createServerSupabase();
  // upsert do sócio por CPF (reusa a pessoa → é assim que "em comum" acontece).
  const { data: socio, error: errSocio } = await supabase
    .from("socio")
    .upsert({ nome: nomeLimpo, cpf: cpfDigitos }, { onConflict: "cpf" })
    .select("id")
    .single();
  if (errSocio || !socio) return { erro: "Não foi possível salvar o sócio (sem permissão?)." };
  const { error } = await supabase
    .from("cliente_socio")
    .upsert({ cliente_id: clienteId, socio_id: socio.id as string });
  if (error) return { erro: "Não foi possível vincular o sócio (sem permissão?)." };
  rev(clienteId);
  return {};
}

export async function removerSocio(clienteId: string, socioId: string): Promise<{ erro?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("cliente_socio")
    .delete()
    .eq("cliente_id", clienteId)
    .eq("socio_id", socioId);
  if (error) return { erro: "Não foi possível remover o sócio (sem permissão?)." };
  rev(clienteId);
  return {};
}
```

> **Nota:** o `upsert` com `onConflict: "cpf"` sobrescreve o `nome` do sócio se o CPF já existir — comportamento aceitável (mantém o nome mais recente). Se preferir preservar o nome antigo, trocar por select-then-insert; decidir na implementação.

- [ ] **Step 2: Typecheck**; **Step 3: Commit**

```bash
git add "src/app/(app)/clientes/[id]/vinculos-actions.ts"
git commit -m "feat(rf026): actions de socio (adicionar/remover)"
```

---

### Task B3: Bloco de sócios na `VinculosSection`

**Files:**
- Modify: `src/components/clientes/VinculosSection.tsx` (bloco de sócios + props)
- Modify: `src/app/(app)/clientes/[id]/page.tsx` (carregar sócios + fonte `socio` no `consolidarRelacionadas`)
- Modify: `src/tests/clientes/vinculos-section.test.tsx` (cobrir o bloco de sócios)

**Interfaces:**
- Consumes: `adicionarSocio`/`removerSocio` (B2).
- Produces (props novas):
  ```ts
  socios: { id: string; nome: string; cpf: string; tambemEm: { id: string; razao_social: string }[] }[];
  ```

- [ ] **Step 1: Estender o render test (falha)**

Adicionar um caso que passa `socios` e espera o nome do sócio e "também em" no HTML; incluir `socios: []` nos casos existentes.

```tsx
  it("renderiza sócios e 'também em'", () => {
    const html = renderToStaticMarkup(
      <VinculosSection
        clienteId="a" podeEditar grupo={null} gruposDisponiveis={[]}
        matriz={null} filiais={[]} candidatosMatriz={[]} relacionadas={[]}
        socios={[{ id: "s1", nome: "João", cpf: "12345678901", tambemEm: [{ id: "b", razao_social: "Padaria B" }] }]}
      />,
    );
    expect(html).toContain("João");
    expect(html).toContain("Padaria B");
  });
```

- [ ] **Step 2: Rodar e ver falhar** (`socios` não existe nas props) → **Step 3: Implementar**

Adicionar `socios` ao tipo `VinculosProps` e um bloco após "Empresas relacionadas":

```tsx
      {/* Sócios */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-grafite">Sócios</p>
        <ul className="text-sm space-y-1">
          {props.socios.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2">
              <span className="text-grafite">{s.nome}</span>
              <span className="text-cinza">{s.cpf}</span>
              {s.tambemEm.length > 0 && (
                <span className="text-cinza">
                  também em: {s.tambemEm.map((e) => (
                    <Link key={e.id} href={`/clientes/${e.id}`} className="underline">{e.razao_social}</Link>
                  )).reduce((a, b) => <>{a}, {b}</>)}
                </span>
              )}
              {props.podeEditar && (
                <button type="button" className="text-negativo underline" disabled={pend}
                  onClick={() => run(() => removerSocio(props.clienteId, s.id))}>remover</button>
              )}
            </li>
          ))}
        </ul>
        {props.podeEditar && <AdicionarSocio clienteId={props.clienteId} onDone={() => router.refresh()} />}
      </div>
```

Adicionar um sub-componente `AdicionarSocio` (dois inputs `controleCls("compacto")` + `Botao`) no mesmo arquivo, chamando `adicionarSocio`. Atualizar os imports (`adicionarSocio`, `removerSocio`).

- [ ] **Step 4: Carregar sócios na página e somar a fonte `socio`**

Em `page.tsx`, carregar os sócios do cliente e, para cada um, os outros clientes com o mesmo `socio_id`; montar `socios` e adicionar a fonte `{ tipo: "socio", empresas: [...] }` ao `consolidarRelacionadas`.

```tsx
const { data: vinc } = await supabase.from("cliente_socio").select("socio_id, socio(id, nome, cpf)").eq("cliente_id", id);
const socioIds = (vinc ?? []).map((v) => v.socio_id as string);
const { data: colegas } = socioIds.length
  ? await supabase.from("cliente_socio").select("socio_id, cliente_id, clientes(id, razao_social)").in("socio_id", socioIds).neq("cliente_id", id)
  : { data: [] };
const socios = (vinc ?? []).map((v) => {
  const s = v.socio as unknown as { id: string; nome: string; cpf: string };
  const tambemEm = (colegas ?? [])
    .filter((c) => c.socio_id === v.socio_id)
    .map((c) => { const cl = c.clientes as unknown as { id: string; razao_social: string }; return { id: cl.id, razao_social: cl.razao_social }; });
  return { id: s.id, nome: s.nome, cpf: s.cpf, tambemEm };
});
const empresasSocio = (colegas ?? []).map((c) => { const cl = c.clientes as unknown as { id: string; razao_social: string }; return { clienteId: cl.id, nome: cl.razao_social }; });
// somar ao array de fontes do consolidarRelacionadas: { tipo: "socio", empresas: empresasSocio }
```

Passar `socios={socios}` ao `VinculosSection`.

- [ ] **Step 5: Rodar testes e build**

Run: `npm run typecheck && npx vitest run src/tests/clientes/ src/tests/ui/divida-ui.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/clientes/VinculosSection.tsx src/tests/clientes/vinculos-section.test.tsx "src/app/(app)/clientes/[id]/page.tsx"
git commit -m "feat(rf026): bloco de socios em comum na VinculosSection"
```

---

### Task B4: Release da Fatia B

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm test && npm run format && npm run build`.
- [ ] **Step 2:** bump de versão + CHANGELOG (mesmo PR).
- [ ] **Step 3:** aplicar migration 0108 em produção (runner) **antes** de Implantar.
- [ ] **Step 4:** REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch (PR, merge, Implantar, `/api/health`, tag depois).

---

## Self-Review

- **Cobertura da spec:** grupo econômico (A1/A3/A4), matriz/filial (A1/A3/A4), sócios em comum (B1/B2/B3), aviso de duplicidade amigável (A5), lógica pura `consolidarRelacionadas`/`validarNovaMatriz` (A2), RLS (A1/B1), verificação e release por fatia (A6/B4). Fora de escopo respeitado (sem detecção automática, sem percentual).
- **Placeholders:** nenhum passo de código sem código; as duas "Notas" (caminho de `Botao`/`controleCls`; semântica do upsert por CPF) são decisões pontuais a confirmar na implementação, não lacunas de conteúdo.
- **Consistência de tipos:** `VinculoTipo`/`EmpresaRelacionada`/`consolidarRelacionadas`/`validarNovaMatriz` (A2) usados igual em A3/A4/B3; `EstadoCliente` estendido com `duplicadoId` (A5) e consumido no `FormCliente`; props de `VinculosSection` crescem de A4 para B3 de forma aditiva (`socios`).
