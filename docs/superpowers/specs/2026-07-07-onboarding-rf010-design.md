# Onboarding de cliente (RF-010) — Design

**Data:** 2026-07-07
**Marco:** primeiro ciclo do subsistema Onboarding & Legalização. RF-010 (MVP): workflow de entrada de
cliente com checklist configurável, incluindo cofre de credenciais para "acessos".
**F2 (fora deste ciclo):** RF-011 (processos por órgão/protocolo/prazo), RF-012 (templates por tipo de
serviço), RF-013 (aviso automático ao cliente), RF-014 (transferência de contabilidade / NBC PG 01).

**Contexto:** já existem `clientes`, `documentos` (com e-assinatura), `nfse_certificado_cliente`
(certificados), `usuarios`. Cripto reutilizável em `src/lib/nfse/cripto.ts`
(`cifrar(Buffer, chaveHex): string` / `decifrar(pacote, chaveHex): Buffer`, AES-256-GCM). Papéis em
`src/lib/tipos.ts` (`Papel`); gates de cliente em `src/lib/clientes/permissoes.ts`. RLS por `auth_papel()`.

## Decisões (do brainstorming)

1. **Um checklist-modelo único, editável pelo admin.** Cada cliente recebe uma cópia ao iniciar.
2. **Item uniforme + cofre de credenciais nos "acessos".** Todo item tem status/anexo/responsável/prazo/
   observação; itens de categoria `acesso` guardam URL/login + **senha cifrada**.
3. **Aba no cliente + lista global.**
4. **Revelar senha:** só **admin/contador**, com auditoria. Assistente monta o checklist e marca itens,
   mas não revela senhas.

## Dados — migration `0048_onboarding.sql`

```sql
do $$ begin create type onboarding_categoria as enum ('documento','procuracao','certificado','acesso','responsavel'); exception when duplicate_object then null; end $$;
do $$ begin create type onboarding_status as enum ('pendente','concluido','dispensado'); exception when duplicate_object then null; end $$;

-- Checklist-modelo (único, editável pelo admin)
create table if not exists onboarding_item_modelo (
  id uuid primary key default gen_random_uuid(),
  categoria onboarding_categoria not null,
  nome text not null,
  obrigatorio boolean not null default true,
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Item por cliente (cópia do modelo + acompanhamento)
create table if not exists onboarding_item (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  categoria onboarding_categoria not null,
  nome text not null,
  obrigatorio boolean not null default true,
  ordem int not null default 0,
  status onboarding_status not null default 'pendente',
  responsavel_id uuid references usuarios(id),
  prazo date,
  observacao text,
  anexo_path text,
  acesso_url text,
  acesso_login text,
  acesso_senha_cifrada text,   -- pacote AES-GCM; NUNCA retornado em texto na listagem
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
create index if not exists idx_onboarding_item_cliente on onboarding_item(cliente_id);

-- Auditoria de revelação de senha
create table if not exists onboarding_log_credencial (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references onboarding_item(id) on delete cascade,
  usuario_id uuid references usuarios(id),
  em timestamptz not null default now()
);

alter table onboarding_item_modelo enable row level security;
alter table onboarding_item enable row level security;
alter table onboarding_log_credencial enable row level security;

do $$ begin
  drop policy if exists onboarding_modelo_sel on onboarding_item_modelo;
  create policy onboarding_modelo_sel on onboarding_item_modelo for select to authenticated using (auth_papel() in ('admin','contador','assistente'));
  drop policy if exists onboarding_modelo_wr on onboarding_item_modelo;
  create policy onboarding_modelo_wr on onboarding_item_modelo for all to authenticated using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
  drop policy if exists onboarding_item_all on onboarding_item;
  create policy onboarding_item_all on onboarding_item for all to authenticated using (auth_papel() in ('admin','contador','assistente')) with check (auth_papel() in ('admin','contador','assistente'));
  drop policy if exists onboarding_log_ins on onboarding_log_credencial;
  create policy onboarding_log_ins on onboarding_log_credencial for insert to authenticated with check (auth_papel() in ('admin','contador'));
  drop policy if exists onboarding_log_sel on onboarding_log_credencial;
  create policy onboarding_log_sel on onboarding_log_credencial for select to authenticated using (auth_papel() = 'admin');
end $$;
```

**Nota de segurança sobre a coluna cifrada:** a RLS deixa assistente *ler a linha* (inclusive
`acesso_senha_cifrada`), mas o texto é opaco sem a chave. A proteção real é a **action de revelar**
(gated admin/contador + auditoria) e o fato de a **listagem nunca selecionar** `acesso_senha_cifrada`.

## Cripto de credencial — `src/lib/onboarding/credencial.ts`

Reutiliza `cifrar`/`decifrar` do NFS-e com uma chave dedicada em `process.env.ONBOARDING_CRIPTO_KEY`
(hex de 32 bytes). **Definida uma vez, nunca alterada** (senão as senhas gravadas ficam irrecuperáveis —
mesma regra do `WHATSAPP_CRIPTO_KEY`). Passo de deploy do usuário.

```ts
export function cifrarSenha(senha: string): string;   // → pacote AES-GCM (string)
export function decifrarSenha(pacote: string): string; // → senha em texto
```

Ambas leem `ONBOARDING_CRIPTO_KEY`; lançam erro claro se ausente.

## Helpers puros — `src/lib/onboarding/progresso.ts` (TDD)

```ts
export type CategoriaOnb = "documento" | "procuracao" | "certificado" | "acesso" | "responsavel";
export type StatusOnb = "pendente" | "concluido" | "dispensado";
export type ItemOnb = { id: string; categoria: CategoriaOnb; nome: string; obrigatorio: boolean; ordem: number; status: StatusOnb; prazo: string | null };

// concluido = todos os obrigatórios em concluido/dispensado. pct = concluídos / total (0 se vazio).
export function progressoOnboarding(itens: ItemOnb[]): { total: number; concluidos: number; obrigatoriosPendentes: number; pct: number; concluido: boolean };

// Agrupa na ordem fixa das categorias; dentro, por `ordem`.
export function agruparPorCategoria(itens: ItemOnb[]): { categoria: CategoriaOnb; itens: ItemOnb[] }[];

// Menor prazo entre itens pendentes (string YYYY-MM-DD) ou null.
export function proximoPrazo(itens: ItemOnb[]): string | null;
```

## Actions

### Modelo + lista global — `src/app/(app)/onboarding/actions.ts`
- `listarModelo(): Promise<ItemModelo[]>` — gate `podeCriarCliente` (lê o modelo). `ItemModelo = { id, categoria, nome, obrigatorio, ordem, ativo }`.
- `salvarModeloItem(input): Promise<{ ok?; erro? }>` — upsert (id opcional); gate **admin**.
- `removerModeloItem(id): Promise<{ ok?; erro? }>` — gate admin.
- `listarOnboardings(): Promise<{ clienteId; razaoSocial; total; concluidos; pct; concluido; proximoPrazo }[]>` — clientes que têm `onboarding_item`, com progresso (via helpers). Gate `podeCriarCliente`.

### Por cliente — `src/app/(app)/clientes/[id]/onboarding.ts`
- `listarOnboardingCliente(clienteId): Promise<{ itens: ItemClienteView[]; progresso }>` — itens **sem** `acesso_senha_cifrada`; inclui `temSenha: boolean`. Gate `podeCriarCliente`.
- `iniciarOnboarding(clienteId): Promise<{ ok?; erro? }>` — se ainda não há itens, copia `onboarding_item_modelo` ativo → `onboarding_item`. Gate `podeCriarCliente`.
- `salvarItemOnboarding(input): Promise<{ ok?; erro? }>` — cria/edita item (nome, categoria, obrigatorio, status, responsavel_id, prazo, observacao, acesso_url, acesso_login; se `novaSenha` presente → `cifrarSenha`). Gate `podeCriarCliente`.
- `removerItemOnboarding(id): Promise<{ ok?; erro? }>` — gate `podeCriarCliente`.
- `revelarSenha(itemId): Promise<{ senha?: string; erro? }>` — gate **admin/contador**; decifra `acesso_senha_cifrada`, **insere em `onboarding_log_credencial`**, retorna `{ senha }`.

**Anexo (adiado):** a coluna `anexo_path` existe reservada, mas **o upload fica fora do MVP** (evita
somar Storage + rota segura ao cofre, que já é a parte sensível). No MVP os arquivos do cliente seguem na
seção **Documentos** existente; o item do checklist rastreia status/observação. Upload direto no item é
um refinamento posterior.

## RBAC — `src/lib/clientes/permissoes.ts` (adicionar)
```ts
export function podeRevelarCredencial(papel: Papel | undefined): boolean; // admin || contador
export function podeGerenciarModeloOnboarding(papel: Papel | undefined): boolean; // admin
```
Gerenciar itens do cliente reutiliza `podeCriarCliente` (admin/contador/assistente).

## UI

### Aba no cliente — `src/components/onboarding/OnboardingSection.tsx` (client)
Renderizada em `src/app/(app)/clientes/[id]/page.tsx` (nova seção, como `DocumentosSection`).
- Se sem itens → estado vazio com botão **"Iniciar onboarding"** (`iniciarOnboarding`).
- Com itens: **barra de progresso** (pct + "X de Y obrigatórios"); itens **agrupados por categoria**.
  Cada item: nome, selo de status (pendente/concluído/dispensado), responsável, prazo, observação.
  - Editar item (status, responsável, prazo, observação) inline/modal → `salvarItemOnboarding`.
  - Itens de **acesso**: mostram URL + login e botão **"Revelar senha"** (só habilitado p/ admin/contador);
    ao clicar → `revelarSenha`, exibe a senha temporariamente e registra auditoria.
  - **Adicionar item** ad-hoc + **remover**.
- Recebe `podeRevelar: boolean` (derivado do papel na server page) para habilitar o botão.

### Lista global — `src/app/(app)/onboarding/page.tsx` + `ListaOnboarding.tsx`
Gate `podeCriarCliente` (senão redirect). Tabela: cliente, progresso (%/barra), obrigatórios pendentes,
próximo prazo, link para a ficha. Ordenada por menor progresso primeiro.

### Config do modelo — `src/app/(app)/configuracoes/onboarding/page.tsx` + editor
Gate admin. Lista os itens-modelo (categoria, nome, obrigatório, ordem, ativo) com adicionar/editar/
remover (`salvarModeloItem`/`removerModeloItem`).

### Navegação
- Menu lateral: item **"Onboarding"** → `/onboarding` (visível para `podeCriarCliente`).
- Configurações: link **"Checklist de onboarding"** → `/configuracoes/onboarding` (admin).

## Tratamento de erros
- Sem permissão → redirect / action retorna `{ erro }` ou lista vazia.
- `iniciarOnboarding` idempotente: se já houver itens, não duplica (retorna ok sem copiar).
- `ONBOARDING_CRIPTO_KEY` ausente → `cifrarSenha`/`decifrarSenha` lançam erro claro; a action de salvar
  senha/revelar retorna `{ erro }` amigável.
- Revelar senha em item sem senha → `{ erro: "Sem senha cadastrada." }`.

## Testes
- **Unit (Vitest):** `progressoOnboarding` (vazio, parcial, todos obrigatórios ok/dispensado),
  `agruparPorCategoria` (ordem das categorias + ordem interna), `proximoPrazo` (ignora não-pendentes).
- **Cripto:** `cifrarSenha`→`decifrarSenha` round-trip com chave de teste (via env no teste); erro sem chave.
- **Smoke:** `OnboardingSection` renderiza (estado vazio e com itens mockados) sem lançar.

## Migrations
Uma migration nova: `0048_onboarding.sql` (2 enums + 3 tabelas + RLS). Enums em bloco `do $$` idempotente.
Sem `ALTER TYPE ... ADD VALUE` (enums criados inteiros de uma vez).
