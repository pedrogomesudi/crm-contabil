// Contrato único de exportação: a tela monta o RelatorioExportavel (ela tem os dados
// e o gate) e a camada de exportação o serializa em XLSX, PDF ou CSV.

export type FormatoCelula = "texto" | "moeda" | "data" | "percent" | "numero";

export type ColunaRelatorio = {
  chave: string;
  rotulo: string;
  formato: FormatoCelula;
};

export type LinhaRelatorio = Record<string, unknown>;

export type RelatorioExportavel = {
  titulo: string;
  subtitulo?: string;
  colunas: ColunaRelatorio[];
  linhas: LinhaRelatorio[];
  // Linha de fechamento (mesmas chaves das colunas); ausente quando não faz sentido somar.
  totais?: LinhaRelatorio;
};

export type FormatoExportacao = "xlsx" | "pdf" | "csv";

export type ArquivoExportado = { base64: string; nome: string; mime: string };

export const MIME: Record<FormatoExportacao, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  csv: "text/csv;charset=utf-8",
};

// Nome de arquivo seguro a partir do título do relatório: "Fluxo de caixa" -> "fluxo-de-caixa".
export function nomeArquivo(titulo: string, formato: FormatoExportacao, hojeIso: string): string {
  const base = titulo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "relatorio"}-${hojeIso}.${formato}`;
}
