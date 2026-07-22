# RNF-09 (parte) — MFA (TOTP) para a equipe (design)

## Objetivo

Autenticação de dois fatores por TOTP (app autenticador) para os papéis de equipe, com o MFA
**nativo do Supabase Auth** (enroll/challenge/verify + níveis AAL). Opcional por usuário, com um
interruptor de escritório para exigir de toda a equipe. Fecha a parte de MFA do RNF-09 (SSO fica
para depois, exige plano pago).

## Contexto (do mapa da auth)

- **Zero MFA/AAL hoje** — adição pura, sem migração de dados. Os fatores vivem no Supabase Auth
  (`auth.mfa_factors`), não em `usuarios`.
- **Sem lib nova:** `mfa.enroll({ factorType: "totp" })` devolve `data.totp.qr_code` (SVG data-URI),
  `secret` e `uri`. Cobre enroll/challenge/verify/listFactors/unenroll + `getAuthenticatorAssuranceLevel`.
- **Não existe tela de conta pessoal** — greenfield para o "Configurar 2FA".
- Login: `entrar` em `src/app/login/actions.ts` (`signInWithPassword` → `redirect("/")`). Gate da
  equipe: `src/app/(app)/layout.tsx` (`getPerfilAtual` + redirect login). `escritorio_config`
  (singleton id=1) é o lugar da flag de política.

## Decisões (do brainstorm)

- **Obrigatoriedade:** opcional por usuário **+ interruptor de escritório** ("exigir 2FA da equipe").
- **Abrangência:** só **equipe** (admin/contador/assistente/financeiro). Portal do cliente fora do v1.
- **Recuperação:** sem códigos de backup; "perdi o autenticador" = **reset pela admin**.
- **Entrega em 2 fatias:** A (opcional ponta a ponta, sem migration) · B (obrigatoriedade).

## Arquitetura

Regra de ouro contra loop de redirecionamento: as telas `/conta/seguranca` e `/login/verificar`
ficam **fora do grupo `(app)`** (guard de sessão próprio), para o gate AAL do `(app)/layout` não as
redirecionar para si mesmas.

### Fatia A — MFA opcional (sem migration)

#### 1. Habilitar 2FA — `src/app/conta/seguranca/`

Rota top-level (fora de `(app)`), com guard próprio: `getPerfilAtual()` + exige papel de equipe
(`podeCriarCliente` ou `PAPEIS_EQUIPE`), senão `redirect("/")`. Client component (`ContaSeguranca.tsx`)
usando `createBrowserSupabase()`:
- Se **não há fator TOTP** (`mfa.listFactors()`): botão "Ativar 2FA" → `mfa.enroll({ factorType: "totp" })`
  → renderiza `data.totp.qr_code` (SVG) + `data.totp.secret` (para digitar manual); campo de código de
  6 dígitos → `mfa.challengeAndVerify({ factorId, code })`. Sucesso → mostra "2FA ativo".
- Se **há fator verificado**: mostra "2FA ativo" + botão "Desativar" → `mfa.unenroll({ factorId })`
  (com `confirm`). *(Se o escritório exigir MFA — Fatia B — o desativar é bloqueado.)*
- Erros de código inválido/expirado tratados com mensagem clara; nada de segredo em log.

Menu: item "Segurança (2FA)" para a equipe, em `src/components/Sidebar.tsx` (ou no índice
`/configuracoes`), apontando para `/conta/seguranca`.

#### 2. Verificação no login — `src/app/login/verificar/`

Rota top-level. Server page: `getPerfilAtual()` (exige sessão); lê o fator via `listFactors`. Um
client component coleta o código de 6 dígitos e chama `mfa.challengeAndVerify({ factorId, code })`
(browser client — a sessão aal1 já está nos cookies). Sucesso → `router.push("/")` (agora aal2).
Botão "Sair" (signOut → /login) para quem não consegue o código.

#### 3. Gate AAL2 — `src/app/(app)/layout.tsx`

Após validar `perfil` (e antes do conteúdo), com o `createServerSupabase()`:
```
const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
if (aal?.nextLevel === "aal2" && aal.currentLevel === "aal1") redirect("/login/verificar");
```
- `nextLevel === "aal2"` significa que o usuário **tem** fator verificado; se a sessão ainda é aal1,
  precisa verificar. É isto que efetivamente exige o 2FA de quem habilitou (o login em si não muda).
- Sem fator (`nextLevel === "aal1"`) → segue normal (opcional). A **força de enroll** entra na Fatia B.
- Espelhar `getAuthenticatorAssuranceLevel` com `cache()` se for chamado em mais de um lugar por request.

#### 4. Reset pela admin — `src/app/(app)/usuarios/actions.ts` + UI

Nova action `resetarMfa(userId)` no padrão `exigirAdmin()` + `createAdminSupabase()`:
- `admin.auth.admin.mfa.listFactors({ userId })` → para cada, `admin.auth.admin.mfa.deleteFactor({ id, userId })`.
- Rebaixa o alvo para aal1; no próximo login ele reconfigura. Botão "Resetar 2FA" (com `confirm`) na
  linha do usuário em `src/app/(app)/usuarios/page.tsx`. **Verificar a assinatura exata de
  `admin.auth.admin.mfa.*` na versão do supabase-js instalada** (fallback: consultar a doc/tipos).

### Fatia B — Obrigatoriedade por escritório (com migration)

#### 5. Migration `NNNN_mfa_obrigatorio.sql`

`alter table escritorio_config add column if not exists mfa_obrigatorio boolean not null default false;`
(escrita já é admin-only pela RLS existente).

#### 6. Interruptor de config

Em Configurações (nova página `configuracoes/seguranca/` ou reuso de uma existente): toggle
`mfa_obrigatorio` (carregar/salvar via service_role, gate admin — molde de `configuracoes/receita`).

#### 7. Gate de enroll forçado — `(app)/layout.tsx`

Ler `escritorio_config.mfa_obrigatorio`; se **ligado** e o usuário **não tem fator**
(`aal.nextLevel === "aal1"`), `redirect("/conta/seguranca?exigido=1")` (a tela mostra um aviso de
que é obrigatório e não deixa "pular"). Com o interruptor ligado, a tela `/conta/seguranca` também
**bloqueia o desativar** enquanto for exigido.

## Testes

O MFA é quase todo I/O do Supabase (enroll/verify) — a lógica pura testável é pequena:
- `src/lib/auth/mfa.ts` — `decidirGateAal({ currentLevel, nextLevel }, obrigatorio, temFator): "verificar" | "enrollar" | "ok"` — a decisão pura do gate (verificar / forçar enroll / seguir), testada com os casos: tem fator + aal1 → verificar; sem fator + obrigatório → enrollar; sem fator + não obrigatório → ok; aal2 → ok.
- Validação do código (6 dígitos numéricos) — helper puro + teste.

O fluxo end-to-end (enroll real, QR, verify) é verificado por build + smoke manual com um app
autenticador.

## Fora de escopo (v1)

Códigos de backup (recovery é reset pela admin); MFA para clientes do portal; SMS/e-mail como
segundo fator (só TOTP); SSO/SAML (RNF-09 parte 2, exige plano pago); WebAuthn/passkeys.

## Sequência de entrega

| Fatia | Entrega | Migration |
|---|---|---|
| A | Habilitar 2FA (`/conta/seguranca`) + verificação no login (`/login/verificar`) + gate "quem habilitou é desafiado" + reset pela admin | — |
| B | Flag `mfa_obrigatorio` + interruptor de config + gate de enroll forçado + bloqueio do desativar | sim (0128+) |

Cada fatia é uma release; a spec é a fonte comum e cada fatia ganha seu plano na hora de executar.
