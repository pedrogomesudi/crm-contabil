# RF-075 — Exportação de relatórios (XLSX e PDF) — Plano

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.

**Objetivo:** camada única de exportação (XLSX + PDF + CSV) que qualquer relatório usa a partir de um
`RelatorioExportavel`, ligada aos relatórios tabulares.

**Arquitetura:** tipos + formatação + CSV + HTML **puros e testados**; XLSX server-only (`exceljs`); a tela
monta o relatório (tem os dados e o gate) e `<BotaoExportar>` baixa via base64.

## Restrições globais
- A tela monta o `RelatorioExportavel`; a action só serializa.
- `exceljs` **só no servidor** (`import "server-only"` em `xlsx.ts`).
- CSV com separador `;` e BOM UTF-8. PDF reusa `converterPdfHtml`, degrada para HTML sem `GOTENBERG_URL`.
- `npm run lint && npm run typecheck && npm test && npm run build` antes de cada commit.

---

### Tarefa 1: Núcleo puro (tipos, formato, CSV, HTML) + testes
- Criar `src/lib/exportar/{tipos,formato,csv,html}.ts` e `src/tests/exportar/exportar.test.ts`.
- `formatarCelula(valor, formato)`: moeda (NBSP normalizado), data ISO→dd/mm/aaaa, percent `${n}%`, número
  pt-BR, null→"—". Reusa `formatarMoeda`/`formatarData` de `@/lib/format`.
- `paraCsv`: BOM + cabeçalho + linhas + totais; escape de `;`/`"`/`\n` com aspas.
- `paraHtml`: `<h1>`/`<p>` + `<table>` sanitizada (escapa `& < > "`), totais em `<tfoot>`.
- Testes primeiro (moeda, data, percent, null; CSV separador/BOM/escape; HTML escape/sem `<script>`).
- Commit: `feat(exportar): nucleo puro (tipos, formato, CSV, HTML)`.

### Tarefa 2: XLSX (exceljs) + action
- `npm i exceljs`. `src/lib/exportar/xlsx.ts` (server-only) `paraXlsx(rel): Promise<Buffer>` — cabeçalho
  negrito, numFmt por coluna (moeda/data/percent/número), valores nativos, largura automática, totais negrito.
- Teste leve: Buffer começa com `PK` (ZIP).
- `src/app/(app)/exportar/actions.ts` `exportar(rel, formato)`: gate equipe ativa; xlsx/csv/pdf → `{base64,nome,mime}`.
- Commit: `feat(exportar): XLSX (exceljs, server-only) e action nos 3 formatos`.

### Tarefa 3: `<BotaoExportar>`
- `src/components/ui/BotaoExportar.tsx` (client): 3 botões XLSX/PDF/CSV → `exportar` → `baixarBase64` (de
  `@/lib/lgpd/tipos`). Estado "gerando…" + erro.
- Commit: `feat(exportar): botao reutilizavel XLSX/PDF/CSV`.

### Tarefa 4: Ligar nos relatórios
- Rentabilidade, Conformidade de obrigações, Indicadores, Extrato, Fluxo de caixa, Vencimentos, Lista de
  clientes — montar o `RelatorioExportavel` e por o `<BotaoExportar>`. Remover os CSV ad-hoc.
- Commit: `feat(exportar): relatorios financeiros, obrigacoes, vencimentos e clientes exportam XLSX/PDF/CSV`.

### Tarefa 5: Docs, entrega e tag
- `docs/DOCUMENTACAO.md` + `CHANGELOG.md`; merge; pedir validação (baixar XLSX/PDF/CSV em Rentabilidade e
  Conformidade); tag `v6.4.0` após "validei".
