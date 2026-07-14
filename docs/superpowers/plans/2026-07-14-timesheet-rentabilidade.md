# Timesheet (RF-043) e Rentabilidade por cliente (RF-044) — Plano de implementação

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.

**Objetivo:** apontar horas (manual e cronômetro) e responder, por cliente e período: quanto custou
atender, quanto ele pagou e qual a margem.

**Arquitetura:** custo/hora em **tabela própria admin-only com vigência** (RLS é por linha, não por
coluna — a coluna em `usuarios` vazaria dado salarial). Regras de cálculo em **libs puras testadas**; o
relatório roda server-side com `service_role` e gate de papel.

**Stack:** Postgres/RLS, Next 16 Server Actions, vitest.

## Restrições globais

- **Custo/hora nunca sai da tabela admin-only.** O relatório mostra custo **agregado por cliente**, nunca
  "quanto custa a hora do Fulano".
- **Custo vigente na DATA DO APONTAMENTO**, nunca o de hoje — senão um aumento reescreve a rentabilidade
  passada.
- **Cliente sem apontamento é sinalizado**, nunca exibido como custo zero silencioso.
- **Cronômetro:** uma sessão por pessoa (PK = `usuario_id`); ao parar acima de **8h**, pedir confirmação —
  nunca gravar 14h fantasma em silêncio.
- Divisão por zero: recebido 0 → margem % **nula**, nunca `Infinity`/`NaN`.
- Rodar `npm run lint && npm run typecheck && npm test && npm run build` antes de cada commit.

---

### Tarefa 1: Banco + RLS

**Arquivos:** Criar `supabase/migrations/0094_timesheet.sql`; modificar `supabase/tests/rls.test.sql`

- [ ] **Passo 1: Migration**

```sql
-- RF-043/044: timesheet e rentabilidade.
do $$ begin create type apontamento_origem as enum ('manual','cronometro');
exception when duplicate_object then null; end $$;

-- Custo/hora é dado SALARIAL: tabela própria, admin-only. A RLS é por LINHA, não por
-- coluna — pôr `custo_hora` em `usuarios` vazaria o dado para quem lê a tabela para
-- montar um select de responsáveis.
create table if not exists colaborador_custo (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  custo_hora numeric(12,2) not null check (custo_hora >= 0),
  vigencia_inicio date not null,
  vigencia_fim date,
  criado_em timestamptz not null default now(),
  check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);
create index if not exists ix_custo_usuario on colaborador_custo(usuario_id, vigencia_inicio desc);

create table if not exists apontamento (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade default auth.uid(),
  cliente_id uuid references clientes(id) on delete set null,
  tarefa_id uuid references tarefa(id) on delete set null,
  data date not null,
  minutos int not null check (minutos > 0 and minutos <= 1440),
  descricao text,
  origem apontamento_origem not null default 'manual',
  criado_em timestamptz not null default now()
);
create index if not exists ix_apont_cliente on apontamento(cliente_id, data);
create index if not exists ix_apont_usuario on apontamento(usuario_id, data);

-- Uma sessão de cronômetro por pessoa: a PK é o usuário. Dois cronômetros simultâneos
-- gerariam horas duplicadas.
create table if not exists apontamento_sessao (
  usuario_id uuid primary key references usuarios(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete set null,
  tarefa_id uuid references tarefa(id) on delete set null,
  iniciado_em timestamptz not null default now()
);

alter table colaborador_custo enable row level security;
alter table apontamento enable row level security;
alter table apontamento_sessao enable row level security;

do $$ begin
  -- custo: SÓ admin (nem o financeiro vê salário individual)
  drop policy if exists custo_admin on colaborador_custo;
  create policy custo_admin on colaborador_custo for all to authenticated
    using (auth_papel() = 'admin') with check (auth_papel() = 'admin');

  -- apontamento: cada um os seus; admin e financeiro veem/editam todos
  drop policy if exists apont_sel on apontamento;
  create policy apont_sel on apontamento for select to authenticated
    using (usuario_id = auth.uid() or auth_papel() in ('admin','financeiro'));
  drop policy if exists apont_ins on apontamento;
  create policy apont_ins on apontamento for insert to authenticated
    with check (usuario_id = auth.uid() or auth_papel() in ('admin','financeiro'));
  drop policy if exists apont_upd on apontamento;
  create policy apont_upd on apontamento for update to authenticated
    using (usuario_id = auth.uid() or auth_papel() in ('admin','financeiro'))
    with check (usuario_id = auth.uid() or auth_papel() in ('admin','financeiro'));
  drop policy if exists apont_del on apontamento;
  create policy apont_del on apontamento for delete to authenticated
    using (usuario_id = auth.uid() or auth_papel() in ('admin','financeiro'));

  -- sessão: só a própria
  drop policy if exists sessao_own on apontamento_sessao;
  create policy sessao_own on apontamento_sessao for all to authenticated
    using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
end $$;
```

**Gotcha conhecido:** o `default auth.uid()` **não impede** o cliente de enviar `usuario_id` explicitamente
(a lição da migration 0088). Aqui está coberto pela policy — o WITH CHECK exige `usuario_id = auth.uid()`
para quem não é admin/financeiro —, então **não precisa** de trigger. Confirmar isso no teste de RLS.

- [ ] **Passo 2:** `npm run db:migrate` → `0094` aplicada.

- [ ] **Passo 3: Asserts de RLS** (`supabase/tests/rls.test.sql`):
  - **contador não vê `colaborador_custo`** (0 linhas) e **não insere** (`insufficient_privilege`);
  - **financeiro não vê `colaborador_custo`** (0 linhas) — vê rentabilidade agregada, não salário;
  - contador (…003) **não vê** o apontamento do assistente (…002); **vê os seus**;
  - contador **não consegue apontar em nome de outro** (`usuario_id` forjado → `insufficient_privilege`);
  - **financeiro vê** os apontamentos de todos;
  - cliente do portal (…005) não vê nada das três tabelas.
  Rodar `npm run db:test`.

- [ ] **Passo 4: Commit**

```bash
git add supabase/migrations/0094_timesheet.sql supabase/tests/rls.test.sql
git commit -m "feat(timesheet): apontamento, sessao de cronometro e custo admin-only com vigencia"
```

---

### Tarefa 2: Regras puras + testes

**Arquivos:** Criar `src/lib/timesheet/apontamento.ts`, `src/lib/timesheet/rentabilidade.ts` e os testes
em `src/tests/timesheet/`.

**Interfaces produzidas:**

```ts
// apontamento.ts
export const LIMITE_SESSAO_MIN = 8 * 60;
export function duracaoSessao(inicioIso: string, agoraIso: string): { minutos: number; suspeita: boolean };
export function formatarHoras(minutos: number): string;   // 90 -> "1h30"
export function parseDuracao(txt: string): number | null;  // "1h30" | "90" | "1:30" -> 90

// rentabilidade.ts
export type Vigencia = { custoHora: number; inicio: string; fim: string | null };
export function custoHoraNaData(vigencias: Vigencia[], dataIso: string): number | null;
export function custoDoApontamento(minutos: number, custoHora: number | null): number;
export type LinhaRentab = {
  clienteId: string; clienteNome: string; minutos: number; custo: number;
  recebido: number; contratado: number; semApontamento: boolean; semCusto: boolean;
};
export function calcularLinha(...): LinhaRentab;
export function margem(l: LinhaRentab): { valor: number; pct: number | null; porHora: number | null };
export function mesesNoPeriodo(deIso: string, ateIso: string): number;
export function ordenarPorMargem(linhas: LinhaRentab[]): LinhaRentab[];  // pior primeiro
```

- [ ] **Passo 1: Testes primeiro**

```ts
import { describe, it, expect } from "vitest";
import { duracaoSessao, formatarHoras, parseDuracao, LIMITE_SESSAO_MIN } from "@/lib/timesheet/apontamento";
import {
  custoHoraNaData, custoDoApontamento, margem, mesesNoPeriodo, ordenarPorMargem, type LinhaRentab,
} from "@/lib/timesheet/rentabilidade";

describe("cronômetro", () => {
  it("conta os minutos da sessão", () => {
    expect(duracaoSessao("2026-07-14T09:00:00Z", "2026-07-14T10:30:00Z").minutos).toBe(90);
  });

  it("marca como suspeita a sessão acima de 8h (cronômetro esquecido)", () => {
    const r = duracaoSessao("2026-07-14T09:00:00Z", "2026-07-15T00:00:00Z");
    expect(r.minutos).toBeGreaterThan(LIMITE_SESSAO_MIN);
    expect(r.suspeita).toBe(true);
  });

  it("não marca como suspeita a sessão normal", () => {
    expect(duracaoSessao("2026-07-14T09:00:00Z", "2026-07-14T12:00:00Z").suspeita).toBe(false);
  });
});

describe("duração", () => {
  it("formata e faz parse nos formatos que a pessoa digita", () => {
    expect(formatarHoras(90)).toBe("1h30");
    expect(formatarHoras(60)).toBe("1h00");
    expect(parseDuracao("1h30")).toBe(90);
    expect(parseDuracao("1:30")).toBe(90);
    expect(parseDuracao("90")).toBe(90);
    expect(parseDuracao("abc")).toBeNull();
  });
});

describe("custo por vigência", () => {
  const vigencias = [
    { custoHora: 50, inicio: "2026-01-01", fim: "2026-05-31" },
    { custoHora: 70, inicio: "2026-06-01", fim: null },
  ];

  it("usa o custo VIGENTE NA DATA DO APONTAMENTO, não o de hoje", () => {
    expect(custoHoraNaData(vigencias, "2026-03-10")).toBe(50);
    expect(custoHoraNaData(vigencias, "2026-07-10")).toBe(70);
  });

  it("sem vigência na data, devolve null (e o chamador sinaliza — não silencia)", () => {
    expect(custoHoraNaData(vigencias, "2025-12-31")).toBeNull();
  });

  it("custo do apontamento é proporcional aos minutos", () => {
    expect(custoDoApontamento(90, 60)).toBe(90);   // 1,5h × 60
    expect(custoDoApontamento(90, null)).toBe(0);  // sem custo cadastrado
  });
});

describe("margem", () => {
  const linha = (over: Partial<LinhaRentab>): LinhaRentab => ({
    clienteId: "c", clienteNome: "Cliente", minutos: 600, custo: 500,
    recebido: 1000, contratado: 1000, semApontamento: false, semCusto: false, ...over,
  });

  it("calcula margem em R$, % e receita por hora", () => {
    const m = margem(linha({}));
    expect(m.valor).toBe(500);
    expect(m.pct).toBe(50);
    expect(m.porHora).toBe(100);  // 1000 / 10h
  });

  it("recebido zero não vira Infinity nem NaN", () => {
    const m = margem(linha({ recebido: 0 }));
    expect(m.valor).toBe(-500);
    expect(m.pct).toBeNull();
  });

  it("sem horas apontadas, receita por hora é nula (não divide por zero)", () => {
    expect(margem(linha({ minutos: 0, custo: 0 })).porHora).toBeNull();
  });

  it("ordena pior margem primeiro — o relatório existe para achar cliente ruim", () => {
    const bom = linha({ clienteId: "bom", recebido: 2000, custo: 100 });
    const ruim = linha({ clienteId: "ruim", recebido: 300, custo: 900 });
    expect(ordenarPorMargem([bom, ruim]).map((l) => l.clienteId)).toEqual(["ruim", "bom"]);
  });
});

describe("mesesNoPeriodo", () => {
  it("conta os meses do período para o honorário contratado", () => {
    expect(mesesNoPeriodo("2026-01-01", "2026-03-31")).toBe(3);
    expect(mesesNoPeriodo("2026-01-01", "2026-01-31")).toBe(1);
  });
});
```

- [ ] **Passo 2:** `npm test -- timesheet` → FAIL.
- [ ] **Passo 3: Implementar.** Datas em **UTC** (`Date.UTC`), como no resto do projeto. `pct` e `porHora`
  são `number | null` — nunca `Infinity`.
- [ ] **Passo 4:** `npm test -- timesheet` → PASS.
- [ ] **Passo 5: Commit**

```bash
git add src/lib/timesheet src/tests/timesheet
git commit -m "feat(timesheet): regras puras de duracao, custo por vigencia e margem"
```

---

### Tarefa 3: Actions do timesheet

**Arquivos:** Criar `src/app/(app)/timesheet/actions.ts`

Gate: toda a equipe aponta (`podeGerenciarTarefas`); ver o de outros = admin/financeiro
(`podeGerenciarFinanceiro`).

- [ ] **Passo 1:**
  - `listarApontamentos({de, ate, usuarioId?, clienteId?})` — a **RLS já escopa**; o filtro por usuário só
    faz efeito para admin/financeiro.
  - `salvarApontamento({id?, data, minutos, clienteId, tarefaId, descricao})` — se vier `tarefaId` e não
    `clienteId`, **herda o cliente da tarefa** (uma query). Valida `minutos` em 1..1440.
  - `excluirApontamento(id)`.
  - `iniciarCronometro({tarefaId?, clienteId?})` — **upsert** em `apontamento_sessao` (PK = usuário): se já
    houver sessão, devolver erro com o início dela (não sobrescrever silenciosamente — perderia o tempo já
    corrido).
  - `sessaoAtual()` → `{ iniciadoEm, tarefaId, clienteId, minutos, suspeita } | null`.
  - `pararCronometro({minutos?})` — calcula com `duracaoSessao()`; **se `suspeita` e `minutos` não vier,
    NÃO grava**: devolve `{ confirmar: { minutos } }` para a tela pedir a confirmação. Com `minutos`
    informado, grava o apontamento (`origem: 'cronometro'`) e apaga a sessão.

- [ ] **Passo 2: Verificar e commitar**

```bash
npm run lint && npm run typecheck && npm test
git add "src/app/(app)/timesheet"
git commit -m "feat(timesheet): actions de apontamento e cronometro com trava de sessao longa"
```

---

### Tarefa 4: Telas do timesheet

**Arquivos:**
- Criar: `src/app/(app)/timesheet/page.tsx`, `PainelTimesheet.tsx`
- Criar: `src/components/timesheet/Cronometro.tsx` (reusável: painel e ficha da tarefa)
- Modificar: `src/app/(app)/tarefas/[id]/page.tsx` (cronômetro + total de horas da tarefa)
- Modificar: `src/components/Sidebar.tsx` (item "Timesheet")

- [ ] **Passo 1: `/timesheet`** — cronômetro no topo (com o tempo corrido e o botão parar), formulário de
  apontamento manual (data, duração aceitando "1h30"/"90"/"1:30", cliente, tarefa, descrição), lista da
  semana com **total** e, para admin/financeiro, o filtro por colaborador.
- [ ] **Passo 2:** Ao parar uma sessão **suspeita** (>8h), abrir a confirmação com o valor **editável** —
  nunca gravar direto.
- [ ] **Passo 3:** Na ficha da tarefa, botão de cronômetro e "X h apontadas nesta tarefa".
- [ ] **Passo 4: Verificar e commitar**

```bash
npm run lint && npm run typecheck && npm test && npm run build
git add -A && git commit -m "feat(timesheet): painel, cronometro e apontamento na ficha da tarefa"
```

---

### Tarefa 5: Rentabilidade (RF-044)

**Arquivos:**
- Criar: `src/app/(app)/financeiro/rentabilidade/page.tsx`, `actions.ts`, `TabelaRentabilidade.tsx`
- Criar: `src/app/(app)/configuracoes/custos/page.tsx`, `FormCustos.tsx`, `actions.ts` (admin)
- Modificar: `src/app/(app)/configuracoes/page.tsx` (item "Custo por colaborador")

- [ ] **Passo 1: Custos (admin)** — CRUD de `colaborador_custo` por pessoa, com vigência. Ao gravar uma nova
  vigência, **fechar a anterior** (`vigencia_fim = novo inicio - 1 dia`) para não haver duas vigentes ao
  mesmo tempo.

- [ ] **Passo 2: `relatorioRentabilidade({de, ate})`** — gate **admin/financeiro**, roda com
  `createAdminSupabase()` (precisa cruzar o custo, que é admin-only):
  1. apontamentos do período **com cliente** → agrupar por cliente e por usuário;
  2. vigências de custo de cada usuário → `custoHoraNaData(vigencias, apontamento.data)` — **a data do
     apontamento**;
  3. **recebido:** `baixa` (não estornadas) de títulos `RECEBER` do cliente, por `data_recebimento` no
     período;
  4. **contratado:** `clientes_financeiro.honorario_mensal × mesesNoPeriodo(de, ate)`;
  5. clientes **sem apontamento** entram com `semApontamento: true`; apontamento de quem **não tem custo
     cadastrado** marca `semCusto: true` — a tela avisa nos dois casos;
  6. `ordenarPorMargem()`.

- [ ] **Passo 3: Tela** — tabela com Cliente, Horas, Custo, Recebido, Contratado, Margem R$, Margem %,
  R$/hora; filtro de período (mês corrente por padrão); **totais no rodapé**; avisos de "sem apontamento" e
  "sem custo cadastrado". Linha com margem negativa em vermelho.

- [ ] **Passo 4: Verificar e commitar**

```bash
npm run lint && npm run typecheck && npm test && npm run build
git add -A && git commit -m "feat(rentabilidade): relatorio por cliente com custo, recebido e contratado"
```

---

### Tarefa 6: Documentação, entrega e tag

- [ ] **Passo 1:** `docs/DOCUMENTACAO.md` (seção Timesheet e Rentabilidade — destacando **privacidade do
  custo/hora**, **vigência**, **trava do cronômetro** e o **aviso de cliente sem apontamento**) +
  `CHANGELOG.md`.
- [ ] **Passo 2:** Commit, merge `develop` → `main`, push.
- [ ] **Passo 3: Pedir ao usuário, explicitamente:** implantar e validar — cadastrar o custo/hora de um
  colaborador, apontar hora manual e por cronômetro (inclusive testar a **trava das 8h**), e conferir o
  relatório de rentabilidade **fazendo a conta à mão** para um cliente conhecido. Conferir também que o
  **financeiro não enxerga** a tela de custo por colaborador.
- [ ] **Passo 4:** Após o "validei, deu certo": tag `v5.28.0`.
