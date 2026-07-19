# RF-007 — Fatia A (dados + config) — Plano

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.
> Spec: `docs/superpowers/specs/2026-07-19-rf007-followup-proposta-design.md`.

**Objetivo:** a fundação do follow-up — as 3 tabelas (`followup_config`/`followup_etapa`/`followup_envio`),
a coluna `proposta.enviada_em` (gravada no envio) e a tela **Configurações → Follow-up de propostas**.

**Arquitetura:** migração + `definirStatusProposta` gravando `enviada_em` na 1ª transição para `enviada`;
server actions (gate admin nas mutações) e uma tela de config no padrão de Funil/Precificação. Sem motor
nem cron aqui (Fatia B).

**Stack:** Next.js 16 (Server Actions), Supabase (Postgres + RLS), TypeScript, vitest.

## Global Constraints

- **Espelha a régua de cobrança:** `followup_etapa` ≈ `regua_etapa` (dias_offset/template/ordem/ativa).
- **Canal fixo para a sequência** (`followup_config.canal` `email`|`whatsapp`) + interruptor `ativo`.
- **`proposta.enviada_em`** é o D+0 — gravada **só na 1ª** transição para `enviada` (`coalesce`, não
  reinicia o relógio se reenviada).
- **Dedupe** é da Fatia B (`followup_envio` com `unique(proposta_id, etapa_id)`) — a tabela é criada aqui.
- **Gate:** a tela e as mutações de config são **admin** (como Funil/Precificação). RLS das tabelas: leitura
  para o comercial (admin/assistente/contador), escrita restrita a admin (padrão da `0103`).
- **Migrations idempotentes**; aplicar com `npm run db:migrate`; **migração em produção antes do deploy**.
- **`main` protegido:** PR `develop → main`, `verify` verde. Release com bump + CHANGELOG. Deploy manual.
- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`,
  `npm run build`.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `supabase/migrations/0105_followup_proposta.sql` | **Criar** — 3 tabelas + `proposta.enviada_em` + RLS | 1 |
| `src/app/(app)/comercial/propostas-actions.ts` | **Modificar** — `definirStatusProposta` grava `enviada_em` | 2 |
| `src/app/(app)/configuracoes/followup/actions.ts` | **Criar** — load + CRUD (gate admin) | 3 |
| `src/app/(app)/configuracoes/followup/page.tsx` | **Criar** — página server | 4 |
| `src/app/(app)/configuracoes/followup/FormFollowup.tsx` | **Criar** — client (canal/ativo + etapas) | 4 |
| `src/tests/comercial/followup-config-render.test.tsx` | **Criar** — render | 4 |
| `src/app/(app)/configuracoes/page.tsx` | **Modificar** — item no hub | 4 |
| `CHANGELOG.md` + `package.json` | **Modificar** — release 6.19.0 | 5 |

---

### Task 1: Migration `followup_proposta`

**Files:**
- Create: `supabase/migrations/0105_followup_proposta.sql`

**Interfaces:**
- Produces: `followup_config` (singleton), `followup_etapa`, `followup_envio`, `proposta.enviada_em`.

- [ ] **Step 1: Escrever a migration**

```sql
-- RF-007 Fatia A: follow-up automatizado de propostas (config + registro). Espelha a régua de cobrança.

create table if not exists followup_config (
  id boolean primary key default true,
  canal text not null default 'email',       -- 'email' | 'whatsapp'
  ativo boolean not null default false
);
do $$ begin
  alter table followup_config drop constraint if exists followup_config_id_chk;
  alter table followup_config add constraint followup_config_id_chk check (id);
  alter table followup_config drop constraint if exists followup_config_canal_chk;
  alter table followup_config add constraint followup_config_canal_chk check (canal in ('email','whatsapp'));
end $$;

create table if not exists followup_etapa (
  id uuid primary key default gen_random_uuid(),
  dias_offset int not null,
  assunto text,
  template text not null,
  ordem int not null,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists followup_envio (
  id uuid primary key default gen_random_uuid(),
  proposta_id uuid not null references proposta(id) on delete cascade,
  etapa_id uuid not null references followup_etapa(id) on delete cascade,
  enviado_em timestamptz not null default now(),
  destino text,
  status text not null default 'enviado',    -- 'enviado' | 'sem_destino' | 'falhou'
  unique (proposta_id, etapa_id)
);

alter table proposta add column if not exists enviada_em timestamptz;

-- RLS: leitura para o comercial; escrita só admin (padrão da 0103).
do $$
declare t text;
begin
  foreach t in array array['followup_config','followup_etapa','followup_envio'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t||'_read', t);
    execute format('drop policy if exists %I on %I', t||'_write', t);
    execute format(
      'create policy %I on %I for select using (auth_papel() in (''admin'',''assistente'',''contador''))',
      t||'_read', t);
    execute format(
      'create policy %I on %I for all using (auth_papel() = ''admin'') with check (auth_papel() = ''admin'')',
      t||'_write', t);
  end loop;
end $$;

-- Config singleton (uma linha, desligada por padrão).
insert into followup_config (id) select true where not exists (select 1 from followup_config);
```

- [ ] **Step 2: Aplicar no dev**

Run: `npm run db:migrate`
Expected: aplica `0105`. Se `SUPABASE_DB_URL` faltar, avisar o Pedro.

- [ ] **Step 3: Conferir**

```bash
node --env-file=.env.local -e '
import("@supabase/supabase-js").then(async ({createClient})=>{
  const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
  const {count}=await s.from("followup_config").select("*",{count:"exact",head:true});
  const {error}=await s.from("proposta").select("enviada_em").limit(1);
  console.log("config linhas:", count, "coluna enviada_em:", error? "FALTA":"ok");
});' 2>&1 | grep -v "punycode\|Deprecation\|--trace"
```
Expected: `config linhas: 1  coluna enviada_em: ok`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0105_followup_proposta.sql
git commit -m "feat(db): follow-up de propostas — config/etapa/envio + proposta.enviada_em (RF-007 fatia A)"
```

---

### Task 2: `definirStatusProposta` grava `enviada_em`

**Files:**
- Modify: `src/app/(app)/comercial/propostas-actions.ts`

**Interfaces:**
- Produces: `proposta.enviada_em` preenchida na 1ª transição para `enviada`.

- [ ] **Step 1: Ler o `enviada_em` atual e gravar só se vazio**

Em `definirStatusProposta`, incluir `enviada_em` no `select` inicial e, no update, setá-la quando o novo
status for `enviada` e ainda estiver vazia:
```ts
  const { data: pr } = await supabase
    .from("proposta")
    .select("oportunidade_id, enviada_em")
    .eq("id", id)
    .maybeSingle();
  const patch: Record<string, unknown> = { status, atualizado_em: new Date().toISOString() };
  if (status === "enviada" && !pr?.enviada_em) patch.enviada_em = new Date().toISOString();
  const { error } = await supabase.from("proposta").update(patch).eq("id", id);
```
(o resto da função — os efeitos de `aceita` etc. — permanece.)

- [ ] **Step 2: Verificar**

Run: `npm run typecheck`
Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/comercial/propostas-actions.ts"
git commit -m "feat(comercial): grava proposta.enviada_em na 1a transicao para enviada"
```

---

### Task 3: Server actions da config

**Files:**
- Create: `src/app/(app)/configuracoes/followup/actions.ts`

**Interfaces:**
- Produces (load público ao comercial; mutações gate admin; `revalidatePath("/configuracoes/followup")`):
  - `type FollowupView = { config: { canal: string; ativo: boolean }; etapas: { id: string; diasOffset: number; assunto: string | null; template: string; ordem: number; ativa: boolean }[] }`
  - `carregarFollowup(): Promise<FollowupView>`
  - `salvarConfigFollowup(canal: "email" | "whatsapp", ativo: boolean): Promise<Resp>`
  - `criarEtapaFollowup(): Promise<Resp>`
  - `salvarEtapaFollowup(id: string, dados: { diasOffset: number; assunto: string | null; template: string; ativa: boolean }): Promise<Resp>`
  - `removerEtapaFollowup(id: string): Promise<Resp>`
  - `reordenarEtapasFollowup(ids: string[]): Promise<Resp>`
  - `type Resp = { ok?: boolean; erro?: string }`

- [ ] **Step 1: Escrever o arquivo**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";

type Resp = { ok?: boolean; erro?: string };
export type FollowupView = {
  config: { canal: string; ativo: boolean };
  etapas: { id: string; diasOffset: number; assunto: string | null; template: string; ordem: number; ativa: boolean }[];
};

async function admin() {
  const p = await getPerfilAtual();
  return p?.ativo && p.papel === "admin" ? p : null;
}
function revalidar() {
  revalidatePath("/configuracoes/followup");
}

export async function carregarFollowup(): Promise<FollowupView> {
  const s = await createServerSupabase();
  const [cfg, et] = await Promise.all([
    s.from("followup_config").select("canal, ativo").maybeSingle(),
    s.from("followup_etapa").select("id, dias_offset, assunto, template, ordem, ativa").order("ordem"),
  ]);
  return {
    config: { canal: (cfg.data?.canal as string) ?? "email", ativo: (cfg.data?.ativo as boolean) ?? false },
    etapas: (et.data ?? []).map((e) => ({
      id: e.id as string,
      diasOffset: e.dias_offset as number,
      assunto: (e.assunto as string | null) ?? null,
      template: e.template as string,
      ordem: e.ordem as number,
      ativa: e.ativa as boolean,
    })),
  };
}

export async function salvarConfigFollowup(canal: "email" | "whatsapp", ativo: boolean): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!["email", "whatsapp"].includes(canal)) return { erro: "Canal inválido." };
  const s = await createServerSupabase();
  const { error } = await s.from("followup_config").update({ canal, ativo }).eq("id", true);
  if (error) return { erro: "Falha ao salvar." };
  revalidar();
  return { ok: true };
}

export async function criarEtapaFollowup(): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const s = await createServerSupabase();
  const { data } = await s.from("followup_etapa").select("ordem");
  const ordem = (data ?? []).reduce((m, r) => Math.max(m, r.ordem as number), 0) + 1;
  const { error } = await s
    .from("followup_etapa")
    .insert({ dias_offset: 3, assunto: "", template: "Olá {prospect}, tudo bem?", ordem });
  if (error) return { erro: "Falha ao criar a etapa." };
  revalidar();
  return { ok: true };
}

export async function salvarEtapaFollowup(
  id: string,
  dados: { diasOffset: number; assunto: string | null; template: string; ativa: boolean },
): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!Number.isInteger(dados.diasOffset) || dados.diasOffset < 0) return { erro: "Dias inválidos (≥ 0)." };
  if (!dados.template.trim()) return { erro: "Informe a mensagem." };
  const s = await createServerSupabase();
  const { error } = await s
    .from("followup_etapa")
    .update({ dias_offset: dados.diasOffset, assunto: dados.assunto, template: dados.template.trim(), ativa: dados.ativa })
    .eq("id", id);
  if (error) return { erro: "Falha ao salvar." };
  revalidar();
  return { ok: true };
}

export async function removerEtapaFollowup(id: string): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const s = await createServerSupabase();
  const { error } = await s.from("followup_etapa").delete().eq("id", id);
  if (error) return { erro: "Falha ao remover." };
  revalidar();
  return { ok: true };
}

export async function reordenarEtapasFollowup(ids: string[]): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const s = await createServerSupabase();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await s.from("followup_etapa").update({ ordem: i + 1 }).eq("id", ids[i]!);
    if (error) return { erro: "Falha ao reordenar." };
  }
  revalidar();
  return { ok: true };
}
```

- [ ] **Step 2: Verificar**

Run: `npm run typecheck`
Expected: aponta só a página/o client da Task 4 (ainda não existem). O actions compila.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/configuracoes/followup/actions.ts"
git commit -m "feat(comercial): server actions da config de follow-up (admin)"
```

---

### Task 4: Tela de config + hub

**Files:**
- Create: `src/app/(app)/configuracoes/followup/page.tsx`
- Create: `src/app/(app)/configuracoes/followup/FormFollowup.tsx`
- Test: `src/tests/comercial/followup-config-render.test.tsx`
- Modify: `src/app/(app)/configuracoes/page.tsx` (item no hub)

**Interfaces:**
- Consumes: `carregarFollowup` + as actions (Task 3), `moverNaOrdem` (`@/lib/comercial/funilConfig`),
  `controleCls`, `Botao`.
- Produces: a tela `/configuracoes/followup`.

- [ ] **Step 1: Página server (gate admin)**

```tsx
import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { FormFollowup } from "./FormFollowup";
import { carregarFollowup } from "./actions";

export const metadata = { title: "Follow-up de propostas" };

export default async function FollowupConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const cfg = await carregarFollowup();
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="Follow-up de propostas" subtitulo="Sequência automática após o envio da proposta" />
      <FormFollowup cfg={cfg} />
    </Container>
  );
}
```

- [ ] **Step 2: Teste de render**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/followup/actions", () => ({
  salvarConfigFollowup: vi.fn(),
  criarEtapaFollowup: vi.fn(),
  salvarEtapaFollowup: vi.fn(),
  removerEtapaFollowup: vi.fn(),
  reordenarEtapasFollowup: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { FormFollowup } from "@/app/(app)/configuracoes/followup/FormFollowup";
import type { FollowupView } from "@/app/(app)/configuracoes/followup/actions";

const cfg: FollowupView = {
  config: { canal: "email", ativo: false },
  etapas: [{ id: "e1", diasOffset: 3, assunto: "Sobre a proposta", template: "Olá {prospect}", ordem: 1, ativa: true }],
};

describe("FormFollowup", () => {
  it("renderiza canal, interruptor e etapas", () => {
    const html = renderToStaticMarkup(<FormFollowup cfg={cfg} />);
    expect(html).toContain("Canal");
    expect(html).toContain("Ativo");
    expect(html).toContain("Sobre a proposta");
    expect(html).toContain("Adicionar etapa");
    expect(html).toContain("{prospect}"); // legenda das variáveis
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/followup-config-render.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 4: `FormFollowup` (client)**

Client (`"use client"`) com o `chamar(fn)` padrão. Recebe `cfg: FollowupView`. Blocos:
- **Canal + Ativo:** um `<select>` **Canal** (`email`/`whatsapp`) e um checkbox **Ativo**, salvando via
  `salvarConfigFollowup(canal, ativo)` no `onChange`.
- **Etapas:** lista dos passos com ↑/↓ (`reordenarEtapasFollowup(moverNaOrdem(ids, id, dir))`), campos
  **dias após o envio** (`<input type=number min=0>`), **assunto** (`<input>`, só relevante para e-mail),
  **mensagem** (`<textarea>`), **ativa** (checkbox), e **remover** — salvando via `salvarEtapaFollowup` no
  `onBlur`/onChange. Botão **"Adicionar etapa"** (`criarEtapaFollowup`).
- **Legenda das variáveis:** um texto com `{prospect}`, `{numero}`, `{valor}`, `{validade}`.
- Inputs com `controleCls("compacto")` (sem `border` próprio — regra `divida-ui`).

- [ ] **Step 5: Item no hub**

Em `ITENS` de `configuracoes/page.tsx`, adicionar (sem `papeis` → admin-only):
```ts
{
  href: "/configuracoes/followup",
  label: "Follow-up de propostas",
  desc: "Sequência automática (e-mail ou WhatsApp) após o envio da proposta.",
},
```

- [ ] **Step 6: Rodar e verificar**

Run: `npx vitest run src/tests/comercial/followup-config-render.test.tsx && npm run typecheck && npm run lint`
Expected: PASS + limpo.

- [ ] **Step 7: Conferência na tela** — `npm run dev`, `/configuracoes/followup`: escolher canal, ativar,
  adicionar/editar/reordenar etapas. **Mostrar ao Pedro** (o motor que consome isto vem na Fatia B).

- [ ] **Step 8: `format` e commit**

```bash
npm run format
git add -A
git commit -m "feat(comercial): tela de config do follow-up de propostas (/configuracoes/followup)"
```

---

### Task 5: Release 6.19.0

**Files:** `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Verificação completa**

```bash
npm run lint && npm run typecheck && npm test && npm run format && npm run build
npx prettier --check .
```

- [ ] **Step 2: Bump + CHANGELOG**

- `package.json`: `6.18.0` → `6.19.0`.
- `CHANGELOG.md`: `## [6.19.0] — <data>` com `### Adicionado` (configuração do follow-up de propostas: canal,
  ativo, etapas com prazos) citando que é a fundação da RF-007 (o disparo automático vem a seguir).
- Conferir `npx vitest run src/tests/versao.test.ts`.

- [ ] **Step 3: PR**

```bash
git push origin develop
gh pr create --base main --head develop --title "RF-007 fatia A: config do follow-up de propostas (v6.19.0)"
gh pr checks --watch
```

- [ ] **Step 4: Release (com o Pedro)**

> **Migration `0105` em produção antes do deploy** (SQL Editor). Sequência: migration → merge → Implantar →
> confirmar `6.19.0` no `/api/health` → tag. O merge não publica.

## Self-Review (cobertura da spec)

- 3 tabelas + `proposta.enviada_em` + RLS (escrita admin) → Task 1.
- `enviada_em` na 1ª transição para `enviada` (coalesce) → Task 2.
- Config: canal + ativo + etapas (dias/assunto/template/ativa) com CRUD/reordenar → Tasks 3-4.
- Gate admin nas mutações → Task 3.
- Motor/cron e a visibilidade na proposta → **Fatias B e C**, fora daqui.
