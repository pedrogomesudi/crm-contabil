# Fatia 4 — Os controles de formulário — Plano

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.
> Spec: `docs/superpowers/specs/2026-07-17-fatia-4-controles-design.md`.

**Objetivo:** o `inputCls` vira `controleCls(tamanho)`, perde o `w-full`, ganha um degrau compacto — e os
67 controles que hoje escrevem a classe à mão passam a usá-lo.

**Arquitetura:** uma função com tipo literal substitui a constante. O padding é o único eixo que varia
(`padrao` / `compacto`); largura sai do token e vira decisão do contexto. As 5 famílias medidas migram em
tarefas separadas, agrupadas por **risco visual**: A+B+w-full não mudam nada (ou quase), C+D+E mudam.

**Stack:** Next.js 16 (App Router), Tailwind 4 (CSS-first, `@theme`), TypeScript, vitest.

## Global Constraints

- **Nenhuma mudança de comportamento.** Preservar `name`/`value`/`onChange`/actions, `aria-*`, `role`,
  labels associadas, `type`, `required`, `min`/`max`/`step`, `defaultValue`, `placeholder`, `title`.
- **Escopo:** `src/app/(app)/**` e `src/components/**`. **O portal (`src/app/(portal)/**`) fica de fora.**
- **Migrar `<input>` → `<Input>` está FORA desta fatia** (é a fatia 5). Aqui os controles seguem crus.
- **O prop `tamanho` NÃO nasce aqui** — elemento cru não tem prop. O degrau é a função.
- **Checkbox e radio não entram** — têm estilo próprio, não passam pelo token.
- **O `main` é protegido:** entrega por PR de `develop`, com o job `verify` verde.
- **O merge NÃO publica.** Deploy é o botão **Implantar** no EasyPanel; confirmar em
  `https://app.seusaldo.ai/api/health`. A tag vem depois do health.
- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`,
  `npm run build`.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/components/ui/Campo.tsx` | **Modificar** — `inputCls` sai, `controleCls(tamanho)` entra | 1 |
| `src/tests/ui/controles-render.test.tsx` | **Modificar** — testa os dois degraus | 1 |
| `src/components/ui/{Input,Select,Textarea}.tsx` | **Modificar** — usam `controleCls()`; perdem `w-full` | 1 |
| 12 arquivos que importam `inputCls` | **Modificar** — `controleCls()` + `w-full` explícito | 2 |
| 5 arquivos da família A + 7 da B | **Modificar** — passam a importar o token | 3 |
| 5 arquivos das famílias C e D | **Modificar** — idem, **com mudança visual** | 4 |
| 3 arquivos da família E | **Modificar** — conforme a decisão por tela | 5 |
| `src/tests/ui/divida-ui.test.ts` | **Modificar** — + o guard do controle | 6 |
| `docs/design/saldo-ui.md`, `CHANGELOG.md` | **Modificar** | 7 |

---

### Task 1: `controleCls(tamanho)` nasce

**Files:**
- Modify: `src/components/ui/Campo.tsx:1-3`
- Modify: `src/components/ui/Input.tsx`, `src/components/ui/Select.tsx`, `src/components/ui/Textarea.tsx`
- Test: `src/tests/ui/controles-render.test.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: `controleCls(tamanho?: "padrao" | "compacto"): string` — exportada de
  `@/components/ui/Campo`. **Não contém `w-full`.** Todas as tarefas seguintes a consomem.
- **O `inputCls` continua existindo** ao fim desta tarefa (a Task 2 o remove). Os dois coexistem por um
  commit: é o que mantém esta tarefa verde sem arrastar os 12 arquivos de tela para dentro dela.

- [ ] **Step 1: Escrever o teste que falha**

Substituir o conteúdo de `src/tests/ui/controles-render.test.tsx` por:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { controleCls } from "@/components/ui/Campo";

describe("controleCls", () => {
  it("os dois degraus diferem SÓ no padding", () => {
    const padrao = controleCls().split(" ").filter((c) => !c.startsWith("px-") && !c.startsWith("py-"));
    const compacto = controleCls("compacto").split(" ").filter((c) => !c.startsWith("px-") && !c.startsWith("py-"));
    expect(padrao.sort()).toEqual(compacto.sort());
  });

  it("padrão é px-3 py-2; compacto é px-2 py-1.5", () => {
    expect(controleCls()).toContain("px-3");
    expect(controleCls()).toContain("py-2");
    expect(controleCls("compacto")).toContain("px-2");
    expect(controleCls("compacto")).toContain("py-1.5");
  });

  it("sem argumento é o padrão", () => {
    expect(controleCls()).toBe(controleCls("padrao"));
  });

  // A razão de existir da fatia 4: o token respondia "como se parece" E "quanto ocupa".
  // A largura é do contexto (FormGrid, ou w-full declarado), não do controle.
  it("NENHUM degrau carrega largura", () => {
    for (const cls of [controleCls(), controleCls("compacto")]) {
      expect(cls).not.toContain("w-full");
      expect(cls.split(" ").filter((c) => /^w-/.test(c))).toEqual([]);
    }
  });

  it("os dois trazem a aparência inteira do controle", () => {
    for (const cls of [controleCls(), controleCls("compacto")]) {
      // bg-white não é enfeite: o preflight do Tailwind força background-color:transparent
      // em input/select/textarea, então sem ele o controle mostra o creme da página.
      for (const c of ["rounded-lg", "border", "border-linha", "bg-white", "text-sm", "text-texto", "focus:border-verde"]) {
        expect(cls).toContain(c);
      }
    }
  });
});

describe("Input/Select/Textarea", () => {
  it("os três usam o degrau padrão", () => {
    expect(renderToStaticMarkup(<Input name="a" />)).toContain(controleCls());
    expect(renderToStaticMarkup(<Select name="b" />)).toContain(controleCls());
    expect(renderToStaticMarkup(<Textarea name="c" />)).toContain(controleCls());
  });

  it("className extra continua sendo somada, não substituindo", () => {
    expect(renderToStaticMarkup(<Input name="a" className="tabular-nums" />)).toContain("tabular-nums");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/ui/controles-render.test.tsx`
Expected: FAIL — `controleCls is not a function` (ainda não existe).

- [ ] **Step 3: Implementar**

Em `src/components/ui/Campo.tsx`, trocar as linhas 1–3 por:

```tsx
// A aparência do controle de formulário (SALDO) — input, select e textarea.
// NÃO carrega largura: isso é do contexto (o FormGrid, ou um w-full declarado). O `inputCls`
// antigo carregava `w-full`, e era por isso que 47 dos 80 controles do sistema não podiam usá-lo.
const BASE =
  "rounded-lg border border-linha bg-white text-sm text-texto placeholder:text-cinza-claro focus:border-verde";

// Único eixo que varia. O compacto não é divergência: é o tamanho que 14 controles usam em
// contexto denso (kanban, linha de tabela, grade). Fingir que só existe um degrau foi o que
// produziu as 5 famílias de classe copiada.
const PADDING = {
  padrao: "px-3 py-2",
  compacto: "px-2 py-1.5",
} as const;

export function controleCls(tamanho: keyof typeof PADDING = "padrao"): string {
  return `${BASE} ${PADDING[tamanho]}`;
}
```

**Manter** a constante `inputCls` logo abaixo, intacta, e a função `Campo` como está. O `inputCls` só
morre na Task 2 — os 12 arquivos de tela ainda dependem dele, e derrubá-lo aqui arrastaria todos eles
para dentro desta tarefa.

- [ ] **Step 4: Apontar os três componentes para o degrau padrão**

Sem isto o teste desta tarefa fica vermelho, e tarefa não fecha vermelha.

`src/components/ui/Input.tsx`:
```tsx
import type { InputHTMLAttributes } from "react";
import { controleCls } from "@/components/ui/Campo";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controleCls()} ${className}`} />;
}
```

`src/components/ui/Select.tsx`:
```tsx
import type { SelectHTMLAttributes } from "react";
import { controleCls } from "@/components/ui/Campo";

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  // controleCls inclui placeholder:text-cinza-claro, que não tem efeito aqui
  // (o pseudo-elemento ::placeholder só funciona em <input> e <textarea>).
  // Mantemos a classe completa para preservar a fonte única; é o preço aceito.
  return <select {...props} className={`${controleCls()} ${className}`} />;
}
```

`src/components/ui/Textarea.tsx`: mesma troca — o import passa a ser
`import { controleCls } from "@/components/ui/Campo";` e o uso vira `` `${controleCls()} ${className}` ``.

> Os três **perdem o `w-full`** e não o recuperam: são layout-neutros como o token. **Nenhuma tela muda —
> o uso deles em produção é zero** (os 5 usos que existem são dentro destes próprios testes).

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/ui/controles-render.test.tsx`
Expected: **PASS (todos)**.

- [ ] **Step 6: Provar por sabotagem que o teste da largura morde**

Trocar temporariamente o `const BASE` para incluir `w-full`:
```
const BASE = "w-full rounded-lg border border-linha bg-white text-sm text-texto placeholder:text-cinza-claro focus:border-verde";
```
Run: `npx vitest run src/tests/ui/controles-render.test.tsx -t "NENHUM degrau carrega largura"`
Expected: **FAIL**. Se passar, o teste é cego — conserte antes de seguir.
Depois **reverta** o `w-full`.

- [ ] **Step 7: Verificação completa**

```bash
npm run lint && npm run typecheck && npx vitest run && npm run build
```
Expected: tudo verde, 691+ testes. A suíte inteira, não só o arquivo — os três componentes mudaram.

- [ ] **Step 8: Commit**

```bash
npm run format
git add src/components/ui/Campo.tsx src/components/ui/Input.tsx src/components/ui/Select.tsx src/components/ui/Textarea.tsx src/tests/ui/controles-render.test.tsx
git commit -m "feat(ui): controleCls(tamanho) — dois degraus, sem largura"
```

---

### Task 2: `inputCls` morre; os 74 ganham `w-full` explícito

**Files:**
- Modify: `src/components/ui/Campo.tsx` (remover o `inputCls`)
- Modify: os 9 arquivos de tela que importam `inputCls` (lista abaixo)

**Interfaces:**
- Consumes: `controleCls(tamanho?)` da Task 1.
- Produces: `inputCls` deixa de existir. Nenhuma tarefa seguinte pode usá-lo.

**Contexto:** 78 usos de `inputCls`. **74** herdam o `w-full` sem pedir → ganham `w-full` explícito.
**1** já pede (`EmitirNfseCliente`) → nada muda. **3** eram as definições dos componentes → já migradas
na Task 1, sem `w-full`.

O resultado é **pixel-idêntico**. O valor é que a largura passa a ser declarada.

- [ ] **Step 1: Migrar os 9 arquivos de tela**

Em cada um: trocar o import `{ inputCls }` por `{ controleCls }` e cada uso por
`` `${controleCls()} w-full` `` — **somando `w-full`**, porque o token não o traz mais.

| Arquivo | Usos |
|---|---|
| `src/components/FormCliente.tsx` | 26 |
| `src/app/(app)/configuracoes/nfse/Formularios.tsx` | 12 |
| `src/components/nfse/EmitirNfseCliente.tsx` | 12 (1 já pede `w-full`: não duplicar) |
| `src/app/(app)/configuracoes/boletos/FormBoletos.tsx` | 9 |
| `src/components/HonorarioForm.tsx` | 7 |
| `src/components/ConviteForm.tsx` | 3 |
| `src/components/financeiro/CadastroCrud.tsx` | 3 |
| `src/components/documentos/UploadDocumento.tsx` | 2 |
| `src/app/(app)/financeiro/orcamento/GradeOrcamento.tsx` | 1 |

Formas encontradas e o que vira:

| Antes | Depois |
|---|---|
| `className={inputCls}` | ``className={`${controleCls()} w-full`}`` |
| ``className={`${inputCls} algo`}`` | ``className={`${controleCls()} w-full algo`}`` |
| ``className={`${inputCls} w-full`}`` (o de `EmitirNfseCliente`) | ``className={`${controleCls()} w-full`}`` |

> **`CadastroCrud.tsx` é `"use client"`** — o import vai **abaixo** da diretiva. Colar acima rebaixa o
> `"use client"` a expressão solta e desliga o client component. Foi um bug real da fatia 3.

- [ ] **Step 2: Remover o `inputCls` do `Campo.tsx`**

Apagar as duas linhas da constante antiga (o comentário `// Classe padrão dos controles...` e o
`export const inputCls = "...";`). O `typecheck` acusa qualquer import esquecido — não há import dinâmico
neste projeto.

- [ ] **Step 3: Verificar**

```bash
grep -rn "inputCls" src/   # esperado: nenhuma ocorrência
npm run typecheck          # esperado: limpo
npx vitest run             # esperado: 691 passando
```

Confirmar também que **nenhum arquivo perdeu o `w-full`**:
```bash
grep -rc "controleCls()" src/ | grep -v ':0'
# em cada arquivo de tela, todo controleCls() deve estar acompanhado de w-full
grep -rn "controleCls()" src/ | grep -v "w-full" | grep -v "ui/Input\|ui/Select\|ui/Textarea\|ui/Campo\|tests/"
# esperado: vazio (só os 3 componentes e o Campo podem não ter w-full)
```

- [ ] **Step 4: `format` e `build`**

```bash
npm run format && npm run lint && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(ui): inputCls vira controleCls(); a largura passa a ser declarada"
```

---

### Task 3: Famílias A e B — 31 controles passam a usar o token

**Files:** os 12 arquivos abaixo.

**Interfaces:**
- Consumes: `controleCls(tamanho?)` da Task 1.
- Produces: nada de novo.

**Família A (17) — `px-3 py-2`, o degrau padrão:**

| Arquivo | Nº | String de hoje | Vira |
|---|---|---|---|
| `src/components/nfse/EmitenteConfig.tsx` | 11 | `mt-1 w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto focus:border-verde` | ``{`${controleCls()} mt-1 w-full`}`` |
| `src/components/nfse/EmitenteConfig.tsx` | 1 | `mt-1 rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto focus:border-verde` | ``{`${controleCls()} mt-1`}`` |
| `src/app/(app)/usuarios/page.tsx` | 3 | `rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto focus:border-verde` | `{controleCls()}` |
| `src/components/auth/CampoTexto.tsx` | 1 | `w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto placeholder:text-cinza-claro focus:border-verde` | ``{`${controleCls()} w-full`}`` |
| `src/app/(app)/vencimentos/page.tsx:89` | 1 | `rounded-lg border border-linha px-3 py-2 text-sm text-texto` | `{controleCls()}` — **ganha `bg-white` e `focus:border-verde`** |

> Os 3 de `usuarios/page.tsx` **não têm `w-full` hoje e não ganham**: são campos que não ocupam a linha
> inteira. Foi um dos "5 sem `w-full`" que a fatia 3 achou e interpretou como divergência — não era.

**Família B (14) — `px-2 py-1.5`, o degrau compacto:**

| Arquivo | Nº |
|---|---|
| `src/app/(app)/tarefas/PainelTarefas.tsx` | 4 |
| `src/app/(app)/clientes/responsaveis/RedistribuicaoCarteira.tsx` | 3 |
| `src/app/(app)/clientes/nova-empresa/FormConstituicao.tsx` | 2 |
| `src/app/(app)/financeiro/rentabilidade/page.tsx` | 2 |
| `src/app/(app)/legalizacao/PainelLegalizacao.tsx` | 2 |
| `src/app/(app)/configuracoes/marca/FormSla.tsx` | 1 |

| String de hoje | Nº | Vira |
|---|---|---|
| `mt-0.5 block rounded-lg border border-linha px-2 py-1.5 text-sm` | 12 | ``{`${controleCls("compacto")} mt-0.5 block`}`` |
| `mt-0.5 block w-28 rounded-lg border border-linha px-2 py-1.5 text-sm` | 1 | ``{`${controleCls("compacto")} mt-0.5 block w-28`}`` |
| `mt-0.5 block w-full rounded-lg border border-linha px-2 py-1.5 text-sm` | 1 | ``{`${controleCls("compacto")} mt-0.5 block w-full`}`` |

> **A família B MUDA na tela**, ao contrário do que a primeira versão da spec dizia. Ela não tem
> `bg-white`, `text-texto` nem `focus:border-verde` — e ganha os três. O `bg-white` é o que se vê: o
> preflight do Tailwind força `background-color: transparent` em `input`/`select`/`textarea`
> (`node_modules/tailwindcss/preflight.css:250`), então **esses 14 controles são transparentes hoje** e
> mostram o creme da página. Vão ficar brancos, como todo controle do sistema. **É a mudança de maior
> alcance da fatia** — kanban, grade e linha de tabela.

- [ ] **Step 1: Migrar a família A** (5 arquivos, 17 controles), conforme a tabela.
- [ ] **Step 2: Migrar a família B** (6 arquivos, 14 controles), conforme a tabela.
- [ ] **Step 3: Verificar**

```bash
npm run typecheck && npm run lint && npx vitest run && npm run build
grep -rn "px-2 py-1.5\|px-3 py-2" src/app src/components | grep -E "<input|<select|<textarea" 
# esperado: vazio — nenhum controle escreve mais o padding à mão
```

- [ ] **Step 4: Conferir na tela** — subir `npm run dev` e abrir `/tarefas` (kanban) e
  `/financeiro/rentabilidade`. Os controles compactos devem estar **brancos**, não creme.

- [ ] **Step 5: `format` e commit**

```bash
npm run format
git add -A
git commit -m "refactor(ui): familias A e B usam o token — 31 controles"
```

---

### Task 4: Famílias C e D — 26 controles, com mudança visual

**Files:** 5 arquivos.

**Interfaces:**
- Consumes: `controleCls(tamanho?)` da Task 1.
- Produces: nada de novo.

**Família C (17) — `rounded` (4px) em vez de `rounded-lg` (8px):**

| Arquivo | Nº | String de hoje | Vira |
|---|---|---|---|
| `src/components/financeiro/ContasPagar.tsx` | 11 | `rounded border border-linha p-2` | `{controleCls()}` |
| `src/components/financeiro/ContasReceber.tsx` | 4 | `rounded border border-linha p-2` | `{controleCls()}` |
| `src/components/nfse/EmitirNfse.tsx` | 1 | `ml-2 w-32 rounded border border-linha px-2 py-1` | ``{`${controleCls("compacto")} ml-2 w-32`}`` |
| `src/components/nfse/EmitirNfse.tsx` | 1 | `ml-2 w-64 rounded border border-linha px-2 py-1` | ``{`${controleCls("compacto")} ml-2 w-64`}`` |

**Família D (9) — `border` SEM cor:**

| Arquivo | Nº | String de hoje | Vira |
|---|---|---|---|
| `src/components/assinatura/EnviarAssinatura.tsx` | 8 | `w-full rounded border px-2 py-1` | ``{`${controleCls("compacto")} w-full`}`` |
| `src/components/contrato/GerarContrato.tsx` | 1 | `rounded border px-3 py-2` | `{controleCls()}` |

> **A família D provavelmente já está errada na tela.** `border` sem cor usa `currentColor` — a borda
> herda a cor do texto. **Confirmar antes de migrar** (Step 1), não presumir: se estiver visivelmente
> errada, isso é um **bug corrigido** e vai para o CHANGELOG como tal.

- [ ] **Step 1: Confirmar o defeito da família D — antes de mexer**

Subir `npm run dev`, abrir a tela de envio para assinatura e **olhar a cor da borda dos 8 campos**.
Registrar o que se vê (borda escura/preta = `currentColor` confirmado; borda cinza clara = o navegador
está aplicando outro padrão). O que for observado entra no commit e no CHANGELOG — **o texto depende do
que a tela mostrar**, não do que se espera.

- [ ] **Step 2: Migrar a família C** (3 arquivos, 17 controles), conforme a tabela.
- [ ] **Step 3: Migrar a família D** (2 arquivos, 9 controles), conforme a tabela.
- [ ] **Step 4: Verificar**

```bash
npm run typecheck && npm run lint && npx vitest run && npm run build
grep -rnE '<(input|select|textarea)[^>]*className="[^"]*\brounded\b' src/app src/components
# esperado: vazio — nenhum controle usa mais `rounded` (4px)
```

- [ ] **Step 5: Conferir na tela** — os campos de Contas a Pagar/Receber com canto de 8px, e os da
  assinatura com `border-linha`.

- [ ] **Step 6: `format` e commit** (ajustar a mensagem ao que o Step 1 observou)

```bash
npm run format
git add -A
git commit -m "refactor(ui): familias C e D usam o token — canto de 8px e borda com cor"
```

---

### Task 5: Família E — os 10 que exigiram olhar a tela

**Files:** 3 arquivos.

**Interfaces:**
- Consumes: `controleCls(tamanho?)` da Task 1.
- Produces: nada de novo.

Decidido pelo Pedro em 17/07, caso a caso (spec, seção "As famílias"):

| Arquivo | Nº | String de hoje | Vira | Por quê |
|---|---|---|---|---|
| `src/components/financeiro/ContratosSection.tsx` | 4 | `rounded-lg border border-linha p-2 text-sm` | `{controleCls("compacto")}` | Form embutido e denso (`grid-cols-2 gap-2`, rótulo `text-xs`). `p-2`=8px → 8px/6px: quase idêntico. |
| `src/components/financeiro/ContratosSection.tsx:88` | 1 | `w-16 rounded-lg border border-linha p-1` | ``{`${controleCls("compacto")} w-16`}`` | Mês do 13º. Mantém a largura; passa a alinhar com o rótulo ao lado. |
| `src/app/(app)/vencimentos/page.tsx` | 2 (`<select>`) | `rounded-lg border border-linha px-2 text-sm text-texto` | `{controleCls()}` | **Conserto.** Estão numa barra `flex` com o input "Buscar cliente" (`px-3 py-2`); sem `py`, a altura vem do controle nativo e não bate. |
| `src/app/(app)/configuracoes/whatsapp/Formularios.tsx` | 3 | `mt-1 w-full rounded-lg border border-linha bg-white p-2 text-sm text-texto focus:border-verde` | ``{`${controleCls()} mt-1 w-full`}`` | Já era o padrão em tudo menos no atalho do padding. |

- [ ] **Step 1: Migrar os 3 arquivos** conforme a tabela.
- [ ] **Step 2: Verificar**

```bash
npm run typecheck && npm run lint && npx vitest run && npm run build
```

- [ ] **Step 3: Conferir a barra do `/vencimentos`** — é a única mudança de **altura** da fatia. Os três
  controles (input + 2 selects) devem ficar **da mesma altura**. Se não ficarem, o degrau padrão não é a
  resposta e o caso volta para o Pedro.

- [ ] **Step 4: `format` e commit**

```bash
npm run format
git add -A
git commit -m "refactor(ui): familia E — os 10 casos decididos por tela"
```

---

### Task 6: O guard — nenhum controle escreve a própria borda

**Files:**
- Modify: `src/tests/ui/divida-ui.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Escrever o guard**

Acrescentar ao fim de `src/tests/ui/divida-ui.test.ts`:

```ts
describe("o controle não escreve a própria borda", () => {
  // A quinta dívida: 80 controles com className literal, em 5 famílias — px-3 py-2 e px-2 py-1.5
  // (dois degraus reais), rounded de 4px, border sem cor, e padding em atalho. Todas nasceram do
  // mesmo jeito: o token respondia "como se parece" E "quanto ocupa", então quem precisava de outra
  // largura copiava a string e a alterava.
  //
  // A regra pega as cinco de uma vez: todas escrevem `border` à mão num controle.
  const CONTROLE_COM_BORDA = /<(input|select|textarea)\b[^>]*className="[^"]*\bborder\b[^"]*"/;

  it("nenhum <input|select|textarea> cru declara `border` na className", () => {
    const infratores = ESCOPO.filter((p) => !rel(p).startsWith("src/components/ui/")).filter((p) =>
      CONTROLE_COM_BORDA.test(fonte(p)),
    );
    expect(infratores.map(rel)).toEqual([]);
  });
});
```

> **O limite desta regra, declarado:** ela **não** força o uso do componente `<Input>`. Isso é a fatia 5.
> Enquanto ela não vier, o sistema tem ~200 controles crus e a regra só garante que eles usam o token —
> não que deviam ser crus. Medida do que falta: `grep -c '<input ' -r src/`.

- [ ] **Step 2: Rodar — deve passar**

Run: `npx vitest run src/tests/ui/divida-ui.test.ts`
Expected: PASS (as Tasks 2–5 já limparam tudo).

- [ ] **Step 3: Sabotar com formas que NÃO foram desenhadas**

Este é o passo que a fatia 3 errou: sabotar com o que se tem em mente prova só que o guard pega o que foi
escrito. Cada linha abaixo cria um arquivo, roda, apaga.

```bash
cd /Users/pedrogomes/crm-contabil
prova() { printf '%s' "$2" > "$1"; r=$(npx vitest run src/tests/ui/divida-ui.test.ts -t "declara .border." 2>&1 | grep -cE "× "); rm -f "$1"; [ "$r" -ge 1 ] && echo "MORDEU   $3" || echo "!! FURO !!  $3"; }

prova src/components/__s.tsx 'export const X = () => <input className="rounded border px-2 py-1" />;' "familia D (border sem cor)"
prova src/components/__s.tsx 'export const X = () => <input className="rounded-lg border border-linha p-2" />;' "familia C/E (atalho)"
prova src/components/__s.tsx 'export const X = () => <select className="border-2 border-verde px-2" />;' "borda grossa, cor da marca"
prova src/components/__s.tsx 'export const X = () => <textarea className="border-b border-linha" />;' "so borda de baixo"
prova src/components/__s.tsx 'export const X = () => <input
  type="text"
  className="rounded border px-2"
/>;' "atributos em varias linhas"
```

Expected: **MORDEU** nas cinco. Um `!! FURO !!` significa guard cego — conserte antes de seguir.

- [ ] **Step 4: Provar que os falsos positivos NÃO mordem**

```bash
prova2() { printf '%s' "$2" > "$1"; r=$(npx vitest run src/tests/ui/divida-ui.test.ts -t "declara .border." 2>&1 | grep -cE "× "); rm -f "$1"; [ "$r" -eq 0 ] && echo "ignorou (ok)  $3" || echo "!! RUIDO !!   $3"; }

prova2 src/components/__s.tsx 'export const X = () => <input type="checkbox" className="size-4 accent-verde" />;' "checkbox (nao tem border)"
prova2 src/components/__s.tsx 'import { controleCls } from "@/components/ui/Campo";
export const X = () => <input className={controleCls()} />;' "quem USA o token"
prova2 src/components/__s.tsx 'export const X = () => <div className="rounded border border-linha p-2">nao e controle</div>;' "<div> com borda"
```

Expected: **ignorou (ok)** nas três.

- [ ] **Step 5: Commit**

```bash
git add src/tests/ui/divida-ui.test.ts
git commit -m "test(ui): trava a quinta divida — o controle nao escreve a propria borda"
```

---

### Task 7: Documentar e entregar

**Files:**
- Modify: `docs/design/saldo-ui.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: `saldo-ui.md` — a seção do controle**

Substituir, na seção "Blocos de construção", a frase
*"`inputCls` é a **fonte única** da classe dos controles — era a mesma string copiada em 4 arquivos"*
por uma seção nova, antes de "Escape hatch é prop, nunca `className`":

```markdown
## Controle: dois degraus, e a largura não é dele

`controleCls(tamanho)` — `padrao` (`px-3 py-2`) e `compacto` (`px-2 py-1.5`). Diferem **só no padding**;
o resto (`rounded-lg border border-linha bg-white text-sm text-texto placeholder:text-cinza-claro
focus:border-verde`) é idêntico.

- **Compacto** é para contexto denso: kanban, linha de tabela, grade embutida.
- **Nenhum dos dois carrega largura.** Quem precisa declara `w-full` (ou deixa o `FormGrid` resolver).
  O `inputCls` antigo carregava `w-full` — misturava "como se parece" com "quanto ocupa", e era por isso
  que **47 dos 80 controles do sistema não podiam usá-lo** e copiavam a string alterada. Deu 5 famílias.
- Largura por `className` é **segura** (não briga com nada do token). Padding, não: `px-3` vs `px-2` são
  concorrentes, e sem `tailwind-merge` quem vence é a ordem de emissão do CSS. Por isso o degrau é
  **argumento**, não classe extra.
- **`bg-white` não é enfeite.** O preflight do Tailwind força `background-color: transparent` em
  `input`/`select`/`textarea` (`preflight.css:250`), anulando o padrão do navegador. Sem ele o controle
  mostra o creme da página.

> **Os controles ainda são crus.** `<Input>`/`<Select>`/`<Textarea>` existem desde a fatia 1 e têm **zero
> uso em produção** — o app tem ~200 `<input>` à mão. Migrar é a **fatia 5**. O `divida-ui.test.ts`
> garante que o cru usa o token; não garante que deveria ser cru.
```

- [ ] **Step 2: `CHANGELOG.md` — em `[Não lançado]`**

```markdown
### Adicionado

- **Controles de formulário — fatia 4 do redesign:** o `inputCls` respondia a duas perguntas ao mesmo
  tempo — *como o controle se parece* e *quanto ele ocupa* — e a segunda é do contexto. Era por isso que
  **47 dos 80 controles** do sistema não podiam usá-lo: copiavam a string e a alteravam. Deu **5
  famílias**. Agora é `controleCls(tamanho)`, com dois degraus (`padrao` e `compacto`, diferindo só no
  padding) e **sem largura** — quem precisa declara. Os 67 controles que escreviam a classe à mão passaram
  a usar o token, e um teste trava a dívida.
  O **compacto** virou degrau oficial: ele existe em 14 lugares (kanban, grade, linha de tabela) por
  necessidade, não por descuido — negar isso é o que produziria a sexta família.

### Corrigido

- **14 controles transparentes ganharam fundo branco:** o preflight do Tailwind força
  `background-color: transparent` em `input`/`select`/`textarea`, e a família compacta não declarava
  `bg-white` — mostrava o creme da página.
- **A barra de filtros de `/vencimentos` estava desalinhada:** os 2 `<select>` usavam `px-2` **sem
  padding vertical** (a altura vinha do controle nativo) ao lado de um input `px-3 py-2` na mesma barra.
```

> A linha da família D depende do que a Task 4 / Step 1 observou na tela. Se a borda estava mesmo
> herdando a cor do texto, acrescentar em **Corrigido**; se não estava, **não** inventar o conserto.

- [ ] **Step 3: Verificação final**

```bash
npm run lint && npm run typecheck && npm test && npm run format && npm run build
npx prettier --check .
```

- [ ] **Step 4: Commit e PR**

```bash
git add -A
git commit -m "docs: registra o saldo da fatia 4 (dois degraus, largura fora do token)"
git push origin develop
gh pr create --base main --head develop --title "Redesign fatia 4: os controles de formulário"
gh pr checks --watch
```

- [ ] **Step 5: A release, na ordem certa**

O merge **não** publica. Depois do merge:
1. **Implantar** no EasyPanel (app `cursoia/crm-contabil`).
2. Conferir `https://app.seusaldo.ai/api/health` até a `versao` mudar.
3. Só então `npm run release:tag`.

Se esta fatia for lançada, o bump de versão vai **no mesmo PR** (`package.json` + `CHANGELOG`); o
`versao.test.ts` exige que os dois batam. Ver `docs/VERSIONAMENTO.md`.
