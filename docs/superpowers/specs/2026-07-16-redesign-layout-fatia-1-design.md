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
| **O `amber` vazou por todo o sistema** | **55 ocorrências em 9 shades, ~25 arquivos** (`amber-800`×18, `amber-50`×13, `amber-700`×10…) — não há token `atencao`. O `Badge.tsx:6` é só a mais visível. |
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

- **Novos:** `--color-atencao` + `--color-atencao-fundo` (o par texto/fundo do Badge) e a escala de
  elevação (`--shadow-card`, `--shadow-flutuante`).
- **O conjunto `atencao` está subdimensionado para o resto do sistema** e a Fatia 2 precisa decidir antes
  de migrar: falta uma **borda** (hoje `amber-200/300/400`), um **sólido** para bolinha de status (hoje
  `bg-amber-500`), e se `amber-50` (13 usos, o fundo mais comum) colapsa em `--color-atencao-fundo`. Sem
  essa decisão, quem migrar inventa token ad hoc e o brand kit volta a vazar.
- **A escala tipográfica e a de espaço NÃO viram token global.** Declarar `--text-*`/`--spacing-*` no
  `@theme` do Tailwind 4 sobrescreve os defaults e mudaria as 73 telas de uma vez — o oposto de "fundação
  primeiro". Elas vivem dentro dos primitivos (`Secao`, `FormGrid`, `Abas`), e as telas herdam ao migrar.
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

## Achados para a Fatia 2 (da review final desta fatia)

Verificados no código, não presumidos. Entram no planejamento da Fatia 2 antes de qualquer migração:

- **`inputCls` como fonte única ainda não é.** Restam ~10 arquivos com cópias **divergentes** (umas com
  `mt-1`, outras `mt-0.5`, outras sem `w-full` ou sem `focus:border-verde`): `usuarios/page.tsx:93,121,147`,
  `EmitenteConfig.tsx` (×12), `FormConstituicao.tsx:6`, `FormMarca.tsx:6`, `FormCertificado.tsx:5`,
  `FormProcuracao.tsx:5`, `FormDadosPagamento.tsx:15`, `CampoTexto.tsx:16`. Migrar causa mudança visual
  **real**, não só troca de string. **Armadilha:** `nfse/EmitirNfseCliente.tsx:6` declara um `const
  inputCls` local — importar lá dá erro de identificador duplicado.
- **`<main>` aninhado (bug pré-existente).** O `(app)/layout.tsx:48` tem `<main id="conteudo">` e várias
  páginas têm **outro** `<main className="mx-auto max-w-3xl">` dentro dele (`legalizacao/[id]/page.tsx:83`,
  `comunicados/page.tsx:19`…). Landmark duplicado. Como o `Container` é uma `<div>`, migrar
  `<main className="mx-auto max-w-*">` → `<Container>` conserta de graça — desde que quem migrar saiba, em
  vez de "preservar" o `<main>` por zelo com a regra do re-skin.
- **A régua de 3 degraus vai reflowar todas as telas — de propósito.** Hoje: 768/896/1024/1152. A régua:
  720/1120/full. O `max-w-4xl` (896) é ambíguo: vira estreita (−176px) ou padrão (+224px)? O mapa
  `larguraAtual → larguraNova` deve ser **decidido no plano**, e a aprovação humana ser **tela a tela**,
  não em bloco.
- **O projeto não usa `tailwind-merge`.** Em `Container`/`Secao`/`Input`, quem vence não é a ordem da
  string de `className` e sim a ordem de emissão do CSS. Por isso os escape hatches dos primitivos são
  **props** (`padding`, `nivel`, `largura`), nunca `className`. Quem criar primitivo novo segue a regra.
