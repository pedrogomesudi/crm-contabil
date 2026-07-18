# RF-003 — Calculadora de precificação de honorários (parametrizável) — Design

**O que é:** um motor de precificação **configurável pelo escritório** que sugere o honorário a partir de
regime, faturamento, funcionários, notas, complexidade e serviços adicionais — exposto como **simulador
avulso** e **integrado à proposta**. Fecha a RF-003 (domínio Comercial). Um design; **três fatias de
implementação** sequenciais (motor+config → calculadora avulsa → integração na proposta).

## O estado de hoje (medido)

- A proposta (`0057_comercial_proposta.sql`) é um cabeçalho `proposta` + linhas `proposta_item`
  (`descricao`, `valor`, `recorrencia` `mensal`/`unico`, `ordem`). O valor de cada item é **digitado à mão**.
- A oportunidade tem `valor_estimado` (também manual). **Não existe nenhuma fórmula de preço** no sistema.
- Os regimes já são um vocabulário do projeto: `REGIMES` em `@/lib/tipos`
  (`Simples`/`Presumido`/`Real`/`MEI`/`Isento/PF`).
- A configuração de escritório segue um padrão consolidado: hub em `configuracoes/page.tsx`, cada tela com
  `page.tsx` (server, gate) + client + `actions.ts` (gate admin nas mutações). A RF-002 (funil) é o exemplo
  mais recente.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Papel da calculadora | **Simulador avulso E integrado à proposta** — mesmo motor | Cobre cotação rápida e a geração do valor na proposta com uma só lógica. |
| Lógica de preço | **Base por regime + acréscimos** | É como o escritório precifica; legível e previsível para quem configura. |
| Acréscimos (faturamento/funcionários/notas) | **Cada fator escolhe** entre `faixas` e `unidade` | Flexibilidade pedida: uns fatores tabelam melhor por faixa, outros por quantidade. |
| Complexidade | **Multiplicador por nível** (Baixa/Média/Alta, editável) | Ajuste percentual simples sobre o recorrente. |
| Serviços adicionais | **Catálogo configurável** (nome, valor, recorrência) | Somados por cima; viram itens próprios na proposta. |
| Piso e desconto | **Valor mínimo** (piso) + **desconto** na cotação com **desconto máximo** | Protege a margem; o desconto nunca derruba abaixo do piso. |
| Resultado na proposta | **Item consolidado + snapshot salvo** | Um item "Honorários — R$ X/mês"; serviços viram itens próprios; o snapshot guarda de onde veio o valor. |
| Modelo de config | **Tabelas normalizadas** (não um `jsonb` único) | RLS granular e tela de configuração legível, no padrão do projeto. |
| Multi-tenant | **Fora** | Single-tenant hoje (RNF-01 pendente); a config é do único escritório. |

## Arquitetura

### O modelo de dados (Fatia A/C)

Config (um escritório; leitura para admin/assistente/contador, escrita via action com gate admin):

```sql
-- Valor-base mensal por regime (5 linhas, uma por REGIME).
create table precificacao_regime_base (
  regime text primary key,          -- 'Simples' | 'Presumido' | 'Real' | 'MEI' | 'Isento/PF'
  valor_base numeric(12,2) not null default 0
);

-- Um por fator numérico: como o acréscimo é calculado.
create table precificacao_fator (
  fator text primary key,           -- 'faturamento' | 'funcionarios' | 'notas'
  modo text not null default 'faixas',   -- 'faixas' | 'unidade'
  valor_unitario numeric(12,2) not null default 0,  -- modo 'unidade'
  franquia numeric(14,2) not null default 0         -- quantidade grátis antes de cobrar (modo 'unidade')
);

-- Faixas de um fator (modo 'faixas'): 'ate' é o limite superior; a última faixa tem ate = null (∞).
create table precificacao_faixa (
  id uuid primary key default gen_random_uuid(),
  fator text not null references precificacao_fator(fator) on delete cascade,
  ate numeric(14,2),                -- null = sem teto
  valor numeric(12,2) not null default 0,
  ordem int not null
);

-- Níveis de complexidade (multiplicador sobre o recorrente).
create table precificacao_complexidade (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  multiplicador numeric(5,3) not null default 1.0,
  ordem int not null
);

-- Catálogo de serviços adicionais.
create table precificacao_servico (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  valor numeric(12,2) not null default 0,
  recorrencia text not null default 'mensal',  -- 'mensal' | 'unico'
  ativo boolean not null default true,
  ordem int not null
);

-- Config global (singleton, uma linha).
create table precificacao_config (
  id boolean primary key default true check (id),   -- garante linha única
  valor_minimo numeric(12,2) not null default 0,
  desconto_maximo_pct numeric(5,2) not null default 0  -- 0..100
);
```

RLS em todas: `for all using (auth_papel() in ('admin','assistente','contador')) with check (…)`.
**Seeds** (idempotentes): as 5 linhas de `precificacao_regime_base` (valor 0), as 3 de `precificacao_fator`
(modo `faixas`), os 3 níveis de complexidade (Baixa 1.0 / Média 1.2 / Alta 1.5), a linha única de
`precificacao_config`. Serviços e faixas nascem vazios (o escritório preenche).

Snapshot (Fatia C): coluna `precificacao jsonb` em **`proposta`** — guarda `{ parametros, detalhamento,
mensal, unico }` no momento em que a calculadora gera os itens. O simulador avulso **não** salva.

### O motor de cálculo (Fatia A) — `src/lib/comercial/precificacao.ts`

Função pura, sem banco nem UI:

```ts
type ModoFator = "faixas" | "unidade";
type Fator = { modo: ModoFator; valorUnitario: number; franquia: number; faixas: { ate: number | null; valor: number }[] };
type ConfigPreco = {
  baseRegime: Record<string, number>;
  faturamento: Fator; funcionarios: Fator; notas: Fator;
  complexidades: { id: string; multiplicador: number }[];
  servicos: { id: string; valor: number; recorrencia: "mensal" | "unico" }[];
  valorMinimo: number; descontoMaximoPct: number;
};
type Parametros = {
  regime: string; faturamento: number; funcionarios: number; notas: number;
  complexidadeId: string | null; servicoIds: string[]; descontoPct: number;
};
type Linha = { rotulo: string; valor: number };
type Resultado = { mensal: number; unico: number; detalhamento: Linha[] };

export function calcularHonorario(p: Parametros, cfg: ConfigPreco): Resultado;
```

Ordem (registra cada passo em `detalhamento`):
1. `base` = `baseRegime[p.regime] ?? 0`.
2. `+ acrescimo(faturamento)`, `+ acrescimo(funcionarios)`, `+ acrescimo(notas)` — cada um:
   - modo `faixas`: primeira faixa (por `ordem`) cuja `ate` ≥ valor (última, `ate=null`, pega o resto);
   - modo `unidade`: `valorUnitario × max(0, valor − franquia)`.
3. `recorrente = (base + acréscimos) × multiplicador(complexidadeId)` (multiplicador 1 se não houver nível).
4. `+ serviços mensais` (marcados, recorrência `mensal`) em `recorrente`; serviços `unico` somam `unico`.
5. `desconto = recorrente × min(descontoPct, descontoMaximoPct)/100` → `recorrente −= desconto`.
6. `mensal = max(valorMinimo, recorrente)` (o piso é checado **depois** do desconto).

Funções auxiliares puras testáveis: `acrescimoFator(fator, valor)`, `multiplicador(complexidades, id)`.

### A configuração (Fatia A) — `/configuracoes/precificacao` (admin)

Uma tela no hub, em blocos autocontidos (cada um com sua action, gate admin):
- **Valores-base por regime** — um campo por `REGIME`.
- **Por fator** (faturamento/funcionários/notas) — seletor de modo; em `faixas`, editor de faixas
  ("até X → valor", última faixa ∞); em `unidade`, `valor unitário` + `franquia`.
- **Complexidade** — lista de níveis (nome + multiplicador), adicionar/remover/reordenar.
- **Serviços adicionais** — catálogo (nome, valor, recorrência, ativo).
- **Globais** — valor mínimo, desconto máximo.

### A calculadora (Fatias B e C) — `src/app/(app)/comercial/precificacao/*`

Formulário comum: regime (select), faturamento/funcionários/notas (numéricos), complexidade (select),
serviços (marcáveis), desconto (%). O motor roda no **cliente** (reação em tempo real); a config vem
carregada do servidor. Ao lado, o resultado: **mensal**, **único**, **detalhamento**.

- **Avulsa (Fatia B):** página `/comercial/precificacao` — só simula, não salva, sem vínculo.
- **Integrada (Fatia C):** botão **"Calcular honorários"** no editor da proposta abre a mesma calculadora;
  em **"Usar na proposta"** cria o item consolidado `"Honorários contábeis — R$ X/mês"` (mensal), um item
  por serviço adicional marcado (com a recorrência dele), e salva o snapshot na proposta.

## Fatias de implementação

| Fatia | Entrega | Visível? | Migration? |
|---|---|---|---|
| **A — motor + config** | `calcularHonorario` (testado) + 6 tabelas semeadas + tela `/configuracoes/precificacao` | Sim (config, admin) | Sim (tabelas) |
| **B — calculadora avulsa** | `/comercial/precificacao` (simular, ver mensal/único/detalhamento) | Sim | Não |
| **C — integração na proposta** | botão "Calcular honorários" no editor da proposta → itens + snapshot | Sim | Sim (coluna `precificacao jsonb`) |

Cada fatia tem spec/plano próprios ao chegar nela — **o design é este, único**.

## Verificação

- **Motor testável:** `calcularHonorario` cobre base por regime, acréscimo por faixa e por unidade (com
  franquia), multiplicador de complexidade, serviços mensais/únicos, desconto (com teto) e piso — inclusive
  a ordem "piso depois do desconto".
- **Migração provada:** seeds idempotentes; `precificacao_config` com uma linha só (check `id`).
- **Config → calculadora:** mudar um valor na config muda o resultado da calculadora.
- **Integração:** "Usar na proposta" cria os itens certos (consolidado + serviços) e grava o snapshot; o
  detalhamento fica no snapshot, não em itens.
- **Não-regressão:** `lint`, `typecheck`, `test`, `format:check`, `build`. Migration em produção antes do
  deploy das fatias A e C (SQL Editor), como nas anteriores.

## Fora de escopo

| O quê | Por quê |
|---|---|
| Multi-tenant na config | Single-tenant hoje; ganha `tenant_id` com o RNF-01. |
| Reajuste automático de propostas quando a tabela muda | O snapshot preserva o valor antigo de propósito; reprecificar é ação manual. |
| Precificação preditiva / por IA | A calculadora é determinística sobre regras configuradas. |
| Aprovação de desconto acima do teto (workflow) | O teto é um limite duro; um fluxo de aprovação é outra RF. |

## Riscos

| Risco | Mitigação |
|---|---|
| Faixas mal configuradas (buraco/sobreposição) | A busca pega a primeira faixa por `ordem` com `ate ≥ valor`; a última (`ate=null`) é o fallback. A tela ordena e mostra as faixas em sequência. |
| Config incompleta (regime sem base, sem faixas) | O motor trata ausência como 0 e nunca quebra; o piso garante um mínimo. |
| Desconto derrubar a margem | `desconto_maximo_pct` limita, e o piso (`valor_minimo`) é o chão final. |
| Snapshot divergir da config futura | É o objetivo — a proposta preserva o cálculo original; a config nova só afeta cálculos novos. |
