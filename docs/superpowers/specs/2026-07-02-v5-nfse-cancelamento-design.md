# V5-A — Cancelamento de NFS-e — design

> **Status:** design aprovado para implementação · **Data:** 2026-07-02 · **Extensão da** V5-A (NFS-e nacional)

## 1. Contexto e objetivo

Notas emitidas por engano (valor errado, serviço não prestado, duplicidade) precisam ser
**canceladas**. Na NFS-e nacional o cancelamento é um **evento** enviado à Sefin, assinado com o
certificado do escritório. Esta etapa adiciona um botão **"Cancelar"** nas notas autorizadas,
reusando toda a infra de certificado, assinatura e mTLS da emissão.

## 2. Decisões do brainstorming

- **Motivo:** seletor com os **códigos oficiais** (`cMotivo`: **1** Erro na emissão · **2** Serviço
  não prestado · **9** Outros) + **justificativa** (`xMotivo`, texto obrigatório).
- **Quem cancela:** `podeVerHonorario` (quem emite pode cancelar).
- **Confirmação** obrigatória antes de enviar (ação sensível).
- **Só notas `autorizada`** podem ser canceladas.

## 3. Integração Sefin (evento de cancelamento)

- **Endpoint:** `POST {NFSE_URL}/nfse/{chaveAcesso}/eventos` (registro de evento).
- **Corpo:** o XML do evento de cancelamento, **assinado (XMLDSig)**, **GZip + Base64** (igual à DPS),
  no JSON.
- **Campos do evento:** `chNFSe` (chave), `tpAmb`, `dhEvento`, `nDFSe` (número da nota), `dhProc`,
  `CNPJAutor` (CNPJ do emitente), `cMotivo`, `xMotivo`.
- **mTLS** com o certificado A1 (mesmo da emissão).
- **Resposta:** `cStat`/`xMotivo` + `idEvento`/`dhRegEvento`; sucesso = evento registrado → nota
  cancelada. Sem prazo máximo nacional; a Sefin rejeita se a regra municipal vencer.
- **`nDFSe`:** obtido de `nfse.numero`; se ausente, extraído do `nfse_xml` armazenado (`nNFSe`) — o
  caminho exato é confirmado na homologação, isolado no montador do evento.

## 4. Motor (reuso da infra V5)

`src/lib/nfse/cancelamento.ts` — isolado e testável:

- **`montarEventoCancelamento(dados): { xml: string; idEvento: string }`** — monta o XML do evento
  (layout nacional) a partir de `{ chave, nDFSe, cnpj, ambiente, cMotivo, xMotivo }`. Puro.
- **`enviarEvento(xmlAssinado: string, chave: string, cert: { pfx; senha }, ambiente): Promise<ResultadoEvento>`** —
  GZip+Base64 → POST mTLS a `/nfse/{chave}/eventos` → parse `{ aceito: boolean; idEvento?: string;
  mensagens?: string[]; xml?: string }`.
- **Assinatura:** reusa o padrão XMLDSig da emissão (`assinarDps` generalizado ou uma função irmã
  `assinarEvento` com C14N padrão + Id do evento).
- **Certificado/mTLS/timeout:** os mesmos de `envio.ts`.

## 5. Dados

Migration nova (`0023_nfse_cancelamento.sql`, idempotente):

- `nfse.cancelado_em timestamptz`.
- `nfse.cancelamento jsonb` — `{ cMotivo, xMotivo, idEvento, xml }` (retorno/justificativa).
- Status reusa **`cancelada`** (já previsto). Nenhuma policy nova (mesma tabela).

## 6. UI (ficha do cliente)

- Na lista de notas, para status **`autorizada`**, um botão **"Cancelar"** (client component
  `CancelarNfse`), gated por `podeVerHonorario`.
- Abre um form: **motivo** (select 1/2/9) + **justificativa** (textarea, obrigatória) + **Confirmar**
  / Cancelar.
- Action `cancelarNfse(nfseId, cMotivo, justificativa)`: carrega a nota (RLS) + certificado (admin
  via service_role, após confirmar acesso) → monta/assina/envia o evento → em caso de aceite, grava
  `status='cancelada'`, `cancelado_em`, `cancelamento`. `revalidatePath`.
- Após cancelar: some o botão "Cancelar"; a nota mostra **"Cancelada"** (o selo/rótulo). O DANFSe
  passa a refletir o cancelamento (a Sefin marca).

## 7. Erros e casos de borda

- **Nota não autorizada** (rascunho/rejeitada/já cancelada): sem botão / bloqueia.
- **Justificativa vazia:** bloqueia com aviso.
- **Rejeição da Sefin** (fora do prazo, nota já cancelada na origem, etc.): mostra o motivo; status
  **permanece `autorizada`**.
- **Falha de rede/mTLS:** erro claro; status inalterado; pode tentar de novo.
- **Homologação × produção:** herda `nfse_config.ambiente` (o `tpAmb` do evento acompanha).

## 8. Testes

- **`montarEventoCancelamento` (unit):** XML com `chNFSe`, `cMotivo`, `xMotivo`, `tpAmb` corretos e
  `Id` do evento.
- **`enviarEvento`/parse (unit):** `fetch`/mTLS mockado — GZip+Base64 e parse de aceito/rejeitado.
- **`assinarEvento` (unit):** assinatura enveloped válida (cert de teste), como no `assinarDps`.
- **E2E (homologação):** emitir uma nota, **cancelar** com motivo+justificativa, conferir
  `status='cancelada'` e o retorno; tentar cancelar de novo → rejeição tratada.

## 9. Fora do escopo (consciente)

- **Substituição** de NFS-e (cancelar + reemitir num passo).
- **Cancelamento em lote.**
- Outros **eventos** (ex.: rejeição de tomador) — só cancelamento nesta etapa.
