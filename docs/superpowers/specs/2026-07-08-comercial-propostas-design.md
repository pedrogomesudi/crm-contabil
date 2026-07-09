# Comercial — propostas formais — Design

**Data:** 2026-07-08
**Marco:** criar propostas de honorários (itens + valores) por oportunidade, com um documento formatado
para impressão/compartilhamento e status que reflete no funil.

**Contexto:** o módulo comercial tem `oportunidade` (prospect_nome, contato_nome, etapa, fechado_em). Não há
biblioteca de PDF (entrega será uma página imprimível, não PDF gerado). `dados_bancarios` (singleton id=1:
pix_chave, banco, agencia, conta, titular, documento) alimenta o bloco de pagamento. Gate comum:
`podeCriarCliente`. Helper `resumoFunil` e a action `definirEtapa` já existem no comercial.

## Decisões (do brainstorming)

1. Entrega: **página interna imprimível** (contador imprime em PDF pelo navegador / compartilha).
2. Itens: **texto livre + valor + recorrência** (mensal/único), com totais calculados.
3. Proposta **pertence a uma oportunidade**.

## Escopo

- Tabelas `proposta` + `proposta_item` (migration).
- Helper puro `totaisProposta`.
- Actions de CRUD + status.
- UI: lista por oportunidade, editor, documento imprimível, link no card do funil.

Fora: link público, PDF gerado, envio por WhatsApp, catálogo de serviços, aceite pelo prospect.

## Dados — migration `0057_comercial_proposta.sql`

```sql
do $$ begin create type proposta_status as enum ('rascunho','enviada','aceita','recusada'); exception when duplicate_object then null; end $$;
do $$ begin create type proposta_recorrencia as enum ('mensal','unico'); exception when duplicate_object then null; end $$;
create sequence if not exists proposta_numero_seq;

create table if not exists proposta (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references oportunidade(id) on delete cascade,
  numero bigint not null default nextval('proposta_numero_seq'),
  validade date,
  observacoes text,
  status proposta_status not null default 'rascunho',
  criado_por uuid references usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create table if not exists proposta_item (
  id uuid primary key default gen_random_uuid(),
  proposta_id uuid not null references proposta(id) on delete cascade,
  descricao text not null,
  valor numeric(12,2) not null default 0,
  recorrencia proposta_recorrencia not null default 'mensal',
  ordem int not null default 0
);
alter table proposta enable row level security;
alter table proposta_item enable row level security;
drop policy if exists proposta_rw on proposta;
create policy proposta_rw on proposta for all
  using (auth_papel() in ('admin','assistente','contador')) with check (auth_papel() in ('admin','assistente','contador'));
drop policy if exists proposta_item_rw on proposta_item;
create policy proposta_item_rw on proposta_item for all
  using (auth_papel() in ('admin','assistente','contador')) with check (auth_papel() in ('admin','assistente','contador'));
```
RLS por papel (comercial, não filha de cliente). `numero` via sequência (numeração contínua entre propostas).

## Helper puro — `src/lib/comercial/proposta.ts` (TDD)

```ts
export type ItemRecorrencia = "mensal" | "unico";
export function totaisProposta(itens: { valor: number; recorrencia: ItemRecorrencia }[]): { mensal: number; unico: number };
```
Soma `valor` por recorrência.

## Actions — `src/app/(app)/comercial/propostas-actions.ts`

```ts
export type PropostaStatus = "rascunho" | "enviada" | "aceita" | "recusada";
export type PropostaItemView = { id: string; descricao: string; valor: number; recorrencia: ItemRecorrencia; ordem: number };
export type PropostaResumo = { id: string; numero: number; status: PropostaStatus; validade: string | null; totalMensal: number; totalUnico: number };
export type Pagamento = { pixChave: string | null; banco: string | null; agencia: string | null; conta: string | null; titular: string | null; documento: string | null };
export type PropostaView = { id: string; numero: number; status: PropostaStatus; validade: string | null; observacoes: string | null; oportunidadeId: string; prospectNome: string; contatoNome: string | null; itens: PropostaItemView[]; pagamento: Pagamento };
export type ItemInput = { descricao: string; valor: number; recorrencia: ItemRecorrencia };

export async function listarPropostas(oportunidadeId: string): Promise<PropostaResumo[]>;
export async function obterProposta(id: string): Promise<PropostaView | null>;
export async function criarProposta(oportunidadeId: string): Promise<{ id?: string; erro?: string }>;
export async function salvarProposta(id: string, dados: { validade: string | null; observacoes: string | null; itens: ItemInput[] }): Promise<{ ok?: boolean; erro?: string }>;
export async function definirStatusProposta(id: string, status: PropostaStatus): Promise<{ ok?: boolean; erro?: string }>;
export async function excluirProposta(id: string): Promise<{ ok?: boolean; erro?: string }>;
```
- Gate `podeCriarCliente` em todas.
- `listarPropostas`: propostas da oportunidade + itens agregados → `totalMensal`/`totalUnico` (via `totaisProposta`). Ordenar por `numero` desc.
- `obterProposta`: proposta + `proposta_item` (ordenados por `ordem`) + `oportunidade` (prospect_nome/contato_nome) + `dados_bancarios` (id=1) para `pagamento`.
- `criarProposta`: insere `rascunho` vazia, retorna `id`.
- `salvarProposta`: atualiza `validade`/`observacoes`/`atualizado_em`; **substitui** os itens (delete all + insert com `ordem` = índice).
- `definirStatusProposta`: grava `status` e integra o funil (via `definirEtapa` existente ou update direto):
  - `enviada` → se a oportunidade estiver em `novo`/`contato`, move para `proposta`;
  - `aceita` → move a oportunidade para `ganho` (grava `fechado_em`);
  - `recusada` → não altera a oportunidade.
- `excluirProposta`: delete (cascade nos itens).

## UI

### Lista — `/comercial/propostas/page.tsx` (server, `?op=<oportunidadeId>`) + `PropostasLista.tsx` (client)
Gate `podeCriarCliente`. Carrega `listarPropostas(op)` + o nome do prospect (via oportunidade). Lista: nº,
status, validade, totais (mensal/único), link "abrir" (→ editor), "excluir". Botão **"Nova proposta"**
(`criarProposta` → navega ao editor). Link "← Funil".

### Editor — `/comercial/propostas/[id]/page.tsx` (server) + `EditorProposta.tsx` (client)
`obterProposta(id)` (senão `notFound`). Edita: **itens** (linhas com descrição + valor + recorrência
mensal/único; adicionar/remover; totais ao vivo via `totaisProposta`), **validade**, **observações**.
Botão **Salvar** (`salvarProposta`). **Status**: botões Rascunho/Enviada/Aceita/Recusada
(`definirStatusProposta`) com o status atual destacado. Link **"Ver documento"** (→ documento) e "← Propostas".

### Documento — `/comercial/propostas/[id]/documento/page.tsx` (server) + botão de imprimir (client)
Página **limpa, formatada para impressão** (fundo branco, largura de folha, sem o menu do app):
cabeçalho **"Proposta de Honorários"** + Nº + data de emissão + validade; **prospect** (nome/contato);
tabela de **itens** (descrição · recorrência · valor); **totais** (mensal e único); **condições/observações**;
bloco **"Dados para pagamento"** (do `dados_bancarios`: PIX, banco/agência/conta, titular/documento).
Um botão **"Imprimir"** (client, `window.print()`); `@media print` esconde o botão. Título com o `titular`
como identidade do escritório.

### Card do funil — `QuadroComercial.tsx`
No card ativo, um link **"Propostas"** → `/comercial/propostas?op=<id>`.

## Integração de status (resumo)
Marcar a proposta como **Enviada**/**Aceita** move a oportunidade no funil (proposta/ganho). Assim o
comercial reflete o estágio real sem dupla digitação.

## Tratamento de erros
- Sem permissão → `[]`/`null`/erro. Proposta inexistente → `notFound`.
- `valor` vazio numa linha → `0`. Item sem descrição é ignorado ao salvar.

## Testes
- **Unit (Vitest):** `totaisProposta` (mensal/único, lista vazia).
- **Smoke:** `EditorProposta` (renderiza itens + total) e o documento (`DocumentoProposta`/página) —
  cabeçalho, prospect, total, bloco de pagamento.

## Migrations
`0057_comercial_proposta.sql` (enums + sequência + 2 tabelas + RLS).
