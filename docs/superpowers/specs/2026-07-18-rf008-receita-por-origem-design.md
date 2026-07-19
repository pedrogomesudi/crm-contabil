# RF-008 — Relatório de receita por indicador/parceiro (origem) — Design

**O que é:** uma tela nova no Comercial que agrega a **receita por origem** da oportunidade — quantidade de
ganhos, valor ganho e valor de proposta aceita (mensal e único) por fonte, num período. Fecha a RF-008.
É um relatório enxuto; **uma fatia** de implementação.

## O estado de hoje (medido)

- A oportunidade (`0054`) tem `origem text` — **texto livre** (o usuário digita no formulário do
  `QuadroComercial`: "Indicação João", "Google", "Site"…). Não há entidade estruturada de
  indicador/parceiro; a origem é a única marca da fonte.
- A **receita fechada** já é medida na tela **Métricas do funil** (`MetricasFunil.tsx` +
  `lib/comercial/metricas.ts`): soma do `valor_estimado` das oportunidades **ganhas** cujo `fechado_em` cai
  num período, agregada **por responsável**. O `periodoBounds(gran, hoje, offset)` produz o recorte
  (mês/trimestre/semestre/ano) — reutilizável.
- A **proposta** (`0057`) tem `status` (`rascunho`/`enviada`/`aceita`/`recusada`) e itens
  (`proposta_item`: `valor`, `recorrencia` `mensal`/`unico`), ligada à oportunidade por `oportunidade_id`.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| O que é "receita" | **Valor ganho E valor da proposta aceita, lado a lado** | Compara o estimado no fechamento com o contratado. |
| Proposta aceita | **Mensal e único separados** | Misturar recorrente com cobrança única induz a erro. |
| Agrupamento | **Pela `origem` como texto** (sem normalizar variações) | A origem é o dado que existe; normalizar é outra discussão. Vazia → "Sem origem". |
| Período | **Seletor navegável + "Todo o histórico"**, ancorado em `fechado_em` | Consistente com Métricas; o "tudo" cobre o acumulado. |
| Onde fica | **Nova aba "Receita por origem"** em `/comercial/receita` | Propósito único, separado da conversão do funil. |
| Visual | **Tabela + rodapé de totais** (sem StatCards nem gráfico) | Responde "qual fonte traz mais receita" direto. |

## Arquitetura

### A lógica pura (`lib/comercial/receita.ts`)

```ts
export type LinhaReceita = { origem: string | null; valorGanho: number; propostaMensal: number; propostaUnico: number };
export type FonteReceita = { origem: string; ganhos: number; valorGanho: number; propostaMensal: number; propostaUnico: number };

// Agrupa as oportunidades ganhas por origem (vazia → "Sem origem"), soma cada coluna, ordena por
// valorGanho desc. `ganhos` é a contagem de oportunidades da fonte.
export function receitaPorOrigem(linhas: LinhaReceita[]): FonteReceita[];

// Soma as colunas de todas as fontes (linha de total).
export function totalReceita(fontes: FonteReceita[]): Omit<FonteReceita, "origem">;
```

Regras: `origem` `null`/vazia/só-espaços → `"Sem origem"`; agrupa por `origem.trim()`; `ganhos` conta as
linhas; ordena por `valorGanho` desc (empate: por origem asc, estável). `totalReceita` soma tudo.

### A carga de dados (server action)

`carregarReceitaPorOrigem(inicio: string | null, fim: string | null): Promise<LinhaReceita[]>` (gate
comercial, `podeCriarCliente`):
- Oportunidades com `etapa = 'ganho'`; se `inicio`/`fim` vierem, `fechado_em >= inicio and < fim`; se
  ambos `null` ("Todo o histórico"), sem filtro de data. Traz `id, origem, valor_estimado`.
- Propostas com `status = 'aceita'` das oportunidades ganhas (por `oportunidade_id`), com seus
  `proposta_item` (`valor`, `recorrencia`). Para cada oportunidade, soma os itens das propostas aceitas por
  recorrência → `propostaMensal`, `propostaUnico`. Sem proposta aceita → 0/0.
- Devolve uma `LinhaReceita` por oportunidade ganha.

### A tela (`/comercial/receita`)

- Página server (gate `podeCriarCliente`), aba **"Receita por origem"** adicionada ao `SubNav` do Comercial
  (em `comercial/page.tsx`; e registrada no teste `rotas-alcancaveis`).
- Client `ReceitaPorOrigem`: o **seletor de período** (reusa `periodoBounds`/`Granularidade` de
  `metricas.ts`) com ← → e um botão **"Todo o histórico"** (quando ligado, passa `inicio=fim=null`). Ao mudar
  período, chama `carregarReceitaPorOrigem` (server action) e re-renderiza — ou a página recarrega os dados
  por `searchParams`. **Decisão:** o cálculo do período é client-side (`periodoBounds`), e a busca dos dados
  é uma server action chamada do client (como o padrão de `chamar`), guardando o resultado em estado.
- **Tabela:** colunas Origem · Ganhos (qtd) · Valor ganho · Proposta mensal · Proposta único; linhas via
  `receitaPorOrigem`, ordenadas por valor ganho; **rodapé** com `totalReceita`. Mensal exibido com sufixo
  "/mês". Vazio → "Nenhum negócio ganho no período".

## Fatia de implementação

Uma fatia só: a lógica pura + a action + a tela + a aba no SubNav + release.

## Verificação

- **Lógica testável:** `receitaPorOrigem` (agrupa, "Sem origem", ordena, conta) e `totalReceita` (soma).
- **Render:** a tabela renderiza as fontes e o total; estado vazio quando não há ganhos.
- **Não-regressão:** `rotas-alcancaveis` atualizado; `lint`, `typecheck`, `build`, `format:check`.
- **Sem migration** — usa `oportunidade`, `proposta`, `proposta_item` existentes.

## Fora de escopo

| O quê | Por quê |
|---|---|
| Normalizar/consolidar variações de origem ("Google" vs "google") | A origem é texto livre; normalizar é outra decisão (uma lista controlada de origens seria outra RF). |
| Comissão/repasse ao indicador | O relatório mede receita por fonte; cálculo de comissão é outro tema. |
| Gráfico/exportação | A tabela + totais responde a pergunta; exportar é a RF-075 (genérica). |
| Migration / entidade "indicador" | A origem existente basta para o relatório. |

## Riscos

| Risco | Mitigação |
|---|---|
| Origem inconsistente (typos) fragmenta as fontes | Aceito: agrupa pelo texto como está; a normalização é fora de escopo e sinalizada. |
| Oportunidade ganha com várias propostas aceitas | Soma os itens de **todas** as propostas aceitas da oportunidade (caso raro; comportamento previsível). |
| "Todo o histórico" pesado | O volume de oportunidades ganhas é pequeno; a agregação é em memória sobre uma consulta simples. |
