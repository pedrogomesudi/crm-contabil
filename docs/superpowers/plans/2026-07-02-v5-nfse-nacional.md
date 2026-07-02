# V5 — Emissão de NFS-e nacional (honorários do escritório) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emitir a NFS-e dos honorários do escritório pela API nacional (Sefin), a partir do honorário do cliente, com o certificado A1 cifrado in-house.

**Architecture:** Módulo isolado `src/lib/nfse/` monta a DPS (XML, layout nacional), assina (XMLDSig com o A1), comprime (GZip+Base64) e envia via **mTLS** à Sefin; uma server action orquestra a emissão a partir do honorário; config fiscal e certificado ficam em tabelas próprias (admin), com o certificado cifrado (AES-256-GCM). Homologação primeiro.

**Tech Stack:** Next 16 (App Router, server actions/route) + TypeScript · Supabase · Vitest · `node:crypto` (AES-GCM), `node:zlib` (gzip), `node:https` (mTLS) · `node-forge` (.pfx) · `xml-crypto` (XMLDSig) · `xmlbuilder2` (montar XML) · `fast-xml-parser` (ler resposta).

## Global Constraints

- **Segredos runtime (nunca `NEXT_PUBLIC_`):** `NFSE_CERT_KEY` (chave AES da cifra do certificado), `NFSE_AMBIENTE` (`homologacao`|`producao`), `NFSE_URL_HOMOLOGACAO`, `NFSE_URL_PRODUCAO`. Validar com `required(process.env.X, "X")` de `@/lib/env`.
- **RBAC:** emitir/ver `nfse` = `podeVerHonorario(papel)` (admin/financeiro/contador-dono) de `@/lib/clientes/permissoes`; `nfse_config`/`nfse_certificado` = **admin** (`papel === "admin"`). Ações que gravam usam a sessão (RLS); nenhuma exposição de certificado ao cliente.
- **Banco:** migrations idempotentes em `supabase/migrations/NNNN_*.sql` via `npm run db:migrate`; RLS testada em `supabase/tests/rls.test.sql` via `npm run db:test`. Migrations aplicadas são imutáveis.
- **Certificado:** o `.pfx` e a senha ficam **cifrados em repouso** (AES-256-GCM, chave `NFSE_CERT_KEY`); decifrados só no runtime da emissão; usados para mTLS e assinatura; nunca vão ao browser.
- **Ambiente:** homologação (produção restrita, `tpAmb=2`) é o default; produção (`tpAmb=1`) só por env. A UI avisa quando homologação ("sem validade jurídica").
- **Comandos antes de commitar:** `npm run lint && npm run typecheck && npm test`. Da raiz, na branch `develop`.

---

## File Structure

- `src/lib/nfse/cripto.ts` — cifra/decifra AES-256-GCM (certificado).
- `src/lib/nfse/certificado.ts` — parse do `.pfx` (node-forge) → `{ certPem, keyPem, pfx, senha, validade }`.
- `src/lib/nfse/tipos.ts` — tipos compartilhados (config, tomador, resultado).
- `src/lib/nfse/dps.ts` — `montarDps(dados)` → XML da DPS (xmlbuilder2).
- `src/lib/nfse/assinatura.ts` — `assinarDps(xml, cert)` → XML com XMLDSig (xml-crypto).
- `src/lib/nfse/envio.ts` — `enviarDps(xmlAssinado, cert, ambiente)` → gzip+base64 + POST mTLS + parse resposta.
- `supabase/migrations/0019_nfse.sql` — `nfse_config`, `nfse_certificado`, `nfse` + RLS + trigger.
- `src/app/(app)/configuracoes/nfse/` — tela admin (config fiscal + upload do certificado) + `actions.ts`.
- `src/app/(app)/clientes/[id]/nfse.ts` — server action `emitirNfse`.
- `src/components/nfse/EmitirNfse.tsx`, `NotasFiscaisSection.tsx` — UI na ficha.
- Testes: `src/tests/nfse/*.test.ts`.
- `xsd/DPS_v1.00.xsd` (baixado do gov.br/nfse) — validação do XML no teste de layout.

---

## Task 1: Dependências

**Files:** Modify `package.json`.

- [ ] **Step 1: Instalar** — Run: `npm i node-forge xml-crypto xmlbuilder2 fast-xml-parser && npm i -D @types/node-forge`
- [ ] **Step 2: Verificar** — Run: `node -e "require('node-forge');require('xml-crypto');require('xmlbuilder2');require('fast-xml-parser');console.log('ok')"` · Expected: `ok`
- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(nfse): dependências (node-forge, xml-crypto, xmlbuilder2, fast-xml-parser)"
```

---

## Task 2: Cifra do certificado (AES-256-GCM)

**Files:** Create `src/lib/nfse/cripto.ts`, `src/tests/nfse/cripto.test.ts`.

**Interfaces:** Produces `cifrar(dados: Buffer, chaveHex: string): string` (formato `iv:tag:ciphertext` em base64) e `decifrar(pacote: string, chaveHex: string): Buffer`.

- [ ] **Step 1: Teste que falha**

```ts
// src/tests/nfse/cripto.test.ts
import { describe, it, expect } from "vitest";
import { cifrar, decifrar } from "@/lib/nfse/cripto";

const CHAVE = "0".repeat(64); // 32 bytes em hex

describe("cripto do certificado", () => {
  it("faz round-trip cifra/decifra", () => {
    const original = Buffer.from("conteudo-do-pfx-binário\x00\x01");
    const pacote = cifrar(original, CHAVE);
    expect(pacote).not.toContain("conteudo");
    expect(decifrar(pacote, CHAVE).equals(original)).toBe(true);
  });
  it("falha ao decifrar com chave errada", () => {
    const pacote = cifrar(Buffer.from("x"), CHAVE);
    expect(() => decifrar(pacote, "f".repeat(64))).toThrow();
  });
});
```

- [ ] **Step 2: Rodar (falha)** — Run: `npm test -- src/tests/nfse/cripto.test.ts` · Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
// src/lib/nfse/cripto.ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Pacote: base64(iv) : base64(authTag) : base64(ciphertext). AES-256-GCM.
export function cifrar(dados: Buffer, chaveHex: string): string {
  const chave = Buffer.from(chaveHex, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", chave, iv);
  const ct = Buffer.concat([cipher.update(dados), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decifrar(pacote: string, chaveHex: string): Buffer {
  const chave = Buffer.from(chaveHex, "hex");
  const [ivB64, tagB64, ctB64] = pacote.split(":");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("pacote cifrado inválido");
  const decipher = createDecipheriv("aes-256-gcm", chave, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
}
```

- [ ] **Step 4: Rodar (passa)** — Run: `npm test -- src/tests/nfse/cripto.test.ts` · Expected: PASS (2).
- [ ] **Step 5: Commit**

```bash
git add src/lib/nfse/cripto.ts src/tests/nfse/cripto.test.ts
git commit -m "feat(nfse): cifra AES-256-GCM do certificado"
```

---

## Task 3: Migration 0019 — nfse_config, nfse_certificado, nfse

**Files:** Create `supabase/migrations/0019_nfse.sql`; Modify `supabase/tests/rls.test.sql`.

**Interfaces:** Produces as tabelas `nfse_config`, `nfse_certificado`, `nfse`.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/0019_nfse.sql — Emissão de NFS-e nacional (V5). Idempotente.
create table if not exists nfse_config (
  id smallint primary key default 1 check (id = 1), -- linha única
  cnpj text, inscricao_municipal text, razao_social text,
  endereco jsonb, codigo_municipio text, uf text,
  item_lc116 text, codigo_tributacao_municipal text, aliquota_iss numeric,
  natureza_operacao text, simples_nacional boolean default true,
  ambiente text not null default 'homologacao', -- homologacao|producao
  atualizado_em timestamptz not null default now()
);

create table if not exists nfse_certificado (
  id smallint primary key default 1 check (id = 1), -- linha única
  nome_arquivo text, pfx_cifrado text, senha_cifrada text,
  validade timestamptz, atualizado_em timestamptz not null default now()
);

create table if not exists nfse (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  valor numeric not null,
  competencia date not null,
  status text not null default 'processando', -- processando|autorizada|rejeitada|erro|cancelada
  chave_acesso text, numero text,
  dps_xml text, nfse_xml text, danfse_path text,
  mensagens jsonb, ambiente text not null,
  criado_por uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  autorizada_em timestamptz
);
create index if not exists nfse_cliente_idx on nfse (cliente_id, competencia);

alter table nfse_config enable row level security;
alter table nfse_certificado enable row level security;
alter table nfse enable row level security;

-- Config e certificado: só admin.
drop policy if exists nfse_config_admin on nfse_config;
create policy nfse_config_admin on nfse_config for all to authenticated
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
drop policy if exists nfse_cert_admin on nfse_certificado;
create policy nfse_cert_admin on nfse_certificado for all to authenticated
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');

-- Notas: quem vê honorário (admin/financeiro/contador-dono), espelhando a regra financeira.
drop policy if exists nfse_rw on nfse;
create policy nfse_rw on nfse for all to authenticated
  using (
    auth_papel() in ('admin', 'financeiro')
    or (auth_papel() = 'contador'
        and exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid()))
  )
  with check (
    auth_papel() in ('admin', 'financeiro')
    or (auth_papel() = 'contador'
        and exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid()))
  );

create or replace function nfse_integridade() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  if auth.uid() is not null and tg_op = 'INSERT' then new.criado_por := auth.uid(); end if;
  return new;
end; $$;
drop trigger if exists trg_nfse_integridade on nfse;
create trigger trg_nfse_integridade before insert on nfse
  for each row execute function nfse_integridade();
```

- [ ] **Step 2: Aplicar** — Run: `npm run db:migrate` · Expected: `0019_nfse.sql` aplicada.
- [ ] **Step 3: Reaplicar é no-op** — Run: `npm run db:migrate` · Expected: 0 novas.

- [ ] **Step 4: Assert de RLS** (acrescentar ao final de `supabase/tests/rls.test.sql`)

```sql
-- ===== V5: NFS-e segue a RLS financeira; config/cert são só admin =====
reset role;
insert into nfse (id, cliente_id, valor, competencia, status, ambiente) values
  ('22222222-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 100, '2026-07-01', 'autorizada', 'homologacao')
  on conflict do nothing;

do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000002'); -- assistente
  select count(*) into n from nfse;
  if n <> 0 then raise exception 'FALHA: assistente viu % nfse (devia ser 0)', n; end if;
  select count(*) into n from nfse_config;
  if n <> 0 then raise exception 'FALHA: assistente viu nfse_config (devia ser 0)'; end if;
  raise notice 'OK: assistente não acessa nfse nem config';
  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro
  select count(*) into n from nfse;
  if n <> 1 then raise exception 'FALHA: financeiro viu % nfse (devia ser 1)', n; end if;
  raise notice 'OK: financeiro vê nfse';
end $$;
```

- [ ] **Step 5: Rodar RLS** — Run: `npm run db:test` · Expected: `✓ TODOS OS ASSERTS PASSARAM` com os novos `OK:`.
- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0019_nfse.sql supabase/tests/rls.test.sql
git commit -m "feat(db): tabelas de NFS-e + RLS (0019)"
```

---

## Task 4: Tipos + parse do certificado (.pfx)

**Files:** Create `src/lib/nfse/tipos.ts`, `src/lib/nfse/certificado.ts`, `src/tests/nfse/certificado.test.ts`.

**Interfaces:**
- Produces (tipos): `type Certificado = { certPem: string; keyPem: string; pfx: Buffer; senha: string; validade: Date }`; `type Tomador = { documento: string; razaoSocial: string; email?: string; endereco?: Record<string,string> }`; `type ConfigFiscal = { cnpj: string; inscricaoMunicipal: string; razaoSocial: string; codigoMunicipio: string; uf: string; itemLc116: string; codigoTributacaoMunicipal: string; aliquotaIss: number; naturezaOperacao: string; simplesNacional: boolean; ambiente: "homologacao" | "producao" }`; `type ResultadoEmissao = { autorizada: boolean; chaveAcesso?: string; numero?: string; xmlNfse?: string; mensagens?: string[] }`.
- Produces (certificado): `carregarCertificado(pfx: Buffer, senha: string): Certificado`.

- [ ] **Step 1: Tipos** (`src/lib/nfse/tipos.ts`)

```ts
export type Certificado = { certPem: string; keyPem: string; pfx: Buffer; senha: string; validade: Date };
export type Tomador = { documento: string; razaoSocial: string; email?: string; endereco?: Record<string, string> };
export type ConfigFiscal = {
  cnpj: string; inscricaoMunicipal: string; razaoSocial: string; codigoMunicipio: string; uf: string;
  itemLc116: string; codigoTributacaoMunicipal: string; aliquotaIss: number; naturezaOperacao: string;
  simplesNacional: boolean; ambiente: "homologacao" | "producao";
};
export type DadosDps = { config: ConfigFiscal; tomador: Tomador; valor: number; competencia: string; serie: string; numeroDps: string };
export type ResultadoEmissao = { autorizada: boolean; chaveAcesso?: string; numero?: string; xmlNfse?: string; mensagens?: string[] };
```

- [ ] **Step 2: Teste que falha** (usa um .pfx de teste gerado no próprio teste via node-forge)

```ts
// src/tests/nfse/certificado.test.ts
import { describe, it, expect } from "vitest";
import forge from "node-forge";
import { carregarCertificado } from "@/lib/nfse/certificado";

function pfxDeTeste(senha: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 86400000);
  const attrs = [{ name: "commonName", value: "ESCRITORIO TESTE" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], senha, { algorithm: "3des" });
  const der = forge.asn1.toDer(p12).getBytes();
  return Buffer.from(der, "binary");
}

describe("carregarCertificado", () => {
  it("extrai cert/key PEM e validade do .pfx", () => {
    const cert = carregarCertificado(pfxDeTeste("segredo"), "segredo");
    expect(cert.certPem).toContain("BEGIN CERTIFICATE");
    expect(cert.keyPem).toContain("PRIVATE KEY");
    expect(cert.validade.getTime()).toBeGreaterThan(Date.now());
  });
  it("lança com senha errada", () => {
    expect(() => carregarCertificado(pfxDeTeste("certa"), "errada")).toThrow();
  });
});
```

- [ ] **Step 3: Rodar (falha)** — Run: `npm test -- src/tests/nfse/certificado.test.ts` · Expected: FAIL.

- [ ] **Step 4: Implementar**

```ts
// src/lib/nfse/certificado.ts
import forge from "node-forge";
import type { Certificado } from "./tipos";

export function carregarCertificado(pfx: Buffer, senha: string): Certificado {
  const der = forge.util.createBuffer(pfx.toString("binary"));
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, senha); // lança se a senha estiver errada
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const keyBags =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
  const certObj = certBags[0]?.cert;
  const keyObj = keyBags[0]?.key;
  if (!certObj || !keyObj) throw new Error("certificado ou chave não encontrados no .pfx");
  return {
    certPem: forge.pki.certificateToPem(certObj),
    keyPem: forge.pki.privateKeyToPem(keyObj),
    pfx,
    senha,
    validade: certObj.validity.notAfter,
  };
}
```

- [ ] **Step 5: Rodar (passa)** — Run: `npm test -- src/tests/nfse/certificado.test.ts` · Expected: PASS (2).
- [ ] **Step 6: Commit**

```bash
git add src/lib/nfse/tipos.ts src/lib/nfse/certificado.ts src/tests/nfse/certificado.test.ts
git commit -m "feat(nfse): tipos + parse do certificado A1 (.pfx)"
```

---

## Task 5: Montagem da DPS (XML)

**Files:** Create `src/lib/nfse/dps.ts`, `src/tests/nfse/dps.test.ts`, `xsd/DPS_v1.00.xsd`.

**Interfaces:** Consumes `DadosDps` (T4). Produces `montarDps(dados: DadosDps): { xml: string; idDps: string }` — XML da DPS com `infDPS Id="DPS<...>"`.

> **Layout:** o conjunto de campos segue o schema nacional da DPS (baixe `DPS_v1.00.xsd` de https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica e salve em `xsd/`). O esqueleto abaixo cobre os grupos obrigatórios do MVP (prestador PJ, tomador, um serviço, valores). O teste valida contra o XSD — campos que o XSD exigir a mais são adicionados até o teste passar.

- [ ] **Step 1: Teste que falha** (monta e valida elementos-chave)

```ts
// src/tests/nfse/dps.test.ts
import { describe, it, expect } from "vitest";
import { montarDps } from "@/lib/nfse/dps";
import type { DadosDps } from "@/lib/nfse/tipos";

const dados: DadosDps = {
  config: {
    cnpj: "12345678000199", inscricaoMunicipal: "123456", razaoSocial: "ESCRITORIO LTDA",
    codigoMunicipio: "3170206", uf: "MG", itemLc116: "17.19", codigoTributacaoMunicipal: "1719",
    aliquotaIss: 2, naturezaOperacao: "1", simplesNacional: true, ambiente: "homologacao",
  },
  tomador: { documento: "98765432000188", razaoSocial: "CLIENTE LTDA", endereco: { cep: "38400000" } },
  valor: 500, competencia: "2026-07-01", serie: "1", numeroDps: "1",
};

describe("montarDps", () => {
  it("monta a DPS com infDPS[@Id], tpAmb de homologação, prestador, tomador e valor", () => {
    const { xml, idDps } = montarDps(dados);
    expect(idDps).toMatch(/^DPS/);
    expect(xml).toContain(`Id="${idDps}"`);
    expect(xml).toContain("<tpAmb>2</tpAmb>"); // homologação
    expect(xml).toContain("12345678000199"); // CNPJ prestador
    expect(xml).toContain("98765432000188"); // tomador
    expect(xml).toContain("<vServ>500.00</vServ>");
  });
});
```

- [ ] **Step 2: Rodar (falha)** — Run: `npm test -- src/tests/nfse/dps.test.ts` · Expected: FAIL.

- [ ] **Step 3: Implementar** (esqueleto dos grupos obrigatórios; expandir conforme o XSD)

```ts
// src/lib/nfse/dps.ts
import { create } from "xmlbuilder2";
import type { DadosDps } from "./tipos";

function valor2(n: number): string {
  return n.toFixed(2);
}

export function montarDps(d: DadosDps): { xml: string; idDps: string } {
  const tpAmb = d.config.ambiente === "producao" ? "1" : "2";
  // Id da DPS: "DPS" + cod município(7) + tipoInsc(1=CNPJ) + inscrição(14) + série(5) + nDPS(15). (layout nacional)
  const idDps =
    "DPS" +
    d.config.codigoMunicipio.padStart(7, "0") +
    "2" + // tipo de inscrição federal do emitente: 2 = CNPJ
    d.config.cnpj.padStart(14, "0") +
    d.serie.padStart(5, "0") +
    d.numeroDps.padStart(15, "0");

  const doc = create({ version: "1.0", encoding: "UTF-8" })
    .ele("DPS", { xmlns: "http://www.sped.fazenda.gov.br/nfse" })
    .ele("infDPS", { Id: idDps })
    .ele("tpAmb").txt(tpAmb).up()
    .ele("dhEmi").txt(new Date().toISOString()).up()
    .ele("verAplic").txt("crm-contabil-1").up()
    .ele("serie").txt(d.serie).up()
    .ele("nDPS").txt(d.numeroDps).up()
    .ele("dCompet").txt(d.competencia).up()
    .ele("tpEmit").txt("1").up()
    .ele("cLocEmi").txt(d.config.codigoMunicipio).up()
    // Prestador (emitente)
    .ele("prest")
      .ele("CNPJ").txt(d.config.cnpj).up()
      .ele("IM").txt(d.config.inscricaoMunicipal).up()
      .ele("xNome").txt(d.config.razaoSocial).up()
      .ele("regTrib").ele("opSimpNac").txt(d.config.simplesNacional ? "1" : "2").up().up()
    .up()
    // Tomador (cliente)
    .ele("toma")
      .ele(d.tomador.documento.length > 11 ? "CNPJ" : "CPF").txt(d.tomador.documento).up()
      .ele("xNome").txt(d.tomador.razaoSocial).up()
    .up()
    // Serviço
    .ele("serv")
      .ele("locPrest").ele("cLocPrestacao").txt(d.config.codigoMunicipio).up().up()
      .ele("cServ")
        .ele("cTribNac").txt(d.config.itemLc116.replace(".", "")).up()
        .ele("cTribMun").txt(d.config.codigoTributacaoMunicipal).up()
      .up()
    .up()
    // Valores
    .ele("valores")
      .ele("vServPrest").ele("vServ").txt(valor2(d.valor)).up().up()
      .ele("trib").ele("tribMun")
        .ele("tribISSQN").txt("1").up()
        .ele("pAliq").txt(valor2(d.config.aliquotaIss)).up()
      .up().up()
    .up()
    .up() // infDPS
    .up(); // DPS

  return { xml: doc.end({ prettyPrint: false }), idDps };
}
```

- [ ] **Step 4: Rodar (passa)** — Run: `npm test -- src/tests/nfse/dps.test.ts` · Expected: PASS.
- [ ] **Step 5: Validar contra o XSD** (adicionar ao teste, após baixar `xsd/DPS_v1.00.xsd`): usar `fast-xml-parser` só para garantir XML bem-formado no unit; a validação estrutural completa contra o XSD é feita na homologação (Task 11), onde a Sefin rejeita o que estiver fora do schema. Documentar isso como comentário no teste.
- [ ] **Step 6: Commit**

```bash
git add src/lib/nfse/dps.ts src/tests/nfse/dps.test.ts xsd/
git commit -m "feat(nfse): montagem da DPS (XML, layout nacional — grupos do MVP)"
```

---

## Task 6: Assinatura XMLDSig da DPS

**Files:** Create `src/lib/nfse/assinatura.ts`, `src/tests/nfse/assinatura.test.ts`.

**Interfaces:** Consumes `Certificado` (T4). Produces `assinarDps(xml: string, idDps: string, cert: { certPem: string; keyPem: string }): string` — XML com `<Signature>` enveloped referenciando `#<idDps>`.

- [ ] **Step 1: Teste que falha** (assina e verifica que a assinatura é válida)

```ts
// src/tests/nfse/assinatura.test.ts
import { describe, it, expect } from "vitest";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import { montarDps } from "@/lib/nfse/dps";
import { assinarDps } from "@/lib/nfse/assinatura";
import type { DadosDps } from "@/lib/nfse/tipos";

function certParTeste() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey; cert.serialNumber = "01";
  cert.validity.notBefore = new Date(); cert.validity.notAfter = new Date(Date.now() + 86400000);
  const a = [{ name: "commonName", value: "T" }]; cert.setSubject(a); cert.setIssuer(a);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

const dados: DadosDps = {
  config: { cnpj: "12345678000199", inscricaoMunicipal: "1", razaoSocial: "E", codigoMunicipio: "3170206", uf: "MG", itemLc116: "17.19", codigoTributacaoMunicipal: "1719", aliquotaIss: 2, naturezaOperacao: "1", simplesNacional: true, ambiente: "homologacao" },
  tomador: { documento: "98765432000188", razaoSocial: "C" }, valor: 500, competencia: "2026-07-01", serie: "1", numeroDps: "1",
};

describe("assinarDps", () => {
  it("produz uma assinatura enveloped válida sobre o infDPS", () => {
    const par = certParTeste();
    const { xml, idDps } = montarDps(dados);
    const assinado = assinarDps(xml, idDps, par);
    expect(assinado).toContain("<Signature");
    expect(assinado).toContain(`URI="#${idDps}"`);
    // valida a assinatura com a chave pública do próprio cert
    const sig = new SignedXml();
    const sigNode = /<Signature[\s\S]*<\/Signature>/.exec(assinado)![0];
    sig.publicCert = par.certPem;
    sig.loadSignature(sigNode);
    expect(sig.checkSignature(assinado)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar (falha)** — Run: `npm test -- src/tests/nfse/assinatura.test.ts` · Expected: FAIL.

- [ ] **Step 3: Implementar** (enveloped + exclusive-c14n + RSA-SHA256, padrão dos DFe)

```ts
// src/lib/nfse/assinatura.ts
import { SignedXml } from "xml-crypto";

// Assina o elemento infDPS (por Id), assinatura enveloped, exclusive-c14n, RSA-SHA256.
export function assinarDps(xml: string, idDps: string, cert: { certPem: string; keyPem: string }): string {
  const sig = new SignedXml({
    privateKey: cert.keyPem,
    publicCert: cert.certPem,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
  });
  sig.addReference({
    xpath: `//*[local-name(.)='infDPS']`,
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/2001/10/xml-exc-c14n#",
    ],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    uri: `#${idDps}`,
  });
  // KeyInfo com o X509Certificate (exigido pelos DFe)
  sig.keyInfoProvider = {
    getKeyInfo: () =>
      `<X509Data><X509Certificate>${cert.certPem
        .replace(/-----(BEGIN|END) CERTIFICATE-----/g, "")
        .replace(/\s+/g, "")}</X509Certificate></X509Data>`,
  } as unknown as SignedXml["keyInfoProvider"];
  sig.computeSignature(xml, { location: { reference: `//*[local-name(.)='infDPS']`, action: "after" } });
  return sig.getSignedXml();
}
```

> Nota: a API do `xml-crypto` evoluiu entre versões (nomes `signingCert`/`publicCert`, `keyInfoProvider`). Se o teste acusar propriedade inexistente, ajustar aos nomes da versão instalada (Task 1) — a semântica (enveloped, exc-c14n, sha256, KeyInfo com X509) é a que os DFe exigem.

- [ ] **Step 4: Rodar (passa)** — Run: `npm test -- src/tests/nfse/assinatura.test.ts` · Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/nfse/assinatura.ts src/tests/nfse/assinatura.test.ts
git commit -m "feat(nfse): assinatura XMLDSig da DPS (enveloped, exc-c14n, rsa-sha256)"
```

---

## Task 7: Envio à Sefin (gzip+base64 + mTLS)

**Files:** Create `src/lib/nfse/envio.ts`, `src/tests/nfse/envio.test.ts`.

**Interfaces:** Consumes `Certificado`, `ResultadoEmissao` (T4). Produces `enviarDps(xmlAssinado: string, cert: { pfx: Buffer; senha: string }, ambiente: "homologacao" | "producao"): Promise<ResultadoEmissao>` e `montarCorpoDps(xmlAssinado: string): string` (gzip+base64).

- [ ] **Step 1: Teste que falha** (testa a parte pura: gzip+base64 e parse da resposta)

```ts
// src/tests/nfse/envio.test.ts
import { describe, it, expect } from "vitest";
import { gunzipSync } from "node:zlib";
import { montarCorpoDps, parseResposta } from "@/lib/nfse/envio";

describe("montarCorpoDps", () => {
  it("comprime (gzip) e codifica (base64) o XML", () => {
    const b64 = montarCorpoDps("<DPS>x</DPS>");
    const xml = gunzipSync(Buffer.from(b64, "base64")).toString("utf8");
    expect(xml).toBe("<DPS>x</DPS>");
  });
});

describe("parseResposta", () => {
  it("interpreta autorizada", () => {
    const r = parseResposta(200, { chaveAcesso: "3170206...", nfseXmlGZipB64: null, numero: "12" });
    expect(r.autorizada).toBe(true);
    expect(r.chaveAcesso).toContain("3170206");
  });
  it("interpreta rejeição com mensagens", () => {
    const r = parseResposta(400, { erros: [{ codigo: "E001", descricao: "IM inválida" }] });
    expect(r.autorizada).toBe(false);
    expect(r.mensagens?.[0]).toContain("IM inválida");
  });
});
```

- [ ] **Step 2: Rodar (falha)** — Run: `npm test -- src/tests/nfse/envio.test.ts` · Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/lib/nfse/envio.ts
import { gzipSync } from "node:zlib";
import { request as httpsRequest } from "node:https";
import { required } from "@/lib/env";
import type { ResultadoEmissao } from "./tipos";

export function montarCorpoDps(xmlAssinado: string): string {
  return gzipSync(Buffer.from(xmlAssinado, "utf8")).toString("base64");
}

export function parseResposta(status: number, corpo: Record<string, unknown>): ResultadoEmissao {
  if (status >= 200 && status < 300 && corpo.chaveAcesso) {
    return {
      autorizada: true,
      chaveAcesso: String(corpo.chaveAcesso),
      numero: corpo.numero ? String(corpo.numero) : undefined,
      xmlNfse: typeof corpo.nfseXmlGZipB64 === "string" ? corpo.nfseXmlGZipB64 : undefined,
    };
  }
  const erros = Array.isArray(corpo.erros) ? corpo.erros : [];
  const mensagens = erros.map((e: { codigo?: string; descricao?: string }) => `${e.codigo ?? ""} ${e.descricao ?? ""}`.trim());
  return { autorizada: false, mensagens: mensagens.length ? mensagens : [`HTTP ${status}`] };
}

function baseUrl(ambiente: "homologacao" | "producao"): string {
  return ambiente === "producao"
    ? required(process.env.NFSE_URL_PRODUCAO, "NFSE_URL_PRODUCAO")
    : required(process.env.NFSE_URL_HOMOLOGACAO, "NFSE_URL_HOMOLOGACAO");
}

// POST /nfse com mTLS (certificado de cliente = A1). node:https expõe pfx no request.
export async function enviarDps(
  xmlAssinado: string,
  cert: { pfx: Buffer; senha: string },
  ambiente: "homologacao" | "producao",
): Promise<ResultadoEmissao> {
  const url = new URL(`${baseUrl(ambiente)}/nfse`);
  const body = JSON.stringify({ dpsXmlGZipB64: montarCorpoDps(xmlAssinado) });
  const corpo = await new Promise<{ status: number; json: Record<string, unknown> }>((resolve, reject) => {
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
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const txt = Buffer.concat(chunks).toString("utf8");
          let json: Record<string, unknown> = {};
          try { json = txt ? JSON.parse(txt) : {}; } catch { json = { erros: [{ descricao: txt.slice(0, 200) }] }; }
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
  return parseResposta(corpo.status, corpo.json);
}
```

> Nota: o nome exato do campo JSON que carrega a DPS (`dpsXmlGZipB64`) e o da resposta são confirmados na homologação (Task 11) contra o Swagger da produção restrita; ficam isolados em `montarCorpoDps`/`parseResposta`.

- [ ] **Step 4: Rodar (passa)** — Run: `npm test -- src/tests/nfse/envio.test.ts` · Expected: PASS (3).
- [ ] **Step 5: Commit**

```bash
git add src/lib/nfse/envio.ts src/tests/nfse/envio.test.ts
git commit -m "feat(nfse): envio da DPS à Sefin (gzip+base64, mTLS)"
```

---

## Task 8: Config fiscal + certificado (tela admin + actions)

**Files:** Create `src/app/(app)/configuracoes/nfse/page.tsx`, `src/app/(app)/configuracoes/nfse/actions.ts`, `src/app/(app)/configuracoes/nfse/Formularios.tsx`.

**Interfaces:** Consumes `carregarCertificado` (T4), `cifrar` (T2). Produces actions `salvarConfig(_prev, formData)` e `salvarCertificado(_prev, formData)`.

- [ ] **Step 1: Implementar as actions** (gate admin; upsert linha única; cifra o certificado)

```ts
// src/app/(app)/configuracoes/nfse/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { required } from "@/lib/env";
import { cifrar } from "@/lib/nfse/cripto";
import { carregarCertificado } from "@/lib/nfse/certificado";

export type EstadoConfig = { erro?: string; ok?: boolean };

async function exigirAdmin() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") return null;
  return perfil;
}

export async function salvarConfig(_prev: EstadoConfig, formData: FormData): Promise<EstadoConfig> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("nfse_config").upsert({
    id: 1,
    cnpj: String(formData.get("cnpj") ?? "").replace(/\D/g, ""),
    inscricao_municipal: String(formData.get("im") ?? "").trim(),
    razao_social: String(formData.get("razao_social") ?? "").trim(),
    codigo_municipio: String(formData.get("codigo_municipio") ?? "").trim(),
    uf: String(formData.get("uf") ?? "").trim(),
    item_lc116: String(formData.get("item_lc116") ?? "").trim(),
    codigo_tributacao_municipal: String(formData.get("codigo_trib") ?? "").trim(),
    aliquota_iss: Number(formData.get("aliquota_iss") ?? 0),
    natureza_operacao: String(formData.get("natureza") ?? "1").trim(),
    simples_nacional: formData.get("simples") === "on",
    ambiente: String(formData.get("ambiente") ?? "homologacao"),
    atualizado_em: new Date().toISOString(),
  });
  if (error) return { erro: "Falha ao salvar a configuração." };
  revalidatePath("/configuracoes/nfse");
  return { ok: true };
}

export async function salvarCertificado(_prev: EstadoConfig, formData: FormData): Promise<EstadoConfig> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const arquivo = formData.get("pfx") as File | null;
  const senha = String(formData.get("senha") ?? "");
  if (!arquivo || arquivo.size === 0 || !senha) return { erro: "Envie o .pfx e a senha." };
  const pfx = Buffer.from(await arquivo.arrayBuffer());
  let validade: Date;
  try {
    validade = carregarCertificado(pfx, senha).validade; // valida senha + extrai validade
  } catch {
    return { erro: "Certificado ou senha inválidos." };
  }
  const chave = required(process.env.NFSE_CERT_KEY, "NFSE_CERT_KEY");
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("nfse_certificado").upsert({
    id: 1,
    nome_arquivo: arquivo.name,
    pfx_cifrado: cifrar(pfx, chave),
    senha_cifrada: cifrar(Buffer.from(senha, "utf8"), chave),
    validade: validade.toISOString(),
    atualizado_em: new Date().toISOString(),
  });
  if (error) return { erro: "Falha ao salvar o certificado." };
  revalidatePath("/configuracoes/nfse");
  return { ok: true };
}
```

- [ ] **Step 2: Página + formulários** — `page.tsx` (server, gate admin, lê config/validade do cert) renderiza `Formularios.tsx` (client, dois formulários com `useActionState` chamando as actions). Campos do config: cnpj, im, razao_social, codigo_municipio (default `3170206`), uf (`MG`), item_lc116 (`17.19`), codigo_trib, aliquota_iss, natureza, simples (checkbox), ambiente (select homologacao/producao). Form do certificado: input `type="file"` name `pfx` + input senha + aviso da validade atual. Seguir o estilo das telas existentes (classes Tailwind de `DocumentosSection`).

```tsx
// trecho central de Formularios.tsx (client)
"use client";
import { useActionState } from "react";
import { salvarConfig, salvarCertificado, type EstadoConfig } from "./actions";
export function FormConfig({ inicial }: { inicial: Record<string, string> }) {
  const [estado, action, pend] = useActionState<EstadoConfig, FormData>(salvarConfig, {});
  return (
    <form action={action} className="space-y-2 text-sm">
      {/* inputs com defaultValue={inicial.x} — cnpj, im, razao_social, codigo_municipio, uf,
          item_lc116, codigo_trib, aliquota_iss, natureza, simples (checkbox), ambiente (select) */}
      {estado.erro && <p role="alert" className="text-red-600">{estado.erro}</p>}
      {estado.ok && <p className="text-green-700">Salvo ✓</p>}
      <button disabled={pend} className="rounded bg-slate-900 px-3 py-1 text-white">Salvar configuração</button>
    </form>
  );
}
```

- [ ] **Step 3: Verificar** — Run: `npm run lint && npm run typecheck && npm run build` · Expected: verde; rota `/configuracoes/nfse` presente.
- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/configuracoes/nfse"
git commit -m "feat(nfse): tela admin de config fiscal + upload do certificado"
```

---

## Task 9: Action de emissão + carregamento da config/cert

**Files:** Create `src/app/(app)/clientes/[id]/nfse.ts`.

**Interfaces:** Consumes `montarDps` (T5), `assinarDps` (T6), `enviarDps` (T7), `carregarCertificado` (T4), `decifrar` (T2). Produces `type EstadoNfse = { erro?: string; ok?: boolean }`; `emitirNfse(clienteId: string, _prev: EstadoNfse, formData: FormData): Promise<EstadoNfse>`.

- [ ] **Step 1: Implementar**

```ts
// src/app/(app)/clientes/[id]/nfse.ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { required } from "@/lib/env";
import { decifrar } from "@/lib/nfse/cripto";
import { carregarCertificado } from "@/lib/nfse/certificado";
import { montarDps } from "@/lib/nfse/dps";
import { assinarDps } from "@/lib/nfse/assinatura";
import { enviarDps } from "@/lib/nfse/envio";
import type { ConfigFiscal, Tomador } from "@/lib/nfse/tipos";

export type EstadoNfse = { erro?: string; ok?: boolean };

export async function emitirNfse(clienteId: string, _prev: EstadoNfse, formData: FormData): Promise<EstadoNfse> {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo) return { erro: "Sessão expirada." };
  if (!podeVerHonorario(perfil.papel)) return { erro: "Sem permissão para emitir NFS-e." };
  const competencia = String(formData.get("competencia") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return { erro: "Informe a competência." };

  const supabase = await createServerSupabase();
  const { data: cfg } = await supabase.from("nfse_config").select("*").eq("id", 1).maybeSingle();
  if (!cfg || !cfg.cnpj || !cfg.item_lc116) return { erro: "Configure os dados fiscais em Configurações → NFS-e." };
  const { data: certRow } = await supabase.from("nfse_certificado").select("*").eq("id", 1).maybeSingle();
  if (!certRow) return { erro: "Cadastre o certificado A1 em Configurações → NFS-e." };

  const { data: cliente } = await supabase
    .from("clientes")
    .select("razao_social, cnpj, cpf, email, endereco")
    .eq("id", clienteId)
    .maybeSingle();
  if (!cliente) return { erro: "Cliente não encontrado." };
  const documento = String(cliente.cnpj ?? cliente.cpf ?? "").replace(/\D/g, "");
  if (!documento) return { erro: "Cliente sem CNPJ/CPF — necessário para a NFS-e." };
  // Honorário fica em clientes_financeiro (RLS = admin/financeiro/contador-dono).
  const { data: fin } = await supabase
    .from("clientes_financeiro")
    .select("honorario_mensal")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  const honorario = Number(fin?.honorario_mensal ?? 0);
  if (!honorario || honorario <= 0) return { erro: "Cliente sem honorário definido." };

  // Anti-duplicidade: já há nota autorizada nesta competência?
  const { data: existente } = await supabase
    .from("nfse")
    .select("id")
    .eq("cliente_id", clienteId)
    .eq("competencia", competencia)
    .eq("status", "autorizada")
    .maybeSingle();
  if (existente) return { erro: "Já existe NFS-e autorizada para este cliente nesta competência." };

  const chave = required(process.env.NFSE_CERT_KEY, "NFSE_CERT_KEY");
  const pfx = decifrar(certRow.pfx_cifrado, chave);
  const senha = decifrar(certRow.senha_cifrada, chave).toString("utf8");
  let cert;
  try {
    cert = carregarCertificado(pfx, senha);
  } catch {
    return { erro: "Falha ao abrir o certificado." };
  }
  if (cert.validade.getTime() < Date.now()) return { erro: "Certificado expirado." };

  const config: ConfigFiscal = {
    cnpj: cfg.cnpj, inscricaoMunicipal: cfg.inscricao_municipal, razaoSocial: cfg.razao_social,
    codigoMunicipio: cfg.codigo_municipio, uf: cfg.uf, itemLc116: cfg.item_lc116,
    codigoTributacaoMunicipal: cfg.codigo_tributacao_municipal, aliquotaIss: Number(cfg.aliquota_iss),
    naturezaOperacao: cfg.natureza_operacao, simplesNacional: cfg.simples_nacional, ambiente: cfg.ambiente,
  };
  const tomador: Tomador = { documento, razaoSocial: cliente.razao_social, email: cliente.email ?? undefined,
    endereco: (cliente.endereco as Record<string, string>) ?? undefined };

  // número da DPS: sequencial simples por contagem (a Sefin controla o número final da NFS-e)
  const { count } = await supabase.from("nfse").select("id", { count: "exact", head: true });
  const numeroDps = String((count ?? 0) + 1);

  const { xml, idDps } = montarDps({ config, tomador, valor: honorario, competencia, serie: "1", numeroDps });
  const assinado = assinarDps(xml, idDps, cert);

  let resultado;
  try {
    resultado = await enviarDps(assinado, { pfx: cert.pfx, senha: cert.senha }, config.ambiente);
  } catch (e) {
    console.error("emitirNfse:", e instanceof Error ? e.message : e);
    await supabase.from("nfse").insert({ cliente_id: clienteId, valor: honorario, competencia,
      status: "erro", dps_xml: assinado, ambiente: config.ambiente, mensagens: [{ descricao: "Falha de comunicação" }] });
    revalidatePath(`/clientes/${clienteId}`);
    return { erro: "Falha ao comunicar com a Sefin. Registrada como erro." };
  }

  await supabase.from("nfse").insert({
    cliente_id: clienteId, valor: honorario, competencia,
    status: resultado.autorizada ? "autorizada" : "rejeitada",
    chave_acesso: resultado.chaveAcesso ?? null, numero: resultado.numero ?? null,
    dps_xml: assinado, nfse_xml: resultado.xmlNfse ?? null,
    mensagens: resultado.mensagens ? resultado.mensagens.map((m) => ({ descricao: m })) : null,
    ambiente: config.ambiente, autorizada_em: resultado.autorizada ? new Date().toISOString() : null,
  });
  revalidatePath(`/clientes/${clienteId}`);
  return resultado.autorizada ? { ok: true } : { erro: `Rejeitada: ${resultado.mensagens?.join("; ")}` };
}
```

- [ ] **Step 2: Verificar** — Run: `npm run lint && npm run typecheck` · Expected: verde. (Schema confirmado: `clientes` tem `razao_social`/`cnpj`/`cpf`/`email`/`endereco` (0003); honorário = `clientes_financeiro.honorario_mensal` (0004, RLS financeira).)
- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/clientes/[id]/nfse.ts"
git commit -m "feat(nfse): action de emissão a partir do honorário"
```

---

## Task 10: UI na ficha (emitir + notas fiscais)

**Files:** Create `src/components/nfse/EmitirNfse.tsx`, `src/components/nfse/NotasFiscaisSection.tsx`; Modify `src/app/(app)/clientes/[id]/page.tsx`.

**Interfaces:** Consumes `emitirNfse` (T9).

- [ ] **Step 1: `EmitirNfse.tsx`** (client) — botão que abre um form com `competencia` (input month → dia 01) e confirmação do valor (honorário exibido); chama `emitirNfse.bind(null, clienteId)` via `useActionState`; mostra erro/sucesso. Avisar quando ambiente = homologação (prop `ambiente`).

```tsx
"use client";
import { useActionState, useState } from "react";
import { emitirNfse, type EstadoNfse } from "@/app/(app)/clientes/[id]/nfse";
export function EmitirNfse({ clienteId, honorario, ambiente }: { clienteId: string; honorario: number; ambiente: string }) {
  const [estado, action, pend] = useActionState<EstadoNfse, FormData>(emitirNfse.bind(null, clienteId), {});
  const [aberto, setAberto] = useState(false);
  if (estado.ok) return <span className="text-xs text-green-700">NFS-e emitida ✓</span>;
  if (!aberto) return <button onClick={() => setAberto(true)} className="rounded border px-2 py-1 text-xs">Emitir NFS-e</button>;
  return (
    <form action={action} className="mt-2 space-y-2 rounded border p-3 text-sm">
      {ambiente === "homologacao" && <p className="text-amber-700">Homologação — sem validade jurídica.</p>}
      <p>Valor (honorário): <strong>R$ {honorario.toFixed(2)}</strong></p>
      <label className="block">Competência
        <input type="month" name="competencia_mes" required className="ml-2 rounded border px-2 py-1"
          onChange={(e) => { const h = e.currentTarget.form!.elements.namedItem("competencia") as HTMLInputElement; h.value = e.currentTarget.value ? `${e.currentTarget.value}-01` : ""; }} />
      </label>
      <input type="hidden" name="competencia" />
      {estado.erro && <p role="alert" className="text-red-600">{estado.erro}</p>}
      <div className="flex gap-2">
        <button disabled={pend} className="rounded bg-slate-900 px-3 py-1 text-white">{pend ? "Emitindo..." : "Emitir"}</button>
        <button type="button" onClick={() => setAberto(false)} className="rounded border px-3 py-1">Cancelar</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: `NotasFiscaisSection.tsx`** (server) — carrega `nfse` do cliente (RLS) e o `honorario`/`ambiente` (config); renderiza a lista (competência, número, status, valor) com download do XML (link) e o botão `EmitirNfse`. Só aparece para quem passa em `podeVerHonorario` (passar `papel` como prop e checar).

- [ ] **Step 3: Integrar na ficha** — em `page.tsx`, após `DocumentosSection`, renderizar `<NotasFiscaisSection clienteId={id} papel={papel} />` (a seção lê honorário/config/ambiente e a lista internamente).

- [ ] **Step 4: Verificar** — Run: `npm run lint && npm run typecheck && npm run build` · Expected: verde.
- [ ] **Step 5: Commit**

```bash
git add src/components/nfse "src/app/(app)/clientes/[id]/page.tsx"
git commit -m "feat(nfse): UI de emissão e lista de notas na ficha"
```

---

## Task 11: Env, deploy e E2E em homologação

**Files:** Modify `.env.local.example`, `docs/DEPLOY.md`. Verificação (sem código de app).

- [ ] **Step 1: `.env.local.example`**

```
# NFS-e nacional (V5). Segredos runtime, só no servidor.
NFSE_AMBIENTE=homologacao
NFSE_URL_HOMOLOGACAO=https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional
NFSE_URL_PRODUCAO=https://sefin.nfse.gov.br/API/SefinNacional
NFSE_CERT_KEY=            # 32 bytes em hex (gerar: openssl rand -hex 32)
```

- [ ] **Step 2: Guia em `docs/DEPLOY.md`** — seção "NFS-e (V5)": gerar `NFSE_CERT_KEY` (`openssl rand -hex 32`); definir as URLs (homologação/produção); no EasyPanel, setar as vars (runtime); em Configurações → NFS-e do app, preencher a config fiscal e subir o certificado A1; confirmar a URL/Swagger da produção restrita; trocar `nfse_config.ambiente` para `producao` só após validar em homologação.

- [ ] **Step 3: Commit**

```bash
git add .env.local.example docs/DEPLOY.md
git commit -m "docs(nfse): variáveis de ambiente e guia de deploy"
```

- [ ] **Step 4: E2E homologação (com o usuário)** — definir `NFSE_CERT_KEY` e as URLs no `.env.local`; subir o app; em Configurações → NFS-e, preencher os dados fiscais reais e subir o **certificado A1** (de homologação, se houver, ou o real em ambiente `homologacao`); emitir uma NFS-e para um cliente com CNPJ + honorário; conferir: status `autorizada`, chave de acesso, XML da NFS-e. Ajustar `montarDps`/`parseResposta` **se** a Sefin rejeitar por layout/campo (ajustes isolados nesses dois pontos + o XSD).
- [ ] **Step 5: Suíte completa** — Run: `npm run lint && npm run typecheck && npm test && npm run db:test` · Expected: verde.
- [ ] **Step 6:** Atualizar `CHANGELOG.md`/`ROADMAP.md` (V5-A) e finalizar a branch (release `v5.0.0`).

---

## Self-Review (resultado)

- **Cobertura do spec:** §5 config → T3/T8; §6 certificado → T2/T4/T8; §7 motor → T5(dps)/T6(assinatura)/T7(envio); §8 dados/RLS → T3; §9 UI/fluxo → T9/T10; §10 erros → T9 (bloqueios: tomador/cert/config; rejeição; anti-duplicidade); §11 testes → T2/T4/T5/T6/T7 + E2E T11; §12 segurança → T2/T8 (cifra, gate admin, env).
- **Placeholders:** sem TODO/TBD de plano. Pontos de terceiro genuinamente incertos (nome de campo JSON da Sefin, layout exato do XSD, nomes de propriedade da versão do `xml-crypto`) estão **isolados** em `montarDps`/`parseResposta`/`assinarDps` e validados na homologação (T11), com o XSD baixado no repo — não são placeholders de lógica, e sim variação de terceiro confirmada em ambiente.
- **Consistência de tipos:** `ConfigFiscal`/`Tomador`/`DadosDps`/`Certificado`/`ResultadoEmissao` (T4) usados em T5–T9; `montarDps→{xml,idDps}` alimenta `assinarDps(xml,idDps,cert)`; `enviarDps(...)→ResultadoEmissao` consumido em T9; `cifrar`/`decifrar` (T2) em T8/T9.
- **Risco a validar cedo (T6/T11):** a canonicalização/Reference da assinatura e o layout da DPS — por isso a homologação é obrigatória antes de produção.
- **Schema confirmado:** `clientes` (0003) tem `razao_social`/`cnpj`/`cpf`/`email`/`endereco`; o honorário fica em `clientes_financeiro.honorario_mensal` (0004, RLS financeira) — a action lê de lá (não de `clientes`).
