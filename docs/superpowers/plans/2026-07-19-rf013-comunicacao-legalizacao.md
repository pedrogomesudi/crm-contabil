# RF-013 — Comunicação automática da legalização — Plano

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.
> Spec: `docs/superpowers/specs/2026-07-19-rf013-comunicacao-legalizacao-design.md`.

**Objetivo:** ao concluir uma etapa de legalização "avisar cliente", enviar automaticamente o status ao
cliente (e-mail/WhatsApp), com opt-out por cliente — no lugar do checkbox manual.

**Arquitetura:** um portão puro `deveAvisar` (testável); o envio acontece dentro de `atualizarEtapa`
(event-based, sem cron), reusando os canais existentes; config global admin + flag por cliente. Migration.

**Stack:** Next.js 16 (Server Actions), Supabase, TypeScript, vitest.

## Global Constraints

- **Gatilho:** só ao concluir uma etapa (`status` → `concluido`/`isenta`) que tem `avisar_cliente`; imediato,
  **sem cron**. Grava `legalizacao_etapa.cliente_avisado_em` só em **sucesso** de envio.
- **Canal configurável global** (`legalizacao_config.canal` `email`|`whatsapp`) + interruptor `ativo`.
- **Opt-out por cliente:** `clientes.comunicar_legalizacao` (padrão **true**).
- **Falha de envio não trava a conclusão** — a action devolve `{ ok:true, aviso:"…" }` e deixa
  `cliente_avisado_em` nulo.
- **Reuso:** `aplicarVariaveis` (`@/lib/comercial/followup`), `enviarEmail` (`@/lib/email/enviar`),
  `enviarTexto`+`ZapiConfig` (`@/lib/whatsapp/zapi`), `decifrarDominio` (`@/lib/cripto/envelope`),
  `normalizarTelefone` (`@/lib/whatsapp/mensagem`), `rotuloOrgao` (`@/lib/legalizacao/tipos`),
  `formatarData` (`@/lib/format`).
- **Gate:** a config e o toggle usam o gate existente (`podeGerenciarLegalizacao`/admin conforme a tela).
- **Migration idempotente**; aplicar com `npm run db:migrate` (posso rodar em produção pelo runner, com o OK
  do Pedro). **Migração em produção antes do deploy.**
- **`main` protegido:** PR `develop → main`, `verify` verde. Release com bump + CHANGELOG. Deploy manual.
- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`,
  `npm run build`.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `supabase/migrations/0106_legalizacao_comunicacao.sql` | **Criar** — `legalizacao_config` + `clientes.comunicar_legalizacao` | 1 |
| `src/lib/legalizacao/aviso.ts` | **Criar** — `deveAvisar` | 2 |
| `src/tests/legalizacao/aviso.test.ts` | **Criar** — testes | 2 |
| `src/app/(app)/configuracoes/legalizacao/comunicacao-actions.ts` | **Criar** — load/salvar config (admin) | 3 |
| `src/app/(app)/configuracoes/legalizacao/FormComunicacaoLeg.tsx` | **Criar** — seção de config | 3 |
| `src/app/(app)/configuracoes/legalizacao/page.tsx` | **Modificar** — montar a seção | 3 |
| `src/tests/legalizacao/comunicacao-render.test.tsx` | **Criar** — render | 3 |
| `src/app/(app)/legalizacao/actions.ts` | **Modificar** — envio no `atualizarEtapa` | 4 |
| `src/app/(app)/clientes/[id]/legalizacao-pref.ts` + UI | **Criar/Modificar** — toggle por cliente | 5 |
| `CHANGELOG.md` + `package.json` | **Modificar** — release 6.22.0 | 6 |

---

### Task 1: Migration

**Files:**
- Create: `supabase/migrations/0106_legalizacao_comunicacao.sql`

**Interfaces:**
- Produces: `legalizacao_config` (singleton), `clientes.comunicar_legalizacao`.

- [ ] **Step 1: Escrever a migration**

```sql
-- RF-013: comunicação automática de status da legalização.
create table if not exists legalizacao_config (
  id boolean primary key default true,
  canal text not null default 'email',       -- 'email' | 'whatsapp'
  ativo boolean not null default false,
  assunto text,
  template text not null default 'Olá {cliente}, a etapa "{etapa}" do processo "{processo}" foi concluída em {data}.'
);
do $$ begin
  alter table legalizacao_config drop constraint if exists legalizacao_config_id_chk;
  alter table legalizacao_config add constraint legalizacao_config_id_chk check (id);
  alter table legalizacao_config drop constraint if exists legalizacao_config_canal_chk;
  alter table legalizacao_config add constraint legalizacao_config_canal_chk check (canal in ('email','whatsapp'));
end $$;

alter table clientes add column if not exists comunicar_legalizacao boolean not null default true;

-- RLS: leitura para a equipe; escrita só admin (padrão da 0103).
alter table legalizacao_config enable row level security;
drop policy if exists legalizacao_config_read on legalizacao_config;
drop policy if exists legalizacao_config_write on legalizacao_config;
create policy legalizacao_config_read on legalizacao_config for select
  using (auth_papel() in ('admin','assistente','contador'));
create policy legalizacao_config_write on legalizacao_config for all
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');

insert into legalizacao_config (id) select true where not exists (select 1 from legalizacao_config);
```

- [ ] **Step 2: Aplicar no dev**

Run: `npm run db:migrate`
Expected: aplica `0106`.

- [ ] **Step 3: Conferir**

```bash
node --env-file=.env.local -e '
import("@supabase/supabase-js").then(async ({createClient})=>{
  const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
  const {data}=await s.from("legalizacao_config").select("canal, ativo");
  const {error}=await s.from("clientes").select("comunicar_legalizacao").limit(1);
  console.log("config:", JSON.stringify(data), "coluna cliente:", error? "FALTA":"ok");
});' 2>&1 | grep -v "punycode\|Deprecation\|--trace"
```
Expected: `config: [{"canal":"email","ativo":false}]  coluna cliente: ok`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0106_legalizacao_comunicacao.sql
git commit -m "feat(db): comunicacao automatica da legalizacao — config + flag por cliente (RF-013)"
```

---

### Task 2: Portão puro `deveAvisar`

**Files:**
- Create: `src/lib/legalizacao/aviso.ts`
- Test: `src/tests/legalizacao/aviso.test.ts`

**Interfaces:**
- Produces:
  - `type CfgAviso = { ativo: boolean; canal: "email" | "whatsapp" }`
  - `type EtapaAviso = { avisarCliente: boolean; jaAvisado: boolean; concluida: boolean }`
  - `deveAvisar(cfg: CfgAviso, comunicarCliente: boolean, etapa: EtapaAviso): boolean`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import { deveAvisar } from "@/lib/legalizacao/aviso";

const cfg = { ativo: true, canal: "email" as const };
const etapa = { avisarCliente: true, jaAvisado: false, concluida: true };

describe("deveAvisar", () => {
  it("avisa quando tudo alinha", () => {
    expect(deveAvisar(cfg, true, etapa)).toBe(true);
  });
  it("não avisa se o mestre está off, o cliente opta por não, a etapa não pede, não concluída ou já avisada", () => {
    expect(deveAvisar({ ...cfg, ativo: false }, true, etapa)).toBe(false);
    expect(deveAvisar(cfg, false, etapa)).toBe(false);
    expect(deveAvisar(cfg, true, { ...etapa, avisarCliente: false })).toBe(false);
    expect(deveAvisar(cfg, true, { ...etapa, concluida: false })).toBe(false);
    expect(deveAvisar(cfg, true, { ...etapa, jaAvisado: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/legalizacao/aviso.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
export type CfgAviso = { ativo: boolean; canal: "email" | "whatsapp" };
export type EtapaAviso = { avisarCliente: boolean; jaAvisado: boolean; concluida: boolean };

export function deveAvisar(cfg: CfgAviso, comunicarCliente: boolean, etapa: EtapaAviso): boolean {
  return cfg.ativo && comunicarCliente && etapa.avisarCliente && etapa.concluida && !etapa.jaAvisado;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/legalizacao/aviso.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/legalizacao/aviso.ts src/tests/legalizacao/aviso.test.ts
git commit -m "feat(legalizacao): deveAvisar (portao puro do aviso automatico)"
```

---

### Task 3: Config da comunicação (actions + seção)

**Files:**
- Create: `src/app/(app)/configuracoes/legalizacao/comunicacao-actions.ts`
- Create: `src/app/(app)/configuracoes/legalizacao/FormComunicacaoLeg.tsx`
- Modify: `src/app/(app)/configuracoes/legalizacao/page.tsx`
- Test: `src/tests/legalizacao/comunicacao-render.test.tsx`

**Interfaces:**
- Produces:
  - `type ComunicacaoView = { canal: string; ativo: boolean; assunto: string | null; template: string }`
  - `carregarComunicacaoLeg(): Promise<ComunicacaoView>`
  - `salvarComunicacaoLeg(dados: { canal: "email"|"whatsapp"; ativo: boolean; assunto: string | null; template: string }): Promise<Resp>` (gate admin)
  - `type Resp = { ok?: boolean; erro?: string }`

- [ ] **Step 1: Actions**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";

type Resp = { ok?: boolean; erro?: string };
export type ComunicacaoView = { canal: string; ativo: boolean; assunto: string | null; template: string };

async function admin() {
  const p = await getPerfilAtual();
  return p?.ativo && p.papel === "admin" ? p : null;
}

export async function carregarComunicacaoLeg(): Promise<ComunicacaoView> {
  const s = await createServerSupabase();
  const { data } = await s.from("legalizacao_config").select("canal, ativo, assunto, template").maybeSingle();
  return {
    canal: (data?.canal as string) ?? "email",
    ativo: (data?.ativo as boolean) ?? false,
    assunto: (data?.assunto as string | null) ?? null,
    template: (data?.template as string) ?? "",
  };
}

export async function salvarComunicacaoLeg(dados: {
  canal: "email" | "whatsapp";
  ativo: boolean;
  assunto: string | null;
  template: string;
}): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!["email", "whatsapp"].includes(dados.canal)) return { erro: "Canal inválido." };
  if (!dados.template.trim()) return { erro: "Informe a mensagem." };
  const s = await createServerSupabase();
  const { error } = await s
    .from("legalizacao_config")
    .update({ canal: dados.canal, ativo: dados.ativo, assunto: dados.assunto, template: dados.template.trim() })
    .eq("id", true);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath("/configuracoes/legalizacao");
  return { ok: true };
}
```

- [ ] **Step 2: Teste de render**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/legalizacao/comunicacao-actions", () => ({ salvarComunicacaoLeg: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { FormComunicacaoLeg } from "@/app/(app)/configuracoes/legalizacao/FormComunicacaoLeg";

describe("FormComunicacaoLeg", () => {
  it("renderiza canal, ativo e a mensagem", () => {
    const html = renderToStaticMarkup(
      <FormComunicacaoLeg cfg={{ canal: "email", ativo: false, assunto: "Andamento", template: "Olá {cliente}" }} />,
    );
    expect(html).toContain("Comunicação automática");
    expect(html).toContain("Canal");
    expect(html).toContain("Ativo");
    expect(html).toContain("{cliente}"); // legenda das variáveis
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/legalizacao/comunicacao-render.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 4: `FormComunicacaoLeg` (client)**

Client (`"use client"`) com o `chamar(fn)` padrão. Recebe `cfg: ComunicacaoView`. Cartão
`rounded-2xl border border-linha bg-white p-4` com título **"Comunicação automática"**:
- **Canal** `<select>` (email/whatsapp) + checkbox **Ativo** → `salvarComunicacaoLeg` no `onChange` (envia o
  objeto completo com os valores atuais dos outros campos).
- **Assunto** (`<input>`, só relevante para e-mail) e **Mensagem** (`<textarea>`) → salvos no `onBlur`.
- Legenda: `{cliente}` `{processo}` `{etapa}` `{orgao}` `{protocolo}` `{data}`.
- Inputs com `controleCls("compacto")` (regra `divida-ui`: sem `border` próprio).

- [ ] **Step 5: Montar na página de config**

Em `configuracoes/legalizacao/page.tsx`, carregar `carregarComunicacaoLeg()` e renderizar
`<FormComunicacaoLeg cfg={cfg} />` **acima** do `<ModelosLista …/>`.

- [ ] **Step 6: Rodar e verificar**

Run: `npx vitest run src/tests/legalizacao/comunicacao-render.test.tsx && npm run typecheck && npm run lint`
Expected: PASS + limpo.

- [ ] **Step 7: `format` e commit**

```bash
npm run format
git add -A
git commit -m "feat(legalizacao): config da comunicacao automatica em /configuracoes/legalizacao"
```

---

### Task 4: Envio no `atualizarEtapa`

**Files:**
- Modify: `src/app/(app)/legalizacao/actions.ts`

**Interfaces:**
- Consumes: `deveAvisar` (Task 2), os primitivos de envio/config (ver Constraints).
- Produces: `atualizarEtapa` passa a devolver `{ ok?: boolean; erro?: string; aviso?: string }`; envia o aviso
  ao concluir uma etapa `avisar_cliente`.

- [ ] **Step 1: Escrever o helper `avisarClienteEtapa` e o gatilho**

Acrescentar os imports no topo de `legalizacao/actions.ts`:
```ts
import { deveAvisar } from "@/lib/legalizacao/aviso";
import { aplicarVariaveis } from "@/lib/comercial/followup";
import { enviarEmail } from "@/lib/email/enviar";
import { enviarTexto, type ZapiConfig } from "@/lib/whatsapp/zapi";
import { decifrarDominio } from "@/lib/cripto/envelope";
import { normalizarTelefone } from "@/lib/whatsapp/mensagem";
import { rotuloOrgao } from "@/lib/legalizacao/tipos";
import { formatarData } from "@/lib/format";
```
> `LegOrgao` já é importado no `actions.ts` — use-o no cast do órgão abaixo (`et.orgao as LegOrgao`).
Adicionar o helper (usa `createAdminSupabase`, já importado, para ler config/cliente sem depender da RLS do
canal):
```ts
// Envia o aviso automático de status da etapa (RF-013). Retorna uma mensagem de aviso se algo impediu
// o envio (sem travar a conclusão); null se enviou ou se não havia o que fazer.
async function avisarClienteEtapa(etapaId: string): Promise<string | null> {
  const admin = createAdminSupabase();
  const { data: et } = await admin
    .from("legalizacao_etapa")
    .select("titulo, orgao, orgao_outro, protocolo, status, avisar_cliente, cliente_avisado_em, processo_id")
    .eq("id", etapaId)
    .maybeSingle();
  if (!et) return null;
  const concluida = et.status === "concluido" || et.status === "isenta";
  const { data: proc } = await admin
    .from("legalizacao_processo")
    .select("titulo, cliente_id")
    .eq("id", et.processo_id as string)
    .maybeSingle();
  if (!proc) return null;
  const { data: cli } = await admin
    .from("clientes")
    .select("razao_social, email, telefone, telefone_ddi, comunicar_legalizacao")
    .eq("id", proc.cliente_id as string)
    .maybeSingle();
  const { data: cfg } = await admin
    .from("legalizacao_config")
    .select("canal, ativo, assunto, template")
    .maybeSingle();
  if (!cli || !cfg) return null;

  const gate = deveAvisar(
    { ativo: Boolean(cfg.ativo), canal: (cfg.canal as "email" | "whatsapp") },
    Boolean(cli.comunicar_legalizacao),
    { avisarCliente: Boolean(et.avisar_cliente), jaAvisado: et.cliente_avisado_em != null, concluida },
  );
  if (!gate) return null;

  const vars: Record<string, string> = {
    cliente: (cli.razao_social as string) ?? "",
    processo: (proc.titulo as string) ?? "",
    etapa: (et.titulo as string) ?? "",
    orgao: rotuloOrgao(et.orgao as LegOrgao, (et.orgao_outro as string | null) ?? null),
    protocolo: (et.protocolo as string | null) ?? "",
    data: formatarData(new Date().toISOString().slice(0, 10)),
  };
  const corpo = aplicarVariaveis(cfg.template as string, vars);
  const canal = cfg.canal as "email" | "whatsapp";

  let ok = false;
  if (canal === "email") {
    const dest = (cli.email as string | null) ?? "";
    if (!dest.trim()) return "Etapa concluída, mas o cliente não tem e-mail para o aviso.";
    const r = await enviarEmail({ para: dest, assunto: aplicarVariaveis((cfg.assunto as string | null) ?? "", vars), corpo });
    ok = r.ok;
  } else {
    const { data: w } = await admin
      .from("whatsapp_config")
      .select("instance, token_cifrado, client_token_cifrado")
      .eq("id", 1)
      .maybeSingle();
    if (!(w?.instance && w.token_cifrado && w.client_token_cifrado)) return "Etapa concluída, mas o WhatsApp não está configurado.";
    const zapi: ZapiConfig = {
      instance: w.instance as string,
      token: (await decifrarDominio("whatsapp", w.token_cifrado as string)).toString("utf8"),
      clientToken: (await decifrarDominio("whatsapp", w.client_token_cifrado as string)).toString("utf8"),
    };
    const tel = normalizarTelefone((cli.telefone as string | null) ?? "", (cli.telefone_ddi as string | null) ?? "55");
    if (!tel) return "Etapa concluída, mas o cliente não tem telefone válido para o aviso.";
    const r = await enviarTexto(zapi, tel, corpo);
    ok = r.ok;
  }
  if (!ok) return "Etapa concluída, mas o aviso ao cliente falhou no envio.";
  await admin.from("legalizacao_etapa").update({ cliente_avisado_em: new Date().toISOString() }).eq("id", etapaId);
  return null;
}
```

- [ ] **Step 2: Chamar no `atualizarEtapa`**

No fim do `atualizarEtapa`, após o `revalidatePath`, quando o status novo concluir a etapa:
```ts
  if (et) revalidatePath(`/legalizacao/${et.processo_id}`);
  if (patch.status === "concluido" || patch.status === "isenta") {
    const aviso = await avisarClienteEtapa(etapaId);
    if (aviso) return { ok: true, aviso };
  }
  return { ok: true };
```
E ajustar a assinatura de retorno para incluir `aviso?: string`.

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint`
Expected: limpo. (Integração; a lógica pura está coberta na Task 2.)

- [ ] **Step 4: Smoke test (com o Pedro)** — `npm run dev`: ligar a config (canal e-mail), ter um cliente com
  e-mail, um processo com etapa `avisar_cliente`; concluir a etapa → conferir que `cliente_avisado_em` foi
  preenchido (ou que veio o aviso de falha se o e-mail do dev não envia). Reconcluir não reenvia.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/legalizacao/actions.ts"
git commit -m "feat(legalizacao): envia aviso automatico ao cliente ao concluir etapa (RF-013)"
```

---

### Task 5: Opt-out por cliente

**Files:**
- Create: `src/app/(app)/clientes/[id]/legalizacao-pref.ts` (action)
- Modify: `src/app/(app)/clientes/[id]/page.tsx` (renderizar o toggle) + um pequeno client component se
  necessário para o toggle.

**Interfaces:**
- Produces: `definirComunicacaoLegalizacao(clienteId: string, on: boolean): Promise<Resp>` (gate
  `podeGerenciarLegalizacao`).

- [ ] **Step 1: Action**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarLegalizacao } from "@/lib/clientes/permissoes";

export async function definirComunicacaoLegalizacao(
  clienteId: string,
  on: boolean,
): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarLegalizacao(p.papel)) return { erro: "Sem permissão." };
  const s = await createServerSupabase();
  const { error } = await s.from("clientes").update({ comunicar_legalizacao: on }).eq("id", clienteId);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
```

- [ ] **Step 2: UI na ficha do cliente**

Na `clientes/[id]/page.tsx`, carregar `comunicar_legalizacao` do cliente (adicionar ao `select` que já lê o
cliente) e renderizar um pequeno toggle — reusar o padrão do opt-out de cobrança (o componente
`OptOutCobranca` de `@/components/clientes/OptOutCobranca` é o molde). Criar um client component simples
`OptOutLegalizacao` que recebe `{ clienteId, ligado }` e chama `definirComunicacaoLegalizacao` no `onChange`,
com o rótulo **"Avisar automaticamente o andamento da legalização"**. Colocá-lo perto das demais
preferências de comunicação do cliente.

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: limpo + verde.

- [ ] **Step 4: Conferência na tela** — abrir um cliente, desligar o toggle, concluir uma etapa
  `avisar_cliente` desse cliente → **não** envia (e `cliente_avisado_em` fica nulo). **Mostrar ao Pedro.**

- [ ] **Step 5: `format` e commit**

```bash
npm run format
git add -A
git commit -m "feat(legalizacao): opt-out de comunicacao por cliente na ficha"
```

---

### Task 6: Release 6.22.0

**Files:** `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Verificação completa**

```bash
npm run lint && npm run typecheck && npm test && npm run format && npm run build
npx prettier --check .
```

- [ ] **Step 2: Bump + CHANGELOG**

- `package.json`: `6.21.0` → `6.22.0`.
- `CHANGELOG.md`: `## [6.22.0] — <data>` com `### Adicionado` (aviso automático de status da legalização ao
  cliente — canal configurável, opt-out por cliente). **Fecha a RF-013** (e o domínio Onboarding/legalização).
- Conferir `npx vitest run src/tests/versao.test.ts`.

- [ ] **Step 3: PR**

```bash
git push origin develop
gh pr create --base main --head develop --title "RF-013: comunicação automática da legalização (v6.22.0)"
gh pr checks --watch
```

- [ ] **Step 4: Release (com o Pedro)**

> **Migration `0106` em produção antes do deploy** (posso rodar pelo runner, com o OK). Sequência: migration
> → merge → Implantar → confirmar `6.22.0` no `/api/health` → tag.

## Self-Review (cobertura da spec)

- `legalizacao_config` + `clientes.comunicar_legalizacao` + RLS → Task 1.
- `deveAvisar` (portão) → Task 2, testado.
- Envio no `atualizarEtapa` (gatilho concluir, canal, falha não trava, grava `cliente_avisado_em`) → Task 4.
- Config (canal/ativo/assunto/template) → Task 3; opt-out por cliente → Task 5.
- Reusa `aplicarVariaveis`/canais/`cliente_avisado_em` → Tasks 2/4. Fecha a RF-013.
