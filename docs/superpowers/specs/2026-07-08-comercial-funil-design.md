# Módulo Comercial — Fatia A: funil de oportunidades — Design

**Data:** 2026-07-08
**Marco:** dar ao escritório um **funil de vendas** — cadastrar oportunidades (prospects), movê-las por
etapas fixas e, ao **ganhar**, converter em cliente com atalho para iniciar o onboarding.

**Contexto:** não existe nada comercial hoje. `clientes` tem só `status` (ativo/inativo) e `origem`.
Criar cliente exige `tipo_pessoa`, `razao_social`, `cpf_cnpj` (único, dígitos 11/14), `regime_tributario`
(todos NOT NULL) — logo a conversão passa pelo formulário de cliente pré-preenchido, não por insert cego.
`FormCliente` já pré-preenche via prop `cliente` (`const c = cliente ?? {}` + `defaultValue`), inclusive em
modo `novo`. `criarCliente(_prev, formData)` valida, insere e redireciona a `/clientes?ok=1`. A página
autônoma de onboarding vive em `/onboarding/[clienteId]`. Gate de criação de cliente: `podeCriarCliente`
(admin/assistente/contador). Última migration: `0053`.

## Decisões (do brainstorming)

1. Núcleo = **funil de oportunidades** (pipeline clássico).
2. Etapas **fixas**: `novo → contato → proposta → negociacao` (ativas) + `ganho` / `perdido` (terminais).
3. Ao **Ganhar**: criar cliente pré-preenchido + oferecer iniciar onboarding.
4. Visual: **quadro por etapa**, mover com **← →** e botões Ganho/Perdido (sem arrastar).

## Escopo (Fatia A)

- Entidade `oportunidade` + enum de etapas (migration).
- Helpers puros do funil (etapas/adjacência/resumo).
- Actions: listar, criar, editar, definir etapa (mover/ganho/perdido).
- Conversão: `criarCliente` parametrizado por `oportunidade_id` (vincula + redireciona ao onboarding).
- UI: quadro `/comercial`, item no Sidebar.

**Fora desta fatia (fatias futuras):** métricas/relatórios do funil, propostas formais de honorários,
histórico datado de atividades, gatilho de oportunidade de consultoria (Ciclo C do onboarding).

## Dados — migration `0054_comercial_oportunidade.sql`

```sql
do $$ begin
  create type oportunidade_etapa as enum ('novo','contato','proposta','negociacao','ganho','perdido');
exception when duplicate_object then null; end $$;

create table if not exists oportunidade (
  id uuid primary key default gen_random_uuid(),
  prospect_nome text not null,
  contato_nome text,
  contato_telefone text,
  contato_email text,
  origem text,
  servico_interesse text,
  valor_estimado numeric(12,2),
  responsavel_id uuid references usuarios(id),
  etapa oportunidade_etapa not null default 'novo',
  observacoes text,
  motivo_perda text,
  cliente_id uuid references clientes(id),
  criado_por uuid references usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table oportunidade enable row level security;
drop policy if exists oportunidade_rw on oportunidade;
create policy oportunidade_rw on oportunidade for all
  using (auth_papel() in ('admin','assistente','contador'))
  with check (auth_papel() in ('admin','assistente','contador'));
```

**RLS por papel (não por cliente):** correto aqui porque a oportunidade é **pré-cliente** — não tem
`cliente_id` até converter, então não há dono-cliente para escopar. (Nota anti-review: o padrão EXISTS-por-
cliente vale para tabelas-filhas de cliente; esta não é.) Toda equipe com `podeCriarCliente` compartilha o
funil; a UI oferece filtro "só as minhas".

## Helpers puros — `src/lib/comercial/funil.ts` (TDD)

```ts
export type EtapaOportunidade = "novo" | "contato" | "proposta" | "negociacao" | "ganho" | "perdido";
export const ETAPAS_ATIVAS: { chave: EtapaOportunidade; rotulo: string }[]; // as 4 ativas, em ordem
export function rotuloEtapa(e: EtapaOportunidade): string;
export function etapaAdjacente(e: EtapaOportunidade, dir: "anterior" | "proxima"): EtapaOportunidade | null;
export function resumoFunil(ops: { etapa: EtapaOportunidade; valorEstimado: number | null }[]): Record<string, { qtd: number; total: number }>;
```
- `ETAPAS_ATIVAS`: `novo`/Novo, `contato`/Contato feito, `proposta`/Proposta enviada, `negociacao`/Negociação.
- `etapaAdjacente`: só navega entre as 4 ativas; nas bordas retorna `null`; para `ganho`/`perdido` retorna `null`.
- `resumoFunil`: por etapa ativa, `{ qtd, total }` (soma de `valorEstimado`, tratando `null` como 0).

## Actions — `src/app/(app)/comercial/actions.ts`

```ts
export type OportunidadeView = { id: string; prospectNome: string; contatoNome: string | null; contatoTelefone: string | null; contatoEmail: string | null; origem: string | null; servicoInteresse: string | null; valorEstimado: number | null; responsavelId: string | null; responsavelNome: string | null; etapa: EtapaOportunidade; observacoes: string | null; motivoPerda: string | null; clienteId: string | null; meu: boolean };
export type OportunidadeInput = { prospectNome: string; contatoNome: string | null; contatoTelefone: string | null; contatoEmail: string | null; origem: string | null; servicoInteresse: string | null; valorEstimado: number | null; responsavelId: string | null; observacoes: string | null };

export async function listarOportunidades(): Promise<OportunidadeView[]>;
export async function criarOportunidade(input: OportunidadeInput): Promise<{ ok?: boolean; erro?: string }>;
export async function salvarOportunidade(id: string, input: OportunidadeInput): Promise<{ ok?: boolean; erro?: string }>;
export async function definirEtapa(id: string, etapa: EtapaOportunidade, motivo?: string | null): Promise<{ ok?: boolean; erro?: string }>;
```
- Gate `podeCriarCliente` em todas (senão `[]` / erro).
- `listarOportunidades`: todas (RLS já restringe por papel), com nome do responsável (join `usuarios`) e
  `meu = responsavel_id === usuário logado`. Ordenar por `criado_em` desc.
- `definirEtapa`: grava `etapa`; se `perdido`, grava `motivo_perda = motivo`; atualiza `atualizado_em`.
  (Marcar `ganho` é `definirEtapa(id, "ganho")`; a conversão em cliente é ação separada na UI.)

## Conversão ao Ganhar — `src/app/(app)/clientes/actions.ts` + `clientes/novo/page.tsx`

- **`criarCliente` parametrizado:** assinatura passa a `criarCliente(oportunidadeId: string | null, _prev, formData)`.
  Na página `novo`, `action={criarCliente.bind(null, oportunidadeId)}` (`oportunidadeId` vem de
  `searchParams.oportunidade` ou `null`). Ao inserir com sucesso:
  - se `oportunidadeId`: `update oportunidade set cliente_id = <novoId>, etapa = 'ganho', atualizado_em = now()`
    e `redirect('/onboarding/' + novoId)`;
  - senão: comportamento atual (`redirect('/clientes?ok=1')`).
- **`novo/page.tsx`:** se `?oportunidade=<id>`, carrega a oportunidade e monta `ClienteDefaults`
  (`razao_social = prospect_nome`, `responsavel_nome = contato_nome`, `email`, `telefone`,
  `observacoes = "Origem comercial: " + (origem ?? "")`), passando `cliente={defaults}` ao `FormCliente`
  (modo `novo`). Sem oportunidade, segue como hoje.
- **Card "Ganho"** no quadro tem link **"Converter em cliente"** → `/clientes/novo?oportunidade=<id>`.

## UI

### `/comercial/page.tsx` (server) + `QuadroComercial.tsx` (client)
Gate `podeCriarCliente` (senão redirect). Carrega `listarOportunidades()` e a lista de usuários ativos
(para o seletor de responsável). Passa ao `QuadroComercial`.
- **`QuadroComercial`**: 4 colunas (etapas ativas); cabeçalho de cada coluna com `qtd` + `total` (via
  `resumoFunil`); cards com prospect, valor (`R$`), serviço e responsável. Cada card: **← →**
  (`definirEtapa` para `etapaAdjacente`), **Ganho** (`definirEtapa(id,"ganho")`) e **Perdido** (abre prompt
  de motivo → `definirEtapa(id,"perdido",motivo)`).
- **Toggle "Fechados"**: mostra os `ganho`/`perdido` (fora das colunas) — ganho com link "Converter em
  cliente" (ou "Ver cliente" se já `clienteId`), perdido com o motivo.
- **Filtro "só as minhas"** (client-side por `meu`).
- **"Nova oportunidade"** (modal com o formulário → `criarOportunidade`); **editar** card (modal →
  `salvarOportunidade`). Formulário: prospect (obrigatório), contato/telefone/email, origem, serviço,
  valor estimado, responsável, observações.
- Colunas rolam na horizontal no mobile (`overflow-x-auto`).

### Sidebar
Adicionar item **"Comercial"** (`/comercial`) visível quando `podeCriarCliente(papel)`, entre
"Onboarding" e "Atendimento".

## Tratamento de erros
- Sem permissão → `[]`/erro nas actions; redirect na página.
- Conversão: se a oportunidade não existir mais ao criar o cliente, o cliente é criado normalmente e o
  vínculo é ignorado (best-effort, não bloqueia).
- `valor_estimado` vazio → `null` (tratado como 0 nas somas).

## Testes
- **Unit (Vitest):** `etapaAdjacente` (bordas, ativas, terminais → null), `resumoFunil` (contagem/soma com
  `null`), `rotuloEtapa`.
- **Smoke:** `QuadroComercial` renderiza as 4 colunas + cards + seção "Fechados" sem lançar; filtro
  "minhas".

## Migrations
`0054_comercial_oportunidade.sql` (enum + tabela + RLS por papel).
