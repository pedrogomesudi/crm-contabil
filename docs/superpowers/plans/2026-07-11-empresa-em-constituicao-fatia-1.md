# Empresa em constituição — Fatia 1 — Plano

> REQUIRED SUB-SKILL: superpowers:executing-plans. Passos com checkbox.

**Goal:** Cadastrar empresa nova como cliente `em_constituicao` (sem CNPJ), iniciar a abertura, e ativar quando o CNPJ sair.

**Architecture:** Novo status em `status_cliente`; `cpf_cnpj` nullable com check; `socios jsonb`. Formulário enxuto separado do "Novo cliente"; reusa `iniciarProcesso` da legalização. Geradores de obrigações/mensalidades já exigem `status='ativo'` (sem mudança).

## Global Constraints
- Migrations idempotentes; `npm run db:migrate`. RBAC via `auth_papel()`. `next/image`, alias `@/*`.
- Antes de commit: `npm run lint && npm run typecheck && npm test` (+ `db:test` ao mexer em RLS).

---

### Task 1: Migration 0081 — status, CNPJ opcional, sócios

**Files:** Create `supabase/migrations/0081_empresa_em_constituicao.sql`

- [ ] **Step 1: Migration**

```sql
-- Empresa em constituição (Fatia 1).
alter type status_cliente add value if not exists 'em_constituicao';

alter table clientes alter column cpf_cnpj drop not null;
do $$ begin
  alter table clientes add constraint chk_cnpj_constituicao
    check (cpf_cnpj is not null or status = 'em_constituicao');
exception when duplicate_object then null; end $$;

alter table clientes add column if not exists socios jsonb;
```

- [ ] **Step 2:** `npm run db:migrate` → aplica sem erro.
- [ ] **Step 3:** `npm run db:test 2>&1 | grep -icE "FALHA|error"` → `0`.
- [ ] **Step 4:** commit `feat: migration 0081 — cliente em constituição (status, CNPJ opcional, sócios)`

---

### Task 2: Lib de constituição + rótulo de status (TDD)

**Files:**
- Create `src/lib/clientes/constituicao.ts`
- Modify `src/lib/ui/apresentacao.ts` (rótulo/badge de `em_constituicao`)
- Test `src/tests/clientes/constituicao.test.ts`

**Interfaces:**
- `type SocioInput = { nome: string; cpf: string|null; participacao: string|null; papelSocietario: "administrador"|"quotista"|null; nascimento?: string|null; identidade?: string|null; estadoCivil?: string|null; endereco?: string|null; telefone?: string|null; email?: string|null }`
- `type DadosConstituicao = { razaoSocial: string; nomeFantasia: string|null; regime: string; endereco: Record<string,string>|null; observacoes: string|null; socios: SocioInput[]; representante: Record<string,string>|null }`
- `normalizarConstituicao(fd: FormData): DadosConstituicao | { erro: string }`
- `validarAtivacao(cpfCnpj: string, regime: string): { erro?: string }`
- `rotuloStatusCliente(status: string): string`

- [ ] **Step 1: Testes (falhando)** — `src/tests/clientes/constituicao.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { normalizarConstituicao, validarAtivacao } from "@/lib/clientes/constituicao";
import { rotuloStatusCliente } from "@/lib/ui/apresentacao";

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

describe("normalizarConstituicao", () => {
  it("exige razão social", () => {
    expect(normalizarConstituicao(fd({ regime: "Simples" }))).toHaveProperty("erro");
  });
  it("monta dados, sócios e representante = administrador", () => {
    const f = fd({ razao_social: "Nova X Ltda", regime: "Simples", cidade: "Uberlândia", uf: "MG" });
    f.set("socios", JSON.stringify([
      { nome: "Ana", cpf: "11144477735", participacao: "50%", papelSocietario: "administrador" },
      { nome: "Bruno", cpf: null, participacao: "50%", papelSocietario: "quotista" },
    ]));
    const r = normalizarConstituicao(f);
    if ("erro" in r) throw new Error(r.erro);
    expect(r.razaoSocial).toBe("Nova X Ltda");
    expect(r.regime).toBe("Simples");
    expect(r.socios).toHaveLength(2);
    expect(r.representante?.nome).toBe("Ana");
  });
  it("rejeita regime inválido", () => {
    expect(normalizarConstituicao(fd({ razao_social: "X", regime: "Nada" }))).toHaveProperty("erro");
  });
});

describe("validarAtivacao", () => {
  it("rejeita CNPJ inválido", () => { expect(validarAtivacao("11.111.111/1111-11", "Simples").erro).toBeTruthy(); });
  it("aceita CNPJ válido", () => { expect(validarAtivacao("11.222.333/0001-81", "Simples").erro).toBeUndefined(); });
});

describe("rotuloStatusCliente", () => {
  it("rotula em constituição", () => { expect(rotuloStatusCliente("em_constituicao")).toBe("Em constituição"); });
});
```

- [ ] **Step 2:** `npm test -- constituicao` → FAIL.

- [ ] **Step 3: Implementar `constituicao.ts`**

```ts
import { validarDocumento } from "@/lib/validation/documento";

const REGIMES = new Set(["Simples", "Presumido", "Real"]);

export type SocioInput = { nome: string; cpf: string | null; participacao: string | null; papelSocietario: "administrador" | "quotista" | null; nascimento?: string | null; identidade?: string | null; estadoCivil?: string | null; endereco?: string | null; telefone?: string | null; email?: string | null };
export type DadosConstituicao = { razaoSocial: string; nomeFantasia: string | null; regime: string; endereco: Record<string, string> | null; observacoes: string | null; socios: SocioInput[]; representante: Record<string, string> | null };

export function normalizarConstituicao(fd: FormData): DadosConstituicao | { erro: string } {
  const t = (k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
  const razaoSocial = t("razao_social");
  if (!razaoSocial) return { erro: "Informe a razão social pretendida." };
  const regime = t("regime");
  if (!REGIMES.has(regime)) return { erro: "Regime pretendido inválido." };

  const endereco: Record<string, string> = {};
  for (const c of ["logradouro", "numero", "bairro", "cidade", "uf", "cep"]) {
    let v = t(c, 120); if (c === "uf") v = v.toUpperCase().slice(0, 2); if (v) endereco[c] = v;
  }

  let socios: SocioInput[] = [];
  try {
    const raw = JSON.parse(String(fd.get("socios") ?? "[]"));
    if (Array.isArray(raw)) socios = raw.filter((s) => s && typeof s.nome === "string" && s.nome.trim()).map((s) => ({
      nome: String(s.nome).trim().slice(0, 160),
      cpf: s.cpf ? String(s.cpf).replace(/\D/g, "") || null : null,
      participacao: s.participacao ? String(s.participacao).slice(0, 20) : null,
      papelSocietario: s.papelSocietario === "administrador" ? "administrador" : s.papelSocietario === "quotista" ? "quotista" : null,
      nascimento: s.nascimento ?? null, identidade: s.identidade ?? null, estadoCivil: s.estadoCivil ?? null,
      endereco: s.endereco ?? null, telefone: s.telefone ?? null, email: s.email ?? null,
    }));
  } catch { socios = []; }

  const admin = socios.find((s) => s.papelSocietario === "administrador") ?? socios[0] ?? null;
  const representante = admin ? { nome: admin.nome } : null;

  return {
    razaoSocial,
    nomeFantasia: t("nome_fantasia") || null,
    regime,
    endereco: Object.keys(endereco).length ? endereco : null,
    observacoes: t("observacoes", 2000) || null,
    socios,
    representante,
  };
}

export function validarAtivacao(cpfCnpj: string, regime: string): { erro?: string } {
  const d = cpfCnpj.replace(/\D/g, "");
  if (!validarDocumento("PJ", d)) return { erro: "CNPJ inválido." };
  if (!REGIMES.has(regime)) return { erro: "Regime inválido." };
  return {};
}
```

- [ ] **Step 4: `rotuloStatusCliente` em `apresentacao.ts`**

```ts
export function rotuloStatusCliente(status: string): string {
  if (status === "em_constituicao") return "Em constituição";
  if (status === "ativo") return "Ativo";
  if (status === "inativo") return "Inativo";
  return status;
}
```

- [ ] **Step 5:** `npm test -- constituicao` → PASS. `npm run typecheck && npm run lint`.
- [ ] **Step 6:** commit `feat: libs de constituição (normalização, ativação, rótulo de status)`

---

### Task 3: Ações — criar e ativar

**Files:** Create `src/app/(app)/clientes/constituicao-actions.ts`

**Interfaces:**
- `criarEmpresaConstituicao(formData): Promise<{ id?: string; processoId?: string; erro?: string }>`
- `ativarEmpresa(clienteId: string, formData: FormData): Promise<{ ok?: boolean; erro?: string }>`

- [ ] **Step 1: Escrever**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { createServerSupabase } from "@/lib/supabase/server";
import { normalizarConstituicao, validarAtivacao } from "@/lib/clientes/constituicao";
import { iniciarProcesso } from "@/app/(app)/legalizacao/actions";

export async function criarEmpresaConstituicao(formData: FormData): Promise<{ id?: string; processoId?: string; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeCriarCliente(perfil.papel)) return { erro: "Sem permissão." };
  const dados = normalizarConstituicao(formData);
  if ("erro" in dados) return { erro: dados.erro };

  const supabase = await createServerSupabase();
  const contadorId = String(formData.get("contador_id") ?? "") || null;
  const { data: cli, error } = await supabase.from("clientes").insert({
    tipo_pessoa: "PJ",
    razao_social: dados.razaoSocial,
    nome_fantasia: dados.nomeFantasia,
    cpf_cnpj: null,
    regime_tributario: dados.regime,
    endereco: dados.endereco,
    observacoes: dados.observacoes,
    socios: dados.socios,
    representante: dados.representante,
    contador_id: contadorId,
    status: "em_constituicao",
  }).select("id").single();
  if (error || !cli) return { erro: "Falha ao criar a empresa (verifique os dados)." };
  const clienteId = cli.id as string;

  let processoId: string | undefined;
  const modeloId = String(formData.get("modelo_abertura") ?? "");
  const dataInicio = String(formData.get("data_inicio") ?? "");
  if (modeloId && dataInicio) {
    const r = await iniciarProcesso(clienteId, modeloId, dataInicio);
    if (r.id) processoId = r.id;
  }
  revalidatePath("/clientes");
  return { id: clienteId, processoId };
}

export async function ativarEmpresa(clienteId: string, formData: FormData): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeCriarCliente(perfil.papel)) return { erro: "Sem permissão." };
  const cpfCnpj = String(formData.get("cpf_cnpj") ?? "");
  const regime = String(formData.get("regime_tributario") ?? "");
  const v = validarAtivacao(cpfCnpj, regime);
  if (v.erro) return { erro: v.erro };
  const digits = cpfCnpj.replace(/\D/g, "");
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("clientes").update({
    cpf_cnpj: digits,
    regime_tributario: regime,
    inscricao_estadual: String(formData.get("inscricao_estadual") ?? "").trim() || null,
    inscricao_municipal: String(formData.get("inscricao_municipal") ?? "").trim() || null,
    status: "ativo",
    atualizado_em: new Date().toISOString(),
  }).eq("id", clienteId);
  if (error) return { erro: "Falha ao ativar (CNPJ já cadastrado?)." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
```

- [ ] **Step 2:** `npm run lint && npm run typecheck`.
- [ ] **Step 3:** commit `feat: ações de empresa em constituição (criar, ativar)`

---

### Task 4: Tela "Nova empresa em constituição" + botão na lista

**Files:**
- Create `src/app/(app)/clientes/nova-empresa/page.tsx`
- Create `src/app/(app)/clientes/nova-empresa/FormConstituicao.tsx`
- Modify `src/app/(app)/clientes/page.tsx` (botão)

- [ ] **Step 1: page.tsx (server)** — gate `podeCriarCliente`; carrega `listarContadores()` e os modelos de abertura (`legalizacao_template` tipo `abertura_simples`/`abertura_presumido`, ativos); passa `hoje`; renderiza `FormConstituicao`.

- [ ] **Step 2: FormConstituicao.tsx (client)** — campos: razão social, nome fantasia, endereço (logradouro/número/bairro/cidade/uf/cep), regime pretendido (Simples/Presumido/Real), contador (select), **sócios** (lista dinâmica: nome, CPF, %, administrador/quotista — serializada em input hidden `socios` via JSON no submit), observações, **modelo de abertura** (select dos modelos) + **data de início**. Usa `useActionState(criarEmpresaConstituicao, {})`; ao `id`, redireciona para `/legalizacao/{processoId}` se houver, senão `/clientes/{id}`.

- [ ] **Step 3: botão na lista** — em `clientes/page.tsx`, dentro de `acoes` do PageHeader, antes de "Novo cliente":

```tsx
{podeCriar && (
  <Link href="/clientes/nova-empresa">
    <Botao variante="secundario">Nova empresa (em constituição)</Botao>
  </Link>
)}
```

- [ ] **Step 4:** `npm run lint && npm run typecheck`.
- [ ] **Step 5:** commit `feat: tela nova empresa em constituição + botão na lista`

---

### Task 5: Ficha (selo + ativar) e lista (selo + CNPJ "—")

**Files:**
- Create `src/components/clientes/AtivarEmpresa.tsx`
- Modify `src/app/(app)/clientes/[id]/page.tsx` (selo + AtivarEmpresa quando em_constituicao)
- Modify `src/app/(app)/clientes/page.tsx` (selo na linha + CNPJ nulo → "—")

- [ ] **Step 1: `AtivarEmpresa.tsx` (client)** — form com CNPJ, regime (select), IE, IM → `ativarEmpresa(clienteId, fd)` via `useActionState`; ao ok, `router.refresh()`. Renderizado só quando `status='em_constituicao'`.

- [ ] **Step 2: ficha** — quando `cliente.status === 'em_constituicao'`, exibir um aviso/selo "Em constituição" no topo e o bloco `AtivarEmpresa`. Import de `rotuloStatusCliente`.

- [ ] **Step 3: lista** — na linha do cliente, exibir selo quando `em_constituicao`; onde mostra CNPJ, usar `cpf_cnpj ?? "—"`.

- [ ] **Step 4:** `npm run lint && npm run typecheck && npm test`.
- [ ] **Step 5:** commit `feat: ficha e lista tratam empresa em constituição (selo, ativar, CNPJ vazio)`

---

### Task 6: RLS test + documentação

**Files:** Modify `supabase/tests/rls.test.sql`, `docs/DOCUMENTACAO.md`

- [ ] **Step 1: Assert RLS/constraint**

```sql
-- ASSERT: cliente em_constituicao pode ter CNPJ nulo; ativo sem CNPJ é barrado pela constraint
do $$
declare cid uuid; ok boolean;
begin
  reset role;
  insert into clientes (tipo_pessoa, razao_social, cpf_cnpj, regime_tributario, status)
    values ('PJ','Nova Em Constituicao', null, 'Simples', 'em_constituicao') returning id into cid;
  if cid is null then raise exception 'FALHA: não criou em_constituicao sem CNPJ'; end if;

  ok := true;
  begin
    insert into clientes (tipo_pessoa, razao_social, cpf_cnpj, regime_tributario, status)
      values ('PJ','Sem CNPJ Ativo', null, 'Simples', 'ativo');
  exception when check_violation then ok := false; end;
  if ok then raise exception 'FALHA: aceitou cliente ativo sem CNPJ'; end if;

  delete from clientes where id = cid; -- limpeza (rollback do harness também cobre)
  raise notice 'OK: em_constituicao aceita CNPJ nulo; ativo sem CNPJ barrado';
end $$;
```

- [ ] **Step 2:** `npm run db:test 2>&1 | grep -iE "em_constituicao|FALHA"` → OK, sem FALHA. Total falhas `0`.

- [ ] **Step 3: docs** — em `DOCUMENTACAO.md`, seção Clientes: registrar o fluxo de **empresa em constituição** (status próprio, CNPJ opcional só nesse status, criação enxuta + início da abertura, ativação quando sai o CNPJ; obrigações/cobrança só após ativar). Citar Fatia 2 (import do PDF) como próxima.

- [ ] **Step 4:** commit `test+docs: RLS de empresa em constituição e documentação`

---

## Self-Review
- Status + CNPJ opcional + sócios → T1. ✔
- Normalização/ativação/rótulo → T2. ✔
- Criar + iniciar abertura + ativar → T3. ✔
- Tela + botão → T4. ✔
- Ficha/lista → T5. ✔
- RLS + docs → T6. ✔
- Geradores (obrigações/mensalidades) já exigem `ativo` — sem alteração.
