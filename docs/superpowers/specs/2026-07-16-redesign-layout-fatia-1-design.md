# Redesign do layout — Fatia 1: fundação visual e telas-chave — Design

**Pedido:** interface mais agradável, bonita, sofisticada e moderna; telas aproveitando melhor o espaço
(o cadastro de cliente como caso); e menus integrados por afinidade. Com uma página de teste antes de
aplicar no sistema.

**Recorte desta fatia:** a **linguagem visual e o espaço**, provados em telas-chave. A reorganização dos
**menus fica para a Fatia 2** — decidir navegação antes de saber como as telas vão parecer é decidir no
escuro. São 73 telas no app: esta fatia estabelece o padrão que as demais herdam.

## O diagnóstico (medido, não impressão)

| Achado | Evidência |
|---|---|
| **O conteúdo fica colado à esquerda** | `(app)/layout.tsx:48` — o `<main>` não tem `max-w` nem `mx-auto`. Em 1440px sobram ~1168px úteis; o `FormCliente` usa 672px (**58%**) e deixa ~496px de vazio, todo de um lado. |
| **9 larguras sem regra** | `max-w-3xl`×26, `4xl`×19, `5xl`×13, `2xl`×11, `6xl`×5 — 74 ocorrências. |
| **A ficha do cliente serrilha** | `clientes/[id]/page.tsx` (~330 linhas) empilha **19 seções** com larguras que brigam: form 672px, notas 896px, outras full-width. |
| **Grids espremem no celular** | 40 `grid-cols-2` **sem breakpoint**. O endereço põe 7 campos num grid uniforme: **UF e CEP com a largura de "Logradouro"**. |
| **Os componentes existem e ninguém usa** | `Card` importado por 2 arquivos vs. `rounded-2xl border border-linha bg-white` **29×** à mão (6 paddings, 2 raios). ~45 tabelas replicadas. **Nenhum primitivo de layout** (Container/Grid/Section). |
| **Uma cor fora do brand** | `Badge.tsx:6` usa `amber-100/amber-800` — não há token `atencao`. |
| **4 cópias da mesma classe** | `inputCls` idêntico em `Campo.tsx`, `Input.tsx`, `Textarea.tsx`, `Select.tsx`. |

**Conclusão:** o que incomoda não é a paleta — é estrutura. Beleza aplicada sobre isso não gruda: sem
primitivos, o próximo card vira o 30º escrito à mão. Por isso: **fundação primeiro, vitrine depois**.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Identidade | **Mantida** (verde `#0fa968`, Space Grotesk / IBM Plex Sans / IBM Plex Mono, creme, light-only) | O pedido é elevar o patamar, não trocar de marca. |
| Princípio do guia | **Evolui:** de "restrição acima de ornamento" para "restrição **com acabamento**" | Continua sem ornamento; sobe o refino. O `saldo-ui.md` é atualizado junto — guia desatualizado é o erro recorrente deste repo. |
| Régua | **3 larguras** (`estreita` ~720px · `padrao` ~1120px · `larga` fluida) num `<Container>`, e `mx-auto` no `<main>` | Substitui 9 valores por 3 decisões declaradas. Centraliza o conteúdo. |
| Formulários | **Grid de 12 colunas**, span **pela natureza do dado** | UF=1, CEP=2, Nº=2, Logradouro=7, Razão social=8. Corrige o grid uniforme. |
| Ficha do cliente | **5 abas por afinidade**, estado na URL (`?aba=fiscal`) | Cadastro · Financeiro · Fiscal · Documentos · Relação. Resolve o scroll infinito e o serrilhado, e mantém link direto e botão voltar. |
| Escopo das telas | **Cadastro de cliente, lista de clientes, dashboard** | Um formulário, uma tabela, um painel de números — cobre os três arquétipos do sistema. |
| Avaliação | **`/laboratorio`**, admin-only, fora do menu, com **antes/depois** | No banco de dev (que agora existe), com dados fictícios. Comparar é o que torna a avaliação honesta. |

## Arquitetura

### Primitivos novos (`src/components/ui/`)

| Componente | Responsabilidade | API |
|---|---|---|
| `Container` | A régua única de largura | `largura?: "estreita" \| "padrao" \| "larga"` (padrão: `padrao`), `children` |
| `FormGrid` | Grid de 12 colunas responsivo | `children`; no mobile colapsa para 1 coluna |
| `FormCampo` | Campo com span declarado | estende `Campo` + `span?: 1..12` (mobile ignora o span) |
| `Secao` | Bloco titulado dentro de uma tela | `titulo`, `descricao?`, `acoes?`, `children` |
| `Abas` | Navegação em abas com estado na URL | `itens: {chave, rotulo, badge?}[]`, `param?` (default `aba`) |

**`Abas` × `SubNav` — a distinção é obrigatória**, senão viram o sexto padrão concorrente:

- **`SubNav`** (já existe): navega **entre rotas** (`href`), como em `/clientes` → `/obrigacoes`. Fica.
- **`Abas`** (novo): alterna **seções da mesma rota** via query param, sem trocar de página.

Os dois **compartilham o mesmo visual de pílula** — quem olha não deve perceber dois sistemas; a diferença
é o que acontece ao clicar. Se na Fatia 2 os dois convergirem, o `Abas` absorve o `SubNav` — não o
contrário.

**Não** criar: Grid genérico, Section polimórfica, sistema de temas. YAGNI — cinco primitivos resolvem os
achados medidos.

### Tokens (`globals.css`, bloco `@theme`)

- **Novos:** `--color-atencao` + `--color-atencao-fundo` (matam o `amber`), escala de elevação
  (`--shadow-superficie`, `--shadow-card`, `--shadow-flutuante`), escala tipográfica e de espaço.
- **Inalterados:** todas as cores de marca e as 3 fontes.

### Dívida que esta fatia paga (por estar no caminho)

- `inputCls` deixa de existir em 4 cópias: `Input`/`Textarea`/`Select` passam a consumir uma constante única.
- `Badge` variante `atencao` passa a usar o token novo.
- `clientes/novo` e `clientes/[id]` passam a usar `PageHeader` (hoje duplicam o título inline).

**Fora de escopo:** reescrever os ~50 cards e ~45 tabelas do sistema; menus (Fatia 2); portal do cliente;
as outras 70 telas. Elas herdam quando forem tocadas.

## O que muda visualmente

1. **Profundidade em camadas** — hoje tudo é hairline sobre creme, chapado. Escala curta de elevação; a
   borda acompanha a sombra em vez de carregar o trabalho sozinha.
2. **Hierarquia tipográfica** — hoje todo título é `text-2xl`. Escala real (30/24/18 display, 14 corpo,
   12 mono), dando presença ao Space Grotesk que o projeto já carrega.
3. **Ritmo de espaço** — 6 paddings viram 4. É o que mais eleva sem que se saiba dizer por quê.
4. **Cor com significado** — nasce `atencao`; nenhuma cor nova por enfeite.
5. **Micro-interações** — 150ms em hover/foco, linha de tabela responsiva ao mouse, foco-visível verde
   preservado (WCAG 2.4.7).

## A página de teste (`/laboratorio`)

- Rota **admin-only**, **fora do menu** (alcançável por URL), com aviso de que é temporária.
- Alterna **antes ↔ depois** da mesma tela, com os componentes e o Tailwind reais.
- **Dados fictícios** gerados em memória (não vão para o banco) — as telas não podem nascer vazias, e o
  dev está vazio por decisão da separação de ambientes.
- **Sai do sistema** quando o padrão for aprovado (a remoção é a última tarefa do plano).

## Verificação

- **Visual:** você aprova no `/laboratorio`, comparando com o antes.
- **Não-regressão:** os 652 testes seguem verdes; `lint`, `typecheck`, `build` e `format:check` limpos.
- **Render:** teste de render por primitivo novo (o projeto já tem esse padrão: `*-render.test.tsx`).
- **Acessibilidade:** foco-visível preservado; alvos ≥36px; `aria-current` nas abas; contraste AA nos
  tokens novos (verificado, não presumido).
- **Regra de ouro do re-skin** (já no `saldo-ui.md`): **nunca refuncionalizar** — `name`/`value`/
  `onChange`/actions, `aria-*` e labels são preservados. O `FormCliente` muda de layout, não de contrato.

## Riscos

| Risco | Mitigação |
|---|---|
| As abas quebrarem o fluxo de quem usa a ficha hoje | Estado na URL (link direto e voltar funcionam); nenhuma seção some — todas as 19 continuam existindo, agrupadas. |
| Virar "mais um padrão concorrente" (já há 5 de navegação) | Os primitivos são a fundação: as telas da fatia consomem `Container`/`FormGrid` e servem de referência para as demais. |
| O redesign tocar o comportamento sem querer | Testes verdes + regra do re-skin + o `/laboratorio` mostra antes/depois lado a lado. |
| `/laboratorio` virar permanente | A remoção é tarefa explícita do plano, não "depois a gente tira". |
