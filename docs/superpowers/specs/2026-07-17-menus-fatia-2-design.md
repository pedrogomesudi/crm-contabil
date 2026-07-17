# Redesign — Fatia 2: arquitetura de navegação — Design

**Pedido:** "avaliar a funcionalidade de cada menu e integrá-los, de forma que as funcionalidades que
interagem fiquem juntas, separando as demais em menus distintos."

**As três dores, na ordem que o Pedro deu:**

1. **Menu grande demais** — 12 itens planos, sem hierarquia: "Configurações" tem o mesmo peso de "Clientes".
2. **Telas escondidas** — 11 rotas fora do menu.
3. **Fluxo quebrado** — o menu espelha a estrutura do código, não o trabalho.

As três têm a mesma raiz, e (1) e (2) puxam para lados opostos ("menos itens" × "nada escondido"). O que
concilia é **hierarquia**: com grupos, mais itens cabem sem mais peso visual.

## O diagnóstico (medido)

| Achado | Evidência |
|---|---|
| **11 rotas órfãs** | `/obrigacoes` (+ riscos, escalonamento, conformidade), `/vencimentos`, `/nfse/lote`, `/usuarios`, `/lgpd`, `/integracoes/dominio`, `/clientes/responsaveis`, `/tarefas/recorrencias`, `/solicitacoes/internas`, `/onboarding/alertas`. |
| **A pior:** Conformidade | Sidebar → **Clientes** → chip "Obrigações" → botão no calendário. **3 cliques**, e nada no nome "Clientes" sugere conformidade fiscal. O botão ainda usa `<a>` cru (perde navegação client-side). |
| **5 padrões concorrentes** de navegação secundária | `SubNav` (só 2 telas) · grids de hub · `<Voltar>` (13 telas) · links "← voltar" soltos (~15) · botões-âncora imitando abas. |
| **Obrigações e Vencimentos moram em "Clientes"** | Por falta de lugar melhor (`Sidebar.tsx:56-60`, mapa `FILHAS`). O badge de Clientes soma três origens diferentes num número só. |
| **Hubs grandes** | Financeiro: **16 telas**. Configurações: **16 telas**. |
| **O único ciclo bem integrado** | Comercial ↔ Onboarding ↔ Clientes. O resto é ilha (Comunicados não recebe link de ninguém). |

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Estrutura | **Grupos com título, itens sempre visíveis** | Resolve (1) e (2) juntas: hierarquia reduz peso sem esconder. Accordion foi descartado — recolher esconde, que é a dor (2). |
| Camadas | **Duas, e só duas:** menu = seções · SubNav = telas da seção | Mata os 5 padrões concorrentes. Sem terceira camada. |
| Grupos | **OPERAÇÃO · ENTRADA · RELACIONAMENTO · FINANCEIRO**, com Início e Configurações soltos | Agrupados pelo que **interage de fato** (grafo de links medido), não pela estrutura de pastas. |
| Obrigações e Vencimentos | **Saem de Clientes** e viram itens próprios em OPERAÇÃO | Nada em "Clientes" sugere conformidade fiscal. |
| Badges | **Cada item mostra o seu** | Hoje Clientes soma obrigações + escalonamento + vencimentos num número só. Separado é mais honesto — e o `Sidebar.tsx:33-35` já avisa: "um alerta que ninguém vê é um alerta que não existe". |
| Financeiro e Configurações | **Mantêm o hub** | 16 telas cada; explodir somaria 32 itens e recriaria a dor (1). O defeito de hoje não é o hub — é ele ser o **único** caminho. |
| Ícones | **Não** | O menu nunca teve. Introduzi-los é outra decisão (escolher um set, manter coerência em 20 itens) e não serve a nenhuma das 3 dores. YAGNI. |

## O mapa

```
Início

OPERAÇÃO            ← o dia a dia
  Clientes ③          SubNav: Lista · Responsáveis · NFS-e em lote
  Obrigações ②        SubNav: Calendário · Riscos · Escalonamento · Conformidade
  Vencimentos ①
  Tarefas             SubNav: Painel · Recorrências
  Timesheet

ENTRADA             ← o ciclo de aquisição
  Comercial           SubNav: Funil · Propostas · Métricas
  Onboarding ②        SubNav: Processos · Alertas
  Legalização

RELACIONAMENTO      ← o que fala com o cliente
  Atendimento
  Solicitações        SubNav: Do portal · Internas
  Comunicados

FINANCEIRO
  Financeiro          hub de 16 telas (mantido)

Configurações         hub de 16 telas (mantido) — inclui Usuários, LGPD, Domínio
```

## RBAC — grupo vazio não pode virar título órfão

O papel **`financeiro`** (`podeGerenciarFinanceiro`: admin, financeiro) **não** vê Onboarding, Legalização
nem Comercial — o grupo **ENTRADA ficaria com título e nada embaixo**.

**Regra:** um grupo só é renderizado se tiver **ao menos um item visível** para o papel. O menu de cada
papel fica assim:

| Papel | Vê |
|---|---|
| `admin` | tudo |
| `contador` / `assistente` | tudo menos FINANCEIRO (contador não tem `podeGerenciarFinanceiro`; assistente vê Configurações) |
| `financeiro` | Início · OPERAÇÃO (Clientes, Tarefas, Timesheet) · RELACIONAMENTO (Atendimento) · FINANCEIRO. **Sem ENTRADA** — o grupo some inteiro. |
| `cliente` | não vê o Sidebar (o layout o manda para `/portal`) |

**As permissões não mudam.** Esta fatia mexe em **onde as coisas aparecem**, nunca em **quem pode vê-las**:
cada item mantém exatamente o gate que tem hoje.

## Arquitetura

### Componentes

| Arquivo | Mudança |
|---|---|
| `src/components/Sidebar.tsx` (modificar) | A lista plana vira grupos. Continua client component (usa `usePathname`). |
| `src/lib/ui/navegacao.ts` (criar) | **O mapa do menu como dado puro** — grupos, itens, hrefs e a função de filtro por papel. Testável sem render. |
| `src/app/(app)/layout.tsx` (modificar) | Passa as contagens de badge separadas (hoje o Sidebar as soma). |
| Telas de seção (modificar) | Ganham `SubNav` onde hoje há links soltos: `/obrigacoes`, `/tarefas`, `/solicitacoes`, `/onboarding`. `/clientes` e `/comercial` já têm. |

**Por que `navegacao.ts` puro:** o menu é regra (quem vê o quê), e regra se testa sem DOM. O `Sidebar` fica
só com o render. Segue o padrão do projeto: `filtroStatus.ts`, `busca.ts`, `permissoes.ts` são puros e
testados.

### Fora de escopo

Ícones; mexer nos hubs de Financeiro/Configurações; unificar `<Voltar>` × "← voltar" (~28 telas — vale uma
fatia própria); migrar os ~55 `amber`; as ~10 cópias divergentes do `inputCls`; o `<main>` aninhado.

## Verificação

- **Puro:** teste de `navegacao.ts` — para cada um dos 5 papéis, quais grupos/itens aparecem; e a regra do
  grupo vazio (ENTRADA some para `financeiro`).
- **Render:** o `Sidebar` mostra os títulos de grupo; realça só o item ativo; badges por item.
- **Nenhuma rota órfã:** teste que cruza as rotas de `src/app/(app)/**/page.tsx` com o mapa —
  toda rota de topo de seção está no menu **ou** num SubNav declarado. É o que impede a dor (2) de voltar.
- **RBAC intacto:** os gates de cada item são os mesmos de hoje, um a um.
- **Não-regressão:** 669 testes verdes; `lint`, `typecheck`, `build`, `format:check` limpos.

## Riscos

| Risco | Mitigação |
|---|---|
| **Memória muscular:** "Obrigações" sai de dentro de Clientes | É o objetivo — mas o mapa `FILHAS` do Sidebar continua realçando a seção certa se alguém chegar por link antigo. Nenhuma URL muda: só o caminho até ela. |
| Grupo vazio virar título órfão | Regra explícita + teste por papel. |
| Badge sumir na reorganização | Cada item passa a ter o seu; o teste confere que a soma de hoje (Clientes) vira as parcelas. |
| Menu ficar mais longo (15 itens vs 12) | Aceito: com grupos, o peso visual cai mesmo com mais itens. Cabe em `h-screen` sem rolagem. |
