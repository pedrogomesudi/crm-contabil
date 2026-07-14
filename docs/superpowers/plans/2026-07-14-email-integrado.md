# E-mail integrado (RF-051) — Fatia A — Plano de implementação

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.

**Objetivo:** o escritório configura o próprio canal de e-mail (SMTP ou API), cria templates com
variáveis e envia e-mails da ficha do cliente com anexos — tudo registrado na ficha.

**Arquitetura:** `email_config` (singleton, credenciais cifradas AES-256-GCM) + `email_template` +
`email_mensagem` (histórico). `enviarEmail()` despacha para nodemailer (SMTP) ou `fetch`
(Resend/SendGrid). Envio sempre server-side com `service_role`; anexos resolvidos por **id** (RLS
prova a titularidade), nunca por caminho vindo do navegador.

**Stack:** Next 16 (App Router, Server Actions), Supabase (RLS), `nodemailer`, vitest.

## Restrições globais (do spec)

- Credencial **nunca** volta ao navegador: a tela mostra só "configurado" / "não configurado".
  Campo de senha vazio = manter a atual; preenchido = trocar.
- `EMAIL_CRIPTO_KEY`: env runtime, **nunca** `NEXT_PUBLIC_`. Reusar `cifrar`/`decifrar` de
  `src/lib/nfse/cripto.ts`.
- Corpo é **texto**; o HTML é derivado com escape. Não aceitar HTML cru.
- Motor de marcadores: **reusar** `aplicarTemplate()` de `src/lib/whatsapp/mensagem.ts`. Não duplicar.
- Papéis: config = admin; templates = admin/assistente; envio = admin/assistente/contador.
- Migration nova, idempotente, imutável depois de aplicada. Enum novo em migration própria só se for
  **usado** na mesma transação — aqui os enums são criados e usados na mesma migration nas
  **definições de coluna**, o que é permitido (o proibido é `alter type ... add value` + uso).
- Rodar `npm run lint && npm run typecheck && npm test && npm run build` antes de cada commit.

---

### Tarefa 1: Migration + RLS + teste de RLS

**Arquivos:**
- Criar: `supabase/migrations/0089_email.sql`
- Modificar: `supabase/tests/rls.test.sql`

- [ ] **Passo 1: Escrever a migration**

```sql
-- V9 — E-mail integrado (RF-051). Credenciais cifradas na app (EMAIL_CRIPTO_KEY).
do $$ begin create type email_provedor as enum ('smtp','api');
exception when duplicate_object then null; end $$;
do $$ begin create type email_api_provedor as enum ('resend','sendgrid');
exception when duplicate_object then null; end $$;
do $$ begin create type email_status as enum ('ENVIADO','ERRO');
exception when duplicate_object then null; end $$;

create table if not exists email_config (
  id smallint primary key default 1 check (id = 1),
  provedor email_provedor,
  remetente_nome text,
  remetente_email text,
  smtp_host text,
  smtp_porta int,
  smtp_seguro boolean not null default true,
  smtp_usuario text,
  smtp_senha_cifrada text,
  api_provedor email_api_provedor,
  api_chave_cifrada text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
insert into email_config (id) values (1) on conflict (id) do nothing;

create table if not exists email_template (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  assunto text not null,
  corpo text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists email_mensagem (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete set null,
  titulo_id uuid references titulo(id) on delete set null,
  para text not null,
  assunto text not null,
  corpo text not null,
  anexos jsonb not null default '[]'::jsonb,
  status email_status not null,
  erro text,
  enviado_por uuid references usuarios(id),
  criado_em timestamptz not null default now()
);
create index if not exists ix_email_msg_cliente on email_mensagem (cliente_id, criado_em desc);

alter table email_config enable row level security;
alter table email_template enable row level security;
alter table email_mensagem enable row level security;

-- config: só admin (custódia de credencial — mesma regra da NFS-e e do WhatsApp)
do $$ begin
  drop policy if exists email_config_admin on email_config;
  create policy email_config_admin on email_config for all to authenticated
    using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
end $$;

-- templates: equipe lê; admin/assistente escrevem
do $$ begin
  drop policy if exists email_tpl_sel on email_template;
  create policy email_tpl_sel on email_template for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists email_tpl_write on email_template;
  create policy email_tpl_write on email_template for all to authenticated
    using (auth_papel() in ('admin','assistente'))
    with check (auth_papel() in ('admin','assistente'));
end $$;

-- histórico: admin/assistente/financeiro tudo; contador só dos seus clientes.
-- Sem policy de INSERT/UPDATE: só o servidor (service_role) grava, depois de enviar.
do $$ begin
  drop policy if exists email_msg_sel on email_mensagem;
  create policy email_msg_sel on email_mensagem for select to authenticated using (
    auth_papel() in ('admin','assistente','financeiro')
    or (auth_papel() = 'contador' and exists (
      select 1 from clientes c where c.id = email_mensagem.cliente_id and c.contador_id = auth.uid()))
  );
end $$;
```

- [ ] **Passo 2: Aplicar**

Rodar: `npm run db:migrate`
Esperado: `0089_email.sql` aplicada.

- [ ] **Passo 3: Asserts de RLS**

Em `supabase/tests/rls.test.sql`, na seção de asserts, semear e verificar:
- contador (…003) **lê** `email_mensagem` do cliente A (dele) e **não lê** do cliente B;
- assistente (…002) **não lê** `email_config` (`insufficient_privilege` no update; select devolve 0 linhas);
- cliente do portal (…005) **não lê** nada das três tabelas (0 linhas);
- assistente **cria** `email_template`; financeiro (…004) **não cria** (`insufficient_privilege`);
- ninguém (nem admin) consegue **INSERT** em `email_mensagem` — não há policy de escrita.

Lembrar: `perform _simular(uid)` antes de **cada** bloco, senão roda como owner e o teste passa por
engano.

- [ ] **Passo 4: Rodar**

Rodar: `npm run db:test`
Esperado: todos os asserts passam (contagem sobe em relação aos 90 atuais).

- [ ] **Passo 5: Commit**

```bash
git add supabase/migrations/0089_email.sql supabase/tests/rls.test.sql
git commit -m "feat(email): tabelas de config, template e historico com RLS"
```

---

### Tarefa 2: Biblioteca de e-mail (puro, testável)

**Arquivos:**
- Criar: `src/lib/email/template.ts`, `src/lib/email/validacao.ts`
- Criar: `src/tests/email/template.test.ts`, `src/tests/email/validacao.test.ts`

**Interfaces produzidas** (usadas pelas tarefas 3–6):
- `VARIAVEIS: { chave: string; rotulo: string }[]`
- `variaveisDoCliente(c: { razaoSocial; cnpj; email }, escritorio: string, hojeIso: string): Record<string,string>`
- `aplicarEmail(tpl: {assunto: string; corpo: string}, vars: Record<string,string>): {assunto: string; corpo: string}`
- `emailValido(v: string): boolean`
- `LIMITES = { assunto: 200, corpo: 20_000, anexosBytes: 10 * 1024 * 1024 }`
- `validarEnvio(i: {para: string; assunto: string; corpo: string}): string | null` (devolve o erro ou null)
- `htmlDoTexto(texto: string): string` — escapa `& < > "` e troca `\n` por `<br>`

- [ ] **Passo 1: Escrever os testes primeiro**

```ts
// src/tests/email/template.test.ts
import { describe, it, expect } from "vitest";
import { aplicarEmail, variaveisDoCliente, htmlDoTexto } from "@/lib/email/template";

describe("template de e-mail", () => {
  it("substitui as variáveis no assunto e no corpo", () => {
    const vars = variaveisDoCliente(
      { razaoSocial: "Padaria Sol Ltda", cnpj: "12345678000199", email: "s@sol.com" },
      "Escritório SALDO",
      "2026-07-14",
    );
    const r = aplicarEmail({ assunto: "Olá {nome}", corpo: "De {escritorio}, em {hoje}." }, vars);
    expect(r.assunto).toBe("Olá Padaria Sol Ltda");
    expect(r.corpo).toBe("De Escritório SALDO, em 14/07/2026.");
  });

  it("troca chave ausente por vazio, sem quebrar", () => {
    const r = aplicarEmail({ assunto: "x", corpo: "Valor: {valor}." }, { nome: "A" });
    expect(r.corpo).toBe("Valor: .");
  });

  it("escapa HTML do corpo (o e-mail não pode virar vetor de injeção)", () => {
    expect(htmlDoTexto('<script>alert("x")</script>\nok')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>ok",
    );
  });
});
```

```ts
// src/tests/email/validacao.test.ts
import { describe, it, expect } from "vitest";
import { emailValido, validarEnvio } from "@/lib/email/validacao";

describe("validação de envio", () => {
  it("aceita e-mail bem formado e rejeita o resto", () => {
    expect(emailValido("a@b.com")).toBe(true);
    expect(emailValido("a@b")).toBe(false);
    expect(emailValido("sem-arroba.com")).toBe(false);
  });

  it("exige destinatário, assunto e corpo", () => {
    expect(validarEnvio({ para: "", assunto: "a", corpo: "b" })).toBe("Informe o destinatário.");
    expect(validarEnvio({ para: "a@b.com", assunto: "  ", corpo: "b" })).toBe("Informe o assunto.");
    expect(validarEnvio({ para: "a@b.com", assunto: "a", corpo: "" })).toBe("Escreva a mensagem.");
    expect(validarEnvio({ para: "a@b.com", assunto: "a", corpo: "b" })).toBeNull();
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npm test -- email`
Esperado: FAIL (módulos não existem).

- [ ] **Passo 3: Implementar**

`src/lib/email/template.ts`:

```ts
import { aplicarTemplate } from "@/lib/whatsapp/mensagem";
import { formatarData } from "@/lib/format";

export const VARIAVEIS = [
  { chave: "nome", rotulo: "Razão social do cliente" },
  { chave: "cnpj", rotulo: "CNPJ" },
  { chave: "email", rotulo: "E-mail do cliente" },
  { chave: "escritorio", rotulo: "Nome do escritório" },
  { chave: "hoje", rotulo: "Data de hoje" },
  { chave: "valor", rotulo: "Valor do título (envio a partir de cobrança)" },
  { chave: "vencimento", rotulo: "Vencimento do título" },
  { chave: "competencia", rotulo: "Competência" },
];

export function variaveisDoCliente(
  c: { razaoSocial: string; cnpj: string | null; email: string | null },
  escritorio: string,
  hojeIso: string,
): Record<string, string> {
  return {
    nome: c.razaoSocial,
    cnpj: c.cnpj ?? "",
    email: c.email ?? "",
    escritorio,
    hoje: formatarData(hojeIso),
  };
}

export function aplicarEmail(tpl: { assunto: string; corpo: string }, vars: Record<string, string>) {
  return { assunto: aplicarTemplate(tpl.assunto, vars), corpo: aplicarTemplate(tpl.corpo, vars) };
}

// O corpo é texto; o HTML é derivado com escape — nunca aceitamos HTML cru.
export function htmlDoTexto(texto: string): string {
  const esc = texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return esc.replace(/\n/g, "<br>");
}
```

`src/lib/email/validacao.ts`:

```ts
const RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LIMITES = { assunto: 200, corpo: 20_000, anexosBytes: 10 * 1024 * 1024 };

export function emailValido(v: string): boolean {
  return RE.test(String(v ?? "").trim());
}

export function validarEnvio(i: { para: string; assunto: string; corpo: string }): string | null {
  if (!emailValido(i.para)) return "Informe o destinatário.";
  if (!i.assunto.trim()) return "Informe o assunto.";
  if (!i.corpo.trim()) return "Escreva a mensagem.";
  if (i.assunto.length > LIMITES.assunto) return "Assunto muito longo.";
  if (i.corpo.length > LIMITES.corpo) return "Mensagem muito longa.";
  return null;
}
```

Conferir a assinatura real de `formatarData` em `src/lib/format.ts` antes de usar; se ela não
devolver `dd/mm/aaaa` a partir de ISO, ajustar o teste e o código para a assinatura existente.

- [ ] **Passo 4: Rodar**

Rodar: `npm test -- email`
Esperado: PASS.

- [ ] **Passo 5: Commit**

```bash
git add src/lib/email src/tests/email
git commit -m "feat(email): motor de templates, variaveis e validacao"
```

---

### Tarefa 3: Transporte (SMTP + API)

**Arquivos:**
- Criar: `src/lib/email/config.ts`, `src/lib/email/enviar.ts`
- Criar: `src/tests/email/enviar.test.ts`
- Modificar: `package.json` (dependência `nodemailer` + `@types/nodemailer`)

**Interfaces consumidas:** `htmlDoTexto` (Tarefa 2), `cifrar`/`decifrar` de `@/lib/nfse/cripto`.

**Interfaces produzidas:**
- `type ConfigEmail = { provedor: "smtp" | "api"; remetenteNome: string; remetenteEmail: string; smtp?: {...}; api?: { provedor: "resend" | "sendgrid"; chave: string } }`
- `carregarConfig(): Promise<ConfigEmail | { erro: string }>` — lê com `service_role` e **decifra**
- `type Anexo = { nome: string; conteudo: Buffer; tipo: string }`
- `enviarEmail(msg: { para: string; assunto: string; corpo: string; anexos?: Anexo[] }): Promise<{ ok: true } | { ok: false; erro: string }>`
- `payloadResend(cfg, msg)` / `payloadSendgrid(cfg, msg)` — **exportadas para teste** (montagem pura)

- [ ] **Passo 1: Instalar a dependência**

```bash
npm i nodemailer && npm i -D @types/nodemailer
```

- [ ] **Passo 2: Escrever o teste (payloads puros, sem rede)**

```ts
// src/tests/email/enviar.test.ts
import { describe, it, expect } from "vitest";
import { payloadResend, payloadSendgrid } from "@/lib/email/enviar";

const cfg = { remetenteNome: "Escritório SALDO", remetenteEmail: "contato@saldo.ai" };
const msg = { para: "cliente@x.com", assunto: "Guia", corpo: "Olá\nsegue a guia." };

describe("payload dos provedores", () => {
  it("Resend: remetente com nome, html escapado", () => {
    const p = payloadResend(cfg, msg);
    expect(p.from).toBe("Escritório SALDO <contato@saldo.ai>");
    expect(p.to).toEqual(["cliente@x.com"]);
    expect(p.html).toBe("Olá<br>segue a guia.");
    expect(p.text).toBe("Olá\nsegue a guia.");
  });

  it("SendGrid: personalizations + from", () => {
    const p = payloadSendgrid(cfg, msg);
    expect(p.personalizations[0].to[0].email).toBe("cliente@x.com");
    expect(p.from.email).toBe("contato@saldo.ai");
    expect(p.subject).toBe("Guia");
  });
});
```

- [ ] **Passo 3: Rodar e ver falhar**

Rodar: `npm test -- enviar`
Esperado: FAIL.

- [ ] **Passo 4: Implementar `config.ts`**

```ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { decifrar } from "@/lib/nfse/cripto";

export type ConfigEmail = {
  provedor: "smtp" | "api";
  remetenteNome: string;
  remetenteEmail: string;
  smtp?: { host: string; porta: number; seguro: boolean; usuario: string; senha: string };
  api?: { provedor: "resend" | "sendgrid"; chave: string };
};

export async function carregarConfig(): Promise<ConfigEmail | { erro: string }> {
  const chave = process.env.EMAIL_CRIPTO_KEY;
  if (!chave) return { erro: "EMAIL_CRIPTO_KEY não configurada no servidor." };
  const admin = createAdminSupabase();
  const { data: c } = await admin.from("email_config").select("*").eq("id", 1).maybeSingle();
  if (!c?.provedor || !c.remetente_email) return { erro: "E-mail não configurado." };

  const base = {
    remetenteNome: (c.remetente_nome as string) ?? (c.remetente_email as string),
    remetenteEmail: c.remetente_email as string,
  };
  if (c.provedor === "smtp") {
    if (!c.smtp_host || !c.smtp_senha_cifrada) return { erro: "SMTP incompleto." };
    return {
      ...base,
      provedor: "smtp",
      smtp: {
        host: c.smtp_host as string,
        porta: (c.smtp_porta as number) ?? 587,
        seguro: Boolean(c.smtp_seguro),
        usuario: (c.smtp_usuario as string) ?? "",
        senha: decifrar(c.smtp_senha_cifrada as string, chave).toString("utf8"),
      },
    };
  }
  if (!c.api_provedor || !c.api_chave_cifrada) return { erro: "Chave de API ausente." };
  return {
    ...base,
    provedor: "api",
    api: {
      provedor: c.api_provedor as "resend" | "sendgrid",
      chave: decifrar(c.api_chave_cifrada as string, chave).toString("utf8"),
    },
  };
}
```

- [ ] **Passo 5: Implementar `enviar.ts`**

```ts
import "server-only";
import nodemailer from "nodemailer";
import { carregarConfig, type ConfigEmail } from "./config";
import { htmlDoTexto } from "./template";

export type Anexo = { nome: string; conteudo: Buffer; tipo: string };
type Msg = { para: string; assunto: string; corpo: string; anexos?: Anexo[] };
type Remetente = { remetenteNome: string; remetenteEmail: string };

export function payloadResend(cfg: Remetente, msg: Msg) {
  return {
    from: `${cfg.remetenteNome} <${cfg.remetenteEmail}>`,
    to: [msg.para],
    subject: msg.assunto,
    text: msg.corpo,
    html: htmlDoTexto(msg.corpo),
    attachments: (msg.anexos ?? []).map((a) => ({
      filename: a.nome,
      content: a.conteudo.toString("base64"),
    })),
  };
}

export function payloadSendgrid(cfg: Remetente, msg: Msg) {
  return {
    personalizations: [{ to: [{ email: msg.para }] }],
    from: { email: cfg.remetenteEmail, name: cfg.remetenteNome },
    subject: msg.assunto,
    content: [
      { type: "text/plain", value: msg.corpo },
      { type: "text/html", value: htmlDoTexto(msg.corpo) },
    ],
    attachments: (msg.anexos ?? []).map((a) => ({
      filename: a.nome,
      type: a.tipo,
      content: a.conteudo.toString("base64"),
    })),
  };
}

async function viaApi(cfg: ConfigEmail, msg: Msg): Promise<{ ok: true } | { ok: false; erro: string }> {
  const api = cfg.api!;
  const url = api.provedor === "resend"
    ? "https://api.resend.com/emails"
    : "https://api.sendgrid.com/v3/mail/send";
  const body = api.provedor === "resend" ? payloadResend(cfg, msg) : payloadSendgrid(cfg, msg);
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${api.chave}` },
    body: JSON.stringify(body),
  });
  if (r.ok) return { ok: true };
  const txt = await r.text().catch(() => "");
  return { ok: false, erro: `Provedor recusou (${r.status}): ${txt.slice(0, 300)}` };
}

async function viaSmtp(cfg: ConfigEmail, msg: Msg): Promise<{ ok: true } | { ok: false; erro: string }> {
  const s = cfg.smtp!;
  const transport = nodemailer.createTransport({
    host: s.host,
    port: s.porta,
    secure: s.seguro && s.porta === 465, // 587 usa STARTTLS
    auth: s.usuario ? { user: s.usuario, pass: s.senha } : undefined,
  });
  try {
    await transport.sendMail({
      from: `${cfg.remetenteNome} <${cfg.remetenteEmail}>`,
      to: msg.para,
      subject: msg.assunto,
      text: msg.corpo,
      html: htmlDoTexto(msg.corpo),
      attachments: (msg.anexos ?? []).map((a) => ({ filename: a.nome, content: a.conteudo, contentType: a.tipo })),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message.slice(0, 300) : "Falha no envio." };
  }
}

export async function enviarEmail(msg: Msg): Promise<{ ok: true } | { ok: false; erro: string }> {
  const cfg = await carregarConfig();
  if ("erro" in cfg) return { ok: false, erro: cfg.erro };
  return cfg.provedor === "smtp" ? viaSmtp(cfg, msg) : viaApi(cfg, msg);
}
```

- [ ] **Passo 6: Rodar tudo**

Rodar: `npm test -- email && npm run typecheck`
Esperado: PASS.

- [ ] **Passo 7: Commit**

```bash
git add package.json package-lock.json src/lib/email src/tests/email
git commit -m "feat(email): transporte SMTP (nodemailer) e API (Resend/SendGrid)"
```

---

### Tarefa 4: Tela de configuração + e-mail de teste

**Arquivos:**
- Criar: `src/app/(app)/configuracoes/email/page.tsx`, `FormEmail.tsx`, `actions.ts`
- Modificar: `src/app/(app)/configuracoes/page.tsx` (card/link "E-mail")

**Interfaces consumidas:** `enviarEmail` (T3), `cifrar` (`@/lib/nfse/cripto`).

- [ ] **Passo 1: `actions.ts`**

Três actions, todas com gate `perfil.papel === "admin"`:

- `salvarConfigEmail(prev, formData)`: lê `provedor`, remetente (nome + e-mail, validado com
  `emailValido`), e conforme o provedor: host/porta/seguro/usuário + senha, **ou** api_provedor +
  chave. **Senha/chave em branco = manter a atual** (não sobrescrever com vazio). Cifra com
  `cifrar(Buffer.from(valor), required(process.env.EMAIL_CRIPTO_KEY, "EMAIL_CRIPTO_KEY"))` e grava
  via `createServerSupabase()` (a RLS de admin é a barreira). Erro claro se a env faltar.
- `statusConfig()`: devolve `{ provedor, remetenteNome, remetenteEmail, smtpHost, smtpPorta,
  smtpSeguro, smtpUsuario, apiProvedor, temSenha: boolean, temChave: boolean }` — **nunca** os
  segredos.
- `enviarTeste(prev, formData)`: destinatário = e-mail do admin logado (ou o informado); chama
  `enviarEmail({ para, assunto: "Teste de e-mail — SALDO", corpo: "..." })` e devolve ok/erro **com a
  mensagem do provedor**, que é o que permite descobrir senha errada antes de o cliente ficar sem
  cobrança.

- [ ] **Passo 2: `page.tsx` + `FormEmail.tsx`**

Server page com gate de admin (`redirect("/")`), chama `statusConfig()` e renderiza o form client
(`useActionState`). O form alterna os campos por provedor (radio SMTP × API), mostra
"Senha configurada — deixe em branco para manter" quando `temSenha`, e traz o botão **Enviar e-mail
de teste** com o resultado inline.

- [ ] **Passo 3: Verificar**

Rodar: `npm run lint && npm run typecheck && npm run build`
Esperado: sem erros; rota `/configuracoes/email` no output do build.

- [ ] **Passo 4: Commit**

```bash
git add "src/app/(app)/configuracoes"
git commit -m "feat(email): tela de configuracao do canal com envio de teste"
```

---

### Tarefa 5: Templates (CRUD)

**Arquivos:**
- Criar: `src/app/(app)/configuracoes/email/templates/page.tsx`, `FormTemplate.tsx`, `actions.ts`

**Interfaces consumidas:** `VARIAVEIS` (T2).

- [ ] **Passo 1: `actions.ts`** — gate admin/assistente (`podeGerenciarResponsaveis` NÃO serve; criar
  `podeGerenciarTemplatesEmail(papel)` em `src/lib/clientes/permissoes.ts` = admin ou assistente).
  `listarTemplates()`, `salvarTemplate({id?, nome, assunto, corpo, ativo})` (assunto ≤ 200, corpo ≤
  20 000), `excluirTemplate(id)`.

- [ ] **Passo 2: Tela** — lista de templates + editor com o **catálogo de variáveis** visível
  (chips clicáveis que inserem `{chave}` no corpo) e uma **prévia** aplicando um cliente fictício.

- [ ] **Passo 3: Verificar e commitar**

```bash
npm run lint && npm run typecheck && npm run build
git add "src/app/(app)/configuracoes/email/templates" src/lib/clientes/permissoes.ts
git commit -m "feat(email): CRUD de templates com variaveis"
```

---

### Tarefa 6: Envio da ficha do cliente + histórico

**Arquivos:**
- Criar: `src/app/(app)/clientes/[id]/email-actions.ts`
- Criar: `src/components/clientes/EmailsCliente.tsx`
- Modificar: `src/app/(app)/clientes/[id]/page.tsx` (renderizar a seção)

**Interfaces consumidas:** `enviarEmail`, `Anexo` (T3); `aplicarEmail`, `variaveisDoCliente`,
`validarEnvio`, `LIMITES` (T2).

- [ ] **Passo 1: `email-actions.ts`**

```ts
"use server";
// gate: podeGerenciarDocumentos(papel) → admin/assistente/contador (financeiro não envia)

export type AnexoRef = { tipo: "documento" | "obrigacao" | "nfse" | "boleto"; id: string };

export async function listarAnexaveis(clienteId: string): Promise<{ tipo: string; id: string; nome: string }[]>
// lê com o supabase DO USUÁRIO (RLS escopa ao cliente permitido)

export async function enviarEmailCliente(input: {
  clienteId: string; para: string; assunto: string; corpo: string; anexos: AnexoRef[];
}): Promise<{ ok?: boolean; erro?: string }>
```

Passos internos de `enviarEmailCliente`, nesta ordem:
1. gate de papel; `validarEnvio` (Tarefa 2).
2. **Resolver os anexos por id**, um a um, com `createServerSupabase()` (usuário) — se a RLS não
   devolver a linha, o anexo não é do cliente e o envio **falha**. Nunca aceitar `caminho_storage` do
   navegador.
3. Baixar do Storage com `createAdminSupabase()` (só depois de a RLS ter provado a titularidade) e
   somar os bytes: acima de `LIMITES.anexosBytes` → `{ erro: "Anexos acima de 10 MB." }`.
4. `enviarEmail(...)`.
5. **Registrar sempre** em `email_mensagem` com `createAdminSupabase()` (não há policy de INSERT):
   status `ENVIADO` ou `ERRO` + `erro`, `enviado_por = perfil.id`, `anexos` como jsonb.
6. `revalidatePath(\`/clientes/${clienteId}\`)`.

- [ ] **Passo 2: `EmailsCliente.tsx`**

Seção com o botão **Enviar e-mail** (abre o form: destinatário pré-preenchido com o e-mail do
cliente, `select` de template que preenche assunto/corpo **já com as variáveis aplicadas** e
editável, checkboxes dos anexáveis) e, abaixo, o **histórico**: data, assunto, destinatário, status
(erro em vermelho, com o motivo).

- [ ] **Passo 3: Renderizar na ficha**

Em `src/app/(app)/clientes/[id]/page.tsx`, carregar os últimos 20 `email_mensagem` do cliente (RLS
escopa) e os templates ativos, e renderizar `<EmailsCliente ... />` perto de `<DocumentosSection />`.

- [ ] **Passo 4: Verificar**

Rodar: `npm run lint && npm run typecheck && npm test && npm run build`
Esperado: tudo passa.

- [ ] **Passo 5: Commit**

```bash
git add "src/app/(app)/clientes/[id]" src/components/clientes/EmailsCliente.tsx
git commit -m "feat(email): envio pela ficha do cliente com anexos e historico"
```

---

### Tarefa 7: Documentação, entrega e tag

- [ ] **Passo 1:** `docs/DOCUMENTACAO.md` — nova seção "E-mail integrado" (canal, segredos, templates,
  anexos por id, histórico); `CHANGELOG.md` em "Não lançado"; `docs/DEPLOY.md` — registrar a env
  **`EMAIL_CRIPTO_KEY`**.
- [ ] **Passo 2:** Gerar a chave: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] **Passo 3:** Commit, merge `develop` → `main`, push.
- [ ] **Passo 4:** **Pedir ao usuário, de forma explícita**: adicionar `EMAIL_CRIPTO_KEY` no EasyPanel,
  implantar e validar (configurar SMTP → e-mail de teste → criar template → enviar da ficha com anexo
  → conferir o histórico, inclusive um envio com senha errada gravando **ERRO**).
- [ ] **Passo 5:** Após o "validei, deu certo": tag `v5.24.0`.
