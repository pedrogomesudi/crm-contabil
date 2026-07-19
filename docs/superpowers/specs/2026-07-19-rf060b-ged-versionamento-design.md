# RF-060 Fatia B — GED: versionamento — Design

**O que é:** guardar o **histórico de versões** de um documento — quando um novo arquivo substitui outro
(ex.: balancete corrigido), a lista mostra só a **versão atual** com um selo **"N versões"** que expande as
anteriores. **Fecha o RF-060** (a taxonomia saiu na Fatia A / v6.28). **Uma fatia**; tem migration.

## O estado de hoje (medido)

- `documentos` (após `0111`): `id, cliente_id, nome, tipo, tipo_id, departamento, competencia, caminho_storage,
  origem, enviado_por, enviado_em`. Sem noção de versão — cada upload é um registro independente.
- `anexarDocumento` (`src/app/(app)/documentos/actions.ts`) faz o upload classificado (Fatia A); `EstadoUpload`
  em `documentos/estados.ts`; `nomeSeguro` (module-private) sanea o nome; padrão de upload via
  `createAdminSupabase` + prefixo `cliente_id/uuid-nome`.
- Listagem do escritório: `DocumentosSection` (server) carrega e monta `DocItem[]` → `DocumentosTabela`
  (client, com filtros). Listagem do cliente: `src/app/(portal)/portal/documentos/page.tsx` (query própria a
  `documentos`).
- Lógica pura de taxonomia em `src/lib/documentos/taxonomia.ts`.

## Escopo (decidido no brainstorm)

- **Versionamento explícito** por `substitui_id` (auto-ref): o novo documento aponta para o que substitui.
- **UI: expandir inline** — a lista mostra os atuais; um selo "N versões" revela as anteriores (baixar cada).
- **Portal mostra só os atuais** — o cliente não vê rascunhos substituídos.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Modelo | `documentos.substitui_id` auto-ref | Simples; "atual" = ninguém o referencia. |
| Criação de versão | ação **"Nova versão"** a partir de um documento; herda a taxonomia | Explícito e sem reclassificar do zero. |
| Exibição | selo "N versões" expande inline | Decidido; limpo, no mesmo lugar. |
| Portal | filtra só os atuais | Cliente não vê versões substituídas. |
| Delete no meio da cadeia | `on delete set null` | Não derruba as outras versões. |

## Arquitetura

### Modelo de dados (migration 0112)

```sql
alter table documentos add column if not exists substitui_id uuid references documentos(id) on delete set null;
create index if not exists idx_documentos_substitui on documentos(substitui_id);
```

`substitui_id` herda a RLS de `documentos`. Nada é apagado no fluxo normal — a versão antiga vira histórico.

### Lógica pura (`src/lib/documentos/versoes.ts`)

```ts
// Agrupa a lista plana em (atual, anteriores[]). "atual" = id não referenciado por nenhum
// substitui_id; "anteriores" = a cadeia via substitui_id, do mais recente ao mais antigo.
export function agruparVersoes<T extends { id: string; substitui_id: string | null }>(
  docs: T[],
): { atual: T; anteriores: T[] }[];
```

Regras: cada documento cujo `id` não aparece em nenhum `substitui_id` é uma **atual**; a partir dela, seguir
`substitui_id` monta as `anteriores` (mais recente → mais antiga); documentos sem versão viram grupos de 1;
uma referência órfã (o doc referido não está na lista, ex.: apagado) encerra a cadeia sem quebrar. A ordem dos
grupos preserva a ordem de entrada dos atuais.

### Actions e consultas

- **`anexarNovaVersao(documentoAntigoId: string, _prev: EstadoUpload, formData: FormData): Promise<EstadoUpload>`**
  (em `documentos/actions.ts`, no molde de `anexarDocumento`): re-checa sessão/ativo e `podeGerenciarDocumentos`;
  carrega o documento antigo (cliente_id, tipo, tipo_id, departamento, competencia) confirmando que o usuário o
  enxerga (RLS); valida o arquivo (PDF/PNG/JPG ≤ 10 MB); sobe ao bucket (`cliente_id/uuid-nome`); insere a linha
  **herdando** a taxonomia do antigo e gravando **`substitui_id = documentoAntigoId`**; em falha de insert, remove
  o objeto. `revalidatePath("/clientes/…")`.
- **Escritório** (`DocumentosSection`): amplia o `select` de `documentos` com `substitui_id`; carrega todos e
  aplica `agruparVersoes`; passa `{ atual, anteriores }[]` (achatado em `DocItem` como hoje) para a tabela.
- **Portal** (`portal/documentos/page.tsx`): filtra os atuais com
  `.not("id", "in", "(select substitui_id from documentos where substitui_id is not null)")` — ou, mais robusto
  via SQL, `where not exists (select 1 from documentos d2 where d2.substitui_id = documentos.id)`. (Implementar
  como a consulta do PostgREST permitir; o efeito é: some quem foi substituído.)

### Telas

- **`DocumentosTabela`**: cada linha é a **versão atual**. Quando `anteriores.length > 0`, um selo/botão
  **"{n} versões"** expande (estado local) e lista as anteriores (nome + data + `BotaoBaixar`). Um botão
  **"Nova versão"** por linha (quando `podeGerenciar`) abre um upload enxuto (`input file`) que chama
  `anexarNovaVersao(atual.id, …)`. Controles via `controleCls` (guard `divida-ui`).
- **Portal**: segue mostrando só a lista (agora só os atuais), sem histórico.

## Fatia de implementação

Uma fatia: migration 0112 + `agruparVersoes` (com testes) + `anexarNovaVersao` + o agrupamento no
`DocumentosSection` + o "N versões"/"Nova versão" na `DocumentosTabela` + o filtro de atuais no portal + release.

## Verificação

- **Lógica testável:** `agruparVersoes` — cadeia de 3 (1 atual + 2 anteriores em ordem), sem-versão (grupos de
  1), referência órfã (não quebra), ordem dos grupos preservada.
- **Nova versão:** herda tipo/tipo_id/departamento/competência do antigo; grava `substitui_id`; o antigo sai da
  posição de atual e passa a histórico; falha de insert não deixa órfão no storage.
- **Portal:** não lista documentos substituídos.
- **Não-regressão:** `divida-ui` (controles via `controleCls`); sem rota nova → `rotas-alcancaveis` não muda;
  `lint`/`typecheck`/`test`/`format:check`/`build`; migration idempotente e **aplicada em produção antes do
  deploy**.

## Fora de escopo

| O quê | Por quê |
|---|---|
| Diff/preview entre versões | Além do histórico; outra entrega. |
| Numeração explícita "v1/v2" | A ordem da cadeia basta; sem coluna de número. |
| "Nova versão" a partir do portal (cliente) | O versionamento é ação do escritório. |
| Reverter para uma versão antiga (tornar atual de novo) | Fora do escopo; se preciso, envia-se uma nova versão. |

## Riscos

| Risco | Mitigação |
|---|---|
| `substitui_id` órfão após delete | `on delete set null`; `agruparVersoes` trata (o doc vira atual isolado). |
| Cadeia longa em memória | Irrelevante no volume por cliente; o agrupamento é O(n). |
| Ciclo em `substitui_id` (A→B→A) | O fluxo só grava `substitui_id` do novo para um existente (o novo ainda não é referenciável); `agruparVersoes` usa um conjunto de visitados para não laçar. |
| Portal com filtro custoso | O `not exists` é indexado por `idx_documentos_substitui`; volume por cliente é baixo. |
