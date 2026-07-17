# Linguagem de UI — SALDO

Guia curto do design system aplicado nas telas (rollout V8.2; largura, grid e elevação na fatia 1 do
redesign, 07/2026). Estilo: **limpo, técnico, funcional** — restrição **com acabamento**: clareza acima de
ornamento, e refino pela precisão (régua, ritmo, camada), não por enfeite. Reusado pelas fatias seguintes.

## Princípios

1. **Restrição com acabamento.** Fundo **creme** (`bg-creme`), cards **brancos**, **hairlines** de 1px (`border-linha`), cantos arredondados (`rounded-2xl` em cards/painéis, `rounded-lg`/`xl` em controles) e **elevação** (`shadow-card`) para dar camada — a borda não carrega o trabalho sozinha. Sem ornamento; o refino vem da precisão, não de enfeite.
2. **Hierarquia tipográfica.** Títulos e **números/valores** em **`font-display`** (Space Grotesk) com tracking negativo; corpo/UI em `font-sans` (IBM Plex Sans); **dados** — CNPJ, R$, códigos e rótulos-eyebrow — em **`font-mono`** (IBM Plex Mono). Números que alinham em colunas → `tabular-nums`.
3. **Espaço e ritmo.** Respiro generoso; agrupar irmãos por `gap` (flex/grid), não por margens soltas. Densidade média (linhas de tabela ~13px de padding vertical).
4. **Cor com significado.** `verde` = primária/positivo; `violeta` = dados/destaque; `negativo` = erro/inativo; neutros (`texto`/`cinza`/`cinza-claro`/`linha`) para o resto. O acento marca ação e estado — não é enfeite.
5. **Estado legível num relance.** Situação em **pill** (bolinha + texto), classificação em **`Badge`** colorido, valores monetários em **mono alinhados à direita**.
6. **Interatividade evidente.** Hover sutil (`hover:bg-creme`/`hover:bg-surface-2`) em linhas e botões; **foco-visível verde** (WCAG 2.4.7) preservado; alvos de toque ≥ 36px.
7. **Vazio ≠ erro.** Estado vazio via `EmptyState` (ícone + frase + ação). Erros com `role="alert"` e cor `negativo`; sucesso com `role="status"` e `verde`.
8. **Responsivo.** Colunas secundárias somem no mobile; toolbars quebram; tabelas largas em `overflow-x-auto` — o corpo da página **nunca** rola na horizontal.

## Largura é decisão de tela — declarada, nunca improvisada

Havia **9 larguras** espalhadas por 74 lugares, sem regra. Agora são **três degraus**, e a régua é o
`<Container>`:

| Degrau | Largura | Para |
|---|---|---|
| `estreita` | 720px | formulários focados, configurações, login |
| `padrao` | 1280px | a maioria: telas com tabela e conteúdo |
| `larga` | fluida | tabelões, calendário, kanban, fluxo de caixa |

- **Nada de `max-w-*` solto** numa tela nova: use o `Container`.
- **Seções não impõem largura.** Um bloco dentro de uma tela ocupa o pai — era o que fazia a borda
  direita descer serrilhada na ficha do cliente (672px num bloco, 896px no vizinho).
- **A migração terminou (fatia 3).** Não há mais `max-w-[720px]`/`max-w-[1280px]` inline: as 61 telas
  que os tinham passaram para o `Container`. `src/tests/ui/divida-ui.test.ts` falha se voltarem.
- Um `max-w-*` **genérico** continua legítimo onde não é régua de tela: `max-w-2xl` na folha impressa da
  proposta, `max-w-[85%]` no balão de conversa, `max-w-full` num `<audio>`. A régua são só os dois valores
  que o `Container` possui.

## O `<main>` é do layout — a tela não abre outro

O `(app)/layout.tsx` já tem `<main id="conteudo">`. Uma tela que abre o próprio `<main>` duplica o
landmark e o leitor de tela anuncia "principal" duas vezes (WCAG 1.3.1). Estavam assim **61 lugares**;
hoje a tela abre um `<Container>` e o landmark é um só. As exceções legítimas — o `AuthCard`, que vive em
`/login/**`, fora deste layout — estão nomeadas no `divida-ui.test.ts`.

## Contraste se mede, não se estima

O par que carrega informação **sozinho** precisa passar; o que só decora, não. A distinção decidiu os dois
tokens de atenção que a fatia 3 criou:

- `atencao-solido` (`#b87d03`) é a bolinha de status. No calendário a prioridade "alta" **não tem rótulo**
  — só a cor informa, então vale a WCAG 1.4.11 (3:1). Ele dá **3.52** sobre branco. O primeiro valor
  escolhido a olho (`#c88a04`) dava 2.96 e teria **reprovado**; o `amber-500` que ele substituiu dava 2.15.
- `atencao-borda` (`#e8d5a8`) é hairline (**1.31** sobre o fundo de aviso) **de propósito**: é a convenção
  do sistema (`border-linha` dá 1.27) e em 3 dos seus 4 usos ela é contorno de caixa que já tem fundo e
  texto próprios — não informa sozinha. Elevá-la a 3:1 ali seria criar uma exceção visual e chamar isso
  de acessibilidade.
- **A exceção, registrada:** no `AcoesExclusaoCliente` o `atencao-borda` é o **único contorno** do botão
  "Restaurar" (sem fill, sem sombra) — ali 1.4.11 se aplicaria, e 1.31 não passa. Não é regressão desta
  fatia (o `amber-400` dava 1.61: também reprovava), e não é caso isolado: **todo botão secundário do
  sistema** é assim (`border-negativo/40` dá 1.76, `border-linha` 1.27) — o que identifica esses botões é
  o **texto** (5.38), não a borda. Consertar só o amber deixaria a família inconsistente sem resolver
  nada. É dívida da família de botões, não do token: fica para uma fatia que trate os quatro juntos.

## Formulário: 12 colunas, span pela natureza do dado

`<FormGrid>` + `<FormCampo span={1..12}>`. O span vem do **dado**, não de uma divisão uniforme: `UF=1`,
`CEP=2`, `Número=2`, `Logradouro=7`, `Razão social=6`. O `grid-cols-2` uniforme dava à UF a mesma largura
da razão social. No mobile tudo colapsa para 1 coluna.

> As classes `md:col-span-*` do `FormGrid` são **literais** de propósito: o Tailwind varre o código por
> strings completas e não gera classe a partir de interpolação. Trocar por `` `md:col-span-${n}` `` passa
> nos testes e quebra o layout em produção, calado.

## Navegação: duas camadas, só duas

- **Menu lateral** = seções, em grupos por afinidade (**Operação · Entrada · Relacionamento ·
  Financeiro**, com Início e Configurações soltos). O mapa é **dado puro** em `src/lib/ui/navegacao.ts`:
  quem vê o quê é regra, e regra se testa sem DOM.
- **SubNav** = as telas de uma seção.
- **Hub** (grid de cards) só onde a seção tem muitas telas de peso parecido: Financeiro e Configurações,
  16 cada. O defeito nunca foi o hub — era ele ser o **único** caminho.
- Um grupo **não é renderizado** sem item visível (o papel `financeiro` não vê "Entrada", então o título
  não aparece).
- **Cada item mostra o próprio badge.** O menu somava obrigações + escalonamento + vencimentos num número
  só, em "Clientes".
- **Nada de sexta forma:** botões-âncora imitando abas e `<a>` cru não entram em tela nova.
  `src/tests/ui/rotas-alcancaveis.test.ts` falha se alguma tela ficar sem caminho.
- **Voltar é o `<Voltar>`, e só ele** (fatia 3). Os 18 links "← texto" soltos viraram
  `<Voltar href label>` — o rótulo contextual sobrevive como `label` ("← Comunicados" →
  `label="Comunicados"`). O `←` **sozinho não é voltar**: onde ele significa direção (mover card de
  etapa, paginar mês) continua sendo um controle, e trocá-lo por navegação seria bug. As quatro
  exceções estão nomeadas, com motivo, no `divida-ui.test.ts`.

## `Abas` × `SubNav` — parecidos, diferentes

- **`SubNav`**: navega **entre rotas** (`href`).
- **`Abas`**: alterna **seções da mesma rota** (`?aba=`), sem trocar de página. Estado na URL, então link
  direto e botão voltar funcionam; cai na primeira aba se a chave não existir.

## Escape hatch é prop, nunca `className`

O projeto **não usa `tailwind-merge`**: entre duas classes concorrentes, quem vence é a ordem de emissão
do CSS, não a ordem da string. Por isso `Secao` tem `padding={false}` (card full-bleed, tabela colada na
borda) e `nivel={2|3}` (árvore de headings, WCAG 1.3.1) — e não se sobrescreve `p-5` por `className`.

## Blocos de construção

- **Base (V8.1):** `LogoSaldo`, `Card`, `Botao` (primario/secundario/fantasma/perigo), `Badge` (neutro/positivo/atencao/negativo/ia), `PageHeader`, `StatCard`.
- **Ampliados (V8.2a):** `Campo` (label + controle + erro/hint), `Input`/`Select`/`Textarea`, `Painel` (contêiner de tabela/lista), `Chip` (filtro), `Toolbar` (busca + filtros), `EmptyState`, `Iniciais` (avatar de texto).
- **Layout (fatia 1 do redesign):** `Container` (a régua), `FormGrid`/`FormCampo` (12 colunas), `Secao` (bloco titulado, com `padding` e `nivel`), `Abas` (estado na URL). `inputCls` é a **fonte única** da classe dos controles — era a mesma string copiada em 4 arquivos.
- **Helpers:** `iniciais(nome)`, `badgeRegime(regime)`, `corValorStat(variante)` — puros, em `src/lib/ui/`.

## Regras de re-skin (mapa de tokens)

**O `amber` acabou** (fatia 3): 53 classes, 9 shades, 24 arquivos — todas migradas, nenhuma resta. Os 9 shades serviam só **3 papéis**, hoje cobertos por 4 tokens: `bg-amber-50|100→bg-atencao-fundo` (os dois fundos faziam o mesmo trabalho e colapsaram num só) · `text-amber-700|800|900→text-atencao` · `border-amber-200|300|400→border-atencao-borda` · `bg-amber-500→bg-atencao-solido`.

`text-slate-900→text-texto` · `text-slate-700/600→text-cinza` · `text-slate-500→text-cinza-claro` · `border-slate-*→border-linha` · `bg-slate-100/50→bg-creme` · botão primário `bg-slate-900`→`<Botao variante="primario">` · secundário `border-slate-300`→`<Botao variante="secundario">` · sucesso `bg-green-50/text-green-700`→`bg-verde/10 text-verde` · erro `bg-red-50/text-red-700`→`bg-negativo/10 text-negativo` · inputs→`Campo`+`Input` · dados (CNPJ/R$)→`font-mono`.

**Sempre re-skin, nunca refuncionalizar:** preservar `name`/`value`/`onChange`/actions, `aria-*`, `role`, e labels associadas.
