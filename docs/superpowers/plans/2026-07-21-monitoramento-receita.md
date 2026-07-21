# RF-084 — Monitoramento de fontes públicas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir situação cadastral + opção Simples de cada cliente, alertar a equipe na mudança (badge + tela) e reconsultar automaticamente por cron.

**Architecture:** Reusa `consultarCnpj` (BrasilAPI→ReceitaWS). Estado atual em `clientes`; mudanças viram `receita_alerta` (via lib pura `detectarMudancas`). Fatia A liga isso ao botão manual; Fatia B ao cron. Config em `receita_config`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (RLS + service_role), pg_cron, Tailwind 4, Vitest.

## Global Constraints

- Alias `@/*` → `./src/*`.
- **Fatiamento:** Fatia A (Tasks 1–5) = fundação + persistência no botão manual (demonstrável sem cron). Fatia B (Tasks 6–8) = automação. Cada fatia é uma release; a A leva migration.
- **CNDs fora do v1** (fatia futura). Só CNPJ 14 dígitos (PF fica de fora). O alerta **nunca** altera `clientes.status`.
- **Migration** `0125_monitoramento_receita.sql` idempotente, aplicada pelo runner antes do deploy (sem DB local).
- **Escrita de situação/alertas via service_role** (`createAdminSupabase()`) — não há policy de INSERT/UPDATE em `receita_alerta`; a leitura (badge/tela) usa a sessão (RLS SELECT para equipe).
- **Gates:** botão manual `atualizarViaReceita` = admin/assistente (já é); tela/resolve = `podeCriarCliente`; config = admin.
- **Rate limit:** a varredura em lote (Fatia B) espaça as chamadas — a BrasilAPI devolve 429 sem throttle hoje.
- Guard `divida-ui`: input à mão usa `controleCls(...)`; sem `←` literal; sem `amber-\d`.
- Rodar `npm run lint/typecheck/test/format` antes de commitar; `git add -A` **depois** do `format`.

---

## FATIA A — Fundação + persistência manual

### Task 1: Migration `0125_monitoramento_receita.sql`

**Files:**
- Create: `supabase/migrations/0125_monitoramento_receita.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- RF-084 (Fatia A): situação cadastral + opção Simples, e alertas de mudança.
alter table clientes add column if not exists situacao_cadastral text;
alter table clientes add column if not exists optante_simples boolean;
alter table clientes add column if not exists situacao_verificada_em timestamptz;

create table if not exists receita_alerta (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  tipo text not null check (tipo in ('situacao', 'simples')),
  de text,
  para text,
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por uuid references usuarios(id)
);
create index if not exists ix_receita_alerta_aberto on receita_alerta(cliente_id) where resolvido_em is null;

alter table receita_alerta enable row level security;
drop policy if exists receita_alerta_sel on receita_alerta;
create policy receita_alerta_sel on receita_alerta for select
  using (auth_papel() in ('admin', 'assistente', 'contador', 'financeiro'));

create table if not exists receita_config (
  id smallint primary key default 1 check (id = 1),
  ativo boolean not null default false,
  frequencia_dias int not null default 7,
  badge_ativo boolean not null default true
);
insert into receita_config (id) values (1) on conflict do nothing;
alter table receita_config enable row level security;
drop policy if exists receita_config_sel on receita_config;
create policy receita_config_sel on receita_config for select to authenticated using (true);
drop policy if exists receita_config_wr on receita_config;
create policy receita_config_wr on receita_config for all
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
```

- [ ] **Step 2: Sanidade**

Run: `ls supabase/migrations/ | tail -2`
Expected: `0124_documentos_conteudo.sql` como última antes desta.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(rf084): migration 0125 (situacao/optante em clientes + receita_alerta + receita_config)"
```

---

### Task 2: Mapear `optanteSimples` em `brasilapi.ts` + testes

**Files:**
- Modify: `src/lib/receita/brasilapi.ts`
- Modify: `src/tests/receita/brasilapi.test.ts`

**Interfaces:**
- Produces: `DadosReceita.optanteSimples: boolean | null`; `lerOptante(d): boolean | null`.

- [ ] **Step 1: Adicionar o campo e o helper**

Em `src/lib/receita/brasilapi.ts`, adicionar `optanteSimples` ao tipo:

```ts
export type DadosReceita = {
  razaoSocial: string | null;
  nomeFantasia: string | null;
  situacao: string | null;
  optanteSimples: boolean | null;
  endereco: EnderecoReceita;
};
```

Adicionar o helper puro (perto de `limpar`):

```ts
// BrasilAPI: opcao_pelo_simples / opcao_pelo_mei (boolean|null). Optante do Simples OU do MEI
// conta como optante. Ausência de ambos → null (desconhecido, não sobrescreve baseline).
export function lerOptante(d: Record<string, unknown>): boolean | null {
  const s = d.opcao_pelo_simples;
  const m = d.opcao_pelo_mei;
  if (s === true || m === true) return true;
  if (s === false || m === false) return false;
  return null;
}
```

- [ ] **Step 2: Preencher `optanteSimples` nos três mapeadores**

Em `mapearReceita`, no objeto de retorno, adicionar `optanteSimples: lerOptante(d),`.

Em `mapearReceitaWs`, adicionar (ReceitaWS aninha em `simples`/`simei`):

```ts
    optanteSimples: (() => {
      const s = (d.simples as { optante?: boolean } | undefined)?.optante;
      const m = (d.simei as { optante?: boolean } | undefined)?.optante;
      if (s === true || m === true) return true;
      if (s === false || m === false) return false;
      return null;
    })(),
```

Em `mesclarDados`, adicionar ao retorno:

```ts
    optanteSimples: primario.optanteSimples ?? secundario.optanteSimples,
```

- [ ] **Step 3: Atualizar os literais existentes e adicionar testes**

Em `src/tests/receita/brasilapi.test.ts`: os dois objetos `primario`/`secundario` do bloco
`mesclarDados` agora precisam de `optanteSimples` (o tipo passou a exigir). Adicionar
`optanteSimples: null,` a **cada um dos quatro literais** de `DadosReceita` naquele bloco
(2 no primeiro teste, 2 no segundo). Depois, adicionar este bloco ao final do arquivo:

```ts
import { lerOptante } from "@/lib/receita/brasilapi";

describe("lerOptante", () => {
  it("optante do Simples → true", () => {
    expect(lerOptante({ opcao_pelo_simples: true, opcao_pelo_mei: false })).toBe(true);
  });
  it("optante do MEI (sem Simples) → true", () => {
    expect(lerOptante({ opcao_pelo_simples: false, opcao_pelo_mei: true })).toBe(true);
  });
  it("não optante → false", () => {
    expect(lerOptante({ opcao_pelo_simples: false, opcao_pelo_mei: false })).toBe(false);
  });
  it("ausência de ambos → null", () => {
    expect(lerOptante({})).toBeNull();
  });
});

describe("mapearReceita — optante", () => {
  it("mapeia opcao_pelo_simples para optanteSimples", () => {
    expect(mapearReceita({ razao_social: "X", opcao_pelo_simples: true }).optanteSimples).toBe(true);
  });
});
```

(O `import` de `lerOptante` pode ser mesclado ao import já existente no topo do arquivo.)

- [ ] **Step 4: Rodar testes, tipos e lint**

Run: `npx vitest run src/tests/receita/brasilapi.test.ts && npm run typecheck && npm run lint`
Expected: testes passam; sem erros de tipo/lint.

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf084): mapear opção pelo Simples/MEI na consulta da Receita"
```

---

### Task 3: Lib pura `detectarMudancas` + testes

**Files:**
- Create: `src/lib/receita/monitoramento.ts`
- Test: `src/tests/receita/monitoramento.test.ts`

**Interfaces:**
- Produces: `type EstadoReceita = { situacao: string | null; optanteSimples: boolean | null }`; `type AlertaDetectado = { tipo: "situacao" | "simples"; de: string; para: string }`; `detectarMudancas(anterior, atual): AlertaDetectado[]`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/tests/receita/monitoramento.test.ts
import { describe, it, expect } from "vitest";
import { detectarMudancas } from "@/lib/receita/monitoramento";

const est = (situacao: string | null, optanteSimples: boolean | null = null) => ({ situacao, optanteSimples });

describe("detectarMudancas — situação", () => {
  it("1ª observação ATIVA não gera alerta", () => {
    expect(detectarMudancas(est(null), est("ATIVA"))).toEqual([]);
  });
  it("1ª observação INAPTA gera alerta (de '—')", () => {
    const r = detectarMudancas(est(null), est("INAPTA"));
    expect(r).toEqual([{ tipo: "situacao", de: "—", para: "INAPTA" }]);
  });
  it("transição ATIVA→INAPTA gera alerta", () => {
    expect(detectarMudancas(est("ATIVA"), est("INAPTA"))).toEqual([{ tipo: "situacao", de: "ATIVA", para: "INAPTA" }]);
  });
  it("sem mudança não gera alerta", () => {
    expect(detectarMudancas(est("INAPTA"), est("INAPTA"))).toEqual([]);
  });
  it("ignora diferença só de caixa/espaço", () => {
    expect(detectarMudancas(est("ativa "), est("ATIVA"))).toEqual([]);
  });
});

describe("detectarMudancas — Simples", () => {
  it("exclusão do Simples (true→false) gera alerta", () => {
    expect(detectarMudancas(est("ATIVA", true), est("ATIVA", false))).toEqual([
      { tipo: "simples", de: "Sim", para: "Não" },
    ]);
  });
  it("primeira observação do Simples (baseline) não gera alerta", () => {
    expect(detectarMudancas(est("ATIVA", null), est("ATIVA", true))).toEqual([]);
  });
  it("sem mudança no Simples não gera alerta", () => {
    expect(detectarMudancas(est("ATIVA", true), est("ATIVA", true))).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/receita/monitoramento.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar a lib**

```ts
// src/lib/receita/monitoramento.ts
export type EstadoReceita = { situacao: string | null; optanteSimples: boolean | null };
export type AlertaDetectado = { tipo: "situacao" | "simples"; de: string; para: string };

const norm = (s: string | null) => (s ?? "").trim().toUpperCase();
const simNao = (b: boolean) => (b ? "Sim" : "Não");

// Compara o estado anterior (persistido) com o recém-consultado e devolve os alertas.
export function detectarMudancas(anterior: EstadoReceita, atual: EstadoReceita): AlertaDetectado[] {
  const alertas: AlertaDetectado[] = [];

  // Situação: 1ª observação só alerta se não for ATIVA; depois, qualquer transição.
  if (atual.situacao !== null) {
    if (anterior.situacao === null) {
      if (norm(atual.situacao) !== "ATIVA") {
        alertas.push({ tipo: "situacao", de: "—", para: atual.situacao });
      }
    } else if (norm(anterior.situacao) !== norm(atual.situacao)) {
      alertas.push({ tipo: "situacao", de: anterior.situacao, para: atual.situacao });
    }
  }

  // Simples: só com baseline; alerta em qualquer mudança (exclusão é o caso-ouro).
  if (anterior.optanteSimples !== null && atual.optanteSimples !== null && anterior.optanteSimples !== atual.optanteSimples) {
    alertas.push({ tipo: "simples", de: simNao(anterior.optanteSimples), para: simNao(atual.optanteSimples) });
  }

  return alertas;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/receita/monitoramento.test.ts`
Expected: PASS (8 passed).

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf084): lib pura detectarMudancas + testes"
```

---

### Task 4: Persistir situação/optante + alertas no botão manual

**Files:**
- Modify: `src/app/(app)/integracoes/dominio/receita.ts`

**Interfaces:**
- Consumes: `consultarCnpj` (com `optanteSimples`), `detectarMudancas` (Task 3), colunas (Task 1).

- [ ] **Step 1: Importar a lib de detecção**

No topo de `src/app/(app)/integracoes/dominio/receita.ts`:

```ts
import { detectarMudancas } from "@/lib/receita/monitoramento";
```

- [ ] **Step 2: Persistir e alertar em `atualizarViaReceita`**

Trocar o corpo após `const r = await consultarCnpj(doc); if (r.erro || !r.dados) ...` por:

```ts
  const admin = createAdminSupabase();

  // Estado anterior persistido (para detectar mudança).
  const { data: atualCli } = await admin
    .from("clientes")
    .select("situacao_cadastral, optante_simples")
    .eq("cpf_cnpj", doc)
    .maybeSingle();

  const alertas = detectarMudancas(
    { situacao: (atualCli?.situacao_cadastral as string | null) ?? null, optanteSimples: (atualCli?.optante_simples as boolean | null) ?? null },
    { situacao: r.dados.situacao, optanteSimples: r.dados.optanteSimples },
  );

  const patch: Record<string, unknown> = {
    situacao_cadastral: r.dados.situacao,
    optante_simples: r.dados.optanteSimples,
    situacao_verificada_em: new Date().toISOString(),
  };
  if (r.dados.razaoSocial) patch.razao_social = r.dados.razaoSocial;
  if (Object.keys(r.dados.endereco).length) patch.endereco = r.dados.endereco;

  const { data: cli, error } = await admin
    .from("clientes")
    .update(patch)
    .eq("cpf_cnpj", doc)
    .select("id")
    .single();
  if (error || !cli) return { erro: "Falha ao gravar os dados." };

  if (alertas.length) {
    await admin.from("receita_alerta").insert(
      alertas.map((a) => ({ cliente_id: cli.id, tipo: a.tipo, de: a.de, para: a.para })),
    );
  }
  revalidatePath("/clientes");
  return { ok: true, razao: r.dados.razaoSocial, situacao: r.dados.situacao };
```

(Remove o bloco antigo que montava `patch` só com razão/endereço e dava `return { erro: "Receita não retornou..." }` — agora sempre persistimos situação/optante.)

- [ ] **Step 3: Verificar tipos e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf084): persistir situação/Simples e gerar alertas no botão da Receita"
```

---

### Task 5: Tela de alertas + badge no menu

**Files:**
- Create: `src/app/(app)/clientes/alertas-receita/actions.ts`
- Create: `src/app/(app)/clientes/alertas-receita/page.tsx`
- Create: `src/app/(app)/clientes/alertas-receita/BotaoResolver.tsx`
- Modify: `src/lib/ui/navegacao.ts` (Badges + item de menu)
- Modify: `src/app/(app)/layout.tsx` (contagem do badge)

**Interfaces:**
- Produces: `contarAlertasReceita()`, `listarAlertasReceita()`, `resolverAlertaReceita(id)`; `Badges.monitoramentoReceita`.

- [ ] **Step 1: Actions**

```ts
// src/app/(app)/clientes/alertas-receita/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeCriarCliente } from "@/lib/clientes/permissoes";

export async function contarAlertasReceita(): Promise<number> {
  const supabase = await createServerSupabase();
  const { data: cfg } = await supabase.from("receita_config").select("badge_ativo").eq("id", 1).maybeSingle();
  if (cfg && cfg.badge_ativo === false) return 0;
  const { count } = await supabase
    .from("receita_alerta")
    .select("id", { count: "exact", head: true })
    .is("resolvido_em", null);
  return count ?? 0;
}

export type AlertaReceita = { id: string; clienteId: string; cliente: string; tipo: string; de: string | null; para: string | null; criadoEm: string };

export async function listarAlertasReceita(): Promise<AlertaReceita[]> {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("receita_alerta")
    .select("id, cliente_id, tipo, de, para, criado_em, clientes(razao_social)")
    .is("resolvido_em", null)
    .order("criado_em", { ascending: false })
    .limit(200);
  return (data ?? []).map((a) => {
    const cli = a.clientes as unknown as { razao_social: string } | { razao_social: string }[] | null;
    const um = Array.isArray(cli) ? cli[0] : cli;
    return {
      id: a.id as string,
      clienteId: a.cliente_id as string,
      cliente: um?.razao_social ?? "—",
      tipo: a.tipo as string,
      de: (a.de as string | null) ?? null,
      para: (a.para as string | null) ?? null,
      criadoEm: a.criado_em as string,
    };
  });
}

export async function resolverAlertaReceita(id: string): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeCriarCliente(perfil.papel)) return { erro: "Sem permissão." };
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("receita_alerta")
    .update({ resolvido_em: new Date().toISOString(), resolvido_por: perfil.id })
    .eq("id", id);
  if (error) return { erro: "Falha ao resolver." };
  revalidatePath("/clientes/alertas-receita");
  return { ok: true };
}
```

- [ ] **Step 2: Botão resolver (client)**

```tsx
// src/app/(app)/clientes/alertas-receita/BotaoResolver.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolverAlertaReceita } from "./actions";

export function BotaoResolver({ id }: { id: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  return (
    <button
      type="button"
      disabled={ocupado}
      onClick={async () => {
        setOcupado(true);
        const r = await resolverAlertaReceita(id);
        setOcupado(false);
        if (r?.erro) return alert(r.erro);
        router.refresh();
      }}
      className="rounded-lg border border-linha bg-white px-3 py-1.5 text-sm text-texto hover:bg-creme disabled:opacity-50"
    >
      Resolver
    </button>
  );
}
```

- [ ] **Step 3: Página**

```tsx
// src/app/(app)/clientes/alertas-receita/page.tsx
import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatarData } from "@/lib/format";
import { listarAlertasReceita } from "./actions";
import { BotaoResolver } from "./BotaoResolver";

export const metadata = { title: "Alertas da Receita" };

export default async function AlertasReceitaPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const alertas = await listarAlertasReceita();

  return (
    <Container largura="larga" className="space-y-5 p-4">
      <PageHeader titulo="Alertas da Receita" subtitulo="Mudanças de situação cadastral e opção pelo Simples" />
      {alertas.length === 0 ? (
        <p className="rounded-2xl border border-linha bg-white p-6 text-sm text-cinza">Nenhum alerta em aberto.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-linha text-xs text-cinza">
                <th className="px-3 py-2 text-left font-medium">Cliente</th>
                <th className="px-3 py-2 text-left font-medium">Tipo</th>
                <th className="px-3 py-2 text-left font-medium">Mudança</th>
                <th className="px-3 py-2 text-right font-medium">Quando</th>
                <th className="px-3 py-2 text-right font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {alertas.map((a) => (
                <tr key={a.id} className="border-b border-linha/60">
                  <td className="px-3 py-2">
                    <Link href={`/clientes/${a.clienteId}`} className="text-verde underline">
                      {a.cliente}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-cinza">{a.tipo === "simples" ? "Simples" : "Situação"}</td>
                  <td className="px-3 py-2 text-texto">
                    {a.de ?? "—"} → <strong>{a.para ?? "—"}</strong>
                  </td>
                  <td className="px-3 py-2 text-right text-cinza">{formatarData(a.criadoEm)}</td>
                  <td className="px-3 py-2 text-right">
                    <BotaoResolver id={a.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
```

- [ ] **Step 4: Badge no menu**

Em `src/lib/ui/navegacao.ts`: adicionar `monitoramentoReceita: number;` ao tipo `Badges`, e no grupo `"Operação"` do `menuDoPapel`, junto dos itens gated por `equipe`:

```ts
        ...(equipe ? [{ href: "/clientes/alertas-receita", label: "Alertas Receita", badge: badges.monitoramentoReceita }] : []),
```

- [ ] **Step 5: Contar o badge no layout**

Em `src/app/(app)/layout.tsx`: importar e contar (gate equipe), e passar ao `<Sidebar>`:

```ts
import { contarAlertasReceita } from "@/app/(app)/clientes/alertas-receita/actions";
```

```ts
  const monitoramentoReceita = podeCriarCliente(perfil.papel) ? await contarAlertasReceita() : 0;
```

```tsx
        badges={{ onboarding: alertasOnboarding, riscos: riscosObrigacoes, escalonamento, vencimentos, docsVencidos, monitoramentoReceita }}
```

- [ ] **Step 6: Verificar tipos, lint e rotas alcançáveis**

Run: `npm run typecheck && npm run lint`
Expected: sem erros (incl. `rotas-alcancaveis` — a rota tem link no menu; e o teste de `navegacao` pode exigir a nova chave, ver passo 7).

- [ ] **Step 7: Ajustar fixtures de `navegacao` se preciso**

Se `src/tests/ui/navegacao.test.ts` construir `Badges` literal, adicionar `monitoramentoReceita: 0` a essas fixtures.

Run: `npm test 2>&1 | tail -5`
Expected: todos passam.

- [ ] **Step 8: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf084): tela de alertas da Receita + badge no menu"
```

> **Release da Fatia A:** bump minor + CHANGELOG, PR, `verify` verde, aplicar `0125` em produção **antes** do deploy, Implantar, confirmar `/api/health`, tag, sync develop.

---

## FATIA B — Automação (cron + config)

### Task 6: Motor de varredura `monitorarReceitaCore`

**Files:**
- Create: `src/app/(app)/clientes/monitorar-receita.ts`

**Interfaces:**
- Consumes: `consultarCnpj`, `detectarMudancas`, colunas + `receita_config`.
- Produces: `monitorarReceitaCore(): Promise<{ consultados: number; alertas: number; erros: number }>`.

- [ ] **Step 1: Escrever o motor**

```ts
// src/app/(app)/clientes/monitorar-receita.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { consultarCnpj } from "@/lib/receita/brasilapi";
import { detectarMudancas } from "@/lib/receita/monitoramento";

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Varre clientes ativos com CNPJ cuja verificação está vencida (frequencia_dias) e reconsulta,
// espaçando as chamadas para não estourar o 429 da BrasilAPI. Só roda se a config estiver ativa.
export async function monitorarReceitaCore(): Promise<{ consultados: number; alertas: number; erros: number }> {
  const admin = createAdminSupabase();
  const { data: cfg } = await admin.from("receita_config").select("ativo, frequencia_dias").eq("id", 1).maybeSingle();
  if (!cfg?.ativo) return { consultados: 0, alertas: 0, erros: 0 };

  const freq = Number(cfg.frequencia_dias) || 7;
  const cutoff = new Date(Date.now() - freq * 86400000).toISOString();
  const { data: clientes } = await admin
    .from("clientes")
    .select("id, cpf_cnpj, situacao_cadastral, optante_simples")
    .is("excluido_em", null)
    .eq("status", "ativo")
    .or(`situacao_verificada_em.is.null,situacao_verificada_em.lt.${cutoff}`)
    .limit(300);

  let consultados = 0;
  let alertasTotal = 0;
  let erros = 0;
  for (const c of clientes ?? []) {
    const doc = String(c.cpf_cnpj ?? "").replace(/\D/g, "");
    if (doc.length !== 14) continue;
    await esperar(400); // throttle anti-429
    const r = await consultarCnpj(doc);
    if (r.erro || !r.dados) {
      erros += 1;
      continue;
    }
    consultados += 1;
    const alertas = detectarMudancas(
      { situacao: (c.situacao_cadastral as string | null) ?? null, optanteSimples: (c.optante_simples as boolean | null) ?? null },
      { situacao: r.dados.situacao, optanteSimples: r.dados.optanteSimples },
    );
    await admin
      .from("clientes")
      .update({
        situacao_cadastral: r.dados.situacao,
        optante_simples: r.dados.optanteSimples,
        situacao_verificada_em: new Date().toISOString(),
      })
      .eq("id", c.id);
    if (alertas.length) {
      await admin
        .from("receita_alerta")
        .insert(alertas.map((a) => ({ cliente_id: c.id as string, tipo: a.tipo, de: a.de, para: a.para })));
      alertasTotal += alertas.length;
    }
  }
  return { consultados, alertas: alertasTotal, erros };
}
```

- [ ] **Step 2: Verificar tipos e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf084): motor de varredura da Receita (throttle + frequência)"
```

---

### Task 7: Rota cron + job

**Files:**
- Create: `src/app/api/cron/monitorar-receita/route.ts`
- Modify: `scripts/bootstrap-cron.mjs` (entrada em `JOBS`)

- [ ] **Step 1: Rota (molde de sincronizar-boletos)**

```ts
// src/app/api/cron/monitorar-receita/route.ts
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { monitorarReceitaCore } from "@/app/(app)/clientes/monitorar-receita";

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(segredo);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const resumo = await monitorarReceitaCore();
  return NextResponse.json(resumo);
}
```

- [ ] **Step 2: Job no bootstrap-cron**

Em `scripts/bootstrap-cron.mjs`, adicionar ao array `JOBS`:

```js
  {
    nome: "monitorar-receita-diaria",
    agenda: "0 8 * * *",
    comando: httpPost("monitorar-receita", true),
    nota: "reconsulta situação cadastral/Simples dos clientes vencidos (RF-084); a config controla a cadência real",
  },
```

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint && node --check scripts/bootstrap-cron.mjs`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf084): rota cron monitorar-receita + job diário"
```

---

### Task 8: Config UI `configuracoes/receita/`

**Files:**
- Create: `src/app/(app)/configuracoes/receita/actions.ts`
- Create: `src/app/(app)/configuracoes/receita/page.tsx`
- Create: `src/app/(app)/configuracoes/receita/FormReceita.tsx`
- Modify: `src/app/(app)/configuracoes/page.tsx` (item no hub)

- [ ] **Step 1: Actions**

```ts
// src/app/(app)/configuracoes/receita/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type ReceitaConfig = { ativo: boolean; frequenciaDias: number; badgeAtivo: boolean };

export async function carregarReceitaConfig(): Promise<ReceitaConfig> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("receita_config").select("ativo, frequencia_dias, badge_ativo").eq("id", 1).maybeSingle();
  return {
    ativo: data?.ativo ?? false,
    frequenciaDias: data?.frequencia_dias ?? 7,
    badgeAtivo: data?.badge_ativo ?? true,
  };
}

export async function salvarReceitaConfig(formData: FormData): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || perfil.papel !== "admin") return { erro: "Sem permissão." };
  const dias = Number(String(formData.get("frequencia") ?? "").trim());
  if (!Number.isInteger(dias) || dias < 1) return { erro: "Frequência deve ser um número de dias ≥ 1." };
  const admin = createAdminSupabase();
  await admin
    .from("receita_config")
    .update({ ativo: formData.get("ativo") === "on", frequencia_dias: dias, badge_ativo: formData.get("badge") === "on" })
    .eq("id", 1);
  revalidatePath("/configuracoes/receita");
  return { ok: true };
}
```

- [ ] **Step 2: Página (gate admin)**

```tsx
// src/app/(app)/configuracoes/receita/page.tsx
import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { FormReceita } from "./FormReceita";
import { carregarReceitaConfig } from "./actions";

export const metadata = { title: "Monitoramento da Receita" };

export default async function ReceitaConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const cfg = await carregarReceitaConfig();
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="Monitoramento da Receita" subtitulo="Reconsulta automática de situação cadastral e Simples" />
      <FormReceita cfg={cfg} />
    </Container>
  );
}
```

- [ ] **Step 3: Form (client)**

```tsx
// src/app/(app)/configuracoes/receita/FormReceita.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { controleCls } from "@/components/ui/Campo";
import { Botao } from "@/components/ui/Botao";
import { salvarReceitaConfig, type ReceitaConfig } from "./actions";

export function FormReceita({ cfg }: { cfg: ReceitaConfig }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOcupado(true);
    const r = await salvarReceitaConfig(new FormData(e.currentTarget));
    setOcupado(false);
    if (r?.erro) return alert(r.erro);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-linha bg-white p-4">
      <label className="flex items-center gap-2 text-sm text-texto">
        <input type="checkbox" name="ativo" defaultChecked={cfg.ativo} className="size-4" />
        Reconsultar automaticamente a situação na Receita
      </label>
      <label className="flex items-center gap-2 text-sm text-texto">
        <input type="checkbox" name="badge" defaultChecked={cfg.badgeAtivo} className="size-4" />
        Mostrar contador de alertas no menu
      </label>
      <label className="block text-xs text-cinza">
        Frequência por cliente (dias entre reconsultas)
        <input
          type="number"
          name="frequencia"
          min={1}
          defaultValue={cfg.frequenciaDias}
          className={`${controleCls("compacto")} mt-0.5 block w-40`}
        />
      </label>
      <Botao type="submit" disabled={ocupado}>
        Salvar
      </Botao>
    </form>
  );
}
```

- [ ] **Step 4: Item no hub**

Em `src/app/(app)/configuracoes/page.tsx`, adicionar ao array `ITENS`:

```ts
  {
    href: "/configuracoes/receita",
    label: "Monitoramento da Receita",
    desc: "Reconsulta automática de situação cadastral e Simples: liga/desliga, frequência e badge.",
  },
```

- [ ] **Step 5: Verificar + suite + build**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: sem erros; todos os testes passam; build conclui.

- [ ] **Step 6: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf084): config UI do monitoramento da Receita"
```

> **Release da Fatia B:** bump minor + CHANGELOG, PR, `verify` verde, **sem migration nova**; após deploy, aplicar o cron (`node --env-file=.env.producao.bak scripts/bootstrap-cron.mjs`); confirmar `/api/health`, tag, sync develop.

---

## Self-Review

- **Cobertura da spec:** migration+RLS (Task 1); optante no mapeamento (Task 2); `detectarMudancas` (Task 3); persistência+alerta no botão manual (Task 4); tela+badge (Task 5); motor de varredura (Task 6); cron+job (Task 7); config UI (Task 8). CNDs fora, como na spec.
- **Placeholders:** nenhum — cada passo traz código/comando completo, incluindo os trechos exatos a inserir em arquivos existentes.
- **Consistência de tipos:** `DadosReceita.optanteSimples` (Task 2) consumido em Task 4 e 6; `detectarMudancas`/`EstadoReceita`/`AlertaDetectado` (Task 3) consumidos em Task 4 e 6; `Badges.monitoramentoReceita` (Task 5 §4) contado em layout (§5); `ReceitaConfig` definido e consumido na Task 8. Nomes de coluna (`situacao_cadastral`, `optante_simples`, `situacao_verificada_em`) idênticos entre migration, botão, motor e config.
- **Fatias independentes:** A entrega alerta ponta a ponta pelo botão manual (sem cron); B só adiciona a automação e a config.
- **Deferido explicitamente:** exibição da situação atual na ficha do cliente não entrou (a tela de alertas + link cobrem o essencial); pode vir depois. CNDs, auto-status e PF fora do v1.
