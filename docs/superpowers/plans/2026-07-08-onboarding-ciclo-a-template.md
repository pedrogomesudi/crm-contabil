# Onboarding — Motor de template de processo (Ciclo A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir o onboarding para um motor de processo estruturado (blocos, prazos D+n, perfis, condições) que executa o template "onboarding-cliente-existente", instanciando por cliente.

**Architecture:** Novo modelo (template→blocos→itens; processo→itens materializados) + RLS com isolamento por cliente; helpers puros de perfil/condição/prazo/progresso; seed do template em TS via ação; actions de template/processo/global; UI com formulário de instanciação, itens por bloco, lista global e editor. Substitui o código plano do RF-010. Spec: `docs/superpowers/specs/2026-07-08-onboarding-ciclo-a-template-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase (Postgres/RLS), Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail` — o pipe mascara o exit), `npm test`, `npm run build`. Todos passam.
- Migration nova, aplicada por `npm run db:migrate` (NUNCA `supabase db push`). Idempotente. Enums criados inteiros (sem `ALTER TYPE ADD VALUE`).
- RLS: template/blocos/itens → select admin/contador/assistente, write só admin. Processo/itens → admin/contador/assistente **e isolamento por cliente** (`EXISTS` na RLS de `clientes`/`onboarding_processo`). Log → insert admin/contador com `usuario_id = auth.uid()`; select admin.
- Cofre: senha cifrada (`cifrarSenha`/`decifrarSenha` de `@/lib/onboarding/credencial`); nunca retornar `acesso_senha_cifrada` na listagem; revelar só admin/contador + auditoria fail-closed.
- Gates: `podeCriarCliente` (gerenciar processo), `podeRevelarCredencial` (revelar), `podeGerenciarModeloOnboarding` (template/admin).
- Datas puras `YYYY-MM-DD` sem fuso. Tokens SALDO na UI. Branch: `git checkout -b feat/onboarding-template develop`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `supabase/migrations/0050_onboarding_template.sql` — **novo**: drop do plano + tabelas/enums/RLS.
- `src/lib/onboarding/processo.ts` — **novo**: tipos + helpers puros.
- `src/lib/onboarding/template-seed.ts` — **novo**: constante do template padrão.
- `src/app/(app)/onboarding/template-actions.ts` — **novo**: listar/salvar/remover item + semear.
- `src/app/(app)/clientes/[id]/processo.ts` — **novo**: actions por cliente + revelar senha.
- `src/app/(app)/onboarding/processos-actions.ts` — **novo**: lista global.
- `src/app/(app)/onboarding/ListaProcessos.tsx` — **novo**.
- `src/components/onboarding/ProcessoSection.tsx` — **novo**: aba do cliente (form + blocos).
- `src/app/(app)/configuracoes/onboarding/EditorTemplate.tsx` — **novo**.
- **Modificar:** `src/app/(app)/onboarding/page.tsx`, `.../clientes/[id]/page.tsx`, `.../configuracoes/onboarding/page.tsx`.
- **Remover (Task 8):** `OnboardingSection.tsx`, `clientes/[id]/onboarding.ts`, `lib/onboarding/progresso.ts`, `onboarding/actions.ts`, `onboarding/ListaOnboarding.tsx`, `configuracoes/onboarding/EditorModelo.tsx` + testes órfãos.
- Testes novos: `src/tests/onboarding/processo.test.ts`, `src/tests/onboarding/processo-section-render.test.tsx`.

---

## Task 1: Migration — modelo de template + processo

**Files:**
- Create: `supabase/migrations/0050_onboarding_template.sql`

- [ ] **Step 1: Criar a migration** (conteúdo completo do bloco SQL do spec, seção "Dados", + o bloco de RLS abaixo)

Copiar o SQL da seção **Dados** do spec (drops + enums + 6 tabelas + índices + `enable row level security`), e adicionar as políticas:
```sql
do $$ begin
  drop policy if exists onb_template_sel on onboarding_template;
  create policy onb_template_sel on onboarding_template for select to authenticated using (auth_papel() in ('admin','contador','assistente'));
  drop policy if exists onb_template_wr on onboarding_template;
  create policy onb_template_wr on onboarding_template for all to authenticated using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
  drop policy if exists onb_bloco_sel on onboarding_bloco;
  create policy onb_bloco_sel on onboarding_bloco for select to authenticated using (auth_papel() in ('admin','contador','assistente'));
  drop policy if exists onb_bloco_wr on onboarding_bloco;
  create policy onb_bloco_wr on onboarding_bloco for all to authenticated using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
  drop policy if exists onb_titem_sel on onboarding_template_item;
  create policy onb_titem_sel on onboarding_template_item for select to authenticated using (auth_papel() in ('admin','contador','assistente'));
  drop policy if exists onb_titem_wr on onboarding_template_item;
  create policy onb_titem_wr on onboarding_template_item for all to authenticated using (auth_papel() = 'admin') with check (auth_papel() = 'admin');

  drop policy if exists onb_proc_all on onboarding_processo;
  create policy onb_proc_all on onboarding_processo for all to authenticated
    using (auth_papel() in ('admin','contador','assistente') and exists (select 1 from clientes c where c.id = cliente_id))
    with check (auth_papel() in ('admin','contador','assistente') and exists (select 1 from clientes c where c.id = cliente_id));

  drop policy if exists onb_procitem_all on onboarding_processo_item;
  create policy onb_procitem_all on onboarding_processo_item for all to authenticated
    using (auth_papel() in ('admin','contador','assistente') and exists (select 1 from onboarding_processo pr join clientes c on c.id = pr.cliente_id where pr.id = processo_id))
    with check (auth_papel() in ('admin','contador','assistente') and exists (select 1 from onboarding_processo pr join clientes c on c.id = pr.cliente_id where pr.id = processo_id));

  drop policy if exists onb_log_ins on onboarding_log_credencial;
  create policy onb_log_ins on onboarding_log_credencial for insert to authenticated
    with check (auth_papel() in ('admin','contador') and usuario_id = auth.uid()
      and exists (select 1 from onboarding_processo_item pi join onboarding_processo pr on pr.id = pi.processo_id join clientes c on c.id = pr.cliente_id where pi.id = item_id));
  drop policy if exists onb_log_sel on onboarding_log_credencial;
  create policy onb_log_sel on onboarding_log_credencial for select to authenticated using (auth_papel() = 'admin');
end $$;
```

- [ ] **Step 2: Aplicar + verificar**

Run: `npm run db:migrate`
Then:
```bash
node --env-file=.env.local -e "import('./scripts/_db.mjs').then(async({makeClient})=>{const c=makeClient();await c.connect();const t=await c.query(\"select table_name from information_schema.tables where table_name like 'onboarding%' order by table_name\");console.log(t.rows.map(r=>r.table_name));const p=await c.query(\"select count(*) n from pg_policies where tablename like 'onboarding%'\");console.log('policies:',p.rows[0].n);await c.end();});"
```
Expected: tabelas `onboarding_bloco, onboarding_log_credencial, onboarding_processo, onboarding_processo_item, onboarding_template, onboarding_template_item`; `policies: 11`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0050_onboarding_template.sql
git commit -m "feat(onboarding): schema de template/processo + RLS com isolamento por cliente

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Helpers puros (TDD)

**Files:**
- Create: `src/lib/onboarding/processo.ts`
- Test: `src/tests/onboarding/processo.test.ts`

**Interfaces:**
- Produces: tipos `PerfilCliente`, `FlagsProcesso`, `TemplateItem`, `TemplateBloco`, `ProcessoItemSeed`, `StatusItem`; funções `sugerirPerfil`, `somarDias`, `itemAplica`, `materializarProcesso`, `progressoProcesso`.

- [ ] **Step 1: Escrever os testes**

Criar `src/tests/onboarding/processo.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { sugerirPerfil, somarDias, itemAplica, materializarProcesso, progressoProcesso, type TemplateBloco } from "@/lib/onboarding/processo";

describe("sugerirPerfil", () => {
  it("PF / MEI / Simples s-c func / Presumido", () => {
    expect(sugerirPerfil("PF", "Isento/PF", null)).toBe("pf");
    expect(sugerirPerfil("MEI", "MEI", 0)).toBe("mei");
    expect(sugerirPerfil("PJ", "Simples", 0)).toBe("simples_sem_func");
    expect(sugerirPerfil("PJ", "Simples", 3)).toBe("simples_com_func");
    expect(sugerirPerfil("PJ", "Presumido", 5)).toBe("presumido_real");
    expect(sugerirPerfil("PJ", "Real", null)).toBe("presumido_real");
  });
});

describe("somarDias", () => {
  it("soma dias corridos com virada de mês/ano", () => {
    expect(somarDias("2026-07-01", 0)).toBe("2026-07-01");
    expect(somarDias("2026-01-30", 3)).toBe("2026-02-02");
    expect(somarDias("2026-12-30", 5)).toBe("2027-01-04");
  });
});

describe("itemAplica", () => {
  const base = { aplicavelA: ["simples_com_func", "presumido_real"], condicaoFlags: [] as string[], condicaoModo: "all" as const };
  it("perfil na lista / fora / curinga", () => {
    expect(itemAplica(base, "simples_com_func", {})).toBe(true);
    expect(itemAplica(base, "mei", {})).toBe(false);
    expect(itemAplica({ ...base, aplicavelA: ["*"] }, "mei", {})).toBe(true);
  });
  it("condição all / any", () => {
    const all = { aplicavelA: ["*"], condicaoFlags: ["possui_contador_anterior"], condicaoModo: "all" as const };
    expect(itemAplica(all, "mei", { possui_contador_anterior: true })).toBe(true);
    expect(itemAplica(all, "mei", { possui_contador_anterior: false })).toBe(false);
    const any = { aplicavelA: ["*"], condicaoFlags: ["possui_funcionarios", "possui_prolabore"], condicaoModo: "any" as const };
    expect(itemAplica(any, "mei", { possui_prolabore: true })).toBe(true);
    expect(itemAplica(any, "mei", {})).toBe(false);
  });
});

describe("materializarProcesso", () => {
  const blocos: TemplateBloco[] = [
    { ordem: 1, nome: "Formalização", prazoBlocoDias: 3, itens: [
      { codigo: "1.1", titulo: "Contrato", descricao: null, tipo: "padrao", responsavelPapel: "admin", prazoDias: 0, aplicavelA: ["*"], condicaoFlags: [], condicaoModo: "all", bloqueante: true, anexoObrigatorio: true, alertaRisco: null, ordem: 1 },
      { codigo: "1.2", titulo: "Contador anterior", descricao: null, tipo: "padrao", responsavelPapel: "contador", prazoDias: 2, aplicavelA: ["simples_com_func"], condicaoFlags: ["possui_contador_anterior"], condicaoModo: "all", bloqueante: false, anexoObrigatorio: true, alertaRisco: null, ordem: 2 },
    ] },
  ];
  it("filtra por perfil+condição e calcula prazo absoluto", () => {
    const semCont = materializarProcesso(blocos, "simples_com_func", { possui_contador_anterior: false }, "2026-07-01");
    expect(semCont.map((i) => i.codigo)).toEqual(["1.1"]);
    expect(semCont[0]!.prazo).toBe("2026-07-01");
    const comCont = materializarProcesso(blocos, "simples_com_func", { possui_contador_anterior: true }, "2026-07-01");
    expect(comCont.map((i) => i.codigo)).toEqual(["1.1", "1.2"]);
    expect(comCont[1]!.prazo).toBe("2026-07-03");
    expect(comCont[1]!.blocoNome).toBe("Formalização");
  });
});

describe("progressoProcesso", () => {
  it("progresso e próximo prazo", () => {
    const p = progressoProcesso([
      { status: "concluido", prazo: "2026-07-01", bloqueante: true },
      { status: "pendente", prazo: "2026-08-10", bloqueante: true },
      { status: "pendente", prazo: "2026-07-20", bloqueante: false },
    ]);
    expect(p).toMatchObject({ total: 3, concluidos: 1, bloqueantesPendentes: 1, pct: 33, concluido: false, proximoPrazo: "2026-07-20" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- onboarding/processo`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/lib/onboarding/processo.ts`**

```ts
export type PerfilCliente = "mei" | "simples_sem_func" | "simples_com_func" | "presumido_real" | "pf";
export type FlagsProcesso = Record<string, boolean>;
export type StatusItem = "pendente" | "concluido" | "dispensado";
export type TemplateItem = { codigo: string; titulo: string; descricao: string | null; tipo: "padrao" | "acesso"; responsavelPapel: string | null; prazoDias: number | null; aplicavelA: string[]; condicaoFlags: string[]; condicaoModo: "any" | "all"; bloqueante: boolean; anexoObrigatorio: boolean; alertaRisco: string | null; ordem: number };
export type TemplateBloco = { ordem: number; nome: string; prazoBlocoDias: number | null; itens: TemplateItem[] };
export type ProcessoItemSeed = { blocoOrdem: number; blocoNome: string; codigo: string; titulo: string; descricao: string | null; tipo: "padrao" | "acesso"; responsavelPapel: string | null; prazo: string | null; bloqueante: boolean; anexoObrigatorio: boolean; alertaRisco: string | null; ordem: number };

export function sugerirPerfil(tipoPessoa: string, regime: string, qtdFuncionarios: number | null): PerfilCliente {
  if (tipoPessoa === "PF") return "pf";
  if (regime === "MEI") return "mei";
  if (regime === "Simples") return (qtdFuncionarios ?? 0) > 0 ? "simples_com_func" : "simples_sem_func";
  if (regime === "Presumido" || regime === "Real") return "presumido_real";
  return "simples_sem_func";
}

export function somarDias(dataIso: string, n: number): string {
  const base = Date.parse(`${dataIso}T00:00:00Z`);
  return new Date(base + n * 86400000).toISOString().slice(0, 10);
}

export function itemAplica(item: { aplicavelA: string[]; condicaoFlags: string[]; condicaoModo: "any" | "all" }, perfil: PerfilCliente, flags: FlagsProcesso): boolean {
  const perfilOk = item.aplicavelA.includes("*") || item.aplicavelA.includes(perfil);
  if (!perfilOk) return false;
  if (item.condicaoFlags.length === 0) return true;
  return item.condicaoModo === "any"
    ? item.condicaoFlags.some((f) => flags[f] === true)
    : item.condicaoFlags.every((f) => flags[f] === true);
}

export function materializarProcesso(blocos: TemplateBloco[], perfil: PerfilCliente, flags: FlagsProcesso, dataInicio: string): ProcessoItemSeed[] {
  const out: ProcessoItemSeed[] = [];
  for (const b of blocos) {
    for (const i of b.itens) {
      if (!itemAplica(i, perfil, flags)) continue;
      out.push({
        blocoOrdem: b.ordem, blocoNome: b.nome, codigo: i.codigo, titulo: i.titulo, descricao: i.descricao,
        tipo: i.tipo, responsavelPapel: i.responsavelPapel, prazo: i.prazoDias == null ? null : somarDias(dataInicio, i.prazoDias),
        bloqueante: i.bloqueante, anexoObrigatorio: i.anexoObrigatorio, alertaRisco: i.alertaRisco, ordem: i.ordem,
      });
    }
  }
  return out;
}

export function progressoProcesso(itens: { status: StatusItem; prazo: string | null; bloqueante: boolean }[]): { total: number; concluidos: number; bloqueantesPendentes: number; pct: number; concluido: boolean; proximoPrazo: string | null } {
  const total = itens.length;
  const concluidos = itens.filter((i) => i.status === "concluido").length;
  const bloqueantesPendentes = itens.filter((i) => i.bloqueante && i.status === "pendente").length;
  const pct = total === 0 ? 0 : Math.round((concluidos / total) * 100);
  const concluido = total > 0 && itens.every((i) => i.status === "concluido" || i.status === "dispensado");
  const prazos = itens.filter((i) => i.status === "pendente" && i.prazo).map((i) => i.prazo as string).sort();
  return { total, concluidos, bloqueantesPendentes, pct, concluido, proximoPrazo: prazos[0] ?? null };
}
```

- [ ] **Step 4: Rodar e ver passar + verificar**

Run: `npm test -- onboarding/processo` (PASS) e depois `npm run lint` e `npm run typecheck` (sem erros).

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding/processo.ts src/tests/onboarding/processo.test.ts
git commit -m "feat(onboarding): helpers de perfil/condição/prazo/progresso do processo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Seed do template padrão + actions de template

**Files:**
- Create: `src/lib/onboarding/template-seed.ts`
- Create: `src/app/(app)/onboarding/template-actions.ts`

**Interfaces:**
- Consumes: tipos `TemplateBloco`, `TemplateItem` (Task 2); `podeCriarCliente`, `podeGerenciarModeloOnboarding`.
- Produces: `TEMPLATE_PADRAO` (dados); `listarTemplate()`, `salvarTemplateItem(input)`, `removerTemplateItem(id)`, `semearTemplatePadrao()` + tipos `TemplateView`, `BlocoView`, `ItemTemplateView`.

- [ ] **Step 1: Criar `template-seed.ts`** (constante do template do usuário; factory `it` reduz cada item a uma linha)

```ts
import type { TemplateBloco, TemplateItem } from "./processo";

type Opts = Partial<Pick<TemplateItem, "descricao" | "tipo" | "condicaoFlags" | "condicaoModo" | "bloqueante" | "anexoObrigatorio" | "alertaRisco">>;
const PJ = ["mei", "simples_sem_func", "simples_com_func", "presumido_real"];
const COM_FUNC = ["simples_com_func", "presumido_real"];
const NAO_MEI = ["simples_sem_func", "simples_com_func", "presumido_real"];

function it(codigo: string, titulo: string, papel: string | null, prazoDias: number | null, aplicavelA: string[], ordem: number, o: Opts = {}): TemplateItem {
  return { codigo, titulo, descricao: o.descricao ?? null, tipo: o.tipo ?? "padrao", responsavelPapel: papel, prazoDias, aplicavelA, condicaoFlags: o.condicaoFlags ?? [], condicaoModo: o.condicaoModo ?? "all", bloqueante: o.bloqueante ?? false, anexoObrigatorio: o.anexoObrigatorio ?? false, alertaRisco: o.alertaRisco ?? null, ordem };
}

export const TEMPLATE_PADRAO: { slug: string; nome: string; descricao: string; blocos: TemplateBloco[] } = {
  slug: "onboarding-cliente-existente",
  nome: "Onboarding — Cliente já constituído (transferência de contabilidade)",
  descricao: "Entrada de cliente PJ/PF já constituído, com transição do contador anterior.",
  blocos: [
    { ordem: 1, nome: "Formalização da relação", prazoBlocoDias: 3, itens: [
      it("1.1", "Contrato de prestação de serviços contábeis assinado", "admin", 0, ["*"], 1, { bloqueante: true, anexoObrigatorio: true }),
      it("1.2", "Comunicação formal ao contador anterior", "contador", 2, PJ, 2, { condicaoFlags: ["possui_contador_anterior"], anexoObrigatorio: true }),
      it("1.3", "Definição da data de corte (competência inicial)", "contador", 1, ["*"], 3, { bloqueante: true }),
      it("1.4", "Cadastro do cliente no CRM com responsáveis internos", "admin", 1, ["*"], 4, { bloqueante: true }),
    ] },
    { ordem: 2, nome: "Dados cadastrais e societários", prazoBlocoDias: 7, itens: [
      it("2.1", "Cartão CNPJ e consulta de situação cadastral", "assistente", 3, PJ, 1, { anexoObrigatorio: true }),
      it("2.2", "Contrato social consolidado / última alteração", "assistente", 5, PJ, 2, { anexoObrigatorio: true }),
      it("2.3", "Documentos dos sócios / titular", "assistente", 5, ["*"], 3, { anexoObrigatorio: true }),
      it("2.4", "Inscrições, alvará e licenças", "assistente", 7, NAO_MEI, 4, { condicaoFlags: ["atividade_exige_licencas"] }),
      it("2.5", "Verificação de regime tributário e enquadramento", "contador", 7, PJ, 5),
      it("2.6", "Conferência de CNAEs versus atividades exercidas", "contador", 7, PJ, 6),
    ] },
    { ordem: 3, nome: "Acessos, certificados e procurações", prazoBlocoDias: 10, itens: [
      it("3.1", "Certificado digital cadastrado no CRM", "assistente", 5, NAO_MEI, 1, { bloqueante: true }),
      it("3.2", "Procuração eletrônica e-CAC outorgada ao escritório", "assistente", 7, ["mei", "simples_sem_func", "simples_com_func", "presumido_real", "pf"], 2, { bloqueante: true }),
      it("3.3", "Procurações SEFAZ estadual e prefeitura (NFS-e)", "assistente", 10, NAO_MEI, 3),
      it("3.4", "Domicílios tributários eletrônicos verificados", "contador", 10, PJ, 4, { alertaRisco: "Intimação não lida pode ter prazo em curso" }),
      it("3.5", "Acessos registrados no cofre de senhas", "assistente", 10, ["*"], 5, { tipo: "acesso" }),
      it("3.6", "Vínculo eSocial / Conectividade Social", "assistente", 10, COM_FUNC, 6, { condicaoFlags: ["possui_funcionarios", "possui_prolabore"], condicaoModo: "any" }),
    ] },
    { ordem: 4, nome: "Transição do contador anterior", prazoBlocoDias: 20, itens: [
      it("4.1", "Balancete acumulado, razão e diário do exercício corrente", "contador", 15, NAO_MEI, 1, { condicaoFlags: ["possui_contador_anterior"], anexoObrigatorio: true }),
      it("4.2", "Balanço e ECD/ECF dos últimos exercícios", "contador", 15, NAO_MEI, 2, { condicaoFlags: ["possui_contador_anterior"], anexoObrigatorio: true }),
      it("4.3", "SPEDs e declarações do ano corrente com recibos", "contador", 15, NAO_MEI, 3, { condicaoFlags: ["possui_contador_anterior"], anexoObrigatorio: true }),
      it("4.4", "Últimas guias pagas (DAS/DARF/GPS/FGTS)", "assistente", 15, PJ, 4, { anexoObrigatorio: true }),
      it("4.5", "Cadastro completo do departamento pessoal", "contador", 15, COM_FUNC, 5, { condicaoFlags: ["possui_funcionarios"], anexoObrigatorio: true }),
      it("4.6", "Plano de contas e saldos de abertura", "contador", 18, NAO_MEI, 6, { condicaoFlags: ["possui_contador_anterior"], bloqueante: true }),
      it("4.7", "Levantamento de passivos ocultos", "contador", 20, PJ, 7, { alertaRisco: "Pendências pré-existentes devem estar documentadas antes da data de corte", anexoObrigatorio: true }),
      it("4.8", "Termo de recebimento de acervo documental", "contador", 20, NAO_MEI, 8, { condicaoFlags: ["possui_contador_anterior"], anexoObrigatorio: true }),
    ] },
    { ordem: 5, nome: "Operação corrente", prazoBlocoDias: 20, itens: [
      it("5.1", "Extratos bancários e definição do fluxo de envio", "assistente", 10, ["*"], 1),
      it("5.2", "Acesso/integração ao ERP ou emissor de notas do cliente", "contador", 15, NAO_MEI, 2, { condicaoFlags: ["possui_erp"] }),
      it("5.3", "Levantamento do volume operacional", "contador", 15, NAO_MEI, 3),
      it("5.4", "Mapeamento de particularidades fiscais", "contador", 20, COM_FUNC, 4, { condicaoFlags: ["complexidade_alta"] }),
    ] },
    { ordem: 6, nome: "Parametrização interna", prazoBlocoDias: 25, itens: [
      it("6.1", "Cliente configurado no software contábil", "contador", 22, NAO_MEI, 1, { bloqueante: true }),
      it("6.2", "Matriz de obrigações ativada e calendário gerado", "contador", 22, ["*"], 2, { bloqueante: true }),
      it("6.3", "Contrato de honorários lançado no financeiro", "financeiro", 5, ["*"], 3, { bloqueante: true }),
      it("6.4", "Portal do cliente criado e testado", "assistente", 22, ["*"], 4),
    ] },
    { ordem: 7, nome: "Kickoff e comunicação", prazoBlocoDias: 30, itens: [
      it("7.1", "Reunião de boas-vindas realizada", "contador", 25, ["*"], 1),
      it("7.2", "Rotina mensal comunicada por escrito", "assistente", 25, ["*"], 2),
      it("7.3", "Pesquisa de expectativa inicial", "assistente", 30, ["*"], 3),
      it("7.4", "Encerramento do onboarding e revisão interna", "contador", 30, ["*"], 4, { bloqueante: true }),
    ] },
  ],
};
```

- [ ] **Step 2: Criar `template-actions.ts`**

```ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente, podeGerenciarModeloOnboarding } from "@/lib/clientes/permissoes";
import { TEMPLATE_PADRAO } from "@/lib/onboarding/template-seed";

export type ItemTemplateView = { id: string; blocoId: string; codigo: string; titulo: string; descricao: string | null; tipo: "padrao" | "acesso"; responsavelPapel: string | null; prazoDias: number | null; aplicavelA: string[]; condicaoFlags: string[]; condicaoModo: "any" | "all"; bloqueante: boolean; anexoObrigatorio: boolean; alertaRisco: string | null; ordem: number };
export type BlocoView = { id: string; ordem: number; nome: string; prazoBlocoDias: number | null; itens: ItemTemplateView[] };
export type TemplateView = { id: string; slug: string; nome: string; blocos: BlocoView[] } | null;

export async function listarTemplate(): Promise<TemplateView> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return null;
  const supabase = await createServerSupabase();
  const { data: tpl } = await supabase.from("onboarding_template").select("id, slug, nome").eq("ativo", true).order("criado_em").limit(1).maybeSingle();
  if (!tpl) return null;
  const { data: blocos } = await supabase.from("onboarding_bloco").select("id, ordem, nome, prazo_bloco_dias").eq("template_id", tpl.id).order("ordem");
  const { data: itens } = await supabase.from("onboarding_template_item").select("id, bloco_id, codigo, titulo, descricao, tipo, responsavel_papel, prazo_dias, aplicavel_a, condicao_flags, condicao_modo, bloqueante, anexo_obrigatorio, alerta_risco, ordem").in("bloco_id", (blocos ?? []).map((b) => b.id as string)).order("ordem");
  const porBloco = (bid: string) => (itens ?? []).filter((i) => i.bloco_id === bid).map((i) => ({ id: i.id as string, blocoId: i.bloco_id as string, codigo: i.codigo as string, titulo: i.titulo as string, descricao: i.descricao as string | null, tipo: i.tipo as "padrao" | "acesso", responsavelPapel: i.responsavel_papel as string | null, prazoDias: i.prazo_dias as number | null, aplicavelA: (i.aplicavel_a as string[]) ?? [], condicaoFlags: (i.condicao_flags as string[]) ?? [], condicaoModo: i.condicao_modo as "any" | "all", bloqueante: i.bloqueante as boolean, anexoObrigatorio: i.anexo_obrigatorio as boolean, alertaRisco: i.alerta_risco as string | null, ordem: i.ordem as number }));
  return { id: tpl.id as string, slug: tpl.slug as string, nome: tpl.nome as string, blocos: (blocos ?? []).map((b) => ({ id: b.id as string, ordem: b.ordem as number, nome: b.nome as string, prazoBlocoDias: b.prazo_bloco_dias as number | null, itens: porBloco(b.id as string) })) };
}

export async function semearTemplatePadrao(): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: existe } = await supabase.from("onboarding_template").select("id").eq("slug", TEMPLATE_PADRAO.slug).maybeSingle();
  if (existe) return { ok: true };
  const { data: tpl, error: e1 } = await supabase.from("onboarding_template").insert({ slug: TEMPLATE_PADRAO.slug, nome: TEMPLATE_PADRAO.nome, descricao: TEMPLATE_PADRAO.descricao }).select("id").single();
  if (e1 || !tpl) return { erro: "Falha ao criar template." };
  for (const b of TEMPLATE_PADRAO.blocos) {
    const { data: bloco, error: e2 } = await supabase.from("onboarding_bloco").insert({ template_id: tpl.id, ordem: b.ordem, slug: `bloco-${b.ordem}`, nome: b.nome, prazo_bloco_dias: b.prazoBlocoDias }).select("id").single();
    if (e2 || !bloco) return { erro: "Falha ao criar bloco." };
    const linhas = b.itens.map((i) => ({ bloco_id: bloco.id, codigo: i.codigo, titulo: i.titulo, descricao: i.descricao, tipo: i.tipo, responsavel_papel: i.responsavelPapel, prazo_dias: i.prazoDias, aplicavel_a: i.aplicavelA, condicao_flags: i.condicaoFlags, condicao_modo: i.condicaoModo, bloqueante: i.bloqueante, anexo_obrigatorio: i.anexoObrigatorio, alerta_risco: i.alertaRisco, ordem: i.ordem }));
    const { error: e3 } = await supabase.from("onboarding_template_item").insert(linhas);
    if (e3) return { erro: "Falha ao criar itens." };
  }
  return { ok: true };
}

export async function salvarTemplateItem(input: { id?: string; blocoId: string; codigo: string; titulo: string; descricao: string | null; tipo: "padrao" | "acesso"; responsavelPapel: string | null; prazoDias: number | null; aplicavelA: string[]; condicaoFlags: string[]; condicaoModo: "any" | "all"; bloqueante: boolean; anexoObrigatorio: boolean; alertaRisco: string | null; ordem: number }): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const row = { bloco_id: input.blocoId, codigo: input.codigo, titulo: input.titulo, descricao: input.descricao, tipo: input.tipo, responsavel_papel: input.responsavelPapel, prazo_dias: input.prazoDias, aplicavel_a: input.aplicavelA, condicao_flags: input.condicaoFlags, condicao_modo: input.condicaoModo, bloqueante: input.bloqueante, anexo_obrigatorio: input.anexoObrigatorio, alerta_risco: input.alertaRisco, ordem: input.ordem };
  const { error } = input.id ? await supabase.from("onboarding_template_item").update(row).eq("id", input.id) : await supabase.from("onboarding_template_item").insert(row);
  return error ? { erro: "Falha ao salvar." } : { ok: true };
}

export async function removerTemplateItem(id: string): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("onboarding_template_item").delete().eq("id", id);
  return error ? { erro: "Falha ao remover." } : { ok: true };
}
```

- [ ] **Step 3: Verificar + semear em produção (uma vez)**

Run: `npm run lint && npm run typecheck && npm run build` (sem erros).
Observação: o seed roda pela UI (botão no editor, Task 7) — não há passo de DB aqui.

- [ ] **Step 4: Commit**

```bash
git add src/lib/onboarding/template-seed.ts "src/app/(app)/onboarding/template-actions.ts"
git commit -m "feat(onboarding): template padrão (seed) + actions de template

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Actions por cliente (instanciar, itens, revelar)

**Files:**
- Create: `src/app/(app)/clientes/[id]/processo.ts`

**Interfaces:**
- Consumes: `materializarProcesso`, `progressoProcesso`, `sugerirPerfil`, tipos `PerfilCliente`, `FlagsProcesso`, `StatusItem`, `TemplateBloco` (Task 2); `listarTemplate` shape (Task 3) — reconstrói `TemplateBloco` a partir das linhas; `cifrarSenha`/`decifrarSenha`; gates.
- Produces: `type ItemProcessoView`, `type ProcessoView`; `listarProcessoCliente`, `iniciarProcesso`, `salvarProcessoItem`, `removerProcessoItem`, `revelarSenha`.

- [ ] **Step 1: Criar `processo.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente, podeRevelarCredencial } from "@/lib/clientes/permissoes";
import { cifrarSenha, decifrarSenha } from "@/lib/onboarding/credencial";
import { materializarProcesso, progressoProcesso, type PerfilCliente, type FlagsProcesso, type StatusItem, type TemplateBloco, type TemplateItem } from "@/lib/onboarding/processo";

export type ItemProcessoView = { id: string; blocoOrdem: number; blocoNome: string; codigo: string | null; titulo: string; descricao: string | null; tipo: "padrao" | "acesso"; responsavelPapel: string | null; responsavelId: string | null; prazo: string | null; status: StatusItem; observacao: string | null; bloqueante: boolean; anexoObrigatorio: boolean; alertaRisco: string | null; ordem: number; acessoUrl: string | null; acessoLogin: string | null; temSenha: boolean };
export type ProcessoView = { id: string; perfil: string; dataInicio: string; status: string } | null;

export async function listarProcessoCliente(clienteId: string): Promise<{ processo: ProcessoView; itens: ItemProcessoView[]; progresso: ReturnType<typeof progressoProcesso> } | null> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return null;
  const supabase = await createServerSupabase();
  const { data: proc } = await supabase.from("onboarding_processo").select("id, perfil, data_inicio, status").eq("cliente_id", clienteId).order("criado_em", { ascending: false }).limit(1).maybeSingle();
  if (!proc) return { processo: null, itens: [], progresso: progressoProcesso([]) };
  const { data } = await supabase.from("onboarding_processo_item").select("id, bloco_ordem, bloco_nome, codigo, titulo, descricao, tipo, responsavel_papel, responsavel_id, prazo, status, observacao, bloqueante, anexo_obrigatorio, alerta_risco, ordem, acesso_url, acesso_login, acesso_senha_cifrada").eq("processo_id", proc.id).order("bloco_ordem").order("ordem");
  const itens: ItemProcessoView[] = (data ?? []).map((r) => ({ id: r.id as string, blocoOrdem: r.bloco_ordem as number, blocoNome: r.bloco_nome as string, codigo: r.codigo as string | null, titulo: r.titulo as string, descricao: r.descricao as string | null, tipo: r.tipo as "padrao" | "acesso", responsavelPapel: r.responsavel_papel as string | null, responsavelId: (r.responsavel_id as string | null) ?? null, prazo: (r.prazo as string | null) ?? null, status: r.status as StatusItem, observacao: (r.observacao as string | null) ?? null, bloqueante: r.bloqueante as boolean, anexoObrigatorio: r.anexo_obrigatorio as boolean, alertaRisco: r.alerta_risco as string | null, ordem: r.ordem as number, acessoUrl: (r.acesso_url as string | null) ?? null, acessoLogin: (r.acesso_login as string | null) ?? null, temSenha: !!r.acesso_senha_cifrada }));
  const progresso = progressoProcesso(itens.map((i) => ({ status: i.status, prazo: i.prazo, bloqueante: i.bloqueante })));
  return { processo: { id: proc.id as string, perfil: proc.perfil as string, dataInicio: proc.data_inicio as string, status: proc.status as string }, itens, progresso };
}

export async function iniciarProcesso(clienteId: string, perfil: PerfilCliente, flags: FlagsProcesso, dataInicio: string): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { count } = await supabase.from("onboarding_processo").select("id", { count: "exact", head: true }).eq("cliente_id", clienteId);
  if ((count ?? 0) > 0) return { ok: true };
  const { data: tpl } = await supabase.from("onboarding_template").select("id").eq("ativo", true).order("criado_em").limit(1).maybeSingle();
  if (!tpl) return { erro: "Nenhum template configurado (Configurações → Template de onboarding)." };
  const { data: blocosRows } = await supabase.from("onboarding_bloco").select("id, ordem, nome, prazo_bloco_dias").eq("template_id", tpl.id).order("ordem");
  const { data: itensRows } = await supabase.from("onboarding_template_item").select("bloco_id, codigo, titulo, descricao, tipo, responsavel_papel, prazo_dias, aplicavel_a, condicao_flags, condicao_modo, bloqueante, anexo_obrigatorio, alerta_risco, ordem").in("bloco_id", (blocosRows ?? []).map((b) => b.id as string)).order("ordem");
  const blocos: TemplateBloco[] = (blocosRows ?? []).map((b) => ({ ordem: b.ordem as number, nome: b.nome as string, prazoBlocoDias: b.prazo_bloco_dias as number | null,
    itens: (itensRows ?? []).filter((i) => i.bloco_id === b.id).map((i): TemplateItem => ({ codigo: i.codigo as string, titulo: i.titulo as string, descricao: i.descricao as string | null, tipo: i.tipo as "padrao" | "acesso", responsavelPapel: i.responsavel_papel as string | null, prazoDias: i.prazo_dias as number | null, aplicavelA: (i.aplicavel_a as string[]) ?? [], condicaoFlags: (i.condicao_flags as string[]) ?? [], condicaoModo: i.condicao_modo as "any" | "all", bloqueante: i.bloqueante as boolean, anexoObrigatorio: i.anexo_obrigatorio as boolean, alertaRisco: i.alerta_risco as string | null, ordem: i.ordem as number })) }));
  const seeds = materializarProcesso(blocos, perfil, flags, dataInicio);
  const { data: novo, error: e1 } = await supabase.from("onboarding_processo").insert({ cliente_id: clienteId, template_id: tpl.id, data_inicio: dataInicio, perfil, flags, criado_por: p.id }).select("id").single();
  if (e1 || !novo) return { erro: "Falha ao criar processo." };
  const linhas = seeds.map((s) => ({ processo_id: novo.id, bloco_ordem: s.blocoOrdem, bloco_nome: s.blocoNome, codigo: s.codigo, titulo: s.titulo, descricao: s.descricao, tipo: s.tipo, responsavel_papel: s.responsavelPapel, prazo: s.prazo, bloqueante: s.bloqueante, anexo_obrigatorio: s.anexoObrigatorio, alerta_risco: s.alertaRisco, ordem: s.ordem }));
  if (linhas.length > 0) {
    const { error: e2 } = await supabase.from("onboarding_processo_item").insert(linhas);
    if (e2) return { erro: "Falha ao materializar itens." };
  }
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

export async function salvarProcessoItem(input: { id?: string; processoId: string; clienteId: string; blocoOrdem: number; blocoNome: string; codigo: string | null; titulo: string; tipo: "padrao" | "acesso"; responsavelPapel: string | null; responsavelId: string | null; prazo: string | null; status: StatusItem; observacao: string | null; bloqueante: boolean; acessoUrl: string | null; acessoLogin: string | null; novaSenha?: string | null; ordem: number }): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const row: Record<string, unknown> = { processo_id: input.processoId, bloco_ordem: input.blocoOrdem, bloco_nome: input.blocoNome, codigo: input.codigo, titulo: input.titulo, tipo: input.tipo, responsavel_papel: input.responsavelPapel, responsavel_id: input.responsavelId, prazo: input.prazo || null, status: input.status, observacao: input.observacao, bloqueante: input.bloqueante, acesso_url: input.acessoUrl, acesso_login: input.acessoLogin, ordem: input.ordem, atualizado_em: new Date().toISOString(), atualizado_por: p.id };
  if (input.novaSenha) {
    try { row.acesso_senha_cifrada = cifrarSenha(input.novaSenha); } catch { return { erro: "Cofre não configurado (ONBOARDING_CRIPTO_KEY)." }; }
  }
  const { error } = input.id ? await supabase.from("onboarding_processo_item").update(row).eq("id", input.id) : await supabase.from("onboarding_processo_item").insert(row);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath(`/clientes/${input.clienteId}`);
  return { ok: true };
}

export async function removerProcessoItem(id: string, clienteId: string): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("onboarding_processo_item").delete().eq("id", id);
  if (error) return { erro: "Falha ao remover." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

export async function revelarSenha(itemId: string): Promise<{ senha?: string; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeRevelarCredencial(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("onboarding_processo_item").select("acesso_senha_cifrada").eq("id", itemId).maybeSingle();
  if (!data?.acesso_senha_cifrada) return { erro: "Sem senha cadastrada." };
  let senha: string;
  try { senha = decifrarSenha(data.acesso_senha_cifrada as string); } catch { return { erro: "Falha ao decifrar (chave?)." }; }
  const { error: logErr } = await supabase.from("onboarding_log_credencial").insert({ item_id: itemId, usuario_id: p.id });
  if (logErr) return { erro: "Não foi possível registrar a auditoria; revelação cancelada." };
  return { senha };
}
```

- [ ] **Step 2: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build` (sem erros).
```bash
git add "src/app/(app)/clientes/[id]/processo.ts"
git commit -m "feat(onboarding): actions do processo por cliente (instanciar/itens/revelar)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Lista global de processos

**Files:**
- Create: `src/app/(app)/onboarding/processos-actions.ts`
- Create: `src/app/(app)/onboarding/ListaProcessos.tsx`
- Modify: `src/app/(app)/onboarding/page.tsx`

**Interfaces:**
- Consumes: `progressoProcesso`, `StatusItem` (Task 2); `podeCriarCliente`.
- Produces: `type ResumoProcesso`; `listarProcessos()`; componente `ListaProcessos`.

- [ ] **Step 1: `processos-actions.ts`**

```ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { progressoProcesso, type StatusItem } from "@/lib/onboarding/processo";

export type ResumoProcesso = { processoId: string; clienteId: string; razaoSocial: string; perfil: string; total: number; concluidos: number; pct: number; concluido: boolean; proximoPrazo: string | null };

export async function listarProcessos(): Promise<ResumoProcesso[]> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return [];
  const supabase = await createServerSupabase();
  const { data: procs } = await supabase.from("onboarding_processo").select("id, perfil, cliente_id, clientes(razao_social)");
  if (!procs || procs.length === 0) return [];
  const { data: itens } = await supabase.from("onboarding_processo_item").select("processo_id, status, prazo, bloqueante").in("processo_id", procs.map((x) => x.id as string));
  const porProc = new Map<string, { status: StatusItem; prazo: string | null; bloqueante: boolean }[]>();
  for (const i of itens ?? []) {
    const arr = porProc.get(i.processo_id as string) ?? [];
    arr.push({ status: i.status as StatusItem, prazo: i.prazo as string | null, bloqueante: i.bloqueante as boolean });
    porProc.set(i.processo_id as string, arr);
  }
  const out = procs.map((pr) => {
    const cli = Array.isArray(pr.clientes) ? pr.clientes[0] : pr.clientes;
    const prog = progressoProcesso(porProc.get(pr.id as string) ?? []);
    return { processoId: pr.id as string, clienteId: pr.cliente_id as string, razaoSocial: (cli?.razao_social as string) ?? "—", perfil: pr.perfil as string, total: prog.total, concluidos: prog.concluidos, pct: prog.pct, concluido: prog.concluido, proximoPrazo: prog.proximoPrazo };
  });
  return out.sort((a, b) => a.pct - b.pct);
}
```

- [ ] **Step 2: `ListaProcessos.tsx`**

```tsx
"use client";
import Link from "next/link";
import type { ResumoProcesso } from "./processos-actions";

const PERFIL_LABEL: Record<string, string> = { mei: "MEI", simples_sem_func: "Simples s/ func", simples_com_func: "Simples c/ func", presumido_real: "Presumido/Real", pf: "PF" };

export function ListaProcessos({ itens, hoje }: { itens: ResumoProcesso[]; hoje: string }) {
  if (itens.length === 0) return <p className="text-sm text-cinza">Nenhum onboarding em andamento.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
      <table className="min-w-full text-sm">
        <thead><tr className="border-b border-linha text-xs text-cinza">
          <th className="px-3 py-2 text-left font-medium">Cliente</th>
          <th className="px-3 py-2 text-left font-medium">Perfil</th>
          <th className="px-3 py-2 text-left font-medium">Progresso</th>
          <th className="px-3 py-2 text-right font-medium">Próximo prazo</th>
        </tr></thead>
        <tbody>
          {itens.map((o) => {
            const atrasado = !!o.proximoPrazo && o.proximoPrazo < hoje;
            return (
              <tr key={o.processoId} className="border-b border-linha/60">
                <td className="px-3 py-2"><Link href={`/clientes/${o.clienteId}`} className="text-texto underline decoration-linha hover:decoration-verde">{o.razaoSocial}</Link></td>
                <td className="px-3 py-2 text-cinza">{PERFIL_LABEL[o.perfil] ?? o.perfil}</td>
                <td className="px-3 py-2"><div className="flex items-center gap-2"><div className="h-2 w-24 overflow-hidden rounded-full bg-linha"><div className={`h-full rounded-full ${o.concluido ? "bg-verde" : "bg-verde/60"}`} style={{ width: `${o.pct}%` }} /></div><span className="text-xs tabular-nums text-cinza">{o.pct}%</span></div></td>
                <td className={`px-3 py-2 text-right tabular-nums ${atrasado ? "font-semibold text-negativo" : ""}`}>{o.proximoPrazo ? `${o.proximoPrazo.slice(8, 10)}/${o.proximoPrazo.slice(5, 7)}` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Reescrever `onboarding/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { ListaProcessos } from "./ListaProcessos";
import { listarProcessos } from "./processos-actions";

export default async function OnboardingPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const itens = await listarProcessos();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4">
      <PageHeader titulo="Onboarding" subtitulo="Processos de entrada em andamento" />
      <ListaProcessos itens={itens} hoje={hoje} />
    </main>
  );
}
```

- [ ] **Step 4: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build` (sem erros; a `onboarding/actions.ts` antiga ainda existe e não é mais importada pela page — será removida na Task 8).
```bash
git add "src/app/(app)/onboarding/processos-actions.ts" "src/app/(app)/onboarding/ListaProcessos.tsx" "src/app/(app)/onboarding/page.tsx"
git commit -m "feat(onboarding): lista global de processos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: UI — aba do cliente (formulário + blocos)

**Files:**
- Create: `src/components/onboarding/ProcessoSection.tsx`
- Modify: `src/app/(app)/clientes/[id]/page.tsx`
- Test: `src/tests/onboarding/processo-section-render.test.tsx`

**Interfaces:**
- Consumes: `iniciarProcesso`, `salvarProcessoItem`, `removerProcessoItem`, `revelarSenha`, tipos `ItemProcessoView`, `ProcessoView` (Task 4); `sugerirPerfil`, tipos `PerfilCliente`, `StatusItem` (Task 2); `Botao`.

- [ ] **Step 1: Smoke test**

Criar `src/tests/onboarding/processo-section-render.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/clientes/[id]/processo", () => ({ iniciarProcesso: vi.fn(), salvarProcessoItem: vi.fn(), removerProcessoItem: vi.fn(), revelarSenha: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { ProcessoSection } from "@/components/onboarding/ProcessoSection";
import type { ItemProcessoView } from "@/app/(app)/clientes/[id]/processo";

const prog = { total: 2, concluidos: 1, bloqueantesPendentes: 1, pct: 50, concluido: false, proximoPrazo: "2026-07-20" };
const itens: ItemProcessoView[] = [
  { id: "1", blocoOrdem: 1, blocoNome: "Formalização da relação", codigo: "1.1", titulo: "Contrato assinado", descricao: null, tipo: "padrao", responsavelPapel: "admin", responsavelId: null, prazo: "2026-07-01", status: "concluido", observacao: null, bloqueante: true, anexoObrigatorio: true, alertaRisco: null, ordem: 1, acessoUrl: null, acessoLogin: null, temSenha: false },
  { id: "2", blocoOrdem: 3, blocoNome: "Acessos", codigo: "3.5", titulo: "Cofre de acessos", descricao: null, tipo: "acesso", responsavelPapel: "assistente", responsavelId: null, prazo: "2026-07-20", status: "pendente", observacao: null, bloqueante: false, anexoObrigatorio: false, alertaRisco: null, ordem: 5, acessoUrl: "https://cav.receita.fazenda.gov.br", acessoLogin: "123", temSenha: true },
];

describe("ProcessoSection", () => {
  it("sem processo mostra iniciar", () => {
    const html = renderToStaticMarkup(<ProcessoSection clienteId="c1" processo={null} itens={[]} progresso={{ total: 0, concluidos: 0, bloqueantesPendentes: 0, pct: 0, concluido: false, proximoPrazo: null }} usuarios={[]} podeRevelar={false} perfilSugerido="simples_sem_func" hoje="2026-07-08" />);
    expect(html).toContain("Iniciar processo");
  });
  it("com processo mostra blocos e itens", () => {
    const html = renderToStaticMarkup(<ProcessoSection clienteId="c1" processo={{ id: "p1", perfil: "simples_com_func", dataInicio: "2026-07-01", status: "em_andamento" }} itens={itens} progresso={prog} usuarios={[]} podeRevelar perfilSugerido="simples_com_func" hoje="2026-07-08" />);
    expect(html).toContain("Formalização da relação");
    expect(html).toContain("Contrato assinado");
    expect(html).toContain("50%");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npm test -- processo-section-render` → FAIL.

- [ ] **Step 3: Criar `ProcessoSection.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { iniciarProcesso, salvarProcessoItem, removerProcessoItem, revelarSenha, type ItemProcessoView, type ProcessoView } from "@/app/(app)/clientes/[id]/processo";
import type { PerfilCliente, StatusItem } from "@/lib/onboarding/processo";
import { Botao } from "@/components/ui/Botao";

const PERFIS: { v: PerfilCliente; l: string }[] = [
  { v: "mei", l: "MEI" }, { v: "simples_sem_func", l: "Simples sem funcionários" }, { v: "simples_com_func", l: "Simples com funcionários" }, { v: "presumido_real", l: "Lucro Presumido / Real" }, { v: "pf", l: "Pessoa física" },
];
const FLAGS: { k: string; l: string }[] = [
  { k: "possui_contador_anterior", l: "Tem contador anterior (transferência)" },
  { k: "possui_funcionarios", l: "Tem funcionários" },
  { k: "possui_prolabore", l: "Tem pró-labore" },
  { k: "atividade_exige_licencas", l: "Atividade exige licenças/alvará" },
  { k: "possui_erp", l: "Usa ERP / emissor próprio" },
  { k: "complexidade_alta", l: "Complexidade fiscal alta" },
];
const STATUS_LABEL: Record<StatusItem, string> = { pendente: "Pendente", concluido: "Concluído", dispensado: "Dispensado" };
const STATUS_CLS: Record<StatusItem, string> = { pendente: "bg-linha text-cinza", concluido: "bg-verde/10 text-verde", dispensado: "bg-cinza/10 text-cinza" };
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

type Prog = { total: number; concluidos: number; bloqueantesPendentes: number; pct: number; concluido: boolean; proximoPrazo: string | null };
type Usuario = { id: string; nome: string };
type FormItem = Partial<ItemProcessoView> & { novaSenha?: string };

export function ProcessoSection({ clienteId, processo, itens, progresso, usuarios, podeRevelar, perfilSugerido, hoje }: { clienteId: string; processo: ProcessoView; itens: ItemProcessoView[]; progresso: Prog; usuarios: Usuario[]; podeRevelar: boolean; perfilSugerido: PerfilCliente; hoje: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  const [perfil, setPerfil] = useState<PerfilCliente>(perfilSugerido);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [dataInicio, setDataInicio] = useState(hoje);
  const [form, setForm] = useState<FormItem | null>(null);
  const [senhas, setSenhas] = useState<Record<string, string>>({});

  async function chamar(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if (r.erro) { alert(r.erro); return; }
    setForm(null); setAbrindo(false); router.refresh();
  }
  async function ver(it: ItemProcessoView) {
    setOcupado(true);
    const r = await revelarSenha(it.id);
    setOcupado(false);
    if (r.erro) { alert(r.erro); return; }
    setSenhas((s) => ({ ...s, [it.id]: r.senha ?? "" }));
  }
  async function mudarStatus(it: ItemProcessoView, status: StatusItem) {
    if (!processo) return;
    await chamar(() => salvarProcessoItem({ id: it.id, processoId: processo.id, clienteId, blocoOrdem: it.blocoOrdem, blocoNome: it.blocoNome, codigo: it.codigo, titulo: it.titulo, tipo: it.tipo, responsavelPapel: it.responsavelPapel, responsavelId: it.responsavelId, prazo: it.prazo, status, observacao: it.observacao, bloqueante: it.bloqueante, acessoUrl: it.acessoUrl, acessoLogin: it.acessoLogin, ordem: it.ordem }));
  }
  function salvarForm() {
    if (!form || !processo) return;
    void chamar(() => salvarProcessoItem({ id: form.id, processoId: processo.id, clienteId, blocoOrdem: form.blocoOrdem ?? 99, blocoNome: form.blocoNome ?? "Itens adicionais", codigo: form.codigo ?? null, titulo: form.titulo ?? "", tipo: (form.tipo ?? "padrao") as "padrao" | "acesso", responsavelPapel: form.responsavelPapel ?? null, responsavelId: form.responsavelId ?? null, prazo: form.prazo ?? null, status: (form.status ?? "pendente") as StatusItem, observacao: form.observacao ?? null, bloqueante: form.bloqueante ?? false, acessoUrl: form.acessoUrl ?? null, acessoLogin: form.acessoLogin ?? null, novaSenha: form.novaSenha || null, ordem: form.ordem ?? 0 }));
  }

  if (!processo) {
    return (
      <section className="space-y-3 rounded-2xl border border-linha bg-white p-5">
        <h2 className="font-display text-sm font-semibold text-texto">Onboarding</h2>
        {!abrindo ? (
          <>
            <p className="text-sm text-cinza">Nenhum processo de entrada iniciado.</p>
            <Botao variante="primario" disabled={ocupado} onClick={() => setAbrindo(true)}>Iniciar processo</Botao>
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <label className="text-xs text-cinza">Data de início<input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="mt-0.5 block rounded-lg border border-linha px-2 py-1.5 text-sm" /></label>
              <label className="text-xs text-cinza">Perfil<select value={perfil} onChange={(e) => setPerfil(e.target.value as PerfilCliente)} className="mt-0.5 block rounded-lg border border-linha px-2 py-1.5 text-sm">{PERFIS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}</select></label>
            </div>
            <fieldset className="space-y-1">
              <legend className="text-xs text-cinza">Condições do cliente</legend>
              {FLAGS.map((f) => (
                <label key={f.k} className="flex items-center gap-2 text-sm text-texto"><input type="checkbox" checked={!!flags[f.k]} onChange={(e) => setFlags((s) => ({ ...s, [f.k]: e.target.checked }))} />{f.l}</label>
              ))}
            </fieldset>
            <div className="flex gap-2">
              <Botao variante="fantasma" onClick={() => setAbrindo(false)}>Cancelar</Botao>
              <Botao variante="primario" disabled={ocupado} onClick={() => chamar(() => iniciarProcesso(clienteId, perfil, flags, dataInicio))}>Criar processo</Botao>
            </div>
          </div>
        )}
      </section>
    );
  }

  const blocos = Array.from(new Set(itens.map((i) => i.blocoOrdem))).sort((a, b) => a - b);
  const nomeUsuario = (id: string | null) => usuarios.find((u) => u.id === id)?.nome ?? null;

  return (
    <section className="space-y-3 rounded-2xl border border-linha bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-texto">Onboarding</h2>
        <Botao variante="secundario" disabled={ocupado} onClick={() => setForm({ status: "pendente", tipo: "padrao" })}>+ Item</Botao>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs text-cinza"><span>{progresso.pct}% concluído</span><span>{progresso.bloqueantesPendentes} bloqueante(s) pendente(s)</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-linha"><div className="h-full rounded-full bg-verde" style={{ width: `${progresso.pct}%` }} /></div>
      </div>

      {blocos.map((bo) => {
        const doBloco = itens.filter((i) => i.blocoOrdem === bo);
        return (
          <div key={bo} className="space-y-1.5">
            <h3 className="font-display text-[11px] font-semibold uppercase tracking-wide text-cinza">{doBloco[0]?.blocoNome}</h3>
            {doBloco.map((it) => {
              const atrasado = !!it.prazo && it.prazo < hoje && it.status === "pendente";
              return (
                <div key={it.id} className="rounded-lg border border-linha/70 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    {it.codigo && <span className="font-mono text-[11px] text-cinza-claro">{it.codigo}</span>}
                    <span className="font-medium text-texto">{it.titulo}</span>
                    {it.bloqueante && <span className="rounded bg-negativo/10 px-1.5 text-[10px] text-negativo">bloqueante</span>}
                    {it.anexoObrigatorio && <span className="text-[10px] text-cinza-claro">anexo</span>}
                    <select value={it.status} disabled={ocupado} onChange={(e) => mudarStatus(it, e.target.value as StatusItem)} className={`ml-auto rounded-full px-2 py-0.5 text-xs ${STATUS_CLS[it.status]}`}>{(["pendente", "concluido", "dispensado"] as StatusItem[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
                    <button type="button" onClick={() => setForm(it)} className="text-xs text-cinza underline">Editar</button>
                    <button type="button" onClick={() => chamar(() => removerProcessoItem(it.id, clienteId))} className="text-xs text-negativo underline">Remover</button>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-cinza">
                    {it.responsavelPapel && <span>Papel: {it.responsavelPapel}</span>}
                    {nomeUsuario(it.responsavelId) && <span>Resp.: {nomeUsuario(it.responsavelId)}</span>}
                    {it.prazo && <span className={atrasado ? "font-semibold text-negativo" : ""}>Prazo: {dataBR(it.prazo)}</span>}
                    {it.observacao && <span>Obs.: {it.observacao}</span>}
                  </div>
                  {it.alertaRisco && <p className="mt-1 rounded bg-negativo/10 px-2 py-1 text-xs text-negativo">⚠ {it.alertaRisco}</p>}
                  {it.tipo === "acesso" && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-cinza">
                      {it.acessoUrl && <span>URL: {it.acessoUrl}</span>}
                      {it.acessoLogin && <span>Login: {it.acessoLogin}</span>}
                      {it.temSenha && podeRevelar && <button type="button" onClick={() => ver(it)} disabled={ocupado} className="text-verde underline">{senhas[it.id] ? `Senha: ${senhas[it.id]}` : "Revelar senha"}</button>}
                      {it.temSenha && !podeRevelar && <span className="text-cinza-claro">senha protegida</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md space-y-2 rounded-2xl bg-white p-5">
            <h3 className="font-display text-sm font-semibold text-texto">{form.id ? "Editar item" : "Novo item"}</h3>
            <label className="block text-xs text-cinza">Título<input value={form.titulo ?? ""} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" /></label>
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-cinza">Tipo<select value={form.tipo ?? "padrao"} onChange={(e) => setForm({ ...form, tipo: e.target.value as "padrao" | "acesso" })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm"><option value="padrao">Padrão</option><option value="acesso">Acesso (cofre)</option></select></label>
              <label className="flex-1 text-xs text-cinza">Responsável<select value={form.responsavelId ?? ""} onChange={(e) => setForm({ ...form, responsavelId: e.target.value || null })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm"><option value="">—</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></label>
            </div>
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-cinza">Prazo<input type="date" value={form.prazo ?? ""} onChange={(e) => setForm({ ...form, prazo: e.target.value || null })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" /></label>
              <label className="flex items-end gap-1 text-xs text-cinza"><input type="checkbox" checked={form.bloqueante ?? false} onChange={(e) => setForm({ ...form, bloqueante: e.target.checked })} /> Bloqueante</label>
            </div>
            <label className="block text-xs text-cinza">Observação<textarea value={form.observacao ?? ""} onChange={(e) => setForm({ ...form, observacao: e.target.value })} rows={2} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" /></label>
            {form.tipo === "acesso" && (
              <div className="space-y-2 rounded-lg bg-creme p-2">
                <label className="block text-xs text-cinza">URL do portal<input value={form.acessoUrl ?? ""} onChange={(e) => setForm({ ...form, acessoUrl: e.target.value || null })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" /></label>
                <label className="block text-xs text-cinza">Login<input value={form.acessoLogin ?? ""} onChange={(e) => setForm({ ...form, acessoLogin: e.target.value || null })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" /></label>
                <label className="block text-xs text-cinza">Senha (vazio = manter)<input type="password" value={form.novaSenha ?? ""} onChange={(e) => setForm({ ...form, novaSenha: e.target.value })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" /></label>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1"><Botao variante="fantasma" onClick={() => setForm(null)}>Cancelar</Botao><Botao variante="primario" disabled={ocupado || !(form.titulo ?? "").trim()} onClick={salvarForm}>Salvar</Botao></div>
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npm test -- processo-section-render` → PASS.

- [ ] **Step 5: Rewire `clientes/[id]/page.tsx`**

Trocar os imports do RF-010 pela nova seção:
```ts
import { podeAtribuirContador, podeVerHonorario, podeExcluirCliente, podeCriarCliente, podeRevelarCredencial } from "@/lib/clientes/permissoes";
import { ProcessoSection } from "@/components/onboarding/ProcessoSection";
import { listarProcessoCliente } from "./processo";
import { sugerirPerfil } from "@/lib/onboarding/processo";
```
Substituir o carregamento do onboarding (o bloco `const onboarding = ...` da RF-010) por:
```ts
  const podeOnboarding = podeCriarCliente(papel);
  const proc = podeOnboarding ? await listarProcessoCliente(id) : null;
  let usuariosOnb: { id: string; nome: string }[] = [];
  let perfilSugerido: "mei" | "simples_sem_func" | "simples_com_func" | "presumido_real" | "pf" = "simples_sem_func";
  if (podeOnboarding) {
    const { data: us } = await supabase.from("usuarios").select("id, nome").eq("ativo", true).order("nome");
    usuariosOnb = (us as { id: string; nome: string }[] | null) ?? [];
    const { data: fin } = await supabase.from("clientes_financeiro").select("qtd_funcionarios").eq("cliente_id", id).maybeSingle();
    perfilSugerido = sugerirPerfil(String(cliente.tipo_pessoa ?? "PJ"), String(cliente.regime_tributario ?? ""), (fin?.qtd_funcionarios as number | null) ?? null);
  }
  const hojeOnb = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
```
E trocar o JSX `<OnboardingSection ... />` por:
```tsx
      {proc && (
        <ProcessoSection clienteId={id} processo={proc.processo} itens={proc.itens} progresso={proc.progresso} usuarios={usuariosOnb} podeRevelar={podeRevelarCredencial(papel)} perfilSugerido={perfilSugerido} hoje={hojeOnb} />
      )}
```

- [ ] **Step 6: Suite completa** — Run: `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde).

- [ ] **Step 7: Commit**

```bash
git add src/components/onboarding/ProcessoSection.tsx "src/app/(app)/clientes/[id]/page.tsx" src/tests/onboarding/processo-section-render.test.tsx
git commit -m "feat(onboarding): aba do processo no cliente (instanciação + blocos)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Editor do template (config) + seed pela UI

**Files:**
- Create: `src/app/(app)/configuracoes/onboarding/EditorTemplate.tsx`
- Modify: `src/app/(app)/configuracoes/onboarding/page.tsx`

**Interfaces:**
- Consumes: `listarTemplate`, `salvarTemplateItem`, `removerTemplateItem`, `semearTemplatePadrao`, tipos `TemplateView`, `BlocoView`, `ItemTemplateView` (Task 3); `Botao`.

- [ ] **Step 1: `EditorTemplate.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { salvarTemplateItem, removerTemplateItem, semearTemplatePadrao, type TemplateView, type ItemTemplateView } from "@/app/(app)/onboarding/template-actions";
import { Botao } from "@/components/ui/Botao";

const PERFIS = ["mei", "simples_sem_func", "simples_com_func", "presumido_real", "pf"];
type Form = Partial<ItemTemplateView>;

export function EditorTemplate({ template }: { template: TemplateView }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [form, setForm] = useState<Form | null>(null);

  async function chamar(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if (r.erro) { alert(r.erro); return; }
    setForm(null); router.refresh();
  }
  function salvar() {
    if (!form || !form.blocoId) return;
    void chamar(() => salvarTemplateItem({ id: form.id, blocoId: form.blocoId!, codigo: form.codigo ?? "", titulo: form.titulo ?? "", descricao: form.descricao ?? null, tipo: (form.tipo ?? "padrao") as "padrao" | "acesso", responsavelPapel: form.responsavelPapel ?? null, prazoDias: form.prazoDias ?? null, aplicavelA: form.aplicavelA ?? ["*"], condicaoFlags: form.condicaoFlags ?? [], condicaoModo: (form.condicaoModo ?? "all") as "any" | "all", bloqueante: form.bloqueante ?? false, anexoObrigatorio: form.anexoObrigatorio ?? false, alertaRisco: form.alertaRisco ?? null, ordem: form.ordem ?? 0 }));
  }

  if (!template) {
    return (
      <div className="rounded-2xl border border-linha bg-white p-6 text-center">
        <p className="text-sm text-cinza">Nenhum template configurado.</p>
        <div className="mt-3"><Botao variante="primario" disabled={ocupado} onClick={() => chamar(() => semearTemplatePadrao())}>Semear template padrão</Botao></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-cinza">{template.nome}</p>
      {template.blocos.map((b) => (
        <div key={b.id} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-[12px] font-semibold uppercase tracking-wide text-texto">{b.ordem}. {b.nome}</h3>
            {b.prazoBlocoDias != null && <span className="font-mono text-[11px] text-cinza-claro">D+{b.prazoBlocoDias}</span>}
            <button type="button" onClick={() => setForm({ blocoId: b.id, tipo: "padrao", aplicavelA: ["*"], condicaoModo: "all", ordem: (b.itens.at(-1)?.ordem ?? 0) + 1 })} className="ml-auto text-xs text-cinza underline">+ item</button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-linha bg-white">
            <table className="min-w-full text-sm">
              <tbody>
                {b.itens.map((i) => (
                  <tr key={i.id} className="border-b border-linha/60">
                    <td className="px-3 py-2 font-mono text-[11px] text-cinza-claro">{i.codigo}</td>
                    <td className="px-3 py-2 text-texto">{i.titulo}{i.bloqueante && <span className="ml-2 rounded bg-negativo/10 px-1.5 text-[10px] text-negativo">bloq.</span>}{i.tipo === "acesso" && <span className="ml-2 rounded bg-verde/10 px-1.5 text-[10px] text-verde">cofre</span>}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-cinza">{i.prazoDias != null ? `D+${i.prazoDias}` : "—"}</td>
                    <td className="px-3 py-2 text-[11px] text-cinza">{i.aplicavelA.includes("*") ? "todos" : i.aplicavelA.join(", ")}</td>
                    <td className="px-3 py-2 text-right"><button type="button" onClick={() => setForm(i)} className="mr-3 text-xs text-cinza underline">Editar</button><button type="button" onClick={() => chamar(() => removerTemplateItem(i.id))} className="text-xs text-negativo underline">Remover</button></td>
                  </tr>
                ))}
                {b.itens.length === 0 && <tr><td colSpan={5} className="px-3 py-2 text-cinza-claro">Sem itens.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md space-y-2 rounded-2xl bg-white p-5">
            <h3 className="font-display text-sm font-semibold text-texto">{form.id ? "Editar item" : "Novo item"}</h3>
            <div className="flex gap-2">
              <label className="w-24 text-xs text-cinza">Código<input value={form.codigo ?? ""} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" /></label>
              <label className="flex-1 text-xs text-cinza">Título<input value={form.titulo ?? ""} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" /></label>
            </div>
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-cinza">Responsável (papel)<select value={form.responsavelPapel ?? ""} onChange={(e) => setForm({ ...form, responsavelPapel: e.target.value || null })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm"><option value="">—</option>{["admin", "contador", "assistente", "financeiro"].map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
              <label className="w-24 text-xs text-cinza">Prazo D+<input type="number" value={form.prazoDias ?? ""} onChange={(e) => setForm({ ...form, prazoDias: e.target.value === "" ? null : Number(e.target.value) })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" /></label>
              <label className="w-28 text-xs text-cinza">Tipo<select value={form.tipo ?? "padrao"} onChange={(e) => setForm({ ...form, tipo: e.target.value as "padrao" | "acesso" })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm"><option value="padrao">Padrão</option><option value="acesso">Cofre</option></select></label>
            </div>
            <fieldset className="text-xs text-cinza"><legend>Aplicável aos perfis</legend>
              <label className="mr-3 inline-flex items-center gap-1"><input type="checkbox" checked={(form.aplicavelA ?? []).includes("*")} onChange={(e) => setForm({ ...form, aplicavelA: e.target.checked ? ["*"] : [] })} /> todos</label>
              {PERFIS.map((pf) => <label key={pf} className="mr-3 inline-flex items-center gap-1"><input type="checkbox" disabled={(form.aplicavelA ?? []).includes("*")} checked={(form.aplicavelA ?? []).includes(pf)} onChange={(e) => setForm({ ...form, aplicavelA: e.target.checked ? [...(form.aplicavelA ?? []).filter((x) => x !== "*"), pf] : (form.aplicavelA ?? []).filter((x) => x !== pf) })} /> {pf}</label>)}
            </fieldset>
            <div className="flex gap-4 text-xs text-cinza">
              <label className="inline-flex items-center gap-1"><input type="checkbox" checked={form.bloqueante ?? false} onChange={(e) => setForm({ ...form, bloqueante: e.target.checked })} /> Bloqueante</label>
              <label className="inline-flex items-center gap-1"><input type="checkbox" checked={form.anexoObrigatorio ?? false} onChange={(e) => setForm({ ...form, anexoObrigatorio: e.target.checked })} /> Anexo obrigatório</label>
            </div>
            <div className="flex justify-end gap-2 pt-1"><Botao variante="fantasma" onClick={() => setForm(null)}>Cancelar</Botao><Botao variante="primario" disabled={ocupado || !(form.titulo ?? "").trim()} onClick={salvar}>Salvar</Botao></div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Reescrever `configuracoes/onboarding/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditorTemplate } from "./EditorTemplate";
import { listarTemplate } from "@/app/(app)/onboarding/template-actions";

export default async function ConfigOnboardingPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const template = await listarTemplate();
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4">
      <PageHeader titulo="Template de onboarding" subtitulo="Blocos e itens do processo de entrada de clientes" />
      <EditorTemplate template={template} />
    </main>
  );
}
```

- [ ] **Step 3: Renomear o link em Configurações** — em `src/app/(app)/configuracoes/page.tsx`, trocar o label do item de onboarding para `"Template de onboarding"` e a `desc` para `"Blocos e itens do processo de entrada."`.

- [ ] **Step 4: Suite completa** — Run: `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/configuracoes/onboarding/EditorTemplate.tsx" "src/app/(app)/configuracoes/onboarding/page.tsx" "src/app/(app)/configuracoes/page.tsx"
git commit -m "feat(onboarding): editor do template + seed pela UI

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Remover código do RF-010 + CHANGELOG + finalizar

**Files:**
- Remove: `src/components/onboarding/OnboardingSection.tsx`, `src/app/(app)/clientes/[id]/onboarding.ts`, `src/lib/onboarding/progresso.ts`, `src/app/(app)/onboarding/actions.ts`, `src/app/(app)/onboarding/ListaOnboarding.tsx`, `src/app/(app)/configuracoes/onboarding/EditorModelo.tsx`, `src/tests/onboarding/onboarding-section-render.test.tsx`, `src/tests/onboarding/progresso.test.ts`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Conferir que nada importa os arquivos antigos**

Run: `grep -rn "OnboardingSection\|clientes/\[id\]/onboarding\|onboarding/progresso\|onboarding/actions\|ListaOnboarding\|EditorModelo\|listarOnboardingCliente\|progressoOnboarding\|agruparPorCategoria" src`
Expected: nenhuma referência (fora dos próprios arquivos a remover).

- [ ] **Step 2: Remover os arquivos**

```bash
git rm src/components/onboarding/OnboardingSection.tsx "src/app/(app)/clientes/[id]/onboarding.ts" src/lib/onboarding/progresso.ts "src/app/(app)/onboarding/actions.ts" "src/app/(app)/onboarding/ListaOnboarding.tsx" "src/app/(app)/configuracoes/onboarding/EditorModelo.tsx" src/tests/onboarding/onboarding-section-render.test.tsx src/tests/onboarding/progresso.test.ts
```

- [ ] **Step 3: Suite completa** — Run: `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde; sem imports quebrados).

- [ ] **Step 4: CHANGELOG** — sob `## [Não lançado]` → `### Alterado`:
```markdown
- **Onboarding — motor de template de processo:** o checklist plano deu lugar a um processo estruturado
  em blocos, com prazos relativos (D+n a partir da data de início), perfis de cliente e condições que
  filtram os itens ao instanciar. Template padrão de transferência de contabilidade semeável em
  Configurações → Template de onboarding (itens editáveis). Aba do cliente instancia o processo (perfil +
  condições), mostra os itens por bloco com prazo, bloqueantes e alertas de risco; cofre de acessos e
  auditoria mantidos. Lista global passa a mostrar perfil e atraso.
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(onboarding): aposenta o checklist plano (RF-010) + changelog

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6: Finalizar a branch** — Usar `superpowers:finishing-a-development-branch`. Após o deploy, **semear o template** (Configurações → Template de onboarding → "Semear template padrão") e conferir a instanciação num cliente.

---

## Self-Review

- **Cobertura do spec:** schema+RLS isolado (T1) ✓; helpers perfil/condição/prazo/progresso (T2) ✓; seed do template + actions (T3) ✓; actions do processo + revelar auditado (T4) ✓; lista global (T5) ✓; aba do cliente com form de instanciação + blocos + cofre (T6) ✓; editor do template + seed pela UI (T7) ✓; remoção do RF-010 + changelog (T8) ✓. Testes unit (T2) + smoke (T6) ✓.
- **Placeholders:** nenhum — todo passo tem código/comando concreto (o SQL do T1 referencia o bloco "Dados" do spec, que é completo).
- **Consistência de tipos:** `TemplateBloco`/`TemplateItem`/`ProcessoItemSeed`/`PerfilCliente`/`FlagsProcesso`/`StatusItem` (T2) reusados em T3/T4/T5/T6; `ItemProcessoView`/`ProcessoView` (T4) → T6; `ResumoProcesso` (T5) → ListaProcessos; `ItemTemplateView`/`TemplateView` (T3) → T7. Gates e `cifrarSenha`/`decifrarSenha` já existem. `materializarProcesso` recebe `TemplateBloco[]` reconstruído das linhas (T4).
- **Sequência sem quebra:** arquivos novos adicionados antes de remover os antigos (T8); entre T5 e T8 a `onboarding/actions.ts` antiga fica órfã mas presente (build verde). `progresso.ts` (plano) só sai no T8, quando nada mais o importa.
- **Segurança:** RLS com `EXISTS` (isolamento por cliente) nas tabelas de processo; log com `usuario_id = auth.uid()`; revelar fail-closed; listagem sem `acesso_senha_cifrada`.
- **Escopo:** só Ciclo A. Metadados de B/C (`bloqueante`/`anexo_obrigatorio`/`alerta_risco`) exibidos, sem automação; `campo_destino`/`depende_de`/consultoria/escalonamento fora.
