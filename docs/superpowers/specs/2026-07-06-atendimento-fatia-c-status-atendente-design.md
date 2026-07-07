# Atendimento — Fatia C (status da conversa + atribuição de atendente) — Design

**Data:** 2026-07-06
**Marco:** Fatia C do Atendimento.
**Contexto:** Atendimento com Fatia A (layout/lista/favoritos) + B (mídia) + read receipts no ar. A
tabela `conversa` (`telefone` pk, `favorita`, `criado_em`) já existe. Esta fatia adiciona **estado da
conversa** (aberta/pendente/finalizada) e **atendente responsável**, com abas por status.

## Objetivo

Organizar o fluxo de atendimento: cada conversa tem um estado e um responsável; a lista filtra por
estado; quem responde assume a conversa automaticamente.

## Escopo

- **Estados:** `aberta` (padrão) · `pendente` · `finalizada`.
- **Atribuição:** manual (escolher um atendente) + auto-assumir (quem responde uma conversa sem
  atendente assume).
- **Reabertura:** responder ou receber mensagem numa conversa `finalizada` volta ela para `aberta`.
- **Abas por status:** Abertas · Pendentes · Finalizadas · Favoritos (padrão = Abertas).

Fora de escopo (YAGNI): aba "minhas conversas", histórico de eventos, notas internas.

## Dados

### Migration `0044_conversa_status.sql`

```sql
alter table conversa add column if not exists status text not null default 'aberta';   -- 'aberta' | 'pendente' | 'finalizada'
alter table conversa add column if not exists atendente_id uuid references usuarios(id);
```

Colunas nuláveis/`default` — sem enum (idempotente). A linha de `conversa` continua **preguiçosa**:
conversa sem linha = implicitamente `aberta` e sem atendente. A RLS da tabela (0041) já cobre
admin/financeiro/contador para todas as operações.

## Read model — `src/lib/whatsapp/inbox.ts`

```ts
export type StatusConversa = "aberta" | "pendente" | "finalizada";

export type Conversa = {
  telefone: string;
  cliente: string | null;
  ultima: string;
  ultima_em: string;
  nao_lidas: number;
  favorita: boolean;
  status: StatusConversa;         // <- novo
  atendenteId: string | null;     // <- novo
  atendenteNome: string | null;   // <- novo
};

export type ConversaMeta = {
  favorita?: boolean;
  status?: StatusConversa;
  atendenteId?: string | null;
  atendenteNome?: string | null;
};

// agruparConversas passa a receber um mapa de metadados por telefone (substitui o Set de favoritos).
export function agruparConversas(msgs: MsgConversa[], meta?: Map<string, ConversaMeta>): Conversa[];
```

Defaults por conversa: `favorita=false`, `status="aberta"`, `atendenteId=null`, `atendenteNome=null`.
Cada campo vem do `meta.get(telefone)` quando presente.

### Abas e filtro

```ts
export type FiltroAba = "abertas" | "pendentes" | "finalizadas" | "favoritos";

export function filtrarConversas(convs: Conversa[], aba: FiltroAba, busca: string): Conversa[];
export function contadores(convs: Conversa[]): { abertas: number; pendentes: number; finalizadas: number; favoritos: number };
```

Regras de `filtrarConversas`:
- `abertas` → `status === "aberta"`; `pendentes` → `"pendente"`; `finalizadas` → `"finalizada"`;
  `favoritos` → `favorita` (independe do status).
- Busca (nome do cliente OU telefone, case-insensitive) aplicada **depois** do filtro de aba.
- Mantém a ordem já vinda de `agruparConversas`.

`contadores`: conta conversas por status (`abertas/pendentes/finalizadas`) e `favoritos` = nº de
favoritas. (O badge de não-lidas continua por conversa; "não lidas" deixa de ser aba.)

## Actions — `src/app/(app)/atendimento/actions.ts`

- `listarConversas()` — além das mensagens, busca as linhas de `conversa` (`telefone, favorita,
  status, atendente_id`) e um mapa `id→nome` de `usuarios`; monta o `Map<telefone, ConversaMeta>` e
  passa para `agruparConversas`. (Atendente resolvido pelo mapa de usuários — evita depender do nome
  exato da FK no embed do PostgREST.)
- `listarAtendentes(): Promise<{ id: string; nome: string }[]>` — `usuarios` com
  `papel in ('admin','financeiro','contador')` e `ativo`, ordenados por nome (para o seletor).
- `definirStatus(telefone: string, status: StatusConversa): Promise<{ ok?: boolean; erro?: string }>`
  — `upsert conversa {telefone, status}` (onConflict `telefone`). Gate `podeAtender`.
- `atribuirAtendente(telefone: string, atendenteId: string | null): Promise<{ ok?: boolean; erro?: string }>`
  — `upsert conversa {telefone, atendente_id}`. Gate `podeAtender`. (upsert só grava as colunas do
  payload; `favorita` e `status` da linha existente são preservados.)

### Auto-assumir + reabrir (helper compartilhado)

Um helper server-only `assumirConversa(admin, telefone, atendenteId)`:
```
1. lê a linha atual de conversa (status, atendente_id).
2. novoAtendente = atendente_id atual ?? atendenteId   (só assume se estava sem)
3. novoStatus = (status atual === 'finalizada') ? 'aberta' : (status atual ?? 'aberta')  (reabre)
4. upsert conversa { telefone, atendente_id: novoAtendente, status: novoStatus } (onConflict telefone)
```
Chamado (best-effort) ao final de `responder` e `enviarMidia`, com `atendenteId = perfil.id`.

### Reabrir no recebimento — webhook

Após inserir a mensagem IN (texto e mídia), executar:
`update conversa set status='aberta' where telefone = tel and status='finalizada'`
(reabre só se estava finalizada; sem linha = já implicitamente aberta, nada a fazer).

## UI — `src/app/(app)/atendimento/Inbox.tsx`

### Abas
Trocar as abas atuais por `Abertas · Pendentes · Finalizadas · Favoritos` (com contadores). Estado
inicial `aba = "abertas"`. A lista some com as finalizadas por padrão (elas ficam na aba Finalizadas).

### Cabeçalho da thread — status + atendente
No topo da conversa aberta, dois seletores compactos:
- **Status:** `<select>` com Aberta / Pendente / Finalizada → chama `definirStatus(ativa, valor)` e
  atualiza a lista + o estado local.
- **Atendente:** `<select>` com "Não atribuído" + a lista de `listarAtendentes()` → chama
  `atribuirAtendente(ativa, id | null)`.
Os valores atuais vêm do `contato`/da conversa ativa. `listarAtendentes` é carregado uma vez (no
mount) e guardado em estado.

### Item da lista
Cada conversa mostra, discretamente, o **primeiro nome do atendente** (se houver) e um ponto/《chip》de
status quando não for "aberta" — para dar contexto sem poluir.

## Fluxo (resumo)
```
Receber (finalizada) → webhook reabre para 'aberta'
Responder (sem atendente) → assumirConversa: atendente = eu; se finalizada → aberta
Finalizar → definirStatus('finalizada') → some da aba Abertas
Atribuir → atribuirAtendente(id) → aparece o responsável
```

## Tratamento de erros
- Actions retornam `{ erro }` legível; a UI reverte o seletor ao valor anterior em erro.
- `assumirConversa`/reabertura são best-effort (não quebram o envio/recebimento se falharem).

## Testes
- **Unit (Vitest):** `filtrarConversas` (cada aba + busca), `contadores` (por status), `agruparConversas`
  (overlay de status/atendente/favorita via `meta`). Ajustar os testes/ literais existentes das abas
  antigas (`todas/nao_lidas`) e do parâmetro `favoritos: Set` para o novo `meta: Map`.
- **Migration:** aplicar; verificar colunas `status`/`atendente_id` em `conversa`.
- **Smoke:** `Inbox` renderiza com as novas abas sem lançar.

## Migrations
Uma migration nova: `0044_conversa_status.sql` (2 `add column if not exists`). Sem enum/`ALTER TYPE`.
