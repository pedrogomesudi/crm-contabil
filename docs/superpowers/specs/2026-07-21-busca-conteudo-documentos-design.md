# RF-061 — Busca no conteúdo de documentos (PDF digital) (design)

## Objetivo

Tornar o texto dos PDFs digitais pesquisável na busca de documentos que já existe, cobrindo o
acervo já enviado. Completa o RF-061 (a busca por metadados já existe desde a v6.32).

## Decisões (do brainstorm)

- **Alcance:** só **PDF digital** (camada de texto nativa). Sem OCR — imagens e PDFs escaneados
  ficam para uma fatia futura.
- **Extração:** lib JS pura **`unpdf`** (sem binário nativo), **inline no upload**. Sem serviço
  externo, sem cron.
- **Acervo:** **reprocessado** por um script one-shot de backfill (rodado uma vez, como uma
  migration).
- **Entrega:** uma release só (a indexação sem o campo de busca não é demonstrável).

## Arquitetura

### 1. Migration `0124_documentos_conteudo.sql`

```sql
-- RF-061: busca no conteúdo de PDFs digitais.
alter table documentos add column if not exists texto_extraido text;
alter table documentos add column if not exists texto_status text; -- null=pendente | 'ok' | 'vazio' | 'erro'
-- Coluna gerada: o app só escreve texto_extraido; o tsvector se deriva sozinho.
-- to_tsvector(regconfig_constante, text) é IMMUTABLE, então pode ser usada em coluna gerada.
alter table documentos
  add column if not exists conteudo tsvector
  generated always as (to_tsvector('portuguese', coalesce(texto_extraido, ''))) stored;
create index if not exists idx_documentos_conteudo on documentos using gin(conteudo);
```

- `texto_extraido` é lido só server-side (nunca entra no `select` da busca) — a RLS `doc_select`
  já protege a linha.
- `texto_status`: `'vazio'` = PDF sem camada de texto (provável digitalização); `'erro'` =
  falha na extração; `null` = ainda não processado.
- Sem policy de UPDATE em `documentos` → a escrita do texto usa **service_role**.

### 2. Extração — `src/lib/documentos/extrair-texto.ts`

```ts
import { extractText, getDocumentProxy } from "unpdf";

export type ResultadoExtracao = { texto: string; status: "ok" | "vazio" };

// Normaliza espaços e decide o status a partir do texto bruto — puro/testável.
export function classificarTexto(bruto: string): ResultadoExtracao {
  const texto = bruto.replace(/\s+/g, " ").trim();
  return texto ? { texto, status: "ok" } : { texto: "", status: "vazio" };
}

// Extrai a camada de texto de um PDF digital. PDF escaneado devolve status 'vazio'.
export async function extrairTextoPdf(bytes: Uint8Array): Promise<ResultadoExtracao> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return classificarTexto(typeof text === "string" ? text : text.join(" "));
}
```

`classificarTexto` é a parte testável isolada; `extrairTextoPdf` é o wrapper fino do `unpdf`,
e erros dele são capturados pelo chamador (→ `texto_status='erro'`).

### 3. Indexação no upload

Em `anexarDocumento` e `anexarNovaVersao` (`src/app/(app)/documentos/actions.ts`), após o
insert bem-sucedido:
- O insert passa a devolver o id (`.insert({...}).select("id").single()`).
- Se `file.type === "application/pdf"`: extrai de `new Uint8Array(await file.arrayBuffer())`,
  e faz `admin.from("documentos").update({ texto_extraido, texto_status }).eq("id", id)`. Erro
  na extração grava `texto_status='erro'` (num try/catch).
- Se não for PDF (PNG/JPG): grava `texto_status='vazio'` (sem OCR neste escopo).
- **A extração é best-effort: o upload já sucedeu; nenhuma falha aqui derruba o retorno `{ ok }`.**

### 4. Backfill do acervo — `scripts/backfill-conteudo.mjs`

Script one-shot no padrão dos `scripts/*.mjs` (JS puro, `createClient` com
`SUPABASE_SERVICE_ROLE_KEY`, importa `unpdf` direto — não importa a lib TS):
- Seleciona `documentos` com `texto_status is null` e `caminho_storage ilike '%.pdf'`.
- Para cada: `admin.storage.from("documentos").download(caminho)` → `Uint8Array` → extrai
  (mesma lógica de `classificarTexto`, reescrita inline por o script ser standalone) →
  `update({ texto_extraido, texto_status })`. Loga progresso.
- Passo final: `update documentos set texto_status='vazio' where texto_status is null and
  caminho_storage not ilike '%.pdf'` (marca os não-PDF, completando o status).
- Resumo ao fim (ok / vazio / erro). Rodado **uma vez** em produção:
  `node --env-file=.env.producao.bak scripts/backfill-conteudo.mjs`.

### 5. Busca (o plugue)

- `FiltroResolvido` (`src/lib/documentos/busca-metadados.ts`) ganha `conteudo?: string`;
  `lerFiltroBusca` lê `sp.conteudo` (trim, ≤100 chars).
- `buscarDocumentos` (`src/app/(app)/documentos/actions.ts`): novo filtro
  `if (f.conteudo) q = q.textSearch("conteudo", f.conteudo, { type: "websearch", config: "portuguese" })`.
  O `select` ganha `texto_status`; `DocBusca` ganha `textoStatus: string | null`.
- Form em `src/app/(app)/documentos/page.tsx`: campo "Buscar no conteúdo" (`name="conteudo"`).
- Na lista de resultados, indicador discreto quando `textoStatus === 'vazio'`
  (*"digitalização — sem texto pesquisável"*), explicando por que um PDF escaneado não aparece
  na busca por conteúdo e preparando o terreno para o OCR.

### 6. Dependência

`npm install unpdf` — lib JS pura (sem binário nativo), compatível com o container Node
standalone do EasyPanel. Roda no runtime Node das server actions.

## Testes

- `src/tests/documentos/extrair-texto.test.ts` (`classificarTexto`): texto normal → `ok` com
  espaços colapsados; só espaços/quebras → `vazio`; string vazia → `vazio`; preserva o conteúdo
  ao normalizar. (O wrapper `extrairTextoPdf` depende do `unpdf` e é verificado pelo build +
  smoke manual, não por unitário.)

## Fora de escopo (YAGNI)

OCR de imagens/PDF escaneado (fatia futura — o indicador `'vazio'` já sinaliza a lacuna);
snippet com destaque (`ts_headline` exigiria RPC); `unaccent`/busca fuzzy; extração de
docx/xlsx; reprocessamento automático se a lib de extração mudar; reindexação por cron.
