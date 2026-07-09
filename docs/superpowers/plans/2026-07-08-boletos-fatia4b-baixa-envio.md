# Boletos — Fatia 4b: baixa por webhook + envio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Baixar o título automaticamente pelo webhook de pagamento do provedor e incluir a linha digitável/PIX do boleto na cobrança por WhatsApp.

**Architecture:** Rota de webhook `/api/webhooks/boleto/[secret]` (cliente admin) que usa as funções puras `interpretarWebhook*` para detectar pagamento → insere `baixa` (trigger marca o título BAIXADO) + marca o boleto pago; helper puro `dadosBaixaBoleto`; `cobrarViaWhatsapp` anexa o boleto. Spec: `docs/superpowers/specs/2026-07-08-boletos-fatia4b-baixa-envio-design.md`.

**Tech Stack:** Next.js 16 (route handler + server action), TypeScript, Supabase, Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`.
- Sem migration. Webhook autorizado por `BOLETO_WEBHOOK_SECRET` (novo env). Cliente **admin** na rota (sem sessão).
- Idempotente: retries do provedor não podem duplicar baixa. Sempre responder 200 ao provedor.
- Branch: `git checkout -b feat/boletos-fatia4b develop`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `src/lib/boleto/baixa.ts` — **novo**: `dadosBaixaBoleto` (puro).
- `src/tests/boleto/baixa.test.ts` — **novo**.
- `src/app/api/webhooks/boleto/[secret]/route.ts` — **novo**: webhook → baixa.
- `src/app/(app)/financeiro/contas-a-receber/whatsapp.ts` — **modificar**: anexar boleto ao texto.

---

## Task 1: Helper puro dadosBaixaBoleto (TDD)

**Files:**
- Create: `src/lib/boleto/baixa.ts`
- Test: `src/tests/boleto/baixa.test.ts`

**Interfaces:**
- Consumes: `EventoPagamento` (`./tipos`).
- Produces: `dadosBaixaBoleto(evento, valorBoleto, hoje): { dataRecebimento: string; valorRecebido: number }`.

- [ ] **Step 1: Testes**

```ts
import { describe, it, expect } from "vitest";
import { dadosBaixaBoleto } from "@/lib/boleto/baixa";

describe("dadosBaixaBoleto", () => {
  it("usa a data do evento (só a parte da data) e o valor pago", () => {
    expect(dadosBaixaBoleto({ provedorBoletoId: "p1", pago: true, valorPago: 300, pagoEm: "2026-08-02T10:00:00Z" }, 250, "2026-08-05")).toEqual({ dataRecebimento: "2026-08-02", valorRecebido: 300 });
  });
  it("sem data/valor → hoje e valor do boleto", () => {
    expect(dadosBaixaBoleto({ provedorBoletoId: "p1", pago: true, valorPago: null, pagoEm: null }, 250, "2026-08-05")).toEqual({ dataRecebimento: "2026-08-05", valorRecebido: 250 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- boleto/baixa` → FAIL.

- [ ] **Step 3: Implementar `baixa.ts`**

```ts
import type { EventoPagamento } from "./tipos";

export function dadosBaixaBoleto(evento: EventoPagamento, valorBoleto: number, hoje: string): { dataRecebimento: string; valorRecebido: number } {
  return {
    dataRecebimento: evento.pagoEm ? evento.pagoEm.slice(0, 10) : hoje,
    valorRecebido: evento.valorPago ?? valorBoleto,
  };
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- boleto/baixa` (PASS), `npm run lint`, `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/boleto/baixa.ts src/tests/boleto/baixa.test.ts
git commit -m "feat(boletos): helper dadosBaixaBoleto (TDD)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Webhook de baixa

**Files:**
- Create: `src/app/api/webhooks/boleto/[secret]/route.ts`

**Interfaces:**
- Consumes: `interpretarWebhookAsaas` (`@/lib/boleto/asaas`), `interpretarWebhookInter` (`@/lib/boleto/inter`), `dadosBaixaBoleto` (Task 1), `createAdminSupabase`.

- [ ] **Step 1: Criar a rota**

```ts
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { interpretarWebhookAsaas } from "@/lib/boleto/asaas";
import { interpretarWebhookInter } from "@/lib/boleto/inter";
import { dadosBaixaBoleto } from "@/lib/boleto/baixa";

function segredoOk(recebido: string): boolean {
  const esperado = process.env.BOLETO_WEBHOOK_SECRET;
  if (!esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  if (!segredoOk(secret)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  const admin = createAdminSupabase();
  const { data: cfg } = await admin.from("boleto_config").select("provedor, conta_bancaria_id").eq("id", 1).maybeSingle();
  if (!cfg || cfg.provedor === "nenhum") return NextResponse.json({ ok: true, motivo: "sem provedor" });
  const interpretar = cfg.provedor === "asaas" ? interpretarWebhookAsaas : interpretarWebhookInter;

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  const eventos = Array.isArray(body) ? body : [body];
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  let baixados = 0;

  for (const ev of eventos) {
    const evento = interpretar(ev);
    if (!evento || !evento.pago) continue;
    const { data: bol } = await admin.from("boleto").select("id, titulo_id, valor, status").eq("provedor_boleto_id", evento.provedorBoletoId).maybeSingle();
    if (!bol || bol.status === "pago" || bol.status === "cancelado") continue;
    if (!cfg.conta_bancaria_id) continue;
    const d = dadosBaixaBoleto(evento, Number(bol.valor), hoje);
    const { error: eBaixa } = await admin.from("baixa").insert({
      titulo_id: bol.titulo_id, data_recebimento: d.dataRecebimento, valor_recebido: d.valorRecebido,
      conta_bancaria_id: cfg.conta_bancaria_id, forma_pagamento: "BOLETO",
    });
    if (eBaixa) continue;
    await admin.from("boleto").update({ status: "pago", atualizado_em: new Date().toISOString() }).eq("id", bol.id);
    baixados++;
  }
  return NextResponse.json({ ok: true, baixados });
}
```

- [ ] **Step 2: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build` (sem erros; a rota `/api/webhooks/boleto/[secret]` aparece no build).
```bash
git add "src/app/api/webhooks/boleto/[secret]/route.ts"
git commit -m "feat(boletos): webhook de pagamento → baixa automática do título

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: cobrarViaWhatsapp inclui o boleto

**Files:**
- Modify: `src/app/(app)/financeiro/contas-a-receber/whatsapp.ts`

- [ ] **Step 1: Anexar linha digitável/PIX ao texto**

Trocar o trecho:
```ts
  const texto = aplicarTemplate(TEMPLATES.cobranca, {
    nome: cliente?.razao_social ?? "",
    valor: formatarMoeda(Number(t.valor)),
    vencimento: formatarData(t.vencimento as string),
  });

  const cfg = await carregarConfigZapi();
```
por:
```ts
  const texto = aplicarTemplate(TEMPLATES.cobranca, {
    nome: cliente?.razao_social ?? "",
    valor: formatarMoeda(Number(t.valor)),
    vencimento: formatarData(t.vencimento as string),
  });

  let textoFinal = texto;
  const { data: bol } = await supabase
    .from("boleto")
    .select("linha_digitavel, pix_copia_cola")
    .eq("titulo_id", tituloId)
    .not("status", "in", "(cancelado,erro)")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (bol) {
    const extra: string[] = [];
    if (bol.linha_digitavel) extra.push(`Linha digitável: ${bol.linha_digitavel as string}`);
    if (bol.pix_copia_cola) extra.push(`PIX copia-e-cola:\n${bol.pix_copia_cola as string}`);
    if (extra.length) textoFinal = `${texto}\n\n${extra.join("\n\n")}`;
  }

  const cfg = await carregarConfigZapi();
```

- [ ] **Step 2: Enviar o texto final**

Trocar `const r = await enviarTexto(cfg, tel, texto);` por `const r = await enviarTexto(cfg, tel, textoFinal);`.

- [ ] **Step 3: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde).
```bash
git add "src/app/(app)/financeiro/contas-a-receber/whatsapp.ts"
git commit -m "feat(boletos): cobrança por WhatsApp inclui linha digitável + PIX

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Boletos — baixa automática + envio:** quando o cliente paga o boleto, o webhook do provedor dá baixa
  no título automaticamente (marca como BAIXADO) e registra o boleto como pago. A cobrança por WhatsApp
  passa a incluir a linha digitável e o PIX copia-e-cola do boleto. Requer a variável
  `BOLETO_WEBHOOK_SECRET` e cadastrar a URL do webhook no painel do provedor. Fecha o módulo de boletos.
```

- [ ] **Step 2: Commit + finalizar**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog da baixa automática de boletos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois usar `superpowers:finishing-a-development-branch`. (Sem migration. **Novo segredo:** `BOLETO_WEBHOOK_SECRET` — necessário só quando ligarem o webhook; lembrar o usuário.)

---

## Self-Review

- **Cobertura do spec:** `dadosBaixaBoleto` (T1) ✓; webhook com admin + provedor ativo + interpretar + baixa idempotente + boleto pago + 200 sempre (T2) ✓; `cobrarViaWhatsapp` anexa linha digitável/PIX (T3) ✓; CHANGELOG + env (T4) ✓. Unit (T1) + build/typecheck (T2/T3).
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Consistência de tipos:** `dadosBaixaBoleto` consome `EventoPagamento` (mesmo tipo produzido por `interpretarWebhook*`); a rota usa `interpretarWebhookAsaas`/`interpretarWebhookInter` (assinatura `(unknown) => EventoPagamento | null`) e `dadosBaixaBoleto`; `baixa` inserida com os campos exatos de `registrarBaixa` (menos `criado_por`, nulo no webhook). `forma_pagamento` "BOLETO" existe no enum.
- **Segurança:** webhook só autoriza pelo `secret`; cliente admin restrito à rota; funções puras não decifram credenciais; idempotência por `boleto.status`.
- **Escopo:** webhook/baixa + envio. Fecha o módulo. Relatórios/cancelamento pela UI ficam fora.
