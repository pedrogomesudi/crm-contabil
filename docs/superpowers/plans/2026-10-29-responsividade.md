# Responsividade do SALDO — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nenhuma tela do SALDO quebra em tela estreita, e as tabelas dos quatro fluxos de uso em celular viram cartões legíveis abaixo de 768px.

**Architecture:** A fundação responsiva já existe (layout, Sidebar com gaveta, `PageHeader`, `Container`, `FormGrid`) — o trabalho é concluir a adoção. Duas frentes: uma varredura guiada por **testes que leem o código-fonte** (um teste que falha enquanto existir tabela sem rolagem ou grade sem breakpoint, e que depois impede regressão), e um CSS de cartão escrito **uma vez** em `globals.css`, aplicado tabela a tabela por um atributo `data-rotulo` em cada célula.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind 4, TypeScript, Vitest + `react-dom/server`.

**Spec:** `docs/superpowers/specs/2026-10-29-responsividade-design.md`

## Global Constraints

- **Breakpoint único: 768px (`md`)** — mesmo ponto de virada da `Sidebar`. Não introduzir `sm:` ou `lg:` como limiar de troca tabela↔cartão.
- **Tailwind 4 não aceita classe interpolada.** O scanner estático só reconhece strings literais completas no código-fonte. Classe montada por template string passa nos testes (a string chega ao HTML) e **não é gerada no build CSS** — quebra em produção, em silêncio. O CSS do cartão vai em `src/app/globals.css`, não em utilitários interpolados. Precedente documentado em `src/components/ui/FormGrid.tsx`.
- **Comandos antes de cada commit:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`. São os mesmos que o CI (job `verify`) roda.
- **Git:** `main` é protegido. Trabalhar em `develop`; entrega por PR com o `verify` verde.
- **Versão:** `package.json.version` sobe junto com a entrada do CHANGELOG, no mesmo PR — `src/tests/versao.test.ts` exige que batam.
- **Imagens:** `next/image`, nunca `<img>`. **Imports:** alias `@/*`.

## Review Focus

Cinco classes de entrada que o spec implica e que nenhuma tarefa exercitaria por conta própria. Cada uma recebeu o teste indicado, na tarefa dona do código.

1. **Tabela dentro de `Painel`** — `Painel` tem `overflow-hidden`, que **corta** em vez de rolar. → **Não há teste**: recorte de CSS não é observável em jsdom. Tratado por instrução explícita na Task 2, Step 3 (o `div` de rolagem vai dentro do `Painel`, envolvendo só a `<table>`), e pela conferência visual da Task 9, Step 5. Registrado aqui para o revisor saber que é risco coberto por disciplina, não por teste.
2. **Célula sem `data-rotulo`** no modo cartão — aparece como valor solto, sem dizer de que coluna é. → teste na Task 4.
3. **`colSpan` no estado vazio** — a linha "Nenhum resultado" ocupa N colunas; no modo cartão ela não pode virar N linhas rótulo/valor vazias. → teste na Task 4.
4. **Comentário contendo `grid-cols-2`** — o scanner da varredura não pode acusar texto de comentário como defeito (o `FormGrid` tem exatamente isso). → teste na Task 3.
5. **Tabela nova criada depois** sem rolagem nem cartão — a varredura precisa impedir regressão, não só corrigir o passado. → é o que os testes das Tasks 2 e 3 garantem, por serem varreduras do código-fonte e não checagens pontuais.

---

### Task 1: Prepara o terreno — helper de leitura do código-fonte nos testes

**Files:**
- Create: `src/tests/ui/_fonte.ts`
- Test: (sem teste próprio; é infraestrutura consumida pelas Tasks 2 e 3, que a exercitam)

**Interfaces:**
- Produces: `arquivosTsx(): string[]` — caminhos de todos os `.tsx` de `src/`, excluindo `src/tests/`. `lerSemComentarios(caminho: string): string` — conteúdo do arquivo com comentários `//` e `/* */` removidos.

- [ ] **Step 1: Criar o helper**

```ts
// src/tests/ui/_fonte.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Varreduras de responsividade leem o CÓDIGO-FONTE, não o HTML renderizado: o objetivo é
// impedir que uma tabela nova nasça sem rolagem, e isso nenhum teste de render alcança.
export function arquivosTsx(raiz = "src"): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(raiz)) {
    const caminho = join(raiz, nome);
    if (statSync(caminho).isDirectory()) {
      if (caminho === join("src", "tests")) continue;
      out.push(...arquivosTsx(caminho));
    } else if (nome.endsWith(".tsx")) {
      out.push(caminho);
    }
  }
  return out;
}

// Comentários mencionam classes de propósito (o FormGrid explica por que o grid-cols-2 antigo
// era errado). Acusá-los como defeito seria falso positivo que ninguém consegue silenciar.
export function lerSemComentarios(caminho: string): string {
  return readFileSync(caminho, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}
```

- [ ] **Step 2: Conferir que compila e não quebra nada**

Run: `npm run typecheck && npm test`
Expected: PASS (nenhum teste novo ainda; o helper só precisa compilar)

- [ ] **Step 3: Commit**

```bash
git add src/tests/ui/_fonte.ts
git commit -m "test(ui): helper de varredura do código-fonte para os testes de responsividade"
```

---

### Task 2: Toda tabela rola na horizontal

**Files:**
- Create: `src/tests/ui/responsividade-tabelas.test.ts`
- Modify: `src/app/(app)/clientes/page.tsx`, `src/app/(app)/comercial/propostas/[id]/documento/DocumentoProposta.tsx`, `src/app/(app)/financeiro/regua-cobranca/Regua.tsx`, `src/app/(app)/usuarios/page.tsx`, `src/app/docs/page.tsx`, `src/components/documentos/DocumentosTabela.tsx`, `src/components/documentos/TabelaResultadosBusca.tsx`, `src/components/documentos/TabelaRetencao.tsx`, `src/components/financeiro/CadastroCrud.tsx`, `src/components/financeiro/DashboardFinanceiro.tsx`, `src/components/financeiro/GruposCobranca.tsx`

**Interfaces:**
- Consumes: `arquivosTsx`, `lerSemComentarios` da Task 1.
- Produces: nada consumido por tarefas seguintes.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/tests/ui/responsividade-tabelas.test.ts
import { describe, it, expect } from "vitest";
import { arquivosTsx, lerSemComentarios } from "./_fonte";

// Uma <table> sem rolagem horizontal estoura a tela no celular. Esta varredura corrige o
// passado E impede o futuro: tabela nova sem wrapper falha aqui, não em produção.
describe("toda tabela rola na horizontal", () => {
  it("nenhum arquivo tem <table> sem wrapper de rolagem", () => {
    const semRolagem = arquivosTsx()
      .filter((f) => {
        const src = lerSemComentarios(f);
        if (!src.includes("<table")) return false;
        return !/overflow-x-auto|overflow-auto/.test(src);
      })
      .map((f) => f.replace("src/", ""));
    expect(semRolagem, `tabelas sem rolagem horizontal:\n  ${semRolagem.join("\n  ")}`).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/tests/ui/responsividade-tabelas.test.ts`
Expected: FAIL listando os 11 arquivos.

- [ ] **Step 3: Envolver cada tabela — exemplo da lista de clientes**

Em `src/app/(app)/clientes/page.tsx`, a tabela está dentro de `<Painel>`, que tem `overflow-hidden` — isso **corta** o excedente em vez de rolar. O `div` de rolagem vai **dentro** do Painel, envolvendo só a tabela, e o rodapé de paginação fica **fora** dele (a paginação não deve rolar junto):

```tsx
<Painel>
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      {/* …conteúdo inalterado… */}
    </table>
  </div>
  <Paginacao pagina={pagina} total={total} porPagina={POR_PAGINA} base="/clientes" params={{ q, status }} />
</Painel>
```

Aplicar o mesmo padrão (`<div className="overflow-x-auto">` envolvendo apenas o `<table>`) nos outros 10 arquivos listados em **Files**. Onde não houver `Painel`, usar o padrão já existente no projeto:

```tsx
<div className="overflow-x-auto rounded-2xl border border-linha bg-white">
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/tests/ui/responsividade-tabelas.test.ts`
Expected: PASS

- [ ] **Step 5: Confirmar que nada mais quebrou**

Run: `npm run lint && npm run typecheck && npm test && npm run format`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(ui): toda tabela rola na horizontal, com varredura que impede regressão"
```

---

### Task 3: Nenhuma grade espreme no celular

**Files:**
- Create: `src/tests/ui/responsividade-grades.test.ts`
- Modify: `src/app/(app)/comercial/MetricasFunil.tsx`, `src/app/(app)/comercial/precificacao/Calculadora.tsx`, `src/app/(app)/obrigacoes/riscos/PainelRiscosView.tsx`, `src/app/(app)/clientes/nova-empresa/FormConstituicao.tsx`, `src/app/(app)/tarefas/Calendario.tsx`, `src/app/(app)/tarefas/[id]/EditorTarefa.tsx`, `src/app/(app)/configuracoes/legalizacao/[id]/EditorModelo.tsx`, `src/app/(app)/configuracoes/nfse/Formularios.tsx`, `src/app/(app)/configuracoes/marca/FormMarca.tsx`, `src/components/FormCliente.tsx`, `src/components/nfse/EmitenteConfig.tsx`, `src/components/nfse/FormDadosPagamento.tsx`, `src/components/vencimentos/FormProcuracao.tsx`, `src/components/nfse/EmitirNfseCliente.tsx`, `src/components/financeiro/ContratosSection.tsx`, `src/components/financeiro/ContasPagar.tsx`

**Interfaces:**
- Consumes: `arquivosTsx`, `lerSemComentarios` da Task 1.
- Produces: nada consumido por tarefas seguintes.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/tests/ui/responsividade-grades.test.ts
import { describe, it, expect } from "vitest";
import { arquivosTsx, lerSemComentarios } from "./_fonte";

// `grid-cols-3` sem breakpoint mantém 3 colunas num celular de 390px — cada uma com ~120px.
// Um campo de CNPJ nessa largura é inutilizável.
describe("nenhuma grade espreme no celular", () => {
  it("toda grade de 2+ colunas declara o breakpoint", () => {
    const faltando: string[] = [];
    for (const f of arquivosTsx()) {
      const linhas = lerSemComentarios(f).split("\n");
      linhas.forEach((linha, i) => {
        if (!/(?<![a-z:])grid-cols-[2-9]/.test(linha)) return;
        if (/(sm|md|lg):grid-cols/.test(linha)) return;
        faltando.push(`${f.replace("src/", "")}:${i + 1}`);
      });
    }
    expect(faltando, `grades sem breakpoint:\n  ${faltando.join("\n  ")}`).toEqual([]);
  });

  it("menção a grid-cols em comentário não é acusada (o FormGrid tem uma)", () => {
    const src = lerSemComentarios("src/components/ui/FormGrid.tsx");
    expect(src).not.toContain("grid-cols-2");
    expect(src).toContain("md:grid-cols-12");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/tests/ui/responsividade-grades.test.ts`
Expected: FAIL no primeiro caso, listando ~20 linhas. O segundo caso já passa.

- [ ] **Step 3: Corrigir as grades — formulários migram para o FormGrid**

Nos arquivos que são formulário (`FormConstituicao`, `FormCliente`, `EmitenteConfig`, `FormDadosPagamento`, `FormProcuracao`, `FormMarca`, `Formularios`, `EditorModelo`, `EmitirNfseCliente`), trocar a grade manual pelo primitivo que já existe, com `span` pela **natureza do dado**:

```tsx
import { FormGrid, FormCampo } from "@/components/ui/FormGrid";

<FormGrid>
  <FormCampo label="Razão social" span={8}>
    <input name="razao_social" className={controleCls()} />
  </FormCampo>
  <FormCampo label="CNPJ" span={4}>
    <input name="cpf_cnpj" className={controleCls()} />
  </FormCampo>
  <FormCampo label="UF" span={1}>
    <input name="uf" maxLength={2} className={controleCls()} />
  </FormCampo>
</FormGrid>
```

- [ ] **Step 4: Corrigir as grades — layout ganha breakpoint**

Nos que são grade de layout e não formulário (`MetricasFunil`, `Calculadora`, `PainelRiscosView`, `Calendario`, `EditorTarefa`, `ContratosSection`, `ContasPagar`), acrescentar o prefixo, empilhando no celular:

```tsx
// antes
<div className="grid grid-cols-4 gap-3">
// depois
<div className="grid grid-cols-1 gap-3 md:grid-cols-4">
```

**Exceção — `Calendario.tsx`:** um calendário mensal de 7 colunas não vira 1 coluna sem deixar de ser calendário. Manter `grid-cols-7` e envolver num `div` com `overflow-x-auto` e `min-w-[560px]` na grade, para rolar de lado preservando a forma. Adicionar o arquivo à lista de exceções do teste do Step 1, com o motivo:

```ts
// Calendário mensal: 7 colunas é a própria forma do dado. Rola de lado, não empilha.
const EXCECOES = new Set(["src/app/(app)/tarefas/Calendario.tsx"]);
```

(e no laço: `if (EXCECOES.has(f)) continue;`)

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/tests/ui/responsividade-grades.test.ts`
Expected: PASS

- [ ] **Step 6: Confirmar que nada mais quebrou**

Run: `npm run lint && npm run typecheck && npm test && npm run format`
Expected: tudo verde.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix(ui): grades empilham no celular; formulários adotam o FormGrid"
```

---

### Task 4: O CSS do cartão e o componente que o aplica

**Files:**
- Modify: `src/app/globals.css`
- Create: `src/components/ui/TabelaCartao.tsx`
- Test: `src/tests/ui/tabela-cartao-render.test.tsx`

**Interfaces:**
- Produces: `TabelaCartao({ children, className }: { children: React.ReactNode; className?: string })` — envolve uma `<table>`, aplicando rolagem acima de 768px e cartões abaixo. A classe CSS é `tabela-cartao`. Cada `<td>` da tabela envolvida declara `data-rotulo="<rótulo da coluna>"`.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// src/tests/ui/tabela-cartao-render.test.tsx
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { TabelaCartao } from "@/components/ui/TabelaCartao";

describe("TabelaCartao", () => {
  it("aplica a classe que o CSS do cartão procura", () => {
    const html = renderToStaticMarkup(
      <TabelaCartao>
        <table>
          <tbody>
            <tr>
              <td data-rotulo="Cliente">Padaria</td>
            </tr>
          </tbody>
        </table>
      </TabelaCartao>,
    );
    expect(html).toContain("tabela-cartao");
  });

  it("mantém rolagem horizontal, para o tablet deitado que ainda vê tabela", () => {
    const html = renderToStaticMarkup(
      <TabelaCartao>
        <table />
      </TabelaCartao>,
    );
    expect(html).toContain("overflow-x-auto");
  });

  it("não engole classes de quem a usa", () => {
    const html = renderToStaticMarkup(
      <TabelaCartao className="mt-4">
        <table />
      </TabelaCartao>,
    );
    expect(html).toContain("mt-4");
    expect(html).toContain("tabela-cartao");
  });
});

// O CSS é a metade invisível do recurso: sem ele a classe não faz nada. Como Tailwind 4 não
// gera classe interpolada, estas regras vivem no globals.css e são verificadas aqui.
describe("CSS do cartão", () => {
  const css = readFileSync("src/app/globals.css", "utf8");

  it("vira cartão abaixo de 768px — o mesmo breakpoint da Sidebar", () => {
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain(".tabela-cartao");
  });

  it("usa o rótulo da célula como etiqueta do valor", () => {
    expect(css).toContain("attr(data-rotulo)");
  });

  it("célula sem rótulo não mostra etiqueta vazia", () => {
    expect(css).toContain("[data-rotulo]::before");
  });

  it("a linha de estado vazio (colSpan) não vira lista de rótulos", () => {
    expect(css).toContain("td[colspan]");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/tests/ui/tabela-cartao-render.test.tsx`
Expected: FAIL — o módulo `TabelaCartao` não existe.

- [ ] **Step 3: Escrever o CSS**

Acrescentar ao fim de `src/app/globals.css`:

```css
/* Tabela que vira cartões no celular.
   Mora aqui, e não em utilitários, porque o scanner do Tailwind 4 só reconhece strings
   literais completas: classe montada por interpolação passaria nos testes e NÃO seria gerada
   no build — quebrando em produção, em silêncio. Mesmo motivo documentado no FormGrid.
   O limiar é 767px: o complemento exato do `md` (768px) que a Sidebar já usa. */
@media (max-width: 767px) {
  .tabela-cartao table,
  .tabela-cartao tbody,
  .tabela-cartao tr,
  .tabela-cartao td {
    display: block;
    width: 100%;
  }

  /* O cabeçalho some: cada valor passa a carregar o próprio rótulo. */
  .tabela-cartao thead {
    display: none;
  }

  .tabela-cartao tr {
    border: 1px solid var(--color-linha);
    border-radius: 12px;
    background: #fff;
    padding: 4px 12px;
    margin-bottom: 12px;
  }

  .tabela-cartao td {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding: 6px 0;
    text-align: left;
    border-bottom: 1px solid var(--color-linha);
  }

  .tabela-cartao td:last-child {
    border-bottom: 0;
  }

  /* O rótulo vem do atributo da própria célula. Só aparece quando existe: célula sem
     data-rotulo (ícone de navegação, ações) fica com o valor ocupando a linha inteira. */
  .tabela-cartao td[data-rotulo]::before {
    content: attr(data-rotulo);
    color: var(--color-cinza-claro);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }

  /* Estado vazio ("Nenhum cliente encontrado") ocupa a largura toda e não é cartão. */
  .tabela-cartao td[colspan] {
    display: block;
    border: 0;
    padding: 0;
  }

  .tabela-cartao tr:has(td[colspan]) {
    border: 0;
    padding: 0;
    background: transparent;
  }
}
```

- [ ] **Step 4: Escrever o componente**

```tsx
// src/components/ui/TabelaCartao.tsx

// Envolve uma <table> para que ela role de lado no desktop e vire cartões abaixo de 768px.
// O comportamento do cartão está em globals.css (.tabela-cartao); aqui só a aplicação.
// Cada <td> da tabela envolvida deve declarar data-rotulo com o nome da sua coluna — sem
// isso o valor aparece no cartão sem dizer do que é.
export function TabelaCartao({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`tabela-cartao overflow-x-auto ${className}`}>{children}</div>;
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/tests/ui/tabela-cartao-render.test.tsx`
Expected: PASS (7 casos)

- [ ] **Step 6: Confirmar que nada mais quebrou**

Run: `npm run lint && npm run typecheck && npm test && npm run format && npm run build`
Expected: tudo verde. O `build` importa aqui: é ele que gera o CSS final.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): TabelaCartao — tabela vira cartões abaixo de 768px"
```

---

### Task 5: Clientes — lista e ficha em cartões

**Files:**
- Modify: `src/app/(app)/clientes/page.tsx`
- Test: `src/tests/clientes/lista-cartao-render.test.tsx` (criar)

**Interfaces:**
- Consumes: `TabelaCartao` da Task 4.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// src/tests/clientes/lista-cartao-render.test.tsx
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// A lista de Clientes é a tela mais consultada fora da mesa. No cartão, cada valor precisa
// dizer de que coluna é — senão "Simples" e "Enviado" aparecem soltos, sem contexto.
describe("lista de clientes em cartões", () => {
  const src = readFileSync("src/app/(app)/clientes/page.tsx", "utf8");

  it("usa o TabelaCartao", () => {
    expect(src).toContain("TabelaCartao");
  });

  it("toda coluna de dado declara seu rótulo", () => {
    for (const rotulo of ["Cliente", "Regime", "Contrato", "Situação"]) {
      expect(src, `faltou data-rotulo="${rotulo}"`).toContain(`data-rotulo="${rotulo}"`);
    }
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/tests/clientes/lista-cartao-render.test.tsx`
Expected: FAIL — `TabelaCartao` não aparece no arquivo.

- [ ] **Step 3: Trocar o wrapper e rotular as células**

Em `src/app/(app)/clientes/page.tsx`, substituir o `<div className="overflow-x-auto">` da Task 2 pelo componente, e rotular cada `<td>` de dado:

```tsx
import { TabelaCartao } from "@/components/ui/TabelaCartao";

<Painel>
  <TabelaCartao>
    <table className="w-full text-sm">
      {/* thead inalterado — some sozinho abaixo de 768px */}
      <tbody>
        {clientes?.map((cl) => (
          <tr key={cl.id} className="border-b border-linha/70 transition last:border-0 hover:bg-creme">
            <td className="px-4 py-3" data-rotulo="Cliente">{/* …inalterado… */}</td>
            <td className="px-4 py-3" data-rotulo="Regime">{/* …inalterado… */}</td>
            <td className="px-4 py-3" data-rotulo="Contrato">{/* …inalterado… */}</td>
            <td className="px-4 py-3 text-right" data-rotulo="Situação">{/* …inalterado… */}</td>
            {/* A seta de navegação NÃO recebe rótulo: é afordância, não dado. */}
            <td className="px-2 py-3 text-right">{/* …inalterado… */}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </TabelaCartao>
  <Paginacao pagina={pagina} total={total} porPagina={POR_PAGINA} base="/clientes" params={{ q, status }} />
</Painel>
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/tests/clientes/lista-cartao-render.test.tsx`
Expected: PASS

- [ ] **Step 5: Confirmar que nada mais quebrou**

Run: `npm run lint && npm run typecheck && npm test && npm run format`
Expected: tudo verde. O teste da Task 2 continua passando — `TabelaCartao` traz `overflow-x-auto`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(clientes): lista em cartões no celular"
```

---

### Task 6: Contas a receber e inadimplência em cartões

**Files:**
- Modify: `src/components/financeiro/ContasReceber.tsx`, `src/app/(app)/financeiro/inadimplencia/LinhaCliente.tsx`
- Test: `src/tests/financeiro/contas-receber-cartao-render.test.tsx` (criar)

**Interfaces:**
- Consumes: `TabelaCartao` da Task 4.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// src/tests/financeiro/contas-receber-cartao-render.test.tsx
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("contas a receber em cartões", () => {
  const src = readFileSync("src/components/financeiro/ContasReceber.tsx", "utf8");

  it("usa o TabelaCartao", () => {
    expect(src).toContain("TabelaCartao");
  });

  it("toda coluna de dado declara seu rótulo", () => {
    for (const rotulo of ["Cliente", "Origem", "Vencimento", "Valor", "Saldo", "Status"]) {
      expect(src, `faltou data-rotulo="${rotulo}"`).toContain(`data-rotulo="${rotulo}"`);
    }
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/tests/financeiro/contas-receber-cartao-render.test.tsx`
Expected: FAIL

- [ ] **Step 3: Aplicar em ContasReceber**

```tsx
import { TabelaCartao } from "@/components/ui/TabelaCartao";

<TabelaCartao className="rounded border border-linha">
  <table className="w-full">
    {/* thead inalterado */}
    <tbody>
      {visiveis.map(({ t, saldo, status }) => (
        <tr key={t.id} className="border-t border-linha/70">
          <td className="p-2" data-rotulo="Cliente">
            {t.cliente}
            {t.grupoNome && <span className="block text-xs text-cinza">{t.grupoNome}</span>}
          </td>
          <td className="p-2" data-rotulo="Origem">{rotuloOrigem(t.origem)}</td>
          <td className="p-2" data-rotulo="Vencimento">{formatarData(t.vencimento)}</td>
          <td className="p-2" data-rotulo="Valor">{formatarMoeda(t.valor)}</td>
          <td className="p-2" data-rotulo="Saldo">{formatarMoeda(saldo)}</td>
          <td className="p-2" data-rotulo="Status">
            <Badge variante={badgeStatusTitulo(status)}>{LABEL_STATUS[status] ?? status}</Badge>
          </td>
          {/* Ações (Baixar, Estornar, Cobrar, Cancelar, boleto) NÃO recebem rótulo:
              são ações, não dado — no cartão ocupam a linha inteira. */}
          <td className="p-2 text-right">{/* …inalterado… */}</td>
        </tr>
      ))}
    </tbody>
  </table>
</TabelaCartao>
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/tests/financeiro/contas-receber-cartao-render.test.tsx`
Expected: PASS

- [ ] **Step 5: Confirmar que nada mais quebrou**

Run: `npm run lint && npm run typecheck && npm test && npm run format`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(financeiro): contas a receber em cartões no celular"
```

---

### Task 7: Atendimento (WhatsApp) no celular

**Files:**
- Modify: `src/app/(app)/atendimento/Inbox.tsx`
- Test: `src/tests/atendimento/inbox-responsivo.test.tsx` (criar)

**Interfaces:**
- Consumes: nada das tarefas anteriores. O Atendimento é lista-mestre/detalhe, não tabela — por isso **não** usa `TabelaCartao`.

- [ ] **Step 1: Ler o componente antes de decidir**

Run: `sed -n '1,80p' src/app/\(app\)/atendimento/Inbox.tsx`

O padrão esperado é duas colunas lado a lado (lista de conversas + conversa aberta). No celular as duas não cabem: a tela mostra **uma de cada vez** — a lista, e a conversa quando há uma selecionada.

- [ ] **Step 2: Escrever o teste que falha**

```tsx
// src/tests/atendimento/inbox-responsivo.test.tsx
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Inbox é mestre/detalhe: duas colunas não cabem em 390px. No celular aparece uma de cada vez.
describe("Inbox no celular", () => {
  const src = readFileSync("src/app/(app)/atendimento/Inbox.tsx", "utf8");

  it("as duas colunas só convivem a partir de 768px", () => {
    expect(src).toMatch(/md:(flex|grid)/);
  });

  it("a lista se esconde quando há conversa aberta no celular", () => {
    expect(src).toMatch(/hidden md:(flex|block|grid)/);
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/tests/atendimento/inbox-responsivo.test.tsx`
Expected: FAIL

- [ ] **Step 4: Implementar mestre/detalhe**

Aplicar ao contêiner das colunas: a lista recebe `className={conversaAberta ? "hidden md:flex" : "flex"}` e o painel da conversa `className={conversaAberta ? "flex" : "hidden md:flex"}`. Acrescentar, no topo do painel da conversa, um botão "← Conversas" visível só abaixo de 768px (`md:hidden`) que limpa a conversa selecionada.

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/tests/atendimento/inbox-responsivo.test.tsx`
Expected: PASS

- [ ] **Step 6: Confirmar que nada mais quebrou**

Run: `npm run lint && npm run typecheck && npm test && npm run format`
Expected: tudo verde.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(atendimento): inbox mestre/detalhe no celular"
```

---

### Task 8: Tarefas, Obrigações e Vencimentos em cartões

**Files:**
- Modify: `src/app/(app)/tarefas/page.tsx`, `src/app/(app)/obrigacoes/page.tsx`, `src/app/(app)/vencimentos/page.tsx`
- Test: `src/tests/ui/prazos-cartao-render.test.ts` (criar)

**Interfaces:**
- Consumes: `TabelaCartao` da Task 4.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/tests/ui/prazos-cartao-render.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// As três telas de prazo são o caso clássico de consulta fora da mesa: "o que vence hoje?".
const TELAS = [
  "src/app/(app)/tarefas/page.tsx",
  "src/app/(app)/obrigacoes/page.tsx",
  "src/app/(app)/vencimentos/page.tsx",
];

describe("telas de prazo em cartões", () => {
  it.each(TELAS)("%s usa o TabelaCartao", (caminho) => {
    expect(readFileSync(caminho, "utf8")).toContain("TabelaCartao");
  });

  it.each(TELAS)("%s rotula as células de dado", (caminho) => {
    expect(readFileSync(caminho, "utf8")).toContain("data-rotulo=");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/tests/ui/prazos-cartao-render.test.ts`
Expected: FAIL nos três.

- [ ] **Step 3: Aplicar nas três telas**

Em cada uma: trocar o wrapper de rolagem por `<TabelaCartao>` e acrescentar `data-rotulo` a cada `<td>` de dado, copiando o texto do `<th>` correspondente da mesma tabela. Células de ação e ícones ficam sem rótulo.

> Se alguma das três não tiver `<table>` (por já ser lista de cartões), remover o caminho da constante `TELAS` e registrar o motivo em comentário — o teste deve refletir a realidade, não forçá-la.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/tests/ui/prazos-cartao-render.test.ts`
Expected: PASS

- [ ] **Step 5: Confirmar que nada mais quebrou**

Run: `npm run lint && npm run typecheck && npm test && npm run format && npm run build`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(prazos): tarefas, obrigações e vencimentos em cartões no celular"
```

---

### Task 9: Fechamento — versão, CHANGELOG e PR

**Files:**
- Modify: `package.json`, `CHANGELOG.md`

- [ ] **Step 1: Subir a versão e escrever a entrada**

Subir `package.json.version` em um patch (a convenção observada no projeto é PATCH por PR, mesmo em `feat`). Acrescentar ao `CHANGELOG.md`, logo abaixo de `## [Não lançado]`, uma seção da versão nova com o que mudou: varredura (11 tabelas, 20 grades), `TabelaCartao` e os quatro fluxos.

- [ ] **Step 2: Confirmar que versão e CHANGELOG batem**

Run: `npx vitest run src/tests/versao.test.ts`
Expected: PASS (o teste exige que a versão do `package.json` seja a primeira do CHANGELOG)

- [ ] **Step 3: Rodar o verify completo**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check && npm run build`
Expected: tudo verde — são os mesmos comandos do CI.

- [ ] **Step 4: Commit e PR**

```bash
git add -A
git commit -m "chore: versão e CHANGELOG da responsividade"
git push origin develop
gh pr create --base main --head develop --title "feat(ui): responsividade — varredura e tabelas em cartões"
gh pr checks --watch
```

- [ ] **Step 5: Verificação visual — do usuário, no aparelho dele**

Pedir ao usuário que abra `app.seusaldo.ai` **no celular** e confira as quatro telas dos fluxos-chave. Nenhum teste deste plano prova aparência; eles provam marcação. Esta é a única verificação que fecha o objetivo.
