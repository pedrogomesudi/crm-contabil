# Legalização — Fatia C (termo de entrega NBC PG 01) — Design

**Data:** 2026-07-12
**Contexto:** Fecha o RF-014. Nos processos de **transferência de contabilidade** (entrada/saída), gera o **Termo de Entrega/Recebimento de Acervo Documental** exigido pela NBC PG 01.

## Objetivo

Botão no detalhe do processo de transferência que gera um **PDF do termo** — Marca do escritório (texto), cliente, tipo (recebimento na entrada / entrega na saída), **lista editável de itens do acervo** (pré-preenchida com um checklist padrão), data e linhas de assinatura — e o **anexa ao acervo** do cliente.

## Decisão (brainstorm)
- **Acervo = lista editável com checklist padrão:** ao gerar, abre um campo com `ACERVO_PADRAO` (livros contábeis, guias, declarações, notas fiscais, folhas, contratos, certificado digital, procurações…), um item por linha, que o usuário edita antes de gerar.

## Escopo (sem migration)

Reaproveita: `converterPdfHtml` + `sanitizarHtml` (motor HTML→PDF via Gotenberg, JS off), a **Marca** (`escritorio_config`, texto — sem logo para evitar fetch externo no Gotenberg), e o padrão de anexo em `documentos`.

### Biblioteca — `src/lib/legalizacao/termo.ts` (pura, testável)
- `ACERVO_PADRAO: string[]` — checklist padrão.
- `type DadosTermo = { tipo: "transferencia_entrada"|"transferencia_saida"; cliente: string; marca: { nome:string|null; cnpj:string|null; enderecoLinha:string }; itens: string[]; data: string /* ISO */; responsavel: string|null }`.
- `montarTermoHtml(d: DadosTermo): string` — HTML autocontido do termo:
  - título "Termo de **Recebimento**/**Entrega** de Acervo Documental" conforme entrada/saída;
  - cabeçalho da Marca (nome, CNPJ, endereço);
  - parágrafo declaratório NBC PG 01 (a contabilidade declara ter recebido/entregue do/ao cliente os itens abaixo);
  - `<ul>` dos itens (escapados);
  - local/data e **duas linhas de assinatura** (o escritório e o cliente/contabilidade sucessora).
  - Escapa todo texto (HTML-safe) e passa por `sanitizarHtml`.

### Ação — em `src/app/(app)/legalizacao/actions.ts` (nova função)
- `gerarTermoAcervo(processoId, { itens, data, responsavel }): Promise<{ pdfBase64?: string; nome?: string; erro?: string }>`:
  - gate (`podeGerenciarLegalizacao`); carrega o processo (precisa ser tipo `transferencia_*`, senão erro), o cliente (nome) e a Marca;
  - `montarTermoHtml` → `converterPdfHtml`; se `null`, erro ("conversão indisponível");
  - **anexa** o PDF ao cliente em `documentos` (nome "Termo de acervo — NBC PG 01", tipo "legalização"); não aborta o download se o anexo falhar;
  - retorna `pdfBase64` + `nome = termo-acervo-<numero-ou-id>.pdf`.

### Tela — no detalhe `/legalizacao/[id]`
- Só para processos de transferência: seção **"Termo de entrega (NBC PG 01)"** com campo **data** (default hoje), **responsável** (default nome do usuário logado), e **textarea "Itens do acervo"** pré-preenchida com `ACERVO_PADRAO` (um por linha). Botão **"Gerar termo"** → chama a action, faz **download** do PDF e `router.refresh()` (o termo aparece nos Documentos do cliente).
- Componente `TermoAcervo.tsx` (client); o `page.tsx` passa `tipo`, `clienteNome`, `hoje`, `responsavelPadrao`.

## Testes
- **Unit** (`termo.test.ts`): `ACERVO_PADRAO` não-vazio; `montarTermoHtml` — título "Recebimento" p/ entrada e "Entrega" p/ saída; contém o cliente, a Marca e todos os itens; escapa `<`/`&` (sem HTML injetável).
- Suíte completa verde antes de cada commit.

## Fora de escopo
- Assinatura eletrônica do termo (Clicksign) — futuro; hoje o PDF tem linhas para assinatura manual.
- Logo no termo (evitado para não depender de fetch externo no Gotenberg; cabeçalho textual).

## Segurança
- HTML do termo **escapado + sanitizado**; conversão com **JS off, sem rede externa**.
- Anexo no bucket privado `documentos`; RLS do cliente vale (contador só os seus).
