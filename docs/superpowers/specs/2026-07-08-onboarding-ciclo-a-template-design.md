# Onboarding — Motor de template de processo (Ciclo A) — Design

**Data:** 2026-07-08
**Marco:** evolui o onboarding plano (RF-010, migrations 0048/0049) para um **motor de processo
estruturado** com blocos, prazos relativos (D+n), perfis de cliente e condições — tornando o template
"onboarding-cliente-existente" (fornecido pelo usuário em JSON) representável e executável.

**Decisões (do brainstorming):**
1. **Semear o template do JSON + editar itens** na UI; construtor completo de templates (blocos/novos
   templates pela interface) = **v2 (standby)**.
2. **Perfil + flags capturados por formulário ao instanciar**, guardados no processo.

**Contexto:** cripto do cofre (`src/lib/onboarding/credencial.ts`: `cifrarSenha`/`decifrarSenha`) e os
gates (`podeCriarCliente`, `podeRevelarCredencial`, `podeGerenciarModeloOnboarding`) já existem. O MVP
plano (`onboarding_item_modelo`, `onboarding_item`) tem só dados de teste — **será descartado**.

## Escopo (Ciclo A)

- Novo modelo de dados (template → blocos → itens; processo → itens materializados) + RLS.
- Seed do template do usuário (7 blocos, ~35 itens) — **itens editáveis**.
- Helpers puros (perfil sugerido, aplicabilidade por perfil/condição, cálculo D+n, progresso).
- Actions (template, instanciar, itens do processo, revelar senha, lista global).
- UI: aba do cliente (formulário de instanciação + itens por bloco), lista global, editor do template.

**Fora do Ciclo A (vai pro B/C):** `campo_destino` (write-back ao cadastro), `depende_de` (dependências),
upload de anexo obrigatório, alertas escalonados por prazo, `gera_oportunidade_consultoria`, gatilho pelo
comercial (RF-006), matriz de obrigações. Esses campos são **guardados como metadado** (exibidos/marcados)
mas sem automação neste ciclo.

**Substitui o código do RF-010:** o modelo plano é aposentado. Serão **removidos/substituídos**:
`OnboardingSection.tsx` → `ProcessoSection.tsx`; `clientes/[id]/onboarding.ts` → `.../processo.ts`;
`onboarding/actions.ts` (modelo plano) → `template-actions.ts` + novo `actions.ts` (lista de processos);
`configuracoes/onboarding/EditorModelo.tsx` → `EditorTemplate.tsx`; o `src/lib/onboarding/progresso.ts`
plano é substituído pelos helpers de `processo.ts`. O cofre (`credencial.ts`) e os gates permanecem.

## Vocabulário

- **Perfis** (5): `mei`, `simples_sem_func`, `simples_com_func`, `presumido_real`, `pf`.
- **Flags de condição** (booleanas, capturadas ao instanciar): `possui_contador_anterior`,
  `possui_funcionarios`, `possui_prolabore`, `atividade_exige_licencas`, `possui_erp`, `complexidade_alta`.
- **Papel-responsável**: um dos `Papel` (admin/contador/assistente/financeiro).
- **Tipo de item**: `padrao` ou `acesso` (itens `acesso` habilitam o **cofre** de credenciais).

## Dados — migration `0050_onboarding_template.sql`

Remove o modelo plano e cria a estrutura nova.

```sql
-- descarta o MVP plano (só dados de teste)
drop table if exists onboarding_log_credencial cascade;
drop table if exists onboarding_item cascade;
drop table if exists onboarding_item_modelo cascade;

do $$ begin create type onboarding_perfil as enum ('mei','simples_sem_func','simples_com_func','presumido_real','pf'); exception when duplicate_object then null; end $$;
do $$ begin create type onboarding_item_tipo as enum ('padrao','acesso'); exception when duplicate_object then null; end $$;
do $$ begin create type onboarding_condicao_modo as enum ('any','all'); exception when duplicate_object then null; end $$;
do $$ begin create type onboarding_processo_status as enum ('em_andamento','concluido'); exception when duplicate_object then null; end $$;
-- reaproveita onboarding_status (pendente/concluido/dispensado), criado na 0048

create table if not exists onboarding_template (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  descricao text,
  data_referencia text not null default 'data_inicio_processo',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists onboarding_bloco (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references onboarding_template(id) on delete cascade,
  ordem int not null,
  slug text not null,
  nome text not null,
  prazo_bloco_dias int
);

create table if not exists onboarding_template_item (
  id uuid primary key default gen_random_uuid(),
  bloco_id uuid not null references onboarding_bloco(id) on delete cascade,
  codigo text not null,                       -- "1.1", "4.7"
  titulo text not null,
  descricao text,
  tipo onboarding_item_tipo not null default 'padrao',
  responsavel_papel papel,
  prazo_dias int,                             -- D+n
  aplicavel_a text[] not null default '{*}',  -- perfis ou {'*'}
  condicao_flags text[] not null default '{}',
  condicao_modo onboarding_condicao_modo not null default 'all',
  bloqueante boolean not null default false,
  anexo_obrigatorio boolean not null default false,
  alerta_risco text,
  ordem int not null default 0
);

create table if not exists onboarding_processo (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  template_id uuid not null references onboarding_template(id),
  data_inicio date not null,
  perfil onboarding_perfil not null,
  flags jsonb not null default '{}',
  status onboarding_processo_status not null default 'em_andamento',
  criado_por uuid references usuarios(id),
  criado_em timestamptz not null default now()
);
create index if not exists idx_onb_processo_cliente on onboarding_processo(cliente_id);

create table if not exists onboarding_processo_item (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references onboarding_processo(id) on delete cascade,
  bloco_ordem int not null,
  bloco_nome text not null,
  codigo text,
  titulo text not null,
  descricao text,
  tipo onboarding_item_tipo not null default 'padrao',
  responsavel_papel papel,
  responsavel_id uuid references usuarios(id),
  prazo date,
  status onboarding_status not null default 'pendente',
  observacao text,
  bloqueante boolean not null default false,
  anexo_obrigatorio boolean not null default false,
  alerta_risco text,
  ordem int not null default 0,
  -- cofre (itens tipo 'acesso')
  acesso_url text,
  acesso_login text,
  acesso_senha_cifrada text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
create index if not exists idx_onb_processo_item_proc on onboarding_processo_item(processo_id);

create table if not exists onboarding_log_credencial (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references onboarding_processo_item(id) on delete cascade,
  usuario_id uuid references usuarios(id),
  em timestamptz not null default now()
);

alter table onboarding_template enable row level security;
alter table onboarding_bloco enable row level security;
alter table onboarding_template_item enable row level security;
alter table onboarding_processo enable row level security;
alter table onboarding_processo_item enable row level security;
alter table onboarding_log_credencial enable row level security;
```

**RLS (bloco `do $$`):**
- `onboarding_template` / `onboarding_bloco` / `onboarding_template_item`: **select** para
  `auth_papel() in ('admin','contador','assistente')`; **write (all)** só `auth_papel() = 'admin'`.
- `onboarding_processo`: `for all` com `auth_papel() in ('admin','contador','assistente')` **e**
  `exists (select 1 from clientes c where c.id = cliente_id)` (isolamento por cliente).
- `onboarding_processo_item`: `for all` com o papel acima **e**
  `exists (select 1 from onboarding_processo pr join clientes c on c.id = pr.cliente_id where pr.id = processo_id)`.
- `onboarding_log_credencial`: **insert** com `auth_papel() in ('admin','contador')` **e**
  `usuario_id = auth.uid()` **e** o item pertencer a um processo de cliente visível; **select** só admin.

## Seed — `0051_onboarding_seed_template.sql`

Insere o template `onboarding-cliente-existente` (nome, blocos 1–7, itens do JSON) **apenas se o slug
ainda não existir** (idempotente; não sobrescreve edições). Conversões:
- `prazo` "D+n" → `prazo_dias = n`; `prazo_conclusao_bloco` "D+3" → `prazo_bloco_dias = 3`.
- `aplicavel_a: ["*"]` → `{*}`; senão o array de perfis.
- `condicao` normalizada em `condicao_flags` + `condicao_modo`:
  - `possui_contador_anterior == true` → `{possui_contador_anterior}`, `all`.
  - `possui_funcionarios == true OR possui_prolabore == true` → `{possui_funcionarios,possui_prolabore}`, `any`.
  - `atividade_exige_licencas == true` → `{atividade_exige_licencas}`, `all`.
  - `possui_erp == true` → `{possui_erp}`, `all`.
  - `complexidade_fiscal == 'alta'` → `{complexidade_alta}`, `all`.
- Item **3.5** ("Acessos registrados no cofre") → `tipo = 'acesso'`; os demais `padrao`.
- `bloqueante`, `anexo_obrigatorio`, `alerta_risco` → colunas homônimas. `campo_destino`/`depende_de`/
  `gera_oportunidade_consultoria` **ignorados no Ciclo A** (viram metadado no B/C).

## Helpers puros — `src/lib/onboarding/processo.ts` (TDD)

```ts
export type PerfilCliente = "mei" | "simples_sem_func" | "simples_com_func" | "presumido_real" | "pf";
export type FlagsProcesso = Record<string, boolean>;
export type TemplateItem = { codigo: string; titulo: string; descricao: string | null; tipo: "padrao" | "acesso"; responsavelPapel: string | null; prazoDias: number | null; aplicavelA: string[]; condicaoFlags: string[]; condicaoModo: "any" | "all"; bloqueante: boolean; anexoObrigatorio: boolean; alertaRisco: string | null; ordem: number };
export type TemplateBloco = { ordem: number; nome: string; prazoBlocoDias: number | null; itens: TemplateItem[] };
export type ProcessoItemSeed = { blocoOrdem: number; blocoNome: string; codigo: string; titulo: string; descricao: string | null; tipo: "padrao" | "acesso"; responsavelPapel: string | null; prazo: string | null; bloqueante: boolean; anexoObrigatorio: boolean; alertaRisco: string | null; ordem: number };

// Sugestão de perfil a partir do cadastro (o usuário confirma no formulário).
export function sugerirPerfil(tipoPessoa: string, regime: string, qtdFuncionarios: number | null): PerfilCliente;

// data (YYYY-MM-DD) + n dias corridos → YYYY-MM-DD (sem deslocamento de fuso).
export function somarDias(dataIso: string, n: number): string;

// Item aplica ao perfil + flags? perfil ∈ aplicavelA (ou '*'); e condição satisfeita.
export function itemAplica(item: { aplicavelA: string[]; condicaoFlags: string[]; condicaoModo: "any" | "all" }, perfil: PerfilCliente, flags: FlagsProcesso): boolean;

// Filtra os itens do template por perfil/flags e calcula prazos absolutos.
export function materializarProcesso(blocos: TemplateBloco[], perfil: PerfilCliente, flags: FlagsProcesso, dataInicio: string): ProcessoItemSeed[];

// Progresso do processo.
export function progressoProcesso(itens: { status: "pendente" | "concluido" | "dispensado"; prazo: string | null; bloqueante: boolean }[]): { total: number; concluidos: number; bloqueantesPendentes: number; pct: number; concluido: boolean; proximoPrazo: string | null };
```

Regras:
- `sugerirPerfil`: PF → `pf`; regime `MEI` → `mei`; `Simples` → `simples_com_func` se `qtd>0` senão
  `simples_sem_func`; `Presumido`/`Real` → `presumido_real`; fallback `simples_sem_func`.
- `somarDias`: parse UTC de `dataIso+T00:00:00Z`, soma `n*86400000`, formata `YYYY-MM-DD` em UTC.
- `itemAplica`: `perfil ∈ aplicavelA || aplicavelA.includes('*')`; sem `condicaoFlags` → true; senão
  `modo==='all'` exige todas as flags true, `any` exige ao menos uma.
- `materializarProcesso`: para cada bloco, filtra itens por `itemAplica`, calcula `prazo =
  prazoDias==null ? null : somarDias(dataInicio, prazoDias)`, preserva bloco/ordem.
- `progressoProcesso`: `pct = concluidos/total`; `concluido` = todos em concluido/dispensado (total>0);
  `proximoPrazo` = menor prazo entre pendentes.

## Actions

### Template — `src/app/(app)/onboarding/template-actions.ts`
- `listarTemplate(): Promise<{ template; blocos: (TemplateBloco & {id; itens:(TemplateItem&{id;blocoId})[]})[] } | null>` — gate `podeCriarCliente`.
- `salvarTemplateItem(input)` / `removerTemplateItem(id)` — gate **admin** (`podeGerenciarModeloOnboarding`).
  (Editar/adicionar/remover itens; escolher bloco, perfis, prazo, flags, tipo, bloqueante, anexo.)

### Por cliente — `src/app/(app)/clientes/[id]/processo.ts`
- `listarProcessoCliente(clienteId): Promise<{ processo; itens: ItemProcessoView[]; progresso } | null>` — itens **sem** `acesso_senha_cifrada` (só `temSenha`); gate `podeCriarCliente`.
- `iniciarProcesso(clienteId, perfil, flags, dataInicio): Promise<{ ok?; erro? }>` — se já houver processo,
  retorna ok; senão lê o template ativo, `materializarProcesso(...)`, insere `onboarding_processo` +
  itens. Gate `podeCriarCliente`.
- `salvarProcessoItem(input)` — status, responsavel_id, prazo, observação, url/login e `novaSenha`
  (→ `cifrarSenha`) para itens de acesso. Gate `podeCriarCliente`.
- `removerProcessoItem(id, clienteId)` — gate `podeCriarCliente`.
- `revelarSenha(itemId)` — gate **admin/contador**; decifra, **auditoria fail-closed** (sem log, não
  revela). (Idêntico ao Ciclo RF-010, apontando pro `onboarding_processo_item`.)

### Global — `src/app/(app)/onboarding/actions.ts`
- `listarProcessos(): Promise<ResumoProcesso[]>` — processos com cliente, %, próximo prazo, atrasados;
  ordenado por menor progresso. Gate `podeCriarCliente`.

## UI

### Aba do cliente — `src/components/onboarding/ProcessoSection.tsx`
- **Sem processo:** botão "Iniciar processo" → `FormularioInstanciar`: campo **data de início** (default
  hoje), **perfil** (select pré-preenchido por `sugerirPerfil`), **flags** (checkboxes com rótulos
  amigáveis). Ao confirmar → `iniciarProcesso`.
- **Com processo:** cabeçalho (perfil, barra de progresso, próximo prazo); itens **agrupados por bloco**
  (nome + prazo do bloco); cada item: código, título, **prazo (data)**, selo de status, responsável
  (papel), selos **bloqueante**/anexo, `alerta_risco` em destaque (fundo negativo/10). Itens de **acesso**
  mostram URL/login + "Revelar senha" (admin/contador). Editar/adicionar/remover item (modal).

### Lista global — `src/app/(app)/onboarding/page.tsx` + `ListaProcessos.tsx`
Tabela: cliente, perfil, progresso (%), obrigatórios/bloqueantes pendentes, próximo prazo, **atrasado**
(prazo < hoje). Gate `podeCriarCliente`.

### Editor do template — `src/app/(app)/configuracoes/onboarding/page.tsx` + `EditorTemplate.tsx`
Gate admin. Lista os blocos e, dentro, os itens (código, título, perfis, prazo D+n, tipo, bloqueante),
com adicionar/editar/remover item. **Criar blocos/templates = v2** (nesta versão os blocos vêm do seed).

### Navegação
Mantém os links já existentes ("Onboarding" no Sidebar; "Checklist de onboarding" → renomear para
"Template de onboarding" em Configurações).

## Tratamento de erros
- Sem permissão → redirect / `{ erro }` / lista vazia.
- `iniciarProcesso` idempotente (não duplica se já houver processo).
- `ONBOARDING_CRIPTO_KEY` ausente → salvar/revelar senha retorna erro amigável.
- Template inexistente/sem itens aplicáveis → processo vazio com aviso ("nenhum item para este perfil").

## Testes
- **Unit (Vitest):** `sugerirPerfil`, `somarDias` (virada de mês/ano, sem fuso), `itemAplica`
  (perfil `*`, all/any, sem condição), `materializarProcesso` (filtro por perfil+condição, prazos
  absolutos, bloco preservado), `progressoProcesso` (vazio/parcial/concluído, próximo prazo).
- **Cofre:** round-trip já coberto (RF-010).
- **Smoke:** `ProcessoSection` renderiza estado vazio (com formulário) e com itens/blocos mockados.

## Migrations
`0050_onboarding_template.sql` (drop do plano + tabelas/enums/RLS) e `0051_onboarding_seed_template.sql`
(seed idempotente do template do usuário). Enums criados inteiros (sem `ALTER TYPE ADD VALUE`).
