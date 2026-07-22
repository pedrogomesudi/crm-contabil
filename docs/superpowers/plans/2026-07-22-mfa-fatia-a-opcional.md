# MFA (TOTP) — Fatia A (opcional, sem migration) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar 2FA por TOTP opcional ponta a ponta para a equipe — habilitar/desativar em `/conta/seguranca`, desafio no login em `/login/verificar`, gate AAL2 no layout `(app)`, e reset pela admin — usando o MFA nativo do Supabase, sem migration.

**Architecture:** Toda a persistência de fatores vive no Supabase Auth (`auth.mfa_factors`); não tocamos em `usuarios` nem no schema. A decisão de gate é uma função pura testável (`decidirGateAal`); o resto é I/O do Supabase em telas fora do grupo `(app)` (guard próprio), para o gate AAL do `(app)/layout` não redirecionar as telas de enroll/verify para si mesmas. Regra de ouro contra loop: `/conta/seguranca` e `/login/verificar` são rotas top-level.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Tailwind 4 · `@supabase/supabase-js` 2.108.2 (auth-js) · Vitest.

## Global Constraints

- **Papel (RBAC):** ler só de `usuarios.papel` via `getPerfilAtual()`/`exigirAdmin()`; NUNCA de `app_metadata`/JWT.
- **Imagens:** usar `next/image`, nunca `<img>` (o QR é data-URI SVG → `next/image` com `unoptimized`).
- **Segredos:** `secret`/`qr_code`/`uri` do enroll NÃO vão para `console.*` nem para log algum.
- **CSP:** `img-src 'self' data: blob:` já permite o QR data-URI. Nada de recurso externo.
- **Inputs:** usar os primitivos do projeto (`controleCls()` via `Input`/`CampoTexto`) — nunca classes de borda estáticas coladas (guard `divida-ui`).
- **Telas de enroll/verify FORA do grupo `(app)`:** `src/app/conta/seguranca/` e `src/app/login/verificar/` são top-level (guard de sessão próprio). Não colocar sob `(app)`.
- **Menu:** o link "Segurança (2FA)" NÃO entra em `menuDoPapel` — a rota vive fora de `(app)` e o teste `rotas-alcancaveis` (`src/tests/ui/rotas-alcancaveis.test.ts`, "link morto") exige que todo href do menu exista dentro de `(app)`. O link vai direto no `Sidebar`.
- **Comandos antes de commitar:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`, `npm run build`. O CI roda os 5 + `format:check`.
- **Git:** trabalhar em `develop`; entrega por PR para `main` com `verify` verde. Não fazer push em `main`.

**API do Supabase (auth-js 2.108.2) — assinaturas verificadas nos tipos instalados:**
- Client: `supabase.auth.mfa.listFactors()` → `{ data: { all: Factor[]; totp: Factor[] }, error }` (`data.totp` já é só os **verificados**).
- Client: `supabase.auth.mfa.enroll({ factorType: "totp" })` → `{ data: { id, type, totp: { qr_code, secret, uri } }, error }`. `qr_code` é **SVG sem prefixo** — renderizar com `data:image/svg+xml;utf-8,${qr_code}`.
- Client: `supabase.auth.mfa.challengeAndVerify({ factorId, code })` → `{ data, error }` (cria desafio e verifica num passo; eleva a sessão para aal2).
- Client: `supabase.auth.mfa.unenroll({ factorId })` → `{ data: { id }, error }`.
- Client: `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` → `{ data: { currentLevel, nextLevel }, error }`.
- Admin: `admin.auth.admin.mfa.listFactors({ userId })` → `{ data: { factors: Factor[] }, error }`.
- Admin: `admin.auth.admin.mfa.deleteFactor({ id, userId })` → `{ data: { id }, error }`.
- `Factor`: `{ id: string; factor_type: 'totp' | ...; status: 'verified' | 'unverified'; friendly_name?: string; ... }`.

---

## File Structure

- `src/lib/auth/mfa.ts` (Create) — lógica pura: `decidirGateAal(aal, obrigatorio)` + `codigoTotpValido(codigo)`.
- `src/tests/auth/mfa.test.ts` (Create) — testes da lógica pura.
- `src/app/login/verificar/page.tsx` (Create) — server page com guard de sessão.
- `src/app/login/verificar/VerificarMfa.tsx` (Create) — client: challengeAndVerify do login.
- `src/app/conta/seguranca/page.tsx` (Create) — server page com guard de equipe.
- `src/app/conta/seguranca/ContaSeguranca.tsx` (Create) — client: enroll/QR/verify/unenroll.
- `src/components/Sidebar.tsx` (Modify) — link "Segurança (2FA)" no rodapé (mobile + desktop).
- `src/app/(app)/layout.tsx` (Modify) — gate AAL2 após o gate de cliente.
- `src/app/(app)/usuarios/actions.ts` (Modify) — action `resetarMfa(usuarioId)`.
- `src/app/(app)/usuarios/page.tsx` (Modify) — botão "Resetar 2FA" na coluna Acesso + mensagem `ok:mfa`.

**Ordem das tasks** garante que todo alvo de `redirect` já exista quando o gate é ligado: lib → tela de verify → tela de enroll → gate → reset admin → release.

---

### Task 1: Lógica pura do gate + validação do código

**Files:**
- Create: `src/lib/auth/mfa.ts`
- Test: `src/tests/auth/mfa.test.ts`

**Interfaces:**
- Produces:
  - `type NivelAal = { currentLevel: string | null; nextLevel: string | null }`
  - `decidirGateAal(aal: NivelAal, obrigatorio: boolean): "verificar" | "enrollar" | "ok"`
  - `codigoTotpValido(codigo: string): boolean`
- Nota de design: `temFator` está **implícito** em `nextLevel === "aal2"` (o Supabase só eleva `nextLevel` a aal2 quando há fator **verificado**). Por isso a assinatura não recebe `temFator` separado — evita um parâmetro que poderia contradizer o `nextLevel`. Na Fatia A o layout chama sempre com `obrigatorio = false`; o ramo `"enrollar"` só é exercido na Fatia B.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/tests/auth/mfa.test.ts
import { describe, it, expect } from "vitest";
import { decidirGateAal, codigoTotpValido } from "@/lib/auth/mfa";

describe("decidirGateAal", () => {
  it("tem fator verificado mas sessão ainda aal1 => verificar", () => {
    expect(decidirGateAal({ currentLevel: "aal1", nextLevel: "aal2" }, false)).toBe("verificar");
    expect(decidirGateAal({ currentLevel: "aal1", nextLevel: "aal2" }, true)).toBe("verificar");
  });

  it("sessão já elevada (aal2) => ok", () => {
    expect(decidirGateAal({ currentLevel: "aal2", nextLevel: "aal2" }, false)).toBe("ok");
    expect(decidirGateAal({ currentLevel: "aal2", nextLevel: "aal2" }, true)).toBe("ok");
  });

  it("sem fator (nextLevel aal1) e não obrigatório => ok", () => {
    expect(decidirGateAal({ currentLevel: "aal1", nextLevel: "aal1" }, false)).toBe("ok");
  });

  it("sem fator (nextLevel aal1) e obrigatório => enrollar", () => {
    expect(decidirGateAal({ currentLevel: "aal1", nextLevel: "aal1" }, true)).toBe("enrollar");
  });

  it("aal nulo (sessão sem info) => ok, nunca trava o usuário", () => {
    expect(decidirGateAal({ currentLevel: null, nextLevel: null }, false)).toBe("ok");
    expect(decidirGateAal({ currentLevel: null, nextLevel: null }, true)).toBe("ok");
  });
});

describe("codigoTotpValido", () => {
  it("aceita exatamente 6 dígitos (com espaços nas bordas)", () => {
    expect(codigoTotpValido("123456")).toBe(true);
    expect(codigoTotpValido("  654321 ")).toBe(true);
  });

  it("rejeita comprimento errado, letras e vazio", () => {
    expect(codigoTotpValido("12345")).toBe(false);
    expect(codigoTotpValido("1234567")).toBe(false);
    expect(codigoTotpValido("12ab56")).toBe(false);
    expect(codigoTotpValido("")).toBe(false);
    expect(codigoTotpValido("   ")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/tests/auth/mfa.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/auth/mfa"` (arquivo ainda não existe).

- [ ] **Step 3: Implementar o mínimo**

```ts
// src/lib/auth/mfa.ts

// Níveis de garantia de autenticação (AAL) da sessão, como o Supabase os expõe em
// getAuthenticatorAssuranceLevel(). currentLevel = onde a sessão está; nextLevel = até
// onde ela poderia ir. nextLevel === "aal2" só acontece quando há fator VERIFICADO.
export type NivelAal = { currentLevel: string | null; nextLevel: string | null };

// Decisão pura do gate de MFA. Sem I/O: recebe o AAL da sessão e se o escritório exige 2FA.
// - "verificar": tem fator verificado (nextLevel aal2) mas a sessão ainda é aal1 → desafiar.
// - "enrollar":  não tem fator (nextLevel aal1) e o escritório exige → forçar cadastro (Fatia B).
// - "ok":        segue normal (sem fator e opcional, ou sessão já aal2, ou AAL indisponível).
export function decidirGateAal(aal: NivelAal, obrigatorio: boolean): "verificar" | "enrollar" | "ok" {
  if (aal.nextLevel === "aal2" && aal.currentLevel === "aal1") return "verificar";
  if (obrigatorio && aal.nextLevel === "aal1") return "enrollar";
  return "ok";
}

// Código TOTP é sempre 6 dígitos numéricos. Aparadas as bordas (o usuário cola com espaço).
export function codigoTotpValido(codigo: string): boolean {
  return /^\d{6}$/.test(codigo.trim());
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/tests/auth/mfa.test.ts`
Expected: PASS (11 asserts).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/mfa.ts src/tests/auth/mfa.test.ts
git commit -m "feat(mfa): logica pura do gate AAL e validacao do codigo TOTP"
```

---

### Task 2: Tela de verificação no login — `/login/verificar`

**Files:**
- Create: `src/app/login/verificar/page.tsx`
- Create: `src/app/login/verificar/VerificarMfa.tsx`

**Interfaces:**
- Consumes: `codigoTotpValido` (Task 1); `createBrowserSupabase` (`@/lib/supabase/client`); `sair` (`@/app/login/actions`); `getPerfilAtual` (`@/lib/auth/perfil`); `AuthCard`/`CampoTexto` (`@/components/auth/*`).
- Produces: rota `/login/verificar` — alvo do `redirect` do gate (Task 4).

Sem teste unitário: é I/O do Supabase + navegação. Verificação = typecheck + lint + build + smoke manual. TDD não se aplica a componente puramente de borda (a lógica testável foi extraída na Task 1).

- [ ] **Step 1: Criar o client component**

```tsx
// src/app/login/verificar/VerificarMfa.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { sair } from "@/app/login/actions";
import { codigoTotpValido } from "@/lib/auth/mfa";
import { AuthCard } from "@/components/auth/AuthCard";
import { CampoTexto } from "@/components/auth/CampoTexto";

export function VerificarMfa() {
  const [supabase] = useState(() => createBrowserSupabase());
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const totp = data?.totp[0];
      // Sem fator verificado não há o que desafiar — a sessão já basta, segue para o app.
      if (!totp) {
        router.replace("/");
        return;
      }
      setFactorId(totp.id);
    })();
  }, [supabase, router]);

  async function verificar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!factorId) return;
    if (!codigoTotpValido(codigo)) {
      setErro("Digite o código de 6 dígitos do aplicativo.");
      return;
    }
    setOcupado(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: codigo.trim() });
      if (error) {
        setErro("Código inválido ou expirado. Gere um novo no aplicativo e tente de novo.");
        return;
      }
      // Sessão agora é aal2; refresh para o gate do layout deixar passar.
      router.replace("/");
      router.refresh();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <AuthCard titulo="Verificação em duas etapas">
      <form onSubmit={verificar} className="space-y-4">
        <p className="text-sm text-cinza">
          Informe o código de 6 dígitos do seu aplicativo autenticador para concluir o acesso.
        </p>
        <CampoTexto
          id="codigo-totp"
          label="Código de verificação"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="000000"
          aria-invalid={erro ? true : undefined}
          required
        />
        {erro && (
          <p role="alert" className="text-sm text-negativo">
            {erro}
          </p>
        )}
        <button
          type="submit"
          disabled={ocupado || !factorId}
          aria-busy={ocupado}
          className="w-full rounded-lg bg-verde py-2 text-sm font-medium text-white transition hover:brightness-105 disabled:opacity-60"
        >
          {ocupado ? "Verificando..." : "Verificar"}
        </button>
      </form>
      <form action={sair} className="mt-4">
        <button type="submit" className="block w-full text-center text-sm text-cinza hover:text-verde">
          Sair
        </button>
      </form>
    </AuthCard>
  );
}
```

- [ ] **Step 2: Criar a server page com guard**

```tsx
// src/app/login/verificar/page.tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { VerificarMfa } from "./VerificarMfa";

export const metadata = { title: "Verificação em duas etapas" };

export default async function VerificarPage() {
  // Precisa de sessão (aal1) para haver fator a desafiar. Sem perfil => volta ao login.
  const perfil = await getPerfilAtual();
  if (!perfil) redirect("/login");
  return <VerificarMfa />;
}
```

- [ ] **Step 3: Verificar (typecheck + lint + build)**

Run: `npm run typecheck && npm run lint`
Expected: sem erros. Se o lint reclamar de dependências do `useEffect`, confirmar que `[supabase, router]` está declarado (ambos estáveis).

- [ ] **Step 4: Commit**

```bash
git add src/app/login/verificar/page.tsx src/app/login/verificar/VerificarMfa.tsx
git commit -m "feat(mfa): tela de verificacao no login (/login/verificar)"
```

---

### Task 3: Tela de habilitar/desativar 2FA — `/conta/seguranca` + link no Sidebar

**Files:**
- Create: `src/app/conta/seguranca/page.tsx`
- Create: `src/app/conta/seguranca/ContaSeguranca.tsx`
- Modify: `src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `codigoTotpValido` (Task 1); `createBrowserSupabase`; `getPerfilAtual`; `ehCliente` (`@/lib/portal/permissoes`); `Input`/`Botao`/`Card` (`@/components/ui/*`); `next/image`.
- Produces: rota `/conta/seguranca` — alvo do link do Sidebar e (na Fatia B) do enroll forçado.

- [ ] **Step 1: Criar o client component**

```tsx
// src/app/conta/seguranca/ContaSeguranca.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { codigoTotpValido } from "@/lib/auth/mfa";
import { Input } from "@/components/ui/Input";
import { Botao } from "@/components/ui/Botao";
import { Card } from "@/components/ui/Card";

// Fases da tela. `enrolando` guarda o QR/segredo do fator recém-criado (ainda não verificado);
// só vira `ativo` depois do challengeAndVerify.
type Estado =
  | { fase: "carregando" }
  | { fase: "inativo" }
  | { fase: "enrolando"; factorId: string; qr: string; secret: string }
  | { fase: "ativo"; factorId: string };

export function ContaSeguranca() {
  const [supabase] = useState(() => createBrowserSupabase());
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error || !data) {
      setErro("Não foi possível carregar a configuração de 2FA.");
      setEstado({ fase: "inativo" });
      return;
    }
    // data.totp já vem só com fatores TOTP verificados.
    const verificado = data.totp[0];
    setEstado(verificado ? { fase: "ativo", factorId: verificado.id } : { fase: "inativo" });
  }, [supabase]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function ativar() {
    setErro(null);
    setOcupado(true);
    try {
      // Remove fatores TOTP não verificados de tentativas anteriores (senão acumulam lixo
      // e podem colidir de friendly name no próximo enroll).
      const { data: atuais } = await supabase.auth.mfa.listFactors();
      for (const f of atuais?.all ?? []) {
        if (f.factor_type === "totp" && f.status === "unverified") {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error || !data) {
        setErro("Não foi possível iniciar o 2FA. Tente novamente.");
        return;
      }
      setCodigo("");
      setEstado({ fase: "enrolando", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar() {
    if (estado.fase !== "enrolando") return;
    setErro(null);
    if (!codigoTotpValido(codigo)) {
      setErro("Digite o código de 6 dígitos do aplicativo.");
      return;
    }
    setOcupado(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: estado.factorId,
        code: codigo.trim(),
      });
      if (error) {
        setErro("Código inválido ou expirado. Gere um novo no aplicativo e tente de novo.");
        return;
      }
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function desativar() {
    if (estado.fase !== "ativo") return;
    if (!window.confirm("Desativar o 2FA desta conta? Você poderá reativar quando quiser.")) return;
    setErro(null);
    setOcupado(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: estado.factorId });
      if (error) {
        setErro("Não foi possível desativar o 2FA.");
        return;
      }
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-lg font-semibold tracking-tight text-texto">
          Verificação em duas etapas
        </h1>
        <Link href="/" className="text-sm text-verde hover:underline">
          Voltar
        </Link>
      </div>

      {erro && (
        <p role="alert" className="rounded-lg bg-negativo/10 px-3 py-2 text-sm text-negativo">
          {erro}
        </p>
      )}

      {estado.fase === "carregando" && <p className="text-sm text-cinza">Carregando…</p>}

      {estado.fase === "inativo" && (
        <Card className="flex flex-col gap-4">
          <p className="text-sm text-cinza">
            Ative o 2FA para exigir, a cada login, um código do aplicativo autenticador (Google
            Authenticator, Authy, 1Password) além da senha.
          </p>
          <Botao type="button" onClick={ativar} disabled={ocupado} className="self-start">
            Ativar 2FA
          </Botao>
        </Card>
      )}

      {estado.fase === "enrolando" && (
        <Card className="flex flex-col gap-4">
          <p className="text-sm text-cinza">
            Escaneie o QR code no seu aplicativo autenticador ou digite o segredo manualmente. Depois,
            informe o código de 6 dígitos para confirmar.
          </p>
          <div className="self-center rounded-lg bg-white p-3">
            <Image
              src={`data:image/svg+xml;utf-8,${estado.qr}`}
              alt="QR code para configurar o 2FA"
              width={200}
              height={200}
              unoptimized
            />
          </div>
          <p className="break-all text-center font-mono text-xs text-cinza">{estado.secret}</p>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="000000"
            aria-label="Código de verificação"
            className="w-full text-center tracking-widest"
          />
          <Botao type="button" onClick={confirmar} disabled={ocupado} className="self-start">
            Confirmar e ativar
          </Botao>
        </Card>
      )}

      {estado.fase === "ativo" && (
        <Card className="flex flex-col gap-4">
          <p className="rounded-lg bg-verde/10 px-3 py-2 text-sm text-verde">2FA ativo nesta conta.</p>
          <Botao type="button" variante="secundario" onClick={desativar} disabled={ocupado} className="self-start">
            Desativar 2FA
          </Botao>
        </Card>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Criar a server page com guard de equipe**

```tsx
// src/app/conta/seguranca/page.tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { ehCliente } from "@/lib/portal/permissoes";
import { ContaSeguranca } from "./ContaSeguranca";

export const metadata = { title: "Segurança — 2FA" };

export default async function ContaSegurancaPage() {
  // Só equipe (admin/contador/assistente/financeiro). Cliente do portal não tem 2FA no v1.
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo || ehCliente(perfil.papel)) redirect("/");
  return <ContaSeguranca />;
}
```

- [ ] **Step 3: Adicionar o link "Segurança (2FA)" no Sidebar (mobile + desktop)**

No `src/components/Sidebar.tsx`, adicionar um `<Link>` para `/conta/seguranca` **logo antes** de cada `<form action={sair}>` (há dois: drawer mobile e sidebar desktop). O link fica fora de `menuDoPapel` de propósito (a rota vive fora de `(app)`; ver Global Constraints).

Drawer mobile — trocar:

```tsx
            {nav}
            <form action={sair} className="mt-auto">
```

por:

```tsx
            {nav}
            <Link
              href="/conta/seguranca"
              onClick={() => setAberto(false)}
              className="mt-auto rounded-lg px-3 py-2 text-sm text-texto-claro hover:bg-tinta-2 hover:text-white"
            >
              Segurança (2FA)
            </Link>
            <form action={sair}>
```

Sidebar desktop — trocar:

```tsx
        {nav}
        <form action={sair} className="mt-auto">
```

por:

```tsx
        {nav}
        <Link
          href="/conta/seguranca"
          className="mt-auto rounded-lg px-3 py-2 text-sm text-texto-claro hover:bg-tinta-2 hover:text-white"
        >
          Segurança (2FA)
        </Link>
        <form action={sair}>
```

(O `mt-auto` que empurrava o "Sair" para o rodapé passa para o link de Segurança, que agora é o primeiro do bloco inferior; o form de Sair fica logo abaixo dele.)

- [ ] **Step 4: Verificar (typecheck + lint + testes de UI + build)**

Run: `npm run typecheck && npm run lint && npx vitest run src/tests/ui/`
Expected: sem erros; `navegacao.test.ts` e `rotas-alcancaveis.test.ts` continuam verdes (o link novo não passou por `menuDoPapel`, então não afeta esses testes). `sidebar-render.test.tsx` deve continuar passando — se ele contar itens/links exatos, ajustar o teste para incluir o link de Segurança.

- [ ] **Step 5: Commit**

```bash
git add src/app/conta/seguranca/page.tsx src/app/conta/seguranca/ContaSeguranca.tsx src/components/Sidebar.tsx
git commit -m "feat(mfa): tela /conta/seguranca (enroll/QR/verify/unenroll) + link no menu"
```

---

### Task 4: Gate AAL2 no layout `(app)`

**Files:**
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `decidirGateAal` (Task 1); `createServerSupabase` (já importado no layout); rota `/login/verificar` (Task 2).

O gate fica **depois** de `if (ehCliente(perfil.papel)) redirect("/portal");` e **antes** das contagens de badge — quem vai ser redirecionado não dispara query nenhuma. Como o gate manda para `/login/verificar` (rota top-level, fora de `(app)`), não há loop.

- [ ] **Step 1: Importar `decidirGateAal`**

No topo de `src/app/(app)/layout.tsx`, adicionar após a linha `import { getPerfilAtual } from "@/lib/auth/perfil";`:

```tsx
import { decidirGateAal } from "@/lib/auth/mfa";
```

- [ ] **Step 2: Inserir o gate após o redirect de cliente**

Trocar:

```tsx
  if (ehCliente(perfil.papel)) redirect("/portal");

  const alertasOnboarding = podeCriarCliente(perfil.papel) ? await contarAlertas() : 0;
```

por:

```tsx
  if (ehCliente(perfil.papel)) redirect("/portal");

  // Gate MFA (Fatia A, obrigatorio=false): quem TEM fator verificado (nextLevel aal2) mas ainda
  // está numa sessão aal1 precisa passar pela verificação. É isto que efetivamente exige o 2FA
  // de quem o habilitou — o login em si não muda. Sem fator, segue normal (opcional).
  const supabaseMfa = await createServerSupabase();
  const { data: aal } = await supabaseMfa.auth.mfa.getAuthenticatorAssuranceLevel();
  const decisao = decidirGateAal(
    { currentLevel: aal?.currentLevel ?? null, nextLevel: aal?.nextLevel ?? null },
    false,
  );
  if (decisao === "verificar") redirect("/login/verificar");

  const alertasOnboarding = podeCriarCliente(perfil.papel) ? await contarAlertas() : 0;
```

- [ ] **Step 3: Verificar (typecheck + lint + build)**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: sem erros. `createServerSupabase` já está importado (linha 2); não duplicar o import.

- [ ] **Step 4: Smoke manual (checklist para o executor rodar `npm run dev`)**

- Usuário SEM 2FA: login entra direto no app (nada muda).
- Usuário habilita 2FA em `/conta/seguranca` → após confirmar o código, continua no app (a sessão vira aal2 no mesmo request).
- Novo login do mesmo usuário → cai em `/login/verificar`; código correto → entra; "Sair" → volta ao login.
- Nenhum loop de redirect em `/conta/seguranca` nem `/login/verificar` (ambas fora de `(app)`).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/layout.tsx"
git commit -m "feat(mfa): gate AAL2 no layout (app) desafia quem habilitou 2FA"
```

---

### Task 5: Reset pela admin

**Files:**
- Modify: `src/app/(app)/usuarios/actions.ts`
- Modify: `src/app/(app)/usuarios/page.tsx`

**Interfaces:**
- Consumes: `exigirAdmin()`, `createAdminSupabase()`, `revalidatePath`, `redirect` (já usados em `actions.ts`); `BotaoAcao` (já importado em `page.tsx`); API admin `admin.auth.admin.mfa.listFactors/deleteFactor`.
- Produces: `resetarMfa(usuarioId: string): Promise<void>`.

- [ ] **Step 1: Adicionar a action `resetarMfa`**

Ao final de `src/app/(app)/usuarios/actions.ts`, no molde de `reenviarAcesso`:

```ts
// Reset de 2FA pela admin: remove TODOS os fatores MFA do usuário (recuperação de "perdi o
// autenticador"). Rebaixa a sessão dele para aal1; no próximo acesso ele reconfigura. Não há
// códigos de backup no v1 — este é o caminho de recuperação.
export async function resetarMfa(usuarioId: string) {
  await exigirAdmin();
  const admin = createAdminSupabase();

  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: usuarioId });
  if (error) {
    console.error("resetarMfa (listar):", error.message);
    redirect("/usuarios?erro=1");
  }

  for (const fator of data?.factors ?? []) {
    const { error: errDel } = await admin.auth.admin.mfa.deleteFactor({ id: fator.id, userId: usuarioId });
    if (errDel) {
      console.error("resetarMfa (excluir):", errDel.message);
      redirect("/usuarios?erro=1");
    }
  }

  revalidatePath("/usuarios");
  redirect("/usuarios?ok=mfa");
}
```

Se `revalidatePath` ainda não estiver importado em `actions.ts`, adicionar `import { revalidatePath } from "next/cache";` (verificar o topo do arquivo antes; `redirect` de `next/navigation` já está).

- [ ] **Step 2: Adicionar a mensagem de feedback e o import na page**

Em `src/app/(app)/usuarios/page.tsx`:

Adicionar `resetarMfa` ao import das actions:

```tsx
import { alterarPapel, definirAtivo, reenviarAcesso, definirSuperior, definirDepartamento, resetarMfa } from "./actions";
```

Adicionar a mensagem ao mapa `MSG` (junto de `"ok:reenviado"`):

```tsx
  "ok:mfa": "2FA do usuário resetado — ele reconfigura no próximo acesso.",
```

- [ ] **Step 3: Adicionar o botão "Resetar 2FA" na coluna Acesso**

No `<td>` da coluna "Acesso" (o que contém `<form action={reenviarAcesso.bind(null, u.id)}>`), adicionar logo após esse form:

```tsx
                        <form action={resetarMfa.bind(null, u.id)}>
                          <BotaoAcao
                            rotulo={`Resetar 2FA de ${u.nome}`}
                            confirmar={`Resetar o 2FA de ${u.nome}? Ele precisará reconfigurar no próximo acesso.`}
                            className="text-cinza hover:text-negativo"
                          >
                            Resetar 2FA
                          </BotaoAcao>
                        </form>
```

(Mesmo padrão de `reenviarAcesso`: `resetarMfa.bind(null, u.id)` — o `usuarioId` fica preso pelo bind; o `FormData` que o React anexa é ignorado, exatamente como nas actions de linha existentes.)

- [ ] **Step 4: Verificar (typecheck + lint + build)**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: sem erros. Confirmar que `admin.auth.admin.mfa.listFactors/deleteFactor` tipam (assinaturas na seção Global Constraints).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/usuarios/actions.ts" "src/app/(app)/usuarios/page.tsx"
git commit -m "feat(mfa): reset de 2FA pela admin na tela de usuarios"
```

---

### Task 6: Release 6.65.0

**Files:**
- Modify: `package.json` (version)
- Modify: `CHANGELOG.md`

Produção está em 6.64.0 (confirmar por `curl -s https://app.seusaldo.ai/api/health`). Fatia A não tem migration.

- [ ] **Step 1: Rodar a barra de qualidade completa**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check && npm run build`
Expected: tudo verde. (Se `format:check` falhar, rodar `npm run format` e recommitar.)

- [ ] **Step 2: Bump de versão (sem tag)**

Run: `npm version minor --no-git-tag-version`
Expected: `package.json` vai para `6.65.0`.

- [ ] **Step 3: Entrada no CHANGELOG (topo, mesma versão do package.json)**

Adicionar no topo do `CHANGELOG.md` (o teste `src/tests/versao.test.ts` exige que a versão do topo bata com o `package.json`):

```markdown
## 6.65.0

### Segurança
- **2FA (TOTP) opcional para a equipe.** Cada pessoa ativa/desativa a verificação em duas etapas
  em **Segurança (2FA)** (`/conta/seguranca`) usando um app autenticador; quem habilita passa a ser
  desafiado no login (`/login/verificar`). Admin pode resetar o 2FA de um usuário na tela de Usuários
  (recuperação de "perdi o autenticador"). MFA nativo do Supabase — sem migration. A obrigatoriedade
  por escritório vem na Fatia B.
```

- [ ] **Step 4: Rodar o teste de versão + suíte**

Run: `npx vitest run src/tests/versao.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Commit da release**

```bash
git add package.json CHANGELOG.md
git commit -m "chore(release): 6.65.0 — MFA (TOTP) Fatia A (2FA opcional da equipe)"
```

- [ ] **Step 6: Finalizar a branch**

Seguir a skill **superpowers:finishing-a-development-branch** → opção "Push and create a Pull Request":
`git push origin develop` → `gh pr create --base main --head develop` → aguardar as **duas** execuções do `verify` (esperar "todos concluídos", não só a primeira) → PR verde. **Não** mergear sem autorização explícita do usuário. Deploy (clicar Implantar no EasyPanel), confirmar `curl -s https://app.seusaldo.ai/api/health` mostrando 6.65.0, e só então `npm run release:tag` + `git push origin v6.65.0`.

---

## Self-Review

**1. Cobertura da spec (Fatia A):**
- Habilitar 2FA `/conta/seguranca` (enroll/QR/secret/verify + desativar) → Task 3. ✅
- Item de menu "Segurança (2FA)" → Task 3 (no Sidebar, fora de `menuDoPapel` por causa do teste `rotas-alcancaveis`). ✅
- Verificação no login `/login/verificar` (challengeAndVerify + Sair) → Task 2. ✅
- Gate AAL2 no `(app)/layout.tsx` (`nextLevel aal2` + `currentLevel aal1` → verificar) → Task 4. ✅
- Reset pela admin (`admin.mfa.listFactors`/`deleteFactor`) + botão em `usuarios/page.tsx` → Task 5. ✅
- Testes: `decidirGateAal` (4 casos da spec + AAL nulo) e validação do código de 6 dígitos → Task 1. ✅
- Regra anti-loop (telas fora de `(app)`) → Tasks 2 e 3 (rotas top-level). ✅

**2. Placeholders:** nenhum "TBD"/"similar a"/"tratar erros adequadamente" — todo passo traz o código completo.

**3. Consistência de tipos:** `decidirGateAal(NivelAal, boolean)` e `codigoTotpValido(string)` definidos na Task 1 e consumidos com a mesma assinatura nas Tasks 2/3/4; `resetarMfa(usuarioId: string)` idem entre Task 5 (action) e o botão. Desvio consciente da spec: a assinatura do `decidirGateAal` não recebe `temFator` separado (é derivado de `nextLevel === "aal2"`) — documentado na Task 1 para evitar um parâmetro que poderia contradizer o AAL.

**Nota de execução:** se `sidebar-render.test.tsx` afirmar contagem/lista exata de links, atualizá-lo para incluir "Segurança (2FA)" (Task 3, Step 4). Nenhum outro teste depende do link novo.
