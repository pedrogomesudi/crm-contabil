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
- As telas migradas ainda usam `max-w-[720px]`/`max-w-[1280px]` inline com os **mesmos valores** da
  régua; elas passam para o `Container` conforme forem tocadas.

## Formulário: 12 colunas, span pela natureza do dado

`<FormGrid>` + `<FormCampo span={1..12}>`. O span vem do **dado**, não de uma divisão uniforme: `UF=1`,
`CEP=2`, `Número=2`, `Logradouro=7`, `Razão social=6`. O `grid-cols-2` uniforme dava à UF a mesma largura
da razão social. No mobile tudo colapsa para 1 coluna.

> As classes `md:col-span-*` do `FormGrid` são **literais** de propósito: o Tailwind varre o código por
> strings completas e não gera classe a partir de interpolação. Trocar por `` `md:col-span-${n}` `` passa
> nos testes e quebra o layout em produção, calado.

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

`bg-amber-100/text-amber-800→bg-atencao-fundo/text-atencao` (o `amber` é do Tailwind, fora do brand kit — restam ~55 ocorrências a migrar) · `text-slate-900→text-texto` · `text-slate-700/600→text-cinza` · `text-slate-500→text-cinza-claro` · `border-slate-*→border-linha` · `bg-slate-100/50→bg-creme` · botão primário `bg-slate-900`→`<Botao variante="primario">` · secundário `border-slate-300`→`<Botao variante="secundario">` · sucesso `bg-green-50/text-green-700`→`bg-verde/10 text-verde` · erro `bg-red-50/text-red-700`→`bg-negativo/10 text-negativo` · inputs→`Campo`+`Input` · dados (CNPJ/R$)→`font-mono`.

**Sempre re-skin, nunca refuncionalizar:** preservar `name`/`value`/`onChange`/actions, `aria-*`, `role`, e labels associadas.
