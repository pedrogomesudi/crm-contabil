# V5-B — NFS-e dos clientes (multi-emitente) — Design

> **Status:** design aprovado · **Data:** 2026-07-02 · **Marco:** V5-B do [ROADMAP](../../../ROADMAP.md)
> **Depende de:** V5-A ([`2026-07-02-v5-nfse-nacional-design.md`](2026-07-02-v5-nfse-nacional-design.md)) — reaproveita o motor `src/lib/nfse/`.

## 1. Contexto e objetivo

Na V5-A o **escritório** é o emitente: emite as NFS-e dos próprios honorários, com config e certificado
únicos (`nfse_config`/`nfse_certificado`, linha `id=1`), a partir do honorário já no CRM.

A V5-B inverte e multiplica esse modelo: **cada cliente do CRM passa a ser o emitente (prestador)** das
próprias NFS-e, com **CNPJ, município, regime e certificado A1 próprios**, emitindo notas para **os
clientes dele** (tomadores externos, que não estão no CRM). O escritório opera tudo pela ficha de cada
cliente — não há portal do cliente.

## 2. Decisões do brainstorming

- **Municípios:** todos os clientes-emitentes estão em municípios que **aderiram ao padrão nacional**
  (nfse.gov.br / Sefin Nacional). O mesmo motor da V5-A cobre todos — sem adaptadores por prefeitura.
- **Dados da nota:** **digitados a cada emissão** (formulário por nota): tomador + serviço + valor. Sem
  cadastro reutilizável de tomadores/serviços (fica para F2).
- **Operação:** **config = admin** (dados fiscais + upload do certificado do cliente); **emissão =
  admin/financeiro/contador-dono** (`podeVerHonorario`), espelhando a V5-A.
- **Abordagem:** **reaproveitar o motor + tabelas por cliente** (abordagem A) — mantém a V5-A intacta,
  máximo reuso, risco quase zero para o fluxo de honorários já em produção.
- **UI:** **seção própria "Emissão de NFS-e"** na ficha do cliente, abaixo do formulário de cadastro
  (não mistura campos fiscais no cadastro geral).

## 3. Modelo de dados

Migration idempotente nova (próximo número livre: **`0025_nfse_multiemitente.sql`**).

### 3.1 `nfse_emitente` — config fiscal por cliente-emitente

Chave 1:1 com o cliente; guarda **apenas** o que é específico de NFS-e e ainda não existe em `clientes`.
A identidade (CNPJ, IM, razão social, endereço) é reaproveitada de `clientes`.

```sql
create table if not exists nfse_emitente (
  cliente_id uuid primary key references clientes(id) on delete cascade,
  codigo_municipio text,               -- IBGE (7 díg.)
  item_lc116 text,
  codigo_servico_nacional text,        -- cTribNac (6 díg.)
  codigo_tributacao_municipal text,
  aliquota_iss numeric,                -- pAliq (quando NÃO Simples)
  pct_trib_sn numeric,                 -- pTotTribSN (Simples)
  simples_nacional boolean not null default true,
  natureza_operacao text,
  descricao_servico_padrao text,       -- default do campo "descrição" no form (editável)
  serie text not null default '1',
  proximo_ndps bigint not null default 1,
  ambiente text not null default 'homologacao',  -- homologacao|producao
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
```

### 3.2 `nfse_certificado_cliente` — A1 por cliente (cifrado)

```sql
create table if not exists nfse_certificado_cliente (
  cliente_id uuid primary key references clientes(id) on delete cascade,
  nome_arquivo text,
  pfx_cifrado text,          -- AES-256-GCM, chave NFSE_CERT_KEY (mesma da V5-A)
  senha_cifrada text,
  validade timestamptz,
  atualizado_em timestamptz not null default now()
);
```

### 3.3 Colunas novas em `nfse`

Distinguem os dois fluxos sem quebrar a V5-A. As linhas existentes assumem `emitente='escritorio'`.

```sql
alter table nfse add column if not exists emitente text not null default 'escritorio'
  check (emitente in ('escritorio','cliente'));
alter table nfse add column if not exists tomador_documento text;
alter table nfse add column if not exists tomador_razao_social text;
alter table nfse add column if not exists tomador_endereco jsonb;
alter table nfse add column if not exists descricao_servico text;
```

**Semântica de `nfse.cliente_id`:**
- `emitente='escritorio'` (V5-A): `cliente_id` = **tomador**; `valor` = honorário.
- `emitente='cliente'` (V5-B): `cliente_id` = **emitente/prestador**; tomador vem das colunas snapshot.

### 3.4 Numeração de DPS por cliente

RPC atômica, espelhando a `nfse_dps_seq` (global) da V5-A, mas por cliente:

```sql
create or replace function proximo_ndps_cliente(p_cliente_id uuid) returns bigint
  language plpgsql security definer set search_path = pg_catalog, public as $$
declare n bigint;
begin
  update nfse_emitente set proximo_ndps = proximo_ndps + 1
    where cliente_id = p_cliente_id
    returning proximo_ndps - 1 into n;
  if n is null then raise exception 'emitente não configurado'; end if;
  return n;
end; $$;
grant execute on function proximo_ndps_cliente(uuid) to authenticated;
```

Evita reuso de número (o erro **E0014** já enfrentado na V5-A).

## 4. RLS e permissões

- **`nfse_emitente` / `nfse_certificado_cliente`:** só **admin**
  (`auth_papel()='admin'`, `for all ... using/with check`). Gate no app: nova
  `podeConfigurarNfse(papel) = papel==='admin'` em `src/lib/clientes/permissoes.ts`.
- **`nfse` (emissão/leitura):** a policy `nfse_rw` existente já cobre admin/financeiro/contador-dono
  por `cliente_id`. Como em `emitente='cliente'` o `cliente_id` é o próprio emitente, o **contador
  responsável** emite as notas do seu cliente — comportamento desejado. **Sem policy nova.**
- Trigger `nfse_integridade` (autoria `criado_por`) continua valendo.

## 5. Motor (reuso de `src/lib/nfse/`)

Sem mudança estrutural no motor — ele já recebe `config`/`cert`/`ambiente` como parâmetro:

- **`dps.montarDps({ config, tomador, valor, competencia, serie, numeroDps })`** — reusado como está.
- **`assinatura` / `envio` / `cancelamento` / `danfse`** — intactos.
- **Peça nova (pura/testável):** `src/lib/nfse/emitente.ts` com
  `emitenteParaConfig(emitente: NfseEmitente, cliente: ClienteIdentidade): ConfigFiscal` — monta o
  `ConfigFiscal` (tipo existente em `tipos.ts`) a partir de `nfse_emitente` + identidade de `clientes`.

## 6. Server actions

Em `src/app/(app)/clientes/[id]/nfse.ts` (ou arquivo irmão), nomes distintos dos da V5-A:

- **`salvarEmitente(clienteId, dados)`** — admin; upsert em `nfse_emitente`.
- **`salvarCertificadoCliente(clienteId, pfxBase64, senha)`** — admin; cifra (AES-256-GCM) e grava em
  `nfse_certificado_cliente`; lê validade do `.pfx`.
- **`emitirNfseDoCliente(clienteId, dados)`** — `podeVerHonorario`:
  1. Carrega `nfse_emitente` + `nfse_certificado_cliente` (decifra o A1 só no servidor).
  2. Valida: config completa, certificado presente/não expirado, tomador com documento + endereço.
  3. `nDPS` via `proximo_ndps_cliente(clienteId)`; `emitenteParaConfig` → `montarDps` → `assinarDps` →
     `enviarDps` (mTLS).
  4. Grava linha em `nfse` com `emitente='cliente'`, snapshot do tomador, `descricao_servico`, `valor`,
     `competencia`, `ambiente`, resultado.
  5. Malha de erros/retry idêntica à V5-A (E0082/E0008; rejeição → `status=rejeitada`).
- **Cancelar / baixar XML / baixar DANFSe** — reaproveitam `cancelarNfse`/`baixarXmlNfse`/
  `baixarDanfseNfse`, resolvendo o certificado do **emitente da nota** (se `emitente='cliente'`, usa
  `nfse_certificado_cliente` daquele `cliente_id`; senão, o certificado do escritório).

`OpcoesEmissaoCliente` (form → action): `{ tomadorDocumento, tomadorRazaoSocial, tomadorEndereco,
descricaoServico, valor, competencia }`.

## 7. UI (ficha do cliente `/clientes/[id]`)

Seção própria **"Emissão de NFS-e"**, abaixo do formulário de cadastro:

- **Config do emitente (admin):** formulário fiscal (`nfse_emitente`) + upload do certificado A1.
  Avisa quando o certificado está próximo de expirar/expirado. Só admin vê/edita.
- **Emissão + histórico (`podeVerHonorario`):** com config + certificado válido, botão **"Emitir
  NFS-e"** abre o formulário por nota (tomador: documento/razão/endereço; serviço: descrição —
  pré-preenchida com `descricao_servico_padrao`, editável — e valor; competência). Lista as notas
  emitidas (`emitente='cliente'`) com status/número/competência e ações **cancelar / baixar XML /
  baixar DANFSe**.
- Badge "homologação" nas notas em `ambiente='homologacao'`, como na V5-A.

> Esta seção é **separada** da "Notas fiscais (NFS-e)" da V5-A (honorários do escritório, onde este
> cliente é *tomador*). São papéis diferentes do mesmo cliente.

Componentes novos em `src/components/nfse/`: `EmitenteConfig.tsx` (form fiscal + upload) e
`EmitirNfseCliente.tsx` (form por nota) + a seção `EmissaoClienteSection.tsx`.

## 8. Erros e casos de borda

- **Config incompleta / sem certificado / certificado expirado** → seção mostra aviso e não habilita o
  botão de emitir.
- **Tomador sem documento ou endereço** → bloqueia (dado fiscal obrigatório na DPS).
- **Rejeição da Sefin** → `status=rejeitada` + motivo; permite corrigir e reemitir.
- **Falha de rede/mTLS** → `status=erro`; retry automático E0082/E0008 (motor).
- **Numeração** por cliente (RPC atômica) → sem reuso de nDPS.
- **Homologação × produção por cliente** (`nfse_emitente.ambiente`).
- **Isolamento V5-A × V5-B** — seções, actions e queries separadas pelo campo `emitente`.

## 9. Testes

- **Unit** `emitente.ts` — `emitenteParaConfig` mapeia emitente+cliente → `ConfigFiscal` (Simples e
  não-Simples).
- **Unit** `dps` — monta DPS de um cliente-emitente a partir de fixture.
- **DB** `proximo_ndps_cliente` — incrementa por cliente, sem colisão; erro se emitente ausente.
- **Action `emitirNfseDoCliente` (mockada)** — bloqueios (config/cert/tomador) + caminho feliz.
- **RLS** (`rls.test.sql`) — admin-only em `nfse_emitente`/`nfse_certificado_cliente`; contador-dono
  emite nota do seu cliente; assistente não vê.
- **E2E homologação** — cadastrar um cliente-emitente de teste (certificado de teste), emitir uma nota
  real de homologação, conferir autorização + DANFSe + cancelamento.

## 10. Segurança e LGPD

- Certificado do cliente cifrado em repouso (AES-256-GCM, `NFSE_CERT_KEY`), decifrado só no runtime da
  emissão; nunca vai ao browser. Custódia igual à V5-A.
- Dados do tomador externo são snapshot mínimo para a DPS (documento, razão, endereço); trafegam para a
  Sefin, não são um cadastro reutilizável.
- RLS restringe config/certificado a admin e as notas a quem já opera o financeiro do cliente.

## 11. Fora de escopo (consciente)

- Cadastro reutilizável de **tomadores/serviços** (F2).
- **Lote** de emissão para clientes (cada nota tem tomador/serviço distinto).
- **Municípios com sistema próprio** (fora do padrão nacional).
- **Portal do cliente** (clientes não logam no CRM).
- **Substituição** de NFS-e (a nota fica armazenada; cancelar + reemitir cobre o MVP).

## 12. Riscos / decisões em aberto

- **Layout da DPS para serviços variados** — na V5-A o serviço era fixo (honorário). Aqui o item LC116 /
  cTribNac / descrição variam por emitente; validar contra a produção restrita cedo, no E2E.
- **Certificado por cliente** — obter os A1 dos clientes é um pré-requisito operacional (o escritório
  precisa tê-los); a UI trata ausência/expiração com bloqueio claro.
- **Migração de dados** — nenhuma linha de `nfse` existente muda de sentido (default `escritorio`).
