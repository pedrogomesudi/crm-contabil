# Redesign do layout — Fatia 1 — Plano de implementação

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.
> Spec: `docs/superpowers/specs/2026-07-16-redesign-layout-fatia-1-design.md`.

**Objetivo:** criar a fundação visual (régua de largura, grid de 12 colunas, elevação, token `atencao`) e
provar o novo patamar em 3 telas dentro de um `/laboratorio`, sem tocar o sistema real até a aprovação.

**Arquitetura:** primitivos aditivos em `src/components/ui/`; tokens **aditivos** em `globals.css`; as
telas propostas vivem em `src/app/(app)/laboratorio/_propostas/` e só são promovidas depois do "aprovo".

**Stack:** Next.js 16 (App Router), Tailwind 4 (CSS-first, `@theme`), TypeScript, vitest + react-dom/server.

## Restrições globais

- **Nada de tokens destrutivos.** Os tokens novos são **aditivos**: não altere nenhum valor existente do
  `@theme` (`globals.css:5-22`). Mudar `--text-2xl` ou uma cor de marca reformata 73 telas de uma vez.
- **A escala tipográfica e a de espaço vivem nos primitivos, não em tokens globais.** A spec as pede, mas
  declarar `--text-*`/`--spacing-*` no `@theme` do Tailwind 4 **sobrescreve os defaults** e mudaria as 73
  telas de uma vez — o oposto de "fundação primeiro, telas depois". Então a escala se materializa dentro
  de `Secao`, `Abas`, `FormGrid` e das telas da vitrine (ex.: `Secao` usa `text-lg` no título e `p-5` no
  corpo). Quando as 70 telas restantes forem migradas, elas herdam pelo componente, não por um token que
  muda tudo à revelia.
- **Regra do re-skin** (`docs/design/saldo-ui.md:26`): **nunca refuncionalizar**. `name`/`value`/
  `onChange`/`action`, `aria-*`, `role` e labels são preservados. O `FormCliente` muda de layout, não de
  contrato.
- **Identidade inalterada:** verde `#0fa968`, Space Grotesk / IBM Plex Sans / IBM Plex Mono, creme, light-only.
- **O sistema real não muda nesta fatia.** Só `globals.css` (aditivo), `src/components/ui/*` (novos) e o
  `/laboratorio`. As telas atuais continuam intactas até a Tarefa 9.
- `npm run lint && npm run typecheck && npm test && npm run format:check` antes de cada commit.
- O `main` é protegido: a entrega vai por PR (`gh pr create --base main --head develop`).

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/app/globals.css` (modificar) | + tokens `atencao` e sombras. Nada removido. |
| `src/components/ui/Container.tsx` (criar) | A régua única de largura |
| `src/components/ui/FormGrid.tsx` (criar) | Grid de 12 colunas + `FormCampo` (span) |
| `src/components/ui/Secao.tsx` (criar) | Bloco titulado |
| `src/components/ui/Abas.tsx` (criar) | Abas com estado na URL |
| `src/components/ui/Campo.tsx` (modificar) | `inputCls` passa a ser a fonte única |
| `src/components/ui/{Input,Textarea,Select}.tsx` (modificar) | Consomem `inputCls` (hoje: 4 cópias) |
| `src/app/(app)/laboratorio/page.tsx` (criar) | Vitrine admin-only com antes/depois |
| `src/app/(app)/laboratorio/_dados.ts` (criar) | Dados fictícios em memória |
| `src/app/(app)/laboratorio/_propostas/*.tsx` (criar) | As telas novas, ainda não promovidas |
| `docs/design/saldo-ui.md` (modificar) | O guia evolui junto (Tarefa 10) |

---

### Tarefa 1: Tokens aditivos (`atencao` + elevação)

Hoje `Badge.tsx:6` usa `bg-amber-100 text-amber-800` — a única cor fora do brand kit.

**Files:**
- Modify: `src/app/globals.css:4-23`
- Modify: `src/components/ui/Badge.tsx:6`
- Test: `src/tests/ui/badge-render.test.tsx` (criar)

**Interfaces:**
- Produces: classes `bg-atencao-fundo`, `text-atencao`, `shadow-card`, `shadow-flutuante` (Tailwind gera a
  partir do `@theme`).

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// src/tests/ui/badge-render.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Badge } from "@/components/ui/Badge";

describe("Badge", () => {
  it("a variante atencao usa o token da marca, não o amber do Tailwind", () => {
    const html = renderToStaticMarkup(<Badge variante="atencao">Em constituição</Badge>);
    expect(html).not.toContain("amber");
    expect(html).toContain("atencao");
  });

  it("as outras variantes seguem inalteradas", () => {
    expect(renderToStaticMarkup(<Badge variante="positivo">ok</Badge>)).toContain("verde");
    expect(renderToStaticMarkup(<Badge variante="ia">IA</Badge>)).toContain("violeta");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/ui/badge-render`
Expected: FAIL — `expected '<span class="...bg-amber-100 text-amber-800...">' not to contain "amber"`.

- [ ] **Step 3: Adicionar os tokens (aditivo — não altere as linhas existentes)**

Em `src/app/globals.css`, dentro do bloco `@theme` (depois da linha 18, antes das fontes):

```css
  /* Atenção — o Badge usava amber do Tailwind, fora do brand kit. */
  --color-atencao: #8a5a00;
  --color-atencao-fundo: #fdf3e0;

  /* Elevação: o sistema é hairline sobre creme; a sombra dá camada sem pesar. */
  --shadow-card: 0 1px 2px rgb(16 22 20 / 0.04), 0 1px 3px rgb(16 22 20 / 0.06);
  --shadow-flutuante: 0 4px 12px rgb(16 22 20 / 0.08), 0 2px 4px rgb(16 22 20 / 0.04);
```

- [ ] **Step 4: Trocar o amber no Badge**

Em `src/components/ui/Badge.tsx`, linha 6, troque o valor da variante `atencao` para:

```ts
  atencao: "bg-atencao-fundo text-atencao",
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/tests/ui/badge-render`
Expected: PASS (2 testes).

- [ ] **Step 6: Provar que o contraste do token novo é acessível (AA)**

O `#8a5a00` sobre `#fdf3e0` foi escolhido para passar; confirme em vez de presumir:

```bash
node -e '
const lum = (h) => { const c = h.match(/\w\w/g).map(x => { const v = parseInt(x,16)/255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }); return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]; };
const razao = (a,b) => { const [x,y] = [lum(a), lum(b)].sort((m,n) => n-m); return ((x+0.05)/(y+0.05)).toFixed(2); };
console.log("atencao sobre fundo:", razao("8a5a00","fdf3e0"), "(AA texto normal exige >= 4.5)");
'
```
Expected: um valor **≥ 4.5**. Se for menor, escureça `--color-atencao` até passar.

- [ ] **Step 7: Verificar e commitar**

```bash
npm run lint && npm run typecheck && npm test && npx prettier --write src/app/globals.css src/components/ui/Badge.tsx src/tests/ui/badge-render.test.tsx && npm run format:check
git add src/app/globals.css src/components/ui/Badge.tsx src/tests/ui/badge-render.test.tsx
git commit -m "feat(ui): token atencao (mata o amber fora do brand) e escala de elevacao"
```

---

### Tarefa 2: `Container` — a régua única

Hoje o `<main>` não tem `mx-auto` (`(app)/layout.tsx:48`) e há **9 larguras** espalhadas em 74 lugares.

**Files:**
- Create: `src/components/ui/Container.tsx`
- Test: `src/tests/ui/container-render.test.tsx`

**Interfaces:**
- Produces: `<Container largura?: "estreita" | "padrao" | "larga">` — default `padrao`.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// src/tests/ui/container-render.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Container } from "@/components/ui/Container";

describe("Container", () => {
  it("centraliza sempre (o conteúdo hoje fica colado à esquerda)", () => {
    expect(renderToStaticMarkup(<Container>x</Container>)).toContain("mx-auto");
  });
  it("padrão é a régua média", () => {
    expect(renderToStaticMarkup(<Container>x</Container>)).toContain("max-w-[1120px]");
  });
  it("estreita para formulários focados", () => {
    expect(renderToStaticMarkup(<Container largura="estreita">x</Container>)).toContain("max-w-[720px]");
  });
  it("larga é fluida (tabelões e calendário)", () => {
    const html = renderToStaticMarkup(<Container largura="larga">x</Container>);
    expect(html).toContain("max-w-full");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/ui/container-render`
Expected: FAIL — `Cannot find module '@/components/ui/Container'`.

- [ ] **Step 3: Implementar**

```tsx
// src/components/ui/Container.tsx
// A régua de largura do sistema. Antes havia 9 valores de max-w-* espalhados por 74
// lugares e nenhum mx-auto — o conteúdo ficava colado à esquerda, com o vazio todo de
// um lado. Três decisões, declaradas por tela.
const LARGURAS = {
  estreita: "max-w-[720px]", // formulário focado, login
  padrao: "max-w-[1120px]", // a maioria das telas
  larga: "max-w-full", // tabelões, calendário, kanban
} as const;

export function Container({
  largura = "padrao",
  className = "",
  children,
}: {
  largura?: keyof typeof LARGURAS;
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`mx-auto w-full ${LARGURAS[largura]} ${className}`}>{children}</div>;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/ui/container-render`
Expected: PASS (4 testes).

- [ ] **Step 5: Commitar**

```bash
npx prettier --write src/components/ui/Container.tsx src/tests/ui/container-render.test.tsx
git add src/components/ui/Container.tsx src/tests/ui/container-render.test.tsx
git commit -m "feat(ui): Container — a regua unica de largura, com mx-auto"
```

---

### Tarefa 3: `FormGrid` + `FormCampo` — 12 colunas com span por natureza

Hoje: 40 `grid-cols-2` **sem breakpoint** (espremem no celular) e o endereço dá à **UF a mesma largura de
"Logradouro"**.

**Files:**
- Create: `src/components/ui/FormGrid.tsx`
- Test: `src/tests/ui/formgrid-render.test.tsx`

**Interfaces:**
- Consumes: `Campo` de `@/components/ui/Campo` (label + hint + erro).
- Produces: `<FormGrid>` e `<FormCampo label span={1..12} hint? erro?>`.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// src/tests/ui/formgrid-render.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FormGrid, FormCampo } from "@/components/ui/FormGrid";

describe("FormGrid", () => {
  it("é um grid de 12 colunas", () => {
    expect(renderToStaticMarkup(<FormGrid>x</FormGrid>)).toContain("md:grid-cols-12");
  });

  it("colapsa para 1 coluna no mobile (hoje 40 grids espremem em 2)", () => {
    expect(renderToStaticMarkup(<FormGrid>x</FormGrid>)).toContain("grid-cols-1");
  });
});

describe("FormCampo", () => {
  it("aplica o span pedido só a partir de md", () => {
    const html = renderToStaticMarkup(
      <FormCampo label="UF" span={1}>
        <input name="uf" />
      </FormCampo>,
    );
    expect(html).toContain("md:col-span-1");
  });

  it("preserva o contrato do campo: label associado e o controle intacto", () => {
    const html = renderToStaticMarkup(
      <FormCampo label="CEP" span={2} hint="só números">
        <input name="cep" defaultValue="38400000" />
      </FormCampo>,
    );
    expect(html).toContain("CEP");
    expect(html).toContain('name="cep"');
    expect(html).toContain('value="38400000"');
    expect(html).toContain("só números");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/ui/formgrid-render`
Expected: FAIL — `Cannot find module '@/components/ui/FormGrid'`.

- [ ] **Step 3: Implementar**

```tsx
// src/components/ui/FormGrid.tsx
import { Campo } from "@/components/ui/Campo";

// Grid de formulário em 12 colunas. O span vem da NATUREZA do dado (UF=1, CEP=2,
// logradouro=7), não de uma divisão uniforme: o grid-cols-2 que havia antes dava à UF a
// mesma largura da razão social. No mobile tudo vira 1 coluna — os 40 grid-cols-2 do
// sistema não tinham breakpoint e espremiam a tela do celular.
export function FormGrid({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`grid grid-cols-1 gap-4 md:grid-cols-12 ${className}`}>{children}</div>;
}

const SPANS: Record<number, string> = {
  1: "md:col-span-1",
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
  5: "md:col-span-5",
  6: "md:col-span-6",
  7: "md:col-span-7",
  8: "md:col-span-8",
  9: "md:col-span-9",
  10: "md:col-span-10",
  11: "md:col-span-11",
  12: "md:col-span-12",
};

export function FormCampo({
  label,
  span = 6,
  hint,
  erro,
  children,
}: {
  label: string;
  span?: number;
  hint?: string;
  erro?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={SPANS[span] ?? SPANS[6]}>
      <Campo label={label} hint={hint} erro={erro}>
        {children}
      </Campo>
    </div>
  );
}
```

> As classes `md:col-span-*` estão escritas por extenso de propósito: o Tailwind varre o código-fonte em
> busca de strings completas — `md:col-span-${span}` não seria gerado.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/ui/formgrid-render`
Expected: PASS (4 testes).

- [ ] **Step 5: Commitar**

```bash
npx prettier --write src/components/ui/FormGrid.tsx src/tests/ui/formgrid-render.test.tsx
git add src/components/ui/FormGrid.tsx src/tests/ui/formgrid-render.test.tsx
git commit -m "feat(ui): FormGrid de 12 colunas com span pela natureza do dado"
```

---

### Tarefa 4: `Secao` e `Abas`

**Files:**
- Create: `src/components/ui/Secao.tsx`, `src/components/ui/Abas.tsx`
- Test: `src/tests/ui/secao-abas-render.test.tsx`

**Interfaces:**
- Produces: `<Secao titulo descricao? acoes?>`; `<Abas itens={[{chave,rotulo,badge?}]} ativa param?>`.
- **`Abas` × `SubNav`:** `SubNav` navega **entre rotas** (`href`) e continua existindo; `Abas` alterna
  **seções da mesma rota** por query param. Visual idêntico (pílulas) — a diferença é o que acontece ao
  clicar. Não duplique o `SubNav`.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// src/tests/ui/secao-abas-render.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Secao } from "@/components/ui/Secao";
import { Abas } from "@/components/ui/Abas";

describe("Secao", () => {
  it("mostra título, descrição e ações", () => {
    const html = renderToStaticMarkup(
      <Secao titulo="Dados cadastrais" descricao="CNPJ e endereço" acoes={<button>Editar</button>}>
        <p>conteúdo</p>
      </Secao>,
    );
    expect(html).toContain("Dados cadastrais");
    expect(html).toContain("CNPJ e endereço");
    expect(html).toContain("Editar");
    expect(html).toContain("conteúdo");
  });
});

describe("Abas", () => {
  const itens = [
    { chave: "cadastro", rotulo: "Cadastro" },
    { chave: "fiscal", rotulo: "Fiscal", badge: 3 },
  ];

  it("liga cada aba a um link com o estado na URL (voltar e link direto funcionam)", () => {
    const html = renderToStaticMarkup(<Abas itens={itens} ativa="cadastro" base="/clientes/1" />);
    expect(html).toContain("/clientes/1?aba=cadastro");
    expect(html).toContain("/clientes/1?aba=fiscal");
  });

  it("marca a aba ativa para leitor de tela", () => {
    const html = renderToStaticMarkup(<Abas itens={itens} ativa="fiscal" base="/clientes/1" />);
    expect(html).toContain('aria-current="page"');
  });

  it("mostra o badge (um alerta que ninguém vê é um alerta que não existe)", () => {
    expect(renderToStaticMarkup(<Abas itens={itens} ativa="cadastro" base="/x" />)).toContain(">3<");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/ui/secao-abas-render`
Expected: FAIL — `Cannot find module '@/components/ui/Secao'`.

- [ ] **Step 3: Implementar `Secao`**

```tsx
// src/components/ui/Secao.tsx
// Bloco titulado. Substitui os ~50 "rounded-2xl border border-linha bg-white" escritos à
// mão, que hoje têm 6 paddings e 2 raios diferentes para o mesmo conceito.
export function Secao({
  titulo,
  descricao,
  acoes,
  className = "",
  children,
}: {
  titulo: string;
  descricao?: string;
  acoes?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-2xl border border-linha bg-white shadow-card ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-linha px-5 py-4">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight text-texto">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-xs text-cinza">{descricao}</p>}
        </div>
        {acoes && <div className="flex items-center gap-2">{acoes}</div>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}
```

- [ ] **Step 4: Implementar `Abas`**

```tsx
// src/components/ui/Abas.tsx
import Link from "next/link";

// Alterna SEÇÕES da mesma rota, com o estado na URL (?aba=fiscal) — link direto e botão
// voltar continuam funcionando. Não confundir com SubNav, que navega ENTRE rotas; o
// visual é o mesmo de propósito, a diferença é o que acontece ao clicar.
export type ItemAba = { chave: string; rotulo: string; badge?: number };

export function Abas({
  itens,
  ativa,
  base,
  param = "aba",
}: {
  itens: ItemAba[];
  ativa: string;
  base: string;
  param?: string;
}) {
  return (
    <nav aria-label="Seções" className="flex flex-wrap gap-1 border-b border-linha">
      {itens.map((it) => {
        const eh = it.chave === ativa;
        return (
          <Link
            key={it.chave}
            href={`${base}?${param}=${it.chave}`}
            aria-current={eh ? "page" : undefined}
            className={`-mb-px flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm transition-colors ${
              eh
                ? "border-verde font-medium text-texto"
                : "border-transparent text-cinza hover:bg-creme hover:text-texto"
            }`}
          >
            {it.rotulo}
            {it.badge ? (
              <span className="rounded-full bg-negativo px-1.5 text-[10px] font-semibold text-white">
                {it.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/tests/ui/secao-abas-render`
Expected: PASS (4 testes).

- [ ] **Step 6: Commitar**

```bash
npx prettier --write src/components/ui/Secao.tsx src/components/ui/Abas.tsx src/tests/ui/secao-abas-render.test.tsx
git add src/components/ui/Secao.tsx src/components/ui/Abas.tsx src/tests/ui/secao-abas-render.test.tsx
git commit -m "feat(ui): Secao e Abas (estado na URL, distinto do SubNav entre rotas)"
```

---

### Tarefa 5: DRY — `inputCls` como fonte única

A mesma string existe em 4 arquivos: `Campo.tsx:2-3`, `Input.tsx:6`, `Textarea.tsx:6`, `Select.tsx:6`.

**Files:**
- Modify: `src/components/ui/Input.tsx`, `src/components/ui/Textarea.tsx`, `src/components/ui/Select.tsx`
- Test: `src/tests/ui/controles-render.test.tsx`

**Interfaces:**
- Consumes: `inputCls` de `@/components/ui/Campo` (já exportado, linha 2).

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// src/tests/ui/controles-render.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { inputCls } from "@/components/ui/Campo";

describe("controles de formulário", () => {
  it("os três usam a MESMA classe base (era copiada em 4 arquivos)", () => {
    const base = inputCls.split(" ")[0];
    expect(renderToStaticMarkup(<Input name="a" />)).toContain(base);
    expect(renderToStaticMarkup(<Select name="b" />)).toContain(base);
    expect(renderToStaticMarkup(<Textarea name="c" />)).toContain(base);
  });

  it("className extra continua sendo somada, não substituindo", () => {
    expect(renderToStaticMarkup(<Input name="a" className="tabular-nums" />)).toContain("tabular-nums");
  });
});
```

- [ ] **Step 2: Rodar e ver o estado atual**

Run: `npx vitest run src/tests/ui/controles-render`
Expected: PASS (as strings hoje são idênticas por coincidência) — o teste **trava** essa coincidência
antes do refactor. Se falhar, uma das cópias já divergiu: anote qual e siga.

- [ ] **Step 3: Fazer os três consumirem a constante**

Em `src/components/ui/Input.tsx`, `Textarea.tsx` e `Select.tsx`, troque a string literal pelo import.
Exemplo do `Input.tsx` (aplique o mesmo padrão nos outros dois, trocando `<input>` por `<select>`/`<textarea>`):

```tsx
import { inputCls } from "@/components/ui/Campo";

export function Input({ className = "", ...props }: React.ComponentProps<"input">) {
  return <input {...props} className={`${inputCls} ${className}`} />;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/ui/controles-render && npm test`
Expected: PASS — e a suíte inteira segue verde (nenhuma tela muda de aparência: a string é a mesma).

- [ ] **Step 5: Commitar**

```bash
npx prettier --write src/components/ui/Input.tsx src/components/ui/Textarea.tsx src/components/ui/Select.tsx src/tests/ui/controles-render.test.tsx
git add src/components/ui/Input.tsx src/components/ui/Textarea.tsx src/components/ui/Select.tsx src/tests/ui/controles-render.test.tsx
git commit -m "refactor(ui): inputCls vira fonte unica (era a mesma string em 4 arquivos)"
```

---

### Tarefa 6: `/laboratorio` — a vitrine

**Files:**
- Create: `src/app/(app)/laboratorio/page.tsx`, `src/app/(app)/laboratorio/_dados.ts`
- Create: `src/app/(app)/laboratorio/Vitrine.tsx`

**Interfaces:**
- Consumes: `getPerfilAtual` de `@/lib/auth/perfil`; `Container`, `Abas`.
- Produces: `CLIENTE_FICTICIO`, `CLIENTES_FICTICIOS`, `CONTADORES_FICTICIOS` de `./_dados`.

- [ ] **Step 1: Dados fictícios (em memória, nunca no banco)**

```ts
// src/app/(app)/laboratorio/_dados.ts
// Dados de mentira, só para a vitrine: o banco de dev está vazio por decisão da separação
// de ambientes, e tela vazia não deixa avaliar layout. Nada aqui vai para o banco.
export const CONTADORES_FICTICIOS = [
  { id: "c1", nome: "Ana Souza" },
  { id: "c2", nome: "Bruno Lima" },
];

export type ClienteFicticio = typeof CLIENTE_FICTICIO;

export const CLIENTE_FICTICIO = {
  id: "f1",
  tipo_pessoa: "PJ",
  cpf_cnpj: "12345678000190",
  razao_social: "ACME Indústria e Comércio Ltda",
  nome_fantasia: "ACME",
  regime_tributario: "Simples",
  inscricao_estadual: "123.456.789.000",
  inscricao_municipal: "98765",
  email: "financeiro@acme.com.br",
  telefone: "34999887766",
  responsavel_nome: "Carlos Pereira",
  endereco: {
    logradouro: "Avenida Rondon Pacheco",
    numero: "1200",
    complemento: "Sala 12",
    bairro: "Tibery",
    cidade: "Uberlândia",
    uf: "MG",
    cep: "38400000",
  },
  contador_id: "c1",
  status: "ativo",
  data_inicio: "2024-07-01",
  atualizado_em: "2026-07-16T12:00:00.000Z",
};

export const CLIENTES_FICTICIOS = [
  { id: "f1", razao_social: "ACME Indústria e Comércio Ltda", cpf_cnpj: "12345678000190", regime_tributario: "Simples", status: "ativo", excluido_em: null },
  { id: "f2", razao_social: "Beta Serviços ME", cpf_cnpj: "98765432000110", regime_tributario: "Presumido", status: "ativo", excluido_em: null },
  { id: "f3", razao_social: "Gama Transportes S.A.", cpf_cnpj: "11222333000144", regime_tributario: "Real", status: "inativo", excluido_em: null },
  { id: "f4", razao_social: "Delta Consultoria", cpf_cnpj: null, regime_tributario: null, status: "em_constituicao", excluido_em: null },
];
```

- [ ] **Step 2: A página (admin-only, fora do menu)**

```tsx
// src/app/(app)/laboratorio/page.tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { Vitrine } from "./Vitrine";

export const metadata = { title: "Laboratório (temporário)" };

// TEMPORÁRIA: existe só para avaliar o redesign antes de aplicar no sistema. Some quando o
// padrão for aprovado (é tarefa do plano, não "depois a gente tira"). Fora do menu de propósito.
export default async function LaboratorioPage({
  searchParams,
}: {
  searchParams: Promise<{ tela?: string; modo?: string; aba?: string }>;
}) {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || perfil.papel !== "admin") redirect("/");
  const sp = await searchParams;
  return <Vitrine tela={sp.tela ?? "cadastro"} modo={sp.modo ?? "depois"} aba={sp.aba ?? "cadastro"} />;
}
```

- [ ] **Step 3: A vitrine com antes/depois**

```tsx
// src/app/(app)/laboratorio/Vitrine.tsx
import Link from "next/link";
import { Container } from "@/components/ui/Container";

const TELAS = [
  { chave: "cadastro", rotulo: "Cadastro de cliente" },
  { chave: "lista", rotulo: "Lista de clientes" },
  { chave: "painel", rotulo: "Dashboard" },
];

export function Vitrine({ tela, modo }: { tela: string; modo: string; aba: string }) {
  const link = (t: string, m: string) => `/laboratorio?tela=${t}&modo=${m}`;
  return (
    <div className="space-y-4">
      <Container>
        <div className="rounded-2xl border border-atencao/30 bg-atencao-fundo px-4 py-3">
          <p className="text-sm text-atencao">
            <strong>Laboratório temporário.</strong> Nada aqui é real: os dados são fictícios e a tela sai
            do sistema quando o padrão for aprovado.
          </p>
        </div>
      </Container>
      <Container>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Telas" className="flex gap-1">
            {TELAS.map((t) => (
              <Link
                key={t.chave}
                href={link(t.chave, modo)}
                aria-current={t.chave === tela ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm ${t.chave === tela ? "bg-tinta text-creme" : "text-cinza hover:bg-creme"}`}
              >
                {t.rotulo}
              </Link>
            ))}
          </nav>
          <div className="flex rounded-lg border border-linha bg-white p-0.5 text-sm">
            {["antes", "depois"].map((m) => (
              <Link
                key={m}
                href={link(tela, m)}
                className={`rounded px-3 py-1 ${m === modo ? "bg-verde font-medium text-white" : "text-cinza"}`}
              >
                {m}
              </Link>
            ))}
          </div>
        </div>
      </Container>
      <Container largura="larga">
        <div className="rounded-2xl border border-dashed border-linha bg-creme p-4">
          <p className="text-xs text-cinza-claro">
            Conteúdo da tela ({tela} · {modo}) — preenchido nas Tarefas 7 a 9.
          </p>
        </div>
      </Container>
    </div>
  );
}
```

- [ ] **Step 4: Ver de pé**

```bash
npm run dev > /tmp/lab.log 2>&1 &
sleep 10
curl -s -o /dev/null -w "laboratorio: http=%{http_code}\n" http://localhost:3000/laboratorio
kill %1
```
Expected: `http=200` se logado como admin; `http=307` (redirect) se não houver sessão — os dois provam que
o gate existe. **Não** prossiga se der 500.

- [ ] **Step 5: Verificar e commitar**

```bash
npm run lint && npm run typecheck && npm test && npx prettier --write "src/app/(app)/laboratorio" && npm run format:check
git add "src/app/(app)/laboratorio"
git commit -m "feat(laboratorio): vitrine temporaria admin-only com antes/depois e dados ficticios"
```

---

### Tarefa 7: Cadastro de cliente — o "depois"

O caso que motivou o pedido: `FormCliente.tsx:98` usa `max-w-2xl` (672px de ~1168px = 58%) e cinco
`grid-cols-2` uniformes.

**Files:**
- Create: `src/app/(app)/laboratorio/_propostas/FormClienteV2.tsx`
- Modify: `src/app/(app)/laboratorio/Vitrine.tsx`
- Test: `src/tests/ui/form-cliente-v2-render.test.tsx`

**Interfaces:**
- Consumes: `FormGrid`, `FormCampo`, `Secao`, `Container`, `Input`, `Select`, `CLIENTE_FICTICIO`.
- Produces: `<FormClienteV2 cliente contadores />` — **apresentação apenas** (sem `action`): a vitrine não
  salva nada. A promoção para o `FormCliente` real acontece na Tarefa 9, preservando `action`/`name`/`onChange`.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// src/tests/ui/form-cliente-v2-render.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FormClienteV2 } from "@/app/(app)/laboratorio/_propostas/FormClienteV2";
import { CLIENTE_FICTICIO, CONTADORES_FICTICIOS } from "@/app/(app)/laboratorio/_dados";

const render = () =>
  renderToStaticMarkup(<FormClienteV2 cliente={CLIENTE_FICTICIO} contadores={CONTADORES_FICTICIOS} />);

describe("FormClienteV2", () => {
  it("não se auto-limita a 672px (o form antigo usava 58% da largura)", () => {
    expect(render()).not.toContain("max-w-2xl");
  });

  it("os campos ganham span pela natureza do dado: UF é estreita, logradouro é largo", () => {
    const html = render();
    expect(html).toContain("md:col-span-1"); // UF
    expect(html).toContain("md:col-span-7"); // logradouro
  });

  it("preserva os names do formulário atual (re-skin não refuncionaliza)", () => {
    const html = render();
    for (const name of ["razao_social", "cpf_cnpj", "logradouro", "numero", "uf", "cep", "email"]) {
      expect(html).toContain(`name="${name}"`);
    }
  });

  it("mostra os dados do cliente", () => {
    expect(render()).toContain("ACME Indústria e Comércio Ltda");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/ui/form-cliente-v2-render`
Expected: FAIL — `Cannot find module '.../FormClienteV2'`.

- [ ] **Step 3: Implementar**

Espelhe os 4 fieldsets do `FormCliente.tsx` (Cadastrais e fiscais L103-179, Contato L181-224,
Representante L226-253, Gestão interna L255-294), agora em `Secao` + `FormGrid`. Os spans **por natureza
do dado**:

```tsx
// src/app/(app)/laboratorio/_propostas/FormClienteV2.tsx
"use client";
import { Container } from "@/components/ui/Container";
import { Secao } from "@/components/ui/Secao";
import { FormGrid, FormCampo } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

import type { ClienteFicticio } from "../_dados";

// Proposta visual do cadastro. Só apresentação: a vitrine não salva. Ao promover (Tarefa 9),
// o action/useActionState e a busca na Receita do FormCliente atual voltam intactos.
export function FormClienteV2({
  cliente,
  contadores,
}: {
  cliente: ClienteFicticio;
  contadores: { id: string; nome: string }[];
}) {
  const end = cliente.endereco;
  return (
    <Container>
      <div className="space-y-4">
        <Secao titulo="Cadastrais e fiscais" descricao="Identificação e enquadramento">
          <FormGrid>
            <FormCampo label="Tipo de pessoa" span={2}>
              <Select name="tipo_pessoa" defaultValue={cliente.tipo_pessoa}>
                <option value="PJ">PJ</option>
                <option value="PF">PF</option>
              </Select>
            </FormCampo>
            <FormCampo label="CPF / CNPJ" span={3}>
              <Input name="cpf_cnpj" defaultValue={cliente.cpf_cnpj ?? ""} className="tabular-nums" />
            </FormCampo>
            <FormCampo label="Razão social / Nome" span={7}>
              <Input name="razao_social" defaultValue={cliente.razao_social} />
            </FormCampo>
            <FormCampo label="Nome fantasia" span={5}>
              <Input name="nome_fantasia" defaultValue={cliente.nome_fantasia ?? ""} />
            </FormCampo>
            <FormCampo label="Regime tributário" span={3}>
              <Select name="regime_tributario" defaultValue={cliente.regime_tributario ?? ""}>
                <option value="Simples">Simples</option>
                <option value="Presumido">Presumido</option>
                <option value="Real">Real</option>
              </Select>
            </FormCampo>
            <FormCampo label="Inscrição estadual" span={2}>
              <Input name="inscricao_estadual" defaultValue={cliente.inscricao_estadual ?? ""} />
            </FormCampo>
            <FormCampo label="Inscrição municipal" span={2}>
              <Input name="inscricao_municipal" defaultValue={cliente.inscricao_municipal ?? ""} />
            </FormCampo>
          </FormGrid>
        </Secao>

        <Secao titulo="Contato e endereço">
          <FormGrid>
            <FormCampo label="E-mail" span={5}>
              <Input name="email" type="email" defaultValue={cliente.email ?? ""} />
            </FormCampo>
            <FormCampo label="Telefone" span={3}>
              <Input name="telefone" defaultValue={cliente.telefone ?? ""} />
            </FormCampo>
            <FormCampo label="Responsável" span={4}>
              <Input name="responsavel_nome" defaultValue={cliente.responsavel_nome ?? ""} />
            </FormCampo>
            <FormCampo label="Logradouro" span={7}>
              <Input name="logradouro" defaultValue={end.logradouro ?? ""} />
            </FormCampo>
            <FormCampo label="Número" span={2}>
              <Input name="numero" defaultValue={end.numero ?? ""} className="tabular-nums" />
            </FormCampo>
            <FormCampo label="Complemento" span={3}>
              <Input name="complemento" defaultValue={end.complemento ?? ""} />
            </FormCampo>
            <FormCampo label="Bairro" span={5}>
              <Input name="bairro" defaultValue={end.bairro ?? ""} />
            </FormCampo>
            <FormCampo label="Cidade" span={4}>
              <Input name="cidade" defaultValue={end.cidade ?? ""} />
            </FormCampo>
            <FormCampo label="UF" span={1}>
              <Input name="uf" maxLength={2} defaultValue={end.uf ?? ""} className="uppercase" />
            </FormCampo>
            <FormCampo label="CEP" span={2}>
              <Input name="cep" defaultValue={end.cep ?? ""} className="tabular-nums" />
            </FormCampo>
          </FormGrid>
        </Secao>

        <Secao titulo="Gestão interna">
          <FormGrid>
            <FormCampo label="Contador responsável" span={5}>
              <Select name="contador_id" defaultValue={cliente.contador_id ?? ""}>
                {contadores.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.nome}
                  </option>
                ))}
              </Select>
            </FormCampo>
            <FormCampo label="Início do contrato" span={3}>
              <Input name="data_inicio" type="date" defaultValue={cliente.data_inicio ?? ""} />
            </FormCampo>
            <FormCampo label="Status" span={4}>
              <Select name="status" defaultValue={cliente.status}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </Select>
            </FormCampo>
            <FormCampo label="Observações" span={12}>
              <Textarea name="observacoes" rows={3} />
            </FormCampo>
          </FormGrid>
        </Secao>
      </div>
    </Container>
  );
}
```

- [ ] **Step 4: Ligar na vitrine**

Em `src/app/(app)/laboratorio/Vitrine.tsx`, troque o bloco tracejado do `Container largura="larga"` por:

```tsx
      {tela === "cadastro" && modo === "depois" && (
        <FormClienteV2 cliente={CLIENTE_FICTICIO} contadores={CONTADORES_FICTICIOS} />
      )}
      {tela === "cadastro" && modo === "antes" && (
        <div className="mx-auto max-w-[1120px]">
          <div className="rounded-2xl border border-dashed border-linha bg-white p-4">
            <p className="mb-3 text-xs text-cinza-claro">
              Como é hoje: 672px de ~1168px (58%), colado à esquerda, com grid uniforme.
            </p>
            <FormClienteAtualEstatico />
          </div>
        </div>
      )}
```

E adicione, no mesmo arquivo, a réplica estática do layout atual (o `FormCliente` real exige `action`, e a
vitrine não salva):

```tsx
function FormClienteAtualEstatico() {
  return (
    <div className="max-w-2xl space-y-6">
      <fieldset className="space-y-3 rounded-lg border border-linha bg-white p-4">
        <legend className="px-1 font-display text-sm font-semibold">Cadastrais e fiscais</legend>
        <label className="block space-y-1.5 text-sm">
          <span className="block text-xs font-medium text-cinza">Razão social / Nome</span>
          <input readOnly value="ACME Indústria e Comércio Ltda" className="w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5 text-sm">
            <span className="block text-xs font-medium text-cinza">Inscrição estadual</span>
            <input readOnly value="123.456.789.000" className="w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm" />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="block text-xs font-medium text-cinza">Inscrição municipal</span>
            <input readOnly value="98765" className="w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm" />
          </label>
        </div>
      </fieldset>
      <fieldset className="space-y-3 rounded-lg border border-linha bg-white p-4">
        <legend className="px-1 font-display text-sm font-semibold">Contato</legend>
        <div className="grid grid-cols-2 gap-3">
          {[
            ["Logradouro", "Avenida Rondon Pacheco"],
            ["Número", "1200"],
            ["Complemento", "Sala 12"],
            ["Bairro", "Tibery"],
            ["Cidade", "Uberlândia"],
            ["UF", "MG"],
            ["CEP", "38400000"],
          ].map(([l, v]) => (
            <label key={l} className="block space-y-1.5 text-sm">
              <span className="block text-xs font-medium text-cinza">{l}</span>
              <input readOnly value={v} className="w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm" />
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
```

> A réplica é estática de propósito: mostra o **layout** de hoje (672px, `grid-cols-2` uniforme, UF do
> tamanho de Logradouro) sem arrastar o `useActionState` e a busca na Receita para dentro da vitrine.

- [ ] **Step 5: Rodar os testes e ver a tela**

```bash
npx vitest run src/tests/ui/form-cliente-v2-render
npm run dev > /tmp/lab.log 2>&1 &
sleep 10
curl -s -o /dev/null -w "depois: http=%{http_code}\n" "http://localhost:3000/laboratorio?tela=cadastro&modo=depois"
curl -s -o /dev/null -w "antes:  http=%{http_code}\n" "http://localhost:3000/laboratorio?tela=cadastro&modo=antes"
kill %1
```
Expected: 4 testes PASS; ambos os `curl` com 200 (logado) ou 307 (sem sessão).

- [ ] **Step 6: Verificar e commitar**

```bash
npm run lint && npm run typecheck && npm test && npx prettier --write "src/app/(app)/laboratorio" src/tests/ui/form-cliente-v2-render.test.tsx && npm run format:check
git add "src/app/(app)/laboratorio" src/tests/ui/form-cliente-v2-render.test.tsx
git commit -m "feat(laboratorio): cadastro de cliente em 12 colunas, com o antes ao lado"
```

---

### Tarefa 8: Ficha do cliente em abas, lista e dashboard

**Files:**
- Create: `src/app/(app)/laboratorio/_propostas/FichaV2.tsx`, `ListaV2.tsx`, `PainelV2.tsx`
- Modify: `src/app/(app)/laboratorio/Vitrine.tsx`
- Test: `src/tests/ui/ficha-v2-render.test.tsx`

**Interfaces:**
- Consumes: `Abas`, `Secao`, `Container`, `Badge`, `StatCard`, `CLIENTES_FICTICIOS`, `CLIENTE_FICTICIO`.
- Produces: `<FichaV2 aba />`, `<ListaV2 />`, `<PainelV2 />`.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// src/tests/ui/ficha-v2-render.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FichaV2 } from "@/app/(app)/laboratorio/_propostas/FichaV2";

describe("FichaV2", () => {
  it("agrupa as 19 seções em 5 abas por afinidade", () => {
    const html = renderToStaticMarkup(<FichaV2 aba="cadastro" />);
    for (const aba of ["Cadastro", "Financeiro", "Fiscal", "Documentos", "Relação"]) {
      expect(html).toContain(aba);
    }
  });

  it("cada aba leva o estado na URL (link direto e voltar funcionam)", () => {
    expect(renderToStaticMarkup(<FichaV2 aba="cadastro" />)).toContain("aba=fiscal");
  });

  it("mostra só a aba ativa (o problema era o scroll infinito)", () => {
    const html = renderToStaticMarkup(<FichaV2 aba="financeiro" />);
    expect(html).toContain("Honorário");
    expect(html).not.toContain("Notas fiscais emitidas");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/ui/ficha-v2-render`
Expected: FAIL — `Cannot find module '.../FichaV2'`.

- [ ] **Step 3: Implementar a ficha em abas**

O agrupamento dos 19 blocos de `clientes/[id]/page.tsx` (a spec fixou):

```tsx
// src/app/(app)/laboratorio/_propostas/FichaV2.tsx
import { Container } from "@/components/ui/Container";
import { Secao } from "@/components/ui/Secao";
import { Abas } from "@/components/ui/Abas";
import { Badge } from "@/components/ui/Badge";
import { CLIENTE_FICTICIO } from "../_dados";

const ABAS = [
  { chave: "cadastro", rotulo: "Cadastro" },
  { chave: "financeiro", rotulo: "Financeiro" },
  { chave: "fiscal", rotulo: "Fiscal", badge: 3 },
  { chave: "documentos", rotulo: "Documentos" },
  { chave: "relacao", rotulo: "Relação" },
];

// As 19 seções que hoje descem numa coluna só, agrupadas por afinidade.
// Cadastro: dados, endereço, representante, gestão · Financeiro: honorário, vigências,
// contratos, opt-out · Fiscal: obrigações, NFS-e, emissão, vencimentos · Documentos:
// arquivos, contrato gerado, LGPD · Relação: e-mails, tarefas, SOPs, portal, responsáveis.
export function FichaV2({ aba }: { aba: string }) {
  return (
    <Container>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight text-texto">
              {CLIENTE_FICTICIO.razao_social}
            </h1>
            <Badge variante="positivo">Ativo</Badge>
          </div>
          <p className="font-mono text-xs text-cinza-claro">12.345.678/0001-90</p>
        </div>

        <Abas itens={ABAS} ativa={aba} base="/laboratorio" param="aba" />

        {aba === "cadastro" && (
          <Secao titulo="Dados cadastrais" descricao="Identificação, endereço e representante">
            <p className="text-sm text-cinza">O formulário em 12 colunas entra aqui (veja a tela Cadastro).</p>
          </Secao>
        )}
        {aba === "financeiro" && (
          <div className="space-y-4">
            <Secao titulo="Honorário" descricao="Valor vigente e vencimento">
              <p className="font-display text-2xl font-semibold tabular-nums text-texto">R$ 1.500,00</p>
              <p className="mt-1 text-xs text-cinza">vence todo dia 10</p>
            </Secao>
            <Secao titulo="Vigências e contratos">
              <p className="text-sm text-cinza">Linha do tempo de reajustes e contratos assinados.</p>
            </Secao>
          </div>
        )}
        {aba === "fiscal" && (
          <div className="space-y-4">
            <Secao titulo="Obrigações" descricao="3 no prazo">
              <p className="text-sm text-cinza">Calendário e baixas do cliente.</p>
            </Secao>
            <Secao titulo="Notas fiscais emitidas">
              <p className="text-sm text-cinza">NFS-e do cliente e emissão avulsa.</p>
            </Secao>
          </div>
        )}
        {aba === "documentos" && (
          <Secao titulo="Arquivos" descricao="Contrato social, procurações, LGPD">
            <p className="text-sm text-cinza">Lista de documentos do cliente.</p>
          </Secao>
        )}
        {aba === "relacao" && (
          <Secao titulo="Relacionamento" descricao="E-mails, tarefas, SOPs e portal">
            <p className="text-sm text-cinza">Histórico de contato e acessos.</p>
          </Secao>
        )}
      </div>
    </Container>
  );
}
```

> As seções trazem texto-marcador porque a vitrine avalia **layout e agrupamento**, não o conteúdo real de
> cada bloco — que já existe e será plugado na promoção (Tarefa 9). O que precisa ser julgado aqui é: as
> 5 abas fazem sentido? o que você procura está onde você espera?

- [ ] **Step 4: Implementar lista e dashboard**

```tsx
// src/app/(app)/laboratorio/_propostas/ListaV2.tsx
import { Container } from "@/components/ui/Container";
import { Secao } from "@/components/ui/Secao";
import { Badge } from "@/components/ui/Badge";
import { Iniciais } from "@/components/ui/Iniciais";
import { formatarDocumento } from "@/lib/format";
import { badgeRegime } from "@/lib/ui/apresentacao";
import { CLIENTES_FICTICIOS } from "../_dados";

const SITUACAO: Record<string, { rotulo: string; variante: "positivo" | "atencao" | "neutro" }> = {
  ativo: { rotulo: "Ativo", variante: "positivo" },
  em_constituicao: { rotulo: "Em constituição", variante: "atencao" },
  inativo: { rotulo: "Inativo", variante: "neutro" },
};

export function ListaV2() {
  return (
    <Container>
      <Secao titulo="Clientes" descricao={`${CLIENTES_FICTICIOS.length} na carteira`}>
        <table className="w-full text-sm">
          <caption className="sr-only">Lista de clientes</caption>
          <thead>
            <tr className="border-b border-linha text-left">
              <th className="px-3 py-2 font-mono text-[10.5px] font-medium uppercase tracking-wide text-cinza-claro">Cliente</th>
              <th className="px-3 py-2 font-mono text-[10.5px] font-medium uppercase tracking-wide text-cinza-claro">Regime</th>
              <th className="px-3 py-2 text-right font-mono text-[10.5px] font-medium uppercase tracking-wide text-cinza-claro">Situação</th>
            </tr>
          </thead>
          <tbody>
            {CLIENTES_FICTICIOS.map((c) => {
              const s = SITUACAO[c.status] ?? SITUACAO.inativo;
              return (
                <tr key={c.id} className="border-b border-linha/70 transition-colors last:border-0 hover:bg-creme">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <Iniciais nome={c.razao_social} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-texto">{c.razao_social}</p>
                        <p className="font-mono text-xs text-cinza-claro">
                          {c.cpf_cnpj ? formatarDocumento(c.cpf_cnpj) : "— sem CNPJ"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {c.regime_tributario ? (
                      <Badge variante={badgeRegime(c.regime_tributario)}>{c.regime_tributario}</Badge>
                    ) : (
                      <span className="text-cinza-claro">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Badge variante={s.variante}>{s.rotulo}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Secao>
    </Container>
  );
}
```

```tsx
// src/app/(app)/laboratorio/_propostas/PainelV2.tsx
import { Container } from "@/components/ui/Container";
import { Secao } from "@/components/ui/Secao";
import { StatCard } from "@/components/ui/StatCard";

export function PainelV2() {
  return (
    <Container>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard rotulo="MRR" valor="R$ 36.000,00" variante="positivo" />
          <StatCard rotulo="Clientes ativos" valor="99" />
          <StatCard rotulo="Ticket médio" valor="R$ 363,64" variante="destaque" />
          <StatCard rotulo="Churn" valor="0,0%" />
        </div>
        <Secao titulo="A vencer nos próximos 30 dias" descricao="Certificados e procurações">
          <p className="text-sm text-cinza">Lista compacta dos itens que exigem ação.</p>
        </Secao>
      </div>
    </Container>
  );
}
```

> Confirme a API do `StatCard` (`src/components/ui/StatCard.tsx`) antes de usar: se os props não forem
> `rotulo`/`valor`/`variante`, ajuste a chamada — **não** mude o componente.

- [ ] **Step 5: Ligar as três telas na vitrine**

Em `Vitrine.tsx`, adicione as ramificações para `tela === "lista"` e `tela === "painel"` (modo `depois`),
e para o modo `antes` mostre um aviso curto: `<p>` explicando que a tela atual é full-width sem régua.
Para a ficha, use `<FichaV2 aba={aba} />` na tela `cadastro` quando `modo === "depois"` e o parâmetro
`aba` estiver presente.

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/tests/ui/ficha-v2-render && npm test`
Expected: 3 testes novos PASS; suíte inteira verde.

- [ ] **Step 7: Verificar e commitar**

```bash
npm run lint && npm run typecheck && npx prettier --write "src/app/(app)/laboratorio" src/tests/ui/ficha-v2-render.test.tsx && npm run format:check
git add "src/app/(app)/laboratorio" src/tests/ui/ficha-v2-render.test.tsx
git commit -m "feat(laboratorio): ficha em 5 abas, lista e dashboard no patamar novo"
```

---

### Tarefa 9: Avaliação e entrega da vitrine

**PARE aqui e chame o humano.** Esta tarefa não tem código — tem julgamento.

- [ ] **Step 1: Subir e apresentar**

```bash
npm run dev
```
Peça ao Pedro que abra `http://localhost:3000/laboratorio` (logado como admin no **dev**) e alterne
antes/depois nas três telas. Perguntas a fazer, nesta ordem:

1. O cadastro em 12 colunas resolve o desperdício que te incomodava?
2. As 5 abas da ficha agrupam do jeito que a sua cabeça procura?
3. O patamar visual subiu o suficiente — ou passou do ponto?

- [ ] **Step 2: Entregar a fatia por PR**

```bash
git push origin develop
gh pr create --base main --head develop --title "feat(ui): fundacao visual + laboratorio para avaliacao"
gh pr checks --watch
gh pr merge --merge
```

- [ ] **Step 3: Registrar a decisão**

Anote no PR (ou numa issue) o que foi aprovado, o que mudou depois do feedback e o que ficou para a
Fatia 2. Sem isso, o "aprovei" de hoje vira lenda em duas semanas.

---

### Tarefa 10: Promoção — aplicar no sistema e apagar o laboratório

**Só depois do "aprovo" da Tarefa 9.** Se o feedback pedir mudanças, volte à Tarefa 7/8 antes.

**Files:**
- Modify: `src/components/FormCliente.tsx` (o layout, **não** o comportamento)
- Modify: `src/app/(app)/clientes/[id]/page.tsx` (abas), `src/app/(app)/clientes/page.tsx`, `src/app/(app)/page.tsx`
- Modify: `src/app/(app)/layout.tsx:48` (o `<main>` ganha a régua)
- Modify: `docs/design/saldo-ui.md`, `CHANGELOG.md`
- Delete: `src/app/(app)/laboratorio/**`

- [ ] **Step 1: Promover o formulário**

Aplique no `FormCliente.tsx` o layout aprovado: `max-w-2xl` (linha 98) sai, `Secao` + `FormGrid` +
`FormCampo` entram. **Preserve intactos**: `useActionState`/`formAction`, o `input hidden`
`atualizado_em` (L100-102), a busca na Receita (`setF`, L80-95), os `name` de todos os campos e os erros
(L296-308). O teste `src/tests/ui/form-cliente-v2-render.test.tsx` migra para apontar ao `FormCliente`
real e continua exigindo os `name`.

- [ ] **Step 2: Promover a ficha, a lista e o dashboard**

`clientes/[id]/page.tsx`: as 19 seções passam a viver nas 5 abas (`?aba=`), lendo o parâmetro de
`searchParams`. Nenhuma seção some.

- [ ] **Step 3: A régua no layout raiz**

Em `src/app/(app)/layout.tsx:48`, o `<main>` passa a centralizar o conteúdo. As telas que precisam de
largura total usam `<Container largura="larga">`.

- [ ] **Step 4: Atualizar o guia (senão ele passa a mentir)**

Em `docs/design/saldo-ui.md`: o princípio 1 vira **"restrição com acabamento"**; documente `Container`
(3 larguras), `FormGrid`/`FormCampo` (span por natureza), `Secao`, `Abas` (× `SubNav`), o token `atencao`
e a escala de elevação. Registre a regra: **largura é decisão de tela, declarada via `Container`** — nada
de `max-w-*` solto.

- [ ] **Step 5: Apagar o laboratório**

```bash
rm -rf "src/app/(app)/laboratorio"
rm -f src/tests/ui/ficha-v2-render.test.tsx
grep -rn "laboratorio" src/ docs/ --include="*.tsx" --include="*.ts" --include="*.md" | grep -v CHANGELOG
```
Expected: nenhuma referência viva. A vitrine era andaime — andaime que fica vira dívida.

- [ ] **Step 6: Verificar tudo e entregar**

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run format:check
git add -A
git commit -m "feat(ui): cadastro em 12 colunas, ficha em abas e a regua no sistema; laboratorio removido"
git push origin develop
gh pr create --base main --head develop --title "feat(ui): fatia 1 do redesign aplicada"
gh pr checks --watch
gh pr merge --merge
```
Expected: 652+ testes verdes, build limpo, CI verde.

---

## Encerramento

- [ ] CHANGELOG em `[Não lançado]`: o que mudou visualmente e por quê (o `versao.test.ts` cobra o
      `package.json` só no dia da release).
- [ ] Fatia 2 (menus) segue como spec própria — e agora com uma informação que a Fatia 1 revelou: a ficha
      do cliente em abas resolve parte da sobreposição que hoje existe entre módulos.
