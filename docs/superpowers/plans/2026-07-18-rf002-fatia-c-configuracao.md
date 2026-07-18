# RF-002 — Fatia C (configuração das etapas) — Plano

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.
> Spec: `docs/superpowers/specs/2026-07-18-rf002-pipeline-configuravel-design.md`. Fecha a RF-002.
> Depende das Fatias A e B (já em produção, v6.12.0): `funil_etapa`, o quadro lê as etapas ativas.

**Objetivo:** a tela **Configurações → Funil** (`/configuracoes/funil`), onde o escritório gerencia as
etapas ativas do funil — adicionar, renomear, recolorir, ajustar probabilidade, reordenar e **arquivar**.
`ganho`/`perdido` aparecem como estados de sistema, não editáveis.

**Arquitetura:** página server-gated (admin) + client component `EtapasFunil` que chama server actions em
`configuracoes/funil/actions.ts`. Helpers puros de validação/ordem em `lib/comercial/funilConfig.ts`
(testáveis). **Sem migration** — a `funil_etapa` já existe; arquivar usa a coluna `arquivada`. A guarda de
arquivamento impede esconder uma etapa que ainda tem negócio ativo (senão o card sumiria do quadro).

**Stack:** Next.js 16 (Server Actions), React (client), Tailwind 4, vitest.

## Global Constraints

- **Nenhuma migration.** A `funil_etapa` (Fatia A) já tem `rotulo`, `ordem`, `cor`, `probabilidade`,
  `arquivada`. O quadro (Fatia B) já lê `arquivada = false` ordenado por `ordem`.
- **`ganho`/`perdido` NÃO são configuráveis** — mostrados como estados de sistema, sem editar/arquivar.
- **Arquivar, nunca apagar.** E **não arquivar etapa com negócio ativo** (oportunidade com `etapa_id = id`
  e `desfecho is null`) — mensagem clara pedindo para mover os negócios antes.
- **Gate: admin.** A tela é config de escritório, como Custos/SLA. Cada action revalida o papel admin.
- **Cor** é hex `#RRGGBB`; **probabilidade** é 0–1 no banco, exibida/editada como % inteiro (0–100).
- **Reordenação por ↑/↓** (robusta e acessível), não drag — decisão de confiabilidade; se o Pedro quiser
  arrastar, é incremento posterior.
- Reusar `Container`/`PageHeader`/`Voltar`/`Botao`/`Badge` e `controleCls`. Não reinventar.
- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`,
  `npm run build`.
- **`main` protegido:** entrega por PR `develop → main`, `verify` verde. Release com bump + CHANGELOG no
  mesmo PR. Deploy manual (Implantar + `/api/health`), tag depois. **Esta fatia não tem migration**, então
  o deploy é só código.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/lib/comercial/funilConfig.ts` | **Criar** — `corValida`, `rotuloValido`, `proximaOrdem`, `pctParaProb`/`probParaPct`, `moverNaOrdem` | 1 |
| `src/tests/comercial/funilConfig.test.ts` | **Criar** — testes dos helpers | 1 |
| `src/app/(app)/configuracoes/funil/actions.ts` | **Criar** — CRUD/reordenar/arquivar (admin) | 2 |
| `src/app/(app)/configuracoes/funil/page.tsx` | **Criar** — página server | 3 |
| `src/app/(app)/configuracoes/funil/EtapasFunil.tsx` | **Criar** — client (lista editável) | 3 |
| `src/tests/comercial/etapas-funil-render.test.tsx` | **Criar** — render | 3 |
| `src/app/(app)/configuracoes/page.tsx` | **Modificar** — item "Funil comercial" no hub | 4 |
| `CHANGELOG.md` + `package.json` | **Modificar** — release 6.13.0 | 4 |

---

### Task 1: Helpers puros de configuração

**Files:**
- Create: `src/lib/comercial/funilConfig.ts`
- Test: `src/tests/comercial/funilConfig.test.ts`

**Interfaces:**
- Produces:
  - `corValida(cor: string): boolean` — hex `#RRGGBB` (case-insensitiva).
  - `rotuloValido(rotulo: string): boolean` — trim não vazio, ≤ 40 chars.
  - `proximaOrdem(etapas: { ordem: number }[]): number` — `max(ordem)+1`, ou 1 se vazio.
  - `pctParaProb(pct: number): number` — 0–100 → 0–1 (3 casas).
  - `probParaPct(prob: number): number` — 0–1 → 0–100 inteiro.
  - `moverNaOrdem(ids: string[], id: string, dir: "cima" | "baixo"): string[]` — troca o item com o vizinho.

- [ ] **Step 1: Testes que falham**

```ts
import { describe, it, expect } from "vitest";
import {
  corValida,
  rotuloValido,
  proximaOrdem,
  pctParaProb,
  probParaPct,
  moverNaOrdem,
} from "@/lib/comercial/funilConfig";

describe("corValida", () => {
  it("aceita hex #RRGGBB, rejeita o resto", () => {
    expect(corValida("#8C938E")).toBe(true);
    expect(corValida("#abc123")).toBe(true);
    expect(corValida("8C938E")).toBe(false);
    expect(corValida("#FFF")).toBe(false);
    expect(corValida("vermelho")).toBe(false);
  });
});

describe("rotuloValido", () => {
  it("não vazio e ≤ 40", () => {
    expect(rotuloValido("Novo")).toBe(true);
    expect(rotuloValido("   ")).toBe(false);
    expect(rotuloValido("x".repeat(41))).toBe(false);
  });
});

describe("proximaOrdem", () => {
  it("max+1, ou 1 se vazio", () => {
    expect(proximaOrdem([{ ordem: 1 }, { ordem: 4 }])).toBe(5);
    expect(proximaOrdem([])).toBe(1);
  });
});

describe("pct/prob", () => {
  it("converte nos dois sentidos", () => {
    expect(pctParaProb(60)).toBeCloseTo(0.6);
    expect(probParaPct(0.2)).toBe(20);
    expect(probParaPct(0.155)).toBe(16); // arredonda
  });
});

describe("moverNaOrdem", () => {
  it("troca com o vizinho; bordas não mudam", () => {
    expect(moverNaOrdem(["a", "b", "c"], "b", "cima")).toEqual(["b", "a", "c"]);
    expect(moverNaOrdem(["a", "b", "c"], "b", "baixo")).toEqual(["a", "c", "b"]);
    expect(moverNaOrdem(["a", "b", "c"], "a", "cima")).toEqual(["a", "b", "c"]);
    expect(moverNaOrdem(["a", "b", "c"], "c", "baixo")).toEqual(["a", "b", "c"]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/funilConfig.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
export function corValida(cor: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(cor);
}

export function rotuloValido(rotulo: string): boolean {
  const t = rotulo.trim();
  return t.length > 0 && t.length <= 40;
}

export function proximaOrdem(etapas: { ordem: number }[]): number {
  return etapas.length === 0 ? 1 : Math.max(...etapas.map((e) => e.ordem)) + 1;
}

export function pctParaProb(pct: number): number {
  return Math.round((pct / 100) * 1000) / 1000;
}

export function probParaPct(prob: number): number {
  return Math.round(prob * 100);
}

// Troca o item com o vizinho na direção dada. Retorna nova lista (bordas inalteradas).
export function moverNaOrdem(ids: string[], id: string, dir: "cima" | "baixo"): string[] {
  const i = ids.indexOf(id);
  if (i < 0) return ids;
  const j = dir === "cima" ? i - 1 : i + 1;
  if (j < 0 || j >= ids.length) return ids;
  const copia = [...ids];
  [copia[i], copia[j]] = [copia[j]!, copia[i]!];
  return copia;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/comercial/funilConfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comercial/funilConfig.ts src/tests/comercial/funilConfig.test.ts
git commit -m "feat(comercial): helpers puros de configuracao do funil (cor/rotulo/ordem/prob)"
```

---

### Task 2: Server actions da configuração

**Files:**
- Create: `src/app/(app)/configuracoes/funil/actions.ts`

**Interfaces:**
- Consumes: `Etapa` (`@/lib/comercial/funil`), helpers da Task 1.
- Produces (todas com gate admin, `revalidatePath("/configuracoes/funil")` e `revalidatePath("/comercial")`):
  - `listarEtapasConfig(): Promise<Etapa[]>` — não arquivadas, por `ordem`.
  - `criarEtapa(rotulo: string): Promise<Resp>` — anexa no fim (cor/prob padrão).
  - `renomearEtapa(id: string, rotulo: string): Promise<Resp>`
  - `recolorirEtapa(id: string, cor: string): Promise<Resp>`
  - `definirProbabilidade(id: string, pct: number): Promise<Resp>`
  - `reordenarEtapas(ids: string[]): Promise<Resp>` — grava `ordem = índice+1`.
  - `arquivarEtapa(id: string): Promise<Resp>` — **recusa se houver negócio ativo** na etapa.
  - `type Resp = { ok?: boolean; erro?: string }`

- [ ] **Step 1: Escrever o arquivo**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { type Etapa } from "@/lib/comercial/funil";
import { corValida, rotuloValido, proximaOrdem, pctParaProb } from "@/lib/comercial/funilConfig";

type Resp = { ok?: boolean; erro?: string };
const COR_PADRAO = "#5A6163";

async function admin() {
  const p = await getPerfilAtual();
  return p?.ativo && p.papel === "admin" ? p : null;
}
function revalidar() {
  revalidatePath("/configuracoes/funil");
  revalidatePath("/comercial");
}

export async function listarEtapasConfig(): Promise<Etapa[]> {
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

export async function criarEtapa(rotulo: string): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!rotuloValido(rotulo)) return { erro: "Informe um rótulo (até 40 caracteres)." };
  const etapas = await listarEtapasConfig();
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("funil_etapa").insert({
    rotulo: rotulo.trim(),
    ordem: proximaOrdem(etapas),
    cor: COR_PADRAO,
    probabilidade: 0.5,
  });
  if (error) return { erro: "Falha ao criar a etapa." };
  revalidar();
  return { ok: true };
}

export async function renomearEtapa(id: string, rotulo: string): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!rotuloValido(rotulo)) return { erro: "Informe um rótulo (até 40 caracteres)." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("funil_etapa").update({ rotulo: rotulo.trim() }).eq("id", id);
  if (error) return { erro: "Falha ao renomear." };
  revalidar();
  return { ok: true };
}

export async function recolorirEtapa(id: string, cor: string): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!corValida(cor)) return { erro: "Cor inválida (use #RRGGBB)." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("funil_etapa").update({ cor }).eq("id", id);
  if (error) return { erro: "Falha ao salvar a cor." };
  revalidar();
  return { ok: true };
}

export async function definirProbabilidade(id: string, pct: number): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { erro: "Probabilidade de 0 a 100%." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("funil_etapa").update({ probabilidade: pctParaProb(pct) }).eq("id", id);
  if (error) return { erro: "Falha ao salvar a probabilidade." };
  revalidar();
  return { ok: true };
}

export async function reordenarEtapas(ids: string[]): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const supabase = await createServerSupabase();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase.from("funil_etapa").update({ ordem: i + 1 }).eq("id", ids[i]!);
    if (error) return { erro: "Falha ao reordenar." };
  }
  revalidar();
  return { ok: true };
}

export async function arquivarEtapa(id: string): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("oportunidade")
    .select("id", { count: "exact", head: true })
    .eq("etapa_id", id)
    .is("desfecho", null);
  if ((count ?? 0) > 0) {
    return { erro: `Mova os ${count} negócio(s) desta etapa antes de arquivá-la.` };
  }
  const { error } = await supabase.from("funil_etapa").update({ arquivada: true }).eq("id", id);
  if (error) return { erro: "Falha ao arquivar." };
  revalidar();
  return { ok: true };
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck`
Expected: aponta só a página/o client da Task 3 (ainda não existem). O arquivo de actions compila.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/configuracoes/funil/actions.ts"
git commit -m "feat(comercial): server actions da configuracao do funil (CRUD/reordenar/arquivar)"
```

---

### Task 3: Página + client `EtapasFunil`

**Files:**
- Create: `src/app/(app)/configuracoes/funil/page.tsx`
- Create: `src/app/(app)/configuracoes/funil/EtapasFunil.tsx`
- Test: `src/tests/comercial/etapas-funil-render.test.tsx`

**Interfaces:**
- Consumes: `listarEtapasConfig` + as actions (Task 2), `Etapa`, `moverNaOrdem`/`probParaPct` (Task 1),
  `TERMINAIS` (`@/lib/comercial/funil`).
- Produces: a tela em `/configuracoes/funil`.

- [ ] **Step 1: Página server (gate admin)**

```tsx
import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { EtapasFunil } from "./EtapasFunil";
import { listarEtapasConfig } from "./actions";

export const metadata = { title: "Funil comercial" };

export default async function FunilConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const etapas = await listarEtapasConfig();
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="Funil comercial" subtitulo="Etapas do pipeline — rótulo, cor, probabilidade e ordem" />
      <EtapasFunil etapas={etapas} />
    </Container>
  );
}
```

- [ ] **Step 2: Teste de render**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/funil/actions", () => ({
  criarEtapa: vi.fn(),
  renomearEtapa: vi.fn(),
  recolorirEtapa: vi.fn(),
  definirProbabilidade: vi.fn(),
  reordenarEtapas: vi.fn(),
  arquivarEtapa: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { EtapasFunil } from "@/app/(app)/configuracoes/funil/EtapasFunil";
import type { Etapa } from "@/lib/comercial/funil";

const ETAPAS: Etapa[] = [
  { id: "e1", rotulo: "Novo", ordem: 1, cor: "#8C938E", probabilidade: 0.2 },
  { id: "e2", rotulo: "Negociação", ordem: 2, cor: "#B5820E", probabilidade: 0.8 },
];

describe("EtapasFunil", () => {
  it("lista etapas ativas e os estados de sistema", () => {
    const html = renderToStaticMarkup(<EtapasFunil etapas={ETAPAS} />);
    expect(html).toContain("Novo");
    expect(html).toContain("Negociação");
    expect(html).toContain("Ganho"); // estado de sistema
    expect(html).toContain("Perdido"); // estado de sistema
    expect(html).toContain("Adicionar etapa");
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/etapas-funil-render.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 4: Client `EtapasFunil`**

Requisitos do componente (client, `"use client"`):
- Estado `ocupado` e helper `chamar(fn)` que roda a action, mostra `alert(erro)` e dá `router.refresh()`
  (mesmo padrão do `QuadroComercial`).
- Lista as `etapas` (props) em linhas. Cada linha:
  - **↑/↓** — chamam `reordenarEtapas(moverNaOrdem(etapas.map(e=>e.id), e.id, "cima"|"baixo"))`; ↑ desabilitado
    no primeiro, ↓ no último.
  - **cor** — `<input type="color" value={e.cor} onChange=…>` que chama `recolorirEtapa(e.id, valor)`.
  - **rótulo** — `<input>` controlado por estado local, salvando no `onBlur`/Enter via `renomearEtapa`.
  - **probabilidade** — `<input type="number" min=0 max=100>` com `probParaPct(e.probabilidade)`, salvando
    via `definirProbabilidade`.
  - **Arquivar** — botão que chama `arquivarEtapa(e.id)` (o erro da guarda aparece via `alert`).
- **Adicionar etapa** — input + botão "Adicionar etapa" → `criarEtapa(rotulo)`, limpando o campo.
- **Estados de sistema** — abaixo, um bloco com duas linhas fixas **Ganho** e **Perdido**
  (de `TERMINAIS`/rótulos), com um texto "Estados de sistema — sempre existem e não são editáveis." Sem
  controles.

Usar `controleCls("compacto")` nos inputs, `Botao` para o adicionar, e o mesmo vocabulário visual das
outras telas de config (linhas em `rounded-2xl border border-linha bg-white`).

- [ ] **Step 5: Rodar e verificar**

Run: `npx vitest run src/tests/comercial/etapas-funil-render.test.tsx && npm run typecheck`
Expected: PASS + typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/configuracoes/funil/page.tsx" "src/app/(app)/configuracoes/funil/EtapasFunil.tsx" src/tests/comercial/etapas-funil-render.test.tsx
git commit -m "feat(comercial): tela de configuracao do funil (/configuracoes/funil)"
```

---

### Task 4: Entrada no hub + release 6.13.0

**Files:**
- Modify: `src/app/(app)/configuracoes/page.tsx`
- Modify: `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Item no hub de Configurações**

Em `ITENS` de `configuracoes/page.tsx`, adicionar (sem `papeis` → admin-only, coerente com o gate da página):
```ts
{
  href: "/configuracoes/funil",
  label: "Funil comercial",
  desc: "Etapas do pipeline — rótulo, cor, probabilidade e ordem.",
},
```

- [ ] **Step 2: Conferência na tela** — `npm run dev`, `/configuracoes/funil`: adicionar/renomear/recolorir/
  probabilidade/↑↓/arquivar; conferir que a mudança reflete em `/comercial` (colunas). Testar a **guarda**:
  criar um negócio numa etapa e tentar arquivá-la → mensagem pedindo para mover. **Mostrar ao Pedro.**

- [ ] **Step 3: Verificação completa**

```bash
npm run lint && npm run typecheck && npm test && npm run format && npm run build
npx prettier --check .
```

- [ ] **Step 4: Bump + CHANGELOG (mesmo PR)**

- `package.json`: `6.12.0` → `6.13.0`.
- `CHANGELOG.md`: seção `## [6.13.0] — <data>` com `### Adicionado` descrevendo a tela de configuração do
  funil, e registrando que **fecha a RF-002**.
- Conferir `npx vitest run src/tests/comercial/... ` e `src/tests/versao.test.ts`.

- [ ] **Step 5: PR**

```bash
git push origin develop
gh pr create --base main --head develop --title "RF-002 fatia C: configuracao do funil (v6.13.0)"
gh pr checks --watch
```

- [ ] **Step 6: Release (com o Pedro)**

> **Sem migration nesta fatia** — é só código. Sequência: merge → **Implantar** no EasyPanel → confirmar
> `6.13.0` no `/api/health` → **tag** (`npm run release:tag` + `git push origin vX`). O merge não publica.

## Self-Review (cobertura da spec)

- Lista de etapas ativas, reordenáveis, com rótulo/cor/probabilidade → Tasks 2-3 (reordenar por ↑/↓ em vez
  de arrastar — decisão de confiabilidade registrada nas Global Constraints).
- Adicionar/renomear/recolorir/arquivar → Task 2 (actions) + Task 3 (UI).
- `ganho`/`perdido` como estados de sistema não editáveis → Task 3, bloco fixo.
- Não arquivar etapa com negócio ativo → `arquivarEtapa` conta oportunidades ativas e recusa (Task 2).
- Quadro lê a config → já feito na Fatia B; `revalidatePath("/comercial")` garante o refresh.
- Sem multi-tenant (fora de escopo) e sem apagar (só arquivar) → respeitados.
