# V5 — Emissão de NFS-e pelo CRM (padrão nacional) — subsistema A

> **Status:** design aprovado para implementação · **Data:** 2026-07-02 · **Marco:** V5 do [ROADMAP](../../../ROADMAP.md)

## 1. Contexto e objetivo

O escritório emite hoje as NFS-e dos seus **honorários contábeis** pelo portal nacional
(nfse.gov.br). A V5 traz essa emissão para dentro do CRM: a partir do **honorário** já cadastrado
por cliente, monta a nota, assina com o certificado do escritório, envia à **Sefin Nacional** e
guarda o resultado (NFS-e autorizada + DANFSe), sem sair do sistema.

## 2. Decomposição do escopo (importante)

"Emitir NFS-e" tem dois subsistemas de complexidade muito diferente:

- **A) NFS-e dos honorários do escritório** — 1 emitente (o escritório), 1 município, 1 certificado,
  1 regime; conecta direto ao honorário do CRM. **É o escopo desta V5.**
- **B) NFS-e dos clientes (multi-emitente)** — N emitentes, N municípios, N certificados/regimes;
  multi-tenant fiscal. **Fica para um marco próprio, depois** (spec/plano separados).

Esta spec cobre **apenas o A**. O roadmap será ajustado para refletir a divisão.

## 3. Decisões tomadas no brainstorming

- **Município:** Uberlândia/MG (cód. IBGE 3170206), aderente ao **padrão nacional de NFS-e**.
- **Integração:** **API nacional direta (Sefin Nacional)** — sem emissor terceiro.
- **Certificado A1:** fica **in-house**, cifrado no nosso ambiente (não vai a terceiros).
- **Fluxo:** **por cliente, sob demanda** (MVP); lote mensal em etapa seguinte.
- **Ambiente:** começa em **homologação (produção restrita)**; produção por env.
- Pré-requisitos já existentes: certificado A1 + inscrição municipal ativos.

## 4. Integração Sefin Nacional (fatos técnicos)

- **API REST**, mensagens JSON; a **DPS** (Declaração de Prestação de Serviço) vai como XML
  **assinado (XMLDSig)**, comprimido em **GZip** e **Base64** dentro do JSON.
- **mTLS** com o certificado ICP-Brasil **A1** — o mesmo certificado é usado para o transporte
  (cliente TLS) e para **assinar** a DPS.
- **Ambiente** definido por `tpAmb` (1 = produção, 2 = homologação). Homologação = "produção
  restrita" (`sefin.producaorestrita.nfse.gov.br`), sem validade jurídica.
- A emissão é **síncrona** (a resposta traz a NFS-e autorizada ou a rejeição).
- Referências: Manual Contribuintes Emissor Público API (gov.br/nfse); Swagger da produção restrita;
  implementações de referência (ex.: `pedrocasado/nfse-php`).

## 5. Configuração fiscal do escritório

Tabela **`nfse_config`** (linha única, admin):

- **Emitente:** CNPJ, inscrição municipal, razão social, endereço, código IBGE do município
  (3170206), UF.
- **Serviço:** item da LC 116 (contabilidade ≈ **17.19**), código de tributação municipal,
  **alíquota ISS**, natureza da operação, regime tributário (Simples Nacional? sim/não).
- **Ambiente:** `homologacao` | `producao` (default `homologacao`).

Editável apenas por **admin**. Os valores fiscais exatos (item, código municipal, ISS) são
preenchidos pelo escritório na tela de configuração.

## 6. Certificado A1 (cifrado, in-house)

Tabela **`nfse_certificado`** (admin): bytes do `.pfx`/`.p12` **cifrados** (AES-256-GCM), senha
cifrada, `validade`, nome do arquivo, timestamps.

- Chave de cifra em **`NFSE_CERT_KEY`** (env, runtime, nunca `NEXT_PUBLIC_`).
- Upload via tela admin; **decifrado só no servidor**, no momento da emissão, para (a) o agente
  **mTLS** e (b) a **assinatura** XMLDSig. Nunca é enviado ao cliente.
- A UI alerta quando o certificado está **próximo de expirar / expirado**.

## 7. Motor de emissão

`src/lib/nfse/` — isolado e testável:

- **`cripto.ts`** — `cifrar(bytes, chave)` / `decifrar(...)` (AES-256-GCM) para o certificado.
- **`certificado.ts`** — carrega o `.pfx` (parse com `node-forge`), expõe chave privada + cadeia
  para assinatura e para o agente mTLS.
- **`dps.ts`** — `montarDps({ config, tomador, valor, competencia, numero })` → XML da DPS (layout
  nacional v1.01). Puro/determinístico.
- **`assinatura.ts`** — `assinarDps(xml, cert)` → XML com **XMLDSig** (RSA-SHA256, C14N) via
  `xml-crypto`.
- **`envio.ts`** — `enviarDps(xmlAssinado, cert, ambiente)`: GZip + Base64 → POST REST à Sefin com
  **mTLS** (agent com o A1) → parse `{ autorizada | rejeitada, chaveAcesso, numero, xmlNfse,
  mensagens }`.
- Config por env: `NFSE_AMBIENTE`, URLs da Sefin (homologação/produção), `NFSE_CERT_KEY`.

## 8. Dados e persistência

Migration (idempotente):

- **`nfse_config`** e **`nfse_certificado`** (ver §5–6).
- **`nfse`** (emissões): `id`, `cliente_id`, `valor` (snapshot do honorário), `competencia`
  (date/ano-mês), `status` (`processando` · `autorizada` · `rejeitada` · `erro` · `cancelada`),
  `chave_acesso`, `numero`, `dps_xml`, `nfse_xml`, `danfse_path`, `mensagens` jsonb, `ambiente`,
  `criado_por`, `criado_em`, `autorizada_em`.
- **RLS:** emitir/ler `nfse` = **`podeVerHonorario`** (admin/financeiro/contador-dono) — ação fiscal
  ligada ao honorário. `nfse_config`/`nfse_certificado` = **admin**. Trigger de autoria
  não-forjável (padrão do projeto).

## 9. UI e fluxo

- **Config (admin):** tela `/configuracoes/nfse` — dados fiscais + upload do certificado.
- **Emissão (ficha do cliente):** botão **"Emitir NFS-e"** (gate `podeVerHonorario`) → pré-preenche
  `valor = honorário` e mostra o tomador (do cadastro) para conferência → confirmar → action
  `emitirNfse(clienteId, competencia)` monta/assina/envia/grava (síncrono).
- **Seção "Notas fiscais"** na ficha: lista emissões (status, número, competência) com **DANFSe
  (PDF)** e **XML** para download.
- Aviso visível quando `ambiente = homologacao` ("sem validade jurídica").

## 10. Erros e casos de borda

- **Tomador sem CNPJ/CPF ou endereço** → bloqueia com aviso (dado fiscal obrigatório).
- **Certificado ausente/expirado** ou **config incompleta** → bloqueia com mensagem clara.
- **Rejeição fiscal** (Sefin devolve código+motivo) → `status = rejeitada`, exibe o motivo, permite
  corrigir e reemitir.
- **Falha de rede/mTLS** → `status = erro`, permite reemitir.
- **Anti-duplicidade:** confirma antes de emitir; alerta se já houver `nfse` autorizada para o mesmo
  `cliente_id` + `competencia`.
- **Homologação × produção:** controlado por env/config; a numeração/série é controlada pela Sefin.

## 11. Testes

- **`cripto.ts` (unit):** round-trip cifra/decifra; falha com chave errada.
- **`dps.ts` (unit):** monta o XML esperado a partir de fixtures (snapshot); campos obrigatórios.
- **`assinatura.ts` (unit):** assina e a assinatura **valida** com um certificado de teste.
- **`envio.ts` (unit):** `fetch` mockado — GZip+Base64 correto, parse de resposta autorizada e
  rejeitada, erro de rede.
- **Action `emitirNfse` (integração mockada):** bloqueios (tomador/cert/config), caminho feliz.
- **E2E em produção restrita (homologação):** certificado de teste, emitir uma nota real de
  homologação, conferir autorização + DANFSe; depois trocar para produção por env.

## 12. Segurança e LGPD

- `NFSE_CERT_KEY` e a senha do certificado só no servidor (runtime, nunca `NEXT_PUBLIC_`).
- Certificado cifrado em repouso (AES-256-GCM); decifrado apenas no runtime da emissão.
- Dados do tomador (cliente) já residem no CRM; a NFS-e apenas os transmite à Sefin.
- RLS mantém a nota (com valor do honorário) restrita a quem já vê honorário; `assistente` não vê.

## 13. Fora do escopo (consciente)

- **NFS-e dos clientes (subsistema B, multi-emitente).**
- **Lote mensal** de emissão (etapa seguinte do A).
- **Cancelamento / substituição** de NFS-e pela UI (evento posterior; a nota já fica armazenada).
- **Reforma tributária (IBS/CBS)** — o layout nacional já prevê o grupo; tratamento específico
  quando obrigatório.

## 14. Decisões em aberto / riscos

- **Assinatura XMLDSig:** canonicalização (C14N) e o `Reference`/transform corretos do layout
  nacional são a parte de maior risco; validar contra o XSD e a produção restrita cedo (Task de
  assinatura + E2E de homologação).
- **mTLS no runtime do Next:** enviar com certificado de cliente exige `https.Agent`/dispatcher
  próprio (o `fetch` padrão não expõe cert de cliente diretamente); confirmar no plano.
- **Valores fiscais exatos** (item LC116, código municipal, ISS de Uberlândia) — preenchidos na
  config pelo escritório; a spec não os fixa.
- **DANFSe (PDF):** a Sefin disponibiliza a representação; confirmar se via endpoint/consulta ou se
  geramos a partir do XML autorizado.
