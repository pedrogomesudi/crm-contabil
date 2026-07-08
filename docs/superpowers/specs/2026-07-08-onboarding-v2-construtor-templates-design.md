# Onboarding — v2: construtor de templates — Design

**Data:** 2026-07-08
**Marco:** transformar o editor de itens (Ciclo A) num **construtor completo**: criar/editar/ativar/excluir
**templates**, criar/editar/remover/reordenar **blocos**, reordenar **itens**, e **escolher o template** ao
instanciar um processo. Habilita templates por tipo de serviço (base do RF-012).

**Contexto:** as tabelas `onboarding_template`/`onboarding_bloco`/`onboarding_template_item` (Ciclo A) já
suportam vários templates. Hoje `listarTemplate()` carrega o **primeiro template ativo** e o editor só
mexe nos itens (blocos vêm do seed); `iniciarProcesso` usa o primeiro template ativo. Não há UI para
criar templates/blocos nem para escolher template. Gate `podeGerenciarModeloOnboarding` (admin) para o
construtor; `podeCriarCliente` para instanciar.

## Decisões (do brainstorming)

1. **Escolher o template no formulário** ao iniciar o processo (seletor com os templates ativos).
2. **Reordenar com campo de ordem + setas ↑↓** (sem drag-and-drop).
3. `ativo` controla quem aparece na instanciação; **excluir bloqueado** se houver processos (preserva
   histórico) — usar desativar.

## Escopo (v2)

- Actions de template (CRUD + ativar), bloco (CRUD + mover), item (mover); `obterTemplate(id)`,
  `listarTemplates`, `listarTemplatesAtivos`; `iniciarProcesso` recebe `templateId`.
- Helpers puros: `slugify`, `alvoTroca` (reordenação).
- UI: gerenciador de templates (lista) + editor por template (rota `[id]`) + seletor no formulário.
- **Sem migration.**

**Fora do v2:** Ciclo C (alertas/consultoria/comercial).

## Helpers puros — `src/lib/onboarding/template-util.ts` (TDD)

```ts
// "Abertura Simples" → "abertura-simples"; remove acento, minúsculas, hífens.
export function slugify(nome: string): string;

// Alvo de troca ao mover (↑ "cima" / ↓ "baixo"): id do vizinho na ordenação por `ordem`, ou null na borda.
export function alvoTroca(itens: { id: string; ordem: number }[], id: string, direcao: "cima" | "baixo"): string | null;
```
Regras:
- `slugify`: `normalize("NFD")` sem diacríticos, minúsculo, `[^a-z0-9]+` → `-`, trim de `-`.
- `alvoTroca`: ordena por `ordem` (estável), acha o índice do `id`; `cima` → vizinho anterior, `baixo` →
  próximo; `null` se não existir (borda) ou id ausente.

## Actions — `src/app/(app)/onboarding/template-actions.ts` (estender)

Gate **admin** (`podeGerenciarModeloOnboarding`) em tudo abaixo, exceto leitura (`podeCriarCliente`).

- `listarTemplates(): Promise<TemplateResumo[]>` — `{ id, nome, descricao, ativo, blocos, itens, processos }`
  (contagens agregadas). Ordena por nome.
- `obterTemplate(templateId: string): Promise<TemplateView>` — o template completo (blocos+itens); é o
  atual `listarTemplate`, agora **por id** (renomeado). `TemplateView` ganha `descricao` e `ativo`.
- `listarTemplatesAtivos(): Promise<{ id: string; nome: string }[]>` — para o seletor de instanciação.
- `criarTemplate(nome: string, descricao: string | null): Promise<{ id?: string; erro?: string }>` —
  gera `slug` de `slugify(nome)` com sufixo `-2/-3…` se já existir; insere `ativo=true`.
- `salvarTemplate(id, nome, descricao, ativo): Promise<{ ok?; erro? }>`.
- `excluirTemplate(id): Promise<{ ok?; erro? }>` — se `count(onboarding_processo where template_id=id) > 0`
  → `{ erro: "Há processos usando este template; desative-o." }`; senão `delete` (cascata blocos/itens).
- `criarBloco(templateId, nome, prazoBlocoDias): Promise<{ ok?; erro? }>` — `ordem = (maior ordem)+1`,
  `slug = 'bloco-'+ordem`.
- `salvarBloco(id, nome, prazoBlocoDias, ordem): Promise<{ ok?; erro? }>`.
- `removerBloco(id): Promise<{ ok?; erro? }>` (cascata itens).
- `moverBloco(id, direcao): Promise<{ ok?; erro? }>` — lê os blocos do template do bloco, usa `alvoTroca`,
  **troca os valores de `ordem`** dos dois (dois updates).
- `moverItem(id, direcao): Promise<{ ok?; erro? }>` — idem, entre itens do mesmo bloco.

`salvarTemplateItem`/`removerTemplateItem` já existem e funcionam para qualquer bloco.
`semearTemplatePadrao` permanece (botão quando não há template padrão).

## Actions — `src/app/(app)/clientes/[id]/processo.ts`

- `iniciarProcesso(clienteId, perfil, flags, dataInicio, templateId: string)` — usa o `templateId` recebido
  (em vez do primeiro ativo). Se `templateId` inválido/sem itens aplicáveis → processo vazio (aviso já
  tratado). Mantém idempotência (não duplica se já houver processo).

## UI

### Gerenciador — `src/app/(app)/configuracoes/onboarding/page.tsx` + `GerenciadorTemplates.tsx`
Gate admin. Lista os templates (`listarTemplates`): nome, badge ativo/inativo, contagem de blocos/itens e
de processos. Ações por linha: **abrir** (link `/configuracoes/onboarding/{id}`), **ativar/desativar**,
**excluir** (com confirmação; erro amigável se houver processos). Botão **"Novo template"** (nome +
descrição → `criarTemplate` → redireciona ao editor). Se não houver nenhum template: botão **"Semear
template padrão"**.

### Editor — `src/app/(app)/configuracoes/onboarding/[id]/page.tsx` + `EditorTemplate.tsx` (evoluir)
Gate admin. Carrega `obterTemplate(id)`. Seções:
- **Configurações do template:** nome, descrição, ativo → `salvarTemplate`.
- **Blocos:** lista com nome, prazo D+n, **↑↓** (`moverBloco`), editar (`salvarBloco`), remover
  (`removerBloco`) e **"+ bloco"** (`criarBloco`). Dentro de cada bloco, os **itens** (form já existente do
  Ciclo B) com **↑↓** (`moverItem`), editar/remover e "+ item".
- O `EditorTemplate` atual (tabela de itens por bloco + modal do item) é reaproveitado; adiciona-se a
  gestão de blocos e as setas.

### Instanciação — `src/components/onboarding/ProcessoSection.tsx` + ficha do cliente
- `ProcessoSection` recebe `templates: { id: string; nome: string }[]` (ativos). No formulário de iniciar,
  um **seletor de template** (aparece sempre; pré-seleciona o primeiro). `iniciarProcesso` recebe o
  `templateId` escolhido.
- A página do cliente carrega `listarTemplatesAtivos()` e passa como prop.

### Navegação
O link em Configurações continua "Template de onboarding" → agora abre o **gerenciador** (lista).

## Tratamento de erros
- Sem permissão → redirect / `{ erro }`.
- Excluir template com processos → `{ erro }` amigável (desative).
- Mover na borda → no-op (sem erro).
- Instanciar sem nenhum template ativo → o formulário avisa "cadastre um template ativo".
- `criarTemplate` com nome vazio → `{ erro }`; slug sempre único (sufixo).

## Testes
- **Unit (Vitest):** `slugify` (acentos, espaços, símbolos, colisão de forma pura só do slug base);
  `alvoTroca` (meio, bordas, id ausente, ordem não sequencial).
- **Smoke:** `GerenciadorTemplates` renderiza a lista (vazia e com templates) sem lançar; `EditorTemplate`
  renderiza blocos+itens sem lançar; `ProcessoSection` (sem processo) mostra o seletor de template.

## Migrations
Nenhuma.
