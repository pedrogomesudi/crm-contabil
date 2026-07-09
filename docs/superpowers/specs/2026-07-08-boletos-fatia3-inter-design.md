# Boletos — Fatia 3: adaptador Inter — Design

**Data:** 2026-07-08
**Marco:** implementar o adaptador do **Banco Inter** (contrato `ProvedorBoleto`) — emitir boleto (BoléPix,
boleto+PIX) via OAuth2 + mTLS e interpretar o webhook de pagamento. Construído/testado sem conta; o teste
ao vivo fica para quando houver conta Inter + certificado.

**Contexto (Fatias 1–2):** contrato `src/lib/boleto/tipos.ts` (`ProvedorBoleto`, `DadosEmissao`,
`BoletoEmitido`, `EventoPagamento`); config `boleto_config` (Inter: `inter_client_id_cifrado`,
`inter_client_secret_cifrado`, `inter_conta_corrente`, `inter_cert_cifrado`, `inter_key_cifrado`); o Asaas
já segue este mesmo padrão (`src/lib/boleto/asaas.ts`).

**API Inter (Cobrança v3 / BoléPix), verificada:** OAuth2 `client_credentials` + **mTLS** (cert/key). Base
**produção** `https://cdpj.partners.bancointer.com.br` · **sandbox** `https://cdpj-sandbox.partners.uatinter.co`.
Token: `POST /oauth/v2/token` (`application/x-www-form-urlencoded`, scope `boleto-cobranca.read
boleto-cobranca.write`). Emissão: `POST /cobranca/v3/cobrancas` → `{ codigoSolicitacao }`. Consulta:
`GET /cobranca/v3/cobrancas/{codigoSolicitacao}` → boleto (linhaDigitavel, nossoNumero) + pix (pixCopiaECola).

## Decisões

1. mTLS via **`undici.Agent`** (`connect: { cert, key }`) passado como `dispatcher` no `fetch`.
2. Token OAuth cacheado por instância do adaptador (reusa até expirar).
3. Inter **exige endereço do pagador** → estender `DadosEmissao` (opcional; o Asaas ignora).
4. Lógica pura separada da orquestração para testar sem rede.

## Escopo (Fatia 3)

- Extensão de `DadosEmissao` (`pagadorEndereco?`).
- Módulo `src/lib/boleto/inter.ts` implementando `ProvedorBoleto`.
- Funções puras testadas + fábrica com `fetch` mockado.

**Fora:** UI, rota de webhook, emissão a partir do título, tabela `boleto` (Fatia 4).

## Ajuste no contrato — `src/lib/boleto/tipos.ts`

Acrescentar a `DadosEmissao` (opcional, não quebra o Asaas):
```ts
pagadorEndereco?: { cep: string; logradouro: string; numero: string; bairro: string; cidade: string; uf: string } | null;
```
A Fatia 4 preenche do cadastro do cliente (`clientes.endereco`). O Asaas ignora este campo.

## Módulo — `src/lib/boleto/inter.ts`

### Funções puras (testáveis, sem rede)
```ts
export function baseUrlInter(ambiente: "sandbox" | "producao"): { oauth: string; cobranca: string };
export function corpoTokenInter(clientId: string, clientSecret: string): Record<string, string>;
export function tipoPessoaPorDoc(documento: string): "FISICA" | "JURIDICA";
export function corpoCobrancaInter(dados: DadosEmissao): Record<string, unknown>;
export function parsearConsultaInter(codigoSolicitacao: string, consulta: Record<string, unknown>): BoletoEmitido;
export function interpretarWebhookInter(payload: unknown): EventoPagamento | null;
```
- `baseUrlInter`: produção → `{ oauth: ".../oauth/v2/token", cobranca: ".../cobranca/v3" }` em
  `cdpj.partners.bancointer.com.br`; sandbox em `cdpj-sandbox.partners.uatinter.co`.
- `corpoTokenInter`: `{ grant_type: "client_credentials", client_id, client_secret, scope: "boleto-cobranca.read boleto-cobranca.write" }`.
- `tipoPessoaPorDoc`: dígitos com length 11 → `"FISICA"`; senão `"JURIDICA"`.
- `corpoCobrancaInter(dados)`:
  ```
  { seuNumero: dados.seuNumero, valorNominal: dados.valor, dataVencimento: dados.vencimento,
    numDiasAgenda: 60,
    pagador: { cpfCnpj: dados.pagadorDocumento, tipoPessoa: tipoPessoaPorDoc(...), nome: dados.pagadorNome,
      email: dados.pagadorEmail ?? undefined,
      cep, endereco: logradouro, numero, bairro, cidade, uf } }
  ```
  Endereço vem de `dados.pagadorEndereco` (campos `?? ""` quando ausente — o "vazio" só falha no envio real,
  que a Fatia 4 previne exigindo endereço).
- `parsearConsultaInter(cod, consulta)` → `BoletoEmitido`:
  - `provedorBoletoId` = `cod`;
  - `nossoNumero` = `consulta.boleto?.nossoNumero ?? null`;
  - `linhaDigitavel` = `consulta.boleto?.linhaDigitavel ?? null`;
  - `pixCopiaCola` = `consulta.pix?.pixCopiaECola ?? null`;
  - `urlPdf` = `null` (o Inter entrega o PDF em base64 por endpoint próprio; a Fatia 4 busca se precisar).
- `interpretarWebhookInter(payload)`: objeto com `codigoSolicitacao` + `situacao`; situação ∈
  `{RECEBIDO, MARCADO_RECEBIDO, PAGO}` → `{ provedorBoletoId: codigoSolicitacao, pago: true, valorPago:
  (valorNominal se numérico) ?? null, pagoEm: (dataHoraSituacao se string) ?? null }`; senão `null`.

### Fábrica (OAuth + mTLS + `fetch`)
```ts
export function criarAdaptadorInter(clientId: string, clientSecret: string, contaCorrente: string, certPem: string, keyPem: string, ambiente: "sandbox" | "producao"): ProvedorBoleto;
```
- Cria um `undici.Agent({ connect: { cert: certPem, key: keyPem } })` (mTLS) usado como `dispatcher`.
- `obterToken()`: se há token em cache válido, reusa; senão `POST oauth/v2/token`
  (`application/x-www-form-urlencoded` com `corpoTokenInter`), guarda `access_token` + expiração
  (`expires_in`).
- `emitir(dados)`: token → `POST /cobranca/v3/cobrancas` (headers `Authorization: Bearer`,
  `Content-Type: application/json`, `x-conta-corrente: contaCorrente`) body `corpoCobrancaInter` →
  `{ codigoSolicitacao }` → `GET /cobranca/v3/cobrancas/{codigoSolicitacao}` → `parsearConsultaInter`.
- Erro HTTP (≥ 400) em token/emissão → `throw` com a mensagem do Inter.
- `interpretarWebhook` = `interpretarWebhookInter`.

## Tratamento de erros
- Falha no token ou na emissão → lança (a Fatia 4 mostra o erro).
- Consulta falha → propaga (sem a linha digitável a emissão não é útil).

## Caveat (acerto fino ao vivo)
A doc oficial é SPA e não extraiu 100%. **Nomes de campo do pagador** (`endereco` vs `logradouro`) e os
**valores de `situacao`** do webhook podem precisar de ajuste no **primeiro teste ao vivo** (conta Inter +
certificado). Estão isolados em `corpoCobrancaInter`/`interpretarWebhookInter` — ajuste de 1–2 linhas.

## Testes
- **Unit (Vitest):** `baseUrlInter` (prod/sandbox), `corpoTokenInter`, `tipoPessoaPorDoc` (11→FISICA,
  14→JURIDICA), `corpoCobrancaInter` (com e sem `pagadorEndereco`), `parsearConsultaInter`,
  `interpretarWebhookInter` (RECEBIDO→pago; situação irrelevante→null; payload inválido→null).
- **Orquestração:** `criarAdaptadorInter().emitir(...)` com `fetch` mockado (token → cobrancas → consulta),
  conferindo o `BoletoEmitido` e que o header `x-conta-corrente` foi enviado.

## Migrations
Nenhuma.
