# Onboarding — Ciclo C: gatilho de consultoria — Design

**Data:** 2026-07-08
**Marco:** transformar oportunidades descobertas durante o onboarding em **oportunidades no funil
comercial**, ligadas ao cliente — fechando o Ciclo C do onboarding.

**Contexto:** o módulo comercial existe (`oportunidade`, com `cliente_id`). O onboarding tem itens de
processo (`onboarding_processo_item`) com `alerta_risco`/`descricao`. Não há hoje nenhuma ligação entre os
dois. `listarProcessoCliente` monta `ItemProcessoView`; a `ProcessoSection` renderiza cada item (mostra
`alertaRisco`, anexos, cofre etc.). Gate comum: `podeCriarCliente`.

## Decisões (do brainstorming)

1. Geração **manual** (botão), pelo contador — evita ruído no funil.
2. Disponível em **qualquer item** do processo (sem flag no template).

## Escopo

- 1 coluna nova (`onboarding_processo_item.oportunidade_id`) para registrar/idempotência.
- Action `gerarOportunidadeConsultoria(itemId)`.
- `ItemProcessoView` + `listarProcessoCliente` ganham `oportunidadeId`.
- Botão por item na `ProcessoSection`.
- **Sem** mudança no template, sem automação, sem métricas. **Fecha o Ciclo C.**

## Dados — migration `0055_onboarding_oportunidade_consultoria.sql`

```sql
alter table onboarding_processo_item
  add column if not exists oportunidade_id uuid references oportunidade(id);
```
Nullable; preenchido quando o item gera a oportunidade. Serve de idempotência (não duplica) e de estado da
UI (botão × link).

## Action — `src/app/(app)/clientes/[id]/processo.ts`

```ts
export async function gerarOportunidadeConsultoria(itemId: string): Promise<{ ok?: boolean; erro?: string }>;
```
- Gate `podeCriarCliente`.
- Lê o item (`id, titulo, alerta_risco, descricao, processo_id, oportunidade_id`) via client de sessão
  (RLS isola por cliente). Se já tem `oportunidade_id` → `{ ok: true }` (idempotente).
- Resolve `cliente_id` (via `onboarding_processo`) e `razao_social` (via `clientes`).
- Insere em `oportunidade`: `prospect_nome = razao_social`, `cliente_id`, `servico_interesse =
  "Consultoria: " + titulo`, `origem = "Onboarding"`, `responsavel_id = <usuário atual>`, `observacoes =
  alerta_risco ?? descricao ?? null`, `etapa = "novo"`. Captura o `id`.
- Atualiza o item: `oportunidade_id = <novo id>`.
- `revalidatePath("/onboarding/<cliente_id>")` e `revalidatePath("/clientes/<cliente_id>")`.
- Erros: item/processo inexistente → `{ erro }`; falha no insert → `{ erro }`.

**Segurança:** todas as leituras/escritas pelo client de sessão (RLS de `onboarding_processo_item` isola por
cliente; `oportunidade` por papel). Gate `podeCriarCliente`.

## View — `ItemProcessoView` + `listarProcessoCliente`

- `ItemProcessoView` ganha `oportunidadeId: string | null`.
- O `SELECT` de `listarProcessoCliente` inclui `oportunidade_id`; o map preenche
  `oportunidadeId: (r.oportunidade_id as string | null) ?? null`.

## UI — `ProcessoSection`

Por item (logo após a linha do `alertaRisco`), uma linha de ação:
- **Sem oportunidade** (`!it.oportunidadeId`): botão **"Gerar oportunidade de consultoria"** (estilo
  discreto, ex.: `text-violeta underline`), que chama `gerarOportunidadeConsultoria(it.id)` via o wrapper
  `chamar` (trata erro + `router.refresh()`).
- **Já gerada** (`it.oportunidadeId`): texto **"Oportunidade de consultoria criada ✓"** + `Link` para
  **`/comercial`** ("ver no funil").
- Importar `gerarOportunidadeConsultoria` (de `processo`) e `Link` (`next/link`), se ainda não importados.

## Funil (`/comercial`)
A oportunidade nasce com `cliente_id` preenchido e `etapa = "novo"` — aparece como card com o nome do
cliente. Como já tem `clienteId`, ao ser marcada "Ganho" o quadro mostra "Ver onboarding" (não "Converter"),
que é o correto para uma venda a cliente existente. **Nenhuma mudança no `QuadroComercial`.**

## Tratamento de erros
- Item já com `oportunidade_id` → não duplica (retorna ok).
- Sem permissão → `{ erro }`; a UI mostra `alert`.

## Testes
- **Smoke `ProcessoSection`:** adicionar `oportunidadeId` aos itens do fixture; um item sem oportunidade
  renderiza "Gerar oportunidade de consultoria"; um item com `oportunidadeId` renderiza "ver no funil".

## Migrations
`0055_onboarding_oportunidade_consultoria.sql` (1 coluna).
