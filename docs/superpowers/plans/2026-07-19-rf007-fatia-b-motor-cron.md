# RF-007 — Fatia B (motor + cron) — Plano

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.
> Spec: `docs/superpowers/specs/2026-07-19-rf007-followup-proposta-design.md`. Depende da **Fatia A**
> (em produção, v6.19.0): `followup_config`/`followup_etapa`/`followup_envio` e `proposta.enviada_em`.

**Objetivo:** o disparo automático — a lógica pura `etapasDevidas`/`aplicarVariaveis`, o motor
`processarFollowup(hoje)` e o cron `POST /api/cron/followup-proposta`.

**Arquitetura:** espelha a régua de cobrança (`lib/whatsapp/regua-motor.ts` + `api/cron/regua-cobranca`).
Lógica pura testada; o motor carrega config + propostas `enviada`, envia pelo canal e registra em
`followup_envio` (idempotente por `unique(proposta_id, etapa_id)`); o cron chama o motor, protegido por
`CRON_SECRET`. Sem migration.

**Stack:** Next.js 16 (route handler), Supabase (service role no cron), TypeScript, vitest.

## Global Constraints

- **Sem migration** — usa as tabelas da Fatia A + `proposta`/`oportunidade`/`proposta_item`.
- **Só propostas `status = 'enviada'` com `enviada_em`** entram (aceitas/recusadas ficam de fora → para no
  aceite/recusa).
- **Canal fixo** (`followup_config.canal`); se `!ativo`, o motor não faz nada.
- **Dedupe:** `unique(proposta_id, etapa_id)` — cada passo é registrado uma vez; passo sem destino grava
  `status='sem_destino'` (não repete).
- **Reuso:** `enviarEmail` (`lib/email/enviar`), `enviarTexto` + `ZapiConfig` (`lib/whatsapp/zapi`),
  `decifrarDominio` (`lib/cripto/envelope`), `normalizarTelefone` (`lib/whatsapp/mensagem`),
  `totaisProposta` (`lib/comercial/proposta`), `formatarMoeda`/`formatarData` (`lib/format`),
  `createAdminSupabase` (`lib/supabase/admin`).
- **Cron:** copiar o padrão de `api/cron/regua-cobranca/route.ts` (auth `CRON_SECRET`, timing-safe).
- **Operação (fora do código):** a URL `POST /api/cron/followup-proposta` precisa ser **adicionada ao
  agendador diário externo** que já bate na régua — senão o motor nunca dispara.
- **`main` protegido:** PR `develop → main`, `verify` verde. Release com bump + CHANGELOG. Deploy só código.
- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`,
  `npm run build`.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/lib/comercial/followup.ts` | **Criar** — `etapasDevidas`, `aplicarVariaveis` | 1 |
| `src/tests/comercial/followup.test.ts` | **Criar** — testes da lógica | 1 |
| `src/lib/comercial/followup-motor.ts` | **Criar** — `processarFollowup(hoje)` | 2 |
| `src/app/api/cron/followup-proposta/route.ts` | **Criar** — cron protegido | 2 |
| `CHANGELOG.md` + `package.json` | **Modificar** — release 6.20.0 | 3 |

---

### Task 1: Lógica pura `followup.ts`

**Files:**
- Create: `src/lib/comercial/followup.ts`
- Test: `src/tests/comercial/followup.test.ts`

**Interfaces:**
- Produces:
  - `type EtapaFollowup = { id: string; diasOffset: number; ativa: boolean }`
  - `etapasDevidas(enviadaEm: string, etapas: EtapaFollowup[], jaEnviadas: string[], hoje: string): EtapaFollowup[]`
  - `aplicarVariaveis(template: string, vars: Record<string, string>): string`

- [ ] **Step 1: Escrever os testes que falham**

```ts
import { describe, it, expect } from "vitest";
import { etapasDevidas, aplicarVariaveis } from "@/lib/comercial/followup";

const etapas = [
  { id: "e1", diasOffset: 0, ativa: true },
  { id: "e2", diasOffset: 3, ativa: true },
  { id: "e3", diasOffset: 7, ativa: true },
  { id: "e4", diasOffset: 3, ativa: false },
];

describe("etapasDevidas", () => {
  it("inclui as etapas ativas vencidas (enviada + offset ≤ hoje) e não enviadas", () => {
    const r = etapasDevidas("2026-07-01T12:00:00Z", etapas, [], "2026-07-04");
    expect(r.map((e) => e.id)).toEqual(["e1", "e2"]); // e1 (07-01), e2 (07-04); e3 (07-08) não; e4 inativa
  });
  it("pula as já enviadas", () => {
    const r = etapasDevidas("2026-07-01T12:00:00Z", etapas, ["e1"], "2026-07-04");
    expect(r.map((e) => e.id)).toEqual(["e2"]);
  });
  it("nada vencido ainda", () => {
    const r = etapasDevidas("2026-07-01T12:00:00Z", etapas, [], "2026-07-01");
    expect(r.map((e) => e.id)).toEqual(["e1"]); // só o D+0
  });
});

describe("aplicarVariaveis", () => {
  it("substitui {chave} pelos valores; deixa desconhecidas como estão", () => {
    expect(aplicarVariaveis("Olá {prospect}, proposta {numero} — {x}", { prospect: "ACME", numero: "7" })).toBe(
      "Olá ACME, proposta 7 — {x}",
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/followup.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
export type EtapaFollowup = { id: string; diasOffset: number; ativa: boolean };

// Data devida (YYYY-MM-DD) = dia UTC de enviadaEm + diasOffset.
function dataDevida(enviadaEm: string, diasOffset: number): string {
  const d = new Date(enviadaEm);
  d.setUTCDate(d.getUTCDate() + diasOffset);
  return d.toISOString().slice(0, 10);
}

export function etapasDevidas(
  enviadaEm: string,
  etapas: EtapaFollowup[],
  jaEnviadas: string[],
  hoje: string,
): EtapaFollowup[] {
  return etapas.filter(
    (e) => e.ativa && !jaEnviadas.includes(e.id) && dataDevida(enviadaEm, e.diasOffset) <= hoje,
  );
}

export function aplicarVariaveis(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k]! : m));
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/comercial/followup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comercial/followup.ts src/tests/comercial/followup.test.ts
git commit -m "feat(comercial): etapasDevidas + aplicarVariaveis (logica pura do follow-up)"
```

---

### Task 2: Motor `processarFollowup` + cron

**Files:**
- Create: `src/lib/comercial/followup-motor.ts`
- Create: `src/app/api/cron/followup-proposta/route.ts`

**Interfaces:**
- Consumes: `etapasDevidas`/`aplicarVariaveis` (Task 1); os primitivos de envio/config (ver Constraints).
- Produces: `processarFollowup(hoje: string): Promise<Resumo>`;
  `type Resumo = { ativo: boolean; processados: number; enviados: number; semDestino: number; falhas: number; motivo?: string }`.

- [ ] **Step 1: Escrever o motor**

```ts
import { createAdminSupabase } from "@/lib/supabase/admin";
import { decifrarDominio } from "@/lib/cripto/envelope";
import { enviarEmail } from "@/lib/email/enviar";
import { enviarTexto, type ZapiConfig } from "@/lib/whatsapp/zapi";
import { normalizarTelefone } from "@/lib/whatsapp/mensagem";
import { totaisProposta } from "@/lib/comercial/proposta";
import { formatarMoeda, formatarData } from "@/lib/format";
import { etapasDevidas, aplicarVariaveis, type EtapaFollowup } from "@/lib/comercial/followup";

export type Resumo = {
  ativo: boolean;
  processados: number;
  enviados: number;
  semDestino: number;
  falhas: number;
  motivo?: string;
};

export async function processarFollowup(hoje: string): Promise<Resumo> {
  const base: Resumo = { ativo: false, processados: 0, enviados: 0, semDestino: 0, falhas: 0 };
  const admin = createAdminSupabase();

  const { data: cfg } = await admin.from("followup_config").select("canal, ativo").eq("id", true).maybeSingle();
  const ativo = Boolean(cfg?.ativo);
  if (!ativo) return { ...base, ativo, motivo: "Follow-up desligado." };
  const canal = (cfg?.canal as string) ?? "email";

  // Canal WhatsApp exige a Z-API configurada.
  let zapi: ZapiConfig | null = null;
  if (canal === "whatsapp") {
    const { data: w } = await admin
      .from("whatsapp_config")
      .select("instance, token_cifrado, client_token_cifrado")
      .eq("id", 1)
      .maybeSingle();
    if (w?.instance && w.token_cifrado && w.client_token_cifrado) {
      zapi = {
        instance: w.instance as string,
        token: (await decifrarDominio("whatsapp", w.token_cifrado as string)).toString("utf8"),
        clientToken: (await decifrarDominio("whatsapp", w.client_token_cifrado as string)).toString("utf8"),
      };
    }
    if (!zapi) return { ...base, ativo, motivo: "WhatsApp não configurado." };
  }

  const { data: etapasRaw } = await admin
    .from("followup_etapa")
    .select("id, dias_offset, assunto, template, ativa")
    .eq("ativa", true);
  const etapas: (EtapaFollowup & { assunto: string | null; template: string })[] = (etapasRaw ?? []).map((e) => ({
    id: e.id as string,
    diasOffset: e.dias_offset as number,
    ativa: e.ativa as boolean,
    assunto: (e.assunto as string | null) ?? null,
    template: e.template as string,
  }));
  if (etapas.length === 0) return { ...base, ativo, motivo: "Sem etapas ativas." };

  // Propostas em aberto (enviadas, com data de envio) + contato da oportunidade.
  const { data: props } = await admin
    .from("proposta")
    .select("id, numero, validade, enviada_em, oportunidade_id, oportunidade(prospect_nome, contato_email, contato_telefone)")
    .eq("status", "enviada")
    .not("enviada_em", "is", null);
  const propostas = props ?? [];

  const resumo: Resumo = { ...base, ativo };
  for (const p of propostas) {
    resumo.processados++;
    // O embed do Supabase pode vir como objeto (to-one) ou array — normaliza.
    const opRaw = (p as { oportunidade?: unknown }).oportunidade;
    const op = (Array.isArray(opRaw) ? (opRaw[0] ?? {}) : (opRaw ?? {})) as {
      prospect_nome?: string;
      contato_email?: string;
      contato_telefone?: string;
    };

    const { data: jaRaw } = await admin.from("followup_envio").select("etapa_id").eq("proposta_id", p.id as string);
    const jaEnviadas = (jaRaw ?? []).map((r) => r.etapa_id as string);
    const devidas = etapasDevidas(p.enviada_em as string, etapas, jaEnviadas, hoje);
    if (devidas.length === 0) continue;

    // Valor da proposta (mensal) para a variável {valor}.
    const { data: itens } = await admin.from("proposta_item").select("valor, recorrencia").eq("proposta_id", p.id as string);
    const totalMensal = totaisProposta(
      (itens ?? []).map((i) => ({ valor: Number(i.valor), recorrencia: i.recorrencia as "mensal" | "unico" })),
    ).mensal;
    const vars: Record<string, string> = {
      prospect: op.prospect_nome ?? "",
      numero: String(p.numero ?? ""),
      valor: formatarMoeda(totalMensal),
      validade: p.validade ? formatarData(p.validade as string) : "",
    };

    for (const etapa of devidas) {
      const conf = etapas.find((e) => e.id === etapa.id)!;
      const corpo = aplicarVariaveis(conf.template, vars);
      const destino = canal === "email" ? (op.contato_email ?? "") : (op.contato_telefone ?? "");
      if (!destino.trim()) {
        await admin.from("followup_envio").insert({ proposta_id: p.id, etapa_id: etapa.id, status: "sem_destino" });
        resumo.semDestino++;
        continue;
      }
      let ok = false;
      if (canal === "email") {
        const r = await enviarEmail({ para: destino, assunto: aplicarVariaveis(conf.assunto ?? "", vars), corpo });
        ok = r.ok;
      } else {
        const tel = normalizarTelefone(destino);
        if (!tel) {
          await admin.from("followup_envio").insert({ proposta_id: p.id, etapa_id: etapa.id, status: "sem_destino" });
          resumo.semDestino++;
          continue;
        }
        const r = await enviarTexto(zapi!, tel, corpo);
        ok = r.ok;
      }
      await admin.from("followup_envio").insert({
        proposta_id: p.id,
        etapa_id: etapa.id,
        destino,
        status: ok ? "enviado" : "falhou",
      });
      if (ok) resumo.enviados++;
      else resumo.falhas++;
    }
  }
  return resumo;
}
```

> A inserção em `followup_envio` (com `unique(proposta_id, etapa_id)`) é a barreira de idempotência: se duas
> execuções coincidirem, a 2ª falha no insert e não reenvia. Como cada passo insere logo após o envio, um
> passo enviado nunca é reprocessado no mesmo dia.

- [ ] **Step 2: Escrever o cron (espelha `regua-cobranca/route.ts`)**

```ts
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processarFollowup } from "@/lib/comercial/followup-motor";

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(segredo);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const resumo = await processarFollowup(hoje);
  return NextResponse.json(resumo);
}
```

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: limpo. (O motor é integração; a lógica pura está coberta na Task 1.)

- [ ] **Step 4: Smoke test local (opcional, com o Pedro)**

Com `.env.local` tendo `CRON_SECRET`, ativar o follow-up e criar 1 etapa D+0 na config, semear uma proposta
`enviada` com `enviada_em` de hoje e um `contato_email`, então:
```bash
curl -s -X POST http://localhost:3000/api/cron/followup-proposta -H "Authorization: Bearer $CRON_SECRET" | head
```
Expected: JSON `{ ativo: true, processados: 1, enviados: 1, ... }` (ou `sem_destino`/`falhas` conforme o
provedor de e-mail no dev). Repetir o curl → o mesmo passo **não** reenvia (idempotência).

- [ ] **Step 5: Commit**

```bash
git add src/lib/comercial/followup-motor.ts "src/app/api/cron/followup-proposta/route.ts"
git commit -m "feat(comercial): motor + cron do follow-up de propostas (processarFollowup)"
```

---

### Task 3: Release 6.20.0

**Files:** `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Verificação completa**

```bash
npm run lint && npm run typecheck && npm test && npm run format && npm run build
npx prettier --check .
```

- [ ] **Step 2: Bump + CHANGELOG**

- `package.json`: `6.19.0` → `6.20.0`.
- `CHANGELOG.md`: `## [6.20.0] — <data>` com `### Adicionado` (o disparo automático do follow-up: motor +
  cron diário) e uma nota de **operação** (a URL do cron precisa entrar no agendador). Não fecha a RF-007
  ainda (falta a visibilidade — Fatia C).
- Conferir `npx vitest run src/tests/versao.test.ts`.

- [ ] **Step 3: PR**

```bash
git push origin develop
gh pr create --base main --head develop --title "RF-007 fatia B: motor + cron do follow-up (v6.20.0)"
gh pr checks --watch
```

- [ ] **Step 4: Release + operação (com o Pedro)**

> **Sem migration.** Sequência: merge → **Implantar** → confirmar `6.20.0` no `/api/health` → **tag**.
> **Passo de operação:** adicionar `POST https://app.seusaldo.ai/api/cron/followup-proposta` (header
> `Authorization: Bearer <CRON_SECRET>`) ao **mesmo agendador diário** que já chama a régua de cobrança —
> senão o motor existe mas nunca dispara. Confirmar com uma chamada manual (curl) após o deploy.

## Self-Review (cobertura da spec)

- `etapasDevidas`/`aplicarVariaveis` (vencidas × já enviadas; variáveis) → Task 1.
- Motor: só `enviada` com `enviada_em`; canal fixo; destino por canal; `sem_destino` não repete;
  idempotência por `unique` → Task 2.
- Cron protegido por `CRON_SECRET` → Task 2.
- Passo de operação (agendador) → sinalizado na Task 3.
- Visibilidade na proposta → **Fatia C**, fora daqui.
