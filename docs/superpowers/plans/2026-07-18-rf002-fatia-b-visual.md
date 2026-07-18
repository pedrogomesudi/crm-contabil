# RF-002 — Fatia B (pipeline visual) — Plano

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.
> Spec: `docs/superpowers/specs/2026-07-18-rf002-pipeline-configuravel-design.md`. Depende da **Fatia A**
> (já na `develop`): `funil_etapa`, `etapa_id`/`desfecho`/`etapa_desde`/`segmento`/`regime`, e a lógica
> pura data-driven (`funil.ts`, `metricas.ts`).

**Objetivo:** dar ao funil a cara do pipeline do mockup — faixa de métricas no topo, busca, colunas
coloridas por etapa e cards ricos (segmento · valor · badge de regime · avatar · dias na etapa) —
**sem tocar no modelo de dados** (a Fatia A já o preparou).

**Arquitetura:** um novo agregado puro `resumoPipeline` (valor em pipeline, ponderado, taxa de conversão,
ciclo médio) alimenta 4 `StatCard`. O `QuadroComercial` ganha busca em memória, colunas coloridas pela
`funil_etapa.cor` e um card rico que reusa `Iniciais`/`Badge`/`badgeRegime` e as funções
`diasNaEtapa`/`corDias` da Fatia A. O formulário passa a editar `segmento` e `regime`.

**Stack:** Next.js 16, React (client components), Tailwind 4, vitest + `renderToStaticMarkup`.

## Global Constraints

- **Nenhuma migration nesta fatia.** O modelo já veio na Fatia A. **Mas a `0101` (Fatia A) roda em
  produção junto deste deploy** — é a primeira vez que a Fatia A vai ao ar.
- **`ganho`/`perdido` continuam terminais de sistema** — a taxa de conversão é `ganhos/(ganhos+perdidos)`.
- **`regime` reusa `REGIMES`** de `@/lib/tipos` (`Simples`/`Presumido`/`Real`/`MEI`/`Isento/PF`); o badge
  reusa `badgeRegime` de `@/lib/ui/apresentacao`.
- **Reusar o que existe:** `StatCard` (`rotulo`, `valor`, `variante`), `Iniciais` (`nome`), `Badge`
  (`variante`), `iniciais`/`badgeRegime`, `diasNaEtapa`/`corDias`. Não reinventar.
- **`agora` vem do servidor** como prop ISO (evita mismatch de hidratação com `new Date()` no cliente),
  como o `hoje` da `MetricasFunil`.
- **Drag-and-drop e o fluxo de criar/editar/ganho/perder permanecem** — só a apresentação muda e o
  formulário ganha `segmento`/`regime`.
- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`,
  `npm run build`.
- **`main` protegido:** entrega por PR `develop → main` com o `verify` verde. **O merge não publica**
  (Implantar + confirmar no `/api/health`). Versão sobe junto do CHANGELOG no mesmo PR
  (`versao.test.ts` exige que batam).

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/lib/comercial/metricas.ts` | **Modificar** — `resumoPipeline` + `cicloMedioDias` | 1 |
| `src/tests/comercial/pipeline.test.ts` | **Criar** — testes de `resumoPipeline`/`cicloMedioDias` | 1 |
| `src/app/(app)/comercial/page.tsx` | **Modificar** — passar `agora` | 2 |
| `src/app/(app)/comercial/QuadroComercial.tsx` | **Modificar** — faixa de StatCards, busca, colunas coloridas, card rico, `segmento`/`regime` no form, "+ Adicionar" por coluna | 2-5 |
| `src/app/(app)/comercial/actions.ts` | **Modificar** — `criarOportunidade` aceita `etapaId` inicial opcional | 5 |
| `src/tests/comercial/quadro-render.test.tsx` | **Modificar** — cobre StatCards, busca e card rico | 2-4 |
| `CHANGELOG.md` + `package.json` | **Modificar** — release 6.12.0 | 6 |

---

### Task 1: Agregado do topo — `resumoPipeline` + `cicloMedioDias`

**Files:**
- Modify: `src/lib/comercial/metricas.ts`
- Test: `src/tests/comercial/pipeline.test.ts` (criar)

**Interfaces:**
- Consumes: `Etapa`, `ChaveEtapa` (Fatia A), `diasNaEtapa` (de `./funil`).
- Produces:
  - `type OpPipeline = { etapa: ChaveEtapa; valorEstimado: number|null; criadoEm: string; fechadoEm: string|null }`
  - `cicloMedioDias(ops: OpPipeline[]): number` — média de dias `criadoEm→fechadoEm` dos **ganhos**; 0 se nenhum.
  - `resumoPipeline(ops: OpPipeline[], etapas: Etapa[]): { valorPipeline: number; valorPonderado: number; taxaConversao: number; cicloMedioDias: number }`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/tests/comercial/pipeline.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resumoPipeline, cicloMedioDias } from "@/lib/comercial/metricas";
import type { Etapa } from "@/lib/comercial/funil";

const ETAPAS: Etapa[] = [
  { id: "e1", rotulo: "Novo", ordem: 1, cor: "#000", probabilidade: 0.2 },
  { id: "e2", rotulo: "Proposta", ordem: 2, cor: "#000", probabilidade: 0.5 },
];

const ops = [
  { etapa: "e1", valorEstimado: 100, criadoEm: "2026-07-01T00:00:00.000Z", fechadoEm: null },
  { etapa: "e2", valorEstimado: 200, criadoEm: "2026-07-01T00:00:00.000Z", fechadoEm: null },
  {
    etapa: "ganho",
    valorEstimado: 1000,
    criadoEm: "2026-07-01T00:00:00.000Z",
    fechadoEm: "2026-07-11T00:00:00.000Z", // 10 dias
  },
  {
    etapa: "perdido",
    valorEstimado: 300,
    criadoEm: "2026-07-01T00:00:00.000Z",
    fechadoEm: "2026-07-05T00:00:00.000Z",
  },
];

describe("cicloMedioDias", () => {
  it("média de dias criado→fechado só dos ganhos", () => {
    expect(cicloMedioDias(ops)).toBe(10);
    expect(cicloMedioDias([])).toBe(0);
  });
});

describe("resumoPipeline", () => {
  const r = resumoPipeline(ops, ETAPAS);
  it("valor em pipeline = soma das ativas", () => {
    expect(r.valorPipeline).toBe(300); // 100 + 200
  });
  it("ponderado = Σ valor × probabilidade da etapa", () => {
    expect(r.valorPonderado).toBeCloseTo(120); // 100*0.2 + 200*0.5
  });
  it("taxa de conversão sobre todos os fechados", () => {
    expect(r.taxaConversao).toBeCloseTo(0.5); // 1 ganho / (1 ganho + 1 perdido)
  });
  it("ciclo médio", () => {
    expect(r.cicloMedioDias).toBe(10);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/pipeline.test.ts`
Expected: FAIL — `resumoPipeline`/`cicloMedioDias` não existem.

- [ ] **Step 3: Implementar em `metricas.ts`**

No topo, garantir o import de `diasNaEtapa`:
```ts
import { diasNaEtapa, type Etapa, type ChaveEtapa } from "./funil";
```
(hoje o import é `import type { Etapa, ChaveEtapa } from "./funil";` — trocar para o `import` acima, pois
`diasNaEtapa` é um valor, não só tipo.)

Adicionar ao final do arquivo:
```ts
export type OpPipeline = {
  etapa: ChaveEtapa;
  valorEstimado: number | null;
  criadoEm: string;
  fechadoEm: string | null;
};

// Média de dias criado→fechado dos GANHOS. 0 se não houver ganho com data.
export function cicloMedioDias(ops: OpPipeline[]): number {
  const ganhos = ops.filter((o) => o.etapa === "ganho" && o.fechadoEm != null);
  if (ganhos.length === 0) return 0;
  const soma = ganhos.reduce((s, o) => s + diasNaEtapa(o.criadoEm, o.fechadoEm!), 0);
  return Math.round(soma / ganhos.length);
}

// Números do topo do pipeline: valor em aberto, ponderado pela probabilidade da etapa,
// taxa de conversão e ciclo médio (ambos sobre TODO o histórico de fechados).
export function resumoPipeline(
  ops: OpPipeline[],
  etapas: Etapa[],
): { valorPipeline: number; valorPonderado: number; taxaConversao: number; cicloMedioDias: number } {
  const prob = new Map(etapas.map((e) => [e.id, e.probabilidade]));
  const ativas = ops.filter((o) => o.etapa !== "ganho" && o.etapa !== "perdido");
  const valorPipeline = ativas.reduce((s, o) => s + (o.valorEstimado ?? 0), 0);
  const valorPonderado = ativas.reduce((s, o) => s + (o.valorEstimado ?? 0) * (prob.get(o.etapa) ?? 0), 0);
  const ganhos = ops.filter((o) => o.etapa === "ganho").length;
  const perdidos = ops.filter((o) => o.etapa === "perdido").length;
  const den = ganhos + perdidos;
  return {
    valorPipeline,
    valorPonderado,
    taxaConversao: den > 0 ? ganhos / den : 0,
    cicloMedioDias: cicloMedioDias(ops),
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/comercial/pipeline.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/comercial/metricas.ts src/tests/comercial/pipeline.test.ts
git commit -m "feat(comercial): resumoPipeline (valor/ponderado/conversao/ciclo) para o topo do funil"
```

---

### Task 2: Faixa de 4 StatCards no topo do quadro

**Files:**
- Modify: `src/app/(app)/comercial/page.tsx` (passar `agora`)
- Modify: `src/app/(app)/comercial/QuadroComercial.tsx`
- Test: `src/tests/comercial/quadro-render.test.tsx`

**Interfaces:**
- Consumes: `resumoPipeline` (Task 1), `StatCard` (`@/components/ui/StatCard`).
- Produces: `QuadroComercial` recebe `agora: string`; renderiza 4 `StatCard` no topo.

- [ ] **Step 1: `page.tsx` passa `agora`**

Em `src/app/(app)/comercial/page.tsx`, após carregar as etapas, calcular o ISO no servidor e passar:
```tsx
  const agora = new Date().toISOString();
  ...
  <QuadroComercial oportunidades={oportunidades} usuarios={usuarios} etapas={etapas} agora={agora} />
```

- [ ] **Step 2: Ajustar o teste de render (nova prop + StatCards)**

Em `src/tests/comercial/quadro-render.test.tsx`, passar `agora="2026-07-20T00:00:00.000Z"` nas duas
renderizações e adicionar asserts das métricas do topo:
```tsx
const html = renderToStaticMarkup(
  <QuadroComercial oportunidades={ops} usuarios={[{ id: "u1", nome: "Ana" }]} etapas={ETAPAS} agora="2026-07-20T00:00:00.000Z" />,
);
expect(html).toContain("Em pipeline");
expect(html).toContain("Ponderado");
expect(html).toContain("Conversão");
expect(html).toContain("Ciclo médio");
```
(e a segunda chamada `renderToStaticMarkup(<QuadroComercial ... etapas={ETAPAS} agora="..." />)`.)

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/quadro-render.test.tsx`
Expected: FAIL — `agora` faltando / rótulos ausentes.

- [ ] **Step 4: Implementar a faixa no `QuadroComercial`**

Import:
```ts
import { StatCard } from "@/components/ui/StatCard";
import { resumoPipeline } from "@/lib/comercial/metricas";
```
Assinatura ganha `agora: string`:
```ts
export function QuadroComercial({
  oportunidades,
  usuarios,
  etapas,
  agora,
}: {
  oportunidades: OportunidadeView[];
  usuarios: { id: string; nome: string }[];
  etapas: Etapa[];
  agora: string;
}) {
```
Depois de `const base = ...`, computar o resumo do topo sobre `base` (respeita o filtro "só as minhas"):
```ts
  const topo = resumoPipeline(
    base.map((o) => ({
      etapa: o.etapa,
      valorEstimado: o.valorEstimado,
      criadoEm: o.criadoEm,
      fechadoEm: o.fechadoEm,
    })),
    etapas,
  );
```
Logo abaixo da barra de ações (o `<div className="flex flex-wrap items-center gap-3">…</div>`), inserir:
```tsx
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard rotulo="Em pipeline" valor={brl(topo.valorPipeline)} />
        <StatCard rotulo="Ponderado" valor={brl(topo.valorPonderado)} variante="destaque" />
        <StatCard rotulo="Conversão" valor={`${Math.round(topo.taxaConversao * 100)}%`} variante="positivo" />
        <StatCard rotulo="Ciclo médio" valor={`${topo.cicloMedioDias} d`} />
      </div>
```
> `brl` já existe no arquivo. `variante` de `StatCard` é `VarianteStat` (`neutro`/`positivo`/`destaque`/
> `negativo`, de `@/lib/ui/stat`) — `destaque` é o violeta.

- [ ] **Step 5: Rodar e verificar**

Run: `npx vitest run src/tests/comercial/quadro-render.test.tsx && npm run typecheck`
Expected: PASS + typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/comercial/page.tsx" "src/app/(app)/comercial/QuadroComercial.tsx" src/tests/comercial/quadro-render.test.tsx
git commit -m "feat(comercial): faixa de metricas no topo do funil (em pipeline/ponderado/conversao/ciclo)"
```

---

### Task 3: Card rico + `segmento`/`regime` no formulário

**Files:**
- Modify: `src/app/(app)/comercial/QuadroComercial.tsx`
- Test: `src/tests/comercial/quadro-render.test.tsx`

**Interfaces:**
- Consumes: `Iniciais` (`@/components/ui/Iniciais`), `Badge` (`@/components/ui/Badge`), `badgeRegime`
  (`@/lib/ui/apresentacao`), `diasNaEtapa`/`corDias` (`@/lib/comercial/funil`), `REGIMES` (`@/lib/tipos`).
- Produces: card do quadro exibe avatar · segmento · valor · badge de regime · dias na etapa; o form edita
  `segmento` e `regime`.

- [ ] **Step 1: Teste — o card mostra segmento e regime**

Em `quadro-render.test.tsx`, dar à op ativa um `segmento` e `regime`:
```tsx
// na op "1" (ativa): trocar segmento/regime de null para valores
segmento: "Padaria",
regime: "Simples",
```
E nos asserts do primeiro teste:
```tsx
expect(html).toContain("Padaria"); // segmento no card
expect(html).toContain("Simples"); // badge de regime
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/quadro-render.test.tsx`
Expected: FAIL — segmento/regime ainda não aparecem.

- [ ] **Step 3: Implementar o card rico**

Imports:
```ts
import { Iniciais } from "@/components/ui/Iniciais";
import { Badge } from "@/components/ui/Badge";
import { badgeRegime } from "@/lib/ui/apresentacao";
import { etapaAdjacente, resumoFunil, rotuloEtapa, diasNaEtapa, corDias, type Etapa, type ChaveEtapa } from "@/lib/comercial/funil";
import { REGIMES } from "@/lib/tipos";
```
Helper de cor dos dias (perto do `brl`):
```ts
const TEXTO_DIAS: Record<"recente" | "atencao" | "parado", string> = {
  recente: "text-cinza",
  atencao: "text-atencao",
  parado: "text-negativo",
};
```
No corpo do card ativo (o bloco `draggable`), trocar o miolo por um layout com avatar + conteúdo:
- linha 1: `<Iniciais nome={o.responsavelNome ?? o.prospectNome} />` + nome + valor;
- linha 2: `segmento` (se houver) · badge de regime (`{o.regime && <Badge variante={badgeRegime(o.regime)}>{o.regime}</Badge>}`);
- linha 3 (dias): `{(() => { const d = diasNaEtapa(o.etapaDesde, agora); return <span className={TEXTO_DIAS[corDias(d)]}>{d} d nesta etapa</span>; })()}` — ou computar `d` antes do JSX do card.
- manter a linha de botões (← → Ganho Perdido propostas editar) como está.

Exemplo do cabeçalho do card:
```tsx
<div className="flex items-start gap-2">
  <Iniciais nome={o.responsavelNome ?? o.prospectNome} />
  <div className="min-w-0 flex-1">
    <div className="flex items-center justify-between gap-2">
      <span className="truncate font-medium text-texto">{o.prospectNome}</span>
      <span className="tabular-nums text-cinza">{brl(o.valorEstimado)}</span>
    </div>
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-cinza">
      {o.segmento && <span>{o.segmento}</span>}
      {o.regime && <Badge variante={badgeRegime(o.regime)}>{o.regime}</Badge>}
    </div>
  </div>
</div>
```
E, abaixo, os "dias na etapa" (com `d = diasNaEtapa(o.etapaDesde, agora)`):
```tsx
<div className="text-[11px]">
  <span className={TEXTO_DIAS[corDias(d)]}>{d} d nesta etapa</span>
</div>
```

- [ ] **Step 4: Adicionar `segmento` e `regime` ao formulário**

No modal do form, junto de Origem/Serviço, acrescentar uma linha:
```tsx
<div className="flex gap-2">
  <label className="flex-1 text-xs text-cinza">
    Segmento
    <input
      value={form.input.segmento ?? ""}
      onChange={(e) => setForm({ ...form, input: { ...form.input, segmento: e.target.value || null } })}
      className={`${controleCls("compacto")} mt-0.5 w-full`}
    />
  </label>
  <label className="flex-1 text-xs text-cinza">
    Regime
    <select
      value={form.input.regime ?? ""}
      onChange={(e) => setForm({ ...form, input: { ...form.input, regime: e.target.value || null } })}
      className={`${controleCls("compacto")} mt-0.5 w-full`}
    >
      <option value="">—</option>
      {REGIMES.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  </label>
</div>
```
> `vazio()`/`doView()` já incluem `segmento`/`regime` (Fatia A) — só faltavam os campos na tela.

- [ ] **Step 5: Rodar e verificar**

Run: `npx vitest run src/tests/comercial/quadro-render.test.tsx && npm run typecheck`
Expected: PASS + limpo.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/comercial/QuadroComercial.tsx" src/tests/comercial/quadro-render.test.tsx
git commit -m "feat(comercial): card rico do funil (avatar/segmento/regime/dias) + campos no form"
```

---

### Task 4: Busca de negócio (filtro em memória)

**Files:**
- Modify: `src/app/(app)/comercial/QuadroComercial.tsx`
- Test: `src/tests/comercial/quadro-render.test.tsx`

**Interfaces:**
- Produces: campo "Buscar negócio…" que filtra as oportunidades por nome do prospect **ou** segmento.

- [ ] **Step 1: Teste — o campo de busca existe**

Em `quadro-render.test.tsx`, no primeiro teste:
```tsx
expect(html).toContain('placeholder="Buscar negócio…"');
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/quadro-render.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar a busca**

Estado novo:
```ts
const [busca, setBusca] = useState("");
```
Aplicar o filtro **antes** de derivar `ativas`/`fechadas`/`topo`, sobre `base`:
```ts
const t = busca.trim().toLowerCase();
const filtradas = t
  ? base.filter((o) => `${o.prospectNome} ${o.segmento ?? ""}`.toLowerCase().includes(t))
  : base;
```
e trocar os usos seguintes de `base` por `filtradas` (nas derivações de `ativas`, `fechadas`, `topo` e
`resumo`). O input, ao lado dos controles do topo:
```tsx
<input
  value={busca}
  onChange={(e) => setBusca(e.target.value)}
  placeholder="Buscar negócio…"
  className={`${controleCls("compacto")} w-full sm:w-56`}
/>
```

- [ ] **Step 4: Rodar e verificar**

Run: `npx vitest run src/tests/comercial/quadro-render.test.tsx && npm run typecheck`
Expected: PASS + limpo.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/comercial/QuadroComercial.tsx" src/tests/comercial/quadro-render.test.tsx
git commit -m "feat(comercial): busca de negocio no funil (nome/segmento, em memoria)"
```

---

### Task 5: Colunas coloridas + "+ Adicionar" por coluna

**Files:**
- Modify: `src/app/(app)/comercial/QuadroComercial.tsx`
- Modify: `src/app/(app)/comercial/actions.ts`

**Interfaces:**
- Consumes: `funil_etapa.cor` (via `Etapa.cor`).
- Produces: cabeçalho da coluna com a cor da etapa; botão "+ Adicionar" por coluna que cria já naquela
  etapa. `criarOportunidade(input, etapaId?)` — `etapaId` opcional (default: primeira etapa ativa).

- [ ] **Step 1: `criarOportunidade` aceita a etapa inicial**

Em `actions.ts`:
```ts
export async function criarOportunidade(
  input: OportunidadeInput,
  etapaId?: string,
): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  if (!input.prospectNome.trim()) return { erro: "Informe o prospect." };
  const alvo = etapaId ?? (await primeiraEtapaAtiva());
  if (!alvo) return { erro: "Nenhuma etapa de funil configurada." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("oportunidade").insert({ ...paraColunas(input), etapa_id: alvo });
  if (error) return { erro: "Falha ao criar." };
  revalidatePath("/comercial");
  return { ok: true };
}
```

- [ ] **Step 2: Coluna colorida + botão por coluna no `QuadroComercial`**

- O estado do form ganha a etapa alvo:
  `useState<{ id: string | null; etapaId?: string; input: OportunidadeInput } | null>(null)`.
- No cabeçalho da coluna (`<div className="rounded-lg bg-creme px-2 py-1.5">`), acrescentar um ponto/borda
  com `col.cor`:
  ```tsx
  <div className="flex items-center gap-1.5">
    <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: col.cor }} />
    <div className="font-display text-xs font-semibold uppercase tracking-wide text-texto">{col.rotulo}</div>
  </div>
  ```
- No fim de cada coluna (após os cards), um botão discreto:
  ```tsx
  <button
    type="button"
    onClick={() => setForm({ id: null, etapaId: col.id, input: vazio() })}
    className="w-full rounded-lg border border-dashed border-linha py-1 text-[11px] text-cinza hover:text-texto"
  >
    + Adicionar
  </button>
  ```
- No `salvar()`, propagar a etapa alvo ao criar:
  ```ts
  const r = await (form.id
    ? salvarOportunidade(form.id, form.input)
    : criarOportunidade(form.input, form.etapaId));
  ```

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npx vitest run src/tests/comercial/quadro-render.test.tsx`
Expected: limpo + PASS (os asserts de render seguem válidos).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/comercial/QuadroComercial.tsx" "src/app/(app)/comercial/actions.ts"
git commit -m "feat(comercial): colunas coloridas por etapa + adicionar negocio na coluna"
```

---

### Task 6: Conferência visual e release 6.12.0

**Files:**
- Modify: `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Verificação completa**

```bash
npm run lint && npm run typecheck && npm test && npm run format && npm run build
npx prettier --check .
```
Expected: tudo verde.

- [ ] **Step 2: Conferência na tela** — `npm run dev`, `/comercial`: faixa de métricas no topo, busca
  filtrando, colunas coloridas, cards com avatar/segmento/regime/dias, "+ Adicionar" por coluna, e o form
  editando segmento/regime. Criar um negócio de teste em uma coluna e movê-lo (grava `etapa_desde`).
  **Mostrar ao Pedro antes do PR** (padrão dele de revisar o visual).

- [ ] **Step 3: Bump + CHANGELOG (mesmo PR)**

- `package.json`: `6.11.0` → `6.12.0`.
- `CHANGELOG.md`: mover o conteúdo para uma seção `## [6.12.0] — <data>` com um bloco `### Adicionado`
  descrevendo o pipeline visual (métricas no topo, busca, colunas coloridas, cards ricos) e citando que a
  fundação (RF-002 Fatia A — `funil_etapa`) vai ao ar neste release.
- Conferir `npx vitest run src/tests/versao.test.ts` (exige package.json ↔ CHANGELOG).

- [ ] **Step 4: PR**

```bash
git push origin develop
gh pr create --base main --head develop --title "RF-002 fatia B: pipeline visual (v6.12.0)"
gh pr checks --watch
```

- [ ] **Step 5: Release (com o Pedro)**

> **Ordem obrigatória:** (1) rodar a **migration `0101`** em produção pelo SQL Editor — é a Fatia A indo
> ao ar; (2) `gh pr merge --merge`; (3) **Implantar** no EasyPanel; (4) confirmar `6.12.0` no
> `/api/health` de `https://app.seusaldo.ai`; (5) só então a **tag** (`npm run release:tag`).
> O merge **não** publica — confirmar pelo health, não pelo merge.

## Self-Review (cobertura da spec)

- Faixa de 4 StatCard (valor/ponderado/conversão/ciclo) → Tasks 1-2. **Ciclo médio é função nova** (não
  existia na `MetricasFunil`, ao contrário do que a spec sugeriu); coberto por teste na Task 1.
- Busca por nome/segmento → Task 4.
- Card rico (segmento, valor, badge de regime, avatar, dias na etapa) → Task 3, reusando
  `Iniciais`/`Badge`/`badgeRegime`/`diasNaEtapa`/`corDias`.
- Coluna colorida pela `funil_etapa.cor` + "+ Adicionar" por coluna + "+ Novo negócio" no topo → Tasks 2/5.
- Drag-and-drop inalterado (só apresentação muda) → preservado em todas as tasks.
- Fora de escopo (config em `/configuracoes/funil`) → **Fatia C**.
