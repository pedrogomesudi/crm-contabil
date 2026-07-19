# RF-026 — Vínculos entre entidades (cadastro do cliente) — Design

**O que é:** dar ao cadastro do cliente o modelo de **vínculos entre entidades** — **grupo econômico**,
**matriz/filial** e **sócios em comum** — ligados **à mão** pelo escritório, mais o toque **amigável** no
**aviso de CPF/CNPJ duplicado** (que já existe, mas hoje não diz *qual* cliente). Fecha a parte estrutural do
RF-026. **Duas fatias**; tem migration.

## Escopo (decidido no brainstorm)

- **Os três vínculos**, modelados: grupo econômico, matriz/filial e sócios em comum.
- **Vínculo manual:** o escritório liga tudo à mão. **Sem** sugestão automática (raiz do CNPJ / CPF do sócio).
- **Sócio = nome + CPF**, só o vínculo — sem percentual de participação, sem qualificação societária.
- **Aviso de duplicidade:** só o acabamento amigável (nome + link); a detecção já existe.

## O estado de hoje (medido)

- `clientes` tem `cpf_cnpj text not null unique` (migration `0003`). O banco **já impede** CPF/CNPJ duplicado.
- `criarCliente` (`src/app/(app)/clientes/actions.ts:102-114`) **já trata** o `23505`: consulta o cliente
  existente, distingue **ativo/inativo** e devolve `reativarId` para o inativo. As mensagens são texto seco —
  **não citam o nome** do cliente existente nem oferecem link.
- **Não existe** qualquer modelo de vínculo entre clientes: nenhuma tabela de grupo, sócio ou relação
  matriz/filial; nenhuma coluna `grupo_id`/`matriz_id`. O campo `clientes.representante` é texto livre (1 por
  cliente) e **não** cobre múltiplos sócios — fica como está.
- A página de detalhe do cliente (`src/app/(app)/clientes/[id]/page.tsx`) tem abas; a aba **cadastro**
  renderiza seções como `LegalizacaoSection` e `OptOutLegalizacao`. É onde os vínculos entram.
- Padrões reusáveis: `createServerSupabase` + `revalidatePath` (actions de cliente), normalização de documento
  só-dígitos (`actions.ts:64` — `dados.cpf_cnpj.replace(/\D/g, "")`), `Botao`/`controleCls`, e o guard
  `divida-ui` que **proíbe `border` estático** em inputs (usar `ring-1 ring-inset ring-linha`).

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Representação dos vínculos | **Três estruturas explícitas** (grupo nomeado + `grupo_id`; `matriz_id` auto-ref; `socio`+`cliente_socio`) | "Ver o grupo a partir de um cliente" vira um `where grupo_id = X`; sem fecho transitivo. |
| Grupo econômico | Entidade nomeada `grupo_economico`; cliente pertence a **≤1** grupo (`clientes.grupo_id`) | Uma empresa está em um grupo; simples e direto. |
| Matriz/filial | `clientes.matriz_id` (auto-referência); filial aponta para a matriz | A matriz é quem tem `matriz_id` nulo e é referida por filiais. |
| Sócio | `socio(nome, cpf único)` + `cliente_socio` N:N; **"em comum" = CPF compartilhado** | O upsert por CPF reusa a pessoa → o vínculo em comum acontece naturalmente. |
| Detecção automática | **Nenhuma** | Decidido: vínculo manual. |
| Aviso de duplicidade | **Enhance** do fluxo existente: cita nome + link | A detecção já existe; falta só o acabamento. |
| Onde fica a UI | Seção na **aba cadastro** da página do cliente | Segue `LegalizacaoSection`/`OptOutLegalizacao`; sem rota nova. |

## Arquitetura

### O modelo de dados (migration 0107)

```sql
-- Grupo econômico: entidade nomeada; cada cliente pertence a ≤1 grupo.
create table if not exists grupo_economico (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

-- Sócio (pessoa): nome + CPF. CPF único → base de "sócios em comum".
create table if not exists socio (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text not null unique,          -- só dígitos, como cpf_cnpj de clientes
  criado_em timestamptz not null default now()
);

-- Ligação cliente ↔ sócio (N:N).
create table if not exists cliente_socio (
  cliente_id uuid not null references clientes(id) on delete cascade,
  socio_id  uuid not null references socio(id)     on delete cascade,
  primary key (cliente_id, socio_id)
);

-- Vínculos diretos no cliente (idempotente).
alter table clientes add column if not exists grupo_id  uuid references grupo_economico(id) on delete set null;
alter table clientes add column if not exists matriz_id uuid references clientes(id)        on delete set null;
do $$ begin
  alter table clientes drop constraint if exists clientes_matriz_nao_self;
  alter table clientes add  constraint clientes_matriz_nao_self check (matriz_id is null or matriz_id <> id);
end $$;
```

- **grupo:** "empresas do mesmo grupo" = `where grupo_id = X and id <> self`.
- **matriz/filial:** filial → `matriz_id` da matriz. A action impede escolher como matriz um cliente que já é
  filial (`matriz_id is not null`) — sem cadeias de 2 níveis. A `check` garante que ninguém é a própria matriz.
- **sócios em comum:** dois clientes que compartilham um `socio_id`.
- `on delete`: apagar grupo/sócio **nunca** apaga o cliente (`set null` / `cascade` só na ligação).

**RLS** (espelha `clientes` — quem edita cadastro gere vínculos):

- `grupo_economico`, `socio` — dicionários compartilhados: **leitura** para `admin/assistente/contador`;
  **escrita** para `admin/assistente` (o contador liga/desliga vínculos dos próprios clientes via
  `cliente_socio`/colunas, mas não precisa gerir o dicionário global — se surgir a necessidade, amplia depois).
- `cliente_socio` — **leitura** para a equipe; **escrita** para `admin/assistente`.
- `clientes.grupo_id`/`matriz_id` herdam a RLS de `clientes`.

As policies seguem o padrão idempotente `drop policy if exists … ; create policy …` das migrations anteriores.

### A lógica pura (`src/lib/clientes/vinculos.ts`)

O grosso das leituras é SQL; a peça que vale isolar e testar é a consolidação das empresas relacionadas.

```ts
export type VinculoTipo = "grupo" | "matriz" | "filial" | "socio";
export type EmpresaRelacionada = { clienteId: string; nome: string; tipos: VinculoTipo[] };

// Junta empresas do mesmo grupo, a matriz, as filiais e os "colegas de sócio"
// numa lista deduplicada por clienteId, somando os motivos. Exclui `self`.
export function consolidarRelacionadas(
  self: string,
  fontes: { tipo: VinculoTipo; empresas: { clienteId: string; nome: string }[] }[],
): EmpresaRelacionada[];
```

Regras: dedup por `clienteId`; um cliente que aparece por dois motivos acumula os dois `tipos`; o próprio
`self` nunca entra; a ordem de saída é estável (ordem de primeira aparição). É o que a `VinculosSection` usa
para mostrar "Padaria X (mesmo grupo, mesmo sócio)".

### As actions (`src/app/(app)/clientes/[id]/vinculos-actions.ts`)

Todas com `createServerSupabase` + `revalidatePath` no padrão das actions de cliente; erros amigáveis.

- `definirGrupo(clienteId, grupoId | null)` — vincula/desvincula o grupo.
- `criarGrupo(clienteId, nome)` — cria o `grupo_economico` e já liga o cliente a ele.
- `definirMatriz(clienteId, matrizId | null)` — recusa `matrizId === clienteId` e recusa uma matriz que já
  seja filial (`matriz_id is not null`).
- `adicionarSocio(clienteId, nome, cpf)` — normaliza CPF (só dígitos), faz **upsert em `socio` por CPF**
  (reusa a pessoa se já existe → é assim que "em comum" acontece) e liga em `cliente_socio`.
- `removerSocio(clienteId, socioId)` — remove a ligação (não apaga o sócio do dicionário).

### O aviso de duplicidade (enhance em `actions.ts`)

Mudança mínima, sem migration:

- No branch `23505` de `criarCliente`, o select passa a trazer `id, status, razao_social`.
- As mensagens citam **o nome** do cliente existente; o estado devolvido carrega o `id` para a UI oferecer um
  **link** para `/clientes/{id}`. O `reativarId` do inativo continua como está.

### As telas

Nova **`VinculosSection`** (`src/components/clientes/VinculosSection.tsx`) na **aba cadastro**, abaixo de
`LegalizacaoSection`. Server component que carrega os dados; sub-formulários client chamando as actions. Três
blocos:

- **Grupo econômico:** nome do grupo (ou "sem grupo") + seletor para escolher/criar grupo; lista "outras
  empresas do grupo" (links para `/clientes/{id}`).
- **Matriz/filial:** se filial, mostra a matriz (link); se matriz, lista as filiais; seletor para definir a
  matriz.
- **Sócios:** lista nome/CPF com adicionar/remover; para cada sócio, "também em: X, Y" (outros clientes com o
  mesmo CPF).

Padrões visuais existentes: inputs **sem `border` estático** (`ring-1 ring-inset ring-linha`); `Botao`;
`controleCls("compacto")`.

## Fatias de implementação

- **Fatia A — grupo econômico + matriz/filial + aviso de duplicidade amigável.** Migration com as colunas
  `grupo_id`/`matriz_id`, a `check`, a tabela `grupo_economico` e suas policies; os blocos de grupo e
  matriz/filial na `VinculosSection`; o enhance do aviso de duplicidade; `consolidarRelacionadas` (já cobrindo
  grupo/matriz/filial); release.
- **Fatia B — sócios em comum.** Tabelas `socio` + `cliente_socio` e policies; `adicionarSocio`/`removerSocio`;
  o bloco de sócios na section (incl. "também em"); `consolidarRelacionadas` estendida para a fonte `socio`;
  release.

Cada fatia é shippável e testável sozinha.

## Verificação

- **Lógica testável:** `consolidarRelacionadas` — dedup por `clienteId`, acúmulo de `tipos`, exclusão do
  `self`, ordem estável.
- **Aviso de duplicidade:** ao criar com CPF/CNPJ já existente, a mensagem cita o nome e o estado traz o `id`
  do cliente existente para o link.
- **Vínculos:** `definirMatriz` recusa self e recusa filial-como-matriz; `adicionarSocio` reusa o sócio por
  CPF (dois clientes com o mesmo CPF passam a compartilhar o `socio_id`); apagar grupo/sócio não apaga cliente.
- **RLS:** as novas tabelas respeitam leitura/escrita por papel.
- **Não-regressão:** `divida-ui` (inputs sem `border`); `lint`, `typecheck`, `test`, `format:check`, `build`;
  migration idempotente e **aplicada em produção antes do deploy** (runner `db:migrate`). Sem rota nova →
  `rotas-alcancaveis` não muda.

## Fora de escopo

| O quê | Por quê |
|---|---|
| Sugestão automática de vínculos (raiz do CNPJ / CPF do sócio) | Decidido: vínculo manual. |
| Percentual de participação societária / papel do sócio | Sócio é só nome + CPF nesta entrega. |
| Hierarquia de grupos / sub-grupos / cadeia matriz→filial→filial | Um nível; a action recusa filial-como-matriz. |
| Campos customizáveis por escritório (RF-027) | Subsistema independente; spec própria. |
| Estruturar `clientes.representante` em pessoa+CPF | Fica como texto livre; sócios são o modelo estruturado. |

## Riscos

| Risco | Mitigação |
|---|---|
| Cadeia matriz→filial→filial | A action recusa escolher como matriz um cliente que já é filial. |
| Sócio digitado com CPF divergente não "casa" em comum | Normalização só-dígitos + `cpf` único no `socio`. |
| Apagar grupo/sócio referido por cliente | `on delete set null` (grupo/matriz) e `cascade` só na ligação — nunca no cliente. |
| Contador sem permissão de escrita no dicionário | RLS de escrita em `admin/assistente`; amplia se a operação exigir. |
