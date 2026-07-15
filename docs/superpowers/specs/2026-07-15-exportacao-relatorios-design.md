# RF-075 — Exportação de relatórios (XLSX e PDF) — Design

**Data:** 2026-07-15
**Requisito (RF-075, MVP):** *"Exportação de todos os relatórios em XLSX e PDF."* Hoje **Parcial**: há CSV
ad-hoc em alguns relatórios, PDF só via Gotenberg (propostas/contratos/LGPD) e **nenhum XLSX**.

---

## 1. O eixo: uma camada única, não exportação por tela

Hoje cada relatório que exporta reimplementa o CSV do zero. Em vez de espalhar mais formatos, o desenho
**unifica**: um relatório vira um objeto padrão `RelatorioExportavel`, e uma camada única gera **XLSX**,
**PDF** e **CSV** a partir dele. Cada tela só descreve seus dados (colunas + linhas) e ganha os três
formatos de graça.

```ts
type Formato = "texto" | "moeda" | "numero" | "data" | "percent";
type Coluna = { chave: string; rotulo: string; formato?: Formato };
type RelatorioExportavel = {
  titulo: string;
  subtitulo?: string;         // período, filtros aplicados
  colunas: Coluna[];
  linhas: Record<string, unknown>[];
  totais?: Record<string, unknown>;  // linha de rodapé opcional
};
```

## 2. Os três formatos

- **XLSX** (`exceljs`, **server-only**): cabeçalho em negrito, larguras automáticas, e o **formato por
  coluna** aplicado de verdade (moeda `R$ #,##0.00`, data, percent) — não texto solto. Uma aba por relatório;
  a linha de totais em negrito. É o diferencial sobre CSV: o contador abre no Excel e já soma/filtra.
- **PDF** (reusa `converterPdfHtml` → Gotenberg): tabela HTML sanitizada + cabeçalho com título/subtítulo/
  data. Degrada para HTML se `GOTENBERG_URL` faltar (como as demais telas).
- **CSV** (puro, testável): separador `;` e BOM UTF-8 (o Excel-BR abre com acento certo). Substitui os CSVs
  ad-hoc — que passam a usar a camada única.

## 3. Arquitetura

```
src/lib/exportar/
  tipos.ts        RelatorioExportavel, Coluna, Formato
  formato.ts      (puro) formatarCelula(valor, formato) — moeda/data/percent/número
  csv.ts          (puro) paraCsv(rel) — separador ;, BOM, escape de aspas/;
  html.ts         (puro) paraHtml(rel) — tabela sanitizada para o Gotenberg
  xlsx.ts         (server-only) paraXlsx(rel): Promise<Buffer> — exceljs
src/app/(app)/exportar/actions.ts   exportar(rel, formato) → base64 (gate por papel do relatório)
src/components/ui/BotaoExportar.tsx  client: 3 botões (XLSX / PDF / CSV) → baixa via base64
```

O componente reusa o `baixarBase64` de `@/lib/lgpd/tipos` (já existe). A action recebe o
`RelatorioExportavel` **já montado no servidor** pela tela (a tela é quem tem os dados e o gate) e devolve o
arquivo — a action de exportar não reconsulta o banco, só serializa.

**Por que a tela monta o relatório e não a action:** cada relatório tem seu próprio gate de papel e sua
própria query (rentabilidade é admin/financeiro, conformidade é admin/contador…). Centralizar a montagem na
action duplicaria essa lógica. A tela já computa os dados para exibir; exportar é serializar o que já está
na mão.

## 4. Onde entra (os relatórios tabulares)

Padroniza e acrescenta XLSX+PDF onde faz sentido, **trocando os CSVs ad-hoc pela camada única**:

- Financeiro: **Indicadores**, **Extrato**, **Fluxo de caixa**, **Rentabilidade**;
- Obrigações: **Conformidade**;
- Vencimentos (certificados/procurações);
- Clientes: a **lista** (carteira) filtrada.

Cada um: montar o `RelatorioExportavel` no server component (ou action existente) e colocar o
`<BotaoExportar>` no topo. Os demais relatórios tabulares (contas a pagar/receber, orçado×realizado) entram
na mesma fatia se couberem sem esforço; senão, pela mesma camada, depois.

**Fora desta fatia:** relatórios que já têm saída própria e não-tabular (proposta/contrato em PDF via
template, relatório LGPD do titular) ficam como estão — não são "relatórios" no sentido de tabela.

## 5. Biblioteca

`exceljs` (pura JS, mantida, streams) — **usada só no servidor** (`xlsx.ts` com `import "server-only"`), então
**não** entra no bundle do cliente. É a única dependência nova.

## 6. Testes

Puros (vitest): `formatarCelula` (moeda com NBSP normalizado, data ISO→dd/mm/aaaa, percent, número,
null→"—"); `paraCsv` (separador, BOM, escape de `;`/aspas/quebra de linha, linha de totais); `paraHtml`
(escape de `<`/`&`, cabeçalho, sem `<script>`). O `paraXlsx` é I/O — um teste leve confere que devolve um
Buffer não-vazio com a assinatura ZIP (`PK`).

## 7. Entrega

`npm i exceljs` → lint/typecheck/test/build → deploy. Validar: em cada relatório, baixar **XLSX** (abre no
Excel com moeda/data formatadas e a linha de totais), **PDF** (título, período, tabela) e **CSV** (acentos
corretos no Excel-BR).

**Versão:** `v6.4.0` (feature).
