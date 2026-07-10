# Certificados e procurações com alertas de vencimento — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Controlar certificados digitais e procurações por cliente, com alertas in-app escalonados (60/30/15 dias e vencido), sem duplicar a validade do certificado A1 que a NFS-e já usa.

**Architecture:** Duas tabelas dedicadas (`certificado_digital`, `procuracao`) + uma função `SECURITY DEFINER` que expõe **apenas** a data de validade dos certificados da NFS-e. Um motor de alerta puro em `src/lib/vencimentos/` classifica a severidade; o painel une as três fontes. RLS fechada para o financeiro.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Tailwind 4, Supabase (Postgres/RLS), Vitest. Migrations pelo runner próprio `npm run db:migrate`.

## Global Constraints

- Migrations via `npm run db:migrate`; **nunca** `supabase db push`. Idempotentes (`create table if not exists`, `drop policy if exists ... ; create policy`, `create or replace function`, enum via `do $$ ... exception when duplicate_object then null; end $$`).
- Migrations aplicadas são **imutáveis** — mudança = nova migration. Próxima livre: **0069**.
- Papel (RBAC) lido **só** de `usuarios.papel` via `getPerfilAtual()` / `auth_papel()`. Nunca do JWT.
- Imports pelo alias `@/*`. Imagens via `next/image`.
- **`Date.now()` / `new Date()` sem argumento são proibidos dentro de componentes** (regra `react-hooks/purity` do ESLint). O "hoje" vem de um helper em `src/lib/`, calculado no servidor.
- Escala de severidade, **exata**: `dias < 0` → `vencido`; `dias <= 15` → `critico`; `dias <= 30` → `alerta`; `dias <= 60` → `aviso`; senão `ok` (fora do painel).
- Rodar antes de cada commit: `npm run lint && npm run typecheck && npm test`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

- **Create** `supabase/migrations/0069_vencimentos.sql` — tabelas, enum, RLS, trigger de autoria, função `SECURITY DEFINER`.
- **Create** `src/lib/vencimentos/alerta.ts` — motor puro (classificação, ordenação, painel).
- **Create** `src/lib/vencimentos/montar.ts` — união pura das três fontes em `ItemVencimento[]`.
- **Create** `src/lib/vencimentos/hoje.ts` — `hojeEmSaoPaulo()` (isolado: usa o relógio, então fica fora do módulo puro).
- **Create** `src/tests/vencimentos/alerta.test.ts` — testes de fronteira.
- **Create** `src/tests/vencimentos/montar.test.ts` — teste da união (`editavel` só nas linhas da NFS-e).
- **Create** `src/app/(app)/vencimentos/actions.ts` — leitura: `listarVencimentos`, `contarVencimentos`, `csvVencimentos`.
- **Create** `src/app/(app)/vencimentos/crud-actions.ts` — escrita: salvar/desativar certificado e procuração.
- **Create** `src/app/(app)/vencimentos/page.tsx` — painel global.
- **Create** `src/components/vencimentos/VencimentosSection.tsx` — seção da ficha do cliente.
- **Create** `src/components/vencimentos/FormCertificado.tsx` e `FormProcuracao.tsx` — formulários.
- **Create** `src/components/vencimentos/BotaoDesativar.tsx` — desativa um registro (confirmação inline).
- **Create** `src/components/vencimentos/BaixarCsvVencimentos.tsx` — botão de exportação.
- **Modify** `src/lib/clientes/permissoes.ts` — `podeGerenciarVencimentos`.
- **Modify** `src/tests/clientes/permissoes.test.ts` — teste da permissão.
- **Modify** `src/app/(app)/layout.tsx` — badge de vencimentos.
- **Modify** `src/components/Sidebar.tsx` — item de menu + badge.
- **Modify** `src/app/(app)/clientes/[id]/page.tsx` — renderiza a seção.
- **Modify** `supabase/tests/rls.test.sql` — RLS das tabelas novas + função da NFS-e.

---

### Task 1: Migration — tabelas, RLS e leitura da validade da NFS-e

**Files:**
- Create: `supabase/migrations/0069_vencimentos.sql`

**Interfaces:**
- Produces: tabelas `certificado_digital` e `procuracao`; enum `certificado_tipo`; função `pode_ver_vencimento(uuid)`; trigger `vencimento_integridade()`; função `certificados_nfse_vencimento()` retornando `(cliente_id uuid, validade timestamptz, origem text)`.

- [ ] **Step 1: Escrever a migration**

Arquivo `supabase/migrations/0069_vencimentos.sql`:

```sql
-- Vencimentos: certificados digitais e procurações, com alertas escalonados. Idempotente.

do $$ begin
  create type certificado_tipo as enum ('A1','A3');
exception when duplicate_object then null; end $$;

create table if not exists certificado_digital (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  tipo certificado_tipo not null,
  titular text not null,
  documento_titular text,
  emissao date,
  validade date not null,
  observacao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
create index if not exists certificado_digital_cliente_idx on certificado_digital (cliente_id);
create index if not exists certificado_digital_validade_idx on certificado_digital (validade) where ativo;

create table if not exists procuracao (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  orgao text not null,
  outorgante text not null,
  outorgado text,
  inicio date,
  validade date not null,
  observacao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
create index if not exists procuracao_cliente_idx on procuracao (cliente_id);
create index if not exists procuracao_validade_idx on procuracao (validade) where ativo;

-- Visibilidade: admin/assistente veem todos; contador só os seus. Financeiro fica de fora
-- (certificado e procuração não são dado financeiro) — a política nasce fechada, sem depender
-- do gate da tela, ao contrário de obrigacao_instancia.
create or replace function pode_ver_vencimento(p_cliente_id uuid) returns boolean
  language sql stable security invoker set search_path = pg_catalog, public as $$
  select auth_papel() in ('admin','assistente')
      or (auth_papel() = 'contador'
          and exists (select 1 from clientes c where c.id = p_cliente_id and c.contador_id = auth.uid()));
$$;

alter table certificado_digital enable row level security;
alter table procuracao enable row level security;

drop policy if exists cert_dig_sel on certificado_digital;
create policy cert_dig_sel on certificado_digital for select to authenticated
  using (pode_ver_vencimento(cliente_id));
drop policy if exists cert_dig_ins on certificado_digital;
create policy cert_dig_ins on certificado_digital for insert to authenticated
  with check (pode_ver_vencimento(cliente_id));
drop policy if exists cert_dig_upd on certificado_digital;
create policy cert_dig_upd on certificado_digital for update to authenticated
  using (pode_ver_vencimento(cliente_id)) with check (pode_ver_vencimento(cliente_id));
drop policy if exists cert_dig_del on certificado_digital;
create policy cert_dig_del on certificado_digital for delete to authenticated
  using (pode_ver_vencimento(cliente_id));

drop policy if exists procuracao_sel on procuracao;
create policy procuracao_sel on procuracao for select to authenticated
  using (pode_ver_vencimento(cliente_id));
drop policy if exists procuracao_ins on procuracao;
create policy procuracao_ins on procuracao for insert to authenticated
  with check (pode_ver_vencimento(cliente_id));
drop policy if exists procuracao_upd on procuracao;
create policy procuracao_upd on procuracao for update to authenticated
  using (pode_ver_vencimento(cliente_id)) with check (pode_ver_vencimento(cliente_id));
drop policy if exists procuracao_del on procuracao;
create policy procuracao_del on procuracao for delete to authenticated
  using (pode_ver_vencimento(cliente_id));

-- Autoria não-forjável (padrão do projeto).
create or replace function vencimento_integridade() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := auth.uid();
    new.atualizado_por := auth.uid();
  else
    new.criado_por := old.criado_por;
    new.atualizado_por := auth.uid();
    new.atualizado_em := now();
  end if;
  return new;
end; $$;

drop trigger if exists trg_cert_dig_integridade on certificado_digital;
create trigger trg_cert_dig_integridade before insert or update on certificado_digital
  for each row execute function vencimento_integridade();
drop trigger if exists trg_procuracao_integridade on procuracao;
create trigger trg_procuracao_integridade before insert or update on procuracao
  for each row execute function vencimento_integridade();

-- Expõe SÓ a data de validade dos certificados da NFS-e — nunca pfx_cifrado/senha_cifrada.
-- SECURITY DEFINER bypassa a RLS (admin-only dessas tabelas), então a regra de visibilidade
-- é replicada explicitamente aqui.
create or replace function certificados_nfse_vencimento()
  returns table (cliente_id uuid, validade timestamptz, origem text)
  language sql stable security definer set search_path = pg_catalog, public as $$
  select c.cliente_id, c.validade, 'nfse_cliente'::text
    from nfse_certificado_cliente c
    join clientes cl on cl.id = c.cliente_id
   where c.validade is not null
     and auth_papel() in ('admin','assistente','contador')
     and (auth_papel() in ('admin','assistente') or cl.contador_id = auth.uid())
  union all
  select null::uuid, n.validade, 'nfse_escritorio'::text
    from nfse_certificado n
   where n.id = 1 and n.validade is not null
     and auth_papel() in ('admin','assistente','contador');
$$;

-- Funções recebem EXECUTE de PUBLIC por padrão; para SECURITY DEFINER isso é risco.
revoke execute on function certificados_nfse_vencimento() from public;
grant execute on function certificados_nfse_vencimento() to authenticated;
```

- [ ] **Step 2: Aplicar a migration**

Run: `npm run db:migrate`
Expected: `+ aplicando: 0069_vencimentos.sql` sem erro.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0069_vencimentos.sql
git commit -m "feat(db): certificados digitais e procurações com RLS fechada ao financeiro

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Permissão `podeGerenciarVencimentos`

**Files:**
- Modify: `src/lib/clientes/permissoes.ts`
- Modify: `src/tests/clientes/permissoes.test.ts`

**Interfaces:**
- Produces: `podeGerenciarVencimentos(papel: Papel | undefined): boolean` — true para `admin`, `assistente`, `contador`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao final de `src/tests/clientes/permissoes.test.ts` (e incluir `podeGerenciarVencimentos` no `import` de `@/lib/clientes/permissoes` já existente no topo):

```ts
describe("podeGerenciarVencimentos", () => {
  it("permite admin, assistente e contador", () => {
    expect(podeGerenciarVencimentos("admin")).toBe(true);
    expect(podeGerenciarVencimentos("assistente")).toBe(true);
    expect(podeGerenciarVencimentos("contador")).toBe(true);
  });
  it("nega financeiro e indefinido", () => {
    expect(podeGerenciarVencimentos("financeiro")).toBe(false);
    expect(podeGerenciarVencimentos(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- src/tests/clientes/permissoes.test.ts`
Expected: FAIL — `podeGerenciarVencimentos` não existe.

- [ ] **Step 3: Implementar**

Ao final de `src/lib/clientes/permissoes.ts`:

```ts
// Quem vê/gerencia certificados e procurações: quem gerencia o cadastro do cliente.
// O financeiro fica de fora — não é dado financeiro (a RLS também o barra).
export function podeGerenciarVencimentos(papel: Papel | undefined): boolean {
  return papel === "admin" || papel === "assistente" || papel === "contador";
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- src/tests/clientes/permissoes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clientes/permissoes.ts src/tests/clientes/permissoes.test.ts
git commit -m "feat: permissao podeGerenciarVencimentos (admin/assistente/contador)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Motor de alerta (puro) + helper de data

**Files:**
- Create: `src/lib/vencimentos/alerta.ts`
- Create: `src/lib/vencimentos/hoje.ts`
- Create: `src/tests/vencimentos/alerta.test.ts`

**Interfaces:**
- Produces:
  - `type Severidade = "vencido" | "critico" | "alerta" | "aviso" | "ok"`
  - `type OrigemVencimento = "certificado" | "procuracao" | "nfse"`
  - `type ItemVencimento = { id: string; origem: OrigemVencimento; clienteId: string | null; clienteNome: string; titulo: string; detalhe: string; validade: string; severidade: Severidade; diasRestantes: number; editavel: boolean }`
  - `type ResumoVencimentos = { vencidos: number; criticos: number; alertas: number; avisos: number }`
  - `classificarVencimento(validade: string, hoje: string): { severidade: Severidade; diasRestantes: number }`
  - `ordemSeveridade(s: Severidade): number`
  - `montarPainel(itens: ItemVencimento[]): { resumo: ResumoVencimentos; itens: ItemVencimento[] }`
  - `hojeEmSaoPaulo(): string` (de `hoje.ts`)

- [ ] **Step 1: Escrever o teste que falha**

Arquivo `src/tests/vencimentos/alerta.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  classificarVencimento,
  ordemSeveridade,
  montarPainel,
  type ItemVencimento,
} from "@/lib/vencimentos/alerta";

const HOJE = "2026-07-09";

// Fronteiras: é exatamente aqui que este tipo de classificador erra.
describe("classificarVencimento — fronteiras", () => {
  const casos: [string, number, string][] = [
    ["2026-09-08", 61, "ok"],
    ["2026-09-07", 60, "aviso"],
    ["2026-08-09", 31, "aviso"],
    ["2026-08-08", 30, "alerta"],
    ["2026-07-25", 16, "alerta"],
    ["2026-07-24", 15, "critico"],
    ["2026-07-09", 0, "critico"],
    ["2026-07-08", -1, "vencido"],
  ];
  for (const [validade, dias, severidade] of casos) {
    it(`${validade} (${dias} dias) => ${severidade}`, () => {
      const r = classificarVencimento(validade, HOJE);
      expect(r.diasRestantes).toBe(dias);
      expect(r.severidade).toBe(severidade);
    });
  }
  it("data inválida não quebra: cai em ok", () => {
    expect(classificarVencimento("nao-e-data", HOJE).severidade).toBe("ok");
  });
});

describe("ordemSeveridade", () => {
  it("ordena do mais grave ao menos grave", () => {
    const ordenado = (["aviso", "vencido", "ok", "critico", "alerta"] as const)
      .slice()
      .sort((a, b) => ordemSeveridade(a) - ordemSeveridade(b));
    expect(ordenado).toEqual(["vencido", "critico", "alerta", "aviso", "ok"]);
  });
});

function item(p: Partial<ItemVencimento>): ItemVencimento {
  return {
    id: "1",
    origem: "certificado",
    clienteId: "c1",
    clienteNome: "Cliente",
    titulo: "A1",
    detalhe: "",
    validade: "2026-07-20",
    severidade: "critico",
    diasRestantes: 11,
    editavel: true,
    ...p,
  };
}

describe("montarPainel", () => {
  it("descarta os ok, conta os quatro cartões e ordena por severidade", () => {
    const itens = [
      item({ id: "a", severidade: "aviso", validade: "2026-09-01" }),
      item({ id: "b", severidade: "ok", validade: "2026-12-01" }),
      item({ id: "c", severidade: "vencido", validade: "2026-07-01" }),
      item({ id: "d", severidade: "alerta", validade: "2026-08-01" }),
      item({ id: "e", severidade: "critico", validade: "2026-07-15" }),
    ];
    const { resumo, itens: saida } = montarPainel(itens);
    expect(resumo).toEqual({ vencidos: 1, criticos: 1, alertas: 1, avisos: 1 });
    expect(saida.map((i) => i.id)).toEqual(["c", "e", "d", "a"]);
  });
  it("empate de severidade desempata pela validade mais próxima", () => {
    const itens = [
      item({ id: "tarde", severidade: "critico", validade: "2026-07-20" }),
      item({ id: "cedo", severidade: "critico", validade: "2026-07-11" }),
    ];
    expect(montarPainel(itens).itens.map((i) => i.id)).toEqual(["cedo", "tarde"]);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- src/tests/vencimentos/alerta.test.ts`
Expected: FAIL — módulo `@/lib/vencimentos/alerta` não existe.

- [ ] **Step 3: Implementar o motor puro**

Arquivo `src/lib/vencimentos/alerta.ts`:

```ts
// Motor de alerta de vencimentos. Puro e determinístico: recebe "hoje" como argumento
// (o relógio vive em hoje.ts) para ser testável e para não violar react-hooks/purity.

export type Severidade = "vencido" | "critico" | "alerta" | "aviso" | "ok";
export type OrigemVencimento = "certificado" | "procuracao" | "nfse";

export type ItemVencimento = {
  id: string;
  origem: OrigemVencimento;
  clienteId: string | null; // null = certificado do escritório
  clienteNome: string;
  titulo: string;
  detalhe: string;
  validade: string; // YYYY-MM-DD
  severidade: Severidade;
  diasRestantes: number;
  editavel: boolean; // false nas linhas vindas da NFS-e
};

export type ResumoVencimentos = { vencidos: number; criticos: number; alertas: number; avisos: number };

// Marcos 60/30/15. Data inválida cai em "ok" (não vira linha fantasma no painel).
export function classificarVencimento(
  validade: string,
  hoje: string,
): { severidade: Severidade; diasRestantes: number } {
  const v = Date.parse(`${validade}T00:00:00Z`);
  const h = Date.parse(`${hoje}T00:00:00Z`);
  if (Number.isNaN(v) || Number.isNaN(h)) return { severidade: "ok", diasRestantes: 0 };
  const dias = Math.round((v - h) / 86_400_000);
  if (dias < 0) return { severidade: "vencido", diasRestantes: dias };
  if (dias <= 15) return { severidade: "critico", diasRestantes: dias };
  if (dias <= 30) return { severidade: "alerta", diasRestantes: dias };
  if (dias <= 60) return { severidade: "aviso", diasRestantes: dias };
  return { severidade: "ok", diasRestantes: dias };
}

const ORDEM: Record<Severidade, number> = { vencido: 0, critico: 1, alerta: 2, aviso: 3, ok: 4 };
export function ordemSeveridade(s: Severidade): number {
  return ORDEM[s];
}

// Descarta os "ok", ordena (mais grave primeiro; empate = validade mais próxima) e conta.
export function montarPainel(itens: ItemVencimento[]): {
  resumo: ResumoVencimentos;
  itens: ItemVencimento[];
} {
  const relevantes = itens.filter((i) => i.severidade !== "ok");
  const resumo: ResumoVencimentos = { vencidos: 0, criticos: 0, alertas: 0, avisos: 0 };
  for (const i of relevantes) {
    if (i.severidade === "vencido") resumo.vencidos++;
    else if (i.severidade === "critico") resumo.criticos++;
    else if (i.severidade === "alerta") resumo.alertas++;
    else if (i.severidade === "aviso") resumo.avisos++;
  }
  relevantes.sort(
    (a, b) =>
      ordemSeveridade(a.severidade) - ordemSeveridade(b.severidade) ||
      a.validade.localeCompare(b.validade),
  );
  return { resumo, itens: relevantes };
}
```

- [ ] **Step 4: Implementar o helper de data**

Arquivo `src/lib/vencimentos/hoje.ts`:

```ts
// Isolado do módulo puro: usa o relógio. Fora de componente, portanto não dispara
// a regra react-hooks/purity (que barra Date.now()/new Date() no render).
export function hojeEmSaoPaulo(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `npm test -- src/tests/vencimentos/alerta.test.ts`
Expected: PASS (12 testes).

- [ ] **Step 6: Escrever o teste da união (falhando)**

A união das três fontes precisa ser **pura** para ser testável — se ficar dentro da server action, só
dá para testá-la com mock do Supabase. Arquivo `src/tests/vencimentos/montar.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { montarItens } from "@/lib/vencimentos/montar";

const HOJE = "2026-07-09";

describe("montarItens", () => {
  const itens = montarItens(
    {
      certificados: [
        { id: "c1", tipo: "A1", titular: "Fulano", validade: "2026-07-20", clienteId: "x", clienteNome: "ACME" },
      ],
      procuracoes: [
        { id: "p1", orgao: "e-CAC", outorgante: "Fulano", validade: "2026-08-01", clienteId: "x", clienteNome: "ACME" },
      ],
      nfse: [
        { clienteId: "x", validade: "2026-07-30", origem: "nfse_cliente", clienteNome: "ACME" },
        { clienteId: null, validade: "2026-07-31", origem: "nfse_escritorio", clienteNome: "Escritório" },
      ],
    },
    HOJE,
  );

  it("marca editavel: false SOMENTE nas linhas da NFS-e", () => {
    const naoEditaveis = itens.filter((i) => !i.editavel).map((i) => i.origem);
    expect(naoEditaveis).toEqual(["nfse", "nfse"]);
    expect(itens.filter((i) => i.editavel).every((i) => i.origem !== "nfse")).toBe(true);
  });

  it("classifica a severidade de cada linha pela validade", () => {
    expect(itens.find((i) => i.id === "c1")?.severidade).toBe("critico"); // 11 dias
    expect(itens.find((i) => i.id === "p1")?.severidade).toBe("alerta"); // 23 dias
  });

  it("o certificado do escritório vem sem cliente e rotulado", () => {
    const esc = itens.find((i) => i.clienteId === null);
    expect(esc?.clienteNome).toBe("Escritório");
    expect(esc?.titulo).toBe("Certificado A1 (NFS-e)");
  });
});
```

- [ ] **Step 7: Rodar o teste e ver falhar**

Run: `npm test -- src/tests/vencimentos/montar.test.ts`
Expected: FAIL — módulo `@/lib/vencimentos/montar` não existe.

- [ ] **Step 8: Implementar a união pura**

Arquivo `src/lib/vencimentos/montar.ts`:

```ts
// União pura das três fontes de vencimento. A server action faz o IO e a resolução
// dos nomes; aqui só há transformação — o que torna a regra de `editavel` testável.
import { classificarVencimento, type ItemVencimento } from "./alerta";

export type LinhaCertificado = {
  id: string;
  tipo: string;
  titular: string;
  validade: string;
  clienteId: string;
  clienteNome: string;
};
export type LinhaProcuracao = {
  id: string;
  orgao: string;
  outorgante: string;
  validade: string;
  clienteId: string;
  clienteNome: string;
};
export type LinhaNfse = {
  clienteId: string | null;
  validade: string; // já em YYYY-MM-DD
  origem: string; // nfse_cliente | nfse_escritorio
  clienteNome: string;
};

export function montarItens(
  entrada: { certificados: LinhaCertificado[]; procuracoes: LinhaProcuracao[]; nfse: LinhaNfse[] },
  hoje: string,
): ItemVencimento[] {
  const itens: ItemVencimento[] = [];

  for (const c of entrada.certificados) {
    const { severidade, diasRestantes } = classificarVencimento(c.validade, hoje);
    itens.push({
      id: c.id,
      origem: "certificado",
      clienteId: c.clienteId,
      clienteNome: c.clienteNome,
      titulo: `Certificado ${c.tipo}`,
      detalhe: c.titular,
      validade: c.validade,
      severidade,
      diasRestantes,
      editavel: true,
    });
  }

  for (const p of entrada.procuracoes) {
    const { severidade, diasRestantes } = classificarVencimento(p.validade, hoje);
    itens.push({
      id: p.id,
      origem: "procuracao",
      clienteId: p.clienteId,
      clienteNome: p.clienteNome,
      titulo: `Procuração — ${p.orgao}`,
      detalhe: p.outorgante,
      validade: p.validade,
      severidade,
      diasRestantes,
      editavel: true,
    });
  }

  // Vindas da NFS-e: nunca editáveis aqui — renovar o A1 é na tela da NFS-e.
  for (const n of entrada.nfse) {
    const { severidade, diasRestantes } = classificarVencimento(n.validade, hoje);
    itens.push({
      id: `nfse:${n.clienteId ?? "escritorio"}`,
      origem: "nfse",
      clienteId: n.clienteId,
      clienteNome: n.clienteNome,
      titulo: "Certificado A1 (NFS-e)",
      detalhe: n.origem === "nfse_escritorio" ? "Emissão de honorários" : "Emissão do cliente",
      validade: n.validade,
      severidade,
      diasRestantes,
      editavel: false,
    });
  }

  return itens;
}
```

- [ ] **Step 9: Rodar os dois testes e ver passar**

Run: `npm test -- src/tests/vencimentos/`
Expected: PASS (alerta + montar).

- [ ] **Step 10: Commit**

```bash
git add src/lib/vencimentos src/tests/vencimentos
git commit -m "feat: motor de alerta (60/30/15) e união pura das fontes de vencimento

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Actions de leitura (painel, badge e CSV)

**Files:**
- Create: `src/app/(app)/vencimentos/actions.ts`

**Interfaces:**
- Consumes: `montarPainel`, `ItemVencimento`, `ResumoVencimentos` (Task 3); `montarItens` (Task 3); `hojeEmSaoPaulo` (Task 3); `podeGerenciarVencimentos` (Task 2); `paraCSV` de `@/lib/financeiro/csv`.
- Produces:
  - `listarVencimentos(): Promise<{ resumo: ResumoVencimentos; itens: ItemVencimento[] }>`
  - `contarVencimentos(): Promise<number>` (vencidos + críticos, para o badge)
  - `csvVencimentos(): Promise<{ erro?: string; csv?: string }>`

A action faz **só o IO e a resolução dos nomes**; a transformação vive em `montarItens` (puro, testado
na Task 3).

- [ ] **Step 1: Criar o arquivo**

Arquivo `src/app/(app)/vencimentos/actions.ts`:

```ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarVencimentos } from "@/lib/clientes/permissoes";
import { paraCSV } from "@/lib/financeiro/csv";
import { hojeEmSaoPaulo } from "@/lib/vencimentos/hoje";
import { montarPainel, type ItemVencimento, type ResumoVencimentos, type Severidade } from "@/lib/vencimentos/alerta";
import { montarItens } from "@/lib/vencimentos/montar";

const VAZIO: { resumo: ResumoVencimentos; itens: ItemVencimento[] } = {
  resumo: { vencidos: 0, criticos: 0, alertas: 0, avisos: 0 },
  itens: [],
};

// O embed do PostgREST vem como objeto ou array de um elemento, conforme a cardinalidade.
function nomeDe(c: unknown): string {
  const cl = Array.isArray(c) ? c[0] : c;
  return (cl as { razao_social?: string } | null)?.razao_social ?? "—";
}

// Une as três fontes: registros próprios (editáveis) + validade do A1 da NFS-e (só leitura).
// Clientes inativos ou excluídos ficam de fora — certificado de quem saiu não é problema de ninguém.
export async function listarVencimentos(): Promise<{ resumo: ResumoVencimentos; itens: ItemVencimento[] }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeGerenciarVencimentos(perfil.papel)) return VAZIO;
  const supabase = await createServerSupabase();
  const hoje = hojeEmSaoPaulo();

  const [certs, procs, nfse] = await Promise.all([
    supabase
      .from("certificado_digital")
      .select("id, tipo, titular, validade, cliente_id, clientes!inner(razao_social, status, excluido_em)")
      .eq("ativo", true)
      .eq("clientes.status", "ativo")
      .is("clientes.excluido_em", null),
    supabase
      .from("procuracao")
      .select("id, orgao, outorgante, validade, cliente_id, clientes!inner(razao_social, status, excluido_em)")
      .eq("ativo", true)
      .eq("clientes.status", "ativo")
      .is("clientes.excluido_em", null),
    supabase.rpc("certificados_nfse_vencimento"),
  ]);

  // A RPC devolve só (cliente_id, validade, origem) — o nome vem de uma consulta à parte,
  // que também filtra clientes inativos/excluídos.
  const linhasNfse = (nfse.data ?? []) as { cliente_id: string | null; validade: string; origem: string }[];
  const ids = linhasNfse.map((l) => l.cliente_id).filter((v): v is string => Boolean(v));
  const nomes = new Map<string, string>();
  if (ids.length) {
    const { data: cls } = await supabase
      .from("clientes")
      .select("id, razao_social")
      .in("id", ids)
      .eq("status", "ativo")
      .is("excluido_em", null);
    for (const cl of cls ?? []) nomes.set(cl.id, cl.razao_social);
  }

  const itens = montarItens(
    {
      certificados: (certs.data ?? []).map((c) => ({
        id: c.id,
        tipo: c.tipo,
        titular: c.titular,
        validade: c.validade,
        clienteId: c.cliente_id,
        clienteNome: nomeDe(c.clientes),
      })),
      procuracoes: (procs.data ?? []).map((p) => ({
        id: p.id,
        orgao: p.orgao,
        outorgante: p.outorgante,
        validade: p.validade,
        clienteId: p.cliente_id,
        clienteNome: nomeDe(p.clientes),
      })),
      nfse: linhasNfse
        .filter((l) => !l.cliente_id || nomes.has(l.cliente_id)) // some se o cliente saiu
        .map((l) => ({
          clienteId: l.cliente_id,
          validade: String(l.validade).slice(0, 10), // timestamptz -> YYYY-MM-DD
          origem: l.origem,
          clienteNome: l.cliente_id ? (nomes.get(l.cliente_id) ?? "—") : "Escritório",
        })),
    },
    hoje,
  );

  return montarPainel(itens);
}

// Badge do menu: só o que exige ação imediata.
export async function contarVencimentos(): Promise<number> {
  const { resumo } = await listarVencimentos();
  return resumo.vencidos + resumo.criticos;
}

const ROTULO: Record<Severidade, string> = {
  vencido: "Vencido",
  critico: "Crítico",
  alerta: "Alerta",
  aviso: "Aviso",
  ok: "Ok",
};

export async function csvVencimentos(): Promise<{ erro?: string; csv?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeGerenciarVencimentos(perfil.papel)) return { erro: "Sem permissão." };
  const { itens } = await listarVencimentos();
  const csv = paraCSV(
    ["Cliente", "Item", "Detalhe", "Validade", "Dias restantes", "Situação"],
    itens.map((i) => [
      i.clienteNome,
      i.titulo,
      i.detalhe,
      i.validade,
      String(i.diasRestantes),
      ROTULO[i.severidade],
    ]),
  );
  return { csv };
}
```

- [ ] **Step 2: Verificar lint/typecheck**

Run: `npm run lint && npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/vencimentos/actions.ts"
git commit -m "feat: leitura do painel de vencimentos (une registros + A1 da NFS-e)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Actions de escrita (salvar, renovar, desativar)

**Files:**
- Create: `src/app/(app)/vencimentos/crud-actions.ts`

**Interfaces:**
- Consumes: `podeGerenciarVencimentos` (Task 2).
- Produces:
  - `type EstadoVenc = { erro?: string; ok?: boolean }`
  - `salvarCertificado(clienteId: string, _prev: EstadoVenc, formData: FormData): Promise<EstadoVenc>`
  - `salvarProcuracao(clienteId: string, _prev: EstadoVenc, formData: FormData): Promise<EstadoVenc>`
  - `desativarCertificado(id: string, clienteId: string): Promise<EstadoVenc>`
  - `desativarProcuracao(id: string, clienteId: string): Promise<EstadoVenc>`

Renovar não é uma action própria: o formulário envia o campo oculto `substitui_id`; a action insere o
novo registro e desativa o antigo. Um certificado renovado **é** outro certificado.

- [ ] **Step 1: Criar o arquivo**

Arquivo `src/app/(app)/vencimentos/crud-actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarVencimentos } from "@/lib/clientes/permissoes";

export type EstadoVenc = { erro?: string; ok?: boolean };

async function permitido(): Promise<boolean> {
  const perfil = await getPerfilAtual();
  return Boolean(perfil?.ativo && podeGerenciarVencimentos(perfil.papel));
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function texto(fd: FormData, chave: string, max = 160): string {
  return String(fd.get(chave) ?? "").trim().slice(0, max);
}

// Insere o novo registro e, se for renovação, desativa o antigo.
async function gravar(
  tabela: "certificado_digital" | "procuracao",
  clienteId: string,
  linha: Record<string, unknown>,
  substituiId: string,
): Promise<EstadoVenc> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from(tabela).insert({ cliente_id: clienteId, ...linha });
  if (error) {
    console.error(`salvar ${tabela}:`, error.code, error.message);
    return { erro: "Não foi possível salvar (sem permissão?)." };
  }
  if (substituiId) {
    await supabase.from(tabela).update({ ativo: false }).eq("id", substituiId).eq("cliente_id", clienteId);
  }
  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/vencimentos");
  return { ok: true };
}

export async function salvarCertificado(
  clienteId: string,
  _prev: EstadoVenc,
  formData: FormData,
): Promise<EstadoVenc> {
  if (!(await permitido())) return { erro: "Sem permissão." };
  const tipo = texto(formData, "tipo", 2);
  if (tipo !== "A1" && tipo !== "A3") return { erro: "Tipo deve ser A1 ou A3." };
  const titular = texto(formData, "titular");
  if (!titular) return { erro: "Informe o titular." };
  const validade = texto(formData, "validade", 10);
  if (!DATA.test(validade)) return { erro: "Informe a validade." };
  const emissao = texto(formData, "emissao", 10);
  if (emissao && !DATA.test(emissao)) return { erro: "Data de emissão inválida." };
  if (emissao && emissao > validade) return { erro: "A emissão não pode ser depois da validade." };

  return gravar(
    "certificado_digital",
    clienteId,
    {
      tipo,
      titular,
      documento_titular: texto(formData, "documento_titular", 20) || null,
      emissao: emissao || null,
      validade,
      observacao: texto(formData, "observacao", 500) || null,
    },
    texto(formData, "substitui_id", 40),
  );
}

export async function salvarProcuracao(
  clienteId: string,
  _prev: EstadoVenc,
  formData: FormData,
): Promise<EstadoVenc> {
  if (!(await permitido())) return { erro: "Sem permissão." };
  const orgao = texto(formData, "orgao");
  if (!orgao) return { erro: "Informe o órgão." };
  const outorgante = texto(formData, "outorgante");
  if (!outorgante) return { erro: "Informe o outorgante." };
  const validade = texto(formData, "validade", 10);
  if (!DATA.test(validade)) return { erro: "Informe a validade." };
  const inicio = texto(formData, "inicio", 10);
  if (inicio && !DATA.test(inicio)) return { erro: "Data de início inválida." };
  if (inicio && inicio > validade) return { erro: "O início não pode ser depois da validade." };

  return gravar(
    "procuracao",
    clienteId,
    {
      orgao,
      outorgante,
      outorgado: texto(formData, "outorgado") || null,
      inicio: inicio || null,
      validade,
      observacao: texto(formData, "observacao", 500) || null,
    },
    texto(formData, "substitui_id", 40),
  );
}

async function desativar(
  tabela: "certificado_digital" | "procuracao",
  id: string,
  clienteId: string,
): Promise<EstadoVenc> {
  if (!(await permitido())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from(tabela)
    .update({ ativo: false })
    .eq("id", id)
    .eq("ativo", true)
    .select("id");
  if (error) return { erro: "Não foi possível desativar." };
  if (!data || data.length === 0) return { erro: "Registro não encontrado ou já inativo." };
  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/vencimentos");
  return { ok: true };
}

export async function desativarCertificado(id: string, clienteId: string): Promise<EstadoVenc> {
  return desativar("certificado_digital", id, clienteId);
}
export async function desativarProcuracao(id: string, clienteId: string): Promise<EstadoVenc> {
  return desativar("procuracao", id, clienteId);
}
```

- [ ] **Step 2: Verificar lint/typecheck**

Run: `npm run lint && npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/vencimentos/crud-actions.ts"
git commit -m "feat: CRUD de certificados e procurações (renovar arquiva o anterior)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Seção na ficha do cliente

**Files:**
- Create: `src/components/vencimentos/FormCertificado.tsx`
- Create: `src/components/vencimentos/FormProcuracao.tsx`
- Create: `src/components/vencimentos/VencimentosSection.tsx`
- Modify: `src/app/(app)/clientes/[id]/page.tsx`

**Interfaces:**
- Consumes: `salvarCertificado`, `salvarProcuracao`, `desativarCertificado`, `desativarProcuracao`, `EstadoVenc` (Task 5); `classificarVencimento`, `Severidade` (Task 3); `hojeEmSaoPaulo` (Task 3); `podeGerenciarVencimentos` (Task 2).
- Produces: `<VencimentosSection clienteId={string} papel={Papel} />`.

- [ ] **Step 1: Criar `FormCertificado.tsx`**

```tsx
"use client";
import { useActionState, useState } from "react";
import { salvarCertificado, type EstadoVenc } from "@/app/(app)/vencimentos/crud-actions";

const input = "rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto";

export function FormCertificado({ clienteId, substituiId }: { clienteId: string; substituiId?: string }) {
  const [estado, action, pend] = useActionState<EstadoVenc, FormData>(
    salvarCertificado.bind(null, clienteId),
    {},
  );
  const [aberto, setAberto] = useState(false);

  if (estado.ok) return <span className="text-xs text-verde">Certificado salvo ✓</span>;
  if (!aberto)
    return (
      <button onClick={() => setAberto(true)} className="rounded-lg border border-linha px-2 py-1 text-xs">
        {substituiId ? "Renovar" : "+ Certificado"}
      </button>
    );

  return (
    <form action={action} className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-linha p-3 text-sm">
      {substituiId && <input type="hidden" name="substitui_id" value={substituiId} />}
      <label className="block">
        Tipo
        <select name="tipo" defaultValue="A1" className={`mt-1 w-full ${input}`}>
          <option value="A1">A1</option>
          <option value="A3">A3</option>
        </select>
      </label>
      <label className="block">
        Titular
        <input name="titular" required className={`mt-1 w-full ${input}`} />
      </label>
      <label className="block">
        CNPJ/CPF do titular
        <input name="documento_titular" className={`mt-1 w-full ${input}`} />
      </label>
      <label className="block">
        Emissão
        <input type="date" name="emissao" className={`mt-1 w-full ${input}`} />
      </label>
      <label className="block">
        Validade
        <input type="date" name="validade" required className={`mt-1 w-full ${input}`} />
      </label>
      <label className="col-span-2 block">
        Observação
        <input name="observacao" className={`mt-1 w-full ${input}`} />
      </label>
      {estado.erro && (
        <p role="alert" className="col-span-2 text-xs text-negativo">
          {estado.erro}
        </p>
      )}
      <div className="col-span-2 flex gap-2">
        <button disabled={pend} className="rounded-lg bg-verde px-3 py-1 text-white disabled:opacity-60">
          {pend ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-linha px-3 py-1">
          Cancelar
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Criar `FormProcuracao.tsx`**

```tsx
"use client";
import { useActionState, useState } from "react";
import { salvarProcuracao, type EstadoVenc } from "@/app/(app)/vencimentos/crud-actions";

const input = "rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto";

export function FormProcuracao({ clienteId, substituiId }: { clienteId: string; substituiId?: string }) {
  const [estado, action, pend] = useActionState<EstadoVenc, FormData>(
    salvarProcuracao.bind(null, clienteId),
    {},
  );
  const [aberto, setAberto] = useState(false);

  if (estado.ok) return <span className="text-xs text-verde">Procuração salva ✓</span>;
  if (!aberto)
    return (
      <button onClick={() => setAberto(true)} className="rounded-lg border border-linha px-2 py-1 text-xs">
        {substituiId ? "Renovar" : "+ Procuração"}
      </button>
    );

  return (
    <form action={action} className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-linha p-3 text-sm">
      {substituiId && <input type="hidden" name="substitui_id" value={substituiId} />}
      <label className="block">
        Órgão
        <input name="orgao" required placeholder="e-CAC, prefeitura, INSS…" className={`mt-1 w-full ${input}`} />
      </label>
      <label className="block">
        Outorgante
        <input name="outorgante" required className={`mt-1 w-full ${input}`} />
      </label>
      <label className="block">
        Outorgado
        <input name="outorgado" className={`mt-1 w-full ${input}`} />
      </label>
      <label className="block">
        Início
        <input type="date" name="inicio" className={`mt-1 w-full ${input}`} />
      </label>
      <label className="block">
        Validade
        <input type="date" name="validade" required className={`mt-1 w-full ${input}`} />
      </label>
      <label className="col-span-2 block">
        Observação
        <input name="observacao" className={`mt-1 w-full ${input}`} />
      </label>
      {estado.erro && (
        <p role="alert" className="col-span-2 text-xs text-negativo">
          {estado.erro}
        </p>
      )}
      <div className="col-span-2 flex gap-2">
        <button disabled={pend} className="rounded-lg bg-verde px-3 py-1 text-white disabled:opacity-60">
          {pend ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-linha px-3 py-1">
          Cancelar
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Criar `BotaoDesativar.tsx`**

Arquivo `src/components/vencimentos/BotaoDesativar.tsx`. Confirmação **inline** — nada de
`window.confirm`, que trava a automação de browser (regra já adotada na exclusão de clientes).

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { desativarCertificado, desativarProcuracao } from "@/app/(app)/vencimentos/crud-actions";

export function BotaoDesativar({
  id,
  clienteId,
  tipo,
}: {
  id: string;
  clienteId: string;
  tipo: "certificado" | "procuracao";
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();

  if (!confirmando)
    return (
      <button onClick={() => setConfirmando(true)} className="rounded-lg border border-linha px-2 py-1 text-xs text-cinza">
        Desativar
      </button>
    );

  return (
    <span className="flex items-center gap-1 text-xs">
      <button
        disabled={pend}
        onClick={() =>
          start(async () => {
            setErro(null);
            const r =
              tipo === "certificado"
                ? await desativarCertificado(id, clienteId)
                : await desativarProcuracao(id, clienteId);
            if (r.erro) setErro(r.erro);
            else router.refresh();
          })
        }
        className="rounded-lg bg-negativo px-2 py-1 text-white disabled:opacity-60"
      >
        {pend ? "…" : "Confirmar"}
      </button>
      <button onClick={() => setConfirmando(false)} className="rounded-lg border border-linha px-2 py-1">
        Voltar
      </button>
      {erro && (
        <span role="alert" className="text-negativo">
          {erro}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Criar `VencimentosSection.tsx` (server component)**

```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarVencimentos } from "@/lib/clientes/permissoes";
import { classificarVencimento, type Severidade } from "@/lib/vencimentos/alerta";
import { hojeEmSaoPaulo } from "@/lib/vencimentos/hoje";
import { formatarData } from "@/lib/format";
import type { Papel } from "@/lib/tipos";
import { FormCertificado } from "./FormCertificado";
import { FormProcuracao } from "./FormProcuracao";
import { BotaoDesativar } from "./BotaoDesativar";

const CLASSE: Record<Severidade, string> = {
  vencido: "bg-negativo text-white",
  critico: "bg-negativo/15 text-negativo",
  alerta: "bg-amber-100 text-amber-800",
  aviso: "bg-slate-100 text-cinza",
  ok: "bg-slate-100 text-cinza",
};
const ROTULO: Record<Severidade, string> = {
  vencido: "Vencido",
  critico: "Crítico",
  alerta: "Alerta",
  aviso: "Aviso",
  ok: "Ok",
};

function Selo({ validade, hoje }: { validade: string; hoje: string }) {
  const { severidade, diasRestantes } = classificarVencimento(validade, hoje);
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${CLASSE[severidade]}`}>
      {ROTULO[severidade]}
      {severidade !== "ok" && ` · ${diasRestantes} d`}
    </span>
  );
}

export async function VencimentosSection({ clienteId, papel }: { clienteId: string; papel: Papel }) {
  if (!podeGerenciarVencimentos(papel)) return null;
  const supabase = await createServerSupabase();
  const hoje = hojeEmSaoPaulo();

  const [{ data: certs }, { data: procs }, { data: nfse }] = await Promise.all([
    supabase
      .from("certificado_digital")
      .select("id, tipo, titular, emissao, validade, ativo")
      .eq("cliente_id", clienteId)
      .order("ativo", { ascending: false })
      .order("validade", { ascending: true }),
    supabase
      .from("procuracao")
      .select("id, orgao, outorgante, outorgado, validade, ativo")
      .eq("cliente_id", clienteId)
      .order("ativo", { ascending: false })
      .order("validade", { ascending: true }),
    supabase.from("nfse_certificado_cliente").select("validade").eq("cliente_id", clienteId).maybeSingle(),
  ]);

  return (
    <section className="max-w-4xl space-y-4 rounded-lg border border-linha bg-white p-4">
      <h2 className="text-sm font-semibold text-texto">Certificados e procurações</h2>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-cinza">Certificados digitais</h3>
          <FormCertificado clienteId={clienteId} />
        </div>
        {nfse?.validade && (
          <div className="flex items-center justify-between rounded border border-linha bg-creme px-2 py-1 text-sm">
            <span className="text-cinza">
              Certificado A1 (NFS-e) — validade {formatarData(nfse.validade)}
            </span>
            <span className="flex items-center gap-2">
              <Selo validade={String(nfse.validade).slice(0, 10)} hoje={hoje} />
              <a href="/configuracoes/nfse" className="text-xs text-verde underline">
                origem: NFS-e
              </a>
            </span>
          </div>
        )}
        {certs?.length ? (
          <ul className="space-y-1 text-sm">
            {certs.map((c) => (
              <li key={c.id} className={`flex items-center justify-between rounded border border-linha px-2 py-1 ${c.ativo ? "" : "opacity-50"}`}>
                <span>
                  {c.tipo} · {c.titular} · vence {formatarData(c.validade)}
                  {!c.ativo && " (inativo)"}
                </span>
                {c.ativo && (
                  <span className="flex items-center gap-2">
                    <Selo validade={c.validade} hoje={hoje} />
                    <FormCertificado clienteId={clienteId} substituiId={c.id} />
                    <BotaoDesativar id={c.id} clienteId={clienteId} tipo="certificado" />
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-cinza">Nenhum certificado cadastrado.</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-cinza">Procurações</h3>
          <FormProcuracao clienteId={clienteId} />
        </div>
        {procs?.length ? (
          <ul className="space-y-1 text-sm">
            {procs.map((p) => (
              <li key={p.id} className={`flex items-center justify-between rounded border border-linha px-2 py-1 ${p.ativo ? "" : "opacity-50"}`}>
                <span>
                  {p.orgao} · {p.outorgante} · vence {formatarData(p.validade)}
                  {!p.ativo && " (inativa)"}
                </span>
                {p.ativo && (
                  <span className="flex items-center gap-2">
                    <Selo validade={p.validade} hoje={hoje} />
                    <FormProcuracao clienteId={clienteId} substituiId={p.id} />
                    <BotaoDesativar id={p.id} clienteId={clienteId} tipo="procuracao" />
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-cinza">Nenhuma procuração cadastrada.</p>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Ligar na ficha do cliente**

Em `src/app/(app)/clientes/[id]/page.tsx`:

1. Adicionar o import junto aos demais componentes:

```tsx
import { VencimentosSection } from "@/components/vencimentos/VencimentosSection";
```

2. Renderizar logo **depois** do bloco `{podeCriarCliente(papel) && (<ObrigacoesCliente ... />)}`:

```tsx
      <VencimentosSection clienteId={id} papel={papel} />
```

- [ ] **Step 6: Verificar lint/typecheck/build**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: sem erros; build compila. (Atenção: se o lint acusar `react-hooks/purity`, é porque algum
`Date.now()`/`new Date()` escapou para dentro de um componente — o `hoje` deve vir de `hojeEmSaoPaulo()`.)

- [ ] **Step 7: Commit**

```bash
git add src/components/vencimentos "src/app/(app)/clientes/[id]/page.tsx"
git commit -m "feat: seção de certificados e procurações na ficha do cliente

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Painel global `/vencimentos` + badge no menu

**Files:**
- Create: `src/app/(app)/vencimentos/page.tsx`
- Create: `src/components/vencimentos/BaixarCsvVencimentos.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `listarVencimentos`, `contarVencimentos`, `csvVencimentos` (Task 4); `podeGerenciarVencimentos` (Task 2).

- [ ] **Step 1: Criar o botão de CSV**

Arquivo `src/components/vencimentos/BaixarCsvVencimentos.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { csvVencimentos } from "@/app/(app)/vencimentos/actions";

export function BaixarCsvVencimentos() {
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();
  return (
    <span className="flex items-center gap-2">
      <button
        disabled={pend}
        onClick={() =>
          start(async () => {
            setErro(null);
            const r = await csvVencimentos();
            if (r.erro || !r.csv) {
              setErro(r.erro ?? "Falha ao gerar o CSV.");
              return;
            }
            const url = URL.createObjectURL(new Blob([r.csv], { type: "text/csv;charset=utf-8" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = "vencimentos.csv";
            a.click();
            URL.revokeObjectURL(url);
          })
        }
        className="rounded-lg border border-linha px-3 py-1 text-sm text-cinza disabled:opacity-60"
      >
        {pend ? "Gerando…" : "Exportar CSV"}
      </button>
      {erro && (
        <span role="alert" className="text-xs text-negativo">
          {erro}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Criar a página**

Arquivo `src/app/(app)/vencimentos/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarVencimentos } from "@/lib/clientes/permissoes";
import { formatarData } from "@/lib/format";
import type { Severidade } from "@/lib/vencimentos/alerta";
import { listarVencimentos } from "./actions";
import { BaixarCsvVencimentos } from "@/components/vencimentos/BaixarCsvVencimentos";

export const metadata = { title: "Vencimentos" };

const CLASSE: Record<Severidade, string> = {
  vencido: "bg-negativo text-white",
  critico: "bg-negativo/15 text-negativo",
  alerta: "bg-amber-100 text-amber-800",
  aviso: "bg-slate-100 text-cinza",
  ok: "bg-slate-100 text-cinza",
};
const ROTULO: Record<Severidade, string> = {
  vencido: "Vencido",
  critico: "Crítico",
  alerta: "Alerta",
  aviso: "Aviso",
  ok: "Ok",
};

export default async function VencimentosPage({
  searchParams,
}: {
  searchParams: Promise<{ sev?: string; origem?: string; q?: string }>;
}) {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo) redirect("/login");
  if (!podeGerenciarVencimentos(perfil.papel)) redirect("/");

  const { sev = "", origem = "", q = "" } = await searchParams;
  // Os cartões sempre refletem o total (o filtro é da tabela, não do resumo).
  const { resumo, itens } = await listarVencimentos();
  const busca = q.trim().toLowerCase().slice(0, 60);
  const visiveis = itens.filter(
    (i) =>
      (!sev || i.severidade === sev) &&
      (!origem || i.origem === origem) &&
      (!busca || i.clienteNome.toLowerCase().includes(busca)),
  );

  const cartoes = [
    { rotulo: "Vencidos", valor: resumo.vencidos },
    { rotulo: "≤ 15 dias", valor: resumo.criticos },
    { rotulo: "≤ 30 dias", valor: resumo.alertas },
    { rotulo: "≤ 60 dias", valor: resumo.avisos },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-texto">Vencimentos</h1>
        <BaixarCsvVencimentos />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cartoes.map((c) => (
          <div key={c.rotulo} className="rounded-lg border border-linha bg-white p-3">
            <p className="text-xs text-cinza">{c.rotulo}</p>
            <p className="text-2xl font-semibold text-texto">{c.valor}</p>
          </div>
        ))}
      </div>

      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar cliente"
          aria-label="Buscar cliente"
          maxLength={60}
          className="rounded-lg border border-linha px-3 py-2 text-sm text-texto"
        />
        <select name="sev" defaultValue={sev} aria-label="Filtrar por situação" className="rounded-lg border border-linha px-2 text-sm text-texto">
          <option value="">Todas as situações</option>
          <option value="vencido">Vencido</option>
          <option value="critico">Crítico (≤ 15)</option>
          <option value="alerta">Alerta (≤ 30)</option>
          <option value="aviso">Aviso (≤ 60)</option>
        </select>
        <select name="origem" defaultValue={origem} aria-label="Filtrar por tipo" className="rounded-lg border border-linha px-2 text-sm text-texto">
          <option value="">Todos os tipos</option>
          <option value="certificado">Certificado</option>
          <option value="procuracao">Procuração</option>
          <option value="nfse">Certificado da NFS-e</option>
        </select>
        <button className="rounded-lg border border-linha px-3 text-sm text-cinza">Filtrar</button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-linha bg-white">
        <table className="w-full text-sm">
          <caption className="sr-only">Certificados e procurações a vencer</caption>
          <thead className="bg-creme text-left text-cinza">
            <tr>
              <th className="p-2 font-medium">Cliente</th>
              <th className="p-2 font-medium">Item</th>
              <th className="p-2 font-medium">Detalhe</th>
              <th className="p-2 font-medium">Validade</th>
              <th className="p-2 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((i) => (
              <tr key={`${i.origem}-${i.id}`} className="border-t border-linha">
                <td className="p-2 text-texto">
                  {i.clienteId ? (
                    <Link href={`/clientes/${i.clienteId}`} className="underline">
                      {i.clienteNome}
                    </Link>
                  ) : (
                    i.clienteNome
                  )}
                </td>
                <td className="p-2 text-cinza">{i.titulo}</td>
                <td className="p-2 text-cinza">{i.detalhe}</td>
                <td className="p-2 text-cinza">{formatarData(i.validade)}</td>
                <td className="p-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${CLASSE[i.severidade]}`}>
                    {ROTULO[i.severidade]} · {i.diasRestantes} d
                  </span>
                </td>
              </tr>
            ))}
            {!visiveis.length && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-cinza">
                  {itens.length ? "Nenhum item para este filtro." : "Nada vencendo nos próximos 60 dias."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Adicionar o item de menu com badge**

Em `src/components/Sidebar.tsx`:

1. Importar a permissão (juntar ao import existente de `@/lib/clientes/permissoes`):

```tsx
import { podeAtender, podeCriarCliente, podeGerenciarVencimentos } from "@/lib/clientes/permissoes";
```

2. Acrescentar `vencimentos` às props:

```tsx
export function Sidebar({ papel, nome, alertasOnboarding = 0, riscosObrigacoes = 0, escalonamento = 0, vencimentos = 0 }: { papel: Papel; nome: string; alertasOnboarding?: number; riscosObrigacoes?: number; escalonamento?: number; vencimentos?: number }) {
```

3. Acrescentar o item logo depois do item de Escalonamento, dentro do array `itens`:

```tsx
    ...(podeGerenciarVencimentos(papel) ? [{ href: "/vencimentos", label: "Vencimentos", badge: vencimentos || undefined }] : []),
```

- [ ] **Step 4: Calcular o badge no layout**

Em `src/app/(app)/layout.tsx`:

1. Imports:

```tsx
import { podeCriarCliente, podeGerenciarVencimentos } from "@/lib/clientes/permissoes";
import { contarVencimentos } from "@/app/(app)/vencimentos/actions";
```

2. Depois de `const escalonamento = ...`:

```tsx
  const vencimentos = podeGerenciarVencimentos(perfil.papel) ? await contarVencimentos() : 0;
```

3. Passar ao `<Sidebar>`:

```tsx
      <Sidebar papel={perfil.papel} nome={perfil.nome} alertasOnboarding={alertasOnboarding} riscosObrigacoes={riscosObrigacoes} escalonamento={escalonamento} vencimentos={vencimentos} />
```

- [ ] **Step 5: Verificar lint/typecheck/testes/build**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: sem erros; build compila.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/vencimentos/page.tsx" src/components/vencimentos/BaixarCsvVencimentos.tsx src/components/Sidebar.tsx "src/app/(app)/layout.tsx"
git commit -m "feat: painel global de vencimentos com badge e exportação CSV

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Testes de RLS

**Files:**
- Modify: `supabase/tests/rls.test.sql`

O arquivo roda numa transação com ROLLBACK; `_simular(uid)` troca role+claims; asserções em blocos
`do $$ ... $$` que lançam `raise exception` na falha. Seeds existentes: admin=`…001`,
assistente=`…002`, contador=`…003`, financeiro=`…004`; clientes `aaaaaaaa-…001` (do contador `…003`) e
`aaaaaaaa-…002` (do admin).

- [ ] **Step 1: Acrescentar o bloco ao final de `supabase/tests/rls.test.sql`**

```sql
-- ===== Vencimentos: financeiro fora; contador escopado; RPC da NFS-e não vaza cliente alheio =====
reset role;
insert into nfse_certificado_cliente (cliente_id, nome_arquivo, validade)
  values ('aaaaaaaa-0000-0000-0000-000000000002', 'teste.pfx', now() + interval '30 days')
  on conflict (cliente_id) do nothing;

do $$
declare n int;
begin
  -- admin cadastra um certificado e uma procuração para o cliente do CONTADOR (…001)
  perform _simular('00000000-0000-0000-0000-000000000001'); -- admin
  insert into certificado_digital (cliente_id, tipo, titular, validade)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'A1', 'Titular Teste', current_date + 10);
  insert into procuracao (cliente_id, orgao, outorgante, validade)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'e-CAC', 'Outorgante Teste', current_date + 40);
  -- e um certificado para o cliente do ADMIN (…002), alheio ao contador
  insert into certificado_digital (cliente_id, tipo, titular, validade)
    values ('aaaaaaaa-0000-0000-0000-000000000002', 'A3', 'Outro Titular', current_date + 5);

  -- financeiro NÃO vê nada (a política já nasce fechada para ele)
  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro
  select count(*) into n from certificado_digital;
  if n <> 0 then raise exception 'FALHA: financeiro viu % certificado_digital (devia ser 0)', n; end if;
  select count(*) into n from procuracao;
  if n <> 0 then raise exception 'FALHA: financeiro viu % procuracao (devia ser 0)', n; end if;
  select count(*) into n from certificados_nfse_vencimento();
  if n <> 0 then raise exception 'FALHA: financeiro obteve linhas da RPC da NFS-e (devia ser 0)'; end if;

  -- contador vê os do SEU cliente…
  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador
  select count(*) into n from certificado_digital where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'FALHA: contador não viu o certificado do seu cliente (viu %)', n; end if;
  select count(*) into n from procuracao where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'FALHA: contador não viu a procuração do seu cliente (viu %)', n; end if;
  -- …e NÃO vê os do cliente alheio
  select count(*) into n from certificado_digital where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'FALHA: contador viu certificado de cliente alheio'; end if;
  -- a RPC (SECURITY DEFINER) também não vaza o certificado NFS-e do cliente alheio
  select count(*) into n from certificados_nfse_vencimento()
    where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'FALHA: RPC da NFS-e vazou cliente alheio ao contador'; end if;

  -- assistente vê os dois clientes
  perform _simular('00000000-0000-0000-0000-000000000002'); -- assistente
  select count(*) into n from certificado_digital
    where cliente_id in ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002');
  if n <> 2 then raise exception 'FALHA: assistente viu % certificados (esperado 2)', n; end if;

  raise notice 'OK: vencimentos — financeiro fora, contador escopado, RPC da NFS-e não vaza';
end $$;
```

- [ ] **Step 2: Rodar os testes de RLS**

Run: `npm run db:test`
Expected: todos os asserts passam, incluindo o novo `OK: vencimentos — …`.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/rls.test.sql
git commit -m "test(rls): vencimentos fechados ao financeiro e escopados por contador

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Documentação

**Files:**
- Modify: `docs/DOCUMENTACAO.md`

- [ ] **Step 1: Acrescentar o módulo à seção 3**

Depois da subseção de Obrigações (3.6), acrescentar (renumerando as seguintes, como já feito antes):

```markdown
### 3.7 Certificados e procurações (vencimentos)
Controle dos certificados digitais e das procurações de cada cliente, com alertas escalonados.

- **Cadastro por cliente:** certificado (tipo A1/A3, titular, documento, emissão, validade) e procuração
  (órgão, outorgante, outorgado, início, validade).
- **Renovar arquiva o anterior:** um certificado renovado é outro certificado; o histórico fica na ficha.
- **Visão única:** o painel lê também a validade do **A1 usado pela NFS-e** (cliente e escritório), sem
  duplicá-la — via função `SECURITY DEFINER` que expõe apenas a data, nunca o certificado cifrado.
- **Alertas in-app:** severidade em 60/30/15 dias e vencido; **badge no menu** com vencidos + críticos;
  painel `/vencimentos` com quatro cartões, tabela e exportação CSV.
- **Acesso:** admin, assistente e contador (escopado aos seus clientes). O **financeiro não acessa** —
  a RLS já nasce fechada para ele.
```

- [ ] **Step 2: Atualizar a matriz RBAC (seção 2) e o "Estado por área" (seção 7)**

Na matriz, acrescentar a linha:

```markdown
| Certificados e procurações | ✔ | ✔ (os seus) | ✔ | — |
```

Em "Concluído e em produção", acrescentar:

```markdown
- **Certificados e procurações** — cadastro por cliente, alertas 60/30/15, painel global com badge e CSV.
```

E remover RF-022/023 de qualquer lista de pendências, se houver.

- [ ] **Step 3: Commit**

```bash
git add docs/DOCUMENTACAO.md
git commit -m "docs: módulo de certificados e procurações (RF-022/023)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verificação final

- [ ] `npm run lint && npm run typecheck && npm test` — tudo verde.
- [ ] `npm run build` — compila.
- [ ] `npm run db:test` — RLS verde, incluindo o assert novo.
- [ ] **Validação manual** (após deploy): cadastrar uma procuração vencendo em **20 dias** → sai como
      `alerta`; alterar para **10 dias** → vira `critico` e entra na contagem do badge. Entrar como
      **financeiro** e confirmar que o item "Vencimentos" **não aparece** no menu.
