# Régua de cobrança por e-mail (RF-051, Fatia B) — Plano de implementação

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.

**Objetivo:** o e-mail vira o canal redundante da régua — se o WhatsApp não entrega, a cobrança sai por
e-mail; nunca as duas.

**Arquitetura:** a regra de escolha do canal fica numa função **pura** (`decidirCanal`), coberta por
testes; o motor (`regua-motor.ts`) só executa. Dedupe consultando os **dois** canais por
`(titulo_id, etapa_id)`, com índice único em cada tabela como trava de corrida.

**Stack:** vitest, Supabase (service_role no motor), Next 16.

## Restrições globais

- **Nunca duas cobranças** do mesmo título na mesma etapa. Checar os dois canais antes de enviar.
- O motor roda com `service_role` (é cron): `email_mensagem` segue **sem policy de INSERT**.
- Migration idempotente; imutável depois de aplicada.
- Mudança de comportamento consciente: `cobranca_whatsapp = false` passa a significar só
  "não me cobre por WhatsApp" — documentar no CHANGELOG e na DOCUMENTACAO.
- Rodar `npm run lint && npm run typecheck && npm test && npm run build` antes de cada commit.

---

### Tarefa 1: Migration

**Arquivos:** Criar `supabase/migrations/0090_regua_email.sql`

- [ ] **Passo 1: Escrever**

```sql
-- V9.1 — Régua de cobrança por e-mail (RF-051, fatia B): e-mail como fallback do WhatsApp.
alter table regua_etapa add column if not exists email_assunto text;
alter table regua_etapa add column if not exists email_corpo text;

-- Opt-out por canal. Nasce ligado: quem não quiser e-mail desliga aqui.
-- ATENÇÃO: a partir daqui, cobranca_whatsapp = false significa apenas "não por WhatsApp".
alter table clientes_financeiro add column if not exists cobranca_email boolean not null default true;

-- Interruptor do escritório (desliga o canal sem mexer nas etapas).
alter table email_config add column if not exists regua_email_fallback boolean not null default true;

-- Dedupe do e-mail por etapa — espelha uq_wa_msg_titulo_etapa.
alter table email_mensagem add column if not exists etapa_id uuid references regua_etapa(id) on delete set null;
create unique index if not exists uq_email_msg_titulo_etapa
  on email_mensagem(titulo_id, etapa_id) where etapa_id is not null;
```

- [ ] **Passo 2: Aplicar**

Rodar: `npm run db:migrate` → esperado: `0090_regua_email.sql` aplicada.

- [ ] **Passo 3: Commit**

```bash
git add supabase/migrations/0090_regua_email.sql
git commit -m "feat(regua): colunas de e-mail nas etapas, opt-out por canal e dedupe"
```

---

### Tarefa 2: A regra (pura) + testes

**Arquivos:**
- Criar: `src/lib/email/regua.ts`
- Criar: `src/tests/email/regua.test.ts`

**Interfaces produzidas** (consumidas pela Tarefa 3):

```ts
export type EstadoCanal = {
  whatsappConfigurado: boolean;
  telefone: string | null;      // já normalizado (null = inválido/ausente)
  optOutWhatsapp: boolean;      // clientes_financeiro.cobranca_whatsapp === false
  emailFallbackLigado: boolean; // email_config.regua_email_fallback
  emailConfigurado: boolean;    // email_config.provedor preenchido
  email: string | null;         // e-mail do cliente
  optOutEmail: boolean;         // clientes_financeiro.cobranca_email === false
};
export type Canal = "whatsapp" | "email" | "nenhum";

export function decidirCanal(e: EstadoCanal): { canal: Canal; motivo: string }
// Escolha do PRIMEIRO canal a tentar. O motor, se o WhatsApp falhar no envio,
// chama decidirEmail() para saber se ainda pode cair para o e-mail.

export function podeEmail(e: EstadoCanal): boolean
// e-mail habilitado: fallback ligado + provedor configurado + tem e-mail + sem opt-out

export function conteudoEmail(
  etapa: { template: string; email_assunto: string | null; email_corpo: string | null },
  vars: Record<string, string>,
): { assunto: string; corpo: string }
// Degradação graciosa: sem email_corpo, usa o texto do WhatsApp; sem assunto, "Cobrança — {nome}".
```

- [ ] **Passo 1: Escrever os testes primeiro**

```ts
import { describe, it, expect } from "vitest";
import { decidirCanal, podeEmail, conteudoEmail, type EstadoCanal } from "@/lib/email/regua";

const base: EstadoCanal = {
  whatsappConfigurado: true,
  telefone: "5511999999999",
  optOutWhatsapp: false,
  emailFallbackLigado: true,
  emailConfigurado: true,
  email: "cliente@x.com",
  optOutEmail: false,
};

describe("decidirCanal", () => {
  it("com tudo certo, tenta WhatsApp primeiro", () => {
    expect(decidirCanal(base).canal).toBe("whatsapp");
  });

  it("sem telefone, cai para e-mail", () => {
    expect(decidirCanal({ ...base, telefone: null }).canal).toBe("email");
  });

  it("WhatsApp não configurado (banimento do número), cai para e-mail", () => {
    expect(decidirCanal({ ...base, whatsappConfigurado: false }).canal).toBe("email");
  });

  it("opt-out de WhatsApp: o e-mail assume (não é mais silêncio total)", () => {
    expect(decidirCanal({ ...base, optOutWhatsapp: true }).canal).toBe("email");
  });

  it("opt-out dos dois canais: nada sai", () => {
    expect(decidirCanal({ ...base, optOutWhatsapp: true, optOutEmail: true }).canal).toBe("nenhum");
  });

  it("fallback desligado e sem WhatsApp: nada sai", () => {
    expect(decidirCanal({ ...base, whatsappConfigurado: false, emailFallbackLigado: false }).canal).toBe("nenhum");
  });

  it("sem e-mail cadastrado e sem telefone: nada sai", () => {
    expect(decidirCanal({ ...base, telefone: null, email: null }).canal).toBe("nenhum");
  });
});

describe("podeEmail", () => {
  it("exige fallback ligado, provedor configurado, e-mail e sem opt-out", () => {
    expect(podeEmail(base)).toBe(true);
    expect(podeEmail({ ...base, emailFallbackLigado: false })).toBe(false);
    expect(podeEmail({ ...base, emailConfigurado: false })).toBe(false);
    expect(podeEmail({ ...base, email: null })).toBe(false);
    expect(podeEmail({ ...base, optOutEmail: true })).toBe(false);
  });
});

describe("conteudoEmail", () => {
  const vars = { nome: "Padaria Sol", valor: "R$ 890,00", vencimento: "20/07/2026", dias: "3" };

  it("usa assunto e corpo próprios quando existem", () => {
    const r = conteudoEmail(
      { template: "wpp", email_assunto: "Cobrança de {valor}", email_corpo: "Olá {nome}, vence {vencimento}." },
      vars,
    );
    expect(r.assunto).toBe("Cobrança de R$ 890,00");
    expect(r.corpo).toBe("Olá Padaria Sol, vence 20/07/2026.");
  });

  it("sem corpo próprio, reaproveita o texto do WhatsApp (a régua não fica muda)", () => {
    const r = conteudoEmail({ template: "Olá {nome}, saldo de {valor}.", email_assunto: null, email_corpo: null }, vars);
    expect(r.corpo).toBe("Olá Padaria Sol, saldo de R$ 890,00.");
    expect(r.assunto).toBe("Cobrança — Padaria Sol");
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar** — `npm test -- regua` → FAIL (módulo não existe).

- [ ] **Passo 3: Implementar `src/lib/email/regua.ts`**

```ts
import { aplicarTemplate } from "@/lib/whatsapp/mensagem";

export type EstadoCanal = { /* como acima */ };
export type Canal = "whatsapp" | "email" | "nenhum";

export function podeEmail(e: EstadoCanal): boolean {
  return e.emailFallbackLigado && e.emailConfigurado && Boolean(e.email) && !e.optOutEmail;
}

export function podeWhatsapp(e: EstadoCanal): boolean {
  return e.whatsappConfigurado && Boolean(e.telefone) && !e.optOutWhatsapp;
}

export function decidirCanal(e: EstadoCanal): { canal: Canal; motivo: string } {
  if (podeWhatsapp(e)) return { canal: "whatsapp", motivo: "WhatsApp disponível." };
  if (podeEmail(e)) return { canal: "email", motivo: "WhatsApp indisponível — cai para e-mail." };
  return { canal: "nenhum", motivo: "Nenhum canal disponível para este cliente." };
}

export function conteudoEmail(
  etapa: { template: string; email_assunto: string | null; email_corpo: string | null },
  vars: Record<string, string>,
): { assunto: string; corpo: string } {
  // Sem conteúdo próprio, reaproveita o texto do WhatsApp: a régua não pode ficar muda
  // justamente no cenário em que o fallback importa (banimento inesperado do número).
  const corpo = aplicarTemplate(etapa.email_corpo?.trim() || etapa.template, vars);
  const assunto = aplicarTemplate(etapa.email_assunto?.trim() || "Cobrança — {nome}", vars);
  return { assunto, corpo };
}
```

- [ ] **Passo 4: Rodar** — `npm test -- regua` → PASS.

- [ ] **Passo 5: Commit**

```bash
git add src/lib/email/regua.ts src/tests/email/regua.test.ts
git commit -m "feat(regua): regra pura de escolha de canal e conteudo do e-mail"
```

---

### Tarefa 3: Motor com dois canais

**Arquivos:** Modificar `src/lib/whatsapp/regua-motor.ts`

**Interfaces consumidas:** `decidirCanal`, `podeEmail`, `conteudoEmail` (T2); `enviarEmail` (Fatia A).

- [ ] **Passo 1: Não abortar mais sem WhatsApp**

Hoje o motor faz `return { motivo: "WhatsApp não configurado." }` quando falta credencial — isso
**paralisa a régua**, que é exatamente o cenário de banimento que esta fatia existe para cobrir.
Trocar por: `const zapi = ... | null` (null se não configurado) e **seguir**. Abortar só se **nenhum**
canal estiver disponível (sem Z-API **e** sem `email_config.provedor`), com
`motivo: "Nenhum canal configurado."`.

- [ ] **Passo 2: Carregar o estado dos canais**

Ler `email_config` (`provedor`, `regua_email_fallback`) uma vez, fora do laço. No `select` dos títulos,
incluir `clientes(email, ...)` e `clientes_financeiro(cobranca_whatsapp, cobranca_email)`.

- [ ] **Passo 3: Dedupe entre canais**

```ts
async function jaEnviado(admin, tituloId: string, etapaId: string): Promise<boolean> {
  const [wa, em] = await Promise.all([
    admin.from("whatsapp_mensagem").select("id").eq("titulo_id", tituloId).eq("etapa_id", etapaId).maybeSingle(),
    admin.from("email_mensagem").select("id").eq("titulo_id", tituloId).eq("etapa_id", etapaId).maybeSingle(),
  ]);
  return Boolean(wa.data || em.data);
}
```

Consultar os **dois**: o índice único de cada tabela sozinho não impede a duplicidade *entre* canais
numa reexecução do cron.

- [ ] **Passo 4: Fluxo por título**

1. saldo ≤ 0 → pulado (como hoje);
2. `etapaDoDia` → sem etapa, pulado;
3. `jaEnviado` → pulado;
4. `decidirCanal(estado)`:
   - `"whatsapp"` → envia; grava em `whatsapp_mensagem` (como hoje). **Se o envio falhar** e
     `podeEmail(estado)`, tenta o e-mail em seguida (é o 4º motivo de fallback do spec);
   - `"email"` → monta `conteudoEmail(etapa, vars)`, chama `enviarEmail()` e grava em `email_mensagem`
     com `titulo_id`, `etapa_id`, `cliente_id`, status e `erro`;
   - `"nenhum"` → pulado.
5. Erro de INSERT no índice único (corrida com outra execução) → conta como **pulado**, nunca como erro.

- [ ] **Passo 5: Resumo por canal**

`ResumoRegua` ganha `enviadosWhatsapp` e `enviadosEmail` (o `enviados` continua sendo o total), para o
painel dizer o que saiu por onde.

- [ ] **Passo 6: Verificar e commitar**

```bash
npm run lint && npm run typecheck && npm test && npm run build
git add src/lib/whatsapp/regua-motor.ts
git commit -m "feat(regua): e-mail como canal de fallback do WhatsApp, com dedupe entre canais"
```

---

### Tarefa 4: Telas (etapa, opt-out, histórico)

**Arquivos:**
- Modificar: `src/app/(app)/financeiro/regua-cobranca/actions.ts`, `Regua.tsx`, `page.tsx`
- Modificar: `src/app/(app)/financeiro/regua-cobranca/optout.ts`
- Modificar: `src/components/clientes/OptOutCobranca.tsx`
- Modificar: `src/app/(app)/configuracoes/email/` (interruptor do fallback)

- [ ] **Passo 1: Editor da etapa** — campos **Assunto do e-mail** e **Corpo do e-mail**, com o aviso:
  *"Em branco, o e-mail usa o texto do WhatsApp."* `EtapaView` ganha `email_assunto` e `email_corpo`.

- [ ] **Passo 2: Opt-out por canal** — `setOptOutCobranca(clienteId, { whatsapp?, email? })` (mudar a
  assinatura, que hoje só aceita um booleano) e `OptOutCobranca` com **dois** interruptores, rotulados
  sem ambiguidade ("Cobrar por WhatsApp" / "Cobrar por e-mail").

- [ ] **Passo 3: Histórico com canal** — a listagem de envios da régua passa a unir
  `whatsapp_mensagem` e `email_mensagem` (ambas com `etapa_id`), com uma coluna **Canal**.

- [ ] **Passo 4: Interruptor do fallback** — checkbox "Usar e-mail como fallback da régua de cobrança"
  na tela de configuração de e-mail, gravando `email_config.regua_email_fallback`.

- [ ] **Passo 5: Verificar e commitar**

```bash
npm run lint && npm run typecheck && npm test && npm run build
git add -A && git commit -m "feat(regua): telas de etapa, opt-out por canal e historico com canal"
```

---

### Tarefa 5: Documentação, entrega e tag

- [ ] **Passo 1:** `docs/DOCUMENTACAO.md` (seções da Cobrança e do E-mail) + `CHANGELOG.md`, **destacando
  a mudança de comportamento**: `cobranca_whatsapp = false` deixa de silenciar o cliente por completo.
- [ ] **Passo 2:** Commit, merge `develop` → `main`, push.
- [ ] **Passo 3:** **Pedir explicitamente ao usuário**: implantar e validar — (a) cliente com telefone →
  sai por WhatsApp e o e-mail **não** sai; (b) cliente sem telefone ou com opt-out de WhatsApp → sai por
  e-mail; (c) rodar a régua de novo no mesmo dia → **nada** sai; (d) o histórico mostra o canal.
  Alertar para conferir, **antes**, quais clientes estão hoje com `cobranca_whatsapp = false` — eles
  voltarão a ser cobrados, agora por e-mail.
- [ ] **Passo 4:** Após o "validei, deu certo": tag `v5.25.0`.
