# Fatia 2 — Arquitetura de navegação — Plano

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.
> Spec: `docs/superpowers/specs/2026-07-17-menus-fatia-2-design.md`.

**Objetivo:** o menu passa de 12 itens planos para 4 grupos com título; as 11 rotas órfãs viram
alcançáveis; e o SubNav vira o único padrão de navegação secundária.

**Arquitetura:** o mapa do menu vira **dado puro** (`src/lib/ui/navegacao.ts`) com a regra de RBAC
testável sem DOM; o `Sidebar` fica só com o render. As sub-telas de cada seção entram em `SubNav`.

**Stack:** Next.js 16 (App Router), Tailwind 4, TypeScript, vitest + react-dom/server.

## Restrições globais

- **As permissões NÃO mudam.** Esta fatia mexe em **onde as coisas aparecem**, nunca em **quem pode
  vê-las**. Cada item mantém o gate que tem hoje, com a mesma função de permissão.
- **Nenhuma URL muda.** Só o caminho até ela. Links antigos e bookmarks continuam funcionando.
- **Grupo vazio não é renderizado** — nem o título. O papel `financeiro` não vê Onboarding/Legalização/
  Comercial, então o grupo ENTRADA some inteiro para ele.
- **"Um alerta que ninguém vê é um alerta que não existe"** (`Sidebar.tsx:33-35`): nenhum badge pode
  desaparecer na reorganização.
- **Sem ícones.** O menu nunca teve; não serve às 3 dores. YAGNI.
- **Duas camadas, só duas:** menu = seções · SubNav = telas da seção.
- `npm run lint && npm run typecheck && npm test && npm run format:check` antes de cada commit.
- O `main` é protegido: a entrega vai por PR (`gh pr create --base main --head develop`).

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/ui/navegacao.ts` (criar) | O mapa (grupos/itens/hrefs) + `menuDoPapel(papel, badges)`. Puro. |
| `src/tests/ui/navegacao.test.ts` (criar) | A regra por papel, sem DOM |
| `src/components/Sidebar.tsx` (modificar) | Só render: consome `menuDoPapel` |
| `src/app/(app)/layout.tsx:40-47` (modificar) | Passa as 4 contagens separadas (hoje o Sidebar soma) |
| `src/app/(app)/obrigacoes/page.tsx` (modificar) | + SubNav (Calendário · Riscos · Escalonamento · Conformidade) |
| `src/app/(app)/tarefas/page.tsx` (modificar) | + SubNav (Painel · Recorrências) |
| `src/app/(app)/solicitacoes/page.tsx` (modificar) | + SubNav (Do portal · Internas) |
| `src/app/(app)/onboarding/page.tsx` (modificar) | + SubNav (Processos · Alertas) |
| `src/app/(app)/clientes/page.tsx` (modificar) | SubNav perde Obrigações/Vencimentos (viraram menu), ganha NFS-e em lote |
| `src/tests/ui/rotas-alcancaveis.test.ts` (criar) | Nenhuma rota de seção fora do menu/SubNav |

---

### Tarefa 1: O mapa do menu como dado puro

**Files:**
- Create: `src/lib/ui/navegacao.ts`
- Test: `src/tests/ui/navegacao.test.ts`

**Interfaces:**
- Consumes: `Papel` de `@/lib/tipos`; `podeCriarCliente`, `podeAtender`, `podeAtenderSolicitacoes`,
  `podeGerenciarVencimentos` de `@/lib/clientes/permissoes`; `podeGerenciarFinanceiro` de
  `@/lib/financeiro/permissoes`.
- Produces:
  ```ts
  export type ItemMenu = { href: string; label: string; badge?: number };
  export type GrupoMenu = { titulo: string | null; itens: ItemMenu[] };
  export type Badges = { onboarding: number; riscos: number; escalonamento: number; vencimentos: number };
  export function menuDoPapel(papel: Papel, badges: Badges): GrupoMenu[];
  ```
  `titulo: null` = itens soltos (Início, Configurações).

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/tests/ui/navegacao.test.ts
import { describe, it, expect } from "vitest";
import { menuDoPapel, type Badges } from "@/lib/ui/navegacao";

const ZERO: Badges = { onboarding: 0, riscos: 0, escalonamento: 0, vencimentos: 0 };
const hrefs = (papel: Parameters<typeof menuDoPapel>[0], b: Badges = ZERO) =>
  menuDoPapel(papel, b).flatMap((g) => g.itens.map((i) => i.href));
const titulos = (papel: Parameters<typeof menuDoPapel>[0]) =>
  menuDoPapel(papel, ZERO).map((g) => g.titulo);

describe("menuDoPapel", () => {
  it("admin vê todos os grupos", () => {
    expect(titulos("admin")).toEqual([null, "Operação", "Entrada", "Relacionamento", "Financeiro", null]);
  });

  it("financeiro NÃO vê o grupo Entrada — e o título não fica órfão", () => {
    expect(titulos("financeiro")).not.toContain("Entrada");
    expect(hrefs("financeiro")).not.toContain("/comercial");
    expect(hrefs("financeiro")).not.toContain("/onboarding");
  });

  it("contador não vê Financeiro (podeGerenciarFinanceiro é só admin/financeiro)", () => {
    expect(titulos("contador")).not.toContain("Financeiro");
    expect(hrefs("contador")).not.toContain("/financeiro/cadastros");
  });

  it("nenhum grupo renderizado vem vazio", () => {
    for (const papel of ["admin", "contador", "assistente", "financeiro"] as const) {
      for (const g of menuDoPapel(papel, ZERO)) {
        expect(g.itens.length).toBeGreaterThan(0);
      }
    }
  });

  it("Obrigações e Vencimentos são itens próprios — saíram de dentro de Clientes", () => {
    const h = hrefs("admin");
    expect(h).toContain("/obrigacoes");
    expect(h).toContain("/vencimentos");
  });

  it("cada badge fica no seu item, em vez de somado em Clientes", () => {
    const menu = menuDoPapel("admin", { onboarding: 2, riscos: 3, escalonamento: 1, vencimentos: 5 });
    const item = (href: string) => menu.flatMap((g) => g.itens).find((i) => i.href === href);
    expect(item("/obrigacoes")?.badge).toBe(4); // riscos + escalonamento: os dois vivem em Obrigações
    expect(item("/vencimentos")?.badge).toBe(5);
    expect(item("/onboarding")?.badge).toBe(2);
    expect(item("/clientes")?.badge).toBeUndefined(); // não soma mais o que não é dele
  });

  it("badge zero não vira bolinha vazia", () => {
    const menu = menuDoPapel("admin", ZERO);
    expect(menu.flatMap((g) => g.itens).every((i) => i.badge === undefined)).toBe(true);
  });

  it("o papel financeiro continua vendo o que já via (Clientes, Tarefas, Timesheet, Atendimento)", () => {
    const h = hrefs("financeiro");
    for (const r of ["/", "/clientes", "/tarefas", "/timesheet", "/atendimento", "/financeiro/cadastros"]) {
      expect(h).toContain(r);
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/ui/navegacao`
Expected: FAIL — `Cannot find module '@/lib/ui/navegacao'`.

- [ ] **Step 3: Implementar**

```ts
// src/lib/ui/navegacao.ts
import type { Papel } from "@/lib/tipos";
import {
  podeAtender,
  podeAtenderSolicitacoes,
  podeCriarCliente,
  podeGerenciarVencimentos,
} from "@/lib/clientes/permissoes";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";

export type ItemMenu = { href: string; label: string; badge?: number };
export type GrupoMenu = { titulo: string | null; itens: ItemMenu[] };
export type Badges = { onboarding: number; riscos: number; escalonamento: number; vencimentos: number };

// O mapa do menu é DADO, não markup: quem vê o quê é regra, e regra se testa sem DOM.
// Segue o padrão do projeto (filtroStatus.ts, busca.ts, permissoes.ts são puros e testados).
//
// Agrupado pelo que INTERAGE de fato — medido no grafo de links, não pela estrutura de
// pastas. Obrigações e Vencimentos moravam dentro de "Clientes" por falta de lugar; nada
// naquele nome sugere conformidade fiscal.
export function menuDoPapel(papel: Papel, badges: Badges): GrupoMenu[] {
  const equipe = podeCriarCliente(papel); // admin, assistente, contador
  const grupos: GrupoMenu[] = [
    { titulo: null, itens: [{ href: "/", label: "Início" }] },
    {
      titulo: "Operação",
      itens: [
        { href: "/clientes", label: "Clientes" },
        ...(equipe
          ? [{ href: "/obrigacoes", label: "Obrigações", badge: badges.riscos + badges.escalonamento }]
          : []),
        ...(podeGerenciarVencimentos(papel)
          ? [{ href: "/vencimentos", label: "Vencimentos", badge: badges.vencimentos }]
          : []),
        { href: "/tarefas", label: "Tarefas" },
        { href: "/timesheet", label: "Timesheet" },
      ],
    },
    {
      titulo: "Entrada",
      itens: equipe
        ? [
            { href: "/comercial", label: "Comercial" },
            { href: "/onboarding", label: "Onboarding", badge: badges.onboarding },
            { href: "/legalizacao", label: "Legalização" },
          ]
        : [],
    },
    {
      titulo: "Relacionamento",
      itens: [
        ...(podeAtender(papel) ? [{ href: "/atendimento", label: "Atendimento" }] : []),
        ...(podeAtenderSolicitacoes(papel) ? [{ href: "/solicitacoes", label: "Solicitações" }] : []),
        { href: "/comunicados", label: "Comunicados" },
      ],
    },
    {
      titulo: "Financeiro",
      itens: podeGerenciarFinanceiro(papel) ? [{ href: "/financeiro/cadastros", label: "Financeiro" }] : [],
    },
    {
      titulo: null,
      itens: ["admin", "assistente"].includes(papel) ? [{ href: "/configuracoes", label: "Configurações" }] : [],
    },
  ];

  return grupos
    // Um grupo sem item visível viraria um título órfão — é o que acontece com "Entrada"
    // para o papel financeiro, que não vê Comercial/Onboarding/Legalização.
    .filter((g) => g.itens.length > 0)
    // badge 0 vira undefined: bolinha vazia é ruído, não informação.
    .map((g) => ({ ...g, itens: g.itens.map((i) => ({ ...i, badge: i.badge || undefined })) }));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/ui/navegacao`
Expected: PASS (8 testes).

- [ ] **Step 5: Commitar**

```bash
npx prettier --write src/lib/ui/navegacao.ts src/tests/ui/navegacao.test.ts
git add src/lib/ui/navegacao.ts src/tests/ui/navegacao.test.ts
git commit -m "feat(nav): o mapa do menu vira dado puro, com a regra de RBAC testavel"
```

---

### Tarefa 2: O Sidebar renderiza grupos

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/app/(app)/layout.tsx:40-47`
- Test: `src/tests/ui/sidebar-render.test.tsx` (criar)

**Interfaces:**
- Consumes: `menuDoPapel(papel, badges): GrupoMenu[]` e `type Badges` de `@/lib/ui/navegacao`.
- Produces: `<Sidebar papel nome badges />` — a prop `badges` substitui as 4 props avulsas
  (`alertasOnboarding`, `riscosObrigacoes`, `escalonamento`, `vencimentos`).

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// src/tests/ui/sidebar-render.test.tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/login/actions", () => ({ sair: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/clientes" }));
import { renderToStaticMarkup } from "react-dom/server";
import { Sidebar } from "@/components/Sidebar";

const ZERO = { onboarding: 0, riscos: 0, escalonamento: 0, vencimentos: 0 };

describe("Sidebar", () => {
  it("mostra os títulos de grupo", () => {
    const html = renderToStaticMarkup(<Sidebar papel="admin" nome="Pedro" badges={ZERO} />);
    for (const t of ["Operação", "Entrada", "Relacionamento", "Financeiro"]) {
      expect(html).toContain(t);
    }
  });

  it("não mostra o grupo Entrada para o papel financeiro", () => {
    const html = renderToStaticMarkup(<Sidebar papel="financeiro" nome="Ana" badges={ZERO} />);
    expect(html).not.toContain("Entrada");
    expect(html).toContain("Financeiro");
  });

  it("cada badge aparece no seu item", () => {
    const html = renderToStaticMarkup(
      <Sidebar papel="admin" nome="Pedro" badges={{ onboarding: 2, riscos: 3, escalonamento: 1, vencimentos: 5 }} />,
    );
    expect(html).toContain(">4<"); // Obrigações: riscos + escalonamento
    expect(html).toContain(">5<"); // Vencimentos
    expect(html).toContain(">2<"); // Onboarding
  });

  it("realça a rota atual (/clientes)", () => {
    const html = renderToStaticMarkup(<Sidebar papel="admin" nome="Pedro" badges={ZERO} />);
    expect(html).toContain('aria-current="page"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/ui/sidebar-render`
Expected: FAIL — o `Sidebar` ainda não aceita `badges` e não renderiza títulos.

- [ ] **Step 3: Reescrever o Sidebar**

Troque a construção de `itens` (hoje `Sidebar.tsx:36-53`) e o `nav` (`:75-97`). **Preserve**: o
`LogoSaldo`, o nome do usuário, o `form action={sair}`, o drawer mobile e o mapa `FILHAS` (o realce de
quem chega por link antigo). O `FILHAS` encolhe: Obrigações e Vencimentos viram itens próprios, então só
sobra o que continua sem item de menu.

```tsx
  const grupos = menuDoPapel(papel, badges);

  // As rotas que não têm item próprio realçam a seção que as abriga — senão o usuário fica
  // sem referência de "onde estou". Obrigações e Vencimentos saíram daqui: agora são itens.
  const FILHAS: Record<string, string[]> = {
    "/clientes": ["/nfse/lote"],
    "/financeiro/cadastros": ["/financeiro"],
    "/configuracoes": ["/integracoes", "/usuarios", "/lgpd"],
  };

  const casa = (href: string) => {
    if (href === "/") return pathname === "/";
    if (pathname === href || pathname.startsWith(`${href}/`)) return true;
    return (FILHAS[href] ?? []).some((p) => pathname === p || pathname.startsWith(`${p}/`));
  };

  const hrefAtivo = grupos
    .flatMap((g) => g.itens.map((i) => i.href))
    .filter(casa)
    .sort((a, b) => b.length - a.length)[0];

  const nav = (
    <nav aria-label="Navegação principal" className="flex flex-col gap-4 text-sm">
      {grupos.map((g, i) => (
        <div key={g.titulo ?? `solto-${i}`} className="flex flex-col gap-1">
          {g.titulo && (
            <p className="px-3 font-mono text-[10px] font-medium uppercase tracking-wider text-mono-muted">
              {g.titulo}
            </p>
          )}
          {g.itens.map((it) => {
            const ativo = it.href === hrefAtivo;
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={ativo ? "page" : undefined}
                onClick={() => setAberto(false)}
                className={`rounded-lg px-3 py-2 transition-colors ${
                  ativo ? "bg-verde font-medium text-white" : "text-texto-claro hover:bg-tinta-2"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  {it.label}
                  {it.badge ? (
                    <span className="rounded-full bg-negativo px-1.5 text-[10px] font-semibold text-white">
                      {it.badge}
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
```

A assinatura passa a ser:

```tsx
export function Sidebar({ papel, nome, badges }: { papel: Papel; nome: string; badges: Badges }) {
```

Remova os imports das funções de permissão que saíram do `Sidebar` (agora vivem em `navegacao.ts`) e
importe `menuDoPapel` e `type Badges`.

- [ ] **Step 4: Atualizar o layout**

Em `src/app/(app)/layout.tsx`, troque as 4 props avulsas (linhas 40-47) por:

```tsx
      <Sidebar
        papel={perfil.papel}
        nome={perfil.nome}
        badges={{
          onboarding: alertasOnboarding,
          riscos: riscosObrigacoes,
          escalonamento,
          vencimentos,
        }}
      />
```

> As 4 contagens **já existem** no layout (linhas 27-30) — o Sidebar é que as somava. Não crie query nova.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/tests/ui/sidebar-render && npm test`
Expected: 4 testes novos PASS; a suíte inteira verde.

- [ ] **Step 6: Verificar e commitar**

```bash
npm run lint && npm run typecheck && npx prettier --write src/components/Sidebar.tsx "src/app/(app)/layout.tsx" src/tests/ui/sidebar-render.test.tsx && npm run format:check
git add src/components/Sidebar.tsx "src/app/(app)/layout.tsx" src/tests/ui/sidebar-render.test.tsx
git commit -m "feat(nav): menu em grupos; cada badge no seu item, sem somar o que nao e dele"
```

---

### Tarefa 3: SubNav nas seções que ficaram sem

Hoje o `SubNav` existe em 2 telas; as demais improvisam com links soltos e botões-âncora.

**Files:**
- Modify: `src/app/(app)/obrigacoes/page.tsx`, `src/app/(app)/tarefas/page.tsx`,
  `src/app/(app)/solicitacoes/page.tsx`, `src/app/(app)/onboarding/page.tsx`,
  `src/app/(app)/clientes/page.tsx`

**Interfaces:**
- Consumes: `SubNav` e `type ItemSubNav` de `@/components/ui/SubNav` — `{ href, label, badge? }`.

- [ ] **Step 1: Obrigações — o caso mais grave (Conformidade estava a 3 cliques)**

Em `src/app/(app)/obrigacoes/page.tsx`, logo abaixo do `PageHeader`:

```tsx
      <SubNav
        itens={[
          { href: "/obrigacoes", label: "Calendário" },
          { href: "/obrigacoes/riscos", label: "Riscos" },
          { href: "/obrigacoes/escalonamento", label: "Escalonamento" },
          { href: "/obrigacoes/conformidade", label: "Conformidade" },
        ]}
      />
```

Import: `import { SubNav } from "@/components/ui/SubNav";`

- [ ] **Step 2: O `<a>` cru do calendário vira Link**

Em `src/app/(app)/obrigacoes/Calendario.tsx`, os links para `/obrigacoes/riscos`, `/escalonamento` e
`/conformidade` usam `<a>` cru — perdem a navegação client-side do Next. Agora que o SubNav dá o caminho,
**remova esses três botões do calendário** (deixam de ser a única porta) e apague o import que sobrar.

Confirme antes: `grep -n "obrigacoes/\(riscos\|escalonamento\|conformidade\)" src/app/\(app\)/obrigacoes/Calendario.tsx`

- [ ] **Step 3: Tarefas, Solicitações e Onboarding**

`src/app/(app)/tarefas/page.tsx`:

```tsx
      <SubNav
        itens={[
          { href: "/tarefas", label: "Painel" },
          { href: "/tarefas/recorrencias", label: "Recorrências" },
        ]}
      />
```

`src/app/(app)/solicitacoes/page.tsx` (troca os botões-âncora que hoje alternam com as internas):

```tsx
      <SubNav
        itens={[
          { href: "/solicitacoes", label: "Do portal" },
          { href: "/solicitacoes/internas", label: "Internas" },
        ]}
      />
```

`src/app/(app)/onboarding/page.tsx` (o link solto para alertas vira chip):

```tsx
      <SubNav
        itens={[
          { href: "/onboarding", label: "Processos" },
          { href: "/onboarding/alertas", label: "Alertas", badge: alertas },
        ]}
      />
```

> Se a página não tiver a contagem `alertas` à mão, use `{ href: "/onboarding/alertas", label: "Alertas" }`
> sem badge — **não** invente uma query nova nesta tarefa.

- [ ] **Step 4: Clientes — o SubNav muda de conteúdo**

Em `src/app/(app)/clientes/page.tsx`, o SubNav hoje tem Obrigações, Escalonamento e Vencimentos — os três
**saíram para o menu**. Troque por:

```tsx
  const secoes: ItemSubNav[] = [
    { href: "/clientes", label: "Lista" },
    ...(podeGerenciarResponsaveis(perfil?.papel)
      ? [{ href: "/clientes/responsaveis", label: "Responsáveis" }]
      : []),
    ...(podeVerHonorario(perfil?.papel) ? [{ href: "/nfse/lote", label: "NFS-e em lote" }] : []),
  ];
```

E **remova os botões** de "Responsáveis por departamento" e "Emitir NFS-e em lote" das `acoes` do
`PageHeader` (linhas ~75-83): viraram chips do SubNav, e ter os dois seria a sexta forma de navegar.
Mantenha `BotaoExportar` e "Novo cliente" — são ações, não navegação.

As contagens `contarRiscos()`, `contarEscalonamento()` e `contarVencimentos()` que a página fazia só para
o SubNav agora são do menu: **remova-as desta página** (o layout já as calcula) junto com os imports.

- [ ] **Step 5: Verificar e commitar**

```bash
npm run lint && npm run typecheck && npm test && npx prettier --write "src/app/(app)" && npm run format:check
git add -A
git commit -m "feat(nav): SubNav vira o padrao unico de navegacao secundaria"
```
Expected: suíte verde. Se `clientes-render` ou `obrigacoes/*-render` quebrarem por causa dos botões
removidos, **atualize a asserção** (o botão virou chip) — não recrie o botão.

---

### Tarefa 4: O teste que impede a dor nº 2 de voltar

**Files:**
- Create: `src/tests/ui/rotas-alcancaveis.test.ts`

**Interfaces:**
- Consumes: `menuDoPapel` de `@/lib/ui/navegacao`.

- [ ] **Step 1: Escrever o teste**

```ts
// src/tests/ui/rotas-alcancaveis.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { menuDoPapel } from "@/lib/ui/navegacao";

// Havia 11 rotas fora do menu — Conformidade estava a 3 cliques dentro de "Clientes", e o
// único caminho era um <a> cru no meio de um calendário. Este teste existe para essa dor não
// voltar sozinha: toda rota de TOPO de seção precisa estar no menu ou num SubNav declarado.
const RAIZ = resolve(process.cwd(), "src/app/(app)");

const rotas = (dir: string, prefixo = ""): string[] => {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (!statSync(caminho).isDirectory()) continue;
    if (nome.startsWith("[")) continue; // rota dinâmica: detalhe, não seção
    const rota = `${prefixo}/${nome}`;
    if (readdirSync(caminho).includes("page.tsx")) saida.push(rota);
    saida.push(...rotas(caminho, rota));
  }
  return saida;
};

// As rotas alcançáveis por SubNav (declaradas nas telas de seção) e por hub.
const POR_SUBNAV = [
  "/obrigacoes/riscos",
  "/obrigacoes/escalonamento",
  "/obrigacoes/conformidade",
  "/tarefas/recorrencias",
  "/solicitacoes/internas",
  "/onboarding/alertas",
  "/clientes/responsaveis",
  "/nfse/lote",
  "/comercial/propostas",
  "/comercial/metricas",
];
// Financeiro e Configurações mantêm hub (16 telas cada): explodir no menu somaria 32 itens.
const POR_HUB = ["/financeiro", "/configuracoes", "/usuarios", "/lgpd", "/integracoes"];
// Telas que existem por fluxo, não por navegação (criar/editar a partir de um botão).
const POR_ACAO = ["/clientes/novo", "/clientes/nova-empresa", "/comunicados/novo"];

describe("nenhuma rota de seção fica órfã", () => {
  const noMenu = menuDoPapel("admin", { onboarding: 0, riscos: 0, escalonamento: 0, vencimentos: 0 })
    .flatMap((g) => g.itens.map((i) => i.href));

  it("toda rota é alcançável pelo menu, por SubNav, por hub ou por ação", () => {
    const orfas = rotas(RAIZ).filter((r) => {
      if (noMenu.includes(r)) return false;
      if (POR_SUBNAV.includes(r) || POR_ACAO.includes(r)) return false;
      if (POR_HUB.some((h) => r === h || r.startsWith(`${h}/`))) return false;
      return true;
    });
    expect(orfas).toEqual([]);
  });

  it("as rotas do menu existem de verdade (nada de link morto)", () => {
    const existentes = rotas(RAIZ);
    for (const href of noMenu) {
      if (href === "/") continue;
      expect(existentes).toContain(href);
    }
  });

  it("o SubNav declarado aponta para telas que existem", () => {
    const existentes = rotas(RAIZ);
    for (const r of POR_SUBNAV) expect(existentes).toContain(r);
  });
});
```

- [ ] **Step 2: Rodar**

Run: `npx vitest run src/tests/ui/rotas-alcancaveis`
Expected: PASS. **Se falhar listando rotas**, leia a lista: cada uma é uma tela que ninguém alcança.
Decida caso a caso — entra no menu, entra num SubNav, ou é ação/hub e vai para a lista correspondente.
**Não** relaxe o teste para ele passar.

- [ ] **Step 3: Commitar**

```bash
npx prettier --write src/tests/ui/rotas-alcancaveis.test.ts
git add src/tests/ui/rotas-alcancaveis.test.ts
git commit -m "test(nav): trava a dor — nenhuma tela pode ficar sem caminho ate ela"
```

---

### Tarefa 5: Documentar e entregar

**Files:**
- Modify: `docs/design/saldo-ui.md`, `docs/DOCUMENTACAO.md`, `CHANGELOG.md`

- [ ] **Step 1: A regra de navegação no guia**

Em `docs/design/saldo-ui.md`, na seção `Abas × SubNav`, acrescente:

```markdown
## Navegação: duas camadas, só duas

- **Menu lateral** = seções, agrupadas por afinidade (Operação · Entrada · Relacionamento · Financeiro).
  O mapa é dado puro em `src/lib/ui/navegacao.ts` — quem vê o quê é regra, testada sem DOM.
- **SubNav** = as telas de uma seção.
- **Hub** (grid de cards) só onde a seção tem muitas telas de peso parecido: Financeiro e Configurações,
  16 cada.
- Um grupo **não é renderizado** sem item visível (o papel `financeiro` não vê "Entrada").
- **Nada de sexta forma:** links "← voltar" soltos e botões-âncora imitando abas não entram em tela nova.
```

- [ ] **Step 2: O menu novo na documentação**

Em `docs/DOCUMENTACAO.md`, seção "Papéis e permissões (RBAC)", registre o menu por papel e a regra do
grupo vazio. Deixe explícito que **as permissões não mudaram** nesta fatia — só a organização.

- [ ] **Step 3: CHANGELOG**

Em `[Não lançado]`, acrescente ao bloco do redesign: menu em 4 grupos; as 11 órfãs alcançáveis;
Conformidade de 3 para 2 cliques, no lugar certo; badges separados por item.

- [ ] **Step 4: Entregar por PR**

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run format:check
npx prettier --write docs/ CHANGELOG.md
git add -A && git commit -m "docs: navegacao em duas camadas e o menu por papel"
git push origin develop
gh pr create --base main --head develop --title "feat(nav): fatia 2 — menu em grupos e fim das rotas orfas"
gh pr checks --watch
gh pr merge --merge
```

---

## Encerramento

- [ ] **Avaliação humana:** peça ao Pedro que abra o app no dev e confira o menu — em especial que
      "Obrigações" e "Vencimentos" agora são itens próprios e que os badges batem com o que ele via somado
      em Clientes.
- [ ] Fatia 3 (se houver): unificar `<Voltar>` × "← voltar" (~28 telas), migrar os ~55 `amber`, as ~10
      cópias divergentes do `inputCls` (uma com colisão de nome em `EmitirNfseCliente.tsx:6`) e o `<main>`
      aninhado.
