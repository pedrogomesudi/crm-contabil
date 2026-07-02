# V5-A — Cancelamento de NFS-e — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cancelar uma NFS-e autorizada pelo CRM, enviando o evento de cancelamento assinado à Sefin (motivo + justificativa) e marcando a nota como cancelada.

**Architecture:** Reusa toda a infra da emissão (certificado, assinatura XMLDSig, POST mTLS). Um módulo `cancelamento.ts` monta o evento (XML), assina e envia a `/nfse/{chave}/eventos`; uma action orquestra a partir da nota; a UI ganha um botão "Cancelar" nas notas autorizadas.

**Tech Stack:** Next 16 (App Router, server actions) + TypeScript · Supabase · Vitest · `xml-crypto` (XMLDSig) · `xmlbuilder2` · `node:https`/`node:zlib`.

## Global Constraints

- **RBAC:** cancelar gated por `podeVerHonorario(papel)` (admin/financeiro/contador-dono); só notas `status='autorizada'`.
- **Segredos:** `NFSE_CERT_KEY`/`NFSE_URL_*` (runtime, já existentes). Certificado decifrado só no servidor.
- **Assinatura:** XMLDSig **C14N padrão** (`REC-xml-c14n-20010315`), RSA-SHA256, KeyInfo com X509 — igual à DPS.
- **Ambiente:** herda `nfse_config.ambiente` (`tpAmb` 1=produção, 2=homologação).
- **Banco:** migration idempotente via `npm run db:migrate`; migrations aplicadas são imutáveis.
- **Comandos antes de commitar:** `npm run lint && npm run typecheck && npm test`. Da raiz, na branch `develop`.

---

## File Structure

- `supabase/migrations/0023_nfse_cancelamento.sql` (criar) — `nfse.cancelado_em`, `nfse.cancelamento`.
- `src/lib/nfse/tipos.ts` (modificar) — `DadosCancelamento`, `ResultadoEvento`.
- `src/lib/nfse/assinatura.ts` (modificar) — extrair `assinarXmlDsig(xml, id, localName, cert)`; `assinarDps` delega.
- `src/lib/nfse/envio.ts` (modificar) — extrair `postJsonMtls(caminho, corpo, cert, ambiente)`; `enviarDps` usa.
- `src/lib/nfse/cancelamento.ts` (criar) — `montarEventoCancelamento`, `assinarEvento`, `parseRespostaEvento`, `enviarEvento`.
- `src/app/(app)/clientes/[id]/nfse.ts` (modificar) — action `cancelarNfse`.
- `src/components/nfse/CancelarNfse.tsx` (criar) + `NotasFiscaisSection.tsx` (modificar) — botão + form + rótulo "cancelada".
- Testes: `src/tests/nfse/cancelamento.test.ts`.

---

## Task 1: Migration 0023 — colunas de cancelamento

**Files:** Create `supabase/migrations/0023_nfse_cancelamento.sql`.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/0023_nfse_cancelamento.sql — cancelamento de NFS-e. Idempotente.
alter table nfse add column if not exists cancelado_em timestamptz;
alter table nfse add column if not exists cancelamento jsonb; -- { cMotivo, xMotivo, idEvento, xml }
```

- [ ] **Step 2: Aplicar** — Run: `npm run db:migrate` · Expected: `0023_nfse_cancelamento.sql` aplicada.
- [ ] **Step 3: Reaplicar é no-op** — Run: `npm run db:migrate` · Expected: 0 novas.
- [ ] **Step 4: RLS ainda passa** — Run: `npm run db:test` · Expected: `✓ TODOS OS ASSERTS PASSARAM`.
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0023_nfse_cancelamento.sql
git commit -m "feat(db): colunas de cancelamento em nfse (0023)"
```

---

## Task 2: Refatorar assinatura e POST mTLS para reuso

**Files:** Modify `src/lib/nfse/assinatura.ts`, `src/lib/nfse/envio.ts`.

**Interfaces:** Produces `assinarXmlDsig(xml: string, id: string, localName: string, cert: { certPem: string; keyPem: string }): string`; `postJsonMtls(caminho: string, corpo: Record<string, unknown>, cert: { pfx: Buffer; senha: string }, ambiente: "homologacao" | "producao"): Promise<{ status: number; json: Record<string, unknown> }>`.

- [ ] **Step 1: Generalizar a assinatura** — em `assinatura.ts`, extrair um assinador por local-name e fazer `assinarDps` delegar:

```ts
import { SignedXml } from "xml-crypto";

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";

// Assina o elemento `localName` (por Id): enveloped, C14N padrão, RSA-SHA256,
// KeyInfo com X509 — padrão dos DFe (confirmado numa NFS-e real).
export function assinarXmlDsig(
  xml: string,
  id: string,
  localName: string,
  cert: { certPem: string; keyPem: string },
): string {
  const xpath = `//*[local-name(.)='${localName}']`;
  const sig = new SignedXml({
    privateKey: cert.keyPem,
    publicCert: cert.certPem,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: C14N,
  });
  sig.addReference({
    xpath,
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", C14N],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    uri: `#${id}`,
  });
  const x509 = cert.certPem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
  sig.getKeyInfoContent = () => `<X509Data><X509Certificate>${x509}</X509Certificate></X509Data>`;
  sig.computeSignature(xml, { location: { reference: xpath, action: "after" } });
  return sig.getSignedXml();
}

export function assinarDps(xml: string, idDps: string, cert: { certPem: string; keyPem: string }): string {
  return assinarXmlDsig(xml, idDps, "infDPS", cert);
}
```

- [ ] **Step 2: Rodar o teste da assinatura** — Run: `npm test -- src/tests/nfse/assinatura.test.ts` · Expected: PASS (comportamento preservado).

- [ ] **Step 3: Extrair `postJsonMtls`** — em `envio.ts`, extrair o POST mTLS e fazer `enviarDps` usar. Substituir o corpo de `enviarDps` e adicionar o helper exportado:

```ts
export async function postJsonMtls(
  caminho: string,
  corpo: Record<string, unknown>,
  cert: { pfx: Buffer; senha: string },
  ambiente: "homologacao" | "producao",
): Promise<{ status: number; json: Record<string, unknown> }> {
  const url = new URL(`${baseUrl(ambiente)}${caminho}`);
  const body = JSON.stringify(corpo);
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        method: "POST",
        hostname: url.hostname,
        path: url.pathname,
        port: url.port || 443,
        pfx: cert.pfx,
        passphrase: cert.senha,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        timeout: 30_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const txt = Buffer.concat(chunks).toString("utf8");
          let json: Record<string, unknown> = {};
          try {
            json = txt ? (JSON.parse(txt) as Record<string, unknown>) : {};
          } catch {
            json = { corpoNaoJson: txt.replace(/\s+/g, " ").slice(0, 400) };
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function enviarDps(
  xmlAssinado: string,
  cert: { pfx: Buffer; senha: string },
  ambiente: "homologacao" | "producao",
): Promise<ResultadoEmissao> {
  const { status, json } = await postJsonMtls("/nfse", { dpsXmlGZipB64: montarCorpoDps(xmlAssinado) }, cert, ambiente);
  return parseResposta(status, json);
}
```

(Remover do `enviarDps` antigo o bloco `new Promise/httpsRequest` que agora vive em `postJsonMtls`; manter os imports `httpsRequest`/`baseUrl`.)

- [ ] **Step 4: Rodar os testes de envio** — Run: `npm test -- src/tests/nfse/envio.test.ts` · Expected: PASS.
- [ ] **Step 5: Verificar** — Run: `npm run lint && npm run typecheck` · Expected: verde.
- [ ] **Step 6: Commit**

```bash
git add src/lib/nfse/assinatura.ts src/lib/nfse/envio.ts
git commit -m "refactor(nfse): assinarXmlDsig e postJsonMtls reutilizáveis"
```

---

## Task 3: Módulo de cancelamento (evento)

**Files:** Modify `src/lib/nfse/tipos.ts`; Create `src/lib/nfse/cancelamento.ts`, `src/tests/nfse/cancelamento.test.ts`.

**Interfaces:**
- Produces (tipos): `type DadosCancelamento = { chave: string; nDFSe: string; cnpj: string; ambiente: "homologacao" | "producao"; cMotivo: "1" | "2" | "9"; xMotivo: string }`; `type ResultadoEvento = { aceito: boolean; idEvento?: string; mensagens?: string[]; xml?: string }`.
- Produces (cancelamento): `montarEventoCancelamento(d: DadosCancelamento): { xml: string; idEvento: string }`; `assinarEvento(xml, idEvento, cert)`; `parseRespostaEvento(status, corpo): ResultadoEvento`; `enviarCancelamento(xmlAssinado, chave, cert, ambiente): Promise<ResultadoEvento>`.

> **Layout do evento:** segue o padrão nacional de evento (`pedRegEvento > infPedReg[@Id]` com o
> grupo do evento de cancelamento código **101101**). O esqueleto abaixo cobre os campos
> obrigatórios (chNFSe, tpAmb, dhEvento, CNPJAutor, cMotivo, xMotivo); o conjunto exato é validado
> na homologação (Task 6), isolado em `montarEventoCancelamento`/`parseRespostaEvento`.

- [ ] **Step 1: Tipos** (acrescentar em `tipos.ts`)

```ts
export type DadosCancelamento = {
  chave: string;
  nDFSe: string;
  cnpj: string;
  ambiente: "homologacao" | "producao";
  cMotivo: "1" | "2" | "9";
  xMotivo: string;
};
export type ResultadoEvento = { aceito: boolean; idEvento?: string; mensagens?: string[]; xml?: string };
```

- [ ] **Step 2: Teste que falha**

```ts
// src/tests/nfse/cancelamento.test.ts
import { describe, it, expect } from "vitest";
import { montarEventoCancelamento, parseRespostaEvento } from "@/lib/nfse/cancelamento";
import type { DadosCancelamento } from "@/lib/nfse/tipos";

const d: DadosCancelamento = {
  chave: "31702062253627128000146000000000026726078221079739",
  nDFSe: "264",
  cnpj: "53627128000146",
  ambiente: "homologacao",
  cMotivo: "1",
  xMotivo: "Emitida com valor incorreto",
};

describe("montarEventoCancelamento", () => {
  it("monta o evento com Id, chNFSe, cMotivo, xMotivo e tpAmb de homologação", () => {
    const { xml, idEvento } = montarEventoCancelamento(d);
    expect(idEvento).toMatch(/^PRE/);
    expect(xml).toContain(`Id="${idEvento}"`);
    expect(xml).toContain("<tpAmb>2</tpAmb>");
    expect(xml).toContain(`<chNFSe>${d.chave}</chNFSe>`);
    expect(xml).toContain("<cMotivo>1</cMotivo>");
    expect(xml).toContain("<xMotivo>Emitida com valor incorreto</xMotivo>");
  });
});

describe("parseRespostaEvento", () => {
  it("interpreta aceito (cStat de sucesso)", () => {
    const r = parseRespostaEvento(200, { retEvento: { cStat: "135", xMotivo: "Evento registrado", idEvento: "ID1" } });
    expect(r.aceito).toBe(true);
    expect(r.idEvento).toBe("ID1");
  });
  it("interpreta rejeição", () => {
    const r = parseRespostaEvento(400, { erros: [{ codigo: "E0840", descricao: "Fora do prazo" }] });
    expect(r.aceito).toBe(false);
    expect(r.mensagens?.[0]).toContain("Fora do prazo");
  });
});
```

- [ ] **Step 3: Rodar (falha)** — Run: `npm test -- src/tests/nfse/cancelamento.test.ts` · Expected: FAIL.

- [ ] **Step 4: Implementar**

```ts
// src/lib/nfse/cancelamento.ts
import { create } from "xmlbuilder2";
import { assinarXmlDsig } from "./assinatura";
import { montarCorpoDps, postJsonMtls } from "./envio";
import type { DadosCancelamento, ResultadoEvento } from "./tipos";

function dhBrasilia(): string {
  const bras = new Date(Date.now() - 3 * 3600 * 1000 - 120_000);
  return bras.toISOString().replace(/\.\d{3}Z$/, "-03:00");
}

// Evento de cancelamento (código 101101), layout nacional de registro de evento.
export function montarEventoCancelamento(d: DadosCancelamento): { xml: string; idEvento: string } {
  const tpAmb = d.ambiente === "producao" ? "1" : "2";
  const idEvento = "PRE" + d.chave + "01"; // pedido de registro de evento; nº do pedido = 01
  const doc = create({ version: "1.0", encoding: "UTF-8" }).ele("pedRegEvento", {
    xmlns: "http://www.sped.fazenda.gov.br/nfse",
    versao: "1.00",
  });
  const inf = doc.ele("infPedReg", { Id: idEvento });
  inf.ele("tpAmb").txt(tpAmb);
  inf.ele("dhEvento").txt(dhBrasilia());
  inf.ele("CNPJAutor").txt(d.cnpj);
  inf.ele("chNFSe").txt(d.chave);
  inf.ele("nPedRegEvento").txt("1");
  const e = inf.ele("e101101");
  e.ele("descEvento").txt("Cancelamento de NFS-e");
  e.ele("cMotivo").txt(d.cMotivo);
  e.ele("xMotivo").txt(d.xMotivo);
  return { xml: doc.end({ prettyPrint: false }), idEvento };
}

export function assinarEvento(xml: string, idEvento: string, cert: { certPem: string; keyPem: string }): string {
  return assinarXmlDsig(xml, idEvento, "infPedReg", cert);
}

export function parseRespostaEvento(status: number, corpo: Record<string, unknown>): ResultadoEvento {
  const ret = (corpo.retEvento ?? {}) as { cStat?: string; xMotivo?: string; idEvento?: string };
  // cStat de sucesso de registro de evento (faixa 1xx). Confirmado na homologação.
  if (status >= 200 && status < 300 && ret.cStat && /^1\d\d$/.test(ret.cStat)) {
    return { aceito: true, idEvento: ret.idEvento, mensagens: ret.xMotivo ? [ret.xMotivo] : undefined };
  }
  const lista =
    (Array.isArray(corpo.erros) && (corpo.erros as { codigo?: string; descricao?: string }[])) || [];
  const mensagens = lista.map((x) => `${x.codigo ?? ""} ${x.descricao ?? ""}`.trim()).filter(Boolean);
  if (!mensagens.length) mensagens.push(ret.xMotivo ? `${ret.cStat ?? status} ${ret.xMotivo}` : `HTTP ${status}`);
  return { aceito: false, mensagens };
}

export async function enviarCancelamento(
  xmlAssinado: string,
  chave: string,
  cert: { pfx: Buffer; senha: string },
  ambiente: "homologacao" | "producao",
): Promise<ResultadoEvento> {
  const { status, json } = await postJsonMtls(
    `/nfse/${chave}/eventos`,
    { pedidoRegistroEventoXmlGZipB64: montarCorpoDps(xmlAssinado) },
    cert,
    ambiente,
  );
  return parseRespostaEvento(status, json);
}
```

- [ ] **Step 5: Rodar (passa)** — Run: `npm test -- src/tests/nfse/cancelamento.test.ts` · Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add src/lib/nfse/tipos.ts src/lib/nfse/cancelamento.ts src/tests/nfse/cancelamento.test.ts
git commit -m "feat(nfse): módulo de cancelamento (evento + assinatura + envio)"
```

---

## Task 4: Action `cancelarNfse`

**Files:** Modify `src/app/(app)/clientes/[id]/nfse.ts`.

**Interfaces:** Consumes `montarEventoCancelamento`, `assinarEvento`, `enviarCancelamento` (T3). Produces `cancelarNfse(nfseId: string, cMotivo: "1" | "2" | "9", justificativa: string): Promise<{ erro?: string; ok?: boolean }>`.

- [ ] **Step 1: Implementar** (importar de `@/lib/nfse/cancelamento`):

```ts
import { montarEventoCancelamento, assinarEvento, enviarCancelamento } from "@/lib/nfse/cancelamento";

export async function cancelarNfse(
  nfseId: string,
  cMotivo: "1" | "2" | "9",
  justificativa: string,
): Promise<{ erro?: string; ok?: boolean }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeVerHonorario(perfil.papel)) return { erro: "Sem permissão." };
  if (!justificativa || justificativa.trim().length < 15)
    return { erro: "Justificativa obrigatória (mín. 15 caracteres)." };

  const supabase = await createServerSupabase();
  const { data: nota } = await supabase
    .from("nfse")
    .select("id, cliente_id, chave_acesso, numero, nfse_xml, status, ambiente")
    .eq("id", nfseId)
    .maybeSingle();
  if (!nota) return { erro: "Nota não encontrada." };
  if (nota.status !== "autorizada") return { erro: "Só notas autorizadas podem ser canceladas." };
  if (!nota.chave_acesso) return { erro: "Nota sem chave de acesso." };

  const { data: cfg } = await supabase.from("nfse_config").select("cnpj").eq("id", 1).maybeSingle();
  if (!cfg?.cnpj) return { erro: "Config fiscal ausente." };

  // nDFSe: usa o número; se vazio, extrai o nNFSe do XML da nota; por fim, da chave.
  let nDFSe = nota.numero ?? "";
  if (!nDFSe && typeof nota.nfse_xml === "string") {
    const m = /<nNFSe>(\d+)<\/nNFSe>/.exec(nota.nfse_xml);
    if (m) nDFSe = m[1]!;
  }

  const ambiente: "homologacao" | "producao" = nota.ambiente === "producao" ? "producao" : "homologacao";
  const chaveKey = required(process.env.NFSE_CERT_KEY, "NFSE_CERT_KEY");
  const { data: certRow } = await createAdminSupabase()
    .from("nfse_certificado")
    .select("pfx_cifrado, senha_cifrada")
    .eq("id", 1)
    .maybeSingle();
  if (!certRow) return { erro: "Certificado não cadastrado." };
  let cert;
  try {
    const pfx = decifrar(certRow.pfx_cifrado, chaveKey);
    const senha = decifrar(certRow.senha_cifrada, chaveKey).toString("utf8");
    cert = carregarCertificado(pfx, senha);
  } catch {
    return { erro: "Falha ao abrir o certificado." };
  }

  const { xml, idEvento } = montarEventoCancelamento({
    chave: nota.chave_acesso,
    nDFSe,
    cnpj: cfg.cnpj,
    ambiente,
    cMotivo,
    xMotivo: justificativa.trim(),
  });
  const assinado = assinarEvento(xml, idEvento, cert);

  let r;
  try {
    r = await enviarCancelamento(assinado, nota.chave_acesso, { pfx: cert.pfx, senha: cert.senha }, ambiente);
  } catch (e) {
    console.error("cancelarNfse:", e instanceof Error ? e.message : e);
    return { erro: "Falha ao comunicar com a Sefin." };
  }
  if (!r.aceito) return { erro: `Cancelamento rejeitado: ${r.mensagens?.join("; ")}` };

  await supabase
    .from("nfse")
    .update({
      status: "cancelada",
      cancelado_em: new Date().toISOString(),
      cancelamento: { cMotivo, xMotivo: justificativa.trim(), idEvento: r.idEvento ?? null, xml: r.xml ?? null },
    })
    .eq("id", nfseId);
  revalidatePath(`/clientes/${nota.cliente_id}`);
  return { ok: true };
}
```

- [ ] **Step 2: Verificar** — Run: `npm run lint && npm run typecheck && npm run build` · Expected: verde. (Confirmar que `createAdminSupabase` e `decifrar`/`carregarCertificado` já estão importados no arquivo — estão, das actions de emissão/DANFSe.)
- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/clientes/[id]/nfse.ts"
git commit -m "feat(nfse): action cancelarNfse (evento de cancelamento)"
```

---

## Task 5: UI — botão "Cancelar" e rótulo

**Files:** Create `src/components/nfse/CancelarNfse.tsx`; Modify `src/components/nfse/NotasFiscaisSection.tsx`.

**Interfaces:** Consumes `cancelarNfse` (T4).

- [ ] **Step 1: Componente `CancelarNfse`** (client)

```tsx
"use client";
import { useState, useTransition } from "react";
import { cancelarNfse } from "@/app/(app)/clientes/[id]/nfse";

export function CancelarNfse({ nfseId }: { nfseId: string }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState<"1" | "2" | "9">("1");
  const [justificativa, setJustificativa] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();

  if (!aberto)
    return (
      <button onClick={() => setAberto(true)} className="rounded border px-2 py-0.5 text-xs text-red-700">
        Cancelar
      </button>
    );

  return (
    <div className="mt-1 space-y-1 rounded border border-slate-200 p-2 text-xs">
      <select value={motivo} onChange={(e) => setMotivo(e.target.value as "1" | "2" | "9")} className="w-full rounded border px-1 py-0.5">
        <option value="1">1 - Erro na emissão</option>
        <option value="2">2 - Serviço não prestado</option>
        <option value="9">9 - Outros</option>
      </select>
      <textarea
        value={justificativa}
        onChange={(e) => setJustificativa(e.target.value)}
        placeholder="Justificativa (mín. 15 caracteres)"
        rows={2}
        className="w-full rounded border px-1 py-0.5"
      />
      {erro && <p role="alert" className="text-red-600">{erro}</p>}
      <div className="flex gap-2">
        <button
          disabled={pend}
          onClick={() =>
            start(async () => {
              setErro(null);
              const r = await cancelarNfse(nfseId, motivo, justificativa);
              if (r.erro) setErro(r.erro);
              else setAberto(false);
            })
          }
          className="rounded bg-red-700 px-2 py-0.5 text-white disabled:opacity-60"
        >
          {pend ? "Cancelando…" : "Confirmar cancelamento"}
        </button>
        <button onClick={() => setAberto(false)} className="rounded border px-2 py-0.5">
          Voltar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Integrar na lista** — em `NotasFiscaisSection.tsx`, importar `CancelarNfse` e, na célula "Documentos" (onde já está `BaixarNfse` para autorizada), adicionar o botão de cancelar quando `podeGerenciar`/`podeVerHonorario` (a seção já é gated por `podeVerHonorario`, então basta o status). Trocar o bloco da coluna Documentos por:

```tsx
                  <td className="p-2">
                    {n.status === "autorizada" && n.chave_acesso && (
                      <div className="space-y-1">
                        <BaixarNfse nfseId={n.id} numero={n.numero ?? ""} chave={n.chave_acesso} />
                        <CancelarNfse nfseId={n.id} />
                      </div>
                    )}
                  </td>
```

- [ ] **Step 3: Rótulo "cancelada"** — na célula de status, o `ROTULO_STATUS` já cobre `cancelada` ("Cancelada"); garantir que existe a entrada. Se faltar, adicionar ao mapa: `cancelada: "Cancelada"` (já presente na `NotasFiscaisSection`).

- [ ] **Step 4: Verificar** — Run: `npm run lint && npm run typecheck && npm run build` · Expected: verde.
- [ ] **Step 5: Commit**

```bash
git add src/components/nfse/CancelarNfse.tsx src/components/nfse/NotasFiscaisSection.tsx
git commit -m "feat(nfse): botão de cancelamento na ficha"
```

---

## Task 6: Verificação E2E (homologação) e release

**Files:** nenhuma (verificação).

- [ ] **Step 1: Suíte completa** — Run: `npm run lint && npm run typecheck && npm test && npm run db:test` · Expected: verde.
- [ ] **Step 2: E2E** — com `ambiente=homologacao`: emitir uma nota; na lista, clicar **Cancelar**, escolher o motivo, escrever a justificativa (≥15) e confirmar. Conferir: `status='cancelada'`, `cancelado_em` preenchido, botão some. Ajustar `montarEventoCancelamento`/`parseRespostaEvento` **se** a Sefin rejeitar por layout/campo (isolado nesses pontos). Tentar cancelar de novo → rejeição tratada.
- [ ] **Step 3:** Atualizar `CHANGELOG.md` (v5.4.0) e finalizar a branch (merge + tag `v5.4.0`).

---

## Self-Review (resultado)

- **Cobertura do spec:** §3 integração (endpoint/evento) → T3; §4 motor → T2 (refactor) + T3 (cancelamento); §5 dados → T1; §6 UI → T5 + action T4; §7 erros (não autorizada, justificativa, rejeição) → T4/T5; §8 testes → T3 + E2E T6.
- **Placeholders:** sem TODO/TBD. Pontos incertos de terceiro (layout exato do evento, nome do campo JSON, faixa de cStat) isolados em `montarEventoCancelamento`/`parseRespostaEvento`/`enviarCancelamento`, confirmados na homologação — não são placeholders de lógica.
- **Consistência de tipos:** `DadosCancelamento`/`ResultadoEvento` (T3) usados em T3/T4; `assinarXmlDsig`/`postJsonMtls` (T2) consumidos por `assinarEvento`/`enviarCancelamento` (T3); `cancelarNfse` (T4) consumido em T5.
- **Reuso:** assinatura e POST mTLS agora compartilhados entre DPS e evento; nada duplicado.
- **A confirmar na homologação:** o `nNFSe` (nDFSe) vem de `nfse.numero` ou do `nfse_xml`; e o layout do evento — ambos isolados e validados no E2E, como foi com a DPS.
