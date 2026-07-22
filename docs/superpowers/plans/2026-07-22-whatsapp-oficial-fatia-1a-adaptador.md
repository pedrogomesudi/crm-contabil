# WhatsApp oficial — Fatia 1A (adaptador + resolvedor + refactor) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduzir a abstração `ProvedorWhatsapp` com a Z-API como adaptador e um resolvedor `adaptadorWhatsappAtivo()`, refatorando os 8 chamadores para usá-lo — **sem mudança de comportamento** (provedor default `zapi`).

**Architecture:** Interface `ProvedorWhatsapp` em `tipos.ts`; `criarAdaptadorZapi(cfg)` embrulha as funções Z-API existentes; `ativo.ts` lê `whatsapp_config.provedor` e devolve o adaptador (`{adaptador,provedor}|{erro}`), no molde de `boleto/ativo.ts`. Migration aditiva adiciona `provedor` + colunas da oficial (ainda sem uso). Os chamadores param de montar `ZapiConfig` na mão.

**Tech Stack:** Next.js 16 · TypeScript · Supabase · Vitest.

## Global Constraints

- **Sem mudança de comportamento:** `provedor` default `zapi`; o resolvedor devolve o mesmo Z-API de hoje. Onde a config faltava, o resolvedor devolve `{erro}` e cada chamador mapeia para o seu comportamento atual (fallback e-mail / erro / skip).
- **Migration idempotente/aditiva** (`add column if not exists`), aplicar por `npm run db:migrate`; próximo número: **`0130`**.
- **`provedor === 'oficial'` ainda não envia** nesta fatia — o resolvedor devolve erro claro (o adaptador oficial entra na Fatia 1B).
- **Cifragem:** `decifrarDominio("whatsapp", cif)` (Node-only, via `createAdminSupabase`).
- **Rede de segurança do refactor:** suíte existente (`src/tests/whatsapp/*`) + typecheck/build.
- **Comandos antes de commitar:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`, `npm run build`.
- **Git:** `develop` → PR para `main` com `verify` verde.

**Fatos verificados:**
- `zapi.ts` exporta `enviarTexto(cfg,tel,txt)`, `enviarMidiaZapi(cfg,tel,midia)`, `statusConexao(cfg)`, `type ZapiConfig`, `type MidiaEnvio`.
- `whatsapp_config` (id=1): `instance, token_cifrado, client_token_cifrado`. Molde do resolvedor: `src/lib/boleto/ativo.ts`.
- 8 chamadores (arquivo → forma de carregar config):
  - `legalizacao/actions.ts` — inline decrypt → `enviarTexto`.
  - `nfse/lote/envio.ts` — inline decrypt → `enviarMidiaZapi`.
  - `atendimento/actions.ts` — inline decrypt (2 sítios: texto e mídia).
  - `financeiro/contas-a-receber/whatsapp.ts` — `carregarConfigZapi()` → `enviarTexto`.
  - `comunicados/actions.ts` — `carregarConfigZapi()` (2 sítios) → `enviarTexto` em loop.
  - `lib/comercial/followup-motor.ts` — inline decrypt condicional (canal) → `enviarTexto(zapi!,…)`.
  - `lib/whatsapp/regua-motor.ts` — inline decrypt + `regua_ativa` no mesmo select → `enviarTexto(zapi,…)` com fallback e-mail.

---

## File Structure

- `src/lib/whatsapp/tipos.ts` (Create) — `ProvedorWhatsapp`, `ResultadoEnvio`, `MidiaEnvio`.
- `src/lib/whatsapp/zapi.ts` (Modify) — importar `MidiaEnvio` de `tipos`; adicionar `criarAdaptadorZapi`.
- `src/lib/whatsapp/ativo.ts` (Create) — `adaptadorWhatsappAtivo()`.
- `src/tests/whatsapp/adaptador.test.ts` (Create) — teste do adaptador Z-API.
- `supabase/migrations/0130_whatsapp_provedor.sql` (Create) — colunas.
- Os 7 arquivos chamadores (Modify).

**Ordem:** tipos+adaptador → migration+resolvedor → chamadores → release.

---

### Task 1: Interface + adaptador Z-API

**Files:**
- Create: `src/lib/whatsapp/tipos.ts`
- Modify: `src/lib/whatsapp/zapi.ts`
- Test: `src/tests/whatsapp/adaptador.test.ts`

**Interfaces:**
- Produces: `ProvedorWhatsapp`, `ResultadoEnvio`, `MidiaEnvio` (tipos); `criarAdaptadorZapi(cfg: ZapiConfig): ProvedorWhatsapp`.

- [ ] **Step 1: Criar `tipos.ts`**

```ts
// src/lib/whatsapp/tipos.ts
export type ResultadoEnvio = { ok: boolean; erro?: string; resposta?: unknown };
export type MidiaEnvio = { tipo: "image" | "document"; base64: string; mime: string; nome: string; caption: string };

export interface ProvedorWhatsapp {
  enviarTexto(telefone: string, texto: string): Promise<ResultadoEnvio>;
  enviarMidia(telefone: string, midia: MidiaEnvio): Promise<ResultadoEnvio>;
  statusConexao(): Promise<{ conectado: boolean; erro?: string }>;
}
```

- [ ] **Step 2: `zapi.ts` — importar `MidiaEnvio` de `tipos` e adicionar o adaptador**

Trocar a definição local `export type MidiaEnvio = …` por um re-export, e adicionar o import do tipo da interface no topo:

```ts
import type { MidiaEnvio, ProvedorWhatsapp } from "./tipos";
export type { MidiaEnvio } from "./tipos";
```

(Remover a linha `export type MidiaEnvio = { … };` que existia — agora vem de `tipos`.)

Ao final do arquivo, adicionar:

```ts
// Adaptador Z-API para a interface ProvedorWhatsapp — fecha sobre a config decifrada.
export function criarAdaptadorZapi(cfg: ZapiConfig): ProvedorWhatsapp {
  return {
    enviarTexto: (telefone, texto) => enviarTexto(cfg, telefone, texto),
    enviarMidia: (telefone, midia) => enviarMidiaZapi(cfg, telefone, midia),
    statusConexao: () => statusConexao(cfg),
  };
}
```

- [ ] **Step 3: Teste do adaptador (satisfaz a interface e delega)**

```ts
// src/tests/whatsapp/adaptador.test.ts
import { describe, it, expect, vi } from "vitest";
import { criarAdaptadorZapi } from "@/lib/whatsapp/zapi";

describe("criarAdaptadorZapi", () => {
  it("expõe os 3 métodos da interface", () => {
    const a = criarAdaptadorZapi({ instance: "i", token: "t", clientToken: "c" });
    expect(typeof a.enviarTexto).toBe("function");
    expect(typeof a.enviarMidia).toBe("function");
    expect(typeof a.statusConexao).toBe("function");
  });

  it("enviarTexto delega ao fetch com a URL/headers da Z-API", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const a = criarAdaptadorZapi({ instance: "inst", token: "tok", clientToken: "cli" });
    const r = await a.enviarTexto("5511999999999", "oi");
    expect(r.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/instances/inst/token/tok/send-text");
    expect((init as RequestInit).headers).toMatchObject({ "Client-Token": "cli" });
    fetchMock.mockRestore();
  });
});
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/tests/whatsapp/adaptador.test.ts && npx vitest run src/tests/whatsapp`
Expected: PASS (novo teste + suíte Z-API intacta).

- [ ] **Step 5: Verificar (typecheck + lint)**

Run: `npm run typecheck && npx eslint src/lib/whatsapp/tipos.ts src/lib/whatsapp/zapi.ts`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp/tipos.ts src/lib/whatsapp/zapi.ts src/tests/whatsapp/adaptador.test.ts
git commit -m "feat(whatsapp): interface ProvedorWhatsapp + adaptador Z-API"
```

---

### Task 2: Migration + resolvedor

**Files:**
- Create: `supabase/migrations/0130_whatsapp_provedor.sql`
- Create: `src/lib/whatsapp/ativo.ts`

**Interfaces:**
- Produces: colunas `provedor`/`oficial_*`; `adaptadorWhatsappAtivo(): Promise<{ adaptador: ProvedorWhatsapp; provedor: "zapi" | "oficial" } | { erro: string }>`.

- [ ] **Step 1: Migration**

```sql
-- supabase/migrations/0130_whatsapp_provedor.sql
-- WhatsApp oficial Sub-projeto 1: escolha de provedor por escritório + credenciais da API oficial.
alter table whatsapp_config add column if not exists provedor text not null default 'zapi'
  check (provedor in ('zapi','oficial'));
alter table whatsapp_config add column if not exists oficial_phone_number_id text;
alter table whatsapp_config add column if not exists oficial_token_cifrado text;
```

- [ ] **Step 2: Aplicar no dev**

Run: `npm run db:migrate`
Expected: `0130_whatsapp_provedor` aplicada.

- [ ] **Step 3: Resolvedor `ativo.ts`**

```ts
// src/lib/whatsapp/ativo.ts
import { createAdminSupabase } from "@/lib/supabase/admin";
import { decifrarDominio } from "@/lib/cripto/envelope";
import { criarAdaptadorZapi } from "./zapi";
import type { ProvedorWhatsapp } from "./tipos";

// Resolve o adaptador de WhatsApp ativo a partir da config do escritório (whatsapp_config.provedor).
// Molde de boleto/ativo.ts. Fatia 1A: só 'zapi' envia; 'oficial' entra na Fatia 1B.
export async function adaptadorWhatsappAtivo(): Promise<
  { adaptador: ProvedorWhatsapp; provedor: "zapi" | "oficial" } | { erro: string }
> {
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("whatsapp_config")
    .select("provedor, instance, token_cifrado, client_token_cifrado")
    .eq("id", 1)
    .maybeSingle();
  const provedor = (data?.provedor as string) ?? "zapi";
  try {
    if (provedor === "oficial") {
      return { erro: "WhatsApp oficial ainda não disponível (em breve)." };
    }
    if (!data?.instance || !data.token_cifrado || !data.client_token_cifrado) {
      return { erro: "WhatsApp (Z-API) não configurado." };
    }
    return {
      adaptador: criarAdaptadorZapi({
        instance: data.instance as string,
        token: (await decifrarDominio("whatsapp", data.token_cifrado as string)).toString("utf8"),
        clientToken: (await decifrarDominio("whatsapp", data.client_token_cifrado as string)).toString("utf8"),
      }),
      provedor: "zapi",
    };
  } catch {
    return { erro: "Criptografia do WhatsApp não configurada ou credenciais inválidas." };
  }
}
```

- [ ] **Step 4: Verificar (typecheck + lint)**

Run: `npm run typecheck && npx eslint src/lib/whatsapp/ativo.ts`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0130_whatsapp_provedor.sql src/lib/whatsapp/ativo.ts
git commit -m "feat(whatsapp): migration provedor + resolvedor adaptadorWhatsappAtivo"
```

---

### Task 3: Refatorar chamadores com decrypt inline (legalizacao, nfse, atendimento)

**Files:**
- Modify: `src/app/(app)/legalizacao/actions.ts`
- Modify: `src/app/(app)/nfse/lote/envio.ts`
- Modify: `src/app/(app)/atendimento/actions.ts`

**Interfaces:**
- Consumes: `adaptadorWhatsappAtivo` (Task 2).

Em cada arquivo: importar `import { adaptadorWhatsappAtivo } from "@/lib/whatsapp/ativo";` e remover imports que ficarem sem uso (`enviarTexto`/`enviarMidiaZapi`/`ZapiConfig`/`decifrarDominio` se o único uso era o WhatsApp). A verificação por lint/typecheck acusa sobras.

- [ ] **Step 1: `legalizacao/actions.ts`**

Trocar o bloco (que carrega `whatsapp_config`, checa e monta `zapi`) por:

```ts
    const ativo = await adaptadorWhatsappAtivo();
    if ("erro" in ativo) return "Etapa concluída, mas o WhatsApp não está configurado.";
    const tel = normalizarTelefone((cli.telefone as string | null) ?? "", (cli.telefone_ddi as string | null) ?? "55");
    if (!tel) return "Etapa concluída, mas o cliente não tem telefone válido para o aviso.";
    const r = await ativo.adaptador.enviarTexto(tel, corpo);
    ok = r.ok;
```

(Substitui desde o `.from("whatsapp_config")…` até o `const r = await enviarTexto(zapi, tel, corpo); ok = r.ok;`. Remove o import `enviarTexto`/`ZapiConfig`; mantém `decifrarDominio` só se ainda usado em outro ponto do arquivo.)

- [ ] **Step 2: `nfse/lote/envio.ts`**

Trocar a carga de config + build do `zapi`:

```ts
  const { data: cfg } = await admin
    .from("whatsapp_config")
    .select("instance, token_cifrado, client_token_cifrado")
    .eq("id", 1)
    .maybeSingle();
  if (!cfg?.instance || !cfg.token_cifrado || !cfg.client_token_cifrado)
    return { status: "erro", motivo: "WhatsApp não configurado.", razaoSocial };
  const zapi = { … };
```

por:

```ts
  const ativo = await adaptadorWhatsappAtivo();
  if ("erro" in ativo) return { status: "erro", motivo: ativo.erro, razaoSocial };
```

E o envio:

```ts
  const r = await enviarMidiaZapi(zapi, tel, {
```

por:

```ts
  const r = await ativo.adaptador.enviarMidia(tel, {
```

(Remove o import `enviarMidiaZapi` e `decifrarDominio` se sem uso.)

- [ ] **Step 3: `atendimento/actions.ts` — sítio de texto (~linha 145)**

Trocar a carga+build+envio:

```ts
  const { data: cfg } = await admin.from("whatsapp_config").select("instance, token_cifrado, client_token_cifrado").eq("id", 1).maybeSingle();
  if (!cfg?.instance || !cfg.token_cifrado || !cfg.client_token_cifrado) return { erro: "WhatsApp não configurado." };
  const zapi = { … };
  const r = await enviarTexto(zapi, telefone, t);
```

por:

```ts
  const ativo = await adaptadorWhatsappAtivo();
  if ("erro" in ativo) return { erro: ativo.erro };
  const r = await ativo.adaptador.enviarTexto(telefone, t);
```

- [ ] **Step 4: `atendimento/actions.ts` — sítio de mídia (~linha 319)**

Trocar analogamente:

```ts
  const ativo = await adaptadorWhatsappAtivo();
  if ("erro" in ativo) return { erro: ativo.erro };
  const buf = Buffer.from(await arquivo.arrayBuffer());
  const nome = arquivo.name || "arquivo";
  const r = await ativo.adaptador.enviarMidia(telefone, { tipo, base64: buf.toString("base64"), mime, nome, caption: legenda });
```

(Ajustar o import de `atendimento/actions.ts`: remover `enviarTexto, enviarMidiaZapi`; manter `decifrarDominio` só se usado em outro ponto — este arquivo pode usá-lo para inbound; verificar.)

- [ ] **Step 5: Verificar (typecheck + lint + suíte + build)**

Run: `npm run typecheck && npx eslint "src/app/(app)/legalizacao/actions.ts" "src/app/(app)/nfse/lote/envio.ts" "src/app/(app)/atendimento/actions.ts" && npm test && npm run build`
Expected: sem erros; suíte verde. Corrigir imports órfãos que o lint apontar.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/legalizacao/actions.ts" "src/app/(app)/nfse/lote/envio.ts" "src/app/(app)/atendimento/actions.ts"
git commit -m "refactor(whatsapp): legalizacao/nfse/atendimento usam adaptadorWhatsappAtivo"
```

---

### Task 4: Refatorar chamadores via `carregarConfigZapi` (financeiro, comunicados)

**Files:**
- Modify: `src/app/(app)/financeiro/contas-a-receber/whatsapp.ts`
- Modify: `src/app/(app)/comunicados/actions.ts`

- [ ] **Step 1: `financeiro/contas-a-receber/whatsapp.ts`**

Trocar:

```ts
  const cfg = await carregarConfigZapi();
  …
  if (!cfg) {
    erro = "WhatsApp não configurado.";
  } else {
    const r = await enviarTexto(cfg, tel, textoFinal);
    status = r.ok ? "ENVIADO" : "ERRO";
    resposta = r.resposta ?? r.erro;
    if (!r.ok) erro = r.erro ?? "Falha no envio.";
  }
```

por:

```ts
  const ativo = await adaptadorWhatsappAtivo();
  let status: "ENVIADO" | "ERRO" = "ERRO";
  let resposta: unknown = null;
  let erro: string | undefined;
  if ("erro" in ativo) {
    erro = ativo.erro;
  } else {
    const r = await ativo.adaptador.enviarTexto(tel, textoFinal);
    status = r.ok ? "ENVIADO" : "ERRO";
    resposta = r.resposta ?? r.erro;
    if (!r.ok) erro = r.erro ?? "Falha no envio.";
  }
```

(Remover import `carregarConfigZapi` e `enviarTexto`; adicionar `adaptadorWhatsappAtivo`. As declarações `let status/resposta/erro` que já existiam antes do bloco saem se forem redeclaradas aqui — manter uma única declaração.)

- [ ] **Step 2: `comunicados/actions.ts` — os 2 sítios**

Em cada função, trocar:

```ts
  const zapi = input.canal === "whatsapp" ? await carregarConfigZapi() : null;
  if (input.canal === "whatsapp" && !zapi) return { erro: "WhatsApp não configurado." };
```

por:

```ts
  const ativoWa = input.canal === "whatsapp" ? await adaptadorWhatsappAtivo() : null;
  if (input.canal === "whatsapp" && (!ativoWa || "erro" in ativoWa)) return { erro: "WhatsApp não configurado." };
  const adaptadorWa = ativoWa && !("erro" in ativoWa) ? ativoWa.adaptador : null;
```

E no loop, trocar:

```ts
      if (!tel || !zapi) {
        msgErro = "Telefone inválido.";
      } else {
        const r = await enviarTexto(zapi, tel, aplicarTemplate(corpo, vars));
```

por:

```ts
      if (!tel || !adaptadorWa) {
        msgErro = "Telefone inválido.";
      } else {
        const r = await adaptadorWa.enviarTexto(tel, aplicarTemplate(corpo, vars));
```

(No 2º sítio — a função de reenvio, ~linha 347 — repetir o mesmo padrão com o nome de variável de lá.) Remover imports `carregarConfigZapi`/`enviarTexto`; adicionar `adaptadorWhatsappAtivo`.

- [ ] **Step 3: Verificar (typecheck + lint + build)**

Run: `npm run typecheck && npx eslint "src/app/(app)/financeiro/contas-a-receber/whatsapp.ts" "src/app/(app)/comunicados/actions.ts" && npm run build`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/financeiro/contas-a-receber/whatsapp.ts" "src/app/(app)/comunicados/actions.ts"
git commit -m "refactor(whatsapp): financeiro/comunicados usam adaptadorWhatsappAtivo"
```

---

### Task 5: Refatorar os motores (followup, régua) — preservando o fallback e-mail

**Files:**
- Modify: `src/lib/comercial/followup-motor.ts`
- Modify: `src/lib/whatsapp/regua-motor.ts`

**Interfaces:**
- Consumes: `adaptadorWhatsappAtivo`. Produz um adaptador **nullable** (`adaptadorWa`) que preserva a semântica "sem WhatsApp → segue por e-mail".

- [ ] **Step 1: `followup-motor.ts`**

Trocar o bloco condicional que monta `zapi` (só quando `canal === "whatsapp"`):

```ts
  let zapi: ZapiConfig | null = null;
  if (canal === "whatsapp") {
    const { data: w } = await admin
      .from("whatsapp_config")
      .select("instance, token_cifrado, client_token_cifrado")
      .eq("id", 1)
      .maybeSingle();
    if (w?.instance && w.token_cifrado && w.client_token_cifrado) {
      zapi = { … };
    }
  }
```

por:

```ts
  let adaptadorWa: import("@/lib/whatsapp/tipos").ProvedorWhatsapp | null = null;
  if (canal === "whatsapp") {
    const ativo = await adaptadorWhatsappAtivo();
    if (!("erro" in ativo)) adaptadorWa = ativo.adaptador;
  }
```

E o envio no loop:

```ts
        const r = await enviarTexto(zapi!, tel, corpo);
```

por:

```ts
        const r = await adaptadorWa!.enviarTexto(tel, corpo);
```

(Remover `enviarTexto`/`ZapiConfig`/`decifrarDominio` se sem uso; adicionar `adaptadorWhatsappAtivo`. O `!` é mantido: o guard que já protegia `zapi!` — canal whatsapp com config — segue idêntico com `adaptadorWa!`.)

- [ ] **Step 2: `regua-motor.ts`**

O `whatsapp_config` é lido junto de `regua_ativa`. Manter a leitura de `regua_ativa` e trocar só o build do `zapi`:

```ts
  const { data: cfg } = await admin
    .from("whatsapp_config")
    .select("instance, token_cifrado, client_token_cifrado, regua_ativa")
    .eq("id", 1)
    .maybeSingle();
  const ativa = Boolean(cfg?.regua_ativa);
  if (!opts?.forcarManual && !ativa) return { ...base, ativa, motivo: "Régua desligada." };

  let zapi: ZapiConfig | null = null;
  if (cfg?.instance && cfg.token_cifrado && cfg.client_token_cifrado) {
    zapi = { … };
  }
```

por:

```ts
  const { data: cfg } = await admin
    .from("whatsapp_config")
    .select("regua_ativa")
    .eq("id", 1)
    .maybeSingle();
  const ativa = Boolean(cfg?.regua_ativa);
  if (!opts?.forcarManual && !ativa) return { ...base, ativa, motivo: "Régua desligada." };

  const ativoWa = await adaptadorWhatsappAtivo();
  const adaptadorWa = "erro" in ativoWa ? null : ativoWa.adaptador;
```

E o envio:

```ts
    if (canal === "whatsapp" && zapi && estado.telefone) {
      const texto = aplicarTemplate(etapa.template, vars);
      const r = await enviarTexto(zapi, estado.telefone, texto);
```

por:

```ts
    if (canal === "whatsapp" && adaptadorWa && estado.telefone) {
      const texto = aplicarTemplate(etapa.template, vars);
      const r = await adaptadorWa.enviarTexto(estado.telefone, texto);
```

(Remover `enviarTexto`/`ZapiConfig`/`decifrarDominio` se sem uso; adicionar `adaptadorWhatsappAtivo`.)

- [ ] **Step 3: Verificar (typecheck + lint + suíte de régua/followup + build)**

Run: `npm run typecheck && npx eslint src/lib/comercial/followup-motor.ts src/lib/whatsapp/regua-motor.ts && npx vitest run src/tests/whatsapp src/tests/comercial 2>/dev/null; npm test && npm run build`
Expected: sem erros; `src/tests/whatsapp/regua.test.ts` verde (guarda o comportamento do fallback).

- [ ] **Step 4: Commit**

```bash
git add src/lib/comercial/followup-motor.ts src/lib/whatsapp/regua-motor.ts
git commit -m "refactor(whatsapp): motores followup/regua usam adaptadorWhatsappAtivo (fallback e-mail preservado)"
```

---

### Task 6: Release 6.71.0

**Files:**
- Modify: `package.json`, `package-lock.json`, `CHANGELOG.md`

Produção em 6.70.0. **Tem migration** (`0130`, aditiva) — aplicar em produção **antes** do deploy.

- [ ] **Step 1: Barra completa**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check && npm run build`
Expected: verde. (Se `format:check` falhar → `npm run format` e recommitar.)

- [ ] **Step 2: Bump (incluir lockfile)**

Run: `npm version minor --no-git-tag-version`
Expected: `6.71.0`.

- [ ] **Step 3: CHANGELOG (topo, acima de 6.70.0)**

```markdown
## [6.71.0] — 2026-07-22

### Interno

- **Fundação do WhatsApp por provedor.** O envio de WhatsApp passou a usar uma abstração de provedor
  (`ProvedorWhatsapp`) com a Z-API como adaptador, preparando a plataforma para a API oficial como
  opção por escritório. Sem mudança de comportamento (provedor padrão: Z-API). (Migration `0130`
  adiciona `whatsapp_config.provedor` e campos da API oficial, ainda sem uso.)
```

- [ ] **Step 4: Teste de versão + suíte**

Run: `npx vitest run src/tests/versao.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Commit da release**

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): 6.71.0 — fundacao WhatsApp por provedor (Fatia 1A)"
```

- [ ] **Step 6: Finalizar (PR) — com a ordem migração→deploy**

`git push origin develop` → `gh pr create --base main --head develop` → aguardar as **duas** execuções do `verify` → **não** mergear sem autorização. Após merge (autorizado):
1. `node --env-file=.env.producao.bak scripts/db-migrate.mjs` (aplicar `0130`) — aditiva, não afeta o 6.70.0 no ar.
2. Implantar → `/api/health` = `6.71.0` → `npm run release:tag` + push da tag → sincronizar `develop` com `main`.

---

## Self-Review

**1. Cobertura do spec (Fatia 1A):**
- Interface `ProvedorWhatsapp` + adaptador Z-API → Task 1. ✅
- Migration `provedor` + colunas oficiais + resolvedor `adaptadorWhatsappAtivo` → Task 2. ✅
- Refactor dos 8 chamadores (7 arquivos) → Tasks 3–5. ✅
- Sem mudança de comportamento (default zapi; fallback e-mail preservado nos motores) → Tasks 3–5. ✅

**2. Placeholders:** os blocos com `{ … }` referem-se a código pré-existente que está sendo **removido/substituído** (o build do objeto `zapi`), não a código novo a escrever — o novo código está completo. Nenhuma pendência de implementação.

**3. Consistência de tipos:** `adaptadorWhatsappAtivo()` devolve `{adaptador,provedor}|{erro}` e todos os chamadores discriminam por `"erro" in ativo`. `criarAdaptadorZapi(cfg)` (Task 1) usado só no resolvedor (Task 2). O adaptador nullable dos motores (`adaptadorWa`) preserva o guard `&& adaptadorWa`.

**Nota de execução:** o refactor é o grosso do risco; a rede é a suíte `src/tests/whatsapp/*` (regua/notas/inbox/mensagem) + typecheck/build. Rodar `npm test` ao fim de cada task de refactor. Se o lint apontar import órfão (`enviarTexto`/`ZapiConfig`/`decifrarDominio`), removê-lo — a menos que o arquivo ainda o use noutro ponto (ex.: `decifrarDominio` no inbound do atendimento).
