# WhatsApp oficial — Fatia 3A: fundação de templates + régua — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dar ao provedor oficial a capacidade de enviar por **template aprovado**, com a política de decisão isolada e testável, a tela de configuração por fluxo, e **a régua de cobrança ligada** — provando o caminho num fluxo antes de converter os outros cinco.

**Architecture:** uma camada de política (`lib/whatsapp/proativo.ts`) fica **acima** dos adaptadores: os fluxos entregam texto livre **e** parâmetros, e ela decide entre `enviarTexto` e `enviarTemplate` consultando a **capacidade** do provedor (`exigeTemplateForaDaJanela`), nunca o nome dele. A decisão inteira vive numa função pura (`decidirEnvio`). A Z-API não muda de comportamento.

**Tech Stack:** Next 16 (server actions, route handlers), TypeScript, Supabase (Postgres/RLS), Meta Graph API v21.0, vitest + `react-dom/server`.

## Global Constraints

- **Z-API é opção permanente, não legado.** Nada nesta fatia pode alterar o comportamento dela. A não-regressão do caminho Z-API é requisito de verificação, não nota de rodapé.
- Migrations: aplicadas pelo runner `npm run db:migrate` (NÃO `supabase db push`); **idempotentes**; imutáveis depois de aplicadas. A próxima é a `0132`.
- Segredos: `oficial_token_cifrado` via `cifrarDominio/decifrarDominio("whatsapp", …)`. **Nunca** logar token. O WABA ID **não** é segredo (é identificador) — vai em texto, como o `oficial_phone_number_id`.
- Guard `divida-ui`: controles usam `controleCls()`, sem `border` escrito à mão.
- RLS das tabelas novas no padrão: leitura `admin/assistente/contador`, escrita `admin`.
- Rodar antes de entregar: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`, `npm run build`.
- Entrega por PR (`main` protegido): `git push origin develop` → `gh pr create --base main --head develop` → `gh pr checks --watch` → `gh pr merge --merge`. Migration aplicada em produção **antes** de Implantar; **tag só depois** de o `/api/health` confirmar.
- `package.json.version` sobe com o CHANGELOG **no mesmo PR** (`src/tests/versao.test.ts`).

---

### Task 1: Migration 0132 — WABA ID e templates por fluxo

**Files:**
- Create: `supabase/migrations/0132_whatsapp_templates.sql`

**Interfaces:**
- Produces: coluna `whatsapp_config.oficial_waba_id`; tabela `whatsapp_template_fluxo (fluxo pk, nome, idioma, atualizado_em)`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Sub-projeto 3 (Fatia 3A): templates aprovados para envio proativo na API oficial.
alter table whatsapp_config add column if not exists oficial_waba_id text;

create table if not exists whatsapp_template_fluxo (
  fluxo         text primary key,
  nome          text not null,
  idioma        text not null default 'pt_BR',
  atualizado_em timestamptz not null default now()
);

alter table whatsapp_template_fluxo enable row level security;
drop policy if exists whatsapp_template_fluxo_read  on whatsapp_template_fluxo;
drop policy if exists whatsapp_template_fluxo_write on whatsapp_template_fluxo;
create policy whatsapp_template_fluxo_read  on whatsapp_template_fluxo for select
  using (auth_papel() in ('admin','assistente','contador'));
create policy whatsapp_template_fluxo_write on whatsapp_template_fluxo for all
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
```

- [ ] **Step 2: Conferir idempotência** — `add column if not exists`, `create table if not exists`, `drop policy if exists` antes de `create policy`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0132_whatsapp_templates.sql
git commit -m "feat(whatsapp): migration 0132 waba id + templates por fluxo"
```

---

### Task 2: A política, pura e isolada

**Files:**
- Create: `src/lib/whatsapp/politica-proativo.ts`
- Test: `src/tests/whatsapp/politica-proativo.test.ts`

**Interfaces:**
- Produces: `FluxoProativo`, `PoliticaFluxo`, `POLITICA`, `PARAMS_FLUXO`, `Modo`, `decidirEnvio`, `dentroDaJanela`.

- [ ] **Step 1: Escrever os testes (falham)**

```ts
import { describe, it, expect } from "vitest";
import { decidirEnvio, dentroDaJanela, POLITICA, PARAMS_FLUXO } from "@/lib/whatsapp/politica-proativo";

describe("dentroDaJanela", () => {
  const agora = "2026-07-23T12:00:00.000Z";
  it("sem entrada nenhuma → fora", () => {
    expect(dentroDaJanela(null, agora)).toBe(false);
  });
  it("23h atrás → dentro; 25h atrás → fora", () => {
    expect(dentroDaJanela("2026-07-23T13:00:00.000Z", "2026-07-24T12:00:00.000Z")).toBe(true);
    expect(dentroDaJanela("2026-07-22T11:00:00.000Z", agora)).toBe(false);
  });
  it("exatamente 24h → fora (o limite não é inclusivo)", () => {
    expect(dentroDaJanela("2026-07-22T12:00:00.000Z", agora)).toBe(false);
  });
});

describe("decidirEnvio", () => {
  it("provedor sem exigência (Z-API) sempre manda texto", () => {
    expect(decidirEnvio({ politica: "sempre_template", exigeTemplate: false, dentroDaJanela: false, temTemplate: false }))
      .toEqual({ modo: "texto" });
  });
  it("oficial + política janela + dentro da janela → texto", () => {
    expect(decidirEnvio({ politica: "janela", exigeTemplate: true, dentroDaJanela: true, temTemplate: false }))
      .toEqual({ modo: "texto" });
  });
  it("oficial + política janela + fora da janela + template → template", () => {
    expect(decidirEnvio({ politica: "janela", exigeTemplate: true, dentroDaJanela: false, temTemplate: true }))
      .toEqual({ modo: "template" });
  });
  it("oficial + sempre_template ignora a janela", () => {
    expect(decidirEnvio({ politica: "sempre_template", exigeTemplate: true, dentroDaJanela: true, temTemplate: true }))
      .toEqual({ modo: "template" });
  });
  it("oficial sem template configurado → falha com motivo", () => {
    const r = decidirEnvio({ politica: "sempre_template", exigeTemplate: true, dentroDaJanela: true, temTemplate: false });
    expect(r.modo).toBe("falha");
    if (r.modo === "falha") expect(r.motivo).toMatch(/template/i);
  });
});

describe("contratos por fluxo", () => {
  it("todo fluxo tem política e lista de parâmetros", () => {
    for (const f of Object.keys(POLITICA) as (keyof typeof POLITICA)[]) {
      expect(PARAMS_FLUXO[f]?.length).toBeGreaterThan(0);
    }
    expect(Object.keys(PARAMS_FLUXO).sort()).toEqual(Object.keys(POLITICA).sort());
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/whatsapp/politica-proativo.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
export type FluxoProativo =
  | "regua" | "cobranca_manual" | "legalizacao" | "comunicado" | "followup" | "nfse";

export type PoliticaFluxo = "sempre_template" | "janela";

// Fixa no código de propósito: seis interruptores de efeito sutil (custo e variação de texto)
// seriam mais difíceis de entender do que o comportamento certo já embutido.
export const POLITICA: Record<FluxoProativo, PoliticaFluxo> = {
  regua: "sempre_template",
  comunicado: "sempre_template",
  nfse: "sempre_template",
  cobranca_manual: "janela",
  legalizacao: "janela",
  followup: "janela",
};

// Contrato: a ORDEM é o que o escritório precisa respeitar ao escrever o template na Meta.
// Aparece na tela de config ao lado do seletor.
export const PARAMS_FLUXO: Record<FluxoProativo, string[]> = {
  regua: ["cliente", "valor", "vencimento"],
  cobranca_manual: ["cliente", "valor", "vencimento"],
  legalizacao: ["cliente", "etapa", "processo", "data"],
  comunicado: ["cliente", "titulo"],
  followup: ["cliente", "proposta"],
  nfse: ["cliente", "competencia"],
};

const JANELA_MS = 24 * 60 * 60 * 1000;

// Dentro da janela de atendimento da Meta: o cliente falou nas últimas 24h.
export function dentroDaJanela(ultimaEntradaEm: string | null, agora: string): boolean {
  if (!ultimaEntradaEm) return false;
  const t = Date.parse(ultimaEntradaEm);
  const a = Date.parse(agora);
  if (Number.isNaN(t) || Number.isNaN(a)) return false;
  return a - t < JANELA_MS;
}

export type Modo = { modo: "texto" } | { modo: "template" } | { modo: "falha"; motivo: string };

export function decidirEnvio(e: {
  politica: PoliticaFluxo;
  exigeTemplate: boolean;
  dentroDaJanela: boolean;
  temTemplate: boolean;
}): Modo {
  // Provedor que não exige template (Z-API): texto livre, como sempre foi.
  if (!e.exigeTemplate) return { modo: "texto" };
  if (e.politica === "janela" && e.dentroDaJanela) return { modo: "texto" };
  if (e.temTemplate) return { modo: "template" };
  return { modo: "falha", motivo: "Sem template aprovado configurado para este fluxo." };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/whatsapp/politica-proativo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/politica-proativo.ts src/tests/whatsapp/politica-proativo.test.ts
git commit -m "feat(whatsapp): politica de envio proativo (janela 24h x template) pura"
```

---

### Task 3: `enviarTemplate` na oficial e a capacidade nos dois adaptadores

**Files:**
- Modify: `src/lib/whatsapp/tipos.ts` (capacidade + `TemplateEnvio` + método opcional)
- Modify: `src/lib/whatsapp/oficial.ts` (montador puro + `enviarTemplate` + capacidade `true`)
- Modify: `src/lib/whatsapp/zapi.ts:112-118` (capacidade `false`)
- Test: `src/tests/whatsapp/oficial.test.ts` (arquivo existente — adicionar casos)

**Interfaces:**
- Produces: `TemplateEnvio = { nome: string; idioma: string; params: string[] }`; `ProvedorWhatsapp.exigeTemplateForaDaJanela: boolean`; `ProvedorWhatsapp.enviarTemplate?`; `montarEnvioTemplateOficial(cfg, telefone, t): { url; headers; body }`.

- [ ] **Step 1: Escrever o teste do montador (falha)**

```ts
  it("monta o envio de template com parâmetros posicionais", () => {
    const req = montarEnvioTemplateOficial(
      { phoneNumberId: "PNID", token: "TK" },
      "5511999999999",
      { nome: "cobranca_vencida", idioma: "pt_BR", params: ["Padaria X", "R$ 1.200,00", "10/08"] },
    );
    expect(req.url).toBe("https://graph.facebook.com/v21.0/PNID/messages");
    expect(req.headers.Authorization).toBe("Bearer TK");
    expect(JSON.parse(req.body)).toEqual({
      messaging_product: "whatsapp",
      to: "5511999999999",
      type: "template",
      template: {
        name: "cobranca_vencida",
        language: { code: "pt_BR" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Padaria X" },
              { type: "text", text: "R$ 1.200,00" },
              { type: "text", text: "10/08" },
            ],
          },
        ],
      },
    });
  });

  it("sem parâmetros não manda components (template estático)", () => {
    const req = montarEnvioTemplateOficial({ phoneNumberId: "P", token: "T" }, "55", {
      nome: "aviso", idioma: "pt_BR", params: [],
    });
    expect(JSON.parse(req.body).template.components).toBeUndefined();
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/whatsapp/oficial.test.ts`
Expected: FAIL — `montarEnvioTemplateOficial` não existe.

- [ ] **Step 3: Implementar**

Em `tipos.ts`:

```ts
export type TemplateEnvio = { nome: string; idioma: string; params: string[] };

export interface ProvedorWhatsapp {
  enviarTexto(telefone: string, texto: string): Promise<ResultadoEnvio>;
  enviarMidia(telefone: string, midia: MidiaEnvio): Promise<ResultadoEnvio>;
  statusConexao(): Promise<{ conectado: boolean; erro?: string }>;
  // Capacidade, não nome: a política pergunta isto, nunca "qual provedor é".
  exigeTemplateForaDaJanela: boolean;
  enviarTemplate?(telefone: string, t: TemplateEnvio): Promise<ResultadoEnvio>;
}
```

Em `oficial.ts`, o montador puro (no molde dos existentes):

```ts
// Monta o envio de template da Cloud API (puro, testável).
export function montarEnvioTemplateOficial(
  cfg: OficialConfig,
  telefone: string,
  t: TemplateEnvio,
): { url: string; headers: Record<string, string>; body: string } {
  const template: Record<string, unknown> = { name: t.nome, language: { code: t.idioma } };
  if (t.params.length > 0) {
    template.components = [
      { type: "body", parameters: t.params.map((p) => ({ type: "text", text: p })) },
    ];
  }
  return {
    url: `${baseUrl(cfg)}/${cfg.phoneNumberId}/messages`,
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: telefone, type: "template", template }),
  };
}
```

e no `criarAdaptadorOficial`, acrescentar a capacidade e o método (o `POST` segue o mesmo formato de `enviarTexto`, inclusive o tratamento de timeout/rede):

```ts
    exigeTemplateForaDaJanela: true,
    enviarTemplate: async (telefone, t) => {
      const req = montarEnvioTemplateOficial(cfg, telefone, t);
      try {
        const res = await fetch(req.url, {
          method: "POST", headers: req.headers, body: req.body, signal: AbortSignal.timeout(15000),
        });
        const corpo = await res.json().catch(() => null);
        if (!res.ok) return { ok: false, erro: `WhatsApp oficial HTTP ${res.status}`, resposta: corpo };
        return { ok: true, resposta: corpo };
      } catch (e) {
        return {
          ok: false,
          erro: e instanceof Error && e.name === "TimeoutError" ? "Tempo esgotado." : "Erro de rede.",
        };
      }
    },
```

Em `zapi.ts`, no `criarAdaptadorZapi`, só a capacidade (sem `enviarTemplate`):

```ts
    exigeTemplateForaDaJanela: false,
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/whatsapp/ && npm run typecheck`
Expected: PASS — e o typecheck prova que todo implementador da interface declarou a capacidade.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/tipos.ts src/lib/whatsapp/oficial.ts src/lib/whatsapp/zapi.ts src/tests/whatsapp/oficial.test.ts
git commit -m "feat(whatsapp): enviarTemplate na oficial + capacidade exigeTemplateForaDaJanela"
```

---

### Task 4: A camada de política (`enviarProativo`)

**Files:**
- Create: `src/lib/whatsapp/proativo.ts`
- Test: `src/tests/whatsapp/proativo.test.ts`

**Interfaces:**
- Consumes: `adaptadorWhatsappAtivo` (`./ativo`), `decidirEnvio`/`POLITICA`/`dentroDaJanela` (Task 2), `createAdminSupabase`.
- Produces:
  ```ts
  export type MensagemProativa = { fluxo: FluxoProativo; texto: string; params: string[] };
  export type Enviador = { enviar(telefone: string, msg: MensagemProativa): Promise<ResultadoEnvio> };
  export async function criarEnviadorProativo(): Promise<Enviador | { erro: string }>;
  export async function enviarProativo(telefone: string, msg: MensagemProativa): Promise<ResultadoEnvio>;
  ```

**Nota de projeto (por que duas funções):** a régua envia em lote. Se cada mensagem resolvesse a config e decifrasse segredos, seriam N leituras + N decifragens por execução do cron. `criarEnviadorProativo()` resolve **uma vez** e devolve o enviador para o laço; `enviarProativo()` é a conveniência de disparo único (cobrança manual, legalização, follow-up).

**Consequência útil da política:** a janela só é consultada quando `POLITICA[fluxo] === "janela"`. Os fluxos em lote são todos `sempre_template` — então **o caminho de lote não faz nenhuma consulta de janela**.

**Índice:** a consulta da janela (filtra `telefone`, ordena `criado_em desc`) já é servida pelo
`idx_wa_msg_thread on whatsapp_mensagem(telefone, criado_em)` da migration `0040`. **Não criar índice
novo.** A coluna `direcao` é o enum `whatsapp_direcao` (`'IN'`/`'OUT'`), da mesma `0040`.

- [ ] **Step 1: Escrever os testes (falham)**

Os testes mockam `./ativo` e o supabase admin — o alvo é a orquestração, não a rede.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const enviarTexto = vi.fn();
const enviarTemplate = vi.fn();
const adaptadorMock = { adaptador: { enviarTexto, enviarTemplate, exigeTemplateForaDaJanela: true }, provedor: "oficial" };
vi.mock("@/lib/whatsapp/ativo", () => ({ adaptadorWhatsappAtivo: vi.fn(async () => adaptadorMock) }));

const templates = new Map<string, { nome: string; idioma: string }>();
const ultimaEntrada = { valor: null as string | null };
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from: (tabela: string) => ({
      select: () => ({
        // whatsapp_template_fluxo
        then: undefined,
        eq: () => ({
          eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: ultimaEntrada.valor ? { criado_em: ultimaEntrada.valor } : null }) }) }) }),
          maybeSingle: async () => ({ data: templates.get("regua") ?? null }),
        }),
        // listagem completa de templates
        _tabela: tabela,
      }),
      insert: async () => ({ error: null }),
    }),
  }),
}));

import { criarEnviadorProativo } from "@/lib/whatsapp/proativo";

beforeEach(() => {
  enviarTexto.mockReset().mockResolvedValue({ ok: true });
  enviarTemplate.mockReset().mockResolvedValue({ ok: true });
  templates.clear();
  ultimaEntrada.valor = null;
});

describe("enviador proativo", () => {
  it("oficial + régua (sempre_template) com template → usa enviarTemplate com os params", async () => {
    templates.set("regua", { nome: "cobranca", idioma: "pt_BR" });
    const e = await criarEnviadorProativo();
    if ("erro" in e) throw new Error(e.erro);
    const r = await e.enviar("5511", { fluxo: "regua", texto: "Olá", params: ["A", "B", "C"] });
    expect(r.ok).toBe(true);
    expect(enviarTexto).not.toHaveBeenCalled();
    expect(enviarTemplate).toHaveBeenCalledWith("5511", { nome: "cobranca", idioma: "pt_BR", params: ["A", "B", "C"] });
  });

  it("oficial + régua sem template → falha, e NÃO envia nada", async () => {
    const e = await criarEnviadorProativo();
    if ("erro" in e) throw new Error(e.erro);
    const r = await e.enviar("5511", { fluxo: "regua", texto: "Olá", params: ["A"] });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/template/i);
    expect(enviarTexto).not.toHaveBeenCalled();
    expect(enviarTemplate).not.toHaveBeenCalled();
  });
});
```

E o teste de **não-regressão da Z-API**, em bloco próprio (adaptador sem exigência e sem `enviarTemplate`):

```ts
describe("Z-API não regride", () => {
  it("manda o texto livre, ignora params e nunca exige template", async () => {
    adaptadorMock.adaptador = { enviarTexto, exigeTemplateForaDaJanela: false } as never;
    adaptadorMock.provedor = "zapi";
    const e = await criarEnviadorProativo();
    if ("erro" in e) throw new Error(e.erro);
    const r = await e.enviar("5511", { fluxo: "regua", texto: "Texto exato de hoje", params: ["ignorado"] });
    expect(r.ok).toBe(true);
    expect(enviarTexto).toHaveBeenCalledWith("5511", "Texto exato de hoje");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/whatsapp/proativo.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
import { createAdminSupabase } from "@/lib/supabase/admin";
import { adaptadorWhatsappAtivo } from "./ativo";
import { POLITICA, decidirEnvio, dentroDaJanela, type FluxoProativo } from "./politica-proativo";
import type { ResultadoEnvio } from "./tipos";

export type MensagemProativa = { fluxo: FluxoProativo; texto: string; params: string[] };
export type Enviador = { enviar(telefone: string, msg: MensagemProativa): Promise<ResultadoEnvio> };

// Resolve provedor e templates UMA vez — para o laço da régua não reler config nem
// decifrar segredos a cada mensagem.
export async function criarEnviadorProativo(): Promise<Enviador | { erro: string }> {
  const ativo = await adaptadorWhatsappAtivo();
  if ("erro" in ativo) return { erro: ativo.erro };
  const { adaptador } = ativo;
  const admin = createAdminSupabase();

  // Só a oficial precisa dos templates; na Z-API isto nem é lido.
  const porFluxo = new Map<string, { nome: string; idioma: string }>();
  if (adaptador.exigeTemplateForaDaJanela) {
    const { data } = await admin.from("whatsapp_template_fluxo").select("fluxo, nome, idioma");
    for (const r of data ?? []) {
      porFluxo.set(r.fluxo as string, { nome: r.nome as string, idioma: r.idioma as string });
    }
  }

  return {
    async enviar(telefone, msg) {
      const politica = POLITICA[msg.fluxo];
      // A janela só é consultada quando a política do fluxo depende dela: os fluxos
      // em lote são 'sempre_template' e não pagam esta consulta.
      let naJanela = false;
      if (adaptador.exigeTemplateForaDaJanela && politica === "janela") {
        const { data } = await admin
          .from("whatsapp_mensagem")
          .select("criado_em")
          .eq("telefone", telefone)
          .eq("direcao", "IN")
          .order("criado_em", { ascending: false })
          .limit(1)
          .maybeSingle();
        naJanela = dentroDaJanela((data?.criado_em as string | null) ?? null, new Date().toISOString());
      }

      const tpl = porFluxo.get(msg.fluxo) ?? null;
      const decisao = decidirEnvio({
        politica,
        exigeTemplate: adaptador.exigeTemplateForaDaJanela,
        dentroDaJanela: naJanela,
        temTemplate: Boolean(tpl),
      });

      if (decisao.modo === "texto") return adaptador.enviarTexto(telefone, msg.texto);
      if (decisao.modo === "template" && tpl && adaptador.enviarTemplate) {
        return adaptador.enviarTemplate(telefone, { nome: tpl.nome, idioma: tpl.idioma, params: msg.params });
      }
      const motivo = decisao.modo === "falha" ? decisao.motivo : "Provedor sem suporte a template.";
      await registrarFalha(admin, msg.fluxo, telefone, motivo);
      return { ok: false, erro: motivo };
    },
  };
}

export async function enviarProativo(telefone: string, msg: MensagemProativa): Promise<ResultadoEnvio> {
  const e = await criarEnviadorProativo();
  if ("erro" in e) return { ok: false, erro: e.erro };
  return e.enviar(telefone, msg);
}

// Visibilidade da falha: o painel Configurações → Observabilidade (admin) já existe.
// Best-effort — registrar não pode derrubar o envio dos demais clientes do lote.
async function registrarFalha(
  admin: ReturnType<typeof createAdminSupabase>,
  fluxo: string,
  telefone: string,
  motivo: string,
): Promise<void> {
  try {
    await admin.from("evento_erro").insert({
      mensagem: `WhatsApp proativo não enviado: ${motivo}`,
      rota: `whatsapp/proativo/${fluxo}`,
      contexto: { fluxo, telefone },
    });
  } catch {
    // ignora
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/whatsapp/proativo.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/proativo.ts src/tests/whatsapp/proativo.test.ts
git commit -m "feat(whatsapp): camada de envio proativo (decide texto x template)"
```

---

### Task 5: Listar os templates da Meta

**Files:**
- Create: `src/lib/whatsapp/templates-meta.ts`
- Test: `src/tests/whatsapp/templates-meta.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type TemplateMeta = { nome: string; idioma: string; status: "aprovado" | "pendente" | "reprovado" | "outro" };
  export function parseTemplatesMeta(json: unknown): TemplateMeta[];
  export async function listarTemplatesMeta(wabaId: string, token: string): Promise<{ templates: TemplateMeta[] } | { erro: string }>;
  ```

- [ ] **Step 1: Escrever os testes do parser (falham)**

```ts
import { describe, it, expect } from "vitest";
import { parseTemplatesMeta } from "@/lib/whatsapp/templates-meta";

describe("parseTemplatesMeta", () => {
  it("mapeia os status da Meta", () => {
    const json = { data: [
      { name: "cobranca", language: "pt_BR", status: "APPROVED" },
      { name: "aviso", language: "pt_BR", status: "PENDING" },
      { name: "velho", language: "pt_BR", status: "REJECTED" },
      { name: "raro", language: "en_US", status: "PAUSED" },
    ] };
    expect(parseTemplatesMeta(json)).toEqual([
      { nome: "cobranca", idioma: "pt_BR", status: "aprovado" },
      { nome: "aviso", idioma: "pt_BR", status: "pendente" },
      { nome: "velho", idioma: "pt_BR", status: "reprovado" },
      { nome: "raro", idioma: "en_US", status: "outro" },
    ]);
  });
  it("payload vazio ou torto → lista vazia", () => {
    expect(parseTemplatesMeta({})).toEqual([]);
    expect(parseTemplatesMeta(null)).toEqual([]);
    expect(parseTemplatesMeta({ data: "x" })).toEqual([]);
  });
  it("ignora entradas sem nome", () => {
    expect(parseTemplatesMeta({ data: [{ language: "pt_BR", status: "APPROVED" }] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/whatsapp/templates-meta.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
export type StatusTemplate = "aprovado" | "pendente" | "reprovado" | "outro";
export type TemplateMeta = { nome: string; idioma: string; status: StatusTemplate };

const MAPA: Record<string, StatusTemplate> = {
  APPROVED: "aprovado",
  PENDING: "pendente",
  REJECTED: "reprovado",
};

export function parseTemplatesMeta(json: unknown): TemplateMeta[] {
  const d = (json ?? {}) as { data?: unknown };
  if (!Array.isArray(d.data)) return [];
  const saida: TemplateMeta[] = [];
  for (const item of d.data) {
    const t = (item ?? {}) as { name?: unknown; language?: unknown; status?: unknown };
    if (typeof t.name !== "string" || !t.name) continue;
    saida.push({
      nome: t.name,
      idioma: typeof t.language === "string" ? t.language : "pt_BR",
      status: (typeof t.status === "string" && MAPA[t.status]) || "outro",
    });
  }
  return saida;
}

// Lista os templates da conta. O token precisa de permissão de GESTÃO
// (whatsapp_business_management) — se não tiver, a Meta responde erro e a tela cai
// para a digitação manual do nome.
export async function listarTemplatesMeta(
  wabaId: string,
  token: string,
): Promise<{ templates: TemplateMeta[] } | { erro: string }> {
  const url =
    `https://graph.facebook.com/v21.0/${encodeURIComponent(wabaId)}/message_templates` +
    `?fields=name,language,status&limit=200`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    const corpo = await res.json().catch(() => null);
    if (!res.ok) return { erro: `Não foi possível listar os templates (HTTP ${res.status}).` };
    return { templates: parseTemplatesMeta(corpo) };
  } catch {
    return { erro: "Não foi possível falar com a Meta para listar os templates." };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/whatsapp/templates-meta.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/templates-meta.ts src/tests/whatsapp/templates-meta.test.ts
git commit -m "feat(whatsapp): listagem de templates da Meta com status"
```

---

### Task 6: Config — WABA ID, actions e a tela

**Files:**
- Modify: `src/app/(app)/configuracoes/whatsapp/actions.ts` (WABA ID no load/save; actions novas)
- Modify: `src/app/(app)/configuracoes/whatsapp/page.tsx` (passar os dados novos)
- Modify: `src/app/(app)/configuracoes/whatsapp/Formularios.tsx` (campo WABA ID; atualizar o aviso da linha ~65)
- Create: `src/components/whatsapp/TemplatesPorFluxo.tsx`
- Test: `src/tests/whatsapp/templates-por-fluxo-render.test.tsx`

**Interfaces:**
- Consumes: `PARAMS_FLUXO`/`POLITICA` (Task 2), `listarTemplatesMeta` (Task 5).
- Produces (actions): `listarTemplatesDisponiveis(): Promise<{ templates: TemplateMeta[] } | { erro: string }>`; `salvarTemplateFluxo(fluxo: string, nome: string, idioma: string): Promise<{ erro?: string }>`; `carregarConfigWhatsapp` passa a devolver `oficialWabaId` e `templatesPorFluxo`.

- [ ] **Step 1: Escrever o render test (falha)**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/whatsapp/actions", () => ({
  listarTemplatesDisponiveis: vi.fn(), salvarTemplateFluxo: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { TemplatesPorFluxo } from "@/components/whatsapp/TemplatesPorFluxo";

describe("TemplatesPorFluxo", () => {
  it("lista os fluxos, o contrato de parâmetros e o estado", () => {
    const html = renderToStaticMarkup(
      <TemplatesPorFluxo
        configurados={{ regua: { nome: "cobranca", idioma: "pt_BR" } }}
        disponiveis={[{ nome: "cobranca", idioma: "pt_BR", status: "aprovado" }]}
        erroListagem={null}
      />,
    );
    expect(html).toContain("Templates por fluxo");
    expect(html).toContain("Régua de cobrança");
    expect(html).toContain("{{1}}");           // contrato de parâmetros
    expect(html).toContain("cliente");
    expect(html).toContain("aprovado");
  });

  it("fluxo sem template configurado aparece como não configurado", () => {
    const html = renderToStaticMarkup(
      <TemplatesPorFluxo configurados={{}} disponiveis={[]} erroListagem={null} />,
    );
    expect(html).toContain("não configurado");
  });

  it("falha da listagem explica e oferece digitar à mão", () => {
    const html = renderToStaticMarkup(
      <TemplatesPorFluxo configurados={{}} disponiveis={[]} erroListagem="Não foi possível listar os templates (HTTP 403)." />,
    );
    expect(html).toContain("HTTP 403");
    expect(html).toMatch(/à mão|manual/i);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/whatsapp/templates-por-fluxo-render.test.tsx`
Expected: FAIL (componente não existe).

- [ ] **Step 3: Implementar o componente**

`TemplatesPorFluxo.tsx` — client component. Uma linha por fluxo de `POLITICA`, com rótulo legível, o contrato (`{{1}} cliente · {{2}} valor · …` a partir de `PARAMS_FLUXO`), um `<select>` (`controleCls("compacto")`) com os `disponiveis` e um `<input>` de nome à mão quando `erroListagem`. O estado por linha: `aprovado` / `pendente` / `reprovado` / `não configurado`, derivado cruzando `configurados[fluxo]` com `disponiveis`.

```tsx
const ROTULO: Record<string, string> = {
  regua: "Régua de cobrança", cobranca_manual: "Cobrança manual", legalizacao: "Avisos de legalização",
  comunicado: "Comunicados", followup: "Follow-up de proposta", nfse: "NFS-e em lote",
};
const contrato = (fluxo: string) =>
  (PARAMS_FLUXO[fluxo as FluxoProativo] ?? []).map((p, i) => `{{${i + 1}}} ${p}`).join(" · ");
```

- [ ] **Step 4: Actions e wiring**

Em `actions.ts`: `carregarConfigWhatsapp` inclui `oficial_waba_id` no select e devolve `oficialWabaId` + `templatesPorFluxo` (de `whatsapp_template_fluxo`); `salvarConfigWhatsapp` grava `patch.oficial_waba_id` no ramo `oficial`; `listarTemplatesDisponiveis` decifra o token e chama `listarTemplatesMeta`; `salvarTemplateFluxo` faz upsert em `whatsapp_template_fluxo` (gate admin, como as demais). Em `Formularios.tsx`: campo **WABA ID** ao lado do Phone Number ID e o aviso da linha ~65 atualizado (a limitação "por ora" deixou de existir). Em `page.tsx`: renderizar `TemplatesPorFluxo` quando o provedor for oficial.

- [ ] **Step 5: Verificar**

Run: `npm run typecheck && npx vitest run src/tests/whatsapp/ src/tests/ui/divida-ui.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/configuracoes/whatsapp" src/components/whatsapp/TemplatesPorFluxo.tsx src/tests/whatsapp/templates-por-fluxo-render.test.tsx
git commit -m "feat(whatsapp): tela de templates por fluxo (seletor da Meta + contrato de params)"
```

---

### Task 7: Ligar a régua

**Files:**
- Modify: `src/lib/whatsapp/regua-motor.ts` (resolver o enviador uma vez; trocar o envio)

**Interfaces:**
- Consumes: `criarEnviadorProativo` (Task 4).

- [ ] **Step 1: Trocar a resolução do adaptador pelo enviador**

Onde hoje há `const ativoWa = await adaptadorWhatsappAtivo();` (linha ~54) e o uso de `adaptadorWa`, passar a resolver o **enviador** uma vez, mantendo a mesma semântica de "sem WhatsApp disponível → só e-mail".

- [ ] **Step 2: Trocar o envio (linha ~143)**

```ts
      const texto = aplicarTemplate(etapa.template, vars);
      const r = await enviadorWa.enviar(estado.telefone, {
        fluxo: "regua",
        texto,
        // A ORDEM é o contrato de PARAMS_FLUXO.regua: cliente, valor, vencimento.
        params: [vars.nome, vars.valor, vars.vencimento],
      });
```

O resto do bloco (insert em `whatsapp_mensagem` com `status: r.ok ? "ENVIADO" : "ERRO"`, contagem, corrida do índice único) **não muda** — a falha por template ausente já cai no caminho de erro existente.

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npx vitest run src/tests/whatsapp/`
Expected: PASS — inclusive os testes existentes da régua (na Z-API o texto enviado continua idêntico).

- [ ] **Step 4: Commit**

```bash
git add src/lib/whatsapp/regua-motor.ts
git commit -m "feat(whatsapp): regua de cobranca passa pela camada proativa (texto x template)"
```

---

### Task 8: Release

- [ ] **Step 1: Suíte completa**

Run: `npm run lint && npm run typecheck && npm test && npm run format && npm run build`
Expected: tudo verde.

- [ ] **Step 2: Versão + CHANGELOG** no mesmo PR (minor: `6.76.0`), deixando explícito que é **paridade entre provedores** — a Z-API segue igual — e que só a régua está ligada nesta fatia.

- [ ] **Step 3: Aplicar a migration 0132 em produção** (runner), **antes** de Implantar.

```bash
node --env-file=.env.producao.bak scripts/db-migrate.mjs
```

- [ ] **Step 4: Entrega** — REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch. PR `develop`→`main`, `gh pr checks --watch`, merge. Implantar, conferir `/api/health`, **tag depois**.

---

## Self-Review

- **Cobertura da spec (3A):** migration `0132` (Task 1); `POLITICA`/`PARAMS_FLUXO`/`decidirEnvio`/`dentroDaJanela` (Task 2); `exigeTemplateForaDaJanela` nos dois adaptadores + `enviarTemplate` na oficial (Task 3); `enviarProativo` (Task 4); listagem da Meta com status (Task 5); tela com seletor, contrato e estados, incl. fallback de digitação manual (Task 6); régua ligada (Task 7); release com migration em produção (Task 8).
- **Placeholders:** nenhum passo de código sem código. A Task 6 descreve o componente em prosa + o trecho-chave (rótulos e contrato) em vez de despejar o JSX inteiro; os testes fixam o comportamento exigido (três casos), que é o que o implementador precisa satisfazer.
- **Consistência de tipos:** `FluxoProativo` (Task 2) usado em Tasks 4, 6 e 7; `TemplateEnvio` (Task 3) é exatamente o que `enviar` monta na Task 4; `TemplateMeta` (Task 5) é o que a tela consome (Task 6); a ordem `[vars.nome, vars.valor, vars.vencimento]` na Task 7 bate com `PARAMS_FLUXO.regua = ["cliente","valor","vencimento"]`.
- **Não-regressão da Z-API:** exigida por teste próprio na Task 4 e reverificada na Task 7.

## Riscos

| Risco | Mitigação |
|---|---|
| Token sem `whatsapp_business_management` → listagem falha | A tela mostra o erro e permite digitar o nome à mão (teste na Task 6). |
| Trocar o envio da régua regredir a Z-API | Teste dedicado na Task 4 + suíte da régua na Task 7; o bloco de persistência não é tocado. |
| Enviador resolvido por mensagem num lote | `criarEnviadorProativo()` resolve uma vez; a janela só é consultada em fluxos `janela` (nenhum dos de lote). |
| Idioma divergente (`pt_BR` × `pt`) | O idioma vem do seletor (valor da própria Meta), não digitado — salvo no fallback manual, onde o campo é explícito. |
