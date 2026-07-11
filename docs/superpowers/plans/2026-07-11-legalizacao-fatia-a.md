# Legalização — Fatia A — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar tarefa a tarefa. Passos usam checkbox (`- [ ]`).

**Goal:** Acompanhar processos societários/legalização por órgão, com protocolo, prazos e status, a partir de 7 modelos semeados, iniciados na ficha do cliente e visíveis num painel global.

**Architecture:** Módulo dedicado (`legalizacao_*`) no padrão `template → etapas → instância`. Reaproveita `somarDias` e `classificarAlerta` do onboarding, a RLS por dono do cliente (`exists (select 1 from clientes …)`) e o upload em bucket privado `documentos`. Não toca no onboarding.

**Tech Stack:** Next.js 16 (App Router, server components/actions), TypeScript, Supabase (Postgres/RLS/Storage), Vitest.

## Global Constraints

- Next 16: `proxy.ts`; `next/image`; alias `@/*`.
- RBAC via `auth_papel()`; papel nunca do JWT.
- Migrations idempotentes e imutáveis; aplicar com `npm run db:migrate`.
- Segredos server-only; upload via `createAdminSupabase` (service_role).
- Onboarding em produção **não** é alterado.
- Antes de cada commit: `npm run lint && npm run typecheck && npm test` (+ `npm run db:test` ao mexer em RLS).

---

### Task 1: Migration — enums, tabelas, RLS, trigger e seed dos 7 modelos

**Files:**
- Create: `supabase/migrations/0079_legalizacao.sql`

**Interfaces:**
- Produces: enums `legalizacao_tipo`, `legalizacao_orgao`, `legalizacao_proc_status`, `legalizacao_etapa_status`; tabelas `legalizacao_template`, `legalizacao_template_etapa`, `legalizacao_processo`, `legalizacao_etapa`.

- [ ] **Step 1: Escrever a migration (schema + RLS + trigger)**

Arquivo `supabase/migrations/0079_legalizacao.sql`:

```sql
-- RF-011..014 (Fatia A): módulo dedicado de legalização/societário.
do $$ begin create type legalizacao_tipo as enum
  ('abertura_simples','abertura_presumido','alteracao_quadro','transformacao','baixa','transferencia_entrada','transferencia_saida');
exception when duplicate_object then null; end $$;
do $$ begin create type legalizacao_orgao as enum
  ('junta','receita','prefeitura','sefaz','bombeiros','vigilancia','outro');
exception when duplicate_object then null; end $$;
do $$ begin create type legalizacao_proc_status as enum ('em_andamento','concluido','cancelado');
exception when duplicate_object then null; end $$;
do $$ begin create type legalizacao_etapa_status as enum ('pendente','em_andamento','concluido');
exception when duplicate_object then null; end $$;

create table if not exists legalizacao_template (
  id uuid primary key default gen_random_uuid(),
  tipo legalizacao_tipo not null,
  slug text not null unique,
  nome text not null,
  descricao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create table if not exists legalizacao_template_etapa (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references legalizacao_template(id) on delete cascade,
  ordem int not null,
  titulo text not null,
  descricao text,
  orgao legalizacao_orgao not null default 'outro',
  prazo_dias int,
  responsavel_papel papel,
  anexo_obrigatorio boolean not null default false,
  avisar_cliente boolean not null default false
);
create table if not exists legalizacao_processo (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  template_id uuid references legalizacao_template(id),
  tipo legalizacao_tipo not null,
  titulo text not null,
  status legalizacao_proc_status not null default 'em_andamento',
  data_inicio date not null,
  criado_por uuid references usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_leg_processo_cliente on legalizacao_processo(cliente_id);
create table if not exists legalizacao_etapa (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references legalizacao_processo(id) on delete cascade,
  ordem int not null,
  titulo text not null,
  descricao text,
  orgao legalizacao_orgao not null default 'outro',
  orgao_outro text,
  responsavel_papel papel,
  responsavel_id uuid references usuarios(id),
  prazo date,
  status legalizacao_etapa_status not null default 'pendente',
  protocolo text,
  protocolo_em date,
  anexo_obrigatorio boolean not null default false,
  anexo_path text,
  avisar_cliente boolean not null default false,
  cliente_avisado_em timestamptz,
  observacao text,
  concluido_em timestamptz,
  concluido_por uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
create index if not exists idx_leg_etapa_processo on legalizacao_etapa(processo_id);

alter table legalizacao_template enable row level security;
alter table legalizacao_template_etapa enable row level security;
alter table legalizacao_processo enable row level security;
alter table legalizacao_etapa enable row level security;

-- Templates: equipe lê; só admin escreve.
drop policy if exists leg_tpl_sel on legalizacao_template;
create policy leg_tpl_sel on legalizacao_template for select to authenticated
  using (auth_papel() in ('admin','contador','assistente'));
drop policy if exists leg_tpl_wr on legalizacao_template;
create policy leg_tpl_wr on legalizacao_template for all to authenticated
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
drop policy if exists leg_tpetapa_sel on legalizacao_template_etapa;
create policy leg_tpetapa_sel on legalizacao_template_etapa for select to authenticated
  using (auth_papel() in ('admin','contador','assistente'));
drop policy if exists leg_tpetapa_wr on legalizacao_template_etapa;
create policy leg_tpetapa_wr on legalizacao_template_etapa for all to authenticated
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');

-- Processo: SELECT herda a visibilidade do cliente; WRITE exige papel operacional + cliente visível.
drop policy if exists leg_proc_sel on legalizacao_processo;
create policy leg_proc_sel on legalizacao_processo for select to authenticated
  using (exists (select 1 from clientes c where c.id = cliente_id));
drop policy if exists leg_proc_wr on legalizacao_processo;
create policy leg_proc_wr on legalizacao_processo for all to authenticated
  using (auth_papel() in ('admin','assistente','contador') and exists (select 1 from clientes c where c.id = cliente_id))
  with check (auth_papel() in ('admin','assistente','contador') and exists (select 1 from clientes c where c.id = cliente_id));

-- Etapa: delega ao processo (e por ele, ao cliente).
drop policy if exists leg_etapa_sel on legalizacao_etapa;
create policy leg_etapa_sel on legalizacao_etapa for select to authenticated
  using (exists (select 1 from legalizacao_processo p join clientes c on c.id = p.cliente_id where p.id = processo_id));
drop policy if exists leg_etapa_wr on legalizacao_etapa;
create policy leg_etapa_wr on legalizacao_etapa for all to authenticated
  using (auth_papel() in ('admin','assistente','contador') and exists (select 1 from legalizacao_processo p join clientes c on c.id = p.cliente_id where p.id = processo_id))
  with check (auth_papel() in ('admin','assistente','contador') and exists (select 1 from legalizacao_processo p join clientes c on c.id = p.cliente_id where p.id = processo_id));

create or replace function legalizacao_etapa_integridade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_por := auth.uid();
  new.atualizado_em := now();
  if new.status = 'concluido' and new.concluido_em is null then
    new.concluido_em := now();
    new.concluido_por := auth.uid();
  end if;
  if new.status <> 'concluido' then
    new.concluido_em := null; new.concluido_por := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_legalizacao_etapa_integridade on legalizacao_etapa;
create trigger trg_legalizacao_etapa_integridade before insert or update on legalizacao_etapa
  for each row execute function legalizacao_etapa_integridade();
```

- [ ] **Step 2: Seed dos 7 modelos (mesma migration, ao final)**

Acrescentar ao `0079_legalizacao.sql`:

```sql
-- Seed idempotente dos modelos e etapas (só se o slug ainda não existe).
do $$
declare t uuid;
begin
  -- 1. Abertura Simples Nacional
  if not exists (select 1 from legalizacao_template where slug = 'abertura-simples') then
    insert into legalizacao_template (tipo, slug, nome, descricao) values
      ('abertura_simples','abertura-simples','Abertura — Simples Nacional','Constituição de empresa optante pelo Simples Nacional.') returning id into t;
    insert into legalizacao_template_etapa (template_id, ordem, titulo, orgao, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente) values
      (t,1,'Viabilidade de nome e endereço','prefeitura',2,'assistente',false,false),
      (t,2,'Registro do contrato social','junta',5,'contador',true,false),
      (t,3,'Inscrição no CNPJ','receita',7,'contador',false,true),
      (t,4,'Inscrição municipal','prefeitura',12,'assistente',false,false),
      (t,5,'Opção pelo Simples Nacional','receita',15,'contador',false,true),
      (t,6,'Alvará de funcionamento','prefeitura',20,'assistente',true,false),
      (t,7,'Vistoria do Corpo de Bombeiros','bombeiros',25,'assistente',false,false);
  end if;
  -- 2. Abertura Lucro Presumido
  if not exists (select 1 from legalizacao_template where slug = 'abertura-presumido') then
    insert into legalizacao_template (tipo, slug, nome, descricao) values
      ('abertura_presumido','abertura-presumido','Abertura — Lucro Presumido','Constituição de empresa no regime de Lucro Presumido.') returning id into t;
    insert into legalizacao_template_etapa (template_id, ordem, titulo, orgao, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente) values
      (t,1,'Viabilidade de nome e endereço','prefeitura',2,'assistente',false,false),
      (t,2,'Registro do contrato social','junta',5,'contador',true,false),
      (t,3,'Inscrição no CNPJ','receita',7,'contador',false,true),
      (t,4,'Inscrição estadual','sefaz',12,'contador',false,false),
      (t,5,'Inscrição municipal','prefeitura',12,'assistente',false,false),
      (t,6,'Alvará de funcionamento','prefeitura',20,'assistente',true,false),
      (t,7,'Vistoria do Corpo de Bombeiros','bombeiros',25,'assistente',false,false);
  end if;
  -- 3. Alteração de quadro societário
  if not exists (select 1 from legalizacao_template where slug = 'alteracao-quadro') then
    insert into legalizacao_template (tipo, slug, nome, descricao) values
      ('alteracao_quadro','alteracao-quadro','Alteração de quadro societário','Entrada/saída de sócios ou alteração de participações.') returning id into t;
    insert into legalizacao_template_etapa (template_id, ordem, titulo, orgao, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente) values
      (t,1,'Elaboração da alteração contratual','outro',2,'contador',false,false),
      (t,2,'Registro da alteração','junta',7,'contador',true,true),
      (t,3,'Atualização no CNPJ','receita',12,'contador',false,true),
      (t,4,'Atualização de inscrições','prefeitura',15,'assistente',false,false);
  end if;
  -- 4. Transformação de tipo societário
  if not exists (select 1 from legalizacao_template where slug = 'transformacao') then
    insert into legalizacao_template (tipo, slug, nome, descricao) values
      ('transformacao','transformacao','Transformação de tipo societário','Ex.: EIRELI/LTDA para outro tipo.') returning id into t;
    insert into legalizacao_template_etapa (template_id, ordem, titulo, orgao, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente) values
      (t,1,'Elaboração do ato de transformação','outro',2,'contador',false,false),
      (t,2,'Registro na Junta Comercial','junta',7,'contador',true,true),
      (t,3,'Atualização do CNPJ','receita',12,'contador',false,false),
      (t,4,'Atualização de inscrições e licenças','prefeitura',15,'assistente',false,false);
  end if;
  -- 5. Baixa / encerramento
  if not exists (select 1 from legalizacao_template where slug = 'baixa') then
    insert into legalizacao_template (tipo, slug, nome, descricao) values
      ('baixa','baixa','Baixa / encerramento','Encerramento da empresa em todos os órgãos.') returning id into t;
    insert into legalizacao_template_etapa (template_id, ordem, titulo, orgao, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente) values
      (t,1,'Elaboração do distrato social','outro',2,'contador',false,false),
      (t,2,'Baixa municipal','prefeitura',7,'assistente',false,false),
      (t,3,'Baixa estadual','sefaz',10,'contador',false,false),
      (t,4,'Baixa na Junta Comercial','junta',15,'contador',true,false),
      (t,5,'Baixa do CNPJ','receita',20,'contador',false,true);
  end if;
  -- 6. Transferência — entrada
  if not exists (select 1 from legalizacao_template where slug = 'transferencia-entrada') then
    insert into legalizacao_template (tipo, slug, nome, descricao) values
      ('transferencia_entrada','transferencia-entrada','Transferência — entrada','Recebimento de cliente de outra contabilidade (NBC PG 01).') returning id into t;
    insert into legalizacao_template_etapa (template_id, ordem, titulo, orgao, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente) values
      (t,1,'Comunicação de início ao cliente','outro',3,'assistente',false,true),
      (t,2,'Distrato com a contabilidade anterior','outro',2,'assistente',false,false),
      (t,3,'Recebimento do acervo documental','outro',5,'contador',true,false),
      (t,4,'Procurações e acessos (e-CAC, prefeitura)','receita',7,'contador',false,false),
      (t,5,'Conferência de obrigações pendentes','outro',12,'contador',false,false);
  end if;
  -- 7. Transferência — saída
  if not exists (select 1 from legalizacao_template where slug = 'transferencia-saida') then
    insert into legalizacao_template (tipo, slug, nome, descricao) values
      ('transferencia_saida','transferencia-saida','Transferência — saída','Saída de cliente para outra contabilidade (NBC PG 01).') returning id into t;
    insert into legalizacao_template_etapa (template_id, ordem, titulo, orgao, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente) values
      (t,1,'Comunicação formal da saída','outro',2,'assistente',false,true),
      (t,2,'Devolução do acervo documental','outro',7,'contador',true,false),
      (t,3,'Termo de entrega (NBC PG 01)','outro',10,'contador',true,false),
      (t,4,'Baixa de procurações e acessos','receita',12,'contador',false,false);
  end if;
end $$;
```

- [ ] **Step 3: Aplicar**

Run: `npm run db:migrate`
Expected: aplica `0079_legalizacao.sql`; sem erro.

- [ ] **Step 4: Conferir**

Run: `npm run db:test 2>&1 | grep -icE "FALHA|error"`
Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0079_legalizacao.sql
git commit -m "feat: migration 0079 — legalização (schema, RLS, seed dos 7 modelos)"
```

---

### Task 2: Biblioteca — tipos, materialização, progresso, comprovante, permissão (TDD)

**Files:**
- Create: `src/lib/legalizacao/tipos.ts`
- Create: `src/lib/legalizacao/processo.ts`
- Modify: `src/lib/clientes/permissoes.ts`
- Test: `src/tests/legalizacao/processo.test.ts`

**Interfaces:**
- Produces:
  - `type LegTipo`, `type LegOrgao`, `LEGALIZACAO_TIPOS: {valor:LegTipo; rotulo:string}[]`, `LEGALIZACAO_ORGAOS: {valor:LegOrgao; rotulo:string}[]`, `rotuloTipo(t)`, `rotuloOrgao(o, outro?)`.
  - `materializarEtapas(etapas, dataInicio): EtapaSeed[]`
  - `progressoProcesso(etapas): { total:number; concluidas:number; pct:number; concluido:boolean; proximoPrazo:string|null }`
  - `tipoComprovante(buf: Uint8Array): "pdf"|"png"|"jpg"|null`
  - `podeGerenciarLegalizacao(papel): boolean`

- [ ] **Step 1: Escrever os testes (falhando)**

Arquivo `src/tests/legalizacao/processo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { LEGALIZACAO_TIPOS, LEGALIZACAO_ORGAOS, rotuloOrgao } from "@/lib/legalizacao/tipos";
import { materializarEtapas, progressoProcesso, tipoComprovante } from "@/lib/legalizacao/processo";
import { podeGerenciarLegalizacao } from "@/lib/clientes/permissoes";

describe("tipos", () => {
  it("tem 7 tipos e 7 órgãos rotulados", () => {
    expect(LEGALIZACAO_TIPOS).toHaveLength(7);
    expect(LEGALIZACAO_ORGAOS).toHaveLength(7);
    expect(LEGALIZACAO_TIPOS.every((t) => t.rotulo.length > 0)).toBe(true);
  });
  it("rotuloOrgao usa o rótulo livre quando 'outro'", () => {
    expect(rotuloOrgao("junta")).toBe("Junta Comercial");
    expect(rotuloOrgao("outro", "JUCEMG")).toBe("JUCEMG");
    expect(rotuloOrgao("outro", null)).toBe("Outro");
  });
});

describe("materializarEtapas", () => {
  it("calcula prazo = data_inicio + prazo_dias e preserva ordem/campos", () => {
    const etapas = [
      { ordem: 1, titulo: "A", descricao: null, orgao: "junta" as const, prazoDias: 5, responsavelPapel: "contador", anexoObrigatorio: true, avisarCliente: false },
      { ordem: 2, titulo: "B", descricao: null, orgao: "receita" as const, prazoDias: null, responsavelPapel: null, anexoObrigatorio: false, avisarCliente: true },
    ];
    const out = materializarEtapas(etapas, "2026-07-01");
    expect(out[0].prazo).toBe("2026-07-06");
    expect(out[0].anexoObrigatorio).toBe(true);
    expect(out[1].prazo).toBeNull();
    expect(out[1].avisarCliente).toBe(true);
  });
});

describe("progressoProcesso", () => {
  it("conta concluídas, pct e próximo prazo", () => {
    const p = progressoProcesso([
      { status: "concluido", prazo: "2026-07-05" },
      { status: "pendente", prazo: "2026-07-20" },
      { status: "pendente", prazo: "2026-07-10" },
    ]);
    expect(p.total).toBe(3);
    expect(p.concluidas).toBe(1);
    expect(p.pct).toBe(33);
    expect(p.concluido).toBe(false);
    expect(p.proximoPrazo).toBe("2026-07-10");
  });
});

describe("tipoComprovante", () => {
  it("reconhece PDF, PNG e JPG; rejeita o resto", () => {
    expect(tipoComprovante(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe("pdf");
    expect(tipoComprovante(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe("png");
    expect(tipoComprovante(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(tipoComprovante(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});

describe("podeGerenciarLegalizacao", () => {
  it("admin/assistente/contador sim; financeiro não", () => {
    expect(podeGerenciarLegalizacao("admin")).toBe(true);
    expect(podeGerenciarLegalizacao("contador")).toBe(true);
    expect(podeGerenciarLegalizacao("financeiro")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- legalizacao`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Implementar `tipos.ts`**

```ts
export type LegTipo = "abertura_simples" | "abertura_presumido" | "alteracao_quadro" | "transformacao" | "baixa" | "transferencia_entrada" | "transferencia_saida";
export type LegOrgao = "junta" | "receita" | "prefeitura" | "sefaz" | "bombeiros" | "vigilancia" | "outro";
export type LegProcStatus = "em_andamento" | "concluido" | "cancelado";
export type LegEtapaStatus = "pendente" | "em_andamento" | "concluido";

export const LEGALIZACAO_TIPOS: { valor: LegTipo; rotulo: string }[] = [
  { valor: "abertura_simples", rotulo: "Abertura — Simples Nacional" },
  { valor: "abertura_presumido", rotulo: "Abertura — Lucro Presumido" },
  { valor: "alteracao_quadro", rotulo: "Alteração de quadro societário" },
  { valor: "transformacao", rotulo: "Transformação de tipo societário" },
  { valor: "baixa", rotulo: "Baixa / encerramento" },
  { valor: "transferencia_entrada", rotulo: "Transferência — entrada" },
  { valor: "transferencia_saida", rotulo: "Transferência — saída" },
];
export const LEGALIZACAO_ORGAOS: { valor: LegOrgao; rotulo: string }[] = [
  { valor: "junta", rotulo: "Junta Comercial" },
  { valor: "receita", rotulo: "Receita Federal" },
  { valor: "prefeitura", rotulo: "Prefeitura" },
  { valor: "sefaz", rotulo: "Sefaz (Estado)" },
  { valor: "bombeiros", rotulo: "Corpo de Bombeiros" },
  { valor: "vigilancia", rotulo: "Vigilância Sanitária" },
  { valor: "outro", rotulo: "Outro" },
];
export function rotuloTipo(t: LegTipo): string { return LEGALIZACAO_TIPOS.find((x) => x.valor === t)?.rotulo ?? t; }
export function rotuloOrgao(o: LegOrgao, outro?: string | null): string {
  if (o === "outro") return (outro && outro.trim()) || "Outro";
  return LEGALIZACAO_ORGAOS.find((x) => x.valor === o)?.rotulo ?? o;
}
```

- [ ] **Step 4: Implementar `processo.ts`**

```ts
import { somarDias } from "@/lib/onboarding/processo";
import type { LegOrgao, LegEtapaStatus } from "@/lib/legalizacao/tipos";

export type EtapaTemplate = { ordem: number; titulo: string; descricao: string | null; orgao: LegOrgao; prazoDias: number | null; responsavelPapel: string | null; anexoObrigatorio: boolean; avisarCliente: boolean };
export type EtapaSeed = EtapaTemplate & { prazo: string | null };

export function materializarEtapas(etapas: EtapaTemplate[], dataInicio: string): EtapaSeed[] {
  return etapas
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((e) => ({ ...e, prazo: e.prazoDias == null ? null : somarDias(dataInicio, e.prazoDias) }));
}

export function progressoProcesso(etapas: { status: LegEtapaStatus; prazo: string | null }[]): { total: number; concluidas: number; pct: number; concluido: boolean; proximoPrazo: string | null } {
  const total = etapas.length;
  const concluidas = etapas.filter((e) => e.status === "concluido").length;
  const pct = total === 0 ? 0 : Math.round((concluidas / total) * 100);
  const prazos = etapas.filter((e) => e.status !== "concluido" && e.prazo).map((e) => e.prazo as string).sort();
  return { total, concluidas, pct, concluido: total > 0 && concluidas === total, proximoPrazo: prazos[0] ?? null };
}

// Comprovante aceita PDF, PNG e JPG (magic bytes; extensão é forjável).
export function tipoComprovante(buf: Uint8Array): "pdf" | "png" | "jpg" | null {
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "pdf";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  return null;
}
```

- [ ] **Step 5: `podeGerenciarLegalizacao` em `permissoes.ts`**

```ts
// Quem gerencia processos de legalização/societário (financeiro só lê).
export function podeGerenciarLegalizacao(papel: Papel | undefined): boolean {
  return papel === "admin" || papel === "assistente" || papel === "contador";
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test -- legalizacao`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/legalizacao/ src/lib/clientes/permissoes.ts src/tests/legalizacao/processo.test.ts
git commit -m "feat: libs de legalização (tipos, materialização, progresso, comprovante)"
```

---

### Task 3: Ações do processo

**Files:**
- Create: `src/app/(app)/legalizacao/actions.ts`

**Interfaces:**
- Consumes: `getPerfilAtual`, `createServerSupabase`, `createAdminSupabase`, `materializarEtapas`, `tipoComprovante`, `podeGerenciarLegalizacao`, `LEGALIZACAO_TIPOS`.
- Produces:
  - `iniciarProcesso(clienteId, templateId, dataInicio): Promise<{ id?: string; erro?: string }>`
  - `atualizarEtapa(etapaId, patch): Promise<{ ok?: boolean; erro?: string }>`
  - `anexarComprovanteEtapa(etapaId, formData): Promise<{ ok?: boolean; erro?: string }>`
  - `definirStatusProcesso(id, status): Promise<{ ok?: boolean; erro?: string }>`

- [ ] **Step 1: Escrever `actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeGerenciarLegalizacao } from "@/lib/clientes/permissoes";
import { materializarEtapas, tipoComprovante, type EtapaTemplate } from "@/lib/legalizacao/processo";
import { rotuloTipo, type LegProcStatus, type LegEtapaStatus, type LegOrgao } from "@/lib/legalizacao/tipos";

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarLegalizacao(p.papel)) return null;
  return p;
}

export async function iniciarProcesso(clienteId: string, templateId: string, dataInicio: string): Promise<{ id?: string; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: tpl } = await supabase.from("legalizacao_template").select("id, tipo, nome").eq("id", templateId).maybeSingle();
  if (!tpl) return { erro: "Modelo não encontrado." };
  const { data: etapasTpl } = await supabase.from("legalizacao_template_etapa")
    .select("ordem, titulo, descricao, orgao, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente")
    .eq("template_id", templateId).order("ordem");
  const etapas: EtapaTemplate[] = (etapasTpl ?? []).map((e) => ({
    ordem: e.ordem as number, titulo: e.titulo as string, descricao: (e.descricao as string | null) ?? null,
    orgao: e.orgao as LegOrgao, prazoDias: (e.prazo_dias as number | null) ?? null,
    responsavelPapel: (e.responsavel_papel as string | null) ?? null,
    anexoObrigatorio: e.anexo_obrigatorio as boolean, avisarCliente: e.avisar_cliente as boolean,
  }));
  const { data: proc, error } = await supabase.from("legalizacao_processo")
    .insert({ cliente_id: clienteId, template_id: templateId, tipo: tpl.tipo, titulo: rotuloTipo(tpl.tipo as never), data_inicio: dataInicio })
    .select("id").single();
  if (error || !proc) return { erro: "Falha ao criar o processo (verifique a permissão sobre o cliente)." };
  const seeds = materializarEtapas(etapas, dataInicio);
  if (seeds.length > 0) {
    const linhas = seeds.map((s) => ({
      processo_id: proc.id, ordem: s.ordem, titulo: s.titulo, descricao: s.descricao, orgao: s.orgao,
      responsavel_papel: s.responsavelPapel, prazo: s.prazo, anexo_obrigatorio: s.anexoObrigatorio, avisar_cliente: s.avisarCliente,
    }));
    const { error: e2 } = await supabase.from("legalizacao_etapa").insert(linhas);
    if (e2) return { erro: "Falha ao criar as etapas." };
  }
  revalidatePath(`/legalizacao/${proc.id}`);
  revalidatePath(`/clientes/${clienteId}`);
  return { id: proc.id as string };
}

type EtapaPatch = { status?: LegEtapaStatus; protocolo?: string | null; protocoloEm?: string | null; prazo?: string | null; orgaoOutro?: string | null; observacao?: string | null; clienteAvisado?: boolean };

export async function atualizarEtapa(etapaId: string, patch: EtapaPatch): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const upd: Record<string, unknown> = {};
  if (patch.status !== undefined) upd.status = patch.status;
  if (patch.protocolo !== undefined) upd.protocolo = patch.protocolo;
  if (patch.protocoloEm !== undefined) upd.protocolo_em = patch.protocoloEm;
  if (patch.prazo !== undefined) upd.prazo = patch.prazo;
  if (patch.orgaoOutro !== undefined) upd.orgao_outro = patch.orgaoOutro;
  if (patch.observacao !== undefined) upd.observacao = patch.observacao;
  if (patch.clienteAvisado !== undefined) upd.cliente_avisado_em = patch.clienteAvisado ? new Date().toISOString() : null;
  if (Object.keys(upd).length === 0) return { ok: true };
  const { data: et } = await supabase.from("legalizacao_etapa").select("processo_id").eq("id", etapaId).maybeSingle();
  const { error } = await supabase.from("legalizacao_etapa").update(upd).eq("id", etapaId);
  if (error) return { erro: "Falha ao atualizar a etapa." };
  if (et) revalidatePath(`/legalizacao/${et.processo_id}`);
  return { ok: true };
}

export async function anexarComprovanteEtapa(etapaId: string, formData: FormData): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const arquivo = formData.get("comprovante") as File | null;
  if (!arquivo || arquivo.size === 0) return { erro: "Selecione um arquivo." };
  if (arquivo.size > 10 * 1024 * 1024) return { erro: "Arquivo acima de 10 MB." };
  const buf = new Uint8Array(await arquivo.arrayBuffer());
  const tipo = tipoComprovante(buf);
  if (!tipo) return { erro: "Envie um PDF, PNG ou JPG." };
  const supabase = await createServerSupabase();
  const { data: et } = await supabase.from("legalizacao_etapa").select("processo_id").eq("id", etapaId).maybeSingle();
  if (!et) return { erro: "Etapa não encontrada." };
  const path = `legalizacao/${et.processo_id}/${etapaId}.${tipo}`;
  const ct = tipo === "pdf" ? "application/pdf" : tipo === "png" ? "image/png" : "image/jpeg";
  const admin = createAdminSupabase();
  const { error: upErr } = await admin.storage.from("documentos").upload(path, buf, { contentType: ct, upsert: true });
  if (upErr) return { erro: "Falha ao enviar o comprovante." };
  const { error } = await supabase.from("legalizacao_etapa").update({ anexo_path: path }).eq("id", etapaId);
  if (error) return { erro: "Falha ao registrar o comprovante." };
  revalidatePath(`/legalizacao/${et.processo_id}`);
  return { ok: true };
}

export async function definirStatusProcesso(id: string, status: LegProcStatus): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: proc } = await supabase.from("legalizacao_processo").select("cliente_id").eq("id", id).maybeSingle();
  const { error } = await supabase.from("legalizacao_processo").update({ status, atualizado_em: new Date().toISOString() }).eq("id", id);
  if (error) return { erro: "Falha ao atualizar o processo." };
  revalidatePath(`/legalizacao/${id}`);
  if (proc) revalidatePath(`/clientes/${proc.cliente_id}`);
  return { ok: true };
}
```

- [ ] **Step 2: Verificar**

Run: `npm run lint && npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/legalizacao/actions.ts"
git commit -m "feat: ações de legalização (iniciar processo, etapa, comprovante, status)"
```

---

### Task 4: Seção na ficha do cliente + iniciar processo

**Files:**
- Create: `src/components/legalizacao/LegalizacaoSection.tsx`
- Modify: `src/app/(app)/clientes/[id]/page.tsx`

**Interfaces:**
- Consumes: `iniciarProcesso`, `LEGALIZACAO_TIPOS`, `progressoProcesso`; templates ativos (para o seletor).
- Produces: seção lista os processos do cliente + formulário "Novo processo".

- [ ] **Step 1: `LegalizacaoSection.tsx` (client)**

Props: `clienteId: string`, `processos: {id,tipo,titulo,status,pct,proximoPrazo}[]`, `modelos: {id,nome}[]`, `podeGerenciar: boolean`. Renderiza:
- lista dos processos (título, status, barra de progresso `pct`, próximo prazo) com link `→ /legalizacao/{id}`;
- se `podeGerenciar`, um bloco "Novo processo": `<select>` de `modelos`, `<input type="date">` (data de início, default hoje via prop `hoje`), botão "Iniciar" → `iniciarProcesso(clienteId, modeloId, data)`; em `ok`, `router.push(/legalizacao/{id})`.

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { iniciarProcesso } from "@/app/(app)/legalizacao/actions";

type Proc = { id: string; titulo: string; status: string; pct: number; proximoPrazo: string | null };
const ROT: Record<string, string> = { em_andamento: "Em andamento", concluido: "Concluído", cancelado: "Cancelado" };
const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export function LegalizacaoSection({ clienteId, processos, modelos, podeGerenciar, hoje }: {
  clienteId: string; processos: Proc[]; modelos: { id: string; nome: string }[]; podeGerenciar: boolean; hoje: string;
}) {
  const router = useRouter();
  const [modelo, setModelo] = useState(modelos[0]?.id ?? "");
  const [data, setData] = useState(hoje);
  const [ocupado, setOcupado] = useState(false);

  async function iniciar() {
    if (!modelo) return;
    setOcupado(true);
    const r = await iniciarProcesso(clienteId, modelo, data);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    if (r.id) router.push(`/legalizacao/${r.id}`);
  }

  return (
    <section className="rounded-lg border border-linha bg-white p-4">
      <h2 className="font-display text-sm font-semibold text-texto">Legalização / Societário</h2>
      {processos.length === 0 ? (
        <p className="mt-1 text-sm text-cinza">Nenhum processo aberto.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {processos.map((p) => (
            <li key={p.id}>
              <Link href={`/legalizacao/${p.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-linha px-3 py-2 text-sm hover:bg-creme">
                <span className="font-medium text-texto">{p.titulo}</span>
                <span className="flex items-center gap-3 text-xs text-cinza">
                  <span>{ROT[p.status] ?? p.status}</span>
                  <span className="tabular-nums">{p.pct}%</span>
                  <span>prazo {dataBR(p.proximoPrazo)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {podeGerenciar && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-linha pt-3">
          <label className="text-xs text-cinza">Modelo
            <select value={modelo} onChange={(e) => setModelo(e.target.value)} className="mt-0.5 block rounded-lg border border-linha px-2 py-1.5 text-sm">
              {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </label>
          <label className="text-xs text-cinza">Início
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="mt-0.5 block rounded-lg border border-linha px-2 py-1.5 text-sm" />
          </label>
          <button disabled={ocupado || !modelo} onClick={iniciar} className="rounded-lg bg-verde px-3 py-1.5 text-sm text-white disabled:opacity-60">
            {ocupado ? "Iniciando…" : "Iniciar processo"}
          </button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Carregar dados e renderizar na ficha (`page.tsx`)**

Após os blocos existentes, adicionar:

```ts
import { LegalizacaoSection } from "@/components/legalizacao/LegalizacaoSection";
import { podeGerenciarLegalizacao } from "@/lib/clientes/permissoes";
import { progressoProcesso } from "@/lib/legalizacao/processo";
import { rotuloTipo, type LegTipo, type LegEtapaStatus } from "@/lib/legalizacao/tipos";
// ...
const podeLegalizacao = podeGerenciarLegalizacao(papel);
const { data: procs } = await supabase.from("legalizacao_processo").select("id, tipo, titulo, status").eq("cliente_id", id).order("criado_em", { ascending: false });
const procIds = (procs ?? []).map((p) => p.id as string);
const { data: etapasProc } = procIds.length
  ? await supabase.from("legalizacao_etapa").select("processo_id, status, prazo").in("processo_id", procIds)
  : { data: [] };
const etapasPorProc = new Map<string, { status: LegEtapaStatus; prazo: string | null }[]>();
for (const e of etapasProc ?? []) {
  const a = etapasPorProc.get(e.processo_id as string) ?? [];
  a.push({ status: e.status as LegEtapaStatus, prazo: (e.prazo as string | null) ?? null });
  etapasPorProc.set(e.processo_id as string, a);
}
const processosLeg = (procs ?? []).map((p) => {
  const pr = progressoProcesso(etapasPorProc.get(p.id as string) ?? []);
  return { id: p.id as string, titulo: (p.titulo as string) || rotuloTipo(p.tipo as LegTipo), status: p.status as string, pct: pr.pct, proximoPrazo: pr.proximoPrazo };
});
const { data: modelosLeg } = await supabase.from("legalizacao_template").select("id, nome").eq("ativo", true).order("nome");
```

E renderizar (após a seção de Responsáveis por departamento):

```tsx
{podeCriarCliente(papel) && (
  <LegalizacaoSection
    clienteId={id}
    processos={processosLeg}
    modelos={(modelosLeg ?? []).map((m) => ({ id: m.id as string, nome: m.nome as string }))}
    podeGerenciar={podeLegalizacao}
    hoje={new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}
  />
)}
```

- [ ] **Step 3: Verificar**

Run: `npm run lint && npm run typecheck`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/legalizacao/LegalizacaoSection.tsx "src/app/(app)/clientes/[id]/page.tsx"
git commit -m "feat: seção de legalização na ficha do cliente (iniciar/listar processos)"
```

---

### Task 5: Página de detalhe do processo

**Files:**
- Create: `src/app/(app)/legalizacao/[id]/page.tsx`
- Create: `src/app/(app)/legalizacao/[id]/EtapaLinha.tsx`
- Create: `src/app/(app)/legalizacao/[id]/AcoesProcesso.tsx`

**Interfaces:**
- Consumes: `atualizarEtapa`, `anexarComprovanteEtapa`, `definirStatusProcesso`, `rotuloOrgao`, `rotuloTipo`, `classificarAlerta` (de `@/lib/onboarding/alertas`), `urlAssinadaComprovante` (helper local via createSignedUrl — server).

- [ ] **Step 1: `page.tsx` (server)**

- Gate: `podeCriarCliente(perfil.papel)` senão redirect. Carrega o processo (join cliente para o nome) e as etapas ordenadas. Se não visível/into → `notFound()`.
- Passa `hoje` (America/Sao_Paulo) para os selos de prazo.
- Para cada etapa com `anexo_path`, gera URL assinada (via `createAdminSupabase().storage.from("documentos").createSignedUrl(path, 60)`).
- Renderiza cabeçalho (título do processo, cliente com link, status, progresso), `AcoesProcesso` (concluir/cancelar) e a lista de `EtapaLinha`.

- [ ] **Step 2: `EtapaLinha.tsx` (client)**

Props: a etapa + `hoje`. Campos editáveis com salvamento por `atualizarEtapa`:
- **status** (`<select>` pendente/em_andamento/concluído) → `atualizarEtapa(id,{status})` + `router.refresh()`;
- **protocolo** (input) + **data do protocolo** (date) → salvar (onBlur ou botão);
- **prazo** (date) com selo de severidade via `classificarAlerta(prazo, hoje)` (em_breve/vencido/crítico), reusando os rótulos/cores do padrão de vencimentos;
- **órgão** exibido por `rotuloOrgao(orgao, orgao_outro)`; se `orgao==='outro'`, um input para `orgao_outro`;
- **observação** (textarea, onBlur);
- **anexo**: se `anexoUrl`, link "ver comprovante"; input `file` (accept `.pdf,image/*`) → `anexarComprovanteEtapa`;
- **cliente avisado**: se `avisar_cliente`, um checkbox "cliente avisado" que chama `atualizarEtapa(id,{clienteAvisado})` e mostra a data.

- [ ] **Step 3: `AcoesProcesso.tsx` (client)**

Botões "Concluir processo" e "Cancelar processo" → `definirStatusProcesso(id, ...)` + `router.refresh()`; ocultos se já no estado.

- [ ] **Step 4: Verificar**

Run: `npm run lint && npm run typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/legalizacao/[id]/"
git commit -m "feat: detalhe do processo de legalização (etapas, protocolo, prazo, comprovante)"
```

---

### Task 6: Painel global + item de menu

**Files:**
- Create: `src/app/(app)/legalizacao/page.tsx`
- Create: `src/app/(app)/legalizacao/PainelLegalizacao.tsx`
- Modify: `src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `rotuloTipo`, `rotuloOrgao`, `LEGALIZACAO_ORGAOS`, `classificarAlerta`, `podeGerenciarLegalizacao`.

- [ ] **Step 1: `page.tsx` (server)**

- Gate: `podeGerenciarLegalizacao(perfil.papel)` senão `redirect("/")`.
- `searchParams`: `status` (default `em_andamento`), `orgao` (default `""`).
- Carrega processos visíveis (a RLS já limita) com `status` filtrado; junta cliente (`prospect`/razão) e as etapas (para próximo prazo e órgãos presentes). Filtro por `orgao` em memória (processos que têm ao menos uma etapa pendente daquele órgão).
- Monta linhas: cliente, tipo (`rotuloTipo`), status, próximo prazo + severidade (`classificarAlerta`), % concluído. Passa para `PainelLegalizacao`.

- [ ] **Step 2: `PainelLegalizacao.tsx` (client)**

- Barra de filtros (form GET): `status` (Em andamento/Concluído/Cancelado/Todos), `orgao` (`LEGALIZACAO_ORGAOS` + "Todos").
- Tabela: Cliente · Processo · Status · % · Próximo prazo (com selo) — cada linha linka para `/legalizacao/{id}`.

- [ ] **Step 3: Item de menu**

Em `src/components/Sidebar.tsx`, após "Comercial"/"Propostas" (ou junto de Onboarding), adicionar:

```tsx
...(podeCriarCliente(papel) ? [{ href: "/legalizacao", label: "Legalização" }] : []),
```

(A visibilidade fina é `podeGerenciarLegalizacao`, mas `podeCriarCliente` cobre admin/assistente/contador — mesmos papéis; manter o padrão dos demais itens.)

- [ ] **Step 4: Verificar**

Run: `npm run lint && npm run typecheck && npm test`
Expected: sem erros; suíte verde.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/legalizacao/page.tsx" "src/app/(app)/legalizacao/PainelLegalizacao.tsx" src/components/Sidebar.tsx
git commit -m "feat: painel global de legalização + item de menu"
```

---

### Task 7: Testes de RLS + documentação

**Files:**
- Modify: `supabase/tests/rls.test.sql`
- Modify: `docs/DOCUMENTACAO.md`

- [ ] **Step 1: Assert de RLS**

Adicionar ao final de `rls.test.sql` (fixtures: cliente `aaaaaaaa-…001` do contador …003; `…002` do admin …001). Cria um template mínimo com `reset role` (admin bypass não; usar service via `reset role` que roda como owner — seguir o padrão dos demais asserts que inserem dados de apoio com `reset role`).

```sql
-- ASSERT: legalizacao — contador cria processo só no cliente dele; financeiro lê e não escreve
do $$
declare tpl uuid; proc uuid; n int;
begin
  reset role;
  insert into legalizacao_template (tipo, slug, nome) values ('baixa','tpl-teste-rls','TPL teste')
    on conflict (slug) do update set nome = excluded.nome returning id into tpl;

  -- contador cria no PRÓPRIO cliente (…001) -> efeito
  perform _simular('00000000-0000-0000-0000-000000000003');
  insert into legalizacao_processo (cliente_id, template_id, tipo, titulo, data_inicio)
    values ('aaaaaaaa-0000-0000-0000-000000000001', tpl, 'baixa', 'Baixa', current_date) returning id into proc;
  reset role;
  select count(*) into n from legalizacao_processo where id = proc;
  if n <> 1 then raise exception 'FALHA: contador não criou processo no próprio cliente'; end if;

  -- contador NÃO cria no cliente de outro (…002) -> barrado
  perform _simular('00000000-0000-0000-0000-000000000003');
  begin
    insert into legalizacao_processo (cliente_id, template_id, tipo, titulo, data_inicio)
      values ('aaaaaaaa-0000-0000-0000-000000000002', tpl, 'baixa', 'X', current_date);
    raise exception 'FALHA: contador criou processo em cliente de outro';
  exception when insufficient_privilege then null; end;

  -- financeiro LÊ mas NÃO escreve
  perform _simular('00000000-0000-0000-0000-000000000004');
  select count(*) into n from legalizacao_processo where id = proc;
  if n <> 1 then raise exception 'FALHA: financeiro não leu processo'; end if;
  begin
    update legalizacao_processo set titulo = 'hack' where id = proc;
    -- update sem linhas afetadas não lança; conferir efeito
  exception when insufficient_privilege then null; end;
  reset role;
  if exists (select 1 from legalizacao_processo where id = proc and titulo = 'hack') then
    raise exception 'FALHA: financeiro alterou processo';
  end if;

  raise notice 'OK: legalizacao — contador só no próprio, financeiro só lê';
end $$;
```

- [ ] **Step 2: Rodar RLS**

Run: `npm run db:test 2>&1 | grep -iE "FALHA|legalizacao"`
Expected: `OK: legalizacao — ...`; nenhuma `FALHA`. E `npm run db:test 2>&1 | grep -icE "FALHA|error"` → `0`.

- [ ] **Step 3: Documentação**

Em `docs/DOCUMENTACAO.md`: nova subseção **Legalização / Societário** — módulo dedicado (7 modelos, editáveis pelo admin nas próximas fatias), processos por cliente com acompanhamento por órgão, protocolo, prazo e status; baixa de etapa com comprovante; registro de "cliente avisado" (RF-013 parcial); painel global com filtros por órgão/status; RLS por dono do cliente (financeiro só lê). Citar que a Fatia A entrega RF-011, RF-012 (via seed) e RF-013 (registro); B (editor de modelos) e C (termo NBC PG 01) são as próximas.

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/rls.test.sql docs/DOCUMENTACAO.md
git commit -m "test+docs: RLS de legalização e documentação (Fatia A)"
```

---

## Self-Review (cobertura do spec — Fatia A)

- Motor dedicado (template→etapas→instância) + órgão + protocolo → Task 1. ✔
- 7 modelos semeados → Task 1 (seed). ✔
- Materialização de prazos, progresso, comprovante, permissão → Task 2. ✔
- Iniciar/atualizar/baixar/concluir → Task 3. ✔
- Iniciar e listar na ficha → Task 4. ✔
- Detalhe com protocolo/prazo/status/anexo/aviso → Task 5. ✔
- Painel global + menu → Task 6. ✔
- RLS (contador só o dele; financeiro só lê) + docs → Task 7. ✔

**Notas:** `classificarAlerta` reusado de `@/lib/onboarding/alertas`. RF-013 entregue como registro manual (`cliente_avisado_em`), sem envio — conforme decisão. Editor de modelos (B) e termo NBC PG 01 (C) ficam para as próximas fatias.
