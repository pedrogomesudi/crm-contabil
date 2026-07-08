# Onboarding — Ciclo B: write-back, dependências e anexo — Design

**Data:** 2026-07-08
**Marco:** enriquece o motor de processo (Ciclo A) com três regras dos itens: gravação no cadastro ao
concluir (`campo_destino`), dependências entre itens (`depende_de`) e anexo obrigatório (upload).

**Contexto:** Ciclo A entregue (migration 0050): `onboarding_template`/`_bloco`/`_template_item`,
`onboarding_processo`/`_processo_item` (com cofre), helpers `src/lib/onboarding/processo.ts`, actions e
UI (`ProcessoSection`, `EditorTemplate`). Template padrão semeado (`template-seed.ts`). Storage segue o
padrão de `documentos` (`admin.storage.from("documentos").upload(...)` + `createSignedUrl`).
`clientes` **não** tem `competencia_inicial` (será novo). Sem tabela de procurações.

## Decisões (do brainstorming)

1. **`campo_destino` = só competência inicial.** Novo campo `clientes.competencia_inicial`, gravado ao
   concluir o item 1.3. Os demais destinos do JSON (certificado/procurações/cofre) já vivem nas suas
   tabelas → ficam informativos (não geram write-back neste ciclo).
2. **`depende_de`:** não deixa concluir enquanto as dependências (por código, no mesmo processo) não
   estiverem concluídas/dispensadas.
3. **Anexo obrigatório:** item com `anexo_obrigatorio` não conclui sem um anexo (upload no Storage).

## Escopo (Ciclo B)

- Migration: colunas novas + `clientes.competencia_inicial` + backfill do template e dos processos.
- Seed constante atualizado (`depende_de`/`campo_destino`).
- Helper puro `motivosBloqueioConclusao` (TDD).
- Actions: enforce das 3 regras no salvar; upload/baixar/remover anexo; write-back da competência.
- UI: item mostra dependências pendentes, campo de competência, anexo; editor edita `depende_de`/`campo_destino`.

**Fora do Ciclo B:** alertas escalonados, oportunidades de consultoria, gatilho comercial (Ciclo C) e o
construtor de templates (v2).

## Dados — migration `0051_onboarding_ciclo_b.sql`

```sql
alter table clientes add column if not exists competencia_inicial date;

alter table onboarding_template_item add column if not exists depende_de text[] not null default '{}';
alter table onboarding_template_item add column if not exists campo_destino text;

alter table onboarding_processo_item add column if not exists depende_de text[] not null default '{}';
alter table onboarding_processo_item add column if not exists campo_destino text;
alter table onboarding_processo_item add column if not exists valor_destino text;
alter table onboarding_processo_item add column if not exists anexo_nome text;

-- Backfill do template semeado (por código, restrito ao slug padrão), idempotente.
update onboarding_template_item ti set campo_destino = 'competencia_inicial'
  from onboarding_bloco b join onboarding_template t on t.id = b.template_id
  where ti.bloco_id = b.id and t.slug = 'onboarding-cliente-existente' and ti.codigo = '1.3';
update onboarding_template_item ti set depende_de = '{4.6}'
  from onboarding_bloco b join onboarding_template t on t.id = b.template_id
  where ti.bloco_id = b.id and t.slug = 'onboarding-cliente-existente' and ti.codigo = '6.1';
update onboarding_template_item ti set depende_de = '{1.3,2.5}'
  from onboarding_bloco b join onboarding_template t on t.id = b.template_id
  where ti.bloco_id = b.id and t.slug = 'onboarding-cliente-existente' and ti.codigo = '6.2';
update onboarding_template_item ti set depende_de = '{1.1}'
  from onboarding_bloco b join onboarding_template t on t.id = b.template_id
  where ti.bloco_id = b.id and t.slug = 'onboarding-cliente-existente' and ti.codigo = '6.3';

-- Backfill dos processos já instanciados: copia do template por código.
update onboarding_processo_item pi set depende_de = ti.depende_de, campo_destino = ti.campo_destino
  from onboarding_processo pr, onboarding_bloco b, onboarding_template_item ti
  where pi.processo_id = pr.id and b.template_id = pr.template_id and ti.bloco_id = b.id and ti.codigo = pi.codigo;
```

Sem novos enums. `campo_destino` fica como texto (só `'competencia_inicial'` é acionado; extensível).

## Seed — `src/lib/onboarding/template-seed.ts` (atualizar)

Adicionar aos `Opts` do factory `it` os campos `dependeDe?: string[]` e `campoDestino?: string | null`;
e nos itens: `1.3` → `campoDestino: "competencia_inicial"`; `6.1` → `dependeDe: ["4.6"]`; `6.2` →
`dependeDe: ["1.3", "2.5"]`; `6.3` → `dependeDe: ["1.1"]`. (Mantém o resto igual.)

## Tipos (ampliar em `src/lib/onboarding/processo.ts`)

- `TemplateItem` e `ProcessoItemSeed` ganham `dependeDe: string[]` e `campoDestino: string | null`.
- `materializarProcesso` copia ambos para o seed.

## Helper puro — `motivosBloqueioConclusao` (TDD)

```ts
export function motivosBloqueioConclusao(
  item: { dependeDe: string[]; anexoObrigatorio: boolean; temAnexo: boolean; campoDestino: string | null; temValorDestino: boolean },
  itens: { codigo: string | null; status: StatusItem }[],
): string[]
```
Regras (retorna a lista de motivos; vazio = pode concluir):
- Para cada `codigo` em `dependeDe`, se não houver item irmão com esse `codigo` em `concluido`/`dispensado`
  → `"Depende de {codigo}"`.
- Se `anexoObrigatorio && !temAnexo` → `"Anexo obrigatório pendente"`.
- Se `campoDestino && !temValorDestino` → `"Informe o valor (competência inicial)"`.

## Actions — `src/app/(app)/clientes/[id]/processo.ts` (ampliar)

- `listarProcessoCliente` passa a devolver, por item, `dependeDe`, `campoDestino`, `valorDestino`,
  `anexoNome` e `temAnexo` (derivado de `anexo_path`). (`ItemProcessoView` ampliado.)
- `iniciarProcesso` insere `depende_de` e `campo_destino` dos seeds.
- `salvarProcessoItem` ganha `valorDestino?: string | null`; grava `valor_destino` e `campo_destino`.
  **Enforce ao concluir:** se `status === 'concluido'`, buscar os itens irmãos + estado de anexo do item,
  rodar `motivosBloqueioConclusao`; se houver motivos → `{ erro }` (não salva). Se o item concluído tem
  `campo_destino === 'competencia_inicial'` e `valorDestino`, gravar `clientes.competencia_inicial =
  <valorDestino como date (1º dia do mês)>`.
- **Anexo (Storage, padrão documentos, admin client, gated `podeCriarCliente` + item visível via RLS):**
  - `anexarProcessoItem(itemId, clienteId, form: FormData)` — lê o item (sessão, RLS), sobe o arquivo em
    `onboarding/{processoId}/{itemId}/{nomeSeguro}`, grava `anexo_path` + `anexo_nome`.
  - `urlAnexoProcessoItem(itemId)` — `createSignedUrl(anexo_path, 60)` → `{ url }`.
  - `removerAnexoProcessoItem(itemId, clienteId)` — remove do Storage + limpa `anexo_path`/`anexo_nome`.

## Actions — `src/app/(app)/onboarding/template-actions.ts` (ampliar)

- `listarTemplate` inclui `dependeDe` e `campoDestino` por item (`ItemTemplateView` ampliado).
- `salvarTemplateItem` recebe e grava `dependeDe: string[]` e `campoDestino: string | null`.

## UI

### `ProcessoSection.tsx`
- Por item, calcular `motivosBloqueioConclusao` no cliente (tem todos os itens). Se houver motivos, o
  seletor de status **não permite "Concluído"** (opção desabilitada) e mostra um aviso: **"aguarda: 4.6"**
  / "anexo pendente" / "informe a competência".
- Item com `campoDestino === 'competencia_inicial'`: input **month** ("Competência inicial") ligado a
  `valorDestino` (na edição e/ou inline); enviado no `salvarProcessoItem`.
- Item com `anexoObrigatorio` (ou que já tenha anexo): linha de anexo — se `temAnexo`, mostra 📎 nome +
  **baixar** (`urlAnexoProcessoItem` → abre a URL) + **remover**; senão, **input de arquivo** que chama
  `anexarProcessoItem`.

### `EditorTemplate.tsx`
- No form do item: campo **Depende de** (códigos separados por vírgula → `string[]`) e **Grava em**
  (select: "—" / "Competência inicial").

### Ficha do cliente
- Exibir a **competência inicial** (quando preenchida) próximo aos dados do cliente (somente leitura).

## Tratamento de erros
- Concluir com bloqueio → `{ erro }` com o(s) motivo(s); UI já previne, action reforça.
- Upload sem arquivo / falha no Storage → `{ erro }` amigável.
- `valorDestino` inválido (mês vazio) no item de competência → tratado como bloqueio ("informe a competência").
- Remover anexo de item já concluído com `anexo_obrigatorio`: permitido, mas o item volta a ficar
  bloqueado para reconclusão (regra recalculada).

## Testes
- **Unit (Vitest):** `motivosBloqueioConclusao` (dependência faltando/atendida por concluído e por
  dispensado; anexo obrigatório com/sem anexo; campo_destino com/sem valor; combinações).
- **Migration:** aplicar; conferir colunas e backfill (item 1.3 com `campo_destino`, 6.1/6.2/6.3 com
  `depende_de`).
- **Smoke:** `ProcessoSection` renderiza com item bloqueado (mostra "aguarda") e item de anexo, sem lançar.

## Migrations
`0051_onboarding_ciclo_b.sql` (colunas + `clientes.competencia_inicial` + backfill). Idempotente
(`add column if not exists`, updates determinísticos). Sem enums.
