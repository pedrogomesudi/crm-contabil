# Boletos — Fatia 4a: emissão Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emitir boleto a partir de um título (contas a receber) via provedor ativo (Asaas/Inter), gravar o boleto e exibir linha digitável/PIX.

**Architecture:** Tabela `boleto` + `boleto_config.conta_bancaria_id`; fábrica `adaptadorAtivo()` (decifra config → adaptador); helper puro `dadosEmissaoDeTitulo`; action `emitirBoleto`; UI por título em contas a receber. Spec: `docs/superpowers/specs/2026-07-08-boletos-fatia4a-emissao-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase, Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`.
- Migration idempotente via `npm run db:migrate` (banco compartilhado). Gate `podeGerenciarFinanceiro`; RLS `boleto` por papel (admin/financeiro).
- Emissão real depende de conta configurada + `BOLETO_CRIPTO_KEY`; sem isso, erro amigável (esperado).
- Branch: `git checkout -b feat/boletos-fatia4a develop`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `supabase/migrations/0059_boleto.sql` — **novo**.
- `src/lib/boleto/config.ts` — **modificar**: `ConfigBoletoView.contaBancariaId`.
- `src/app/(app)/configuracoes/boletos/actions.ts` — **modificar**: `conta_bancaria_id`.
- `src/app/(app)/configuracoes/boletos/FormBoletos.tsx` + `page.tsx` — **modificar**: seletor de conta.
- `src/tests/boleto/form-boletos-render.test.tsx` — **modificar**: fixture/prop.
- `src/lib/boleto/emissao.ts` — **novo**: `dadosEmissaoDeTitulo` (puro).
- `src/tests/boleto/emissao.test.ts` — **novo**.
- `src/lib/boleto/ativo.ts` — **novo**: `adaptadorAtivo()`.
- `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts` — **novo**: `emitirBoleto`, `listarBoletosDaCompetencia`.
- `src/components/financeiro/BoletoTitulo.tsx` — **novo** + `src/tests/financeiro/boleto-titulo-render.test.tsx`.
- `src/components/financeiro/ContasReceber.tsx` — **modificar**: carregar/exibir boletos.

---

## Task 1: Migration — tabela boleto

**Files:**
- Create: `supabase/migrations/0059_boleto.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Boletos Fatia 4a: registro do boleto emitido + conta de recebimento.
do $$ begin create type boleto_status as enum ('emitido','pago','cancelado','erro'); exception when duplicate_object then null; end $$;
create sequence if not exists boleto_numero_seq;

create table if not exists boleto (
  id uuid primary key default gen_random_uuid(),
  titulo_id uuid not null references titulo(id) on delete cascade,
  numero bigint not null default nextval('boleto_numero_seq'),
  provedor text not null,
  provedor_boleto_id text,
  nosso_numero text,
  linha_digitavel text,
  pix_copia_cola text,
  url_pdf text,
  valor numeric(15,2) not null,
  vencimento date not null,
  status boleto_status not null default 'emitido',
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id) default auth.uid(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_boleto_titulo on boleto(titulo_id);
create index if not exists idx_boleto_provedor_id on boleto(provedor_boleto_id);
alter table boleto enable row level security;
drop policy if exists boleto_rw on boleto;
create policy boleto_rw on boleto for all
  using (auth_papel() in ('admin','financeiro')) with check (auth_papel() in ('admin','financeiro'));

alter table boleto_config add column if not exists conta_bancaria_id uuid references conta_bancaria(id);

create or replace function proximo_numero_boleto() returns bigint language sql security definer as $$ select nextval('boleto_numero_seq'); $$;
grant execute on function proximo_numero_boleto() to authenticated;
```

- [ ] **Step 2: Aplicar e verificar**

Run: `npm run db:migrate`
Expected: "1 migration(s) nova(s) aplicada(s)."
```bash
node --env-file=.env.local -e "import('./scripts/_db.mjs').then(async({makeClient})=>{const c=makeClient();await c.connect();const b=await c.query(\"select count(*) from boleto\");const n=await c.query('select proximo_numero_boleto() as n');console.log('boleto OK:', b.rows[0].count, '| proximo_numero:', n.rows[0].n);await c.end();});"
```
Expected: `boleto OK: 0 | proximo_numero: 1`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0059_boleto.sql
git commit -m "feat(boletos): migration da tabela boleto + conta de recebimento

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Config — conta bancária de recebimento

**Files:**
- Modify: `src/lib/boleto/config.ts`
- Modify: `src/app/(app)/configuracoes/boletos/actions.ts`
- Modify: `src/app/(app)/configuracoes/boletos/FormBoletos.tsx`
- Modify: `src/app/(app)/configuracoes/boletos/page.tsx`
- Test: `src/tests/boleto/form-boletos-render.test.tsx`

**Interfaces:**
- Produces: `ConfigBoletoView.contaBancariaId`; `SalvarInput.contaBancariaId`.

- [ ] **Step 1: `ConfigBoletoView` ganha `contaBancariaId`**

Em `src/lib/boleto/config.ts`, dentro do tipo `ConfigBoletoView`, acrescentar (após `interContaCorrente`):
```ts
  contaBancariaId: string | null;
```

- [ ] **Step 2: Actions incluem a conta**

Em `src/app/(app)/configuracoes/boletos/actions.ts`:
- No objeto `vazio` de `obterConfigBoleto`, acrescentar `contaBancariaId: null,`.
- No `select(...)` acrescentar `, conta_bancaria_id`.
- No retorno mapeado acrescentar `contaBancariaId: (data.conta_bancaria_id as string | null) ?? null,`.
- No tipo `SalvarInput`, acrescentar `contaBancariaId: string | null;` (após `interContaCorrente`).
- No `patch` de `salvarConfigBoleto`, acrescentar `conta_bancaria_id: input.contaBancariaId,`.

- [ ] **Step 3: `FormBoletos` — prop `contas` + seletor**

Na assinatura do `FormBoletos`, trocar para `{ config, contas }` com `contas: { id: string; nome: string }[]`.
Adicionar estado `const [contaBancariaId, setContaBancariaId] = useState(config.contaBancariaId ?? "");`.
No `salvarConfigBoleto({...})`, acrescentar `contaBancariaId: contaBancariaId || null,`.
Antes do botão Salvar, adicionar o seletor:
```tsx
      <label className="block text-sm text-cinza">Conta de recebimento
        <select value={contaBancariaId} onChange={(e) => setContaBancariaId(e.target.value)} className={inputCls}>
          <option value="">—</option>
          {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </label>
```

- [ ] **Step 4: `page.tsx` — carregar contas ativas**

Em `src/app/(app)/configuracoes/boletos/page.tsx`, importar `createServerSupabase` e carregar as contas:
```tsx
  const supabase = await createServerSupabase();
  const { data: contas } = await supabase.from("conta_bancaria").select("id, nome").eq("ativa", true).order("nome");
```
E passar `contas={(contas as { id: string; nome: string }[] | null) ?? []}` ao `<FormBoletos />`.
(Adicionar `import { createServerSupabase } from "@/lib/supabase/server";`.)

- [ ] **Step 5: Atualizar o smoke do FormBoletos**

Em `src/tests/boleto/form-boletos-render.test.tsx`: no `base`, acrescentar `contaBancariaId: null` ao objeto; e passar `contas={[{ id: "cb1", nome: "Inter PJ" }]}` nas duas renderizações do `<FormBoletos>`.

- [ ] **Step 6: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde).
```bash
git add src/lib/boleto/config.ts "src/app/(app)/configuracoes/boletos/actions.ts" "src/app/(app)/configuracoes/boletos/FormBoletos.tsx" "src/app/(app)/configuracoes/boletos/page.tsx" src/tests/boleto/form-boletos-render.test.tsx
git commit -m "feat(boletos): conta bancária de recebimento na config

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Helper puro dadosEmissaoDeTitulo (TDD)

**Files:**
- Create: `src/lib/boleto/emissao.ts`
- Test: `src/tests/boleto/emissao.test.ts`

**Interfaces:**
- Consumes: `DadosEmissao` (`./tipos`).
- Produces: `dadosEmissaoDeTitulo(titulo, cliente, numero): DadosEmissao`.

- [ ] **Step 1: Testes**

```ts
import { describe, it, expect } from "vitest";
import { dadosEmissaoDeTitulo } from "@/lib/boleto/emissao";

const titulo = { valor: 300, vencimento: "2026-08-10", descricao: "Honorário 07/2026" };
const cliente = { razaoSocial: "ACME LTDA", cpfCnpj: "12.345.678/0001-99", email: "a@b.com", endereco: { cep: "38.400-000", logradouro: "Rua X", numero: "10", bairro: "Centro", cidade: "Uberlândia", uf: "MG" } };

describe("dadosEmissaoDeTitulo", () => {
  it("mapeia com endereço e limpa dígitos", () => {
    const d = dadosEmissaoDeTitulo(titulo, cliente, 7);
    expect(d).toEqual({
      valor: 300, vencimento: "2026-08-10", pagadorNome: "ACME LTDA", pagadorDocumento: "12345678000199",
      pagadorEmail: "a@b.com", descricao: "Honorário 07/2026", seuNumero: "7",
      pagadorEndereco: { cep: "38400000", logradouro: "Rua X", numero: "10", bairro: "Centro", cidade: "Uberlândia", uf: "MG" },
    });
  });
  it("sem endereço → null e descrição padrão", () => {
    const d = dadosEmissaoDeTitulo({ ...titulo, descricao: null }, { ...cliente, endereco: null }, 8);
    expect(d.pagadorEndereco).toBe(null);
    expect(d.descricao).toBe("Honorários");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- boleto/emissao` → FAIL.

- [ ] **Step 3: Implementar `emissao.ts`**

```ts
import type { DadosEmissao } from "./tipos";

export function dadosEmissaoDeTitulo(
  titulo: { valor: number; vencimento: string; descricao: string | null },
  cliente: { razaoSocial: string; cpfCnpj: string; email: string | null; endereco: Record<string, string> | null },
  numero: number,
): DadosEmissao {
  const e = cliente.endereco ?? {};
  const temEnd = !!(e.cep || e.logradouro || e.cidade);
  return {
    valor: titulo.valor,
    vencimento: titulo.vencimento,
    pagadorNome: cliente.razaoSocial,
    pagadorDocumento: cliente.cpfCnpj.replace(/\D/g, ""),
    pagadorEmail: cliente.email,
    descricao: titulo.descricao ?? "Honorários",
    seuNumero: String(numero),
    pagadorEndereco: temEnd
      ? { cep: (e.cep ?? "").replace(/\D/g, ""), logradouro: e.logradouro ?? "", numero: e.numero ?? "", bairro: e.bairro ?? "", cidade: e.cidade ?? "", uf: e.uf ?? "" }
      : null,
  };
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- boleto/emissao` (PASS), `npm run lint`, `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/boleto/emissao.ts src/tests/boleto/emissao.test.ts
git commit -m "feat(boletos): helper dadosEmissaoDeTitulo (TDD)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Fábrica adaptadorAtivo + actions de emissão

**Files:**
- Create: `src/lib/boleto/ativo.ts`
- Create: `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts`

**Interfaces:**
- Consumes: `criarAdaptadorAsaas`, `criarAdaptadorInter`, `decifrarCredencial`, `dadosEmissaoDeTitulo`, `ProvedorBoleto`, `podeGerenciarFinanceiro`.
- Produces: `adaptadorAtivo()`; `type BoletoView`; `emitirBoleto(tituloId)`; `listarBoletosDaCompetencia(competencia)`.

- [ ] **Step 1: `ativo.ts`**

```ts
import { createServerSupabase } from "@/lib/supabase/server";
import { decifrarCredencial } from "./cripto";
import { criarAdaptadorAsaas } from "./asaas";
import { criarAdaptadorInter } from "./inter";
import type { ProvedorBoleto } from "./tipos";

export async function adaptadorAtivo(): Promise<{ adaptador: ProvedorBoleto; provedor: "inter" | "asaas" } | { erro: string }> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("boleto_config").select("provedor, asaas_api_key_cifrada, asaas_ambiente, inter_client_id_cifrado, inter_client_secret_cifrado, inter_conta_corrente, inter_cert_cifrado, inter_key_cifrado").eq("id", 1).maybeSingle();
  if (!data || data.provedor === "nenhum") return { erro: "Nenhum provedor de boleto configurado." };
  try {
    if (data.provedor === "asaas") {
      if (!data.asaas_api_key_cifrada) return { erro: "Asaas sem API key configurada." };
      return { adaptador: criarAdaptadorAsaas(decifrarCredencial(data.asaas_api_key_cifrada as string), data.asaas_ambiente as "sandbox" | "producao"), provedor: "asaas" };
    }
    if (!data.inter_client_id_cifrado || !data.inter_client_secret_cifrado || !data.inter_cert_cifrado || !data.inter_key_cifrado || !data.inter_conta_corrente) {
      return { erro: "Banco Inter com credenciais incompletas." };
    }
    return {
      adaptador: criarAdaptadorInter(
        decifrarCredencial(data.inter_client_id_cifrado as string),
        decifrarCredencial(data.inter_client_secret_cifrado as string),
        data.inter_conta_corrente as string,
        decifrarCredencial(data.inter_cert_cifrado as string),
        decifrarCredencial(data.inter_key_cifrado as string),
        "producao",
      ),
      provedor: "inter",
    };
  } catch {
    return { erro: "BOLETO_CRIPTO_KEY não configurada ou credenciais inválidas." };
  }
}
```

- [ ] **Step 2: `boleto-actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { adaptadorAtivo } from "@/lib/boleto/ativo";
import { dadosEmissaoDeTitulo } from "@/lib/boleto/emissao";

export type BoletoView = { id: string; numero: number; provedor: string; linhaDigitavel: string | null; pixCopiaCola: string | null; urlPdf: string | null; status: string };

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarFinanceiro(p.papel)) return null;
  return p;
}

export async function emitirBoleto(tituloId: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: t } = await supabase.from("titulo").select("id, valor, vencimento, descricao, status, cliente_id").eq("id", tituloId).maybeSingle();
  if (!t) return { erro: "Título não encontrado." };
  if (t.status !== "ABERTO" && t.status !== "VENCIDO") return { erro: "Título não está em aberto." };
  const { data: existente } = await supabase.from("boleto").select("id").eq("titulo_id", tituloId).not("status", "in", "(cancelado,erro)").maybeSingle();
  if (existente) return { erro: "Já existe boleto para este título." };
  const { data: c } = await supabase.from("clientes").select("razao_social, cpf_cnpj, email, endereco").eq("id", t.cliente_id as string).maybeSingle();
  if (!c) return { erro: "Cliente não encontrado." };
  const ativo = await adaptadorAtivo();
  if ("erro" in ativo) return { erro: ativo.erro };
  const { data: n } = await supabase.rpc("proximo_numero_boleto");
  const numero = Number(n);
  const dados = dadosEmissaoDeTitulo(
    { valor: Number(t.valor), vencimento: t.vencimento as string, descricao: (t.descricao as string | null) ?? null },
    { razaoSocial: c.razao_social as string, cpfCnpj: (c.cpf_cnpj as string) ?? "", email: (c.email as string | null) ?? null, endereco: (c.endereco as Record<string, string> | null) ?? null },
    numero,
  );
  let emitido;
  try {
    emitido = await ativo.adaptador.emitir(dados);
  } catch (e) {
    return { erro: `Falha na emissão: ${(e as Error).message}` };
  }
  const { error } = await supabase.from("boleto").insert({
    titulo_id: tituloId, numero, provedor: ativo.provedor, provedor_boleto_id: emitido.provedorBoletoId,
    nosso_numero: emitido.nossoNumero, linha_digitavel: emitido.linhaDigitavel, pix_copia_cola: emitido.pixCopiaCola,
    url_pdf: emitido.urlPdf, valor: t.valor, vencimento: t.vencimento,
  });
  if (error) return { erro: "Boleto emitido no provedor, mas falhou ao gravar. Verifique antes de reemitir." };
  revalidatePath("/financeiro/contas-a-receber");
  return { ok: true };
}

export async function listarBoletosDaCompetencia(competencia: string): Promise<Record<string, BoletoView>> {
  if (!(await gate())) return {};
  const supabase = await createServerSupabase();
  const { data: titulos } = await supabase.from("titulo").select("id").eq("competencia", competencia);
  const ids = (titulos ?? []).map((t) => t.id as string);
  if (ids.length === 0) return {};
  const { data: bs } = await supabase.from("boleto").select("id, titulo_id, numero, provedor, linha_digitavel, pix_copia_cola, url_pdf, status").in("titulo_id", ids).neq("status", "cancelado").order("criado_em", { ascending: false });
  const mapa: Record<string, BoletoView> = {};
  for (const b of bs ?? []) {
    const tid = b.titulo_id as string;
    if (mapa[tid]) continue;
    mapa[tid] = { id: b.id as string, numero: Number(b.numero), provedor: b.provedor as string, linhaDigitavel: (b.linha_digitavel as string | null) ?? null, pixCopiaCola: (b.pix_copia_cola as string | null) ?? null, urlPdf: (b.url_pdf as string | null) ?? null, status: b.status as string };
  }
  return mapa;
}
```

- [ ] **Step 3: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build` (sem erros).
```bash
git add src/lib/boleto/ativo.ts "src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts"
git commit -m "feat(boletos): adaptadorAtivo + emitirBoleto + listarBoletosDaCompetencia

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: UI — emitir/exibir boleto por título

**Files:**
- Create: `src/components/financeiro/BoletoTitulo.tsx`
- Modify: `src/components/financeiro/ContasReceber.tsx`
- Test: `src/tests/financeiro/boleto-titulo-render.test.tsx`

**Interfaces:**
- Consumes: `emitirBoleto`, `listarBoletosDaCompetencia`, `BoletoView` (Task 4).

- [ ] **Step 1: Smoke test**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/financeiro/contas-a-receber/boleto-actions", () => ({ emitirBoleto: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { BoletoTitulo } from "@/components/financeiro/BoletoTitulo";
import type { BoletoView } from "@/app/(app)/financeiro/contas-a-receber/boleto-actions";

describe("BoletoTitulo", () => {
  it("sem boleto → botão emitir", () => {
    const html = renderToStaticMarkup(<BoletoTitulo tituloId="t1" boleto={null} onMudou={() => {}} />);
    expect(html).toContain("Emitir boleto");
  });
  it("com boleto → linha digitável", () => {
    const b: BoletoView = { id: "b1", numero: 7, provedor: "asaas", linhaDigitavel: "34191790010104351004791020150008291070026000", pixCopiaCola: "pix", urlPdf: null, status: "emitido" };
    const html = renderToStaticMarkup(<BoletoTitulo tituloId="t1" boleto={b} onMudou={() => {}} />);
    expect(html).toContain("Linha digitável");
    expect(html).toContain("#7");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- boleto-titulo-render` → FAIL.

- [ ] **Step 3: `BoletoTitulo.tsx`**

```tsx
"use client";
import { useState } from "react";
import { emitirBoleto, type BoletoView } from "@/app/(app)/financeiro/contas-a-receber/boleto-actions";

export function BoletoTitulo({ tituloId, boleto, onMudou }: { tituloId: string; boleto: BoletoView | null; onMudou: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  async function emitir() {
    setOcupado(true);
    const r = await emitirBoleto(tituloId);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    onMudou();
  }
  function copiar(txt: string) {
    void navigator.clipboard?.writeText(txt);
  }
  if (!boleto) {
    return (
      <button type="button" disabled={ocupado} onClick={emitir} className="text-xs text-verde underline">
        Emitir boleto
      </button>
    );
  }
  return (
    <div className="space-y-0.5 text-[11px] text-cinza">
      {boleto.linhaDigitavel && (
        <button type="button" onClick={() => copiar(boleto.linhaDigitavel!)} className="block text-left underline">
          Linha digitável: {boleto.linhaDigitavel.slice(0, 12)}… (copiar)
        </button>
      )}
      {boleto.pixCopiaCola && (
        <button type="button" onClick={() => copiar(boleto.pixCopiaCola!)} className="block text-left underline">
          PIX copia-e-cola (copiar)
        </button>
      )}
      {boleto.urlPdf && (
        <a href={boleto.urlPdf} target="_blank" rel="noreferrer" className="block underline">PDF</a>
      )}
      <span className="block">Boleto #{boleto.numero} · {boleto.status}</span>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar** — `npm test -- boleto-titulo-render` → PASS.

- [ ] **Step 5: Ligar no `ContasReceber` — imports + estado**

No topo, adicionar:
```tsx
import { listarBoletosDaCompetencia, type BoletoView } from "@/app/(app)/financeiro/contas-a-receber/boleto-actions";
import { BoletoTitulo } from "./BoletoTitulo";
```
Após `const [baixando, setBaixando] = useState<string | null>(null);`, adicionar:
```tsx
  const [boletos, setBoletos] = useState<Record<string, BoletoView>>({});
```

- [ ] **Step 6: Carregar boletos junto com os títulos**

Trocar `carregar` e a linha final de `gerar`:
```tsx
  const carregar = () =>
    start(async () => {
      if (competencia) {
        setTitulos(await listarTitulos(competencia));
        setBoletos(await listarBoletosDaCompetencia(competencia));
      }
    });
```
E em `gerar`, trocar `if (!r.erro) setTitulos(await listarTitulos(competencia));` por:
```tsx
      if (!r.erro) {
        setTitulos(await listarTitulos(competencia));
        setBoletos(await listarBoletosDaCompetencia(competencia));
      }
```

- [ ] **Step 7: Renderizar o boleto na linha**

No fim da célula de ações, trocar:
```tsx
                          Cobrar (WhatsApp)
                        </button>
                      )}
                    </td>
```
por:
```tsx
                          Cobrar (WhatsApp)
                        </button>
                      )}
                      <div className="mt-1">
                        <BoletoTitulo tituloId={t.id} boleto={boletos[t.id] ?? null} onMudou={() => start(async () => setBoletos(await listarBoletosDaCompetencia(competencia)))} />
                      </div>
                    </td>
```

- [ ] **Step 8: Suite completa** — `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde).

- [ ] **Step 9: Commit**

```bash
git add src/components/financeiro/BoletoTitulo.tsx src/components/financeiro/ContasReceber.tsx src/tests/financeiro/boleto-titulo-render.test.tsx
git commit -m "feat(boletos): emitir/exibir boleto por título em contas a receber

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Boletos — emissão:** em Contas a receber, cada título ganha "Emitir boleto" (usa o provedor configurado
  em Configurações → Boletos) e passa a exibir a linha digitável e o PIX copia-e-cola. Configure a conta de
  recebimento na tela de Boletos. (A baixa automática por pagamento vem na próxima etapa.)
```

- [ ] **Step 2: Commit + finalizar**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog da emissão de boletos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois usar `superpowers:finishing-a-development-branch`. (Migration 0059 já aplicada; sem novos segredos além do já anunciado `BOLETO_CRIPTO_KEY`.)

---

## Self-Review

- **Cobertura do spec:** tabela boleto + config column + função (T1) ✓; conta bancária na config (T2) ✓; `dadosEmissaoDeTitulo` (T3) ✓; `adaptadorAtivo` + `emitirBoleto`/`listarBoletosDaCompetencia` (T4) ✓; UI emitir/exibir por título (T5) ✓; CHANGELOG (T6) ✓. Unit (T3) + smokes (T2 FormBoletos, T5 BoletoTitulo) ✓.
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Consistência de tipos:** `ConfigBoletoView.contaBancariaId`/`SalvarInput.contaBancariaId` (T2) coerentes; `dadosEmissaoDeTitulo` (T3) produz `DadosEmissao`; `adaptadorAtivo` retorna `{ adaptador, provedor } | { erro }` consumido por `emitirBoleto` (T4); `BoletoView` (T4) usado por `BoletoTitulo` (T5); `proximo_numero_boleto` (T1) chamado via `.rpc` (T4). Fixture do FormBoletos atualizado no T2.
- **Segurança:** gate `podeGerenciarFinanceiro` nas actions; RLS `boleto` por papel; credenciais só decifradas server-side em `adaptadorAtivo`; `listarBoletosDaCompetencia` não expõe credenciais.
- **Sequência sem quebra:** T1 antes de T4 (tabela/função); T2 conserta o smoke do FormBoletos no mesmo commit; T5 depende de T4.
- **Escopo:** só emissão + exibição. Webhook/baixa + envio (4b) fora.
