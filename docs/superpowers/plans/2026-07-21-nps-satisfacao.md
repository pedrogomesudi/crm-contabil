# RF-074 — Pesquisas de satisfação (NPS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coletar NPS dos clientes no portal (card lazy, sem cron nem envio externo) e mostrar o score num painel da equipe.

**Architecture:** Portal logado grava a resposta via RLS por `auth_cliente_id()`; o card aparece quando `npsDevido(...)` (lib pura). Painel lê tudo com service_role e resume via `resumirNps(...)` (lib pura). Config no singleton `escritorio_config`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (RLS + service_role), Tailwind 4, Vitest.

## Global Constraints

- Alias `@/*` → `./src/*`.
- **Fatiamento:** Fatia A (Tasks 1–4) = coleta + config (ponta a ponta: admin liga → cliente responde). Fatia B (Tasks 5–6) = painel. Cada fatia é uma release própria. **Ajuste vs spec:** a config UI entra na Fatia A (não na B) para que A seja demonstrável sem mexer no banco à mão.
- **Migration** `0123_nps.sql` idempotente (`if not exists`, `drop policy if exists`), aplicada pelo runner `node --env-file=.env.local scripts/db-migrate.mjs` (sem Docker local; a aplicação real é contra produção, no release da Fatia A, **antes** do deploy). Não há teste de banco local.
- **Gates:** portal (cliente) = `getPerfilAtual()` + `ehCliente(papel)` + `clienteId`; painel `/nps` = `podeCriarCliente`; config = `papel === "admin"`.
- **RLS:** resposta gravada pelo cliente Supabase do usuário (a policy `nps_ins_cliente` prova a titularidade); `nps_resposta` é imutável (sem UPDATE/DELETE).
- `criada_em` é `timestamptz`: filtro de período no painel usa `` `${ate}T23:59:59` `` no limite superior.
- Guard `divida-ui`: em `className` de input escrito à mão, usar `controleCls(...)` (nunca `border` estático); sem caractere `←` literal (usar `Voltar`); sem classes `amber-\d` (usar tokens `verde`/`cinza`/`negativo`).
- Guard `rotas-alcancaveis`: `/nps` ganha link no menu (Task 6); `/configuracoes/nps` ganha link no hub de configurações (Task 3).
- Rodar `npm run lint`, `npm run typecheck`, `npm test`, `npm run format` antes de commitar; `git add -A` **depois** do `format`.

---

## FATIA A — Coleta + config

### Task 1: Lib pura `npsDevido` + testes

**Files:**
- Create: `src/lib/nps/devido.ts`
- Test: `src/tests/nps/devido.test.ts`

**Interfaces:**
- Produces: `function npsDevido(args: { ativo: boolean; periodicidadeDias: number; ultimaRespostaIso: string | null; hojeIso: string }): boolean`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/tests/nps/devido.test.ts
import { describe, it, expect } from "vitest";
import { npsDevido } from "@/lib/nps/devido";

const base = { ativo: true, periodicidadeDias: 90, hojeIso: "2026-07-21" };

describe("npsDevido", () => {
  it("nunca é devido quando inativo", () => {
    expect(npsDevido({ ...base, ativo: false, ultimaRespostaIso: null })).toBe(false);
  });
  it("é devido quando ativo e o cliente nunca respondeu", () => {
    expect(npsDevido({ ...base, ultimaRespostaIso: null })).toBe(true);
  });
  it("não é devido se a última resposta é mais recente que a periodicidade", () => {
    expect(npsDevido({ ...base, ultimaRespostaIso: "2026-06-21" })).toBe(false); // 30 dias < 90
  });
  it("é devido no limite exato da periodicidade", () => {
    expect(npsDevido({ ...base, ultimaRespostaIso: "2026-04-22" })).toBe(true); // 90 dias
  });
  it("não é devido um dia antes do limite", () => {
    expect(npsDevido({ ...base, ultimaRespostaIso: "2026-04-23" })).toBe(false); // 89 dias
  });
  it("respeita periodicidade customizada", () => {
    expect(npsDevido({ ...base, periodicidadeDias: 30, ultimaRespostaIso: "2026-06-21" })).toBe(true); // 30 >= 30
  });
  it("aceita timestamp completo na última resposta (usa só a data)", () => {
    expect(npsDevido({ ...base, ultimaRespostaIso: "2026-04-22T13:45:00Z" })).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/nps/devido.test.ts`
Expected: FAIL — `Cannot find module '@/lib/nps/devido'`.

- [ ] **Step 3: Implementar a lib**

```ts
// src/lib/nps/devido.ts
// Dias de calendário entre duas datas ISO (usa só o trecho YYYY-MM-DD), b - a.
function diasEntre(aIso: string, bIso: string): number {
  const a = Date.parse(`${aIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${bIso.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

// Card de NPS é "devido" quando a coleta está ligada e o cliente nunca respondeu, ou
// respondeu há pelo menos `periodicidadeDias`. Lazy: calculado no acesso ao portal.
export function npsDevido(args: {
  ativo: boolean;
  periodicidadeDias: number;
  ultimaRespostaIso: string | null;
  hojeIso: string;
}): boolean {
  if (!args.ativo) return false;
  if (!args.ultimaRespostaIso) return true;
  return diasEntre(args.ultimaRespostaIso, args.hojeIso) >= args.periodicidadeDias;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/nps/devido.test.ts`
Expected: PASS (7 passed).

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf074): lib pura npsDevido + testes"
```

---

### Task 2: Migration `0123_nps.sql`

**Files:**
- Create: `supabase/migrations/0123_nps.sql`

**Interfaces:**
- Produces: tabela `nps_resposta` (RLS) e colunas `nps_ativo`/`nps_periodicidade_dias`/`nps_pergunta` em `escritorio_config`.

- [ ] **Step 1: Escrever a migration**

```sql
-- RF-074 (Fatia A): coleta de NPS pelo portal do cliente.
create table if not exists nps_resposta (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  nota int not null check (nota between 0 and 10),
  comentario text,
  criada_em timestamptz not null default now()
);
create index if not exists ix_nps_cliente on nps_resposta(cliente_id, criada_em);

alter table nps_resposta enable row level security;

-- Cliente lê/insere só a própria; equipe operacional lê tudo; sem UPDATE/DELETE (imutável).
drop policy if exists nps_sel_cliente on nps_resposta;
create policy nps_sel_cliente on nps_resposta for select
  using (cliente_id = auth_cliente_id() or auth_papel() in ('admin', 'assistente', 'contador'));
drop policy if exists nps_ins_cliente on nps_resposta;
create policy nps_ins_cliente on nps_resposta for insert
  with check (cliente_id = auth_cliente_id());

-- Config no singleton escritorio_config.
alter table escritorio_config add column if not exists nps_ativo boolean not null default false;
alter table escritorio_config add column if not exists nps_periodicidade_dias int not null default 90;
alter table escritorio_config add column if not exists nps_pergunta text;
```

- [ ] **Step 2: Conferência de sanidade (sem DB local)**

Não há Postgres local. Verificar visualmente: `auth_cliente_id()` (migration 0085) e `auth_papel()` (0001) existem; a migration é idempotente; o número `0123` é o próximo (`ls supabase/migrations/ | tail -1` deve mostrar `0122_cliente_porte.sql`).

Run: `ls supabase/migrations/ | tail -2`
Expected: `0122_cliente_porte.sql` como última antes desta.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(rf074): migration 0123_nps (tabela nps_resposta + RLS + config)"
```

---

### Task 3: Config UI `configuracoes/nps/`

**Files:**
- Create: `src/app/(app)/configuracoes/nps/actions.ts`
- Create: `src/app/(app)/configuracoes/nps/page.tsx`
- Create: `src/app/(app)/configuracoes/nps/FormNps.tsx`
- Modify: `src/app/(app)/configuracoes/page.tsx` (item no hub)

**Interfaces:**
- Consumes: colunas de config (Task 2).
- Produces: `type NpsConfig = { ativo: boolean; periodicidadeDias: number; pergunta: string }`; `carregarNps(): Promise<NpsConfig>`; `salvarNps(formData: FormData): Promise<{ ok?: boolean; erro?: string }>`.

- [ ] **Step 1: Escrever a action**

```ts
// src/app/(app)/configuracoes/nps/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type NpsConfig = { ativo: boolean; periodicidadeDias: number; pergunta: string };

export async function carregarNps(): Promise<NpsConfig> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("escritorio_config")
    .select("nps_ativo, nps_periodicidade_dias, nps_pergunta")
    .eq("id", 1)
    .maybeSingle();
  return {
    ativo: data?.nps_ativo ?? false,
    periodicidadeDias: data?.nps_periodicidade_dias ?? 90,
    pergunta: data?.nps_pergunta ?? "",
  };
}

export async function salvarNps(formData: FormData): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || perfil.papel !== "admin") return { erro: "Sem permissão." };
  const ativo = formData.get("ativo") === "on";
  const dias = Number(String(formData.get("periodicidade") ?? "").trim());
  if (!Number.isInteger(dias) || dias < 1) return { erro: "Periodicidade deve ser um número de dias ≥ 1." };
  const pergunta = String(formData.get("pergunta") ?? "").trim().slice(0, 300) || null;
  const admin = createAdminSupabase();
  await admin
    .from("escritorio_config")
    .update({ nps_ativo: ativo, nps_periodicidade_dias: dias, nps_pergunta: pergunta })
    .eq("id", 1);
  revalidatePath("/configuracoes/nps");
  return { ok: true };
}
```

- [ ] **Step 2: Escrever a página (server, gate admin)**

```tsx
// src/app/(app)/configuracoes/nps/page.tsx
import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { FormNps } from "./FormNps";
import { carregarNps } from "./actions";

export const metadata = { title: "Pesquisa de satisfação (NPS)" };

export default async function NpsConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const cfg = await carregarNps();
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="Pesquisa de satisfação (NPS)" subtitulo="Coleta automática de NPS no portal do cliente" />
      <FormNps cfg={cfg} />
    </Container>
  );
}
```

- [ ] **Step 3: Escrever o form (client)**

```tsx
// src/app/(app)/configuracoes/nps/FormNps.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { controleCls } from "@/components/ui/Campo";
import { Botao } from "@/components/ui/Botao";
import { salvarNps, type NpsConfig } from "./actions";

export function FormNps({ cfg }: { cfg: NpsConfig }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOcupado(true);
    const r = await salvarNps(new FormData(e.currentTarget));
    setOcupado(false);
    if (r?.erro) return alert(r.erro);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-linha bg-white p-4">
      <label className="flex items-center gap-2 text-sm text-texto">
        <input type="checkbox" name="ativo" defaultChecked={cfg.ativo} className="size-4" />
        Coletar NPS no portal do cliente
      </label>
      <label className="block text-xs text-cinza">
        Periodicidade (dias entre pesquisas do mesmo cliente)
        <input
          type="number"
          name="periodicidade"
          min={1}
          defaultValue={cfg.periodicidadeDias}
          className={`${controleCls("compacto")} mt-0.5 block w-40`}
        />
      </label>
      <label className="block text-xs text-cinza">
        Pergunta (opcional — vazio usa o texto padrão)
        <input
          type="text"
          name="pergunta"
          defaultValue={cfg.pergunta}
          maxLength={300}
          placeholder="De 0 a 10, quanto você recomendaria nosso escritório a um colega?"
          className={`${controleCls("compacto")} mt-0.5 block w-full`}
        />
      </label>
      <Botao type="submit" disabled={ocupado}>
        Salvar
      </Botao>
    </form>
  );
}
```

- [ ] **Step 4: Adicionar o item no hub de configurações**

Em `src/app/(app)/configuracoes/page.tsx`, adicionar ao array de itens (perto de "Follow-up"):

```ts
  { href: "/configuracoes/nps", label: "Pesquisa de satisfação (NPS)", desc: "Coleta de NPS no portal: liga/desliga, periodicidade e texto da pergunta." },
```

- [ ] **Step 5: Verificar tipos, lint e guards**

Run: `npm run typecheck && npm run lint`
Expected: sem erros (incl. `divida-ui`).

- [ ] **Step 6: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf074): config UI de NPS em configuracoes/nps"
```

---

### Task 4: Card no portal + action `responderNps`

**Files:**
- Create: `src/app/(portal)/portal/nps-actions.ts`
- Create: `src/app/(portal)/portal/CardNps.tsx`
- Modify: `src/app/(portal)/portal/page.tsx`

**Interfaces:**
- Consumes: `npsDevido` (Task 1); tabela + config (Task 2); `ehCliente` de `@/lib/portal/permissoes`.
- Produces: `responderNps(nota: number, comentario: string): Promise<{ ok: true } | { erro: string }>`; componente `<CardNps pergunta={string} />`.

- [ ] **Step 1: Escrever a action do portal**

```ts
// src/app/(portal)/portal/nps-actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { ehCliente } from "@/lib/portal/permissoes";

// Grava pelo cliente Supabase DO USUÁRIO: a policy nps_ins_cliente (cliente_id =
// auth_cliente_id()) prova a titularidade. cliente_id vem do perfil, não do navegador.
export async function responderNps(nota: number, comentario: string): Promise<{ ok: true } | { erro: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !ehCliente(perfil.papel) || !perfil.clienteId) return { erro: "Sem permissão." };
  if (!Number.isInteger(nota) || nota < 0 || nota > 10) return { erro: "Nota inválida." };
  const texto = (comentario ?? "").trim().slice(0, 2000) || null;
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("nps_resposta")
    .insert({ cliente_id: perfil.clienteId, nota, comentario: texto });
  if (error) return { erro: "Falha ao registrar." };
  revalidatePath("/portal");
  return { ok: true };
}
```

- [ ] **Step 2: Escrever o card (client, com adiamento por localStorage)**

```tsx
// src/app/(portal)/portal/CardNps.tsx
"use client";
import { useEffect, useState } from "react";
import { responderNps } from "./nps-actions";

const CHAVE = "nps_dispensado_ate";
const DIAS_ADIAMENTO = 7;

export function CardNps({ pergunta }: { pergunta: string }) {
  const [visivel, setVisivel] = useState(false);
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const ate = Number(localStorage.getItem(CHAVE) ?? 0);
    if (Date.now() > ate) setVisivel(true);
  }, []);

  if (!visivel) return null;

  async function enviar() {
    if (nota === null) return;
    setOcupado(true);
    const r = await responderNps(nota, comentario);
    setOcupado(false);
    if ("erro" in r) return alert(r.erro);
    setVisivel(false); // servidor revalida; não reaparece até renovar a periodicidade
  }

  function agoraNao() {
    localStorage.setItem(CHAVE, String(Date.now() + DIAS_ADIAMENTO * 86400000));
    setVisivel(false);
  }

  return (
    <section className="rounded-2xl border border-verde/40 bg-creme p-4">
      <p className="text-sm font-medium text-texto">{pergunta}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            onClick={() => setNota(n)}
            aria-pressed={nota === n}
            className={`size-9 rounded-lg text-sm tabular-nums ${
              nota === n ? "bg-verde text-white" : "bg-white text-texto hover:bg-white/70"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Quer comentar? (opcional)"
        className="mt-3 block w-full rounded-lg bg-white p-2 text-sm text-texto"
      />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={enviar}
          disabled={nota === null || ocupado}
          className="rounded-lg bg-verde px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Responder
        </button>
        <button type="button" onClick={agoraNao} className="rounded-lg px-3 py-1.5 text-sm text-cinza">
          Agora não
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Ligar o card na página inicial do portal**

Em `src/app/(portal)/portal/page.tsx`: importar `npsDevido` e `CardNps`; após as contagens existentes, ler config + última resposta (ambos via `supabase` do usuário — `escritorio_config` é legível por qualquer autenticado; `nps_resposta` a RLS restringe ao próprio cliente) e calcular o vencimento. Renderizar o card no topo do JSX de retorno quando devido.

```tsx
import { npsDevido } from "@/lib/nps/devido";
import { CardNps } from "./CardNps";
```

Dentro do componente, junto do `Promise.all` das contagens (adicionar os dois selects):

```tsx
  const [cfgRes, ultimaRes] = await Promise.all([
    supabase.from("escritorio_config").select("nps_ativo, nps_periodicidade_dias, nps_pergunta").eq("id", 1).maybeSingle(),
    supabase.from("nps_resposta").select("criada_em").order("criada_em", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const npsAberto = npsDevido({
    ativo: cfgRes.data?.nps_ativo ?? false,
    periodicidadeDias: cfgRes.data?.nps_periodicidade_dias ?? 90,
    ultimaRespostaIso: (ultimaRes.data?.criada_em as string | null) ?? null,
    hojeIso: hoje,
  });
  const npsPergunta =
    (cfgRes.data?.nps_pergunta as string | null) || "De 0 a 10, quanto você recomendaria nosso escritório a um colega?";
```

E no início do bloco `return (<div className="space-y-4">...`, logo após a abertura da `div`:

```tsx
      {npsAberto && <CardNps pergunta={npsPergunta} />}
```

- [ ] **Step 4: Verificar tipos, lint e guards**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 5: Suite completa (Fatia A)**

Run: `npm test`
Expected: todos passam, incl. `devido.test.ts`.

- [ ] **Step 6: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf074): card de NPS no portal + action responderNps"
```

> **Release da Fatia A:** bump minor + CHANGELOG, PR, `verify` verde, aplicar migration `0123` em produção (`node --env-file=.env.producao.bak scripts/db-migrate.mjs`) **antes** do deploy, Implantar, confirmar `/api/health`, tag, sync develop.

---

## FATIA B — Painel da equipe

### Task 5: Lib pura `resumirNps` + testes

**Files:**
- Create: `src/lib/nps/score.ts`
- Test: `src/tests/nps/score.test.ts`

**Interfaces:**
- Produces: `type ResumoNps = { total: number; promotores: number; neutros: number; detratores: number; score: number }`; `resumirNps(notas: number[]): ResumoNps`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/tests/nps/score.test.ts
import { describe, it, expect } from "vitest";
import { resumirNps } from "@/lib/nps/score";

describe("resumirNps", () => {
  it("classifica promotor (9-10), neutro (7-8) e detrator (0-6)", () => {
    const r = resumirNps([10, 9, 8, 7, 6, 0]);
    expect([r.promotores, r.neutros, r.detratores]).toEqual([2, 2, 2]);
    expect(r.total).toBe(6);
  });
  it("score = %promotores - %detratores", () => {
    // 2 prom / 2 neu / 2 det de 6 → 33% - 33% = 0
    expect(resumirNps([10, 9, 8, 7, 6, 0]).score).toBe(0);
  });
  it("total zero não divide por zero — score 0", () => {
    const r = resumirNps([]);
    expect([r.total, r.score]).toEqual([0, 0]);
  });
  it("só promotores → score 100", () => {
    expect(resumirNps([9, 10, 9]).score).toBe(100);
  });
  it("só detratores → score -100", () => {
    expect(resumirNps([0, 3, 6]).score).toBe(-100);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/nps/score.test.ts`
Expected: FAIL — `Cannot find module '@/lib/nps/score'`.

- [ ] **Step 3: Implementar a lib**

```ts
// src/lib/nps/score.ts
export type ResumoNps = {
  total: number;
  promotores: number; // nota 9-10
  neutros: number; // nota 7-8
  detratores: number; // nota 0-6
  score: number; // %promotores - %detratores, arredondado (-100..100); 0 quando total=0
};

export function resumirNps(notas: number[]): ResumoNps {
  let promotores = 0;
  let neutros = 0;
  let detratores = 0;
  for (const n of notas) {
    if (n >= 9) promotores++;
    else if (n >= 7) neutros++;
    else detratores++;
  }
  const total = notas.length;
  const score = total > 0 ? Math.round((promotores / total) * 100) - Math.round((detratores / total) * 100) : 0;
  return { total, promotores, neutros, detratores, score };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/nps/score.test.ts`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf074): lib pura resumirNps + testes"
```

---

### Task 6: Action `relatorioNps` + página `/nps` + menu

**Files:**
- Create: `src/app/(app)/nps/actions.ts`
- Create: `src/app/(app)/nps/page.tsx`
- Modify: `src/lib/ui/navegacao.ts` (item no grupo Relacionamento)

**Interfaces:**
- Consumes: `resumirNps`, `ResumoNps` (Task 5); `podeCriarCliente`; tabela `nps_resposta` (Task 2).
- Produces: `type ComentarioNps = { cliente: string; nota: number; comentario: string; data: string }`; `type RelatorioNps = { resumo: ResumoNps; comentarios: ComentarioNps[] }`; `relatorioNps(de, ate): Promise<RelatorioNps | null>`; rota `/nps`.

- [ ] **Step 1: Escrever a action**

```ts
// src/app/(app)/nps/actions.ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { resumirNps, type ResumoNps } from "@/lib/nps/score";

export type ComentarioNps = { cliente: string; nota: number; comentario: string; data: string };
export type RelatorioNps = { resumo: ResumoNps; comentarios: ComentarioNps[] };

export async function relatorioNps(de: string, ate: string): Promise<RelatorioNps | null> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeCriarCliente(perfil.papel)) return null;
  const admin = createAdminSupabase();
  // criada_em é timestamptz: limite superior no fim do dia `ate`.
  const { data } = await admin
    .from("nps_resposta")
    .select("nota, comentario, criada_em, clientes(razao_social)")
    .gte("criada_em", de)
    .lte("criada_em", `${ate}T23:59:59`)
    .order("criada_em", { ascending: false });
  const linhas = data ?? [];
  const resumo = resumirNps(linhas.map((l) => Number(l.nota)));
  const comentarios: ComentarioNps[] = linhas
    .filter((l) => (l.comentario as string | null)?.trim())
    .map((l) => ({
      cliente: (l.clientes as { razao_social: string } | null)?.razao_social ?? "—",
      nota: Number(l.nota),
      comentario: l.comentario as string,
      data: (l.criada_em as string).slice(0, 10),
    }));
  return { resumo, comentarios };
}
```

- [ ] **Step 2: Escrever a página**

```tsx
// src/app/(app)/nps/page.tsx
import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatarData } from "@/lib/format";
import { controleCls } from "@/components/ui/Campo";
import { relatorioNps } from "./actions";

export const metadata = { title: "NPS" };

export default async function NpsPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");

  const sp = await searchParams;
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const de = sp.de || `${hoje.slice(0, 7)}-01`;
  const ate = sp.ate || hoje;

  const rel = await relatorioNps(de, ate);
  if (!rel) redirect("/");
  const { resumo: r, comentarios } = rel;
  const pct = (n: number) => (r.total > 0 ? Math.round((n / r.total) * 100) : 0);

  return (
    <Container largura="larga" className="space-y-5 p-4">
      <PageHeader titulo="NPS" subtitulo="Satisfação dos clientes coletada no portal" />

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
      </form>

      {r.total === 0 ? (
        <p className="rounded-2xl border border-linha bg-white p-6 text-sm text-cinza">Nenhuma resposta no período.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-linha bg-white p-4">
              <p className="text-xs text-cinza">Score NPS</p>
              <p className={`font-display text-4xl font-bold tabular-nums ${r.score < 0 ? "text-negativo" : "text-texto"}`}>
                {r.score}
              </p>
            </div>
            <div className="rounded-2xl border border-linha bg-white p-4">
              <p className="text-xs text-cinza">Promotores (9–10)</p>
              <p className="font-display text-2xl font-bold tabular-nums text-verde">
                {r.promotores} · {pct(r.promotores)}%
              </p>
            </div>
            <div className="rounded-2xl border border-linha bg-white p-4">
              <p className="text-xs text-cinza">Neutros (7–8)</p>
              <p className="font-display text-2xl font-bold tabular-nums text-cinza">
                {r.neutros} · {pct(r.neutros)}%
              </p>
            </div>
            <div className="rounded-2xl border border-linha bg-white p-4">
              <p className="text-xs text-cinza">Detratores (0–6)</p>
              <p className="font-display text-2xl font-bold tabular-nums text-negativo">
                {r.detratores} · {pct(r.detratores)}%
              </p>
            </div>
          </div>

          <div className="flex h-3 overflow-hidden rounded-full border border-linha">
            <div style={{ width: `${pct(r.promotores)}%` }} className="bg-verde" />
            <div style={{ width: `${pct(r.neutros)}%` }} className="bg-cinza-claro" />
            <div style={{ width: `${pct(r.detratores)}%` }} className="bg-negativo" />
          </div>
          <p className="text-xs text-cinza">{r.total} resposta(s) no período. Score varia de −100 a +100.</p>

          {comentarios.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-linha text-xs text-cinza">
                    <th className="px-3 py-2 text-left font-medium">Cliente</th>
                    <th className="px-3 py-2 text-right font-medium">Nota</th>
                    <th className="px-3 py-2 text-left font-medium">Comentário</th>
                    <th className="px-3 py-2 text-right font-medium">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {comentarios.map((c, i) => (
                    <tr key={i} className="border-b border-linha/60">
                      <td className="px-3 py-2 text-texto">{c.cliente}</td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          c.nota >= 9 ? "text-verde" : c.nota <= 6 ? "text-negativo" : "text-cinza"
                        }`}
                      >
                        {c.nota}
                      </td>
                      <td className="px-3 py-2 text-texto">{c.comentario}</td>
                      <td className="px-3 py-2 text-right text-cinza">{formatarData(c.data)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Container>
  );
}
```

- [ ] **Step 3: Adicionar o item no menu**

Em `src/lib/ui/navegacao.ts`, no grupo `"Relacionamento"`, acrescentar (o `podeCriarCliente` já está importado no arquivo):

```ts
        { href: "/comunicados", label: "Comunicados" },
        ...(podeCriarCliente(papel) ? [{ href: "/nps", label: "NPS" }] : []),
```

- [ ] **Step 4: Verificar tipos, lint e rotas alcançáveis**

Run: `npm run typecheck && npm run lint`
Expected: sem erros (incl. `rotas-alcancaveis` — `/nps` agora tem link no menu).

- [ ] **Step 5: Suite completa + build**

Run: `npm test && npm run build`
Expected: todos os testes passam (incl. `score.test.ts`); build conclui e lista a rota `/nps`.

- [ ] **Step 6: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rf074): painel /nps (score + distribuicao + comentarios) + menu"
```

> **Release da Fatia B:** bump minor + CHANGELOG, PR, `verify` verde, sem migration nova (as colunas vieram na Fatia A), Implantar, confirmar `/api/health`, tag, sync develop.

---

## Self-Review

- **Cobertura da spec:** coleta — migration+RLS (Task 2), lib devido (Task 1), card+action portal (Task 4), config (Task 3, movida da B para a A para tornar a fatia demonstrável); painel — lib score (Task 5), action+página+menu (Task 6). Testes puros de devido e score ✓.
- **Placeholders:** nenhum — todo passo traz código/comando completo. Os dois pontos de "modificar arquivo existente" (portal `page.tsx`, `navegacao.ts`, `configuracoes/page.tsx`) trazem o trecho exato a inserir.
- **Consistência de tipos:** `npsDevido` (Task 1) consumido com a mesma assinatura no portal (Task 4); `resumirNps`/`ResumoNps` (Task 5) consumidos na action (Task 6); `NpsConfig` definido e consumido dentro da Task 3. `responderNps` grava `cliente_id = perfil.clienteId`, casando com a policy `nps_ins_cliente` (`cliente_id = auth_cliente_id()`).
- **Fatias independentes:** Fatia A entrega coleta ponta a ponta (admin liga na config → cliente responde no portal); Fatia B só lê e visualiza — não altera A.
- **Fora de escopo respeitado:** sem e-mail/WhatsApp, sem cron, sem link público, sem série temporal, resposta imutável.
