# Cobrança consolidada por grupo — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development ou
> superpowers:executing-plans para implementar tarefa a tarefa. Passos usam checkbox (`- [ ]`).

**Goal:** Emitir NF individual por CNPJ, mas um único boleto consolidado por "grupo de cobrança"
(na empresa titular, somando os honorários), com baixa automática de todos os títulos do grupo e
envio consolidado para a titular.

**Architecture:** Novo conceito `grupo_cobranca` (independente de grupo econômico/matriz). O
`boleto` passa a poder cobrir vários títulos via `boleto_titulo`. Geração em lote, webhook de
baixa e envio de honorários ganham o caminho "grupo". Adaptador Inter passa a enviar observações.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (migrations via `npm run db:migrate`,
runner próprio; imutabilidade de migrations já aplicadas), Tailwind 4, Inter (boleto), Vitest.

## Global Constraints

- Migrations novas: idempotentes (`create table if not exists`, `add column if not exists`,
  `drop policy if exists ... ; create policy ...`). Não editar migrations já aplicadas.
- RLS em toda tabela nova, no padrão das existentes (leitura equipe; escrita admin/assistente —
  ver `0107_vinculos_cliente.sql`).
- `auth_papel()` é a fonte do papel; nunca ler do JWT.
- Rodar antes de commitar: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`,
  `npm run build`. Cada release: bump `package.json` + topo do `CHANGELOG.md` (test `versao`).
- Fluxo de entrega: `develop` → PR → `verify` verde → merge → deploy manual (EasyPanel) → tag.
- Boleto/NF são fiscais: nenhuma emissão/cancelamento automático de NF neste projeto.

---

## FASE 1 — Fundação (schema, grupos, tela)

### Task 1.1: Migration do schema de grupos

**Files:**
- Create: `supabase/migrations/0137_grupo_cobranca.sql`

**Interfaces (Produces):** tabela `grupo_cobranca(id, nome, titular_cliente_id, criado_em,
criado_por)`; `clientes.grupo_cobranca_id`; `boleto_titulo(boleto_id, titulo_id, valor)`;
`boleto.titulo_id` nullable; `boleto.grupo_cobranca_id`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Grupo de cobrança: N empresas cobradas por 1 boleto na titular. NF continua individual.
create table if not exists grupo_cobranca (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  titular_cliente_id uuid not null references clientes(id) on delete restrict,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id) default auth.uid()
);
alter table clientes add column if not exists grupo_cobranca_id uuid references grupo_cobranca(id) on delete set null;
create index if not exists idx_clientes_grupo_cobranca on clientes(grupo_cobranca_id);

-- Boleto pode cobrir vários títulos (1 por empresa). titulo_id vira opcional (individuais mantêm).
alter table boleto alter column titulo_id drop not null;
alter table boleto add column if not exists grupo_cobranca_id uuid references grupo_cobranca(id) on delete set null;
create table if not exists boleto_titulo (
  boleto_id uuid not null references boleto(id) on delete cascade,
  titulo_id uuid not null references titulo(id) on delete cascade,
  valor numeric(15,2) not null,
  primary key (boleto_id, titulo_id)
);
create index if not exists idx_boleto_titulo_titulo on boleto_titulo(titulo_id);

-- Invariante: um boleto tem titulo_id (individual) OU grupo_cobranca_id (grupo), nunca ambos vazios.
alter table boleto drop constraint if exists boleto_alvo_chk;
alter table boleto add constraint boleto_alvo_chk check (titulo_id is not null or grupo_cobranca_id is not null);

alter table grupo_cobranca enable row level security;
alter table boleto_titulo enable row level security;
drop policy if exists grupo_cobranca_read on grupo_cobranca;
drop policy if exists grupo_cobranca_write on grupo_cobranca;
create policy grupo_cobranca_read on grupo_cobranca for select using (auth_papel() in ('admin','assistente','contador'));
create policy grupo_cobranca_write on grupo_cobranca for all using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));
drop policy if exists boleto_titulo_read on boleto_titulo;
drop policy if exists boleto_titulo_write on boleto_titulo;
create policy boleto_titulo_read on boleto_titulo for select using (auth_papel() in ('admin','assistente','contador'));
create policy boleto_titulo_write on boleto_titulo for all using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));
```

- [ ] **Step 2: Aplicar em ambiente de teste** — `npm run db:migrate` (Session pooler); confirmar
  em `app_migrations`. Rodar `npm run db:test` (RLS) e garantir verde.
- [ ] **Step 3: Commit.**

### Task 1.2: Núcleo puro de grupos (tipos + helpers testáveis)

**Files:**
- Create: `src/lib/financeiro/grupo-cobranca.ts`
- Test: `src/tests/financeiro/grupo-cobranca.test.ts`

**Interfaces (Produces):**
- `type MembroGrupo = { clienteId: string; razaoSocial: string; cpfCnpj: string; honorario: number }`
- `somarHonorariosGrupo(membros: MembroGrupo[]): number`
- `montarObservacoesGrupo(membros: MembroGrupo[], maxLinhas = 5): string[]` — uma linha
  "RAZÃO SOCIAL — 00.000.000/0000-00" por empresa; se exceder `maxLinhas`, as N-1 primeiras +
  última "e mais X empresa(s)".

- [ ] **Step 1: Teste (falhando)** — soma correta; observações: caso 3 empresas (3 linhas), caso
  7 empresas com maxLinhas=5 (4 linhas + "e mais 3 empresas"); CNPJ formatado.
- [ ] **Step 2: Rodar teste, ver falhar.**
- [ ] **Step 3: Implementar** helpers (reusar `formatarDocumento` de `@/lib/format`).
- [ ] **Step 4: Rodar teste, ver passar.**
- [ ] **Step 5: Commit.**

### Task 1.3: Server actions de grupo (CRUD)

**Files:**
- Create: `src/app/(app)/financeiro/grupos-cobranca/actions.ts`
- Test: `src/tests/financeiro/grupos-cobranca-actions.test.ts` (valida gate + validações puras)

**Interfaces (Produces):**
- `criarGrupo(nome: string, titularClienteId: string)`
- `renomearGrupo(grupoId, nome)` / `definirTitular(grupoId, clienteId)`
- `adicionarMembro(grupoId, clienteId)` / `removerMembro(clienteId)`
- `listarGrupos(): GrupoView[]` — cada grupo com titular e membros (razão, CNPJ, honorário)
- `listarClientesSemGrupo(): {id,nome}[]`

**Consumes:** `podeGerenciarFinanceiro`, `createServerSupabase`, `clientes_financeiro.honorario_mensal`.

- [ ] **Step 1:** Gate `podeGerenciarFinanceiro`. Validações: nome não vazio; titular deve ser
  membro (ao definir titular, se não for membro, setar `grupo_cobranca_id` dela também); um cliente
  em ≤1 grupo (adicionar a outro grupo primeiro remove do atual). `adicionarMembro` seta
  `clientes.grupo_cobranca_id`; `removerMembro` seta null (bloquear remover a titular sem trocar).
- [ ] **Step 2:** `revalidatePath` da tela. Testes das validações puras (extrair p/ helper se útil).
- [ ] **Step 3: Commit.**

### Task 1.4: Tela de gestão de grupos

**Files:**
- Create: `src/app/(app)/financeiro/grupos-cobranca/page.tsx` (server: gate + `listarGrupos`)
- Create: `src/components/financeiro/GruposCobranca.tsx` (client)
- Modify: `src/app/(app)/financeiro/cadastros/...` (adicionar link "Grupos de cobrança")

- [ ] **Step 1:** `page.tsx` no molde de relatórios (Container/Voltar/PageHeader), lista grupos.
- [ ] **Step 2:** `GruposCobranca.tsx`: criar grupo (nome + selecionar titular entre clientes sem
  grupo), listar grupos com membros (razão/CNPJ/honorário + total), adicionar/remover membro
  (select de clientes sem grupo), trocar titular. Sem prompts nativos (usar inputs/modais in-page).
- [ ] **Step 3:** Link no índice de cadastros/financeiro.
- [ ] **Step 4: Verificação** (`typecheck`/`lint`/`build`). Commit.

### Task 1.5: Vínculo na ficha do cliente

**Files:**
- Modify: `src/app/(app)/clientes/[id]/page.tsx` (carregar `grupo_cobranca_id` + nome do grupo)
- Modify/Create: um componente pequeno de exibição na aba Financeiro do cliente

- [ ] **Step 1:** Exibir "Pertence ao grupo de cobrança: X (titular: Y)" na aba Financeiro; para a
  titular, indicar "Titular do grupo X". Somente leitura (edição é na tela de grupos).
- [ ] **Step 2:** Verificação + commit.

**RELEASE Fase 1** (bump/CHANGELOG/PR/merge/deploy/tag).

---

## FASE 2 — Boleto consolidado

### Task 2.1: Adaptador Inter — campo de observações (mensagem)

**Files:**
- Modify: `src/lib/boleto/tipos.ts` (adicionar `observacoes?: string[]` em `DadosEmissao`)
- Modify: `src/lib/boleto/inter.ts` (montar `mensagem: { linha1..linha5 }` a partir de `observacoes`)
- Modify: `src/lib/boleto/emissao.ts` (repassar `observacoes` quando fornecido)
- Test: `src/tests/boleto/inter-mensagem.test.ts`

**Interfaces (Produces):** `DadosEmissao.observacoes?: string[]`; payload Inter passa a incluir
`mensagem` quando há observações.

- [ ] **Step 1: Teste (falhando)** — `montarPayload` com `observacoes: ["a","b"]` inclui
  `mensagem.linha1="a"`, `linha2="b"`; sem observações, sem `mensagem`; corta em 5 linhas e cada
  linha ≤ 78 chars (validar o limite documentado do Inter).
- [ ] **Step 2:** Ver falhar.
- [ ] **Step 3: Implementar** — no builder do payload do Inter, se `dados.observacoes?.length`,
  montar `mensagem` com `linha1..linha5` (slice 5, cada uma truncada a 78). `emissao.ts` só repassa.
- [ ] **Step 4:** Ver passar. Verificação (o adaptador Asaas ignora `observacoes` — sem quebra).
- [ ] **Step 5: Commit.**

### Task 2.2: Emissão do boleto de grupo

**Files:**
- Create: `src/app/(app)/financeiro/contas-a-receber/boleto-grupo.ts`
- Modify: `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts` (expor `emitirBoletoGrupo`)
- Test: `src/tests/boleto/boleto-grupo.test.ts` (montagem de dados: soma, pagador titular, observações)

**Interfaces (Consumes):** `adaptadorAtivo`, `proximo_numero_boleto`, `dadosEmissaoDeTitulo`,
`somarHonorariosGrupo`, `montarObservacoesGrupo`. **Produces:** `emitirBoletoGrupo(grupoId,
competencia)`.

- [ ] **Step 1:** Carregar o grupo, a titular (razão/CNPJ/endereço/dia_vencimento) e os títulos
  MENSALIDADE **em aberto** (`status in ('ABERTO','BAIXADO_PARCIAL')`) das empresas do grupo na
  competência (com valor e cliente).
- [ ] **Step 2:** `valor = soma`; `vencimento` = dia da titular na competência; `observacoes =
  montarObservacoesGrupo(...)`; `pagador` = titular. Emitir via `adaptadorAtivo().emitir(dados)`.
- [ ] **Step 3:** Inserir `boleto` com `titulo_id = null`, `grupo_cobranca_id`, `valor`,
  `vencimento`; inserir `boleto_titulo` (uma linha por título, com o valor de cada). Idempotência:
  não emitir se já há boleto do grupo na competência (checar `boleto` por `grupo_cobranca_id` +
  `vencimento`/competência). Falha de gravação pós-emissão → mesma mensagem defensiva do núcleo.
- [ ] **Step 4:** Testes de montagem (dados corretos) com adaptador fake. Commit.

### Task 2.3: Geração em lote desvia grupos

**Files:**
- Modify: `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts` (ou a rotina de lote)
- Modify: `src/components/financeiro/ContasReceber.tsx` (`gerarBoletosLote`)
- Modify: `src/app/(app)/financeiro/contas-a-receber/actions.ts` (`TituloView` ganha
  `grupoCobrancaId`/`ehTitular`)

- [ ] **Step 1:** `listarTitulos` inclui `clientes(grupo_cobranca_id)`; `TituloView.grupoCobrancaId`.
- [ ] **Step 2:** Em `gerarBoletosLote`: títulos de empresas **em grupo** não geram boleto
  individual. Agrupar por `grupoCobrancaId`; para cada grupo com títulos em aberto sem boleto na
  competência, chamar `emitirBoletoGrupo(grupoId, competencia)` uma vez. Empresas sem grupo seguem
  o fluxo individual atual.
- [ ] **Step 3:** UI: nas linhas de empresas em grupo, indicar "boleto no grupo (titular Y)" em vez
  do botão individual. Verificação. Commit.

**RELEASE Fase 2.**

---

## FASE 3 — Baixa e envio

### Task 3.1: Baixa múltipla ao pagar boleto de grupo

**Files:**
- Modify: `src/lib/boleto/baixar.ts` (`baixarBoletoPago`)
- Test: `src/tests/boleto/baixar-grupo.test.ts`

- [ ] **Step 1: Teste (falhando)** — boleto de grupo (com 3 linhas em `boleto_titulo`) pago gera 3
  baixas (uma por título, cada com seu valor); boleto individual continua gerando 1 baixa (regressão).
- [ ] **Step 2:** Ver falhar.
- [ ] **Step 3: Implementar** — em `baixarBoletoPago`: se `boleto.grupo_cobranca_id` (ou há linhas
  em `boleto_titulo`), buscar as linhas e inserir **uma baixa por título** (`titulo_id`, `valor`
  da linha, `data`, `conta`, `forma=BOLETO`); senão, comportamento atual (1 baixa em `titulo_id`).
  Marcar o boleto `pago`. Emitir `titulo.pago` por título. Idempotência mantida.
- [ ] **Step 4:** Ver passar. Ajustar `sincronizar.ts`/webhook para passar `grupo_cobranca_id` no
  objeto do boleto (o `select` já inclui, adicionar o campo). Commit.

### Task 3.2: Cancelamento/estorno do boleto de grupo

**Files:**
- Modify: `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts` (`cancelarTitulo`/estorno)
- Modify: `src/app/(app)/financeiro/contas-a-pagar/actions.ts` (se o estorno for compartilhado)

- [ ] **Step 1:** Estornar a baixa de um boleto de grupo estorna as N baixas (todas as do
  `boleto_titulo`), não só uma. Cancelar o boleto de grupo cancela no Inter e desfaz o vínculo
  (mantém os títulos em aberto). Cobrir com teste onde aplicável.
- [ ] **Step 2:** Verificação. Commit.

### Task 3.3: Envio consolidado para a titular

**Files:**
- Modify: `src/app/(app)/nfse/lote/envio.ts` (`listarNotasParaEnvio` / `enviarHonorarioLote`)
- Modify: `src/components/nfse/EnviarNotasWhatsapp.tsx` (rótulo do grupo)
- Test: `src/tests/nfse/envio-grupo.test.ts`

- [ ] **Step 1:** No envio de honorários, empresas em grupo são agregadas na **titular**: um item
  de envio por grupo, com o **boleto do grupo** + as **NFs de todas as empresas** do grupo
  (buscar as NFs autorizadas de cada membro na competência). Empresas não-titulares não geram item
  próprio.
- [ ] **Step 2:** O boleto anexado é o do grupo (via `boleto` por `grupo_cobranca_id`); o texto
  lista as empresas. Canal/contato = da titular.
- [ ] **Step 3:** Teste do agrupamento (titular recebe boleto do grupo + N NFs). Verificação. Commit.

**RELEASE Fase 3.**

---

## Self-review (checklist do autor)

- Cobertura do spec: grupo (1.1–1.5), NF individual (inalterada), boleto consolidado (2.x),
  observações (2.1/2.2), baixa múltipla (3.1), envio à titular (3.3). ✓
- Tipos consistentes: `MembroGrupo`, `DadosEmissao.observacoes`, `TituloView.grupoCobrancaId`,
  `boleto_titulo`. ✓
- Riscos do spec endereçados: limite de mensagem do Inter (2.1/2.2 truncam/resumem); vencimento =
  titular (2.2); estorno reverte N títulos (3.2). ✓
- Sem placeholders de lógica: SQL completo (1.1); helpers e payload com contrato explícito.
