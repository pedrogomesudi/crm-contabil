# Envio de notas + cobrança (PIX/TED) via WhatsApp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar, em lote sob comando, a NFS-e (DANFSe PDF) + mensagem com dados de pagamento (PIX/TED) para cada cliente com nota autorizada no mês, com progresso e reenvio das falhas.

**Architecture:** Config `dados_bancarios` (linha única); helper puro `linhasPagamento`/`competenciaBR`; refactor `obterDanfsePdf` (cache+ADN) reutilizável; action por nota `enviarNotaWhatsapp` (dedup + `enviarMidiaZapi`); UI com loop client-side na tela NFS-e em lote. Spec: `docs/superpowers/specs/2026-07-07-envio-notas-cobranca-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase (Postgres/Storage/RLS), Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Todos passam.
- Migration nova em `supabase/migrations/`, aplicada por `npm run db:migrate` (NUNCA `supabase db push`). Idempotente. Atinge produção.
- Sem enum/`ALTER TYPE`. Storage: bucket `documentos` (cache DANFSe em `danfse/{chave}.pdf`).
- Dados bancários em texto puro (não são segredo); página de config **admin**; motor lê via `service_role`.
- Respeitar opt-out `clientes_financeiro.cobranca_whatsapp` e pular clientes sem telefone. Dedup por "já enviada com sucesso" (permite reenviar falhas).
- Tokens SALDO na UI. Branch: `git checkout -b feat/envio-notas-cobranca develop`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `supabase/migrations/0045_dados_pagamento.sql` — **novo**: tabela `dados_bancarios` + coluna `nfse_id`.
- `src/lib/whatsapp/notas-envio.ts` — **novo**: `linhasPagamento`, `competenciaBR`, tipo `DadosPagamento`.
- `src/tests/whatsapp/notas-envio.test.ts` — **novo**: testes dos helpers.
- `src/lib/nfse/danfse-cache.ts` — **novo (refactor)**: `obterDanfsePdf` + helpers de cache/cert.
- `src/app/(app)/clientes/[id]/nfse.ts` — **modificar**: usar `danfse-cache` (remove duplicação).
- `src/app/(app)/configuracoes/pagamento/page.tsx` + `actions.ts` — **novo**: config admin.
- `src/app/(app)/configuracoes/page.tsx` — **modificar**: card no hub.
- `src/app/(app)/nfse/lote/envio.ts` — **novo**: `listarNotasParaEnvio`, `enviarNotaWhatsapp`.
- `src/components/nfse/EnviarNotasWhatsapp.tsx` — **novo**: UI (loop + progresso + reenvio).
- `src/app/(app)/nfse/lote/page.tsx` — **modificar**: incluir o componente.
- `src/tests/nfse/enviar-notas-render.test.tsx` — **novo**: smoke.

---

## Task 1: Migration — `dados_bancarios` + `nfse_id`

**Files:**
- Create: `supabase/migrations/0045_dados_pagamento.sql`

- [ ] **Step 1: Criar a migration**

```sql
create table if not exists dados_bancarios (
  id                int primary key default 1,
  pix_chave         text,
  banco             text,
  agencia           text,
  conta             text,
  titular           text,
  documento         text,
  mensagem_template text not null default
    'Olá {nome}! Segue a sua nota fiscal de serviços (NFS-e), referente ao honorário de {valor} — competência {competencia}.\n\nPara pagamento:\n{pagamento}\n\nSe já efetuou o pagamento, por favor desconsidere. Qualquer dúvida, estamos à disposição!',
  atualizado_em     timestamptz not null default now(),
  constraint dados_bancarios_singleton check (id = 1)
);
alter table dados_bancarios enable row level security;
do $$ begin
  drop policy if exists dados_bancarios_admin on dados_bancarios;
  create policy dados_bancarios_admin on dados_bancarios for all to authenticated
    using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
end $$;

alter table whatsapp_mensagem add column if not exists nfse_id uuid references nfse(id) on delete set null;
create index if not exists idx_wa_msg_nfse on whatsapp_mensagem(nfse_id) where nfse_id is not null;
```

- [ ] **Step 2: Aplicar + verificar**

Run: `npm run db:migrate`
Then:
```bash
node --env-file=.env.local -e "import('./scripts/_db.mjs').then(async({makeClient})=>{const c=makeClient();await c.connect();const t=await c.query(\"select 1 from information_schema.tables where table_name='dados_bancarios'\");const col=await c.query(\"select 1 from information_schema.columns where table_name='whatsapp_mensagem' and column_name='nfse_id'\");console.log('tabela:',t.rowCount,'| nfse_id:',col.rowCount);await c.end();});"
```
Expected: `tabela: 1 | nfse_id: 1`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0045_dados_pagamento.sql
git commit -m "feat(cobranca): dados_bancarios + nfse_id em whatsapp_mensagem

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Helpers puros `linhasPagamento` + `competenciaBR` (TDD)

**Files:**
- Create: `src/lib/whatsapp/notas-envio.ts`
- Test: `src/tests/whatsapp/notas-envio.test.ts`

**Interfaces:**
- Produces:
  - `type DadosPagamento = { pixChave?: string | null; banco?: string | null; agencia?: string | null; conta?: string | null; titular?: string | null; documento?: string | null }`.
  - `linhasPagamento(d: DadosPagamento): string`.
  - `competenciaBR(dataIso: string): string`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/tests/whatsapp/notas-envio.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { linhasPagamento, competenciaBR } from "@/lib/whatsapp/notas-envio";

describe("linhasPagamento", () => {
  it("PIX + TED completo", () => {
    expect(
      linhasPagamento({ pixChave: "12.345.678/0001-90", banco: "Inter", agencia: "0001", conta: "12345-6", titular: "Gomes", documento: "12.345.678/0001-90" }),
    ).toBe("PIX: 12.345.678/0001-90\nTED: Banco Inter, Ag. 0001, Conta 12345-6 — Gomes (12.345.678/0001-90)");
  });
  it("só PIX", () => {
    expect(linhasPagamento({ pixChave: "chave@pix.com" })).toBe("PIX: chave@pix.com");
  });
  it("só TED", () => {
    expect(linhasPagamento({ banco: "Inter", agencia: "1", conta: "9" })).toBe("TED: Banco Inter, Ag. 1, Conta 9");
  });
  it("vazio → string vazia", () => {
    expect(linhasPagamento({})).toBe("");
  });
});

describe("competenciaBR", () => {
  it("YYYY-MM-DD → MM/YYYY", () => {
    expect(competenciaBR("2026-07-01")).toBe("07/2026");
  });
  it("valor inesperado → devolve como veio", () => {
    expect(competenciaBR("abc")).toBe("abc");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- notas-envio`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/lib/whatsapp/notas-envio.ts`**

```ts
export type DadosPagamento = {
  pixChave?: string | null;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  titular?: string | null;
  documento?: string | null;
};

// Monta as linhas de pagamento a partir dos dados preenchidos (omite as vazias).
export function linhasPagamento(d: DadosPagamento): string {
  const linhas: string[] = [];
  if (d.pixChave) linhas.push(`PIX: ${d.pixChave}`);
  const partes = [d.banco && `Banco ${d.banco}`, d.agencia && `Ag. ${d.agencia}`, d.conta && `Conta ${d.conta}`].filter(Boolean);
  if (partes.length) {
    let ted = `TED: ${partes.join(", ")}`;
    if (d.titular) ted += ` — ${d.titular}`;
    if (d.documento) ted += ` (${d.documento})`;
    linhas.push(ted);
  }
  return linhas.join("\n");
}

// "2026-07-01" → "07/2026".
export function competenciaBR(dataIso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(dataIso);
  return m ? `${m[2]}/${m[1]}` : dataIso;
}
```

- [ ] **Step 4: Rodar e ver passar + lint/typecheck**

Run: `npm test -- notas-envio && npm run lint && npm run typecheck`
Expected: PASS, sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/notas-envio.ts src/tests/whatsapp/notas-envio.test.ts
git commit -m "feat(cobranca): helpers linhasPagamento + competenciaBR

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Refactor — `obterDanfsePdf` em lib reutilizável

**Files:**
- Create: `src/lib/nfse/danfse-cache.ts`
- Modify: `src/app/(app)/clientes/[id]/nfse.ts`

**Interfaces:**
- Produces:
  - `caminhoDanfse(chave: string): string`.
  - `guardarDanfseStorage(admin, chave, pdf): Promise<void>`.
  - `carregarCertRowDaNota(admin, emitente, clienteId): Promise<{ pfx_cifrado: string; senha_cifrada: string } | null>`.
  - `type NotaDanfse = { chave_acesso: string; ambiente: string | null; emitente: string; cliente_id: string }`.
  - `obterDanfsePdf(admin, nota: NotaDanfse): Promise<{ pdfBase64?: string; chave?: string; erro?: string }>`.

- [ ] **Step 1: Criar `src/lib/nfse/danfse-cache.ts`**

```ts
import "server-only";
import type { createAdminSupabase } from "@/lib/supabase/admin";
import { required } from "@/lib/env";
import { decifrar } from "@/lib/nfse/cripto";
import { carregarCertificado } from "@/lib/nfse/certificado";
import { baixarDanfsePdf } from "@/lib/nfse/danfse";

type Admin = ReturnType<typeof createAdminSupabase>;

export function caminhoDanfse(chave: string): string {
  return `danfse/${chave}.pdf`;
}

export async function lerDanfseStorage(admin: Admin, chave: string): Promise<Buffer | null> {
  const { data } = await admin.storage.from("documentos").download(caminhoDanfse(chave));
  if (!data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function guardarDanfseStorage(admin: Admin, chave: string, pdf: Buffer): Promise<void> {
  await admin.storage
    .from("documentos")
    .upload(caminhoDanfse(chave), pdf, { contentType: "application/pdf", upsert: true })
    .catch(() => {});
}

export async function carregarCertRowDaNota(
  admin: Admin,
  emitente: string,
  clienteId: string,
): Promise<{ pfx_cifrado: string; senha_cifrada: string } | null> {
  if (emitente === "cliente") {
    const { data } = await admin
      .from("nfse_certificado_cliente")
      .select("pfx_cifrado, senha_cifrada")
      .eq("cliente_id", clienteId)
      .maybeSingle();
    return data ?? null;
  }
  const { data } = await admin.from("nfse_certificado").select("pfx_cifrado, senha_cifrada").eq("id", 1).maybeSingle();
  return data ?? null;
}

export type NotaDanfse = { chave_acesso: string; ambiente: string | null; emitente: string; cliente_id: string };

// Cache-first + ADN. O caller fornece a nota (respeitando o próprio gate/RLS).
export async function obterDanfsePdf(admin: Admin, nota: NotaDanfse): Promise<{ pdfBase64?: string; chave?: string; erro?: string }> {
  const chave = nota.chave_acesso;
  if (!chave) return { erro: "Nota sem chave de acesso." };
  const cache = await lerDanfseStorage(admin, chave);
  if (cache) return { pdfBase64: cache.toString("base64"), chave };
  const certRow = await carregarCertRowDaNota(admin, nota.emitente, nota.cliente_id);
  if (!certRow) return { erro: "Certificado não cadastrado.", chave };
  const chaveKey = required(process.env.NFSE_CERT_KEY, "NFSE_CERT_KEY");
  let cert;
  try {
    const pfx = decifrar(certRow.pfx_cifrado, chaveKey);
    const senha = decifrar(certRow.senha_cifrada, chaveKey).toString("utf8");
    cert = carregarCertificado(pfx, senha);
  } catch {
    return { erro: "Falha ao abrir o certificado.", chave };
  }
  const ambiente: "homologacao" | "producao" = nota.ambiente === "producao" ? "producao" : "homologacao";
  const pdf = await baixarDanfsePdf(chave, { pfx: cert.pfx, senha: cert.senha }, ambiente);
  if (!pdf) return { erro: "DANFSe indisponível no momento.", chave };
  await guardarDanfseStorage(admin, chave, pdf);
  return { pdfBase64: pdf.toString("base64"), chave };
}
```

- [ ] **Step 2: Atualizar `nfse.ts` para usar a lib**

Em `src/app/(app)/clientes/[id]/nfse.ts`:
1. Adicionar import: `import { obterDanfsePdf, guardarDanfseStorage, carregarCertRowDaNota } from "@/lib/nfse/danfse-cache";`
2. **Remover** as definições locais de `caminhoDanfse`, `lerDanfseStorage`, `guardarDanfseStorage` e `carregarCertRowDaNota` (agora vêm da lib).
3. Substituir o corpo de `baixarDanfseNfse` por:

```ts
export async function baixarDanfseNfse(nfseId: string): Promise<{ erro?: string; pdfBase64?: string; chave?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeVerHonorario(perfil.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: nota } = await supabase
    .from("nfse")
    .select("chave_acesso, ambiente, emitente, cliente_id")
    .eq("id", nfseId)
    .maybeSingle();
  if (!nota?.chave_acesso) return { erro: "Nota sem chave de acesso." };
  const admin = createAdminSupabase();
  return obterDanfsePdf(admin, {
    chave_acesso: nota.chave_acesso as string,
    ambiente: nota.ambiente as string | null,
    emitente: nota.emitente as string,
    cliente_id: nota.cliente_id as string,
  });
}
```

(`prefetchDanfse` continua usando `guardarDanfseStorage` importado; o cancelamento continua usando `carregarCertRowDaNota` importado. Não remover os imports de `decifrar`/`carregarCertificado`/`baixarDanfsePdf` — ainda são usados em `prefetchDanfse`/emissão/cancelamento.)

- [ ] **Step 3: Verificar (sem regressão em baixarDanfseNfse)**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: sem erros; rotas de NFS-e compilam. (Se `tsc` acusar `caminhoDanfse` ainda referenciado em `nfse.ts`, importá-lo também da lib.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/nfse/danfse-cache.ts "src/app/(app)/clientes/[id]/nfse.ts"
git commit -m "refactor(nfse): extrai obterDanfsePdf (cache+ADN) para lib reutilizável

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Config `dados_bancarios` (página admin + hub)

**Files:**
- Create: `src/app/(app)/configuracoes/pagamento/page.tsx`
- Create: `src/app/(app)/configuracoes/pagamento/actions.ts`
- Modify: `src/app/(app)/configuracoes/page.tsx`

- [ ] **Step 1: Action `salvarDadosPagamento`**

Criar `src/app/(app)/configuracoes/pagamento/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type EstadoPagamento = { ok?: boolean; erro?: string };

export async function salvarDadosPagamento(_prev: EstadoPagamento, formData: FormData): Promise<EstadoPagamento> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || perfil.papel !== "admin") return { erro: "Sem permissão." };
  const s = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const template = String(formData.get("mensagem_template") ?? "").trim();
  if (!template) return { erro: "O template da mensagem não pode ficar vazio." };
  const admin = createAdminSupabase();
  const { error } = await admin.from("dados_bancarios").upsert(
    {
      id: 1,
      pix_chave: s("pix_chave"),
      banco: s("banco"),
      agencia: s("agencia"),
      conta: s("conta"),
      titular: s("titular"),
      documento: s("documento"),
      mensagem_template: template,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath("/configuracoes/pagamento");
  return { ok: true };
}
```

- [ ] **Step 2: Página de config**

Criar `src/app/(app)/configuracoes/pagamento/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDadosPagamento } from "@/components/nfse/FormDadosPagamento";

export default async function ConfigPagamentoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const admin = createAdminSupabase();
  const { data } = await admin.from("dados_bancarios").select("*").eq("id", 1).maybeSingle();
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4">
      <PageHeader titulo="Dados de pagamento" subtitulo="PIX e dados bancários enviados ao cliente com a NFS-e" />
      <FormDadosPagamento inicial={data ?? null} />
    </main>
  );
}
```

Criar `src/components/nfse/FormDadosPagamento.tsx`:

```tsx
"use client";
import { useActionState } from "react";
import { salvarDadosPagamento, type EstadoPagamento } from "@/app/(app)/configuracoes/pagamento/actions";

type Dados = {
  pix_chave?: string | null; banco?: string | null; agencia?: string | null;
  conta?: string | null; titular?: string | null; documento?: string | null; mensagem_template?: string | null;
} | null;

const cls = "w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto focus:border-verde";

export function FormDadosPagamento({ inicial }: { inicial: Dados }) {
  const [estado, action, pend] = useActionState<EstadoPagamento, FormData>(salvarDadosPagamento, {});
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-linha bg-white p-5 text-sm">
      <label className="block text-cinza">Chave PIX
        <input name="pix_chave" defaultValue={inicial?.pix_chave ?? ""} className={cls} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-cinza">Banco<input name="banco" defaultValue={inicial?.banco ?? ""} className={cls} /></label>
        <label className="block text-cinza">Agência<input name="agencia" defaultValue={inicial?.agencia ?? ""} className={cls} /></label>
        <label className="block text-cinza">Conta<input name="conta" defaultValue={inicial?.conta ?? ""} className={cls} /></label>
        <label className="block text-cinza">Titular<input name="titular" defaultValue={inicial?.titular ?? ""} className={cls} /></label>
      </div>
      <label className="block text-cinza">CNPJ/Documento do titular
        <input name="documento" defaultValue={inicial?.documento ?? ""} className={cls} />
      </label>
      <label className="block text-cinza">Mensagem (use {"{nome} {valor} {competencia} {pagamento}"})
        <textarea name="mensagem_template" rows={6} defaultValue={inicial?.mensagem_template ?? ""} className={cls} required />
      </label>
      {estado.erro && <p className="text-negativo">{estado.erro}</p>}
      {estado.ok && <p className="text-verde">Salvo ✓</p>}
      <button type="submit" disabled={pend} className="rounded-lg bg-verde px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
        {pend ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Card no hub `/configuracoes`**

Em `src/app/(app)/configuracoes/page.tsx`, adicionar ao array `ITENS`:

```ts
  { href: "/configuracoes/pagamento", label: "Dados de pagamento (PIX/TED)", desc: "Conta e PIX enviados ao cliente com a NFS-e." },
```

- [ ] **Step 4: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: rotas `/configuracoes/pagamento` compilam.

```bash
git add "src/app/(app)/configuracoes/pagamento" src/components/nfse/FormDadosPagamento.tsx "src/app/(app)/configuracoes/page.tsx"
git commit -m "feat(cobranca): config de dados de pagamento (PIX/TED) no hub Configurações

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Actions de envio (`listarNotasParaEnvio`, `enviarNotaWhatsapp`)

**Files:**
- Create: `src/app/(app)/nfse/lote/envio.ts`

**Interfaces:**
- Consumes: `obterDanfsePdf`, `caminhoDanfse` (Task 3); `linhasPagamento`, `competenciaBR` (Task 2); `aplicarTemplate`, `normalizarTelefone` (`mensagem.ts`); `enviarMidiaZapi` (`zapi.ts`); `formatarMoeda` (`format.ts`); `listarNotasAutorizadasPorCompetencia` (`nfse.ts`).
- Produces: `listarNotasParaEnvio`, `enviarNotaWhatsapp`, `type ResultadoEnvioNota`.

- [ ] **Step 1: Criar `src/app/(app)/nfse/lote/envio.ts`**

```ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { decifrar } from "@/lib/nfse/cripto";
import { enviarMidiaZapi } from "@/lib/whatsapp/zapi";
import { normalizarTelefone, aplicarTemplate } from "@/lib/whatsapp/mensagem";
import { linhasPagamento, competenciaBR } from "@/lib/whatsapp/notas-envio";
import { obterDanfsePdf, caminhoDanfse } from "@/lib/nfse/danfse-cache";
import { formatarMoeda } from "@/lib/format";
import { listarNotasAutorizadasPorCompetencia } from "@/app/(app)/clientes/[id]/nfse";

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeVerHonorario(p.papel) ? p : null;
}

export async function listarNotasParaEnvio(competencia: string): Promise<{ nfseId: string; razaoSocial: string }[]> {
  if (!(await gate())) return [];
  const notas = await listarNotasAutorizadasPorCompetencia(competencia);
  return notas.map((n) => ({ nfseId: n.nfseId, razaoSocial: n.razaoSocial }));
}

export type ResultadoEnvioNota = { status: "ok" | "pulado" | "erro"; motivo?: string; razaoSocial: string };

export async function enviarNotaWhatsapp(nfseId: string): Promise<ResultadoEnvioNota> {
  const perfil = await gate();
  if (!perfil) return { status: "erro", motivo: "Sem permissão.", razaoSocial: "" };
  const admin = createAdminSupabase();
  const { data: nota } = await admin
    .from("nfse")
    .select("id, cliente_id, valor, competencia, chave_acesso, ambiente, emitente, clientes(razao_social, telefone, clientes_financeiro(cobranca_whatsapp))")
    .eq("id", nfseId)
    .maybeSingle();
  const cl = nota
    ? ((Array.isArray(nota.clientes) ? nota.clientes[0] : nota.clientes) as
        | { razao_social?: string; telefone?: string; clientes_financeiro?: { cobranca_whatsapp?: boolean } | { cobranca_whatsapp?: boolean }[] }
        | null)
    : null;
  const razaoSocial = cl?.razao_social ?? "";
  if (!nota) return { status: "erro", motivo: "Nota não encontrada.", razaoSocial };
  const fin = Array.isArray(cl?.clientes_financeiro) ? cl?.clientes_financeiro[0] : cl?.clientes_financeiro;
  if (fin?.cobranca_whatsapp === false) return { status: "pulado", motivo: "Sem cobrança WhatsApp.", razaoSocial };
  const tel = normalizarTelefone(cl?.telefone ?? "");
  if (!tel) return { status: "pulado", motivo: "Cliente sem telefone.", razaoSocial };

  const { data: ja } = await admin
    .from("whatsapp_mensagem")
    .select("id")
    .eq("nfse_id", nfseId)
    .eq("status", "ENVIADO")
    .limit(1)
    .maybeSingle();
  if (ja) return { status: "pulado", motivo: "Já enviada.", razaoSocial };

  const chave = process.env.WHATSAPP_CRIPTO_KEY;
  const { data: cfg } = await admin
    .from("whatsapp_config")
    .select("instance, token_cifrado, client_token_cifrado")
    .eq("id", 1)
    .maybeSingle();
  if (!chave || !cfg?.instance || !cfg.token_cifrado || !cfg.client_token_cifrado)
    return { status: "erro", motivo: "WhatsApp não configurado.", razaoSocial };
  const zapi = {
    instance: cfg.instance,
    token: decifrar(cfg.token_cifrado, chave).toString("utf8"),
    clientToken: decifrar(cfg.client_token_cifrado, chave).toString("utf8"),
  };

  const { data: dados } = await admin
    .from("dados_bancarios")
    .select("pix_chave, banco, agencia, conta, titular, documento, mensagem_template")
    .eq("id", 1)
    .maybeSingle();
  const template =
    dados?.mensagem_template ??
    "Olá {nome}! Segue a sua NFS-e — honorário de {valor}, competência {competencia}.\n\n{pagamento}";

  const pdfR = await obterDanfsePdf(admin, {
    chave_acesso: nota.chave_acesso as string,
    ambiente: nota.ambiente as string | null,
    emitente: nota.emitente as string,
    cliente_id: nota.cliente_id as string,
  });
  if (!pdfR.pdfBase64) return { status: "erro", motivo: pdfR.erro ?? "DANFSe indisponível.", razaoSocial };

  const pagamento = linhasPagamento({
    pixChave: dados?.pix_chave,
    banco: dados?.banco,
    agencia: dados?.agencia,
    conta: dados?.conta,
    titular: dados?.titular,
    documento: dados?.documento,
  });
  const texto = aplicarTemplate(template, {
    nome: razaoSocial,
    valor: formatarMoeda(Number(nota.valor)),
    competencia: competenciaBR(String(nota.competencia)),
    pagamento,
    pix: dados?.pix_chave ?? "",
    banco: dados?.banco ?? "",
    agencia: dados?.agencia ?? "",
    conta: dados?.conta ?? "",
    titular: dados?.titular ?? "",
    documento: dados?.documento ?? "",
  });

  const nomeArq = `NFS-e ${razaoSocial}.pdf`;
  const r = await enviarMidiaZapi(zapi, tel, { tipo: "document", base64: pdfR.pdfBase64, mime: "application/pdf", nome: nomeArq, caption: texto });
  const resp = (r.resposta ?? {}) as { messageId?: string; id?: string };
  await admin.from("whatsapp_mensagem").insert({
    cliente_id: nota.cliente_id,
    telefone: tel,
    texto,
    status: r.ok ? "ENVIADO" : "ERRO",
    direcao: "OUT",
    lida: true,
    resposta: (r.resposta ?? r.erro) as object,
    criado_por: perfil.id,
    z_message_id: r.ok ? (resp.messageId ?? resp.id ?? null) : null,
    nfse_id: nfseId,
    midia_tipo: "document",
    midia_path: caminhoDanfse(pdfR.chave as string),
    midia_nome: nomeArq,
    midia_mime: "application/pdf",
  });
  return r.ok ? { status: "ok", razaoSocial } : { status: "erro", motivo: r.erro ?? "Falha no envio.", razaoSocial };
}
```

- [ ] **Step 2: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: sem erros.

```bash
git add "src/app/(app)/nfse/lote/envio.ts"
git commit -m "feat(cobranca): actions listarNotasParaEnvio + enviarNotaWhatsapp

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: UI — painel "Enviar notas + cobrança do mês"

**Files:**
- Create: `src/components/nfse/EnviarNotasWhatsapp.tsx`
- Modify: `src/app/(app)/nfse/lote/page.tsx`
- Test: `src/tests/nfse/enviar-notas-render.test.tsx`

**Interfaces:**
- Consumes: `listarNotasParaEnvio`, `enviarNotaWhatsapp` (Task 5).

- [ ] **Step 1: Smoke test (mockando as actions server-only)**

Criar `src/tests/nfse/enviar-notas-render.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/(app)/nfse/lote/envio", () => ({
  listarNotasParaEnvio: vi.fn(),
  enviarNotaWhatsapp: vi.fn(),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { EnviarNotasWhatsapp } from "@/components/nfse/EnviarNotasWhatsapp";

describe("EnviarNotasWhatsapp", () => {
  it("renderiza sem lançar", () => {
    const html = renderToStaticMarkup(<EnviarNotasWhatsapp />);
    expect(html).toContain("Enviar notas");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- enviar-notas-render`
Expected: FAIL (componente inexistente).

- [ ] **Step 3: Criar `src/components/nfse/EnviarNotasWhatsapp.tsx`**

```tsx
"use client";
import { useRef, useState } from "react";
import { listarNotasParaEnvio, enviarNotaWhatsapp } from "@/app/(app)/nfse/lote/envio";
import { Botao } from "@/components/ui/Botao";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Nota = { nfseId: string; razaoSocial: string };

export function EnviarNotasWhatsapp() {
  const [mes, setMes] = useState("");
  const [notas, setNotas] = useState<Nota[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [prog, setProg] = useState({ feitas: 0, total: 0, ok: 0, pulados: 0, erros: 0 });
  const [falhas, setFalhas] = useState<Nota[]>([]);
  const pararRef = useRef(false);
  const competencia = mes ? `${mes}-01` : "";

  async function verificar() {
    if (!competencia) return;
    setCarregando(true);
    setNotas(null);
    setFalhas([]);
    setNotas(await listarNotasParaEnvio(competencia));
    setCarregando(false);
  }

  async function enviar(alvo?: Nota[]) {
    const lista = alvo ?? notas ?? [];
    if (lista.length === 0) return;
    if (!alvo && !confirm(`Enviar a NFS-e + cobrança para ${lista.length} cliente(s) por WhatsApp?`)) return;
    setEnviando(true);
    pararRef.current = false;
    setFalhas([]);
    setProg({ feitas: 0, total: lista.length, ok: 0, pulados: 0, erros: 0 });
    const falhou: Nota[] = [];
    for (const n of lista) {
      if (pararRef.current) break;
      const r = await enviarNotaWhatsapp(n.nfseId);
      if (r.status === "erro") falhou.push(n);
      setProg((p) => ({
        feitas: p.feitas + 1,
        total: p.total,
        ok: p.ok + (r.status === "ok" ? 1 : 0),
        pulados: p.pulados + (r.status === "pulado" ? 1 : 0),
        erros: p.erros + (r.status === "erro" ? 1 : 0),
      }));
      await sleep(400); // gentil com o Z-API
    }
    setFalhas(falhou);
    setEnviando(false);
  }

  return (
    <div className="space-y-3 rounded-2xl border border-linha bg-white p-5 text-sm">
      <div>
        <h2 className="font-display text-sm font-semibold text-texto">Enviar notas + cobrança do mês (WhatsApp)</h2>
        <p className="text-xs text-cinza">
          Envia para cada cliente com NFS-e autorizada a nota (PDF) + os dados de pagamento (PIX/TED). Não reenvia quem
          já recebeu. Configure os dados em <strong>Configurações → Dados de pagamento</strong>.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-cinza">
          Competência
          <input
            type="month"
            value={mes}
            onChange={(e) => {
              setMes(e.target.value);
              setNotas(null);
              setFalhas([]);
            }}
            className="ml-2 rounded-lg border border-linha bg-white px-3 py-1.5 text-sm text-texto focus:border-verde"
          />
        </label>
        <Botao variante="secundario" onClick={verificar} disabled={!competencia || carregando || enviando}>
          {carregando ? "Verificando…" : "Verificar"}
        </Botao>
        {notas !== null && !enviando && (
          <Botao variante="primario" onClick={() => enviar()} disabled={notas.length === 0}>
            Enviar {notas.length} nota(s)
          </Botao>
        )}
        {enviando && (
          <>
            <span className="text-cinza">
              Enviando {prog.feitas}/{prog.total}… (✓ {prog.ok} · ⤼ {prog.pulados} · ✗ {prog.erros})
            </span>
            <Botao variante="fantasma" onClick={() => (pararRef.current = true)}>
              Parar
            </Botao>
          </>
        )}
      </div>
      {notas?.length === 0 && !enviando && <p className="text-cinza-claro">Nenhuma nota autorizada nessa competência.</p>}
      {falhas.length > 0 && !enviando && (
        <div className="space-y-2 rounded-lg border border-negativo/30 bg-negativo/10 px-3 py-2 text-xs text-negativo">
          <p className="font-medium">{falhas.length} não enviada(s) (erro). Reenvie para tentar de novo:</p>
          <ul className="list-disc pl-4">
            {falhas.map((n) => (
              <li key={n.nfseId}>{n.razaoSocial}</li>
            ))}
          </ul>
          <Botao variante="primario" onClick={() => enviar(falhas)}>
            Reenviar as {falhas.length} que falharam
          </Botao>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Incluir na tela `/nfse/lote`**

Em `src/app/(app)/nfse/lote/page.tsx`: importar e adicionar após `<BaixarNotasZip />`:

```tsx
import { EnviarNotasWhatsapp } from "@/components/nfse/EnviarNotasWhatsapp";
```
```tsx
      <BaixarNotasZip />
      <EnviarNotasWhatsapp />
```

- [ ] **Step 5: Suite completa**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tudo verde; smoke passa; rota `/nfse/lote` compila.

- [ ] **Step 6: Commit**

```bash
git add src/components/nfse/EnviarNotasWhatsapp.tsx "src/app/(app)/nfse/lote/page.tsx" src/tests/nfse/enviar-notas-render.test.tsx
git commit -m "feat(cobranca): painel 'Enviar notas + cobrança do mês' com progresso e reenvio

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: CHANGELOG + finalizar branch

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG**

Sob `## [Não lançado]` → `### Adicionado`:

```markdown
- **Cobrança — envio de notas + PIX/TED (WhatsApp):** na tela de NFS-e em lote, botão "Enviar notas +
  cobrança do mês" dispara, por cliente, a NFS-e (PDF) + a mensagem com dados de pagamento (PIX/TED),
  com progresso e reenvio das falhas; não reenvia quem já recebeu e respeita o opt-out de cobrança.
  Dados bancários configuráveis em Configurações → Dados de pagamento.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog do envio de notas + cobrança PIX/TED

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: Finalizar a branch**

Usar `superpowers:finishing-a-development-branch`.

> **Pós-deploy (usuário):** Configurações → Dados de pagamento → preencher PIX + banco/agência/conta/
> titular/documento + revisar o template → Salvar. Depois, NFS-e em lote → competência → Verificar →
> Enviar. Testar primeiro com uma competência pequena.

---

## Self-Review

- **Cobertura do spec:** tabela `dados_bancarios` + `nfse_id` (T1) ✓; `linhasPagamento`/`competenciaBR` (T2) ✓; `obterDanfsePdf` reutilizável (T3) ✓; config admin + hub (T4) ✓; `listarNotasParaEnvio`/`enviarNotaWhatsapp` com dedup/opt-out/DANFSe/mensagem (T5) ✓; UI progresso + reenvio (T6) ✓; CHANGELOG (T7) ✓.
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Consistência de tipos:** `DadosPagamento`/`linhasPagamento`/`competenciaBR` (T2) usados no T5; `obterDanfsePdf`/`caminhoDanfse`/`NotaDanfse` (T3) usados em T3 (nfse.ts) e T5; colunas `dados_bancarios.*` e `whatsapp_mensagem.nfse_id` (T1) usadas em T4/T5; `ResultadoEnvioNota.status` (`ok`/`pulado`/`erro`) do T5 consumido pela UI (T6). `enviarMidiaZapi` (Fatia B) e `aplicarTemplate`/`normalizarTelefone` (mensagem.ts) já existem.
- **Nota de segurança:** o motor lê `dados_bancarios`/`whatsapp_config` via `service_role` (bypassa RLS) — coerente com `regua-motor.ts`. A tela de config é admin; as actions de envio gateiam `podeVerHonorario`.
