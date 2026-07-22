# MFA (TOTP) — Fatia B (obrigatoriedade por escritório) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o admin **exija 2FA de toda a equipe** via um interruptor de escritório: com a flag ligada, quem não tem fator é forçado a cadastrar (`/conta/seguranca?exigido=1`) e o "Desativar" fica bloqueado.

**Architecture:** Uma coluna booleana `escritorio_config.mfa_obrigatorio` (migration 0128) guarda a política; a escrita já é admin-only pela RLS existente de `escritorio_config`. Um interruptor em `Configurações → Segurança (2FA)` liga/desliga. O gate do `(app)/layout.tsx` — que já usa a função pura `decidirGateAal` da Fatia A — passa a receber a flag real (em vez de `false`) e ganha o ramo `"enrollar"`. A tela `/conta/seguranca` recebe `obrigatorio`/`exigido` por prop para mostrar o aviso e travar o desativar.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres/RLS) · runner de migrations próprio (`npm run db:migrate`).

## Global Constraints

- **Papel (RBAC):** ler só de `usuarios.papel` via `getPerfilAtual()`; escrita em `escritorio_config` é admin-only (RLS de `0076` + gate na action).
- **Migrations:** já aplicadas são imutáveis; a nova (`0128`) deve ser **idempotente** (`add column if not exists`). Aplicar pelo runner `npm run db:migrate` (rastreia em `app_migrations`); **NUNCA** `supabase db push`.
- **Ordem migração × deploy:** a migration é **aditiva** (coluna com default), então aplicá-la cedo não afeta o 6.65.0 no ar (o código antigo não lê a coluna). Mas o código desta fatia **lê** `mfa_obrigatorio` no layout a cada request — então a migration TEM de estar aplicada **antes** de o 6.66.0 subir. Sequência no release: aplicar migration → Implantar → confirmar health.
- **Telas de enroll/verify fora do grupo `(app)`:** mantidas top-level (Fatia A). O redirect de enroll forçado aponta para `/conta/seguranca?exigido=1` (fora de `(app)` → sem loop).
- **Reutiliza a Fatia A:** `decidirGateAal(aal, obrigatorio)` já trata `"enrollar"` (obrigatorio && nextLevel aal1) — nenhuma lógica pura nova. `codigoTotpValido`, telas e reset já existem.
- **Comandos antes de commitar:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`, `npm run build`. CI roda os 5 + `format:check`.
- **Git:** trabalhar em `develop`; entrega por PR para `main` com `verify` verde.

**Assinaturas/fatos verificados no repo:**
- `escritorio_config` é singleton `id=1` (`supabase/migrations/0076_escritorio_config.sql`); RLS: `select` para qualquer autenticado, `insert/update` só `auth_papel()='admin'`; trigger `escritorio_config_integridade` seta `atualizado_por`/`atualizado_em`.
- Molde de página de config: `src/app/(app)/configuracoes/followup/{page,actions}.tsx` — gate admin, `createServerSupabase()`, `revalidatePath`.
- Hub de configurações: `src/app/(app)/configuracoes/page.tsx` — array `ITENS` de cards.
- Gate atual (Fatia A) em `src/app/(app)/layout.tsx`: chama `decidirGateAal({...}, false)` e trata só `"verificar"`.
- `src/app/conta/seguranca/{page,ContaSeguranca}.tsx` existem (Fatia A); `ContaSeguranca` hoje **não** recebe props.
- Runner: `npm run db:migrate` = `node --env-file=.env.local scripts/db-migrate.mjs`. Para produção: `node --env-file=.env.producao.bak scripts/db-migrate.mjs`.

---

## File Structure

- `supabase/migrations/0128_mfa_obrigatorio.sql` (Create) — coluna `mfa_obrigatorio`.
- `src/lib/auth/mfaConfig.ts` (Create) — `mfaObrigatorio(): Promise<boolean>` (leitura compartilhada layout + conta page).
- `src/app/(app)/configuracoes/seguranca/page.tsx` (Create) — página do interruptor (gate admin).
- `src/app/(app)/configuracoes/seguranca/actions.ts` (Create) — `carregarSeguranca` + `salvarMfaObrigatorio`.
- `src/app/(app)/configuracoes/seguranca/FormSeguranca.tsx` (Create) — toggle client.
- `src/app/(app)/configuracoes/page.tsx` (Modify) — card "Segurança (2FA)" no hub.
- `src/app/(app)/layout.tsx` (Modify) — flag real no gate + ramo `"enrollar"`.
- `src/app/conta/seguranca/page.tsx` (Modify) — lê `mfaObrigatorio()` + `searchParams.exigido`, passa por prop.
- `src/app/conta/seguranca/ContaSeguranca.tsx` (Modify) — aviso de exigência + bloqueio do desativar.

**Ordem das tasks:** migration+helper → página de config → gate+tela → release.

---

### Task 1: Migration da flag + helper de leitura

**Files:**
- Create: `supabase/migrations/0128_mfa_obrigatorio.sql`
- Create: `src/lib/auth/mfaConfig.ts`

**Interfaces:**
- Produces: coluna `escritorio_config.mfa_obrigatorio boolean not null default false`; `mfaObrigatorio(): Promise<boolean>`.

- [ ] **Step 1: Escrever a migration (idempotente, aditiva)**

```sql
-- supabase/migrations/0128_mfa_obrigatorio.sql
-- MFA (TOTP) Fatia B: interruptor de escritório para exigir 2FA de toda a equipe.
-- Aditiva e idempotente; a escrita já é admin-only pela RLS de escritorio_config (0076).
alter table escritorio_config add column if not exists mfa_obrigatorio boolean not null default false;
```

- [ ] **Step 2: Aplicar a migration no banco de desenvolvimento**

Run: `npm run db:migrate`
Expected: o runner registra `0128_mfa_obrigatorio` em `app_migrations` e reporta sucesso. (A coluna aditiva não afeta o 6.65.0 em produção — o código no ar não a lê.)

- [ ] **Step 3: Criar o helper de leitura**

```ts
// src/lib/auth/mfaConfig.ts
import { createServerSupabase } from "@/lib/supabase/server";

// Lê o interruptor de escritório "exigir 2FA da equipe" (escritorio_config singleton id=1).
// Usado no gate do layout e na tela /conta/seguranca. RLS de select é aberta a autenticados.
export async function mfaObrigatorio(): Promise<boolean> {
  const s = await createServerSupabase();
  const { data } = await s.from("escritorio_config").select("mfa_obrigatorio").eq("id", 1).maybeSingle();
  return Boolean(data?.mfa_obrigatorio);
}
```

- [ ] **Step 4: Verificar (typecheck + lint)**

Run: `npm run typecheck && npx eslint src/lib/auth/mfaConfig.ts`
Expected: sem erros. (Se o typecheck reclamar de `mfa_obrigatorio` inexistente nos tipos gerados do Supabase, confirmar que o projeto **não** usa tipos gerados estáticos para `.from()` — o padrão do repo é `Boolean(data?.campo)` sem tipagem de schema, como em `followup/actions.ts`.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0128_mfa_obrigatorio.sql src/lib/auth/mfaConfig.ts
git commit -m "feat(mfa): migration 0128 (mfa_obrigatorio) + helper de leitura"
```

---

### Task 2: Interruptor em Configurações → Segurança (2FA)

**Files:**
- Create: `src/app/(app)/configuracoes/seguranca/actions.ts`
- Create: `src/app/(app)/configuracoes/seguranca/FormSeguranca.tsx`
- Create: `src/app/(app)/configuracoes/seguranca/page.tsx`
- Modify: `src/app/(app)/configuracoes/page.tsx`

**Interfaces:**
- Consumes: `mfaObrigatorio` (Task 1); `getPerfilAtual`; `createServerSupabase`; `Container`/`PageHeader`/`Voltar`/`Botao` (primitivos existentes).
- Produces: rota `/configuracoes/seguranca`; actions `carregarSeguranca(): Promise<{ obrigatorio: boolean }>` e `salvarMfaObrigatorio(obrigatorio: boolean): Promise<{ ok?: boolean; erro?: string }>`.

- [ ] **Step 1: Criar as actions**

```ts
// src/app/(app)/configuracoes/seguranca/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { mfaObrigatorio } from "@/lib/auth/mfaConfig";

async function admin() {
  const p = await getPerfilAtual();
  return p?.ativo && p.papel === "admin" ? p : null;
}

export async function carregarSeguranca(): Promise<{ obrigatorio: boolean }> {
  return { obrigatorio: await mfaObrigatorio() };
}

export async function salvarMfaObrigatorio(obrigatorio: boolean): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const s = await createServerSupabase();
  // Escrita via sessão do usuário: a RLS de escritorio_config (0076) já exige admin, e o
  // trigger de integridade grava quem/quando. .eq("id", 1) mira o singleton.
  const { error } = await s.from("escritorio_config").update({ mfa_obrigatorio: obrigatorio }).eq("id", 1);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath("/configuracoes/seguranca");
  return { ok: true };
}
```

- [ ] **Step 2: Criar o form (toggle)**

```tsx
// src/app/(app)/configuracoes/seguranca/FormSeguranca.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { salvarMfaObrigatorio } from "./actions";

export function FormSeguranca({ obrigatorio }: { obrigatorio: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function alternar(valor: boolean) {
    setOcupado(true);
    const r = await salvarMfaObrigatorio(valor);
    setOcupado(false);
    if (r?.erro) {
      alert(r.erro);
      return;
    }
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-2xl border border-linha bg-white p-4">
      <label className="flex items-center gap-3 text-sm text-texto">
        <input
          type="checkbox"
          checked={obrigatorio}
          disabled={ocupado}
          onChange={(e) => alternar(e.target.checked)}
        />
        Exigir 2FA de toda a equipe
      </label>
      <p className="text-xs text-cinza">
        Com a exigência ligada, quem ainda não configurou a verificação em duas etapas é levado à
        tela de configuração no próximo acesso e não pode desativá-la enquanto a política estiver
        ativa. O portal do cliente não é afetado.
      </p>
    </section>
  );
}
```

- [ ] **Step 3: Criar a página (gate admin)**

```tsx
// src/app/(app)/configuracoes/seguranca/page.tsx
import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { FormSeguranca } from "./FormSeguranca";
import { carregarSeguranca } from "./actions";

export const metadata = { title: "Segurança (2FA)" };

export default async function SegurancaConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const { obrigatorio } = await carregarSeguranca();
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="Segurança (2FA)" subtitulo="Exigir verificação em duas etapas da equipe" />
      <FormSeguranca obrigatorio={obrigatorio} />
    </Container>
  );
}
```

- [ ] **Step 4: Adicionar o card no hub de configurações**

Em `src/app/(app)/configuracoes/page.tsx`, dentro do array `ITENS`, adicionar logo após o item `"/usuarios"`:

```tsx
  {
    href: "/configuracoes/seguranca",
    label: "Segurança (2FA)",
    desc: "Exigir verificação em duas etapas de toda a equipe.",
  },
```

- [ ] **Step 5: Verificar (typecheck + lint + testes de UI + build)**

Run: `npm run typecheck && npx eslint "src/app/(app)/configuracoes/seguranca" "src/app/(app)/configuracoes/page.tsx" && npx vitest run src/tests/ui/ && npm run build`
Expected: sem erros; `rotas-alcancaveis` continua verde (a rota é alcançada pela regra POR_HUB `/configuracoes/`). Confirmar `/configuracoes/seguranca` no output do build.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/configuracoes/seguranca" "src/app/(app)/configuracoes/page.tsx"
git commit -m "feat(mfa): interruptor de escritorio para exigir 2FA (configuracoes/seguranca)"
```

---

### Task 3: Gate de enroll forçado + bloqueio do desativar

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/conta/seguranca/page.tsx`
- Modify: `src/app/conta/seguranca/ContaSeguranca.tsx`

**Interfaces:**
- Consumes: `mfaObrigatorio` (Task 1); `decidirGateAal` (Fatia A, já importado no layout).
- Produces: `ContaSeguranca` passa a receber `{ obrigatorio: boolean; exigido: boolean }`.

- [ ] **Step 1: Ligar a flag real no gate do layout + tratar `"enrollar"`**

Em `src/app/(app)/layout.tsx`, adicionar o import (após o import de `decidirGateAal`):

```tsx
import { mfaObrigatorio } from "@/lib/auth/mfaConfig";
```

Trocar o bloco do gate (Fatia A):

```tsx
  const supabaseMfa = await createServerSupabase();
  const { data: aal } = await supabaseMfa.auth.mfa.getAuthenticatorAssuranceLevel();
  const decisao = decidirGateAal({ currentLevel: aal?.currentLevel ?? null, nextLevel: aal?.nextLevel ?? null }, false);
  if (decisao === "verificar") redirect("/login/verificar");
```

por:

```tsx
  const supabaseMfa = await createServerSupabase();
  const { data: aal } = await supabaseMfa.auth.mfa.getAuthenticatorAssuranceLevel();
  const decisao = decidirGateAal(
    { currentLevel: aal?.currentLevel ?? null, nextLevel: aal?.nextLevel ?? null },
    await mfaObrigatorio(),
  );
  // Tem fator mas sessão aal1 → desafiar. Sem fator e escritório exige → forçar cadastro.
  // Ambos os alvos ficam fora de (app), então não há loop de redirect.
  if (decisao === "verificar") redirect("/login/verificar");
  if (decisao === "enrollar") redirect("/conta/seguranca?exigido=1");
```

- [ ] **Step 2: Passar `obrigatorio`/`exigido` para a tela**

Substituir o conteúdo de `src/app/conta/seguranca/page.tsx` por:

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { ehCliente } from "@/lib/portal/permissoes";
import { mfaObrigatorio } from "@/lib/auth/mfaConfig";
import { ContaSeguranca } from "./ContaSeguranca";

export const metadata = { title: "Segurança — 2FA" };

export default async function ContaSegurancaPage({
  searchParams,
}: {
  searchParams: Promise<{ exigido?: string }>;
}) {
  // Só equipe (admin/contador/assistente/financeiro). Cliente do portal não tem 2FA no v1.
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo || ehCliente(perfil.papel)) redirect("/");
  const obrigatorio = await mfaObrigatorio();
  const { exigido } = await searchParams;
  return <ContaSeguranca obrigatorio={obrigatorio} exigido={exigido === "1"} />;
}
```

- [ ] **Step 3: Aviso de exigência + bloqueio do desativar na tela**

Em `src/app/conta/seguranca/ContaSeguranca.tsx`:

Trocar a assinatura do componente:

```tsx
export function ContaSeguranca() {
```

por:

```tsx
export function ContaSeguranca({ obrigatorio, exigido }: { obrigatorio: boolean; exigido: boolean }) {
```

Adicionar o aviso de exigência logo após o bloco de `{erro && (...)}` (antes de `{estado.fase === "carregando" && ...}`):

```tsx
      {exigido && (
        <p role="status" className="rounded-lg bg-atencao-fundo px-3 py-2 text-sm text-atencao">
          Seu escritório exige verificação em duas etapas. Configure o 2FA abaixo para continuar
          usando o sistema.
        </p>
      )}
```

Trocar o bloco da fase `"ativo"` (o botão de desativar) por uma versão que respeita a política:

```tsx
      {estado.fase === "ativo" && (
        <Card className="flex flex-col gap-4">
          <p className="rounded-lg bg-verde/10 px-3 py-2 text-sm text-verde">2FA ativo nesta conta.</p>
          {obrigatorio ? (
            <p className="text-xs text-cinza">
              O 2FA é obrigatório no seu escritório e não pode ser desativado enquanto a política
              estiver ativa.
            </p>
          ) : (
            <Botao
              type="button"
              variante="secundario"
              onClick={desativar}
              disabled={ocupado}
              className="self-start"
            >
              Desativar 2FA
            </Botao>
          )}
        </Card>
      )}
```

- [ ] **Step 4: Verificar (typecheck + lint + build)**

Run: `npm run typecheck && npx eslint "src/app/(app)/layout.tsx" "src/app/conta/seguranca" && npm run build`
Expected: sem erros.

- [ ] **Step 5: Smoke manual (`npm run dev`)**

- Flag **desligada**: comportamento idêntico à Fatia A (2FA opcional; "Desativar" aparece).
- Admin liga em `/configuracoes/seguranca`. Usuário da equipe **sem fator** entra em qualquer tela `(app)` → é redirecionado a `/conta/seguranca?exigido=1` com o aviso; configura o 2FA; após confirmar, navega normalmente.
- Usuário **com fator** e a flag ligada: na tela `/conta/seguranca` o "Desativar" some e aparece o texto de bloqueio.
- Admin desliga a flag → "Desativar" volta a aparecer; usuários sem fator deixam de ser forçados.
- Sem loop de redirect em nenhum caso (enroll/verify fora de `(app)`).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/layout.tsx" "src/app/conta/seguranca/page.tsx" "src/app/conta/seguranca/ContaSeguranca.tsx"
git commit -m "feat(mfa): enroll forcado quando escritorio exige + bloqueio do desativar"
```

---

### Task 4: Release 6.66.0

**Files:**
- Modify: `package.json` (version)
- Modify: `CHANGELOG.md`

Produção está em 6.65.0. **Esta fatia TEM migration** (`0128`) — a ordem migração→deploy é obrigatória.

- [ ] **Step 1: Barra de qualidade completa**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check && npm run build`
Expected: tudo verde. (Se `format:check` falhar, `npm run format` e recommitar.)

- [ ] **Step 2: Bump de versão (sem tag)**

Run: `npm version minor --no-git-tag-version`
Expected: `package.json` → `6.66.0`. **Incluir também o `package-lock.json`** no commit da release (o `npm version` bumpa o campo `version` do lockfile; deixá-lo de fora gera drift — foi o que aconteceu no 6.65.0).

- [ ] **Step 3: Entrada no CHANGELOG (topo, acima de 6.65.0)**

Adicionar após `## [Não lançado]`:

```markdown
## [6.66.0] — 2026-07-22

Obrigatoriedade de 2FA por escritório — RNF-09 (parte), Fatia B.

### Segurança

- **Exigir 2FA de toda a equipe.** Novo interruptor em **Configurações → Segurança (2FA)**: com a
  exigência ligada, quem ainda não configurou a verificação em duas etapas é levado à tela de
  configuração no próximo acesso e não pode desativá-la enquanto a política estiver ativa. O portal
  do cliente não é afetado. (Migration `0128` — coluna `escritorio_config.mfa_obrigatorio`.)
```

- [ ] **Step 4: Teste de versão + suíte**

Run: `npx vitest run src/tests/versao.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Commit da release**

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): 6.66.0 — MFA (TOTP) Fatia B (obrigatoriedade por escritorio)"
```

- [ ] **Step 6: Finalizar a branch (PR) — com a ordem migração→deploy**

Seguir **superpowers:finishing-a-development-branch** → "Push and create a Pull Request":
`git push origin develop` → `gh pr create --base main --head develop` → aguardar as **duas** execuções do `verify` ("todos concluídos") → PR verde. **Não** mergear sem autorização explícita do usuário.

Após o merge (com autorização):
1. **Aplicar a migration em produção ANTES do deploy:** `node --env-file=.env.producao.bak scripts/db-migrate.mjs` (confirmar `0128_mfa_obrigatorio` aplicada).
2. Usuário clica **Implantar** no EasyPanel.
3. Confirmar `curl -s https://app.seusaldo.ai/api/health` → `6.66.0`.
4. `npm run release:tag` (do `main`, árvore limpa) + `git push origin v6.66.0`.
5. Sincronizar `develop`: `git checkout develop && git merge main && git push origin develop`.

---

## Self-Review

**1. Cobertura da spec (Fatia B):**
- Migration `NNNN_mfa_obrigatorio.sql` (`add column if not exists ... boolean not null default false`) → Task 1. ✅
- Interruptor de config (nova página `configuracoes/seguranca/`, molde `followup`) → Task 2. ✅
- Gate de enroll forçado no `(app)/layout.tsx` (flag ligada + sem fator → `redirect("/conta/seguranca?exigido=1")`) → Task 3. ✅
- `/conta/seguranca` mostra aviso de obrigatoriedade e **bloqueia o desativar** enquanto exigido → Task 3. ✅
- Reuso da lógica pura da Fatia A (`decidirGateAal` com `obrigatorio` real) → Task 3. ✅

**2. Placeholders:** nenhum — todo passo traz código completo.

**3. Consistência de tipos:** `mfaObrigatorio(): Promise<boolean>` (Task 1) consumido igual em Task 2 (action) e Task 3 (layout + page). `ContaSeguranca` passa a receber `{ obrigatorio: boolean; exigido: boolean }` (Task 3, page e componente batem). `salvarMfaObrigatorio(boolean)`/`carregarSeguranca()` idem entre action, page e form.

**4. Ordem migração×deploy:** a migration é aditiva (aplicável cedo sem afetar 6.65.0), mas o código 6.66.0 lê a coluna a cada request — por isso o release (Task 4) aplica a migration em produção **antes** de Implantar. Registrado como passo explícito.

**Nota de execução:** a coluna nova não é lida por tipos estáticos de schema (o repo usa `.from().select()` sem geração de tipos, como `followup/actions.ts`), então o typecheck não depende de regenerar tipos do Supabase.
