# Tarefas e processos — Fatia A — Design

**Data:** 2026-07-12
**Contexto:** Domínio "Tarefas, processos e produtividade" (RF-040 a RF-045), hoje quase zerado. Fatia A entrega o núcleo: **tarefas avulsas (RF-040)** + **visões lista e kanban (RF-042 parcial)**.

## Objetivo

Gerenciar **tarefas internas** com responsável, prazo, prioridade, status e **checklist**, opcionalmente ligadas a um cliente e/ou departamento; vê-las num **painel global** (lista + kanban) com filtros, e numa **seção da ficha do cliente**.

## Escopo da Fatia A

**Inclui:** tarefa (título, descrição, responsável, cliente opcional, departamento opcional, prioridade, prazo, status) + **checklist** (subitens); painel global com **lista** e **kanban** (por status) e filtros (responsável, cliente, departamento, status, prioridade); seção na ficha do cliente; menu "Tarefas".

**Fora (fatias seguintes):** recorrência de tarefas, anexos, **visão calendário** (completa RF-042), **templates de processo/SOPs** (RF-041), timesheet (RF-043), rentabilidade (RF-044), solicitações internas com SLA (RF-045).

## Modelo de dados (migration idempotente)

```sql
do $$ begin create type tarefa_status as enum ('aberta','em_andamento','concluida','cancelada'); exception when duplicate_object then null; end $$;
do $$ begin create type tarefa_prioridade as enum ('baixa','media','alta','urgente'); exception when duplicate_object then null; end $$;

create table if not exists tarefa (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  responsavel_id uuid references usuarios(id),
  cliente_id uuid references clientes(id) on delete set null,
  departamento departamento,            -- enum reusado do RF-025 (nullable)
  prioridade tarefa_prioridade not null default 'media',
  prazo date,
  status tarefa_status not null default 'aberta',
  concluida_em timestamptz,
  criado_por uuid references usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_tarefa_responsavel on tarefa(responsavel_id);
create index if not exists idx_tarefa_cliente on tarefa(cliente_id);

create table if not exists tarefa_item (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references tarefa(id) on delete cascade,
  descricao text not null,
  feito boolean not null default false,
  ordem int not null default 0
);
```

### RLS
- **tarefa** — trabalho interno da equipe:
  - SELECT: `auth_papel() in ('admin','assistente','contador','financeiro')`.
  - INSERT: mesma lista.
  - UPDATE/DELETE: `auth_papel() in ('admin','assistente') or responsavel_id = auth.uid() or criado_por = auth.uid()`.
- **tarefa_item** — delega à tarefa (SELECT se a tarefa é visível; WRITE se editável).
- Trigger `tarefa_integridade`: `atualizado_em = now()`; ao virar `concluida`, seta `concluida_em`; ao sair, limpa.

## Componentes e arquivos

### Biblioteca — `src/lib/tarefas/tarefa.ts` (pura, testável)
- `TAREFA_STATUS`, `TAREFA_PRIORIDADE` (valor→rótulo); tipos TS.
- `progressoChecklist(itens): { total; feitos; pct }`.
- `ordemPrioridade(p): number` (urgente<alta<media<baixa) para ordenação.
- Reusa `classificarAlerta` (severidade do prazo) e `DEPARTAMENTOS` (RF-025).

### Ações — `src/app/(app)/tarefas/actions.ts`
- `criarTarefa`, `salvarTarefa`, `definirStatusTarefa`, `excluirTarefa`.
- Checklist: `salvarItem`, `alternarItem`, `excluirItem`.
- `listarTarefas(filtros)` — responsável/cliente/departamento/status/prioridade.

### Telas
- **Menu "Tarefas"** → `/tarefas`: filtros; alternador **Lista / Kanban**; "Nova tarefa".
  - **Lista:** tabela (título, responsável, cliente, prazo c/ selo, prioridade, status).
  - **Kanban:** colunas por status; cartões (título, responsável, prazo, prioridade); mudar status por **botões** (sem drag na Fatia A — simples e robusto).
- **Detalhe/edição** (`/tarefas/[id]`): campos + **checklist** (adicionar/marcar/remover).
- **Ficha do cliente:** seção **"Tarefas"** — lista do cliente + "nova tarefa" (pré-vincula o cliente).

### Permissões
- `podeGerenciarTarefas(papel)` → toda a equipe cria/vê; editar cada tarefa segue a RLS (admin/assistente ou dono/responsável).

## Testes
- **Unit** (`tarefa.test.ts`): `progressoChecklist`, `ordemPrioridade`, rótulos.
- **RLS**: admin edita qualquer; contador edita a dele (responsável/criador) e não a de outro; financeiro cria/vê mas não edita alheia.
- Suíte completa verde antes de cada commit.

## Segurança
- Tarefas internas; `on delete set null` preserva a tarefa se o cliente sumir.
- Edição reforçada na RLS (não só na action).
