# 2ª via em PDF do boleto (Banco Inter) — Design

**Data:** 2026-07-20
**Módulo:** Financeiro (Contas a Receber) + Portal do cliente

## Contexto

A emissão de boleto pelo Inter está ativa (v6.40.2). Hoje o boleto do Inter grava `url_pdf = null` — o
adaptador não busca o PDF. Na tela e no portal aparecem só linha digitável e PIX; não há um PDF de 2ª via
para baixar/imprimir. O Asaas, por contraste, devolve uma `url_pdf` externa (já exibida como link "PDF").

A API de Cobrança v3 do Inter tem endpoint de exportação do PDF do boleto. Esta entrega liga a **2ª via em
PDF do Inter**, na **tela da equipe** e no **portal do cliente**, guardando o arquivo no Storage.

## Decisões

1. **Exposição:** equipe (Contas a Receber) **e** portal do cliente.
2. **Guardar no Storage (não sob demanda):** na primeira solicitação, busca o PDF do Inter, salva no
   bucket privado `boletos` e grava o caminho em `boleto.pdf_path`; depois serve do Storage via URL
   assinada. Boleto é estável (linha digitável/PIX fixos), então "desatualizar" não é problema.
3. **Entrega:** download do arquivo `boleto-<numero>.pdf` via URL assinada com opção `download` (mesmo
   padrão de `urlDanfse`/`urlDocumento` do portal).
4. **Endpoint do Inter:** `GET /cobranca/v3/cobrancas/{codigoSolicitacao}/pdf`, resposta com o PDF em
   **base64** (campo `pdf`). O formato exato é **confirmado empiricamente** com o boleto real já emitido
   durante a execução (a integração está viva) — não cravado às cegas.

## Arquitetura

### Schema (migration idempotente)

```sql
alter table boleto add column if not exists pdf_path text;
insert into storage.buckets (id, name, public) values ('boletos', 'boletos', false)
  on conflict (id) do nothing;
```

O bucket é **privado**; todo acesso é por URL assinada gerada server-side com `createAdminSupabase()`
(service_role), então não precisa de policy de `storage.objects` para usuários (ninguém toca o Storage
direto — só o service_role). Espelha o uso de `admin.storage.from(...).createSignedUrl(...)` já existente.

### Adaptador — `src/lib/boleto/inter.ts` e interface

Adicionar método **opcional** `pdf` à interface `ProvedorBoleto` (`src/lib/boleto/tipos.ts`):
```ts
export interface ProvedorBoleto {
  emitir(dados: DadosEmissao): Promise<BoletoEmitido>;
  interpretarWebhook(payload: unknown): EventoPagamento | null;
  pdf?(provedorBoletoId: string): Promise<string | null>; // base64, quando o provedor expõe
}
```
Inter implementa `pdf(cod)`: `GET /cobrancas/${cod}/pdf` (reusa `req`/`obterToken`/mTLS) e retorna o
base64. Função pura `extrairPdfBase64Inter(resp)` isola a leitura do campo (testável): retorna
`resp.pdf` quando string não vazia, senão `null`. Asaas **não** implementa `pdf` (usa `url_pdf`).

### Lib compartilhada — `garantirPdfBoleto`

`src/app/(app)/financeiro/contas-a-receber/boleto-pdf.ts` (server-only), usada pela equipe e pelo portal:
```ts
// Garante o PDF no Storage e devolve o caminho; null se o provedor não expõe PDF.
export async function garantirPdfBoleto(boletoId: string): Promise<string | null>;
```
Fluxo (com `createAdminSupabase()`):
1. Lê o boleto (`id, provedor, provedor_boleto_id, pdf_path, numero`).
2. Se `pdf_path` já setado → devolve.
3. Se `provedor !== 'inter'` (ou sem adaptador com `pdf`) → devolve `null` (Asaas cai na `url_pdf`).
4. Resolve o adaptador ativo (`adaptadorAtivo`), chama `adaptador.pdf(provedor_boleto_id)`; se vier
   base64, decodifica, faz `upload` em `boletos/<boletoId>.pdf` (contentType `application/pdf`), grava
   `pdf_path` e devolve o caminho. Em falha, devolve `null`.

`assinarPdfBoleto(path, numero)`: `admin.storage.from("boletos").createSignedUrl(path, 60, { download: \`boleto-${numero}.pdf\` })`.

### Fatia A — botão na tela da equipe

Ação `urlBoletoPdfEquipe(boletoId)` em `boleto-actions.ts` (gate `podeGerenciarFinanceiro`): se o boleto
tem `url_pdf` (Asaas) → devolve-a; senão `garantirPdfBoleto` + `assinarPdfBoleto`. Retorna `{ url }` ou
`{ erro }`.

`BoletoTitulo.tsx`: além dos botões atuais, quando **não** há `urlPdf` (caso Inter) e o boleto está
emitido, mostrar **"Baixar PDF (2ª via)"** que chama `urlBoletoPdfEquipe` e abre a URL (download). Se
`urlPdf` presente (Asaas), o link "PDF" atual permanece.

### Fatia B — botão no portal do cliente

Ação `urlBoletoPdf(boletoId)` em `src/app/(portal)/portal/actions.ts` (gate `cliente`): lê o boleto via
`createServerSupabase()` (RLS `boleto_portal_sel` garante que é do próprio cliente) — se não achar,
"não encontrado"; senão `garantirPdfBoleto` + `assinarPdfBoleto`, `registrar(..., "boleto", id)` (RF-053,
já suporta `tipo: "boleto"`), retorna `{ url }`.

`src/app/(portal)/portal/boletos/page.tsx` + um componente cliente (ex.: estender `LinkBoleto` ou novo
`BaixarBoletoPdf`): botão **"Baixar boleto (PDF)"** por boleto, que chama `urlBoletoPdf` e baixa. Convive
com a linha digitável/PIX já exibidos.

## Testes

- `src/tests/boleto/inter-pdf.test.ts` — `extrairPdfBase64Inter`: retorna o base64 quando presente; `null`
  quando ausente/vazio/tipo errado.
- Render `BoletoTitulo` (Inter, sem `urlPdf`, emitido) → aparece "Baixar PDF (2ª via)"; (Asaas, com
  `urlPdf`) → aparece o link "PDF" e **não** o botão novo.
- Render do botão do portal (`BaixarBoletoPdf`) → rótulo presente.
- A busca real no Inter + upload no Storage não roda em teste local (rede/serviço) — validada com o boleto
  vivo durante a execução; a lib `garantirPdfBoleto` é fina e orquestra peças testadas isoladamente.

## Fatiamento

- **Fatia A — equipe:** adaptador `pdf` (Inter) + `extrairPdfBase64Inter` + migration (coluna + bucket) +
  `garantirPdfBoleto`/`assinarPdfBoleto` + ação e botão "Baixar PDF (2ª via)" no `BoletoTitulo`.
- **Fatia B — portal:** ação `urlBoletoPdf` + botão no portal/boletos. Depende da lib da Fatia A.

## Constraints do projeto (herdadas)

- Gate equipe = `podeGerenciarFinanceiro`; portal = papel `cliente` (RLS `boleto_portal_sel`).
- Migrations imutáveis; novas idempotentes; bucket via `insert ... on conflict do nothing`.
- Storage e segredos server-only; URL assinada de vida curta (60s), como o resto do portal.
- Guard `divida-ui`: sem `border` estático em input; sem `←`/`amber-\d`.
- `package.json.version` sobe com o CHANGELOG no mesmo PR; `versao.test.ts` exige que batam.

## Fora de escopo

- Buscar/armazenar o PDF automaticamente na emissão (fica lazy, na 1ª solicitação).
- PDF para Asaas via Storage (Asaas já tem `url_pdf` externa — usada direto).
- Regeneração/invalidação do PDF guardado (boleto é estável; não há repull).
