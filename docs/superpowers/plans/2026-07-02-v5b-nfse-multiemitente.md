# V5-B — NFS-e dos clientes (multi-emitente) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que cada cliente do CRM emita suas próprias NFS-e (como prestador/emitente), com config fiscal e certificado A1 próprios, para tomadores externos digitados por nota.

**Architecture:** Abordagem A — reaproveitar o motor `src/lib/nfse/` (já parametrizado por config/cert/ambiente) e adicionar armazenamento por cliente: tabelas `nfse_emitente` e `nfse_certificado_cliente` (1:1 com `clientes`), numeração de DPS por cliente (RPC atômica), colunas `emitente`/tomador em `nfse`, e um mapeador puro `emitenteParaConfig`. UI numa seção própria na ficha do cliente. A V5-A (honorários do escritório) fica intacta.

**Tech Stack:** Next.js 16 (App Router, server actions), TypeScript, Tailwind 4, Supabase (Postgres/RLS), Vitest. Motor NFS-e existente: `node-forge`, `xml-crypto`, `xmlbuilder2`, node:crypto/zlib/https. Migrations via runner próprio `npm run db:migrate`.

## Global Constraints

- Migrations via `npm run db:migrate` (rastreia `app_migrations`); **nunca** `supabase db push`. Idempotentes (`create table if not exists`, `add column if not exists`, `drop policy if exists`/`create policy`, `create or replace function`).
- Migrations aplicadas são imutáveis — mudança = nova migration. Próxima livre: **0025**.
- Papel (RBAC) lido **só** de `usuarios.papel` via `getPerfilAtual()` / `auth_papel()`. Nunca do JWT.
- Segredos runtime-only: `NFSE_CERT_KEY` nunca `NEXT_PUBLIC_`. Certificado cifrado AES-256-GCM.
- Imports pelo alias `@/*`. Imagens via `next/image`.
- Rodar antes de cada commit: `npm run lint && npm run typecheck && npm test`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Reaproveitar o motor sem alterá-lo: `montarDps`, `assinarDps`, `enviarDps`, `ehErroTransitorio`, `carregarCertificado`, `cifrar`/`decifrar`, `montarEventoCancelamento`/`assinarEvento`/`enviarCancelamento`, `baixarDanfsePdf`. Tipo `ConfigFiscal`/`Tomador` de `@/lib/nfse/tipos`.

## File Structure

- **Create** `supabase/migrations/0025_nfse_multiemitente.sql` — tabelas, colunas, RPC, RLS.
- **Create** `src/lib/nfse/emitente.ts` — `emitenteParaConfig` (puro).
- **Create** `src/tests/nfse/emitente.test.ts` — teste do mapeador.
- **Create** `src/app/(app)/clientes/[id]/nfse-emitente.ts` — actions do multi-emitente (config + emissão).
- **Create** `src/components/nfse/EmitenteConfig.tsx` — form fiscal + upload do certificado (admin).
- **Create** `src/components/nfse/EmitirNfseCliente.tsx` — form de emissão por nota.
- **Create** `src/components/nfse/EmissaoClienteSection.tsx` — seção da ficha (config + emissão + lista).
- **Modify** `src/lib/clientes/permissoes.ts` — `podeConfigurarNfse`.
- **Create** `src/tests/clientes/permissoes.test.ts` (estender) — teste de `podeConfigurarNfse`.
- **Modify** `src/app/(app)/clientes/[id]/nfse.ts` — `cancelarNfse` e `baixarDanfseNfse` resolvem o certificado pelo emitente da nota.
- **Modify** `src/app/(app)/clientes/[id]/page.tsx` — renderiza `EmissaoClienteSection`.
- **Modify** `supabase/tests/rls.test.sql` — RLS das tabelas novas.

---

### Task 1: Migration — tabelas, colunas e numeração por cliente

**Files:**
- Create: `supabase/migrations/0025_nfse_multiemitente.sql`

**Interfaces:**
- Produces: tabelas `nfse_emitente`, `nfse_certificado_cliente`; colunas `nfse.emitente`, `nfse.tomador_documento`, `nfse.tomador_razao_social`, `nfse.tomador_endereco`, `nfse.descricao_servico`; função `proximo_ndps_cliente(uuid) returns bigint`.

- [ ] **Step 1: Escrever a migration**

Arquivo `supabase/migrations/0025_nfse_multiemitente.sql`:

```sql
-- V5-B: NFS-e dos clientes (multi-emitente). Idempotente.

-- Config fiscal por cliente-emitente (identidade CNPJ/IM/razão/endereço vem de clientes).
create table if not exists nfse_emitente (
  cliente_id uuid primary key references clientes(id) on delete cascade,
  codigo_municipio text,
  item_lc116 text,
  codigo_servico_nacional text,
  codigo_tributacao_municipal text,
  aliquota_iss numeric,
  pct_trib_sn numeric,
  simples_nacional boolean not null default true,
  natureza_operacao text,
  descricao_servico_padrao text,
  serie text not null default '1',
  proximo_ndps bigint not null default 1,
  ambiente text not null default 'homologacao',
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

-- Certificado A1 por cliente (cifrado, mesma NFSE_CERT_KEY da V5-A).
create table if not exists nfse_certificado_cliente (
  cliente_id uuid primary key references clientes(id) on delete cascade,
  nome_arquivo text,
  pfx_cifrado text,
  senha_cifrada text,
  validade timestamptz,
  atualizado_em timestamptz not null default now()
);

-- Distingue emissão do escritório (V5-A) x do cliente (V5-B); snapshot do tomador externo.
alter table nfse add column if not exists emitente text not null default 'escritorio'
  check (emitente in ('escritorio','cliente'));
alter table nfse add column if not exists tomador_documento text;
alter table nfse add column if not exists tomador_razao_social text;
alter table nfse add column if not exists tomador_endereco jsonb;
alter table nfse add column if not exists descricao_servico text;

alter table nfse_emitente enable row level security;
alter table nfse_certificado_cliente enable row level security;

-- Config e certificado do cliente-emitente: só admin (dado fiscal sensível).
drop policy if exists nfse_emitente_admin on nfse_emitente;
create policy nfse_emitente_admin on nfse_emitente for all to authenticated
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
drop policy if exists nfse_cert_cliente_admin on nfse_certificado_cliente;
create policy nfse_cert_cliente_admin on nfse_certificado_cliente for all to authenticated
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');

-- Numeração de DPS por cliente (atômica; evita reuso — erro E0014).
create or replace function proximo_ndps_cliente(p_cliente_id uuid) returns bigint
  language plpgsql security definer set search_path = pg_catalog, public as $$
declare n bigint;
begin
  update nfse_emitente set proximo_ndps = proximo_ndps + 1
    where cliente_id = p_cliente_id
    returning proximo_ndps - 1 into n;
  if n is null then raise exception 'emitente nao configurado'; end if;
  return n;
end; $$;
grant execute on function proximo_ndps_cliente(uuid) to authenticated;
```

- [ ] **Step 2: Aplicar a migration**

Run: `npm run db:migrate`
Expected: `+ aplicando: 0025_nfse_multiemitente.sql` sem erro.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0025_nfse_multiemitente.sql
git commit -m "feat(db): tabelas e numeração do multi-emitente NFS-e (V5-B)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Permissão `podeConfigurarNfse`

**Files:**
- Modify: `src/lib/clientes/permissoes.ts`
- Modify: `src/tests/clientes/permissoes.test.ts`

**Interfaces:**
- Produces: `podeConfigurarNfse(papel: Papel | undefined): boolean` — true só para `"admin"`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar em `src/tests/clientes/permissoes.test.ts`:

```ts
import { podeConfigurarNfse } from "@/lib/clientes/permissoes";

describe("podeConfigurarNfse", () => {
  it("permite apenas admin", () => {
    expect(podeConfigurarNfse("admin")).toBe(true);
    expect(podeConfigurarNfse("financeiro")).toBe(false);
    expect(podeConfigurarNfse("contador")).toBe(false);
    expect(podeConfigurarNfse(undefined)).toBe(false);
  });
});
```

(Adicionar `podeConfigurarNfse` ao `import` existente de `@/lib/clientes/permissoes` no topo do arquivo, ou usar o import dedicado acima.)

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- src/tests/clientes/permissoes.test.ts`
Expected: FAIL — `podeConfigurarNfse` não existe.

- [ ] **Step 3: Implementar**

Ao final de `src/lib/clientes/permissoes.ts`:

```ts
// Quem configura a NFS-e do cliente-emitente (dados fiscais + certificado): só admin.
// Custódia de certificado é sensível — mesma regra da config do escritório (V5-A).
export function podeConfigurarNfse(papel: Papel | undefined): boolean {
  return papel === "admin";
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- src/tests/clientes/permissoes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clientes/permissoes.ts src/tests/clientes/permissoes.test.ts
git commit -m "feat: permissao podeConfigurarNfse (admin)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Mapeador `emitenteParaConfig`

**Files:**
- Create: `src/lib/nfse/emitente.ts`
- Create: `src/tests/nfse/emitente.test.ts`

**Interfaces:**
- Consumes: `ConfigFiscal` de `@/lib/nfse/tipos`.
- Produces:
  - `type EmitenteRow` (campos de `nfse_emitente` usados na config).
  - `type ClienteIdentidade` (`cpf_cnpj`, `inscricao_municipal`, `razao_social`, `endereco`).
  - `emitenteParaConfig(emitente: EmitenteRow, cliente: ClienteIdentidade, descricaoServico: string): ConfigFiscal`.

- [ ] **Step 1: Escrever o teste que falha**

Arquivo `src/tests/nfse/emitente.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { emitenteParaConfig } from "@/lib/nfse/emitente";

const emitente = {
  codigo_municipio: "3170206",
  item_lc116: "17.19",
  codigo_servico_nacional: "170201",
  codigo_tributacao_municipal: "170201",
  aliquota_iss: 2,
  pct_trib_sn: 6,
  simples_nacional: true,
  natureza_operacao: "1",
  descricao_servico_padrao: "Consultoria",
  ambiente: "producao",
};
const cliente = {
  cpf_cnpj: "53.627.128/0001-46",
  inscricao_municipal: "66277400",
  razao_social: "ELEVARE ADVISORY LTDA",
  endereco: { uf: "MG", cidade: "Uberlandia" },
};

describe("emitenteParaConfig", () => {
  it("monta o ConfigFiscal com CNPJ só dígitos e campos do emitente", () => {
    const c = emitenteParaConfig(emitente, cliente, "Servico X");
    expect(c.cnpj).toBe("53627128000146");
    expect(c.codigoMunicipio).toBe("3170206");
    expect(c.codigoServicoNacional).toBe("170201");
    expect(c.descricaoServico).toBe("Servico X");
    expect(c.aliquotaIss).toBe(2);
    expect(c.pctTribSN).toBe(6);
    expect(c.simplesNacional).toBe(true);
    expect(c.ambiente).toBe("producao");
  });
  it("usa a descrição padrão do emitente quando a descrição da nota é vazia", () => {
    const c = emitenteParaConfig(emitente, cliente, "");
    expect(c.descricaoServico).toBe("Consultoria");
  });
  it("normaliza ambiente inválido para homologacao", () => {
    const c = emitenteParaConfig({ ...emitente, ambiente: "x" }, cliente, "s");
    expect(c.ambiente).toBe("homologacao");
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- src/tests/nfse/emitente.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o mapeador**

Arquivo `src/lib/nfse/emitente.ts`:

```ts
import type { ConfigFiscal } from "./tipos";

// Campos de nfse_emitente usados na montagem da config fiscal.
export type EmitenteRow = {
  codigo_municipio: string | null;
  codigo_servico_nacional: string | null;
  aliquota_iss: number | null;
  pct_trib_sn: number | null;
  simples_nacional: boolean;
  descricao_servico_padrao: string | null;
  ambiente: string;
};

// Identidade do emitente reaproveitada do cadastro do cliente.
export type ClienteIdentidade = {
  cpf_cnpj: string | null;
  inscricao_municipal: string | null;
  razao_social: string;
  endereco: Record<string, string> | null;
};

// Monta o ConfigFiscal (tipo do motor) a partir do emitente + identidade do cliente.
// A descrição da nota tem prioridade; se vazia, usa a descrição padrão do emitente.
// dps.ts não usa uf/inscricaoMunicipal, mas os populamos por completude.
export function emitenteParaConfig(
  emitente: EmitenteRow,
  cliente: ClienteIdentidade,
  descricaoServico: string,
): ConfigFiscal {
  return {
    cnpj: String(cliente.cpf_cnpj ?? "").replace(/\D/g, ""),
    inscricaoMunicipal: cliente.inscricao_municipal ?? "",
    razaoSocial: cliente.razao_social,
    codigoMunicipio: emitente.codigo_municipio ?? "",
    uf: cliente.endereco?.uf ?? "",
    codigoServicoNacional: emitente.codigo_servico_nacional ?? "",
    descricaoServico: descricaoServico.trim() || emitente.descricao_servico_padrao || "Servico",
    aliquotaIss: Number(emitente.aliquota_iss ?? 0),
    pctTribSN: Number(emitente.pct_trib_sn ?? 0),
    simplesNacional: emitente.simples_nacional,
    ambiente: emitente.ambiente === "producao" ? "producao" : "homologacao",
  };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- src/tests/nfse/emitente.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nfse/emitente.ts src/tests/nfse/emitente.test.ts
git commit -m "feat: mapeador emitenteParaConfig (V5-B)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Actions de configuração do emitente

**Files:**
- Create: `src/app/(app)/clientes/[id]/nfse-emitente.ts`

**Interfaces:**
- Consumes: `getPerfilAtual`, `createServerSupabase`, `podeConfigurarNfse`, `cifrar`, `carregarCertificado`, `required`.
- Produces:
  - `type EstadoEmitente = { erro?: string; ok?: boolean }`
  - `salvarEmitente(clienteId: string, _prev: EstadoEmitente, formData: FormData): Promise<EstadoEmitente>`
  - `salvarCertificadoCliente(clienteId: string, _prev: EstadoEmitente, formData: FormData): Promise<EstadoEmitente>`

- [ ] **Step 1: Criar o arquivo com as actions de config**

Arquivo `src/app/(app)/clientes/[id]/nfse-emitente.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeConfigurarNfse } from "@/lib/clientes/permissoes";
import { required } from "@/lib/env";
import { cifrar } from "@/lib/nfse/cripto";
import { carregarCertificado } from "@/lib/nfse/certificado";

export type EstadoEmitente = { erro?: string; ok?: boolean };

async function exigirAdmin(): Promise<boolean> {
  const perfil = await getPerfilAtual();
  return Boolean(perfil?.ativo && podeConfigurarNfse(perfil.papel));
}

// Salva os dados fiscais do cliente-emitente (upsert por cliente_id).
export async function salvarEmitente(
  clienteId: string,
  _prev: EstadoEmitente,
  formData: FormData,
): Promise<EstadoEmitente> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("nfse_emitente").upsert({
    cliente_id: clienteId,
    codigo_municipio: String(formData.get("codigo_municipio") ?? "").trim(),
    item_lc116: String(formData.get("item_lc116") ?? "").trim(),
    codigo_servico_nacional: String(formData.get("codigo_servico_nacional") ?? "").replace(/\D/g, ""),
    codigo_tributacao_municipal: String(formData.get("codigo_tributacao_municipal") ?? "").trim(),
    aliquota_iss: Number(formData.get("aliquota_iss") ?? 0),
    pct_trib_sn: Number(formData.get("pct_trib_sn") ?? 0),
    simples_nacional: formData.get("simples") === "on",
    natureza_operacao: String(formData.get("natureza_operacao") ?? "").trim() || null,
    descricao_servico_padrao: String(formData.get("descricao_servico_padrao") ?? "").trim() || null,
    serie: String(formData.get("serie") ?? "1").trim() || "1",
    ambiente: String(formData.get("ambiente") ?? "homologacao"),
    atualizado_em: new Date().toISOString(),
  }, { onConflict: "cliente_id" });
  if (error) return { erro: "Falha ao salvar os dados do emitente." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

// Salva o certificado A1 do cliente-emitente (cifrado; valida senha e extrai validade).
export async function salvarCertificadoCliente(
  clienteId: string,
  _prev: EstadoEmitente,
  formData: FormData,
): Promise<EstadoEmitente> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const arquivo = formData.get("pfx") as File | null;
  const senha = String(formData.get("senha") ?? "");
  if (!arquivo || arquivo.size === 0 || !senha) return { erro: "Envie o .pfx e a senha." };
  const pfx = Buffer.from(await arquivo.arrayBuffer());
  let validade: Date;
  try {
    validade = carregarCertificado(pfx, senha).validade;
  } catch {
    return { erro: "Certificado ou senha inválidos." };
  }
  const chave = required(process.env.NFSE_CERT_KEY, "NFSE_CERT_KEY");
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("nfse_certificado_cliente").upsert({
    cliente_id: clienteId,
    nome_arquivo: arquivo.name,
    pfx_cifrado: cifrar(pfx, chave),
    senha_cifrada: cifrar(Buffer.from(senha, "utf8"), chave),
    validade: validade.toISOString(),
    atualizado_em: new Date().toISOString(),
  }, { onConflict: "cliente_id" });
  if (error) return { erro: "Falha ao salvar o certificado." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
```

- [ ] **Step 2: Verificar lint/typecheck**

Run: `npm run lint && npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/clientes/[id]/nfse-emitente.ts"
git commit -m "feat: actions de config do cliente-emitente (V5-B)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Action de emissão `emitirNfseDoCliente`

**Files:**
- Modify: `src/app/(app)/clientes/[id]/nfse-emitente.ts`

**Interfaces:**
- Consumes: `decifrar`, `carregarCertificado`, `montarDps`, `assinarDps`, `enviarDps`, `ehErroTransitorio`, `emitenteParaConfig` (Task 3), `podeVerHonorario`, `createServerSupabase`, `getPerfilAtual`.
- Produces:
  - `type DadosEmissaoCliente = { tomadorDocumento: string; tomadorRazaoSocial: string; tomadorEndereco: Record<string,string>; descricaoServico: string; valor: number; competencia: string }`
  - `emitirNfseDoCliente(clienteId: string, dados: DadosEmissaoCliente): Promise<{ status: string; motivo?: string; chave?: string; numero?: string }>`
  - `emitirComoEmitente(clienteId: string, _prev: EstadoEmitente, formData: FormData): Promise<EstadoEmitente>` (wrapper do form).

- [ ] **Step 1: Adicionar imports do motor no topo de `nfse-emitente.ts`**

Acrescentar aos imports existentes:

```ts
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { decifrar } from "@/lib/nfse/cripto";
import { montarDps } from "@/lib/nfse/dps";
import { assinarDps } from "@/lib/nfse/assinatura";
import { enviarDps, ehErroTransitorio } from "@/lib/nfse/envio";
import { emitenteParaConfig } from "@/lib/nfse/emitente";
import type { Tomador } from "@/lib/nfse/tipos";
```

- [ ] **Step 2: Implementar a emissão (append em `nfse-emitente.ts`)**

```ts
export type DadosEmissaoCliente = {
  tomadorDocumento: string;
  tomadorRazaoSocial: string;
  tomadorEndereco: Record<string, string>;
  descricaoServico: string;
  valor: number;
  competencia: string;
};

// Emite uma NFS-e tendo o CLIENTE (clienteId) como emitente/prestador e um
// tomador externo digitado. Reaproveita o motor da V5-A.
export async function emitirNfseDoCliente(
  clienteId: string,
  dados: DadosEmissaoCliente,
): Promise<{ status: string; motivo?: string; chave?: string; numero?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeVerHonorario(perfil.papel)) return { status: "erro", motivo: "Sem permissão." };
  const supabase = await createServerSupabase();

  const { data: emitente } = await supabase
    .from("nfse_emitente")
    .select("*")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (!emitente?.codigo_municipio || !emitente.codigo_servico_nacional)
    return { status: "erro", motivo: "Emitente sem configuração fiscal completa." };

  const { data: cliente } = await supabase
    .from("clientes")
    .select("cpf_cnpj, inscricao_municipal, razao_social, endereco")
    .eq("id", clienteId)
    .maybeSingle();
  if (!cliente?.cpf_cnpj) return { status: "erro", motivo: "Cliente sem CNPJ/CPF." };

  const documento = dados.tomadorDocumento.replace(/\D/g, "");
  if (documento.length !== 11 && documento.length !== 14)
    return { status: "erro", motivo: "Documento do tomador inválido." };
  if (!dados.tomadorEndereco?.cep || !dados.tomadorEndereco?.logradouro)
    return { status: "erro", motivo: "Endereço do tomador incompleto (CEP e logradouro)." };
  if (!dados.valor || dados.valor <= 0) return { status: "erro", motivo: "Valor inválido." };

  const { data: certRow } = await supabase
    .from("nfse_certificado_cliente")
    .select("pfx_cifrado, senha_cifrada")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (!certRow) return { status: "erro", motivo: "Certificado do cliente não cadastrado." };

  const chaveKey = required(process.env.NFSE_CERT_KEY, "NFSE_CERT_KEY");
  let cert;
  try {
    const pfx = decifrar(certRow.pfx_cifrado, chaveKey);
    const senha = decifrar(certRow.senha_cifrada, chaveKey).toString("utf8");
    cert = carregarCertificado(pfx, senha);
  } catch {
    return { status: "erro", motivo: "Falha ao abrir o certificado." };
  }
  if (cert.validade.getTime() < Date.now()) return { status: "erro", motivo: "Certificado expirado." };

  const config = emitenteParaConfig(emitente, cliente, dados.descricaoServico);
  const tomador: Tomador = {
    documento,
    razaoSocial: dados.tomadorRazaoSocial,
    endereco: dados.tomadorEndereco,
  };
  const ambiente = config.ambiente;

  const { data: ndps, error: ndpsErr } = await supabase.rpc("proximo_ndps_cliente", { p_cliente_id: clienteId });
  if (ndpsErr) return { status: "erro", motivo: "Falha na numeração da nota." };
  const numeroDps = String(ndps);
  const { xml, idDps } = montarDps({ config, tomador, valor: dados.valor, competencia: dados.competencia, serie: emitente.serie, numeroDps });
  const assinado = assinarDps(xml, idDps, cert);

  const baseRow = {
    cliente_id: clienteId,
    emitente: "cliente" as const,
    valor: dados.valor,
    competencia: dados.competencia,
    ambiente,
    tomador_documento: documento,
    tomador_razao_social: dados.tomadorRazaoSocial,
    tomador_endereco: dados.tomadorEndereco,
    descricao_servico: config.descricaoServico,
    dps_xml: assinado,
  };

  let resultado;
  try {
    resultado = await enviarDps(assinado, { pfx: cert.pfx, senha: cert.senha }, ambiente);
    for (let t = 0; t < 2 && !resultado.autorizada && ehErroTransitorio(resultado.mensagens); t++) {
      await new Promise((r) => setTimeout(r, 1500));
      resultado = await enviarDps(assinado, { pfx: cert.pfx, senha: cert.senha }, ambiente);
    }
  } catch (e) {
    console.error("emitirNfseDoCliente:", e instanceof Error ? e.message : e);
    await supabase.from("nfse").insert({ ...baseRow, status: "erro", mensagens: [{ descricao: "Falha de comunicação" }] });
    return { status: "erro", motivo: "Falha de comunicação com a Sefin." };
  }

  await supabase.from("nfse").insert({
    ...baseRow,
    status: resultado.autorizada ? "autorizada" : "rejeitada",
    chave_acesso: resultado.chaveAcesso ?? null,
    numero: resultado.numero ?? null,
    nfse_xml: resultado.xmlNfse ?? null,
    mensagens: resultado.mensagens ? resultado.mensagens.map((m) => ({ descricao: m })) : null,
    autorizada_em: resultado.autorizada ? new Date().toISOString() : null,
  });
  return resultado.autorizada
    ? { status: "autorizada", chave: resultado.chaveAcesso, numero: resultado.numero }
    : { status: "rejeitada", motivo: resultado.mensagens?.join("; ") };
}

// Wrapper do formulário (useActionState).
export async function emitirComoEmitente(
  clienteId: string,
  _prev: EstadoEmitente,
  formData: FormData,
): Promise<EstadoEmitente> {
  const competencia = String(formData.get("competencia") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return { erro: "Informe a competência." };
  const valor = Number(formData.get("valor") ?? 0);
  const dados: DadosEmissaoCliente = {
    tomadorDocumento: String(formData.get("tomador_documento") ?? ""),
    tomadorRazaoSocial: String(formData.get("tomador_razao_social") ?? "").trim(),
    tomadorEndereco: {
      cep: String(formData.get("tom_cep") ?? "").replace(/\D/g, ""),
      logradouro: String(formData.get("tom_logradouro") ?? "").trim(),
      numero: String(formData.get("tom_numero") ?? "").trim(),
      bairro: String(formData.get("tom_bairro") ?? "").trim(),
      cidade: String(formData.get("tom_cidade") ?? "").trim(),
      uf: String(formData.get("tom_uf") ?? "").trim().toUpperCase().slice(0, 2),
      cMun: String(formData.get("tom_cmun") ?? "").trim(),
    },
    descricaoServico: String(formData.get("descricao_servico") ?? "").trim(),
    valor,
    competencia,
  };
  const r = await emitirNfseDoCliente(clienteId, dados);
  revalidatePath(`/clientes/${clienteId}`);
  if (r.status === "autorizada") return { ok: true };
  return { erro: r.motivo ?? "Não foi possível emitir." };
}
```

- [ ] **Step 3: Verificar lint/typecheck**

Run: `npm run lint && npm run typecheck`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/clientes/[id]/nfse-emitente.ts"
git commit -m "feat: emissão de NFS-e pelo cliente-emitente (V5-B)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Cancelar/baixar resolvendo o certificado pelo emitente da nota

**Files:**
- Modify: `src/app/(app)/clientes/[id]/nfse.ts`

**Interfaces:**
- As funções `cancelarNfse` e `baixarDanfseNfse` passam a usar o certificado do cliente-emitente quando a nota tem `emitente='cliente'` (e o CNPJ do cliente no cancelamento), mantendo o comportamento do escritório para `emitente='escritorio'`.

- [ ] **Step 1: `baixarDanfseNfse` — selecionar `emitente`/`cliente_id` e resolver o certificado**

Em `src/app/(app)/clientes/[id]/nfse.ts`, na `baixarDanfseNfse`, trocar o `select` da nota e o carregamento do certificado. Substituir:

```ts
  const { data: nota } = await supabase
    .from("nfse")
    .select("chave_acesso, ambiente")
    .eq("id", nfseId)
    .maybeSingle();
  if (!nota?.chave_acesso) return { erro: "Nota sem chave de acesso." };
  // A nota já foi confirmada acessível ao usuário; o certificado é admin-RLS,
  // então carregamos via service_role apenas para o mTLS.
  const admin = createAdminSupabase();
  const { data: certRow } = await admin
    .from("nfse_certificado")
    .select("pfx_cifrado, senha_cifrada")
    .eq("id", 1)
    .maybeSingle();
  if (!certRow) return { erro: "Certificado não cadastrado." };
```

por:

```ts
  const { data: nota } = await supabase
    .from("nfse")
    .select("chave_acesso, ambiente, emitente, cliente_id")
    .eq("id", nfseId)
    .maybeSingle();
  if (!nota?.chave_acesso) return { erro: "Nota sem chave de acesso." };
  // A nota já foi confirmada acessível ao usuário; o certificado é admin-RLS,
  // então carregamos via service_role apenas para o mTLS.
  const admin = createAdminSupabase();
  const certRow = await carregarCertRowDaNota(admin, nota.emitente, nota.cliente_id);
  if (!certRow) return { erro: "Certificado não cadastrado." };
```

- [ ] **Step 2: `cancelarNfse` — selecionar `emitente`, resolver certificado e CNPJ do emitente**

Na `cancelarNfse`, trocar o `select` da nota para incluir `emitente`:

```ts
  const { data: nota } = await supabase
    .from("nfse")
    .select("id, cliente_id, chave_acesso, numero, nfse_xml, status, ambiente, emitente")
    .eq("id", nfseId)
    .maybeSingle();
```

Substituir o bloco que lê o CNPJ e o certificado do escritório:

```ts
  const { data: cfg } = await supabase.from("nfse_config").select("cnpj").eq("id", 1).maybeSingle();
  if (!cfg?.cnpj) return { erro: "Config fiscal ausente." };
```
e
```ts
  const { data: certRow } = await createAdminSupabase()
    .from("nfse_certificado")
    .select("pfx_cifrado, senha_cifrada")
    .eq("id", 1)
    .maybeSingle();
  if (!certRow) return { erro: "Certificado não cadastrado." };
```

por (resolvendo CNPJ e certificado conforme o emitente):

```ts
  const admin = createAdminSupabase();
  let cnpjEmitente: string | null = null;
  if (nota.emitente === "cliente") {
    const { data: cli } = await admin.from("clientes").select("cpf_cnpj").eq("id", nota.cliente_id).maybeSingle();
    cnpjEmitente = String(cli?.cpf_cnpj ?? "").replace(/\D/g, "") || null;
  } else {
    const { data: cfg } = await supabase.from("nfse_config").select("cnpj").eq("id", 1).maybeSingle();
    cnpjEmitente = cfg?.cnpj ?? null;
  }
  if (!cnpjEmitente) return { erro: "CNPJ do emitente ausente." };
  const certRow = await carregarCertRowDaNota(admin, nota.emitente, nota.cliente_id);
  if (!certRow) return { erro: "Certificado não cadastrado." };
```

E, na chamada `montarEventoCancelamento`, trocar `cnpj: cfg.cnpj` por `cnpj: cnpjEmitente`.

- [ ] **Step 3: Adicionar o helper de resolução do certificado**

Ao final de `src/app/(app)/clientes/[id]/nfse.ts`, adicionar:

```ts
// Retorna a linha (pfx_cifrado, senha_cifrada) do certificado que emitiu a nota:
// do cliente-emitente (V5-B) ou do escritório (V5-A). Usa client admin (RLS admin).
async function carregarCertRowDaNota(
  admin: ReturnType<typeof createAdminSupabase>,
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
  const { data } = await admin
    .from("nfse_certificado")
    .select("pfx_cifrado, senha_cifrada")
    .eq("id", 1)
    .maybeSingle();
  return data ?? null;
}
```

- [ ] **Step 4: Verificar lint/typecheck/testes**

Run: `npm run lint && npm run typecheck && npm test`
Expected: sem erros; testes existentes seguem passando.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/clientes/[id]/nfse.ts"
git commit -m "feat: cancelar/baixar NFS-e resolvem certificado pelo emitente da nota

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: UI — seção de emissão do cliente na ficha

**Files:**
- Create: `src/components/nfse/EmitenteConfig.tsx`
- Create: `src/components/nfse/EmitirNfseCliente.tsx`
- Create: `src/components/nfse/EmissaoClienteSection.tsx`
- Modify: `src/app/(app)/clientes/[id]/page.tsx`

**Interfaces:**
- Consumes: `salvarEmitente`, `salvarCertificadoCliente`, `emitirComoEmitente`, `EstadoEmitente` (Tasks 4–5); `BaixarNfse`/`CancelarNfse` existentes; `podeConfigurarNfse`/`podeVerHonorario`; `formatarData`.
- Produces: `<EmissaoClienteSection clienteId={string} papel={Papel} />`.

- [ ] **Step 1: `EmitenteConfig.tsx` (form fiscal + upload, admin)**

Arquivo `src/components/nfse/EmitenteConfig.tsx`:

```tsx
"use client";
import { useActionState } from "react";
import {
  salvarEmitente,
  salvarCertificadoCliente,
  type EstadoEmitente,
} from "@/app/(app)/clientes/[id]/nfse-emitente";

type EmitenteDefaults = {
  codigo_municipio?: string | null;
  item_lc116?: string | null;
  codigo_servico_nacional?: string | null;
  codigo_tributacao_municipal?: string | null;
  aliquota_iss?: number | null;
  pct_trib_sn?: number | null;
  simples_nacional?: boolean | null;
  natureza_operacao?: string | null;
  descricao_servico_padrao?: string | null;
  serie?: string | null;
  ambiente?: string | null;
} | null;

export function EmitenteConfig({
  clienteId,
  emitente,
  certificadoValidade,
}: {
  clienteId: string;
  emitente: EmitenteDefaults;
  certificadoValidade: string | null;
}) {
  const [estado, action, pend] = useActionState<EstadoEmitente, FormData>(
    salvarEmitente.bind(null, clienteId),
    {},
  );
  const [estadoCert, actionCert, pendCert] = useActionState<EstadoEmitente, FormData>(
    salvarCertificadoCliente.bind(null, clienteId),
    {},
  );
  const expirado = certificadoValidade ? new Date(certificadoValidade).getTime() < Date.now() : false;

  return (
    <div className="space-y-4">
      <form action={action} className="grid grid-cols-2 gap-2 text-sm">
        <label className="block">Código do município (IBGE)
          <input name="codigo_municipio" defaultValue={emitente?.codigo_municipio ?? ""} className="mt-1 w-full rounded border border-slate-300 px-2 py-1" />
        </label>
        <label className="block">Item LC 116
          <input name="item_lc116" defaultValue={emitente?.item_lc116 ?? ""} className="mt-1 w-full rounded border border-slate-300 px-2 py-1" />
        </label>
        <label className="block">Código de serviço nacional (cTribNac)
          <input name="codigo_servico_nacional" defaultValue={emitente?.codigo_servico_nacional ?? ""} className="mt-1 w-full rounded border border-slate-300 px-2 py-1" />
        </label>
        <label className="block">Código de tributação municipal
          <input name="codigo_tributacao_municipal" defaultValue={emitente?.codigo_tributacao_municipal ?? ""} className="mt-1 w-full rounded border border-slate-300 px-2 py-1" />
        </label>
        <label className="block">Alíquota ISS (%)
          <input type="number" step="0.01" name="aliquota_iss" defaultValue={emitente?.aliquota_iss ?? 0} className="mt-1 w-full rounded border border-slate-300 px-2 py-1" />
        </label>
        <label className="block">% tributos (Simples)
          <input type="number" step="0.01" name="pct_trib_sn" defaultValue={emitente?.pct_trib_sn ?? 0} className="mt-1 w-full rounded border border-slate-300 px-2 py-1" />
        </label>
        <label className="block">Natureza da operação
          <input name="natureza_operacao" defaultValue={emitente?.natureza_operacao ?? ""} className="mt-1 w-full rounded border border-slate-300 px-2 py-1" />
        </label>
        <label className="block">Descrição de serviço padrão
          <input name="descricao_servico_padrao" defaultValue={emitente?.descricao_servico_padrao ?? ""} className="mt-1 w-full rounded border border-slate-300 px-2 py-1" />
        </label>
        <label className="block">Série
          <input name="serie" defaultValue={emitente?.serie ?? "1"} className="mt-1 w-full rounded border border-slate-300 px-2 py-1" />
        </label>
        <label className="block">Ambiente
          <select name="ambiente" defaultValue={emitente?.ambiente ?? "homologacao"} className="mt-1 w-full rounded border border-slate-300 px-2 py-1">
            <option value="homologacao">Homologação</option>
            <option value="producao">Produção</option>
          </select>
        </label>
        <label className="col-span-2 flex items-center gap-2">
          <input type="checkbox" name="simples" defaultChecked={emitente?.simples_nacional ?? true} />
          Optante do Simples Nacional
        </label>
        <div className="col-span-2 flex items-center gap-3">
          <button disabled={pend} className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-60">
            {pend ? "Salvando…" : "Salvar dados do emitente"}
          </button>
          {estado.ok && <span className="text-xs text-green-700">Salvo ✓</span>}
          {estado.erro && <span role="alert" className="text-xs text-red-600">{estado.erro}</span>}
        </div>
      </form>

      <form action={actionCert} className="flex flex-wrap items-end gap-2 text-sm">
        <label className="block">Certificado A1 (.pfx)
          <input type="file" name="pfx" accept=".pfx,.p12" className="mt-1 block text-xs" />
        </label>
        <label className="block">Senha
          <input type="password" name="senha" className="mt-1 rounded border border-slate-300 px-2 py-1" />
        </label>
        <button disabled={pendCert} className="rounded border px-3 py-1 disabled:opacity-60">
          {pendCert ? "Enviando…" : "Enviar certificado"}
        </button>
        {certificadoValidade && (
          <span className={`text-xs ${expirado ? "text-red-600" : "text-slate-500"}`}>
            Validade: {new Date(certificadoValidade).toLocaleDateString("pt-BR")}{expirado ? " (expirado)" : ""}
          </span>
        )}
        {estadoCert.ok && <span className="text-xs text-green-700">Certificado salvo ✓</span>}
        {estadoCert.erro && <span role="alert" className="text-xs text-red-600">{estadoCert.erro}</span>}
      </form>
    </div>
  );
}
```

- [ ] **Step 2: `EmitirNfseCliente.tsx` (form por nota)**

Arquivo `src/components/nfse/EmitirNfseCliente.tsx`:

```tsx
"use client";
import { useActionState, useState } from "react";
import { emitirComoEmitente, type EstadoEmitente } from "@/app/(app)/clientes/[id]/nfse-emitente";

export function EmitirNfseCliente({ clienteId, ambiente }: { clienteId: string; ambiente: string }) {
  const [estado, action, pend] = useActionState<EstadoEmitente, FormData>(
    emitirComoEmitente.bind(null, clienteId),
    {},
  );
  const [aberto, setAberto] = useState(false);
  const [mes, setMes] = useState("");

  if (estado.ok) return <span className="text-xs text-green-700">NFS-e emitida ✓</span>;
  if (!aberto)
    return (
      <button onClick={() => setAberto(true)} className="rounded border px-2 py-1 text-xs text-slate-700">
        Emitir NFS-e
      </button>
    );

  return (
    <form action={action} className="mt-2 space-y-2 rounded border border-slate-200 p-3 text-sm">
      {ambiente === "homologacao" && (
        <p className="rounded bg-amber-50 px-2 py-1 text-amber-800">Homologação — sem validade jurídica.</p>
      )}
      <p className="font-medium text-slate-700">Tomador</p>
      <div className="grid grid-cols-2 gap-2">
        <input name="tomador_documento" placeholder="CNPJ/CPF" required className="rounded border border-slate-300 px-2 py-1" />
        <input name="tomador_razao_social" placeholder="Razão social" required className="rounded border border-slate-300 px-2 py-1" />
        <input name="tom_cep" placeholder="CEP" required className="rounded border border-slate-300 px-2 py-1" />
        <input name="tom_logradouro" placeholder="Logradouro" required className="rounded border border-slate-300 px-2 py-1" />
        <input name="tom_numero" placeholder="Número" className="rounded border border-slate-300 px-2 py-1" />
        <input name="tom_bairro" placeholder="Bairro" className="rounded border border-slate-300 px-2 py-1" />
        <input name="tom_cidade" placeholder="Cidade" className="rounded border border-slate-300 px-2 py-1" />
        <input name="tom_uf" placeholder="UF" maxLength={2} className="rounded border border-slate-300 px-2 py-1" />
        <input name="tom_cmun" placeholder="Cód. município (IBGE)" className="rounded border border-slate-300 px-2 py-1" />
      </div>
      <p className="font-medium text-slate-700">Serviço</p>
      <input name="descricao_servico" placeholder="Descrição do serviço" className="w-full rounded border border-slate-300 px-2 py-1" />
      <label className="block">Valor (R$)
        <input type="number" name="valor" step="0.01" min="0" required className="ml-2 w-32 rounded border border-slate-300 px-2 py-1" />
      </label>
      <label className="block">Competência
        <input type="month" required value={mes} onChange={(e) => setMes(e.target.value)} className="ml-2 rounded border border-slate-300 px-2 py-1" />
      </label>
      <input type="hidden" name="competencia" value={mes ? `${mes}-01` : ""} />
      {estado.erro && <p role="alert" className="text-red-600">{estado.erro}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pend} className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-60">
          {pend ? "Emitindo..." : "Emitir"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="rounded border px-3 py-1">Cancelar</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: `EmissaoClienteSection.tsx` (server component da seção)**

Arquivo `src/components/nfse/EmissaoClienteSection.tsx`:

```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { podeVerHonorario, podeConfigurarNfse } from "@/lib/clientes/permissoes";
import { formatarData } from "@/lib/format";
import type { Papel } from "@/lib/tipos";
import { EmitenteConfig } from "./EmitenteConfig";
import { EmitirNfseCliente } from "./EmitirNfseCliente";
import { BaixarNfse } from "./BaixarNfse";
import { CancelarNfse } from "./CancelarNfse";

const ROTULO: Record<string, string> = {
  processando: "Processando", autorizada: "Autorizada", rejeitada: "Rejeitada",
  erro: "Erro", cancelada: "Cancelada",
};

// Seção "Emissão de NFS-e" (cliente como emitente/prestador). Só para quem opera o financeiro.
export async function EmissaoClienteSection({ clienteId, papel }: { clienteId: string; papel: Papel }) {
  if (!podeVerHonorario(papel)) return null;
  const supabase = await createServerSupabase();

  const [{ data: emitente }, { data: cert }, { data: notas }] = await Promise.all([
    supabase.from("nfse_emitente").select("*").eq("cliente_id", clienteId).maybeSingle(),
    supabase.from("nfse_certificado_cliente").select("validade").eq("cliente_id", clienteId).maybeSingle(),
    supabase.from("nfse").select("id, competencia, status, numero, valor, chave_acesso, mensagens, ambiente, tomador_razao_social")
      .eq("cliente_id", clienteId).eq("emitente", "cliente")
      .order("competencia", { ascending: false }).order("criado_em", { ascending: false }).limit(50),
  ]);

  const validade = cert?.validade ?? null;
  const certValido = validade ? new Date(validade).getTime() >= Date.now() : false;
  const configCompleta = Boolean(emitente?.codigo_municipio && emitente?.codigo_servico_nacional);
  const ambiente = emitente?.ambiente ?? "homologacao";
  const podeEmitir = configCompleta && certValido;

  return (
    <section className="max-w-4xl space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Emissão de NFS-e (cliente como emitente)</h2>

      {podeConfigurarNfse(papel) && (
        <details className="rounded border border-slate-200 p-2">
          <summary className="cursor-pointer text-sm text-slate-700">Configuração do emitente</summary>
          <div className="mt-2">
            <EmitenteConfig clienteId={clienteId} emitente={emitente} certificadoValidade={validade} />
          </div>
        </details>
      )}

      {podeEmitir ? (
        <EmitirNfseCliente clienteId={clienteId} ambiente={ambiente} />
      ) : (
        <p className="text-sm text-slate-500">
          {podeConfigurarNfse(papel)
            ? "Configure os dados fiscais e envie um certificado A1 válido para emitir."
            : "Emissão indisponível: emitente sem configuração fiscal ou certificado válido."}
        </p>
      )}

      {notas && notas.length > 0 ? (
        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="w-full text-sm">
            <caption className="sr-only">NFS-e emitidas pelo cliente</caption>
            <thead className="bg-slate-100 text-left text-slate-700">
              <tr>
                <th className="p-2 font-medium">Competência</th>
                <th className="p-2 font-medium">Tomador</th>
                <th className="p-2 font-medium">Número</th>
                <th className="p-2 font-medium">Valor</th>
                <th className="p-2 font-medium">Status</th>
                <th className="p-2 font-medium">Documentos</th>
              </tr>
            </thead>
            <tbody>
              {notas.map((n) => (
                <tr key={n.id} className="border-t border-slate-100 align-top">
                  <td className="p-2 text-slate-900">{formatarData(n.competencia)}</td>
                  <td className="p-2 text-slate-700">{n.tomador_razao_social ?? "—"}</td>
                  <td className="p-2 text-slate-700">{n.numero ?? "—"}</td>
                  <td className="p-2 text-slate-700">R$ {Number(n.valor).toFixed(2)}</td>
                  <td className="p-2 text-slate-700">
                    {ROTULO[n.status] ?? n.status}
                    {n.ambiente === "homologacao" && (
                      <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">homologação</span>
                    )}
                    {n.status === "rejeitada" && Array.isArray(n.mensagens) && (
                      <span className="block text-xs text-red-600">
                        {(n.mensagens as { descricao?: string }[]).map((m) => m.descricao).join("; ")}
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    {n.status === "autorizada" && n.chave_acesso && (
                      <div className="space-y-1">
                        <BaixarNfse nfseId={n.id} numero={n.numero ?? ""} chave={n.chave_acesso} />
                        <CancelarNfse nfseId={n.id} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Nenhuma NFS-e emitida por este cliente.</p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Ligar na ficha do cliente**

Em `src/app/(app)/clientes/[id]/page.tsx`:

1. Import:

```tsx
import { EmissaoClienteSection } from "@/components/nfse/EmissaoClienteSection";
```

2. Renderizar logo após `<NotasFiscaisSection ... />`:

```tsx
      <EmissaoClienteSection clienteId={id} papel={papel} />
```

- [ ] **Step 5: Verificar lint/typecheck/testes/build**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: sem erros; build compila.

- [ ] **Step 6: Commit**

```bash
git add src/components/nfse/EmitenteConfig.tsx src/components/nfse/EmitirNfseCliente.tsx src/components/nfse/EmissaoClienteSection.tsx "src/app/(app)/clientes/[id]/page.tsx"
git commit -m "feat: seção de emissão de NFS-e do cliente na ficha (V5-B)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Testes de RLS + numeração das tabelas novas

**Files:**
- Modify: `supabase/tests/rls.test.sql`

**Interfaces:**
- Verifica: `nfse_emitente`/`nfse_certificado_cliente` só admin (financeiro/contador negados) e `proximo_ndps_cliente` incrementa por cliente.

O arquivo roda numa transação com ROLLBACK; `_simular(uid)` troca role+claims; asserções em blocos `do $$ ... $$` que lançam `raise exception` na falha. Seeds já existentes: admin=`...001`, assistente=`...002`, contador=`...003`, financeiro=`...004`; clientes `aaaaaaaa-...001` (do contador) e `aaaaaaaa-...002` (do admin).

- [ ] **Step 1: Acrescentar o bloco de asserções ao final de `supabase/tests/rls.test.sql`**

```sql
-- ===== V5-B: emitente/certificado do cliente são só admin; numeração por cliente =====
do $$
declare n int; a bigint; b bigint;
begin
  -- admin cadastra o emitente do cliente 002 e o enxerga
  perform _simular('00000000-0000-0000-0000-000000000001'); -- admin
  insert into nfse_emitente (cliente_id, codigo_municipio, codigo_servico_nacional)
    values ('aaaaaaaa-0000-0000-0000-000000000002', '3170206', '170201')
    on conflict (cliente_id) do nothing;
  select count(*) into n from nfse_emitente where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if n <> 1 then raise exception 'FALHA: admin não vê nfse_emitente (viu %)', n; end if;

  -- financeiro e contador NÃO acessam config/cert do emitente
  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro
  select count(*) into n from nfse_emitente;
  if n <> 0 then raise exception 'FALHA: financeiro viu nfse_emitente (devia ser 0)'; end if;
  select count(*) into n from nfse_certificado_cliente;
  if n <> 0 then raise exception 'FALHA: financeiro viu nfse_certificado_cliente (devia ser 0)'; end if;
  perform _simular('00000000-0000-0000-0000-000000000003'); -- contador
  select count(*) into n from nfse_emitente;
  if n <> 0 then raise exception 'FALHA: contador viu nfse_emitente (devia ser 0)'; end if;
  raise notice 'OK: nfse_emitente/certificado_cliente são admin-only';

  -- numeração por cliente incrementa monotonicamente (RPC SECURITY DEFINER)
  reset role;
  select proximo_ndps_cliente('aaaaaaaa-0000-0000-0000-000000000002') into a;
  select proximo_ndps_cliente('aaaaaaaa-0000-0000-0000-000000000002') into b;
  if b <> a + 1 then raise exception 'FALHA: proximo_ndps_cliente não incrementou (% -> %)', a, b; end if;
  raise notice 'OK: proximo_ndps_cliente incrementa por cliente';
end $$;
```

- [ ] **Step 2: Rodar os testes de RLS**

Run: `npm run db:test`
Expected: todos os testes de RLS passam, incluindo os dois novos `OK:` acima.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/rls.test.sql
git commit -m "test(rls): multi-emitente NFS-e admin-only + numeração por cliente

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Verificação E2E em homologação (com o usuário)

**Files:** nenhum (validação manual).

- [ ] **Step 1: Deploy do código (main) e migração em produção**

A migration `0025` roda contra o banco (o `.env.local` aponta para o Supabase de produção): `npm run db:migrate` já a aplicou no ambiente de desenvolvimento/produção compartilhado. Confirmar deploy do app a partir da branch de deploy (`main`).

- [ ] **Step 2: Cadastrar um cliente-emitente de teste (admin)**

Na ficha de um cliente de teste, na seção "Emissão de NFS-e": preencher os dados fiscais (município IBGE, cTribNac, ISS, regime), `ambiente = homologacao`, e enviar um certificado A1 **de teste**.

- [ ] **Step 3: Emitir uma NFS-e de homologação**

Clicar em "Emitir NFS-e", preencher tomador (CNPJ/CPF + endereço) + serviço + valor + competência, emitir. Conferir `status = autorizada`, número/chave, e o download de **XML** e **DANFSe**.

- [ ] **Step 4: Cancelar a nota de teste**

Cancelar a NFS-e emitida (motivo + justificativa ≥ 15 caracteres) e conferir `status = cancelada`.

- [ ] **Step 5: Registrar o resultado**

Se tudo passar em homologação, o cliente pode ser promovido a `ambiente = producao` na config. Reportar ao usuário para decisão de release/tag.

---

## Verificação final

- [ ] `npm run lint && npm run typecheck && npm test` — tudo verde.
- [ ] `npm run build` — compila.
- [ ] `npm run db:test` — RLS verde.
- [ ] E2E de homologação (Task 9) validado com o usuário antes de promover clientes a produção.
