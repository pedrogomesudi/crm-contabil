# RF-002 — Fatia A (dados) — Plano

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.
> Spec: `docs/superpowers/specs/2026-07-18-rf002-pipeline-configuravel-design.md`.

**Objetivo:** a fundação da RF-002 — as etapas do funil deixam de ser um enum fixo e passam a uma tabela
`funil_etapa`; a oportunidade ganha `etapa_id`/`desfecho`/`etapa_desde`/`segmento`/`regime`; a lógica pura
vira data-driven. **Sem mudança visual** (as fatias B e C constroem sobre isto).

**Arquitetura:** migração **aditiva** (a coluna enum `etapa` fica como vestígio para não haver janela de
quebra no deploy; o código para de usá-la). A lógica pura recebe as etapas ativas como **dado**, não da
constante. `ganho`/`perdido` continuam terminais de sistema — a conversão fica byte a byte.

**Stack:** Next.js 16, Supabase (Postgres + RLS), TypeScript, vitest.

## Global Constraints

- **`ganho`/`perdido` NÃO são configuráveis** — estados de sistema; a lógica de conversão
  (`ganhos/(ganhos+perdidos)`) fica inalterada.
- **A "régua de cobrança" (`regua_etapa`) NÃO entra** — casa "etapa" só por nome.
- **`regime` reusa `REGIMES`** de `lib/tipos.ts` (Simples/Presumido/Real/MEI/Isento-PF); o badge reusa
  `badgeRegime` de `lib/ui/apresentacao`.
- **Migração aditiva:** a coluna enum `etapa` permanece nesta fatia (dropada numa limpeza futura), para
  evitar janela de quebra entre a migration e o deploy.
- **Sem mudança visual** — o `QuadroComercial`/`MetricasFunil` continuam com as mesmas colunas e cards.
- **Migrations idempotentes**; aplicar com `npm run db:migrate`. Migration em produção antes do deploy.
- **`main` protegido:** PR de `develop` com o `verify` verde. **O merge não publica** (Implantar + health).
- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`,
  `npm run build`.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `supabase/migrations/0101_funil_etapa.sql` | **Criar** — tabela, seed, colunas, de-para, RLS | 1 |
| `src/lib/comercial/funil.ts` | **Modificar** — data-driven: `Etapa`, `resumoFunil`, `etapaAdjacente`, `rotuloEtapa`, + `diasNaEtapa`/`corDias` | 2 |
| `src/tests/comercial/funil.test.ts` | **Modificar** — testes data-driven | 2 |
| `src/lib/comercial/metricas.ts` | **Modificar** — `metricasFunil` recebe as etapas ativas | 3 |
| `src/tests/comercial/metricas.test.ts` | **Modificar** — passa as etapas | 3 |
| `src/app/(app)/comercial/actions.ts` | **Modificar** — lê `funil_etapa`, mapeia `etapa_id`/`desfecho`, `definirEtapa` toca `etapa_desde` | 4 |
| `src/app/(app)/comercial/QuadroComercial.tsx` | **Modificar** — consome etapas dinâmicas (sem mudança visual) | 5 |
| `src/app/(app)/comercial/MetricasFunil.tsx` | **Modificar** — idem | 5 |

---

### Task 1: A migration `funil_etapa`

**Files:**
- Create: `supabase/migrations/0101_funil_etapa.sql`

**Interfaces:**
- Produces: tabela `funil_etapa`; colunas `oportunidade.{etapa_id, desfecho, etapa_desde, segmento, regime}`;
  as 4 etapas semeadas; toda oportunidade com `etapa_id` (ativa) OU `desfecho` (terminal).

- [ ] **Step 1: Escrever a migration**

```sql
-- 0101_funil_etapa.sql
-- RF-002 Fatia A: as etapas ATIVAS do funil viram tabela (configuráveis pelo escritório).
-- ganho/perdido continuam estados de sistema (não entram aqui). ADITIVA: a coluna enum `etapa`
-- permanece como vestígio nesta fatia — o código para de usá-la; drop numa limpeza futura.

create table if not exists funil_etapa (
  id uuid primary key default gen_random_uuid(),
  rotulo text not null,
  ordem int not null,
  cor text not null default '#5A6163',
  probabilidade numeric(4,3) not null default 0.5,
  arquivada boolean not null default false,
  criado_em timestamptz not null default now()
);
alter table funil_etapa enable row level security;
do $$ begin
  drop policy if exists funil_etapa_rw on funil_etapa;
  create policy funil_etapa_rw on funil_etapa for all to authenticated
    using (auth_papel() in ('admin','assistente','contador'))
    with check (auth_papel() in ('admin','assistente','contador'));
end $$;

-- Semeia as 4 etapas ativas de hoje, na ordem e com os rótulos atuais. Idempotente pelo rótulo.
insert into funil_etapa (rotulo, ordem, cor, probabilidade)
select v.rotulo, v.ordem, v.cor, v.prob from (values
  ('Novo', 1, '#8C938E', 0.20),
  ('Contato feito', 2, '#3C6E8F', 0.40),
  ('Proposta enviada', 3, '#7C5CFF', 0.60),
  ('Negociação', 4, '#B5820E', 0.80)
) as v(rotulo, ordem, cor, prob)
where not exists (select 1 from funil_etapa f where f.rotulo = v.rotulo);

-- Colunas novas na oportunidade.
alter table oportunidade add column if not exists etapa_id uuid references funil_etapa(id);
alter table oportunidade add column if not exists desfecho text;  -- 'ganho' | 'perdido' | null
alter table oportunidade add column if not exists etapa_desde timestamptz not null default now();
alter table oportunidade add column if not exists segmento text;
alter table oportunidade add column if not exists regime text;

-- De-para do enum atual: cada etapa ativa aponta para a linha nova; ganho/perdido viram desfecho.
update oportunidade o set etapa_id = f.id
from funil_etapa f
where o.etapa_id is null and o.desfecho is null
  and f.rotulo = case o.etapa
    when 'novo' then 'Novo'
    when 'contato' then 'Contato feito'
    when 'proposta' then 'Proposta enviada'
    when 'negociacao' then 'Negociação'
    else null end;

update oportunidade set desfecho = etapa::text
where etapa in ('ganho','perdido') and desfecho is null;

-- Garante: exatamente um de (etapa_id, desfecho) preenchido. NOT VALID para não travar em linha legada
-- eventual; validamos depois do de-para.
do $$ begin
  alter table oportunidade drop constraint if exists oportunidade_etapa_xor;
  alter table oportunidade add constraint oportunidade_etapa_xor
    check ((etapa_id is null) != (desfecho is null));
end $$;
```

- [ ] **Step 2: Aplicar no dev**

Run: `npm run db:migrate`
Expected: aplica `0101`. Se `SUPABASE_DB_URL` faltar, avisar o Pedro. Não seguir sem aplicar.

- [ ] **Step 3: Provar o de-para — nenhuma órfã**

```bash
node --env-file=.env.local -e '
import("@supabase/supabase-js").then(async ({createClient})=>{
  const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
  const orf=await s.from("oportunidade").select("id",{count:"exact",head:true}).is("etapa_id",null).is("desfecho",null);
  const et=await s.from("funil_etapa").select("rotulo,ordem").order("ordem");
  console.log("orfas (deve 0):", orf.count ?? 0);
  console.log("etapas:", JSON.stringify(et.data));
});' 2>&1 | grep -v "punycode\|Deprecation"
```
Expected: `orfas (deve 0): 0` e as 4 etapas na ordem.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0101_funil_etapa.sql
git commit -m "feat(db): funil_etapa — etapas do funil viram tabela (RF-002 fatia A)"
```

---

### Task 2: `funil.ts` data-driven

**Files:**
- Modify: `src/lib/comercial/funil.ts` (reescrita)
- Test: `src/tests/comercial/funil.test.ts`

**Interfaces:**
- Produces:
  - `type Etapa = { id: string; rotulo: string; ordem: number; cor: string; probabilidade: number }`
  - `type ChaveEtapa = string` — o `etapa_id` (ativa) OU `"ganho"`/`"perdido"` (terminal).
  - `TERMINAIS: readonly ["ganho","perdido"]`
  - `rotuloEtapa(chave: ChaveEtapa, etapas: Etapa[]): string`
  - `etapaAdjacente(etapaId: string, etapas: Etapa[], dir: "anterior"|"proxima"): string | null`
  - `resumoFunil(ops: {etapa: ChaveEtapa; valorEstimado: number|null}[], etapas: Etapa[]): Record<string, {qtd:number; total:number}>`
  - `diasNaEtapa(etapaDesde: string, agoraISO: string): number`
  - `corDias(dias: number): "recente"|"atencao"|"parado"`

- [ ] **Step 1: Escrever os testes que falham**

Substituir `src/tests/comercial/funil.test.ts` por:
```ts
import { describe, it, expect } from "vitest";
import { rotuloEtapa, etapaAdjacente, resumoFunil, diasNaEtapa, corDias, type Etapa } from "@/lib/comercial/funil";

const ETAPAS: Etapa[] = [
  { id: "e1", rotulo: "Novo", ordem: 1, cor: "#000", probabilidade: 0.2 },
  { id: "e2", rotulo: "Contato feito", ordem: 2, cor: "#000", probabilidade: 0.4 },
  { id: "e3", rotulo: "Proposta enviada", ordem: 3, cor: "#000", probabilidade: 0.6 },
];

describe("rotuloEtapa", () => {
  it("etapa ativa → rótulo da lista; terminal → Ganho/Perdido", () => {
    expect(rotuloEtapa("e2", ETAPAS)).toBe("Contato feito");
    expect(rotuloEtapa("ganho", ETAPAS)).toBe("Ganho");
    expect(rotuloEtapa("perdido", ETAPAS)).toBe("Perdido");
    expect(rotuloEtapa("inexistente", ETAPAS)).toBe("—");
  });
});

describe("etapaAdjacente", () => {
  it("anda na ordem das etapas ativas; extremos → null", () => {
    expect(etapaAdjacente("e2", ETAPAS, "anterior")).toBe("e1");
    expect(etapaAdjacente("e2", ETAPAS, "proxima")).toBe("e3");
    expect(etapaAdjacente("e1", ETAPAS, "anterior")).toBeNull();
    expect(etapaAdjacente("e3", ETAPAS, "proxima")).toBeNull();
  });
});

describe("resumoFunil", () => {
  it("agrega qtd e total por etapa ativa", () => {
    const r = resumoFunil(
      [
        { etapa: "e1", valorEstimado: 100 },
        { etapa: "e1", valorEstimado: 50 },
        { etapa: "e3", valorEstimado: 200 },
        { etapa: "ganho", valorEstimado: 999 }, // terminal: ignorado
      ],
      ETAPAS,
    );
    expect(r["e1"]).toEqual({ qtd: 2, total: 150 });
    expect(r["e3"]).toEqual({ qtd: 1, total: 200 });
    expect(r["e2"]).toEqual({ qtd: 0, total: 0 });
  });
});

describe("diasNaEtapa / corDias", () => {
  it("conta dias inteiros entre etapa_desde e agora", () => {
    expect(diasNaEtapa("2026-07-10T12:00:00Z", "2026-07-12T12:00:00Z")).toBe(2);
    expect(diasNaEtapa("2026-07-12T12:00:00Z", "2026-07-12T18:00:00Z")).toBe(0);
  });
  it("cor semântica por faixa", () => {
    expect(corDias(1)).toBe("recente");
    expect(corDias(6)).toBe("atencao");
    expect(corDias(15)).toBe("parado");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/funil.test.ts`
Expected: FAIL — assinaturas mudaram / `diasNaEtapa` não existe.

- [ ] **Step 3: Reescrever `funil.ts`**

```ts
export type Etapa = { id: string; rotulo: string; ordem: number; cor: string; probabilidade: number };
export type ChaveEtapa = string; // etapa_id (ativa) OU "ganho"/"perdido" (terminal)

export const TERMINAIS = ["ganho", "perdido"] as const;
const ROTULO_TERMINAL: Record<string, string> = { ganho: "Ganho", perdido: "Perdido" };

export function rotuloEtapa(chave: ChaveEtapa, etapas: Etapa[]): string {
  if (chave in ROTULO_TERMINAL) return ROTULO_TERMINAL[chave]!;
  return etapas.find((e) => e.id === chave)?.rotulo ?? "—";
}

// Anda na ordem das etapas ATIVAS (já ordenadas por `ordem`). Só faz sentido para etapa ativa.
export function etapaAdjacente(etapaId: string, etapas: Etapa[], dir: "anterior" | "proxima"): string | null {
  const ord = [...etapas].sort((a, b) => a.ordem - b.ordem);
  const i = ord.findIndex((e) => e.id === etapaId);
  if (i < 0) return null;
  const j = dir === "anterior" ? i - 1 : i + 1;
  if (j < 0 || j >= ord.length) return null;
  return ord[j]!.id;
}

export function resumoFunil(
  ops: { etapa: ChaveEtapa; valorEstimado: number | null }[],
  etapas: Etapa[],
): Record<string, { qtd: number; total: number }> {
  const r: Record<string, { qtd: number; total: number }> = {};
  for (const e of etapas) r[e.id] = { qtd: 0, total: 0 };
  for (const o of ops) {
    if (!r[o.etapa]) continue; // terminais e etapas fora da lista: ignorados
    r[o.etapa]!.qtd += 1;
    r[o.etapa]!.total += o.valorEstimado ?? 0;
  }
  return r;
}

// Dias inteiros entre etapa_desde e agora. `agoraISO` é injetado (Date.now não é testável de forma pura).
export function diasNaEtapa(etapaDesde: string, agoraISO: string): number {
  const ms = new Date(agoraISO).getTime() - new Date(etapaDesde).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function corDias(dias: number): "recente" | "atencao" | "parado" {
  if (dias >= 10) return "parado";
  if (dias >= 5) return "atencao";
  return "recente";
}
```

> A constante `ETAPAS_ATIVAS` **sai** — as etapas agora vêm do banco. Quem a importava (Task 5) passa a
> receber a lista dinâmica.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/comercial/funil.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comercial/funil.ts src/tests/comercial/funil.test.ts
git commit -m "refactor(comercial): funil.ts data-driven (etapas como dado) + diasNaEtapa"
```

---

### Task 3: `metricas.ts` data-driven

**Files:**
- Modify: `src/lib/comercial/metricas.ts` (a `metricasFunil` e `OpMetrica`)
- Test: `src/tests/comercial/metricas.test.ts`

**Interfaces:**
- Consumes: `Etapa`, `ChaveEtapa` (Task 2).
- Produces: `metricasFunil(ops: OpMetrica[], etapas: Etapa[], inicio: string, fim: string): MetricasFunil`,
  com `OpMetrica.etapa: ChaveEtapa`. A lógica de conversão (`ganhos/(ganhos+perdidos)`) inalterada.

- [ ] **Step 1: Ajustar o teste**

Em `src/tests/comercial/metricas.test.ts`, os casos passam a usar `etapa` = id de etapa ativa (ex.: `"e1"`)
para as ativas e `"ganho"`/`"perdido"` para os terminais, e a chamada passa a lista de etapas. Adaptar as
fixtures existentes: onde hoje há `etapa: "novo"`, trocar por `etapa: "e1"` (id de uma `Etapa` de teste), e
chamar `metricasFunil(ops, ETAPAS, inicio, fim)`. Os asserts de conversão/ganhos/perdidos **não mudam** (os
terminais continuam `"ganho"`/`"perdido"`). Definir no topo:
```ts
const ETAPAS = [
  { id: "e1", rotulo: "Novo", ordem: 1, cor: "#000", probabilidade: 0.2 },
  { id: "e2", rotulo: "Contato feito", ordem: 2, cor: "#000", probabilidade: 0.4 },
];
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/metricas.test.ts`
Expected: FAIL — `metricasFunil` agora exige a lista de etapas.

- [ ] **Step 3: Adaptar `metricas.ts`**

- `OpMetrica.etapa` passa de `EtapaOportunidade` para `ChaveEtapa` (importar de `./funil`).
- A constante local `const ATIVAS = ["novo", ...]` **sai**; a função recebe `etapas: Etapa[]`:
```ts
export function metricasFunil(ops: OpMetrica[], etapas: Etapa[], inicio: string, fim: string): MetricasFunil {
  const idsAtivas = new Set(etapas.map((e) => e.id));
  const porEtapa: Record<string, { qtd: number; total: number }> = {};
  for (const e of etapas) porEtapa[e.id] = { qtd: 0, total: 0 };
  let totQ = 0, totV = 0;
  for (const o of ops) {
    if (o.etapa === "ganho" || o.etapa === "perdido") continue;
    if (idsAtivas.has(o.etapa)) {
      porEtapa[o.etapa]!.qtd += 1;
      porEtapa[o.etapa]!.total += o.valorEstimado ?? 0;
    }
    totQ += 1;
    totV += o.valorEstimado ?? 0;
  }
  // ...o resto (fechados, ganhos, perdidos, taxaConversao, porResponsavel, motivosPerda) INALTERADO...
```
Manter todo o bloco de `fechados`/conversão exatamente como está — só o cálculo do `porEtapa` mudou.
Adicionar o import: `import type { Etapa, ChaveEtapa } from "./funil";`

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/comercial/metricas.test.ts`
Expected: PASS. Conferir que os números de conversão batem com antes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comercial/metricas.ts src/tests/comercial/metricas.test.ts
git commit -m "refactor(comercial): metricasFunil recebe as etapas ativas (conversao inalterada)"
```

---

### Task 4: `actions.ts` — servidor lê `funil_etapa` e mapeia o novo modelo

**Files:**
- Modify: `src/app/(app)/comercial/actions.ts`

**Interfaces:**
- Consumes: `funil_etapa` (Task 1), `Etapa`/`ChaveEtapa` (Task 2).
- Produces:
  - `listarEtapas(): Promise<Etapa[]>` — as ativas (`arquivada = false`), ordenadas.
  - `OportunidadeView.etapa` passa a ser `ChaveEtapa` (etapa_id ou "ganho"/"perdido"), + `etapaDesde`,
    `segmento`, `regime`.
  - `definirEtapa(id, etapa: ChaveEtapa, motivo?)` — grava `etapa_id`/`desfecho` e **`etapa_desde`**.

- [ ] **Step 1: `listarEtapas`**

Adicionar em `actions.ts`:
```ts
export async function listarEtapas(): Promise<Etapa[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("funil_etapa")
    .select("id, rotulo, ordem, cor, probabilidade")
    .eq("arquivada", false)
    .order("ordem");
  return (data ?? []).map((e) => ({
    id: e.id as string,
    rotulo: e.rotulo as string,
    ordem: e.ordem as number,
    cor: e.cor as string,
    probabilidade: Number(e.probabilidade),
  }));
}
```
E o import: `import { type Etapa, type ChaveEtapa } from "@/lib/comercial/funil";` (remover
`EtapaOportunidade` do import de `funil`).

- [ ] **Step 2: `listarOportunidades` — trazer o novo modelo**

No `select` (linha ~60), trocar `etapa` por `etapa_id, desfecho, etapa_desde, segmento, regime`. No map
(linha ~81), a `etapa` da view passa a ser a chave canônica:
```ts
    etapa: (r.desfecho as string | null) ?? (r.etapa_id as string),
    etapaDesde: r.etapa_desde as string,
    segmento: (r.segmento as string | null) ?? null,
    regime: (r.regime as string | null) ?? null,
```
E o tipo `OportunidadeView`: `etapa: ChaveEtapa;` + `etapaDesde: string; segmento: string | null; regime: string | null;`.

- [ ] **Step 3: `definirEtapa` — grava etapa_id/desfecho + etapa_desde**

A permissão e o `revalidatePath` **ficam idênticos** ao `definirEtapa` de hoje (`getPerfilAtual()` +
`podeCriarCliente(p.papel)`). Só muda a assinatura (`etapa: ChaveEtapa`) e o `patch`:
```ts
export async function definirEtapa(
  id: string,
  etapa: ChaveEtapa,
  motivo?: string | null,
): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const terminal = etapa === "ganho" || etapa === "perdido";
  const patch: Record<string, unknown> = {
    etapa_id: terminal ? null : etapa,
    desfecho: terminal ? etapa : null,
    etapa_desde: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
    fechado_em: terminal ? new Date().toISOString() : null,
  };
  if (etapa === "perdido") patch.motivo_perda = motivo ?? null;
  const { error } = await supabase.from("oportunidade").update(patch).eq("id", id);
  if (error) return { erro: "Falha ao mover." };
  revalidatePath("/comercial");
  return { ok: true };
}
```

- [ ] **Step 4: `criarOportunidade`/`salvarOportunidade` — etapa_id inicial + segmento/regime**

Ao **criar**, a oportunidade nasce na 1ª etapa ativa. Em `paraColunas`/no insert, incluir
`etapa_id: (await primeiraEtapaAtiva())`, `segmento`, `regime`. Adicionar helper:
```ts
async function primeiraEtapaAtiva(): Promise<string | null> {
  const es = await listarEtapas();
  return es[0]?.id ?? null;
}
```
E `OportunidadeInput` ganha `segmento?: string | null; regime?: string | null`. (O enum `etapa` legado
**não** é mais setado no insert — cai no default 'novo' do banco, vestigial.)

- [ ] **Step 5: Verificar**

```bash
npm run typecheck
```
Expected: aponta os leitores da view em `QuadroComercial`/`MetricasFunil` (Task 5). É esperado — o
typecheck fecha após a Task 5.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/comercial/actions.ts"
git commit -m "feat(comercial): actions leem funil_etapa; definirEtapa toca etapa_desde"
```

---

### Task 5: Adaptar o quadro e as métricas (sem mudança visual)

**Files:**
- Modify: `src/app/(app)/comercial/QuadroComercial.tsx`
- Modify: `src/app/(app)/comercial/MetricasFunil.tsx`
- Modify: `src/app/(app)/comercial/page.tsx` (passar as etapas)

**Interfaces:**
- Consumes: `listarEtapas` (Task 4), `Etapa`, `resumoFunil`/`etapaAdjacente`/`rotuloEtapa` dinâmicos (Task 2),
  `metricasFunil(ops, etapas, …)` (Task 3).

- [ ] **Step 1: `page.tsx` — carregar e passar as etapas**

Na página do comercial, `const etapas = await listarEtapas();` e passar `etapas` ao `QuadroComercial`
(e onde a `MetricasFunil` é montada). Idem na página de métricas.

- [ ] **Step 2: `QuadroComercial` — iterar etapas dinâmicas**

- Recebe `etapas: Etapa[]` como prop.
- `ETAPAS_ATIVAS.map((col) => …)` (linha ~104) vira `etapas.map((col) => …)`, usando `col.id` como chave e
  `col.rotulo`/`col.cor`.
- `resumo = resumoFunil(ativas.map((o) => ({ etapa: o.etapa, valorEstimado: o.valorEstimado })), etapas)`.
- `etapaAdjacente(o.etapa, "…")` → `etapaAdjacente(o.etapa, etapas, "…")` (linhas ~154/165).
- `rotuloEtapa(o.etapa)` → `rotuloEtapa(o.etapa, etapas)` (linha ~214).
- `o.etapa === "ganho"` (linha ~214) continua válido (terminal é a string "ganho").
- **Sem mudança visual** — mesmas colunas, mesmos cards. (Segmento/regime/dias entram na Fatia B.)

- [ ] **Step 3: `MetricasFunil` — passar etapas**

- `metricasFunil(oportunidades, inicio, fim)` → `metricasFunil(oportunidades, etapas, inicio, fim)`.
- `ETAPAS_ATIVAS.map((e) => …)` (linha ~36) → `etapas.map((e) => …)`.
- Recebe `etapas` como prop.

- [ ] **Step 4: Verificar**

```bash
npm run typecheck && npm run lint && npx vitest run && npm run build
```
Expected: verde. Os testes de `quadro-render`/`metricas-render` podem precisar de ajuste (passar `etapas`);
adaptá-los para as etapas de teste, sem mudar o que verificam visualmente.

- [ ] **Step 5: Conferir na tela** — `npm run dev`, `/comercial`: o quadro está **idêntico** ao de antes
  (mesmas 4 colunas, mesmos cards). Mover um negócio funciona e agora grava `etapa_desde`.

- [ ] **Step 6: `format` e commit**

```bash
npm run format
git add -A
git commit -m "refactor(comercial): quadro e metricas consomem etapas dinamicas (sem mudanca visual)"
```

---

### Task 6: Entregar por PR

**Files:** nenhum (só entrega). Sem CHANGELOG: a Fatia A é invisível; o CHANGELOG entra na Fatia B (a
primeira visível) ou registra a RF-002 quando as três fecharem.

- [ ] **Step 1: Verificação final**

```bash
npm run lint && npm run typecheck && npm test && npm run format && npm run build
npx prettier --check .
```

- [ ] **Step 2: PR**

```bash
git push origin develop
gh pr create --base main --head develop --title "RF-002 fatia A: etapas do funil viram tabela (fundacao, sem UI)"
gh pr checks --watch
```

- [ ] **Step 3: A release**

> **Migration `0101` em produção antes do deploy** (SQL Editor). Como é aditiva e sem mudança visual,
> pode ir ao ar sem bump de versão próprio (é fundação) — ou segurar o deploy e juntar com a Fatia B.
> Decidir com o Pedro: **recomendação — não lançar sozinha**; deixar no `main` e publicar junto da Fatia B,
> que é a primeira visível. A migration, essa sim, roda em produção quando a Fatia B for ao ar.
