# Redesign — Fatia 4: os controles de formulário — Design

**O que é:** o `inputCls` deixa de responder a duas perguntas ao mesmo tempo, ganha um segundo degrau
de tamanho e passa a ser usado pelos 80 controles que hoje escrevem a classe à mão.

## O diagnóstico (medido hoje; o registro estava errado)

O registro dizia **"~10 cópias divergentes"**, depois corrigido para **28**. O real:

| Medida | Valor |
|---|---|
| Controles com `className` literal | **80**, em **27 arquivos** |
| **Destes, o que esta fatia toca** | **67**, em **17 arquivos** (os outros 13 são checkbox/upload/sem caixa) |
| Controles crus (`<input>`/`<select>`/`<textarea>`) no sistema | **200** |
| Controles pelo componente (`<Input>`/`<Select>`/`<Textarea>`) | **0** — os 5 que existem são dentro dos testes deles |
| Usos de `inputCls` colado em elemento cru | **75** em tela (+3 definições de componente), em 12 arquivos |

**Não são cópias divergentes de uma coisa só — são quatro famílias:**

| Família | Nº | O que é | Muda na tela? |
|---|---|---|---|
| **A** | 17 | Igual ao `inputCls` (`px-3 py-2`) — duplicação de verdade | Não (1 exceção, abaixo) |
| **B** | 14 | **Compacto** (`px-2 py-1.5`) — kanban, linha de tabela, grade | **Sim** — ganham fundo branco |
| **C** | 17 | `rounded` (4px) em vez de `rounded-lg` (8px) | **Sim** |
| **D** | 9 | `border` **sem cor** → `currentColor` (8 em `EnviarAssinatura.tsx`) | **Sim** |
| **E** | 10 | Padding em **atalho** (`p-2`, `p-1`, `px-2` sem `py`) — não mapeia limpo | **Sim** — decidido caso a caso (abaixo) |
| — | 13 | Checkbox, upload escondido, campo sem caixa | Não é o assunto |

17 + 14 + 17 + 9 + 10 + 13 = **80**.

### As três descobertas que definiram o design

1. **A família B não é divergência — é um tamanho que o sistema não tem.** O `inputCls` é único e assume
   `px-3 py-2`. Unificar tudo nele faria 14 controles densos **crescerem**. O compacto existe em 14
   lugares porque é necessário; negar isso produz a próxima rodada de cópias.

2. **O `inputCls` mistura aparência com layout.** Ele carrega `w-full` — que é decisão do contexto, não
   do controle. Dos 80 controles: **28** têm `w-full`, **14** são `block` sem largura, **5** têm largura
   fixa (`w-28`, `w-64`). A largura **não é consenso**, e é por causa dela que 47 controles não puderam
   usar o token. É o mesmo erro que a fatia 1 diagnosticou na régua, e a fatia 1 já criou o lugar certo
   para largura: o `FormGrid`/`FormCampo`.

3. **Os componentes da fatia 1 nunca foram usados.** `Input`/`Select`/`Textarea` têm **zero** uso em
   produção — os "5 usos" são todos dentro dos próprios testes que verificam que eles funcionam. Nenhum
   arquivo do app os importa, contra **200** controles crus. A fatia 1 criou três componentes, escreveu
   teste para eles, e o app seguiu como estava; o teste passava, então nada acusou. O `inputCls` virou
   uma string que 12 arquivos colam à mão em elemento cru. Os 80 controles com classe literal não são
   "cópias que escaparam" — **são a norma**.

### O que o registro dizia e não se confirmou

A spec da fatia 3 afirmava que **"4 controles não têm `focus:border-verde` e ganhariam foco visível
(isso é acessibilidade)"**. **Errado.** O `globals.css` tem `:focus-visible { outline: 2px solid verde }`
global — todos os controles **já têm** foco visível. O `focus:border-verde` é realce adicional, não a
acessibilidade. Nenhum ganho de a11y nesta fatia; não vamos alegar um.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Família B (compacto) | **Vira degrau oficial** | Existe em 14 lugares por necessidade. Como a régua da fatia 1: o sistema reconhece os degraus reais em vez de fingir que há um só. |
| Alvo da fatia | **A classe agora; os componentes na fatia 5** | A causa é o abandono dos componentes, mas migrar 200 controles num PR é onde o risco mora — a fatia 3 mostrou que script atropela caso especial. Dois passos, com gate no meio. |
| `w-full` | **Sai do `inputCls`** | É a única saída que deixa os dois degraus simétricos e põe largura onde a fatia 1 já decidiu que ela mora. |
| Nome | `inputCls` → **`controleCls`** | Ele serve `input`, `select` e `textarea`. O nome mentia. |

## Arquitetura

### Os dois degraus

```ts
// src/components/ui/Campo.tsx
export function controleCls(tamanho: "padrao" | "compacto" = "padrao"): string;

controleCls()            // padrão:   px-3 py-2
controleCls("compacto")  // compacto: px-2 py-1.5
```

**Função, não constante** — e o padrão exige os parênteses. Uma constante `controleCls` e uma
`controleClsCompacto` seriam duas strings soltas que ninguém obriga a andarem juntas; a função tem um
tipo literal (`"padrao" | "compacto"`), então o `typecheck` recusa um terceiro tamanho inventado. É a
diferença entre ter dois degraus e ter duas strings.

Diferem **só no padding**. Tudo o mais é idêntico:
`rounded-lg border border-linha bg-white text-sm text-texto placeholder:text-cinza-claro focus:border-verde`

| | Padrão | Compacto |
|---|---|---|
| Onde | formulário de tela | kanban, linha de tabela, grade |
| Padding | `px-3 py-2` | `px-2 py-1.5` |

**Nenhum dos dois tem largura.** Quem precisa declara `w-full`. Passar largura por `className` é seguro:
o problema de ordem de emissão do CSS (documentado no `saldo-ui.md`, o projeto não usa `tailwind-merge`)
só existe entre **utilitários concorrentes** — `px-3` vs `px-2` brigam, `w-full` não briga com nada no
token.

### A migração do `w-full` — 74 pontos, resultado pixel-idêntico

Os 78 usos de `inputCls` se dividem assim:

| | Nº | O que acontece |
|---|---|---|
| Usos em tela que **herdam `w-full` calado** | **74** | Ganham `w-full` explícito |
| Uso em tela que **já pede** `w-full` | 1 | Nada (já é explícito) |
| Definições dos componentes (`Input`/`Select`/`Textarea`) | 3 | Perdem o `w-full` e **não** o recuperam — são layout-neutros também. **Nenhuma tela muda: uso em produção é zero.** |

Os 74 ganham `w-full` explícito **no mesmo commit** que o tira da constante. Ninguém vê diferença — e é
esse o ponto: o valor não é visual, é que a largura passa a ser **declarada**, e o próximo controle não
herda uma decisão que ninguém tomou.

> **Por que não "tira e vê o que quebra":** seriam 74 telas para conferir a olho. O commit atômico troca
> uma inspeção visual de 74 telas por uma transformação mecânica verificável.

### As famílias

- **A** (17) → `controleCls()`. String idêntica; nada muda — **exceto `vencimentos/page.tsx:89`**, que não
  tem `bg-white` nem `focus:border-verde` e vai ganhar os dois.
- **B** (14) → `controleCls("compacto")` + `mt-0.5 block`. O padding é idêntico, mas **eles mudam**: a
  família B não tem `bg-white`, `text-texto` nem `focus:border-verde`, e ganha os três.

> **Por que o `bg-white` muda a tela (e não é no-op):** o preflight do Tailwind força
> `background-color: transparent` em `input`, `select` e `textarea` — anulando o padrão do navegador
> (`background-color: field`, branco). Ou seja, os 14 controles da família B são **transparentes hoje** e
> mostram o creme da página. Com `bg-white` ficam brancos, como todo controle do sistema.
> Isso foi **verificado no `node_modules/tailwindcss/preflight.css:250`**, não presumido — a intuição
> ("input já é branco por padrão") estava errada.
- **C** (17) → `controleCls`. **Canto de 4px vira 8px.**
- **D** (9) → `controleCls`. **A borda ganha `border-linha`.** Hoje é `currentColor` (herda a cor do
  texto) — provavelmente já está errado na tela e ninguém reparou. **Confirmar na execução, não presumir.**
- **E** (10) → **o único grupo que o script não toca: cada caso foi decidido olhando a tela.** São
  paddings em atalho que não caem num degrau. **Decidido pelo Pedro em 17/07:**

  | Onde | Hoje | Vira | Por quê |
  |---|---|---|---|
  | `ContratosSection` (4×) | `p-2` | `controleCls("compacto")` | Form embutido e denso de propósito (`grid-cols-2 gap-2`, rótulo `text-xs`). `p-2`=8px → 8px/6px: **quase idêntico**. O padrão faria os campos crescerem dentro de um bloco apertado. |
  | `ContratosSection:88` (mês do 13º) | `w-16 p-1` | `controleCls("compacto")` + `w-16` | Mantém a largura; o padding vai de 4px para 8px/6px e passa a **alinhar com o texto do rótulo ao lado**. Sem exceção a manter. |
  | `vencimentos` (2× `<select>`) | `px-2`, **sem `py`** | `controleCls()` (padrão) | **Não é risco, é conserto.** Eles vivem numa barra `flex` com o campo "Buscar cliente", que já é `px-3 py-2`. Hoje os três têm regras de altura diferentes — o select sem `py` depende do controle nativo. O padrão os alinha. |
  | `whatsapp/Formularios` (3×) | `p-2 w-full focus` | `controleCls()` + `w-full` | Já é o padrão em tudo menos no atalho do padding; o `w-full` já está declarado. |

  > **Estes 10 são a razão de esta fatia ter spec própria.** Os outros 70 são transformação mecânica;
  > estes exigiram abrir a tela. E abrir a tela achou um defeito que ninguém tinha visto: a barra de
  > filtros do `/vencimentos` **já está desalinhada hoje**.

## Verificação

- **O teste** (`divida-ui.test.ts` ganha uma regra): nenhum `<input|select|textarea>` cru com `border` na
  `className` fora de `components/ui/`. Pega as quatro famílias de uma vez — todas têm borda à mão.
  - **Limite declarado:** a regra **não** força o uso do componente `<Input>`. Isso é a fatia 5. Até lá,
    o sistema tem 200 controles crus e a regra só garante que usam o token certo.
- **Sabotagem com formas não desenhadas.** Na fatia 3, sabotar com o que eu tinha em mente deixou passar
  3 furos: o guard provou pegar o que foi escrito, não o que promete.
- **Não-regressão:** 691 testes; `lint`, `typecheck`, `build`, `format:check`.
- **Visual:** o Pedro confere **B, C, D e E** — são as que mudam (a **A** não muda, salvo
  `vencimentos:89`). A **E** ele já decidiu caso a caso (tabela acima). Dois pontos merecem o olho:
  - **A família B ganha fundo branco** em 14 controles hoje transparentes (kanban, grade, linha de
    tabela). É a mudança de maior alcance da fatia.
  - **A barra de filtros do `/vencimentos`** é a única mudança de **altura**, e corrige um
    desalinhamento que já existe.

## Fora de escopo

| O quê | Por quê |
|---|---|
| **Migrar `<input>` → `<Input>`** (200) | Fatia 5. É a causa; esta fatia trata o sintoma **de propósito**, com o gate no meio. Atenção: a fatia 5 não vai "retomar" componentes em desuso — vai **estrear** três componentes que nunca rodaram fora do teste. Risco diferente, e maior. |
| **O prop `tamanho="padrao\|compacto"`** | Nasce na fatia 5, com os componentes. Aqui o degrau é constante: **elemento cru não tem prop**. |
| Checkbox e radio | Estilo próprio; não passam pelo token. |
| O portal (`(portal)/**`) | Layout separado, como nas fatias anteriores. |

## Riscos

| Risco | Mitigação |
|---|---|
| O `w-full` sumir calado em algum dos 77 | O commit é atômico: tira da constante **e** declara nos 77. Um `w-full` esquecido encolhe o campo — visível. O script recusa o que não casar com o padrão, em vez de adivinhar (fatia 3). |
| As famílias C e D mudarem aparência em 26 pontos | **É o objetivo** — hoje elas destoam do sistema. O Pedro confere. |
| O renomear `inputCls` → `controleCls` quebrar import | `typecheck` pega todos; não há import dinâmico. |
| A fatia 5 nunca vir, e o sintoma tratado virar o fim da história | A limitação está escrita no teste e aqui. Os 200 controles crus continuam medidos: `grep -c '<input '`. |
