# WhatsApp oficial — Fatia 1B (adaptador oficial + escolha na UI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o adaptador da API oficial (Cloud API) com envio de texto + status, ligá-lo ao resolvedor quando `provedor === 'oficial'`, e dar ao admin uma UI para escolher o provedor e informar as credenciais da oficial.

**Architecture:** `oficial.ts` implementa `ProvedorWhatsapp` (texto + status; mídia fica para 1C). O resolvedor `adaptadorWhatsappAtivo()` passa a montar o adaptador oficial (decifrando `oficial_token_cifrado`). A config UI ganha um seletor de provedor com campos condicionais; `salvarConfigWhatsapp` grava `provedor` + os campos do provedor escolhido; `testarConexao` testa o provedor atual via o resolvedor. Sem migration (colunas vieram na 1A).

**Tech Stack:** Next.js 16 · TypeScript · Supabase · Vitest.

## Global Constraints

- **API oficial (Cloud API, Meta Graph `v21.0`):** envio de texto `POST /{phone_number_id}/messages`, `Authorization: Bearer {token}`, corpo `{ messaging_product:"whatsapp", to, type:"text", text:{ preview_url:false, body } }`. Status: `GET /{phone_number_id}` (Bearer) → 200 = conectado.
- **Janela de 24h:** proativos fora dela só com templates (Sub-projeto 3) — a UI deve avisar que a oficial ainda não cobre régua/avisos. Um escritório **não deve ligar a oficial de verdade** antes dos Sub-projetos 2 e 3.
- **Mídia na oficial:** fica para a Fatia 1C — `enviarMidia` do adaptador oficial devolve erro claro.
- **Segredos:** token oficial cifrado com `cifrarDominio("whatsapp", …)`; nunca em log. Campo de token vazio no save = **mantém** o existente.
- **Best-effort de rede:** `fetch` com `AbortSignal.timeout(15000)`; erros mapeados, sem lançar.
- **Comandos antes de commitar:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`, `npm run build`.
- **Git:** `develop` → PR para `main` com `verify` verde.

**Fatos verificados:**
- `whatsapp_config` já tem `provedor`, `oficial_phone_number_id`, `oficial_token_cifrado` (migration 0130 da Fatia 1A).
- Resolvedor `src/lib/whatsapp/ativo.ts` hoje retorna `{erro}` para `provedor === 'oficial'`.
- Config UI: `configuracoes/whatsapp/{page,Formularios,actions}.tsx`. `salvarConfigWhatsapp(_prev, fd)` grava instance/token/client-token cifrados; `testarConexao()` usa `carregarConfigZapi` + `statusConexao`; `exigirAdmin`, `cifrarDominio` disponíveis.
- Interface `ProvedorWhatsapp` e `criarAdaptadorZapi` em `tipos.ts`/`zapi.ts`.

---

## File Structure

- `src/lib/whatsapp/oficial.ts` (Create) — `OficialConfig`, `montarEnvioTextoOficial`, `criarAdaptadorOficial`.
- `src/tests/whatsapp/oficial.test.ts` (Create) — testes do adaptador oficial.
- `src/lib/whatsapp/ativo.ts` (Modify) — montar o adaptador oficial.
- `src/app/(app)/configuracoes/whatsapp/actions.ts` (Modify) — `salvarConfigWhatsapp` por provedor; `carregarConfigWhatsapp`; `testarConexao` via resolvedor.
- `src/app/(app)/configuracoes/whatsapp/page.tsx` (Modify) — carregar config + título "WhatsApp".
- `src/app/(app)/configuracoes/whatsapp/Formularios.tsx` (Modify) — seletor de provedor + campos condicionais.
- `src/tests/whatsapp/form-whatsapp-render.test.tsx` (Create) — render do seletor.

**Ordem:** adaptador → resolvedor → actions → UI → release.

---

### Task 1: Adaptador oficial

**Files:**
- Create: `src/lib/whatsapp/oficial.ts`
- Test: `src/tests/whatsapp/oficial.test.ts`

**Interfaces:**
- Produces: `OficialConfig = { phoneNumberId: string; token: string; versao?: string }`; `montarEnvioTextoOficial(cfg, telefone, texto): { url; headers; body }`; `criarAdaptadorOficial(cfg): ProvedorWhatsapp`.

- [ ] **Step 1: Escrever o teste que falha (parte pura + interface)**

```ts
// src/tests/whatsapp/oficial.test.ts
import { describe, it, expect, vi } from "vitest";
import { montarEnvioTextoOficial, criarAdaptadorOficial } from "@/lib/whatsapp/oficial";

const CFG = { phoneNumberId: "123456", token: "TKN" };

describe("montarEnvioTextoOficial", () => {
  it("monta URL, Bearer e corpo de texto (Cloud API)", () => {
    const req = montarEnvioTextoOficial(CFG, "5511999999999", "oi");
    expect(req.url).toBe("https://graph.facebook.com/v21.0/123456/messages");
    expect(req.headers.Authorization).toBe("Bearer TKN");
    const body = JSON.parse(req.body);
    expect(body).toMatchObject({ messaging_product: "whatsapp", to: "5511999999999", type: "text" });
    expect(body.text.body).toBe("oi");
  });

  it("respeita versão custom", () => {
    expect(montarEnvioTextoOficial({ ...CFG, versao: "v22.0" }, "5511", "x").url).toContain("/v22.0/");
  });
});

describe("criarAdaptadorOficial", () => {
  it("satisfaz a interface; enviarMidia ainda não disponível", async () => {
    const a = criarAdaptadorOficial(CFG);
    expect(typeof a.enviarTexto).toBe("function");
    expect(typeof a.statusConexao).toBe("function");
    const m = await a.enviarMidia("5511", { tipo: "document", base64: "", mime: "application/pdf", nome: "x", caption: "" });
    expect(m.ok).toBe(false);
  });

  it("enviarTexto: HTTP 200 → ok; HTTP 4xx → erro", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "wamid" }] }), { status: 200 }));
    const ok = await criarAdaptadorOficial(CFG).enviarTexto("5511", "oi");
    expect(ok.ok).toBe(true);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: {} }), { status: 400 }));
    const bad = await criarAdaptadorOficial(CFG).enviarTexto("5511", "oi");
    expect(bad.ok).toBe(false);
    expect(bad.erro).toContain("400");
    fetchMock.mockRestore();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/whatsapp/oficial.test.ts`
Expected: FAIL — import não resolve.

- [ ] **Step 3: Implementar**

```ts
// src/lib/whatsapp/oficial.ts
import type { ProvedorWhatsapp } from "./tipos";

export type OficialConfig = { phoneNumberId: string; token: string; versao?: string };

const VERSAO_PADRAO = "v21.0";
function baseUrl(cfg: OficialConfig): string {
  return `https://graph.facebook.com/${cfg.versao ?? VERSAO_PADRAO}`;
}

// Monta o envio de texto da Cloud API (puro, testável).
export function montarEnvioTextoOficial(
  cfg: OficialConfig,
  telefone: string,
  texto: string,
): { url: string; headers: Record<string, string>; body: string } {
  return {
    url: `${baseUrl(cfg)}/${cfg.phoneNumberId}/messages`,
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: telefone,
      type: "text",
      text: { preview_url: false, body: texto },
    }),
  };
}

// Adaptador da API oficial (Cloud API). Texto + status; mídia entra na Fatia 1C.
export function criarAdaptadorOficial(cfg: OficialConfig): ProvedorWhatsapp {
  return {
    enviarTexto: async (telefone, texto) => {
      const req = montarEnvioTextoOficial(cfg, telefone, texto);
      try {
        const res = await fetch(req.url, {
          method: "POST",
          headers: req.headers,
          body: req.body,
          signal: AbortSignal.timeout(15000),
        });
        const corpo = await res.json().catch(() => null);
        if (!res.ok) return { ok: false, erro: `WhatsApp oficial HTTP ${res.status}`, resposta: corpo };
        return { ok: true, resposta: corpo };
      } catch (e) {
        return { ok: false, erro: e instanceof Error && e.name === "TimeoutError" ? "Tempo esgotado." : "Erro de rede." };
      }
    },
    enviarMidia: async () => ({
      ok: false,
      erro: "Envio de mídia pela API oficial ainda não disponível (em breve).",
    }),
    statusConexao: async () => {
      try {
        const res = await fetch(`${baseUrl(cfg)}/${cfg.phoneNumberId}`, {
          headers: { Authorization: `Bearer ${cfg.token}` },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return { conectado: false, erro: `WhatsApp oficial HTTP ${res.status}` };
        return { conectado: true };
      } catch {
        return { conectado: false, erro: "Erro de rede." };
      }
    },
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/whatsapp/oficial.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar (typecheck + lint)**

Run: `npm run typecheck && npx eslint src/lib/whatsapp/oficial.ts`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp/oficial.ts src/tests/whatsapp/oficial.test.ts
git commit -m "feat(whatsapp): adaptador da API oficial (texto + status)"
```

---

### Task 2: Ligar o adaptador oficial no resolvedor

**Files:**
- Modify: `src/lib/whatsapp/ativo.ts`

**Interfaces:**
- Consumes: `criarAdaptadorOficial` (Task 1).

- [ ] **Step 1: Incluir as colunas oficiais no select e montar o adaptador**

No `ativo.ts`, adicionar o import:

```ts
import { criarAdaptadorOficial } from "./oficial";
```

Trocar o `select` para incluir as colunas oficiais:

```ts
    .select("provedor, instance, token_cifrado, client_token_cifrado, oficial_phone_number_id, oficial_token_cifrado")
```

Trocar o ramo `if (provedor === "oficial")`:

```ts
    if (provedor === "oficial") {
      return { erro: "WhatsApp oficial ainda não disponível (em breve)." };
    }
```

por:

```ts
    if (provedor === "oficial") {
      if (!data?.oficial_phone_number_id || !data.oficial_token_cifrado) {
        return { erro: "WhatsApp oficial sem credenciais configuradas." };
      }
      return {
        adaptador: criarAdaptadorOficial({
          phoneNumberId: data.oficial_phone_number_id as string,
          token: (await decifrarDominio("whatsapp", data.oficial_token_cifrado as string)).toString("utf8"),
        }),
        provedor: "oficial",
      };
    }
```

- [ ] **Step 2: Verificar (typecheck + lint + suíte whatsapp)**

Run: `npm run typecheck && npx eslint src/lib/whatsapp/ativo.ts && npx vitest run src/tests/whatsapp`
Expected: sem erros; suíte verde.

- [ ] **Step 3: Commit**

```bash
git add src/lib/whatsapp/ativo.ts
git commit -m "feat(whatsapp): resolvedor monta o adaptador oficial quando provedor=oficial"
```

---

### Task 3: Config actions — salvar por provedor + testar via resolvedor

**Files:**
- Modify: `src/app/(app)/configuracoes/whatsapp/actions.ts`

**Interfaces:**
- Produces: `carregarConfigWhatsapp(): Promise<{ provedor: string; instance: string; zapiConfigurado: boolean; oficialPhoneNumberId: string; oficialConfigurado: boolean }>`; `salvarConfigWhatsapp` (por provedor); `testarConexao` (via resolvedor).

- [ ] **Step 1: Importar o resolvedor**

Adicionar em `actions.ts`:

```ts
import { adaptadorWhatsappAtivo } from "@/lib/whatsapp/ativo";
```

- [ ] **Step 2: `carregarConfigWhatsapp` (loader da página)**

Adicionar:

```ts
export async function carregarConfigWhatsapp(): Promise<{
  provedor: string;
  instance: string;
  zapiConfigurado: boolean;
  oficialPhoneNumberId: string;
  oficialConfigurado: boolean;
}> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("whatsapp_config")
    .select("provedor, instance, token_cifrado, oficial_phone_number_id, oficial_token_cifrado")
    .eq("id", 1)
    .maybeSingle();
  return {
    provedor: (data?.provedor as string) ?? "zapi",
    instance: (data?.instance as string) ?? "",
    zapiConfigurado: Boolean(data?.token_cifrado),
    oficialPhoneNumberId: (data?.oficial_phone_number_id as string) ?? "",
    oficialConfigurado: Boolean(data?.oficial_token_cifrado),
  };
}
```

- [ ] **Step 3: Substituir `salvarConfigWhatsapp` (branch por provedor; token vazio = mantém)**

```ts
export async function salvarConfigWhatsapp(_prev: EstadoWa, fd: FormData): Promise<EstadoWa> {
  const perfil = await exigirAdmin();
  if (!perfil) return { erro: "Apenas admin." };
  const provedor = String(fd.get("provedor") ?? "zapi");
  if (provedor !== "zapi" && provedor !== "oficial") return { erro: "Provedor inválido." };

  const patch: Record<string, unknown> = {
    provedor,
    atualizado_em: new Date().toISOString(),
    atualizado_por: perfil.id,
  };
  try {
    if (provedor === "zapi") {
      const instance = String(fd.get("instance") ?? "").trim();
      const token = String(fd.get("token") ?? "").trim();
      const clientToken = String(fd.get("client_token") ?? "").trim();
      if (!instance) return { erro: "Preencha o Instance ID." };
      patch.instance = instance;
      if (token) patch.token_cifrado = await cifrarDominio("whatsapp", Buffer.from(token, "utf8"));
      if (clientToken) patch.client_token_cifrado = await cifrarDominio("whatsapp", Buffer.from(clientToken, "utf8"));
    } else {
      const phoneNumberId = String(fd.get("oficial_phone_number_id") ?? "").trim();
      const token = String(fd.get("oficial_token") ?? "").trim();
      if (!phoneNumberId) return { erro: "Preencha o Phone Number ID." };
      patch.oficial_phone_number_id = phoneNumberId;
      if (token) patch.oficial_token_cifrado = await cifrarDominio("whatsapp", Buffer.from(token, "utf8"));
    }
  } catch {
    return { erro: "Criptografia não configurada no servidor." };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("whatsapp_config").update(patch).eq("id", 1);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath("/configuracoes/whatsapp");
  return { ok: true };
}
```

- [ ] **Step 4: Substituir `testarConexao` (usa o provedor ativo)**

```ts
export async function testarConexao(): Promise<EstadoWa> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const ativo = await adaptadorWhatsappAtivo();
  if ("erro" in ativo) return { erro: ativo.erro };
  const r = await ativo.adaptador.statusConexao();
  return r.erro ? { erro: r.erro } : { conectado: r.conectado };
}
```

(Se `statusConexao`/`carregarConfigZapi`/`type ZapiConfig` ficarem sem uso no arquivo, remover os imports que o lint apontar — `carregarConfigZapi` continua exportada e usada por outros? Após a Fatia 1A não; manter só se algo ainda importar.)

- [ ] **Step 5: Verificar (typecheck + lint)**

Run: `npm run typecheck && npx eslint "src/app/(app)/configuracoes/whatsapp/actions.ts"`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/configuracoes/whatsapp/actions.ts"
git commit -m "feat(whatsapp): config salva por provedor e testa o provedor ativo"
```

---

### Task 4: Config UI — seletor de provedor

**Files:**
- Modify: `src/app/(app)/configuracoes/whatsapp/page.tsx`
- Modify: `src/app/(app)/configuracoes/whatsapp/Formularios.tsx`
- Test: `src/tests/whatsapp/form-whatsapp-render.test.tsx`

- [ ] **Step 1: Página carrega a config e passa por props**

Substituir o corpo de `page.tsx`:

```tsx
import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeConfigurarWhatsapp } from "@/lib/clientes/permissoes";
import { FormWhatsapp } from "./Formularios";
import { carregarConfigWhatsapp } from "./actions";

export default async function ConfigWhatsappPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeConfigurarWhatsapp(perfil.papel)) redirect("/");
  const cfg = await carregarConfigWhatsapp();
  return (
    <Container largura="estreita" className="space-y-4 p-4">
      <h1 className="font-display text-2xl font-bold tracking-tight text-texto">WhatsApp</h1>
      <FormWhatsapp {...cfg} />
    </Container>
  );
}
```

- [ ] **Step 2: Formulário com seletor de provedor + campos condicionais**

Substituir `Formularios.tsx`:

```tsx
"use client";
import { controleCls } from "@/components/ui/Campo";
import { useActionState, useState, useTransition } from "react";
import { salvarConfigWhatsapp, testarConexao, type EstadoWa } from "./actions";

export function FormWhatsapp({
  provedor,
  instance,
  zapiConfigurado,
  oficialPhoneNumberId,
  oficialConfigurado,
}: {
  provedor: string;
  instance: string;
  zapiConfigurado: boolean;
  oficialPhoneNumberId: string;
  oficialConfigurado: boolean;
}) {
  const [estado, action, pend] = useActionState<EstadoWa, FormData>(salvarConfigWhatsapp, {});
  const [prov, setProv] = useState(provedor === "oficial" ? "oficial" : "zapi");
  const [teste, setTeste] = useState<string | null>(null);
  const [pendT, start] = useTransition();

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="text-cinza">Provedor</span>
        <select value={prov} onChange={(e) => setProv(e.target.value)} className={`${controleCls()} mt-1 w-full`}>
          <option value="zapi">Z-API (não-oficial)</option>
          <option value="oficial">API oficial (WhatsApp Cloud API)</option>
        </select>
      </label>

      <form action={action} className="space-y-3">
        <input type="hidden" name="provedor" value={prov} />

        {prov === "zapi" ? (
          <>
            <p className="rounded border border-atencao-borda bg-atencao-fundo px-3 py-2 text-xs text-atencao">
              ⚠️ O Z-API é <strong>não-oficial</strong> (usa o WhatsApp Web). Use um <strong>número dedicado</strong> —
              há risco de banimento do número.
            </p>
            <label className="block text-sm">
              <span className="text-cinza">Instance ID</span>
              <input name="instance" defaultValue={instance} className={`${controleCls()} mt-1 w-full`} />
            </label>
            <label className="block text-sm">
              <span className="text-cinza">
                Token da instância {zapiConfigurado && "(configurado — deixe em branco para manter)"}
              </span>
              <input name="token" type="password" className={`${controleCls()} mt-1 w-full`} />
            </label>
            <label className="block text-sm">
              <span className="text-cinza">Client-Token (segurança da conta)</span>
              <input name="client_token" type="password" className={`${controleCls()} mt-1 w-full`} />
            </label>
          </>
        ) : (
          <>
            <p className="rounded border border-atencao-borda bg-atencao-fundo px-3 py-2 text-xs text-atencao">
              A API oficial exige <strong>templates aprovados</strong> para mensagens fora da janela de 24h — por ora,
              cobre respostas de atendimento; régua/avisos ainda dependem dos templates (em breve).
            </p>
            <label className="block text-sm">
              <span className="text-cinza">Phone Number ID</span>
              <input
                name="oficial_phone_number_id"
                defaultValue={oficialPhoneNumberId}
                className={`${controleCls()} mt-1 w-full`}
              />
            </label>
            <label className="block text-sm">
              <span className="text-cinza">
                Token permanente {oficialConfigurado && "(configurado — deixe em branco para manter)"}
              </span>
              <input name="oficial_token" type="password" className={`${controleCls()} mt-1 w-full`} />
            </label>
          </>
        )}

        {estado.erro && <p className="text-sm text-negativo">{estado.erro}</p>}
        {estado.ok && <p className="text-sm text-verde">Salvo.</p>}
        <button
          type="submit"
          disabled={pend}
          className="rounded-lg bg-verde px-4 py-2 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60"
        >
          {pend ? "Salvando…" : "Salvar"}
        </button>
      </form>

      <button
        onClick={() =>
          start(async () => {
            const r = await testarConexao();
            setTeste(r.erro ?? (r.conectado ? "Conectado ✓" : "Não conectado."));
          })
        }
        disabled={pendT}
        className="rounded border border-linha px-4 py-2 text-sm"
      >
        {pendT ? "Testando…" : "Testar conexão"}
      </button>
      {teste && <p className="text-sm text-cinza">{teste}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Render test**

```tsx
// src/tests/whatsapp/form-whatsapp-render.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FormWhatsapp } from "@/app/(app)/configuracoes/whatsapp/Formularios";

describe("FormWhatsapp", () => {
  it("mostra o seletor de provedor com as duas opções", () => {
    const html = renderToStaticMarkup(
      <FormWhatsapp
        provedor="zapi"
        instance=""
        zapiConfigurado={false}
        oficialPhoneNumberId=""
        oficialConfigurado={false}
      />,
    );
    expect(html).toContain("Z-API");
    expect(html).toContain("API oficial");
    expect(html).toContain("Instance ID");
  });
});
```

- [ ] **Step 4: Verificar (typecheck + lint + testes + build)**

Run: `npm run typecheck && npx eslint "src/app/(app)/configuracoes/whatsapp/Formularios.tsx" "src/app/(app)/configuracoes/whatsapp/page.tsx" && npx vitest run src/tests/whatsapp && npm run build`
Expected: sem erros; render test passa.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/configuracoes/whatsapp/page.tsx" "src/app/(app)/configuracoes/whatsapp/Formularios.tsx" src/tests/whatsapp/form-whatsapp-render.test.tsx
git commit -m "feat(whatsapp): UI de escolha de provedor (Z-API x oficial)"
```

---

### Task 5: Release 6.72.0

**Files:**
- Modify: `package.json`, `package-lock.json`, `CHANGELOG.md`

Produção em 6.71.0. **Sem migration.**

- [ ] **Step 1: Barra completa**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check && npm run build`
Expected: verde. (Se `format:check` falhar → `npm run format` e recommitar.)

- [ ] **Step 2: Bump (incluir lockfile)**

Run: `npm version minor --no-git-tag-version`
Expected: `6.72.0`.

- [ ] **Step 3: CHANGELOG (topo, acima de 6.71.0)**

```markdown
## [6.72.0] — 2026-07-22

### Adicionado

- **WhatsApp: escolha do provedor por escritório.** Em **Configurações → WhatsApp**, o admin escolhe
  entre **Z-API** (não-oficial) e a **API oficial (WhatsApp Cloud API)** e informa as credenciais do
  provedor escolhido. O envio de texto e o "testar conexão" já funcionam na oficial. (A régua e os
  avisos proativos na oficial dependem de templates aprovados — em breve; até lá, use a Z-API para
  proativos.)
```

- [ ] **Step 4: Teste de versão + suíte**

Run: `npx vitest run src/tests/versao.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Commit da release**

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): 6.72.0 — WhatsApp escolha de provedor + adaptador oficial (Fatia 1B)"
```

- [ ] **Step 6: Finalizar (PR)**

`git push origin develop` → `gh pr create --base main --head develop` → aguardar as **duas** execuções do `verify` → **não** mergear sem autorização. Após merge: sem migration → Implantar → `/api/health` = `6.72.0` → `npm run release:tag` + push da tag → sincronizar `develop` com `main`.

---

## Self-Review

**1. Cobertura do spec (Fatia 1B):**
- Adaptador oficial (`oficial.ts`) texto + status; mídia devolve erro claro → Task 1. ✅
- Resolvedor monta o oficial quando `provedor === 'oficial'` → Task 2. ✅
- Config: salvar por provedor + testar o ativo + loader → Task 3. ✅
- UI: seletor de provedor + campos condicionais + aviso das 24h → Task 4. ✅

**2. Placeholders:** nenhum.

**3. Consistência de tipos:** `criarAdaptadorOficial(OficialConfig)` (Task 1) consumido no resolvedor (Task 2). `carregarConfigWhatsapp()` (Task 3) devolve o shape que `FormWhatsapp` (Task 4) recebe por props. `salvarConfigWhatsapp` lê `provedor`/`instance`/`token`/`client_token`/`oficial_phone_number_id`/`oficial_token` — os mesmos `name=` dos inputs do form.

**Nota de execução:** smoke — em Configurações → WhatsApp, alternar para "API oficial", informar phone_number_id + token e "Testar conexão" (200 = ✓). Envio real de texto oficial só dentro da janela de 24h; proativos aguardam o Sub-projeto 3. Não ligar a oficial em produção antes dos Sub-projetos 2 e 3.
