# Boletos — Fatia 1: fundação + seletor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A base do módulo de boletos — configurar/escolher o provedor (Inter ou Asaas) com credenciais cifradas e definir o contrato dos adaptadores. Nada emite ainda.

**Architecture:** Config singleton `boleto_config` (credenciais cifradas); wrapper de cripto dedicado; interface `ProvedorBoleto`; helper puro de status; UI em Configurações → Boletos. Spec: `docs/superpowers/specs/2026-07-08-boletos-fatia1-fundacao-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase, Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`. Todos passam.
- Migration idempotente via `npm run db:migrate` (banco compartilhado, atinge prod). Imutável após aplicada.
- Gate `podeGerenciarFinanceiro` (admin/financeiro). RLS por papel (`auth_papel() in ('admin','financeiro')`).
- Cripto por domínio: chave dedicada `BOLETO_CRIPTO_KEY`. Segredos nunca voltam ao cliente.
- Branch: `git checkout -b feat/boletos-fatia1 develop`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `supabase/migrations/0058_boleto_config.sql` — **novo**: enums + tabela singleton + RLS.
- `src/lib/boleto/cripto.ts` — **novo**: `cifrarCredencial`/`decifrarCredencial`.
- `src/lib/boleto/tipos.ts` — **novo**: interface `ProvedorBoleto` + tipos.
- `src/lib/boleto/config.ts` — **novo**: `ConfigBoletoView` + `statusConfigBoleto`.
- `src/tests/boleto/config.test.ts` — **novo**.
- `src/app/(app)/configuracoes/boletos/actions.ts` — **novo**: obter/salvar config.
- `src/app/(app)/configuracoes/boletos/FormBoletos.tsx` + `page.tsx` — **novo**: UI.
- `src/app/(app)/configuracoes/page.tsx` — **modificar**: card "Boletos".
- `src/tests/boleto/form-boletos-render.test.tsx` — **novo**: smoke.

---

## Task 1: Migration — boleto_config

**Files:**
- Create: `supabase/migrations/0058_boleto_config.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Boletos Fatia 1: configuração do provedor (credenciais cifradas).
do $$ begin create type boleto_provedor as enum ('nenhum','inter','asaas'); exception when duplicate_object then null; end $$;
do $$ begin create type boleto_ambiente as enum ('sandbox','producao'); exception when duplicate_object then null; end $$;

create table if not exists boleto_config (
  id int primary key default 1,
  provedor boleto_provedor not null default 'nenhum',
  asaas_api_key_cifrada text,
  asaas_ambiente boleto_ambiente not null default 'producao',
  inter_client_id_cifrado text,
  inter_client_secret_cifrado text,
  inter_conta_corrente text,
  inter_cert_cifrado text,
  inter_key_cifrado text,
  atualizado_em timestamptz not null default now(),
  constraint boleto_config_singleton check (id = 1)
);
alter table boleto_config enable row level security;
drop policy if exists boleto_config_rw on boleto_config;
create policy boleto_config_rw on boleto_config for all
  using (auth_papel() in ('admin','financeiro')) with check (auth_papel() in ('admin','financeiro'));
insert into boleto_config (id) values (1) on conflict (id) do nothing;
```

- [ ] **Step 2: Aplicar e verificar**

Run: `npm run db:migrate`
Expected: "1 migration(s) nova(s) aplicada(s)."
```bash
node --env-file=.env.local -e "import('./scripts/_db.mjs').then(async({makeClient})=>{const c=makeClient();await c.connect();const r=await c.query(\"select provedor from boleto_config where id=1\");console.log('boleto_config:', r.rows[0]?.provedor ?? 'SEM LINHA');await c.end();});"
```
Expected: `boleto_config: nenhum`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0058_boleto_config.sql
git commit -m "feat(boletos): migration boleto_config (provedor + credenciais cifradas)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Cripto + contrato (tipos)

**Files:**
- Create: `src/lib/boleto/cripto.ts`
- Create: `src/lib/boleto/tipos.ts`

**Interfaces:**
- Consumes: `cifrar`/`decifrar` (`@/lib/nfse/cripto`).
- Produces: `cifrarCredencial(valor)`, `decifrarCredencial(pacote)`; `ProvedorBoleto`, `DadosEmissao`, `BoletoEmitido`, `EventoPagamento`, `BoletoProvedor`.

- [ ] **Step 1: `cripto.ts`**

```ts
import { cifrar, decifrar } from "@/lib/nfse/cripto";

function chave(): string {
  const k = process.env.BOLETO_CRIPTO_KEY;
  if (!k) throw new Error("BOLETO_CRIPTO_KEY não configurada");
  return k;
}

export function cifrarCredencial(valor: string): string {
  return cifrar(Buffer.from(valor, "utf8"), chave());
}

export function decifrarCredencial(pacote: string): string {
  return decifrar(pacote, chave()).toString("utf8");
}
```

- [ ] **Step 2: `tipos.ts`**

```ts
export type BoletoProvedor = "inter" | "asaas";

export type DadosEmissao = {
  valor: number;
  vencimento: string; // YYYY-MM-DD
  pagadorNome: string;
  pagadorDocumento: string; // CPF/CNPJ (dígitos)
  pagadorEmail: string | null;
  descricao: string;
  seuNumero: string;
};

export type BoletoEmitido = {
  provedorBoletoId: string;
  nossoNumero: string | null;
  linhaDigitavel: string | null;
  pixCopiaCola: string | null;
  urlPdf: string | null;
};

export type EventoPagamento = {
  provedorBoletoId: string;
  pago: boolean;
  valorPago: number | null;
  pagoEm: string | null;
};

export interface ProvedorBoleto {
  emitir(dados: DadosEmissao): Promise<BoletoEmitido>;
  interpretarWebhook(payload: unknown): EventoPagamento | null;
}
```

- [ ] **Step 3: Verificar + commit**

Run: `npm run lint && npm run typecheck` (sem erros).
```bash
git add src/lib/boleto/cripto.ts src/lib/boleto/tipos.ts
git commit -m "feat(boletos): cripto de credenciais + contrato ProvedorBoleto

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Helper puro de status (TDD)

**Files:**
- Create: `src/lib/boleto/config.ts`
- Test: `src/tests/boleto/config.test.ts`

**Interfaces:**
- Produces: `type ConfigBoletoView`; `statusConfigBoleto(c): { provedor: string; configurado: boolean }`.

- [ ] **Step 1: Testes**

```ts
import { describe, it, expect } from "vitest";
import { statusConfigBoleto, type ConfigBoletoView } from "@/lib/boleto/config";

const base: ConfigBoletoView = { provedor: "nenhum", asaasAmbiente: "producao", interContaCorrente: null, asaasApiKeyDefinida: false, interClientIdDefinido: false, interClientSecretDefinido: false, interCertDefinido: false, interKeyDefinida: false };

describe("statusConfigBoleto", () => {
  it("nenhum → não configurado", () => {
    expect(statusConfigBoleto(base)).toEqual({ provedor: "nenhum", configurado: false });
  });
  it("asaas com api key → configurado", () => {
    expect(statusConfigBoleto({ ...base, provedor: "asaas", asaasApiKeyDefinida: true })).toEqual({ provedor: "asaas", configurado: true });
  });
  it("asaas sem api key → não configurado", () => {
    expect(statusConfigBoleto({ ...base, provedor: "asaas" }).configurado).toBe(false);
  });
  it("inter completo → configurado", () => {
    expect(statusConfigBoleto({ ...base, provedor: "inter", interContaCorrente: "123", interClientIdDefinido: true, interClientSecretDefinido: true, interCertDefinido: true, interKeyDefinida: true }).configurado).toBe(true);
  });
  it("inter faltando a chave → não configurado", () => {
    expect(statusConfigBoleto({ ...base, provedor: "inter", interContaCorrente: "123", interClientIdDefinido: true, interClientSecretDefinido: true, interCertDefinido: true, interKeyDefinida: false }).configurado).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- boleto/config` → FAIL.

- [ ] **Step 3: Implementar `config.ts`**

```ts
export type ConfigBoletoView = {
  provedor: "nenhum" | "inter" | "asaas";
  asaasAmbiente: "sandbox" | "producao";
  interContaCorrente: string | null;
  asaasApiKeyDefinida: boolean;
  interClientIdDefinido: boolean;
  interClientSecretDefinido: boolean;
  interCertDefinido: boolean;
  interKeyDefinida: boolean;
};

export function statusConfigBoleto(c: ConfigBoletoView): { provedor: string; configurado: boolean } {
  if (c.provedor === "asaas") return { provedor: "asaas", configurado: c.asaasApiKeyDefinida };
  if (c.provedor === "inter") return { provedor: "inter", configurado: c.interClientIdDefinido && c.interClientSecretDefinido && c.interCertDefinido && c.interKeyDefinida && !!c.interContaCorrente };
  return { provedor: "nenhum", configurado: false };
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- boleto/config` (PASS), `npm run lint`, `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/boleto/config.ts src/tests/boleto/config.test.ts
git commit -m "feat(boletos): helper statusConfigBoleto (TDD)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Actions de config

**Files:**
- Create: `src/app/(app)/configuracoes/boletos/actions.ts`

**Interfaces:**
- Consumes: `cifrarCredencial` (Task 2); `ConfigBoletoView` (Task 3); `podeGerenciarFinanceiro`.
- Produces: `obterConfigBoleto()`, `type SalvarInput`, `salvarConfigBoleto(input)`.

- [ ] **Step 1: Criar `actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { cifrarCredencial } from "@/lib/boleto/cripto";
import type { ConfigBoletoView } from "@/lib/boleto/config";

export type SalvarInput = { provedor: "nenhum" | "inter" | "asaas"; asaasAmbiente: "sandbox" | "producao"; interContaCorrente: string | null; asaasApiKey?: string | null; interClientId?: string | null; interClientSecret?: string | null; interCert?: string | null; interKey?: string | null };

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarFinanceiro(p.papel)) return null;
  return p;
}

export async function obterConfigBoleto(): Promise<ConfigBoletoView> {
  const vazio: ConfigBoletoView = { provedor: "nenhum", asaasAmbiente: "producao", interContaCorrente: null, asaasApiKeyDefinida: false, interClientIdDefinido: false, interClientSecretDefinido: false, interCertDefinido: false, interKeyDefinida: false };
  if (!(await gate())) return vazio;
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("boleto_config").select("provedor, asaas_api_key_cifrada, asaas_ambiente, inter_client_id_cifrado, inter_client_secret_cifrado, inter_conta_corrente, inter_cert_cifrado, inter_key_cifrado").eq("id", 1).maybeSingle();
  if (!data) return vazio;
  const def = (v: unknown) => typeof v === "string" && v.length > 0;
  return {
    provedor: data.provedor as "nenhum" | "inter" | "asaas",
    asaasAmbiente: data.asaas_ambiente as "sandbox" | "producao",
    interContaCorrente: (data.inter_conta_corrente as string | null) ?? null,
    asaasApiKeyDefinida: def(data.asaas_api_key_cifrada),
    interClientIdDefinido: def(data.inter_client_id_cifrado),
    interClientSecretDefinido: def(data.inter_client_secret_cifrado),
    interCertDefinido: def(data.inter_cert_cifrado),
    interKeyDefinida: def(data.inter_key_cifrado),
  };
}

export async function salvarConfigBoleto(input: SalvarInput): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const patch: Record<string, unknown> = { provedor: input.provedor, asaas_ambiente: input.asaasAmbiente, inter_conta_corrente: input.interContaCorrente, atualizado_em: new Date().toISOString() };
  try {
    if (input.asaasApiKey) patch.asaas_api_key_cifrada = cifrarCredencial(input.asaasApiKey);
    if (input.interClientId) patch.inter_client_id_cifrado = cifrarCredencial(input.interClientId);
    if (input.interClientSecret) patch.inter_client_secret_cifrado = cifrarCredencial(input.interClientSecret);
    if (input.interCert) patch.inter_cert_cifrado = cifrarCredencial(input.interCert);
    if (input.interKey) patch.inter_key_cifrado = cifrarCredencial(input.interKey);
  } catch {
    return { erro: "BOLETO_CRIPTO_KEY não configurada." };
  }
  const { error } = await supabase.from("boleto_config").update(patch).eq("id", 1);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath("/configuracoes/boletos");
  return { ok: true };
}
```

- [ ] **Step 2: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build` (sem erros).
```bash
git add "src/app/(app)/configuracoes/boletos/actions.ts"
git commit -m "feat(boletos): actions obter/salvar config (credenciais cifradas)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: UI — Configurações → Boletos

**Files:**
- Create: `src/app/(app)/configuracoes/boletos/FormBoletos.tsx`
- Create: `src/app/(app)/configuracoes/boletos/page.tsx`
- Modify: `src/app/(app)/configuracoes/page.tsx`
- Test: `src/tests/boleto/form-boletos-render.test.tsx`

**Interfaces:**
- Consumes: `salvarConfigBoleto`, `obterConfigBoleto` (Task 4); `ConfigBoletoView` (Task 3).

- [ ] **Step 1: Smoke test**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/boletos/actions", () => ({ salvarConfigBoleto: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { FormBoletos } from "@/app/(app)/configuracoes/boletos/FormBoletos";
import type { ConfigBoletoView } from "@/lib/boleto/config";

const base: ConfigBoletoView = { provedor: "asaas", asaasAmbiente: "producao", interContaCorrente: null, asaasApiKeyDefinida: true, interClientIdDefinido: false, interClientSecretDefinido: false, interCertDefinido: false, interKeyDefinida: false };

describe("FormBoletos", () => {
  it("mostra seletor e campos do provedor ativo (asaas)", () => {
    const html = renderToStaticMarkup(<FormBoletos config={base} />);
    expect(html).toContain("Provedor");
    expect(html).toContain("API key");
  });
  it("inter mostra certificado", () => {
    const html = renderToStaticMarkup(<FormBoletos config={{ ...base, provedor: "inter", asaasApiKeyDefinida: false }} />);
    expect(html).toContain("Certificado");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- form-boletos-render` → FAIL.

- [ ] **Step 3: `FormBoletos.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { salvarConfigBoleto } from "./actions";
import type { ConfigBoletoView } from "@/lib/boleto/config";
import { Botao } from "@/components/ui/Botao";

type Prov = "nenhum" | "inter" | "asaas";
const inputCls = "mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm";

export function FormBoletos({ config }: { config: ConfigBoletoView }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [provedor, setProvedor] = useState<Prov>(config.provedor);
  const [asaasAmbiente, setAsaasAmbiente] = useState<"sandbox" | "producao">(config.asaasAmbiente);
  const [interConta, setInterConta] = useState(config.interContaCorrente ?? "");
  const [asaasApiKey, setAsaasApiKey] = useState("");
  const [interClientId, setInterClientId] = useState("");
  const [interClientSecret, setInterClientSecret] = useState("");
  const [interCert, setInterCert] = useState("");
  const [interKey, setInterKey] = useState("");

  const ph = (definida: boolean) => (definida ? "•••• já definida — deixe em branco para manter" : "");

  async function salvar() {
    setOcupado(true);
    const r = await salvarConfigBoleto({ provedor, asaasAmbiente, interContaCorrente: interConta || null, asaasApiKey: asaasApiKey || null, interClientId: interClientId || null, interClientSecret: interClientSecret || null, interCert: interCert || null, interKey: interKey || null });
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    alert("Configuração salva.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-creme px-3 py-2 text-xs text-cinza">A emissão de boletos entra nas próximas etapas; aqui você só escolhe e configura o provedor.</p>

      <label className="block text-sm text-cinza">Provedor
        <select value={provedor} onChange={(e) => setProvedor(e.target.value as Prov)} className={inputCls}>
          <option value="nenhum">Nenhum</option>
          <option value="asaas">Asaas</option>
          <option value="inter">Banco Inter</option>
        </select>
      </label>

      {provedor === "asaas" && (
        <div className="space-y-2 rounded-2xl border border-linha bg-white p-3">
          <h3 className="font-display text-sm font-semibold text-texto">Asaas</h3>
          <label className="block text-xs text-cinza">API key
            <input type="password" value={asaasApiKey} onChange={(e) => setAsaasApiKey(e.target.value)} placeholder={ph(config.asaasApiKeyDefinida)} className={inputCls} />
          </label>
          <label className="block text-xs text-cinza">Ambiente
            <select value={asaasAmbiente} onChange={(e) => setAsaasAmbiente(e.target.value as "sandbox" | "producao")} className={inputCls}>
              <option value="producao">Produção</option>
              <option value="sandbox">Sandbox</option>
            </select>
          </label>
        </div>
      )}

      {provedor === "inter" && (
        <div className="space-y-2 rounded-2xl border border-linha bg-white p-3">
          <h3 className="font-display text-sm font-semibold text-texto">Banco Inter</h3>
          <label className="block text-xs text-cinza">Client ID
            <input type="password" value={interClientId} onChange={(e) => setInterClientId(e.target.value)} placeholder={ph(config.interClientIdDefinido)} className={inputCls} />
          </label>
          <label className="block text-xs text-cinza">Client Secret
            <input type="password" value={interClientSecret} onChange={(e) => setInterClientSecret(e.target.value)} placeholder={ph(config.interClientSecretDefinido)} className={inputCls} />
          </label>
          <label className="block text-xs text-cinza">Conta corrente
            <input value={interConta} onChange={(e) => setInterConta(e.target.value)} className={inputCls} />
          </label>
          <label className="block text-xs text-cinza">Certificado (PEM)
            <textarea value={interCert} onChange={(e) => setInterCert(e.target.value)} rows={3} placeholder={ph(config.interCertDefinido) || "-----BEGIN CERTIFICATE-----"} className={inputCls} />
          </label>
          <label className="block text-xs text-cinza">Chave (PEM)
            <textarea value={interKey} onChange={(e) => setInterKey(e.target.value)} rows={3} placeholder={ph(config.interKeyDefinida) || "-----BEGIN PRIVATE KEY-----"} className={inputCls} />
          </label>
        </div>
      )}

      <div className="flex justify-end">
        <Botao variante="primario" disabled={ocupado} onClick={salvar}>Salvar</Botao>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar** — `npm test -- form-boletos-render` → PASS.

- [ ] **Step 5: `boletos/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormBoletos } from "./FormBoletos";
import { obterConfigBoleto } from "./actions";

export default async function BoletosConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const config = await obterConfigBoleto();
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4">
      <PageHeader titulo="Boletos" subtitulo="Provedor de emissão (Inter ou Asaas)" />
      <FormBoletos config={config} />
    </main>
  );
}
```

- [ ] **Step 6: Card "Boletos" no índice de Configurações**

Em `src/app/(app)/configuracoes/page.tsx`, adicionar ao array `ITENS` (após a entrada de pagamento):
```tsx
  { href: "/configuracoes/boletos", label: "Boletos", desc: "Provedor de emissão (Inter ou Asaas) e credenciais." },
```

- [ ] **Step 7: Suite completa** — `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde; rota `/configuracoes/boletos` compila).

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/configuracoes/boletos" "src/app/(app)/configuracoes/page.tsx" src/tests/boleto/form-boletos-render.test.tsx
git commit -m "feat(boletos): Configurações → Boletos (seletor + credenciais)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Boletos (fundação):** Configurações → Boletos permite escolher o provedor de emissão (Banco Inter ou
  Asaas) e guardar as credenciais cifradas. A emissão em si vem nas próximas etapas. Requer a variável
  `BOLETO_CRIPTO_KEY` para salvar credenciais.
```

- [ ] **Step 2: Commit + finalizar**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog da fundação de boletos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois usar `superpowers:finishing-a-development-branch`. (Migration 0058 já aplicada. **Novo segredo:** `BOLETO_CRIPTO_KEY` — só é necessário quando forem salvar credenciais, o que acontece nas próximas fatias; lembrar o usuário.)

---

## Self-Review

- **Cobertura do spec:** `boleto_config`+RLS (T1) ✓; cripto dedicada + contrato `ProvedorBoleto` (T2) ✓; `statusConfigBoleto` (T3) ✓; actions obter/salvar sem vazar segredo (T4) ✓; UI seletor + campos por provedor + card (T5) ✓; CHANGELOG + aviso da env (T6) ✓. Unit (T3) + smoke (T5) ✓.
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Consistência de tipos:** `ConfigBoletoView` (T3) usado por actions (T4) e UI (T5); `SalvarInput` (T4) casa com o payload do `FormBoletos` (T5); `cifrarCredencial` (T2) usado em salvar (T4); `ProvedorBoleto`/`DadosEmissao`/etc. (T2) ficam prontos para as Fatias 2–3.
- **Segurança:** gate `podeGerenciarFinanceiro` + RLS por papel; `obterConfigBoleto` devolve só booleanos "definida", nunca o segredo; credenciais cifradas (AES-GCM, `BOLETO_CRIPTO_KEY`); erro amigável se a env faltar.
- **Escopo:** só a fundação/config. Adaptadores, emissão, webhook, tabela `boleto` ficam nas Fatias 2–4.
