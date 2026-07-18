# RF-003 — Fatia B (calculadora avulsa) — Plano

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.
> Spec: `docs/superpowers/specs/2026-07-18-rf003-precificacao-honorarios-design.md`. Depende da **Fatia A**
> (em produção, v6.14.0): as tabelas de config, o motor `calcularHonorario` e a tela de configuração.

**Objetivo:** a calculadora avulsa em `/comercial/precificacao` — informar regime, faturamento,
funcionários, notas, complexidade, serviços e desconto, e ver **mensal**, **único** e o **detalhamento** em
tempo real. Só simula; não salva (o snapshot e a integração na proposta são a Fatia C).

**Arquitetura:** a página (server, gate comercial) carrega a config via a action já existente
`carregarPrecificacao()` e a mapeia para o tipo do motor com uma função pura nova `paraConfigPreco`. O
client roda `calcularHonorario` a cada mudança. Sem migration, sem novas tabelas.

**Stack:** Next.js 16, React (client), Tailwind 4, vitest.

## Global Constraints

- **Sem migration, sem novas actions de escrita.** Reusa `carregarPrecificacao()`
  (`configuracoes/precificacao/actions.ts`) — a RLS já permite o comercial **ler** a config (0103).
- **Motor inalterado:** usa `calcularHonorario`/`ConfigPreco` de `@/lib/comercial/precificacao` como está.
  A ordem do cálculo é a da Fatia A (base → acréscimos → complexidade → serviços → desconto com teto → piso).
- **Gate:** `podeCriarCliente(papel)` (admin/assistente/contador), como as demais telas do comercial.
- **Regimes:** o select usa `REGIMES` de `@/lib/tipos`.
- **Não salva nada** — é consulta. O snapshot é da Fatia C.
- Reusar `Container`/`PageHeader`/`SubNav`/`controleCls`/`StatCard`. Não reinventar.
- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`,
  `npm run build`.
- **`main` protegido:** PR `develop → main`, `verify` verde. Release com bump + CHANGELOG no mesmo PR.
  Deploy manual (Implantar + `/api/health`); tag depois. **Esta fatia não tem migration** — deploy só de código.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/lib/comercial/precificacao.ts` | **Modificar** — + `paraConfigPreco` (map view → ConfigPreco) | 1 |
| `src/tests/comercial/precificacao.test.ts` | **Modificar** — testes de `paraConfigPreco` | 1 |
| `src/app/(app)/comercial/precificacao/page.tsx` | **Criar** — página server (gate comercial) | 2 |
| `src/app/(app)/comercial/precificacao/Calculadora.tsx` | **Criar** — client (formulário + resultado ao vivo) | 2 |
| `src/tests/comercial/calculadora-render.test.tsx` | **Criar** — render | 2 |
| `src/app/(app)/comercial/page.tsx` | **Modificar** — item "Precificação" no SubNav | 2 |
| `src/app/(app)/comercial/metricas/page.tsx` + propostas | **Modificar** — mesmo item no SubNav (consistência) | 2 |
| `CHANGELOG.md` + `package.json` | **Modificar** — release 6.15.0 | 3 |

---

### Task 1: `paraConfigPreco` (map da view para o motor)

**Files:**
- Modify: `src/lib/comercial/precificacao.ts`
- Test: `src/tests/comercial/precificacao.test.ts`

**Interfaces:**
- Consumes: `ConfigPreco`, `Fator` (já existem no arquivo).
- Produces:
  - `type EntradaConfig = { regimes: { regime: string; valorBase: number }[]; fatores: { fator: string; modo: string; valorUnitario: number; franquia: number; faixas: { ate: number | null; valor: number }[] }[]; complexidades: { id: string; multiplicador: number }[]; servicos: { id: string; valor: number; recorrencia: string }[]; global: { valorMinimo: number; descontoMaximoPct: number } }`
  - `paraConfigPreco(e: EntradaConfig): ConfigPreco`

> `EntradaConfig` é o subconjunto estrutural de `PrecificacaoView` (a action `carregarPrecificacao` devolve
> um objeto compatível — a `view` tem campos a mais, como `nome`/`ordem`, que o map ignora).

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `src/tests/comercial/precificacao.test.ts`:
```ts
import { paraConfigPreco } from "@/lib/comercial/precificacao";

describe("paraConfigPreco", () => {
  const entrada = {
    regimes: [{ regime: "Simples", valorBase: 500 }],
    fatores: [
      { fator: "faturamento", modo: "faixas", valorUnitario: 0, franquia: 0, faixas: [{ ate: null, valor: 100 }] },
      { fator: "funcionarios", modo: "unidade", valorUnitario: 25, franquia: 5, faixas: [] },
      { fator: "notas", modo: "faixas", valorUnitario: 0, franquia: 0, faixas: [] },
    ],
    complexidades: [{ id: "c1", multiplicador: 1.2 }],
    servicos: [{ id: "s1", valor: 200, recorrencia: "mensal" }],
    global: { valorMinimo: 400, descontoMaximoPct: 20 },
  };
  it("monta o ConfigPreco que o motor consome", () => {
    const cfg = paraConfigPreco(entrada);
    expect(cfg.baseRegime).toEqual({ Simples: 500 });
    expect(cfg.faturamento.modo).toBe("faixas");
    expect(cfg.funcionarios.modo).toBe("unidade");
    expect(cfg.funcionarios.valorUnitario).toBe(25);
    expect(cfg.servicos[0]).toEqual({ id: "s1", valor: 200, recorrencia: "mensal" });
    expect(cfg.valorMinimo).toBe(400);
    expect(cfg.descontoMaximoPct).toBe(20);
  });
  it("fator ausente vira um Fator neutro (faixas vazias)", () => {
    const cfg = paraConfigPreco({ ...entrada, fatores: [] });
    expect(cfg.faturamento).toEqual({ modo: "faixas", valorUnitario: 0, franquia: 0, faixas: [] });
  });
  it("recorrência/modo desconhecidos caem em padrão seguro", () => {
    const cfg = paraConfigPreco({
      ...entrada,
      fatores: [{ fator: "faturamento", modo: "xxx", valorUnitario: 0, franquia: 0, faixas: [] }],
      servicos: [{ id: "s1", valor: 10, recorrencia: "xxx" }],
    });
    expect(cfg.faturamento.modo).toBe("faixas");
    expect(cfg.servicos[0]!.recorrencia).toBe("unico"); // só 'mensal' é mensal; o resto vira 'unico'? ver impl
  });
});
```
> Na 3ª asserção, fixar a regra: **modo** desconhecido → `"faixas"`; **recorrência** ≠ `"mensal"` → `"unico"`.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/precificacao.test.ts`
Expected: FAIL — `paraConfigPreco` não existe.

- [ ] **Step 3: Implementar**

Acrescentar ao fim de `src/lib/comercial/precificacao.ts`:
```ts
export type EntradaConfig = {
  regimes: { regime: string; valorBase: number }[];
  fatores: { fator: string; modo: string; valorUnitario: number; franquia: number; faixas: { ate: number | null; valor: number }[] }[];
  complexidades: { id: string; multiplicador: number }[];
  servicos: { id: string; valor: number; recorrencia: string }[];
  global: { valorMinimo: number; descontoMaximoPct: number };
};

const FATOR_NEUTRO: Fator = { modo: "faixas", valorUnitario: 0, franquia: 0, faixas: [] };

function fatorDe(e: EntradaConfig, nome: string): Fator {
  const f = e.fatores.find((x) => x.fator === nome);
  if (!f) return { ...FATOR_NEUTRO };
  return {
    modo: f.modo === "unidade" ? "unidade" : "faixas",
    valorUnitario: f.valorUnitario,
    franquia: f.franquia,
    faixas: f.faixas.map((x) => ({ ate: x.ate, valor: x.valor })),
  };
}

export function paraConfigPreco(e: EntradaConfig): ConfigPreco {
  return {
    baseRegime: Object.fromEntries(e.regimes.map((r) => [r.regime, r.valorBase])),
    faturamento: fatorDe(e, "faturamento"),
    funcionarios: fatorDe(e, "funcionarios"),
    notas: fatorDe(e, "notas"),
    complexidades: e.complexidades.map((c) => ({ id: c.id, multiplicador: c.multiplicador })),
    servicos: e.servicos.map((s) => ({ id: s.id, valor: s.valor, recorrencia: s.recorrencia === "mensal" ? "mensal" : "unico" })),
    valorMinimo: e.global.valorMinimo,
    descontoMaximoPct: e.global.descontoMaximoPct,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/comercial/precificacao.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comercial/precificacao.ts src/tests/comercial/precificacao.test.ts
git commit -m "feat(comercial): paraConfigPreco — mapeia a config para o motor de precificacao"
```

---

### Task 2: Página + `Calculadora` + navegação

**Files:**
- Create: `src/app/(app)/comercial/precificacao/page.tsx`
- Create: `src/app/(app)/comercial/precificacao/Calculadora.tsx`
- Test: `src/tests/comercial/calculadora-render.test.tsx`
- Modify: `src/app/(app)/comercial/page.tsx`, `src/app/(app)/comercial/metricas/page.tsx`,
  `src/app/(app)/comercial/propostas/page.tsx` (o mesmo item no SubNav)

**Interfaces:**
- Consumes: `carregarPrecificacao` (`configuracoes/precificacao/actions`), `paraConfigPreco`,
  `calcularHonorario` (`@/lib/comercial/precificacao`), `REGIMES`, `StatCard`, `controleCls`.
- Produces: a tela `/comercial/precificacao`.

- [ ] **Step 1: Página server (gate comercial)**

```tsx
import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubNav } from "@/components/ui/SubNav";
import { Voltar } from "@/components/ui/Voltar";
import { Calculadora } from "./Calculadora";
import { carregarPrecificacao } from "../../configuracoes/precificacao/actions";
import { paraConfigPreco } from "@/lib/comercial/precificacao";

export const metadata = { title: "Precificação" };

export default async function PrecificacaoCalcPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const view = await carregarPrecificacao();
  const config = paraConfigPreco(view);
  return (
    <Container largura="padrao" className="space-y-5 p-4">
      <Voltar href="/comercial" label="Comercial" />
      <PageHeader titulo="Precificação" subtitulo="Simulador de honorários" />
      <Calculadora
        config={config}
        complexidades={view.complexidades.map((c) => ({ id: c.id, nome: c.nome }))}
        servicos={view.servicos
          .filter((s) => s.ativo)
          .map((s) => ({ id: s.id, nome: s.nome, valor: s.valor, recorrencia: s.recorrencia }))}
      />
    </Container>
  );
}
```

- [ ] **Step 2: Teste de render**

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Calculadora } from "@/app/(app)/comercial/precificacao/Calculadora";
import type { ConfigPreco } from "@/lib/comercial/precificacao";

const config: ConfigPreco = {
  baseRegime: { Simples: 500 },
  faturamento: { modo: "faixas", valorUnitario: 0, franquia: 0, faixas: [{ ate: null, valor: 100 }] },
  funcionarios: { modo: "unidade", valorUnitario: 25, franquia: 5, faixas: [] },
  notas: { modo: "faixas", valorUnitario: 0, franquia: 0, faixas: [] },
  complexidades: [{ id: "c1", multiplicador: 1.2 }],
  servicos: [{ id: "s1", valor: 200, recorrencia: "mensal" }],
  valorMinimo: 400,
  descontoMaximoPct: 20,
};

describe("Calculadora", () => {
  it("renderiza o formulário e o resultado", () => {
    const html = renderToStaticMarkup(
      <Calculadora
        config={config}
        complexidades={[{ id: "c1", nome: "Média" }]}
        servicos={[{ id: "s1", nome: "Folha", valor: 200, recorrencia: "mensal" }]}
      />,
    );
    expect(html).toContain("Mensal"); // rótulo do resultado
    expect(html).toContain("Faturamento"); // campo
    expect(html).toContain("Folha"); // serviço marcável
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/calculadora-render.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 4: `Calculadora` (client)**

Requisitos (client, `"use client"`):
- Props: `config: ConfigPreco`, `complexidades: { id: string; nome: string }[]`,
  `servicos: { id: string; nome: string; valor: number; recorrencia: string }[]`.
- Estado dos parâmetros: `regime` (default o 1º de `REGIMES`), `faturamento`/`funcionarios`/`notas` (number,
  default 0), `complexidadeId` (string | null, default null), `servicoIds` (Set/array, default vazio),
  `descontoPct` (number, default 0).
- A cada render, `const r = calcularHonorario({ regime, faturamento, funcionarios, notas, complexidadeId, servicoIds, descontoPct }, config)`.
- **Layout em duas colunas** (form à esquerda, resultado à direita; empilha no mobile):
  - Form: `regime` (`<select>` de `REGIMES`), `faturamento`/`funcionarios`/`notas` (`<input type=number>`),
    `complexidade` (`<select>` de `complexidades`, opção "—" = null), `serviços` (checkboxes de `servicos`,
    mostrando `nome` + `brl(valor)` + a recorrência), `desconto` (`<input type=number>` %; nota do teto:
    "máx {config.descontoMaximoPct}%").
  - Resultado: dois `StatCard` **"Mensal"** (`brl(r.mensal)`) e **"Único"** (`brl(r.unico)`), e o
    **detalhamento** — a lista `r.detalhamento` (`rotulo` + `brl(valor)`), cada linha; valores negativos
    (desconto) em vermelho.
- `brl` helper local (como no `QuadroComercial`). Inputs usam `controleCls("compacto")` (sem `border`
  próprio — regra `divida-ui`).

- [ ] **Step 5: Item no SubNav do comercial**

Nos três `page.tsx` do comercial que montam a `SubNav` (`comercial/page.tsx`, `comercial/metricas/page.tsx`,
`comercial/propostas/page.tsx`), acrescentar o item, mantendo a lista idêntica entre eles:
```tsx
{ href: "/comercial/precificacao", label: "Precificação" },
```
(conferir a lista atual de cada um; hoje é Propostas + Métricas do funil).

- [ ] **Step 6: Rodar e verificar**

Run: `npx vitest run src/tests/comercial/calculadora-render.test.tsx && npm run typecheck && npm run lint`
Expected: PASS + limpo.

- [ ] **Step 7: Conferência na tela** — `npm run dev`: primeiro **preencher a config** em
  `/configuracoes/precificacao` (bases, faixas, um serviço); depois abrir `/comercial/precificacao` e ver o
  mensal/único/detalhamento reagindo aos campos. **Mostrar ao Pedro.**

- [ ] **Step 8: `format` e commit**

```bash
npm run format
git add -A
git commit -m "feat(comercial): calculadora de precificacao avulsa (/comercial/precificacao)"
```

---

### Task 3: Release 6.15.0

**Files:**
- Modify: `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Verificação completa**

```bash
npm run lint && npm run typecheck && npm test && npm run format && npm run build
npx prettier --check .
```

- [ ] **Step 2: Bump + CHANGELOG**

- `package.json`: `6.14.0` → `6.15.0`.
- `CHANGELOG.md`: seção `## [6.15.0] — <data>` com `### Adicionado` descrevendo a calculadora avulsa
  (simulador de honorários em `/comercial/precificacao`), citando que consome a config da RF-003 Fatia A.
- Conferir `npx vitest run src/tests/versao.test.ts`.

- [ ] **Step 3: PR**

```bash
git push origin develop
gh pr create --base main --head develop --title "RF-003 fatia B: calculadora de precificação avulsa (v6.15.0)"
gh pr checks --watch
```

> **Nota:** este PR também leva à `main` os dois docs da RF-003 (spec + plano da Fatia A) que hoje estão só
> na `develop` — é esperado.

- [ ] **Step 4: Release (com o Pedro)**

> **Sem migration.** Sequência: merge → **Implantar** → confirmar `6.15.0` no `/api/health` → **tag**. O
> merge não publica.

## Self-Review (cobertura da spec)

- Formulário comum (regime, faturamento/funcionários/notas, complexidade, serviços, desconto) → Task 2.
- Resultado em tempo real (mensal/único/detalhamento) via `calcularHonorario` no cliente → Task 2.
- Config vem do servidor e é mapeada para o motor → Task 1 (`paraConfigPreco`, testado).
- Avulsa, não salva → a página não tem nenhuma action de escrita.
- Snapshot + integração na proposta → **Fatia C**, fora daqui.
