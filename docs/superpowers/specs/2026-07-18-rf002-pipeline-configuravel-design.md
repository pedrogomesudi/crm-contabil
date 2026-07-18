# RF-002 — Pipeline com etapas configuráveis + visual rico — Design

**O que é:** fecha a RF-002. O funil comercial ganha (a) a cara do pipeline que o Pedro desenhou —
métricas no topo, busca, cards ricos — e (b) **etapas configuráveis pelo escritório**, saindo do enum
fixo. Um design; **três fatias de implementação** sequenciais (dados → visual → configuração).

## O estado de hoje (medido)

- O funil (`QuadroComercial.tsx`) tem **4 etapas ativas FIXAS** + `ganho`/`perdido`, num **enum do
  Postgres** (`oportunidade_etapa`, migration `0054`). Configurável é impossível: enum é fixo por
  definição.
- O card mostra só **nome + valor + responsável**. Falta o do mockup: **segmento**, **badge de regime**,
  **avatar**, **dias na etapa**. O topo **não** tem métricas (conversão/ciclo vivem em `MetricasFunil`,
  outra tela) nem busca.
- **`ganho`/`perdido` não são etapas comuns:** o código inteiro os trata como **estados terminais de
  sistema** — a conversão é `ganhos / (ganhos + perdidos)` (`metricas.ts:99-104`) e o `fechadoEm`. Raio da
  mudança (quem lê `etapa`/o enum): `comercial/{actions,QuadroComercial,MetricasFunil}`,
  `lib/comercial/{funil,metricas}`, e os testes de funil/métricas/quadro. **A "régua de cobrança"
  (`regua_etapa`) NÃO entra** — apesar do nome, é a cobrança financeira, sem relação com a etapa da
  oportunidade (o grep casa "etapa" por coincidência de nome).

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| O que é configurável | **Só as etapas ATIVAS.** `ganho`/`perdido` continuam estados de sistema | Os dois carregam significado no código (conversão, fechado, régua). Configurá-los obrigaria o escritório a nunca apagá-los e o código a adivinhar qual "significa ganho". É o que Pipedrive/HubSpot fazem: você configura as fases, won/lost é do sistema. |
| Modelo | **Tabela `funil_etapa`** (semeada com as 4 atuais); `oportunidade.etapa` → FK-ou-terminal | Enum não é configurável; tabela é. |
| Arquivar × apagar | **Arquivar** (nunca apagar) | Oportunidades históricas apontam para a etapa; apagar quebraria métricas passadas. Arquivada some do quadro, o histórico fica íntegro. |
| Campos novos | `segmento` (texto), `regime` (reusa o enum `REGIMES` do cliente), `etapa_desde` (timestamp) | O card do mockup pede segmento, badge de regime e "dias na etapa". O `regime` reusa `REGIMES` de `lib/tipos.ts` (Simples/Presumido/Real/MEI/Isento-PF) — mesma classificação do cliente, o prospect vira cliente com ela. `etapa_desde` muda **só** na troca de etapa. |
| Onde fica a config | **Configurações → Funil** (`/configuracoes/funil`) | É config de escritório, como SLA/matriz/marca — o padrão já existente lá. |
| Multi-tenant | **Fora** | Single-tenant hoje (RNF-01 pendente). A config é do único escritório; ganha `tenant_id` quando o RNF-01 vier. |

## Arquitetura

### O modelo de dados (Fatia A)

```sql
-- funil_etapa: as etapas ativas, geridas pelo escritório.
create table funil_etapa (
  id uuid primary key default gen_random_uuid(),
  rotulo text not null,
  ordem int not null,
  cor text not null default '#5A6163',
  probabilidade numeric(4,3) not null default 0.5,  -- p/ o "ponderado" das métricas
  arquivada boolean not null default false,
  criado_em timestamptz not null default now()
);
-- semeia as 4 atuais na ordem: Novo, Contato feito, Proposta enviada, Negociação.
```

`oportunidade.etapa` (hoje enum) passa a distinguir **etapa ativa** (FK para `funil_etapa`) de **terminal**
(`ganho`/`perdido`). Forma escolhida:
- `etapa_id uuid references funil_etapa(id)` — a etapa ativa; **null** quando a oportunidade está fechada.
- `desfecho text` — `null` (ativa), `'ganho'` ou `'perdido'`.
- Regra: exatamente um dos dois preenchido (`check ((etapa_id is null) != (desfecho is null))`).
- `etapa_desde timestamptz not null default now()` — atualizado só na troca de etapa (na action `definirEtapa`).
- `segmento text`, `regime text`.

> **Migração dos dados:** as 4 etapas do enum viram 4 linhas em `funil_etapa`. Cada oportunidade ativa
> recebe o `etapa_id` correspondente ao rótulo; as `ganho`/`perdido` recebem `desfecho` e `etapa_id = null`.
> Nenhuma oportunidade fica órfã. A migration faz o de-para. **É idempotente** e reversível na prática
> (a coluna enum antiga pode permanecer por uma migration como back-stop, ou ser derrubada — decisão no plano).

### A lógica pura (Fatia A)

`lib/comercial/funil.ts` e `metricas.ts` deixam de depender do enum literal:
- `resumoFunil`, `metricasFunil` recebem as etapas ativas **como dado** (a lista de `funil_etapa`), não a
  constante. A conversão continua `ganhos/(ganhos+perdidos)` — inalterada, porque os terminais seguem fixos.
- Nova função pura `diasNaEtapa(etapaDesde, agora): number` e a cor semântica (recente/atenção/parado).
- `etapaAdjacente` passa a operar sobre a lista dinâmica de etapas ativas.

### O pipeline visual (Fatia B) — `QuadroComercial.tsx`

- **Faixa de 4 `StatCard`:** valor em pipeline, ponderado (Σ valor × probabilidade da etapa), taxa de
  conversão, ciclo médio. Os dois últimos migram da `MetricasFunil`.
- **Busca** "Buscar negócio…" — filtro em memória por nome/segmento.
- **Card rico:** nome · **segmento** · **valor /mês** · **badge de regime** (só se preenchido; via
  `badgeRegime` de `lib/ui/apresentacao`, que já mapeia `REGIMES` → variante do `Badge`) · **avatar**
  (componente `Iniciais`) · **dias na etapa** (cor semântica).
- **Coluna:** rótulo + contador + subtotal (`R$ 6,9k`), como hoje via `resumoFunil`; cor da coluna vem da
  `funil_etapa`.
- **"+ Adicionar"** por coluna e **"+ Novo negócio"** no topo — o fluxo de criar que já existe.
- Drag-and-drop entre etapas: inalterado (agora sobre etapas dinâmicas).

### A configuração (Fatia C) — `/configuracoes/funil`

- Lista das etapas ativas, **arrastáveis** para reordenar; cada uma com rótulo (inline), cor e
  probabilidade padrão.
- **Adicionar / renomear / recolorir / arquivar.**
- **`ganho`/`perdido`** listados como **estados de sistema**, não editáveis/removíveis (para o escritório
  ver que existem, sem quebrá-los).
- **Não arquivar etapa com oportunidade ativa** — move os negócios primeiro. Mensagem clara.
- O quadro passa a ler as colunas de `funil_etapa` (ativas, ordenadas), não do array fixo.

## Fatias de implementação

| Fatia | Entrega | Visível? |
|---|---|---|
| **A — dados** | migration (`funil_etapa`, `etapa_id`/`desfecho`/`etapa_desde`/`segmento`/`regime`), de-para dos dados, lógica pura dinâmica | Não — fundação |
| **B — pipeline visual** | métricas no topo, busca, cards ricos | Sim |
| **C — configuração** | `/configuracoes/funil` + quadro lendo a config | Sim |

Cada fatia tem spec/plano próprios ao chegar nela — **o design é este, único**.

## Verificação

- **Lógica pura testável:** `metricasFunil` com etapas dinâmicas (conversão inalterada), `diasNaEtapa` e a
  cor, `resumoFunil` sobre lista dinâmica, `etapaAdjacente` dinâmica.
- **Migração provada:** as 4 etapas viram 4 linhas; toda oportunidade ativa com `etapa_id` válido, toda
  fechada com `desfecho`; nenhuma órfã (`select count(*) where etapa_id is null and desfecho is null` = 0).
- **Não-regressão:** os testes de funil/métricas/quadro seguem verdes (adaptados às etapas dinâmicas);
  `lint`, `typecheck`, `build`, `format:check`.
- **Migration em produção antes do deploy** de cada fatia que a exija (Fatia A) — SQL Editor, como as anteriores.
- **Visual:** o Pedro confere o pipeline (Fatia B) e a config (Fatia C).

## Fora de escopo

| O quê | Por quê |
|---|---|
| Multi-tenant na config | Single-tenant hoje; ganha `tenant_id` com o RNF-01. |
| Automações por etapa (mover→dispara) | Outra RF; não é configurar a etapa, é reagir a ela. |
| Ponderado preditivo | Usa a probabilidade da etapa (config), não um modelo. |
| `ganho`/`perdido` configuráveis | São estados de sistema — ver Decisões. |

## Riscos

| Risco | Mitigação |
|---|---|
| A migração enum→tabela deixar oportunidade órfã | O de-para cobre as 4 etapas + terminais; o `check` do banco garante que uma das duas colunas está sempre preenchida; teste de contagem = 0 órfãs. |
| Quebrar a conversão/métricas ao tornar etapas dinâmicas | `ganho`/`perdido` **não** viram configuráveis — a lógica de conversão fica byte a byte. |
| Arquivar uma etapa esvaziar o quadro de negócios | Bloqueio: não arquiva etapa com oportunidade ativa. |
| O raio da mudança (7+ arquivos leem `etapa`) | Fatia A isola a mudança de modelo; typecheck pega todos os leitores; entrega sem UI visível antes das fatias B/C. O raio real é menor do que parece: a régua de cobrança casa "etapa" só por nome e não entra. |
