# Exclusão (soft delete) e filtro de status de clientes — Design

**Data:** 2026-07-02
**Contexto:** CRM Contábil. Antecede o marco V5-B.

## Objetivo

Permitir que o **administrador** exclua clientes de forma reversível (soft
delete — preserva histórico: notas, contratos, documentos) e restaure clientes
excluídos. Estender o filtro da lista de clientes para segmentar por
**Ativos**, **Inativos** e **Excluídos**, ocultando os excluídos por padrão.

## Decisões de design (aprovadas)

- **Soft delete**, não hard delete. Exclusão = marcar; restauração = desmarcar.
- **Restauração** habilitada (admin).
- **Apenas admin** exclui/restaura.

## Modelo de dados

Nova coluna em `clientes`:

- **`excluido_em timestamptz` (nullable, default null)** — `null` = cliente
  normal (ativo/inativo); preenchido = excluído. Guarda o instante da exclusão.

Escolha de coluna dedicada em vez de um novo valor no enum `status_cliente`
(`ativo`/`inativo`): evita o pitfall do `ALTER TYPE ... ADD VALUE` (não pode
rodar dentro de transação com uso no mesmo statement) e mantém `status`
ortogonal a "excluído" — um cliente excluído preserva se era ativo ou inativo.

**Migration** `supabase/migrations/0024_clientes_exclusao.sql` (idempotente):

```sql
alter table clientes add column if not exists excluido_em timestamptz;
create index if not exists idx_clientes_excluido_em on clientes (excluido_em);
```

O índice apoia o filtro `excluido_em is null` (predicado da lista padrão).

## Regra de permissão

Nova função em `src/lib/clientes/permissoes.ts` (fonte única, alinhada à RLS):

```ts
// Quem exclui/restaura cliente (soft delete): apenas admin.
export function podeExcluirCliente(papel: Papel | undefined): boolean {
  return papel === "admin";
}
```

**Enforcement:** a RLS de UPDATE de `clientes` já é ampla
(admin/assistente/contador-dono), então ela **não** basta para restringir a
exclusão a admin. A trava efetiva é a **server action**, que relê o papel
server-side (`getPerfilAtual`) e recusa se `!podeExcluirCliente(papel)` — mesmo
padrão dos gates de honorário/documentos, que também não dependem só de RLS.

## Server actions

Em `src/app/(app)/clientes/actions.ts`:

```ts
export async function excluirCliente(clienteId: string): Promise<{ erro?: string }>;
export async function restaurarCliente(clienteId: string): Promise<{ erro?: string }>;
```

- Ambas: `getPerfilAtual()` → se `!podeExcluirCliente(papel)` retorna
  `{ erro: "Sem permissão." }`.
- `excluirCliente`: `update({ excluido_em: <agora> }).eq("id", clienteId).is("excluido_em", null).select("id")`.
  Se `data.length === 0` → `{ erro: "..." }` (sem permissão RLS ou já excluído).
- `restaurarCliente`: `update({ excluido_em: null }).eq("id", clienteId).select("id")`.
- Sucesso: `revalidatePath("/clientes")` + `revalidatePath("/clientes/${clienteId}")`,
  retorna `{}`. (Sem `redirect` — o componente cliente trata o retorno, como
  `salvarHonorario`.)

O instante: usar o mesmo padrão de horário do projeto — `new Date().toISOString()`
serve (é só um carimbo, sem exigência fiscal aqui).

## Filtro da lista (`/clientes`)

O `<select name="status">` passa a ter quatro opções; o valor `""` (default)
significa "ativos e inativos, sem excluídos":

| value       | rótulo               | predicado na query                          |
| ----------- | -------------------- | ------------------------------------------- |
| `""`        | Ativos e inativos    | `.is("excluido_em", null)`                  |
| `ativo`     | Ativos               | `.eq("status","ativo").is("excluido_em",null)` |
| `inativo`   | Inativos             | `.eq("status","inativo").is("excluido_em",null)` |
| `excluido`  | Excluídos            | `.not("excluido_em","is",null)`             |

A lista sempre esconde excluídos, exceto quando `status === "excluido"`. O
`select` da página passa a trazer também `excluido_em` (para o rótulo na linha).

Um helper puro e testável concentra a montagem do predicado, para cobrir com
teste unitário sem tocar no Supabase:

```ts
// src/lib/clientes/filtroStatus.ts
export type FiltroStatus = "" | "ativo" | "inativo" | "excluido";
export function normalizarFiltro(v: string | undefined): FiltroStatus;
// aplica o predicado ao PostgrestFilterBuilder e o devolve
export function aplicarFiltroStatus<T>(query: T, filtro: FiltroStatus): T;
```

`aplicarFiltroStatus` recebe/devolve o builder tipado de forma genérica; o teste
usa um duble que registra as chamadas (`.eq`/`.is`/`.not`) e verifica a
sequência esperada por filtro.

## Ocultar excluídos dos demais fluxos

Fluxos que hoje operam sobre clientes "ativos" devem passar a exigir também
`excluido_em is null`, para um cliente excluído não reaparecer:

- **NFS-e em lote** — `listarElegiveisLote` (em `clientes/[id]/nfse.ts`):
  adicionar `.is("excluido_em", null)` à query de elegíveis.
- **Ficha do cliente** (`/clientes/[id]`): continua acessível por URL direta
  (admin precisa dela para restaurar), mas exibe um aviso quando excluído.

## UI

**Ficha do cliente** (`/clientes/[id]/page.tsx`) — visível só para admin
(`podeExcluirCliente(papel)`):

- Novo client component `AcoesExclusaoCliente` (`src/components/clientes/`),
  renderizado no topo da ficha.
- Cliente **não excluído**: botão **"Excluir cliente"** (vermelho). Ao clicar,
  abre confirmação inline (não usar `window.confirm` — evita o dialog nativo que
  trava a automação de browser): texto "Excluir este cliente? O histórico é
  preservado e um administrador pode restaurá-lo." + botões "Confirmar exclusão"
  / "Voltar". Chama `excluirCliente`.
- Cliente **excluído**: faixa de aviso "Cliente excluído em {data}." + botão
  **"Restaurar"**. Chama `restaurarCliente`.
- Erros da action são exibidos em `role="alert"`.

**Lista** (`/clientes/page.tsx`): quando o filtro é "Excluídos", cada linha
recebe um rótulo discreto "excluído" (badge cinza) na coluna Status, para
distinguir visualmente do fluxo normal.

## Erros e casos de borda

- **Confirmação obrigatória** antes de excluir (passo explícito de UI).
- **Não-admin**: sem botões (gate na ficha) + action recusa server-side.
- **Excluir já-excluído / restaurar não-excluído**: idempotente na prática
  (o `.is("excluido_em", null)` na exclusão evita sobrescrever o carimbo;
  restaurar um cliente já ativo é no-op inofensivo).
- **Cliente excluído em buscas/lote**: não aparece (predicado
  `excluido_em is null`).

## Testes

- **Unit** (`src/tests/clientes/filtroStatus.test.ts`): `normalizarFiltro`
  mapeia entradas válidas/invalidas; `aplicarFiltroStatus` emite o predicado
  certo para cada um dos quatro filtros (via duble do builder).
- **Unit** (`src/tests/clientes/permissoes.test.ts` — estender): `podeExcluirCliente`
  true só para `admin`, false para `financeiro`/`assistente`/`contador`/`undefined`.
- **RLS** (`supabase/tests/rls.test.sql`): já cobre UPDATE de `clientes`; sem
  nova policy, sem novo teste de RLS necessário (a trava de admin é no app).

## Fora de escopo (YAGNI)

- Exclusão em **lote** de clientes.
- **Hard delete** definitivo / expurgo administrativo.
- Auditoria de "quem excluiu" (apenas o instante é registrado). Se necessário no
  futuro, adicionar `excluido_por uuid`.
```