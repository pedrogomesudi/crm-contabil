# Tarefas — Fatia B (recorrência, calendário, SOPs) — Plano de implementação

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.

**Objetivo:** tarefas que se repetem sozinhas (RF-040), uma vista de calendário (RF-042) e templates de
processo/SOP que geram tarefas em ondas sequenciais (RF-041).

**Arquitetura:** a SOP **gera tarefas** (não um processo paralelo — evita a terceira cópia do padrão
onboarding/legalização). O avanço de onda vive num **trigger no banco**, não nas actions. A recorrência é
gerada por **cron diário**, com idempotência por `(recorrencia_id, competencia)`.

**Stack:** Postgres/RLS, pg_cron + pg_net, Next 16, vitest.

## Restrições globais

- **Idempotência é do banco, não do código:** índices únicos, sempre. Um cron reexecutado não pode
  duplicar tarefa.
- Trigger de avanço de onda: `security definer`, `set search_path = public`.
- Responsável por papel **pode ficar vazio** — nunca chutar alguém.
- Migrations idempotentes e imutáveis depois de aplicadas.
- Novo job pg_cron **entra em `scripts/bootstrap-cron.mjs`** (fonte única; jobs criados à mão não
  sobrevivem a um restore).
- Rodar `npm run lint && npm run typecheck && npm test && npm run build` antes de cada commit.

---

### Tarefa 1: Recorrência — banco

**Arquivos:** Criar `supabase/migrations/0091_tarefas_recorrencia.sql`

- [ ] **Passo 1: Escrever**

```sql
-- RF-040 (fatia B): tarefas recorrentes. O cron diário gera as ocorrências.
do $$ begin create type tarefa_periodicidade as enum ('semanal','mensal','trimestral','anual');
exception when duplicate_object then null; end $$;

create table if not exists tarefa_recorrencia (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  responsavel_id uuid references usuarios(id),
  cliente_id uuid references clientes(id) on delete cascade,
  departamento departamento,
  prioridade tarefa_prioridade not null default 'media',
  periodicidade tarefa_periodicidade not null,
  dia_semana int check (dia_semana between 0 and 6),
  dia_mes int check (dia_mes between 1 and 31),
  mes int check (mes between 1 and 12),
  antecedencia_dias int not null default 3 check (antecedencia_dias between 0 and 60),
  proxima_data date not null,
  ativa boolean not null default true,
  criado_por uuid references usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists tarefa_recorrencia_item (
  id uuid primary key default gen_random_uuid(),
  recorrencia_id uuid not null references tarefa_recorrencia(id) on delete cascade,
  descricao text not null,
  ordem int not null default 0
);

alter table tarefa add column if not exists recorrencia_id uuid references tarefa_recorrencia(id) on delete set null;
alter table tarefa add column if not exists competencia date;
-- Idempotência: o cron pode rodar duas vezes; a mesma ocorrência não nasce duas vezes.
create unique index if not exists uq_tarefa_recorrencia_competencia
  on tarefa(recorrencia_id, competencia) where recorrencia_id is not null;

alter table tarefa_recorrencia enable row level security;
alter table tarefa_recorrencia_item enable row level security;

do $$ begin
  drop policy if exists tarefa_rec_sel on tarefa_recorrencia;
  create policy tarefa_rec_sel on tarefa_recorrencia for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists tarefa_rec_write on tarefa_recorrencia;
  create policy tarefa_rec_write on tarefa_recorrencia for all to authenticated
    using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));

  drop policy if exists tarefa_rec_item_sel on tarefa_recorrencia_item;
  create policy tarefa_rec_item_sel on tarefa_recorrencia_item for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists tarefa_rec_item_write on tarefa_recorrencia_item;
  create policy tarefa_rec_item_write on tarefa_recorrencia_item for all to authenticated
    using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));
end $$;
```

- [ ] **Passo 2:** `npm run db:migrate` → `0091` aplicada.
- [ ] **Passo 3: Commit**

```bash
git add supabase/migrations/0091_tarefas_recorrencia.sql
git commit -m "feat(tarefas): tabelas de recorrencia com idempotencia por competencia"
```

---

### Tarefa 2: Recorrência — regra pura + testes

**Arquivos:**
- Criar: `src/lib/tarefas/recorrencia.ts`, `src/tests/tarefas/recorrencia.test.ts`

**Interfaces produzidas:**

```ts
export type Periodicidade = "semanal" | "mensal" | "trimestral" | "anual";
export const PERIODICIDADES: { valor: Periodicidade; rotulo: string }[];
export type RegraRecorrencia = { periodicidade: Periodicidade; diaSemana?: number | null; diaMes?: number | null; mes?: number | null };
export function proximaData(atualIso: string, r: RegraRecorrencia): string;   // ISO yyyy-mm-dd
export function deveGerar(proximaIso: string, antecedenciaDias: number, hojeIso: string): boolean;
export function rotuloRegra(r: RegraRecorrencia): string;                     // "Todo dia 5" etc.
```

- [ ] **Passo 1: Testes primeiro**

```ts
import { describe, it, expect } from "vitest";
import { proximaData, deveGerar } from "@/lib/tarefas/recorrencia";

describe("proximaData", () => {
  it("mensal: avança um mês mantendo o dia", () => {
    expect(proximaData("2026-01-05", { periodicidade: "mensal", diaMes: 5 })).toBe("2026-02-05");
  });

  it("mensal dia 31: em fevereiro cai no último dia (não pula o mês)", () => {
    expect(proximaData("2026-01-31", { periodicidade: "mensal", diaMes: 31 })).toBe("2026-02-28");
  });

  it("mensal: volta ao dia 31 no mês seguinte que o tem", () => {
    expect(proximaData("2026-02-28", { periodicidade: "mensal", diaMes: 31 })).toBe("2026-03-31");
  });

  it("mensal: vira o ano", () => {
    expect(proximaData("2026-12-10", { periodicidade: "mensal", diaMes: 10 })).toBe("2027-01-10");
  });

  it("semanal: soma 7 dias", () => {
    expect(proximaData("2026-07-14", { periodicidade: "semanal", diaSemana: 2 })).toBe("2026-07-21");
  });

  it("trimestral: soma 3 meses", () => {
    expect(proximaData("2026-01-10", { periodicidade: "trimestral", diaMes: 10 })).toBe("2026-04-10");
  });

  it("anual: soma 1 ano", () => {
    expect(proximaData("2026-03-31", { periodicidade: "anual", diaMes: 31, mes: 3 })).toBe("2027-03-31");
  });
});

describe("deveGerar", () => {
  it("gera quando entra na janela de antecedência", () => {
    expect(deveGerar("2026-07-20", 3, "2026-07-17")).toBe(true);
    expect(deveGerar("2026-07-20", 3, "2026-07-16")).toBe(false);
  });

  it("gera o que já está atrasado (o cron pode ter falhado ontem)", () => {
    expect(deveGerar("2026-07-10", 3, "2026-07-17")).toBe(true);
  });
});
```

- [ ] **Passo 2:** `npm test -- recorrencia` → FAIL.

- [ ] **Passo 3: Implementar** — usar aritmética de data em UTC puro (`Date.UTC`), **nunca** `new Date(iso)`
  local, que em `America/Sao_Paulo` cai no dia anterior. Para mensal/trimestral/anual: montar o mês-alvo e
  **clampar** o dia ao último dia do mês (`Math.min(diaMes, ultimoDiaDoMes)`).

- [ ] **Passo 4:** `npm test -- recorrencia` → PASS.
- [ ] **Passo 5: Commit**

```bash
git add src/lib/tarefas/recorrencia.ts src/tests/tarefas/recorrencia.test.ts
git commit -m "feat(tarefas): regra pura de recorrencia (clamp de dia 31, antecedencia)"
```

---

### Tarefa 3: Recorrência — motor, cron e tela

**Arquivos:**
- Criar: `src/lib/tarefas/recorrencia-motor.ts`, `src/app/api/cron/tarefas-recorrentes/route.ts`
- Criar: `src/app/(app)/tarefas/recorrencias/page.tsx`, `FormRecorrencia.tsx`, `actions.ts`
- Modificar: `scripts/bootstrap-cron.mjs`

**Interfaces consumidas:** `proximaData`, `deveGerar` (T2).

- [ ] **Passo 1: Motor** (`processarRecorrencias(hoje): Promise<ResumoRecorrencia>`, com
  `createAdminSupabase()`):
  1. lê as recorrências **ativas**;
  2. para cada uma, **enquanto** `deveGerar(proxima_data, antecedencia_dias, hoje)`:
     - insere a `tarefa` (`recorrencia_id`, `competencia = proxima_data`, `prazo = proxima_data`, título,
       descrição, responsável, cliente, departamento, prioridade);
     - se o INSERT falhar no índice único → **já existia**: conta como pulado e **segue** (não aborta);
     - copia o checklist-modelo para `tarefa_item`;
     - `proxima_data = proximaData(proxima_data, regra)` e grava.
     - **Trava de laço:** no máximo 24 ocorrências por recorrência numa execução (uma recorrência semanal
       parada há um ano geraria 52 tarefas de uma vez — o teto evita a enxurrada e sinaliza no resumo).
  3. devolve `{ recorrencias, criadas, puladas, erros }`.

- [ ] **Passo 2: Rota do cron** — copiar o padrão de `src/app/api/cron/regua-cobranca/route.ts`
  (Bearer `CRON_SECRET` comparado com `timingSafeEqual`), chamando `processarRecorrencias(hoje)` com
  `hoje` no fuso de São Paulo.

- [ ] **Passo 3: Registrar o job** em `scripts/bootstrap-cron.mjs`, no array `JOBS`:

```js
  {
    nome: "tarefas-recorrentes-diaria",
    agenda: "0 9 * * *",
    comando: httpPost("tarefas-recorrentes", true),
    nota: "gera as ocorrências das tarefas recorrentes (RF-040)",
  },
```

- [ ] **Passo 4: Tela** `/tarefas/recorrencias` (admin/assistente — `podeGerenciarModeloOnboarding` NÃO
  serve; usar a nova `podeGerenciarRecorrencias(papel)` = admin/assistente): lista das recorrências com
  `rotuloRegra()`, próxima data e um botão **"Gerar agora"** (chama o motor manualmente, como o
  "Processar agora" da régua — sem isso, só dá para testar esperando o cron). Formulário com título,
  descrição, cliente, departamento, responsável, prioridade, periodicidade + dia, antecedência e o
  checklist-modelo.

- [ ] **Passo 5: Verificar e commitar**

```bash
npm run lint && npm run typecheck && npm test && npm run build
git add -A && git commit -m "feat(tarefas): motor de recorrencia, cron diario e tela de recorrencias"
```

---

### Tarefa 4: Calendário

**Arquivos:**
- Criar: `src/lib/tarefas/calendario.ts`, `src/tests/tarefas/calendario.test.ts`
- Criar: `src/app/(app)/tarefas/Calendario.tsx`
- Modificar: `src/app/(app)/tarefas/PainelTarefas.tsx` (terceira vista), `page.tsx` (mês na query)

**Interfaces produzidas:**

```ts
export type Celula = { data: string; doMes: boolean };
export function gradeDoMes(ano: number, mes: number): Celula[];  // sempre múltiplo de 7, dom→sáb
export function mesAnterior(ano: number, mes: number): { ano: number; mes: number };
export function mesSeguinte(ano: number, mes: number): { ano: number; mes: number };
```

- [ ] **Passo 1: Testes** — a grade de julho/2026 começa numa quarta e a primeira célula é o domingo
  anterior (2026-06-28); a grade tem tamanho múltiplo de 7; fevereiro de ano bissexto (2028) tem 29 dias;
  virada de ano em `mesSeguinte(2026, 12)` → `{ano: 2027, mes: 1}`.

- [ ] **Passo 2:** `npm test -- calendario` → FAIL. Implementar com `Date.UTC` (nunca data local).

- [ ] **Passo 3: `Calendario.tsx`** — recebe as `TarefaView[]` já filtradas (sem nova query) e agrupa por
  `prazo`. Vencidas (prazo < hoje e não concluídas) em vermelho; hoje destacado; cada dia lista até 3
  tarefas + "mais N". **Faixa "Sem prazo"** abaixo da grade: tarefa sem prazo não pode sumir da vista.

- [ ] **Passo 4:** `PainelTarefas.tsx` — botão "Calendário" ao lado de Lista/Kanban (`?vista=calendario`),
  com navegação de mês (`?ano=&mes=`) preservando os filtros.

- [ ] **Passo 5: Verificar e commitar**

```bash
npm run lint && npm run typecheck && npm test && npm run build
git add -A && git commit -m "feat(tarefas): vista de calendario mensal com faixa de sem prazo"
```

---

### Tarefa 5: SOPs — banco e trigger de onda

**Arquivos:** Criar `supabase/migrations/0092_sop.sql`

- [ ] **Passo 1: Tabelas**

```sql
-- RF-041: templates de processo (SOPs). As etapas viram TAREFAS — sem processo paralelo.
do $$ begin create type sop_processo_status as enum ('em_andamento','concluido','cancelado');
exception when duplicate_object then null; end $$;

create table if not exists sop_template (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  descricao text,
  departamento departamento,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists sop_etapa (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references sop_template(id) on delete cascade,
  onda int not null default 1 check (onda >= 1),   -- mesma onda = paralelas; ondas = sequência
  ordem int not null default 0,
  titulo text not null,
  descricao text,
  responsavel_papel papel,
  prazo_dias int not null default 0,               -- relativo à data_inicio do processo
  prioridade tarefa_prioridade not null default 'media'
);

create table if not exists sop_etapa_item (
  id uuid primary key default gen_random_uuid(),
  etapa_id uuid not null references sop_etapa(id) on delete cascade,
  descricao text not null,
  ordem int not null default 0
);

create table if not exists sop_processo (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references sop_template(id),
  cliente_id uuid references clientes(id) on delete cascade,   -- null = processo interno
  data_inicio date not null,
  onda_atual int not null default 1,
  status sop_processo_status not null default 'em_andamento',
  criado_por uuid references usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now()
);

alter table tarefa add column if not exists sop_processo_id uuid references sop_processo(id) on delete cascade;
alter table tarefa add column if not exists sop_etapa_id uuid references sop_etapa(id) on delete set null;
alter table tarefa add column if not exists sop_onda int;
create unique index if not exists uq_tarefa_sop_etapa
  on tarefa(sop_processo_id, sop_etapa_id) where sop_processo_id is not null;
```

- [ ] **Passo 2: Geração de uma onda (função)** — `security definer`, usada pelo app (onda 1) e pelo
  trigger (ondas seguintes):

```sql
create or replace function sop_gerar_onda(p_processo uuid, p_onda int)
returns int language plpgsql security definer set search_path = public as $$
declare v_proc sop_processo; n int := 0;
begin
  select * into v_proc from sop_processo where id = p_processo;
  if not found then return 0; end if;

  for n in
    select 1 from sop_etapa where template_id = v_proc.template_id and onda = p_onda limit 1
  loop end loop;

  insert into tarefa (titulo, descricao, responsavel_id, cliente_id, departamento, prioridade, prazo,
                      sop_processo_id, sop_etapa_id, sop_onda)
  select e.titulo, e.descricao,
         -- Responsável por papel: (1) responsável do departamento no cliente;
         -- (2) contador do cliente, se o papel for 'contador'; (3) ninguém.
         coalesce(
           (select cr.usuario_id from cliente_responsavel cr
             where cr.cliente_id = v_proc.cliente_id and cr.departamento = t.departamento),
           (select c.contador_id from clientes c
             where c.id = v_proc.cliente_id and e.responsavel_papel = 'contador')
         ),
         v_proc.cliente_id, t.departamento, e.prioridade,
         v_proc.data_inicio + e.prazo_dias,
         v_proc.id, e.id, e.onda
    from sop_etapa e join sop_template t on t.id = e.template_id
   where e.template_id = v_proc.template_id and e.onda = p_onda
     -- idempotência: não recria a etapa que já virou tarefa
     and not exists (select 1 from tarefa x where x.sop_processo_id = v_proc.id and x.sop_etapa_id = e.id);
  get diagnostics n = row_count;

  -- checklist da etapa vira checklist da tarefa
  insert into tarefa_item (tarefa_id, descricao, ordem)
  select tf.id, i.descricao, i.ordem
    from tarefa tf join sop_etapa_item i on i.etapa_id = tf.sop_etapa_id
   where tf.sop_processo_id = v_proc.id and tf.sop_onda = p_onda
     and not exists (select 1 from tarefa_item ti where ti.tarefa_id = tf.id and ti.descricao = i.descricao);

  update sop_processo set onda_atual = p_onda where id = p_processo;
  return n;
end $$;
```

- [ ] **Passo 3: Trigger de avanço** — no banco, **não** nas actions: hoje uma tarefa é concluída pelo
  painel, pelo kanban e pela ficha; se o avanço morasse na action, o caminho esquecido travaria o processo
  em silêncio.

```sql
create or replace function sop_avancar_onda() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pendentes int; v_proxima int;
begin
  if new.sop_processo_id is null then return new; end if;
  if new.status not in ('concluida','cancelada') then return new; end if;

  select count(*) into v_pendentes from tarefa
   where sop_processo_id = new.sop_processo_id and sop_onda = new.sop_onda
     and status not in ('concluida','cancelada');
  if v_pendentes > 0 then return new; end if;   -- a onda ainda não fechou

  select min(e.onda) into v_proxima
    from sop_etapa e join sop_processo p on p.template_id = e.template_id
   where p.id = new.sop_processo_id and e.onda > new.sop_onda;

  if v_proxima is null then
    update sop_processo set status = 'concluido' where id = new.sop_processo_id;
  else
    perform sop_gerar_onda(new.sop_processo_id, v_proxima);
  end if;
  return new;
end $$;

drop trigger if exists trg_sop_avancar on tarefa;
create trigger trg_sop_avancar after update of status on tarefa
  for each row execute function sop_avancar_onda();
```

- [ ] **Passo 4: RLS**

```sql
alter table sop_template enable row level security;
alter table sop_etapa enable row level security;
alter table sop_etapa_item enable row level security;
alter table sop_processo enable row level security;

do $$ begin
  drop policy if exists sop_tpl_sel on sop_template;
  create policy sop_tpl_sel on sop_template for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists sop_tpl_write on sop_template;
  create policy sop_tpl_write on sop_template for all to authenticated
    using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));
  -- idem para sop_etapa e sop_etapa_item (leitura equipe; escrita admin/assistente)

  drop policy if exists sop_proc_sel on sop_processo;
  create policy sop_proc_sel on sop_processo for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists sop_proc_ins on sop_processo;
  create policy sop_proc_ins on sop_processo for insert to authenticated
    with check (auth_papel() in ('admin','assistente','contador'));
  drop policy if exists sop_proc_upd on sop_processo;
  create policy sop_proc_upd on sop_processo for update to authenticated
    using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));
end $$;
```

- [ ] **Passo 5:** `npm run db:migrate` → `0092` aplicada.
- [ ] **Passo 6: Asserts de RLS** em `supabase/tests/rls.test.sql`:
  financeiro **não** cria `sop_template` nem `tarefa_recorrencia` (`insufficient_privilege`); contador
  **não** edita template; cliente do portal (…005) **não vê** nada (0 linhas nas quatro tabelas + na
  recorrência). Rodar `npm run db:test`.
- [ ] **Passo 7: Commit**

```bash
git add supabase/migrations/0092_sop.sql supabase/tests/rls.test.sql
git commit -m "feat(sop): templates de processo que geram tarefas, com avanco de onda por trigger"
```

---

### Tarefa 6: SOPs — telas

**Arquivos:**
- Criar: `src/lib/tarefas/sop.ts` + `src/tests/tarefas/sop.test.ts` (`ondasDoTemplate()`, `progressoProcesso()`)
- Criar: `src/app/(app)/configuracoes/sop/page.tsx`, `FormSop.tsx`, `actions.ts`
- Criar: `src/components/tarefas/ProcessosSop.tsx` (iniciar + acompanhar)
- Modificar: `src/app/(app)/clientes/[id]/page.tsx` (seção), `src/app/(app)/tarefas/page.tsx` (processos internos), `src/app/(app)/configuracoes/page.tsx` (item de menu)

- [ ] **Passo 1: Lib pura + testes** — `ondasDoTemplate(etapas)` agrupa por onda (ordenadas) e
  `progressoProcesso(tarefas)` devolve `{feitas, total, pct}`.
- [ ] **Passo 2: Configurações → SOPs** — CRUD do template e das etapas (onda, título, descrição, papel,
  prazo em dias, prioridade, checklist), com prévia do fluxo: "Onda 1 (2 etapas em paralelo) → Onda 2 (1)".
- [ ] **Passo 3: Iniciar processo** — action `iniciarProcessoSop({templateId, clienteId?, dataInicio})`:
  insere `sop_processo` (RLS: admin/assistente/contador) e chama `sop_gerar_onda(processo, 1)` via RPC.
- [ ] **Passo 4: Acompanhamento** — seção "Processos" na ficha do cliente e no painel de tarefas: template,
  onda atual, progresso e link para as tarefas do processo (`/tarefas?processo=<id>`).
- [ ] **Passo 5: Verificar e commitar**

```bash
npm run lint && npm run typecheck && npm test && npm run build
git add -A && git commit -m "feat(sop): telas de template, inicio e acompanhamento de processos"
```

---

### Tarefa 7: Documentação, entrega e tag

- [ ] **Passo 1:** `docs/DOCUMENTACAO.md` (seção de Tarefas: recorrência, calendário, SOPs) e
  `CHANGELOG.md`. Em `docs/DEPLOY.md`, registrar o **novo job** `tarefas-recorrentes-diaria` na lista de
  jobs pg_cron (Seção 4.1), incluindo o aviso de rodar `npm run cron:bootstrap` após um restore.
- [ ] **Passo 2:** Commit, merge `develop` → `main`, push.
- [ ] **Passo 3: Pedir ao usuário, explicitamente:**
  1. implantar;
  2. rodar `CRON_SECRET=<segredo> APP_URL=https://app.seusaldo.ai npm run cron:bootstrap` — **sem isso a
     recorrência não roda sozinha** (o job novo não existe no banco);
  3. validar: criar uma recorrência mensal e clicar em **"Gerar agora"** (a tarefa nasce; clicar de novo
     **não** duplica); abrir o **calendário**; criar uma SOP de 2 ondas, iniciar num cliente, concluir as
     tarefas da onda 1 e ver a **onda 2 nascer sozinha**.
- [ ] **Passo 4:** Após o "validei, deu certo": tag `v5.26.0`.
