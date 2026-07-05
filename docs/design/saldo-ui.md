# Linguagem de UI — SALDO

Guia curto do design system aplicado nas telas (rollout V8.2). Estilo: **limpo, técnico, funcional** — restrição e clareza acima de ornamento. Reusado pelas fatias seguintes.

## Princípios

1. **Restrição.** Fundo **creme** (`bg-creme`), cards **brancos**, **hairlines** de 1px (`border-linha`), cantos arredondados (`rounded-2xl` em cards/painéis, `rounded-lg`/`xl` em controles). Sombra sutil só onde eleva.
2. **Hierarquia tipográfica.** Títulos e **números/valores** em **`font-display`** (Space Grotesk) com tracking negativo; corpo/UI em `font-sans` (IBM Plex Sans); **dados** — CNPJ, R$, códigos e rótulos-eyebrow — em **`font-mono`** (IBM Plex Mono). Números que alinham em colunas → `tabular-nums`.
3. **Espaço e ritmo.** Respiro generoso; agrupar irmãos por `gap` (flex/grid), não por margens soltas. Densidade média (linhas de tabela ~13px de padding vertical).
4. **Cor com significado.** `verde` = primária/positivo; `violeta` = dados/destaque; `negativo` = erro/inativo; neutros (`texto`/`cinza`/`cinza-claro`/`linha`) para o resto. O acento marca ação e estado — não é enfeite.
5. **Estado legível num relance.** Situação em **pill** (bolinha + texto), classificação em **`Badge`** colorido, valores monetários em **mono alinhados à direita**.
6. **Interatividade evidente.** Hover sutil (`hover:bg-creme`/`hover:bg-surface-2`) em linhas e botões; **foco-visível verde** (WCAG 2.4.7) preservado; alvos de toque ≥ 36px.
7. **Vazio ≠ erro.** Estado vazio via `EmptyState` (ícone + frase + ação). Erros com `role="alert"` e cor `negativo`; sucesso com `role="status"` e `verde`.
8. **Responsivo.** Colunas secundárias somem no mobile; toolbars quebram; tabelas largas em `overflow-x-auto` — o corpo da página **nunca** rola na horizontal.

## Blocos de construção

- **Base (V8.1):** `LogoSaldo`, `Card`, `Botao` (primario/secundario/fantasma/perigo), `Badge` (neutro/positivo/atencao/negativo/ia), `PageHeader`, `StatCard`.
- **Ampliados (V8.2a):** `Campo` (label + controle + erro/hint), `Input`/`Select`/`Textarea`, `Painel` (contêiner de tabela/lista), `Chip` (filtro), `Toolbar` (busca + filtros), `EmptyState`, `Iniciais` (avatar de texto).
- **Helpers:** `iniciais(nome)`, `badgeRegime(regime)`, `corValorStat(variante)` — puros, em `src/lib/ui/`.

## Regras de re-skin (mapa de tokens)

`text-slate-900→text-texto` · `text-slate-700/600→text-cinza` · `text-slate-500→text-cinza-claro` · `border-slate-*→border-linha` · `bg-slate-100/50→bg-creme` · botão primário `bg-slate-900`→`<Botao variante="primario">` · secundário `border-slate-300`→`<Botao variante="secundario">` · sucesso `bg-green-50/text-green-700`→`bg-verde/10 text-verde` · erro `bg-red-50/text-red-700`→`bg-negativo/10 text-negativo` · inputs→`Campo`+`Input` · dados (CNPJ/R$)→`font-mono`.

**Sempre re-skin, nunca refuncionalizar:** preservar `name`/`value`/`onChange`/actions, `aria-*`, `role`, e labels associadas.
