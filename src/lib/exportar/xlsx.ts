import "server-only";
import ExcelJS from "exceljs";
import { formatarCelula } from "@/lib/exportar/formato";
import type { FormatoCelula, LinhaRelatorio, RelatorioExportavel } from "@/lib/exportar/tipos";

// Formatos numéricos do Excel por tipo de coluna. O valor vai NATIVO (número/data)
// e a máscara cuida da aparência — string formatada não soma nem ordena na planilha.
const NUM_FMT: Record<FormatoCelula, string | undefined> = {
  moeda: "R$ #,##0.00",
  numero: "#,##0.00",
  percent: '0.0"%"',
  data: "dd/mm/yyyy",
  texto: undefined,
};

// Data pura (YYYY-MM-DD) vira Date no fuso LOCAL: `new Date("2026-07-10")` seria
// UTC 00:00 e o Excel mostraria o dia anterior em America/Sao_Paulo.
function paraData(valor: unknown): Date | string {
  const texto = String(valor);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto.trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? texto : d;
}

function valorNativo(valor: unknown, formato: FormatoCelula): string | number | Date | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (formato === "data") return paraData(valor);
  if (formato === "texto") return String(valor);
  return typeof valor === "number" ? valor : String(valor);
}

export async function paraXlsx(rel: RelatorioExportavel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const ws = wb.addWorksheet(rel.titulo.slice(0, 31) || "Relatório"); // o Excel limita a aba a 31 chars

  ws.columns = rel.colunas.map((c) => ({
    header: c.rotulo,
    key: c.chave,
    style: NUM_FMT[c.formato] ? { numFmt: NUM_FMT[c.formato] } : {},
  }));

  const linhaNativa = (l: LinhaRelatorio) =>
    Object.fromEntries(rel.colunas.map((c) => [c.chave, valorNativo(l[c.chave], c.formato)]));

  ws.getRow(1).font = { bold: true };
  rel.linhas.forEach((l) => ws.addRow(linhaNativa(l)));

  if (rel.totais) {
    const totais = ws.addRow(linhaNativa(rel.totais));
    totais.font = { bold: true };
    totais.border = { top: { style: "thin" } };
  }

  // Largura pelo texto mais longo da coluna (o formatado, que é o que se vê).
  rel.colunas.forEach((c, i) => {
    const textos = [c.rotulo, ...rel.linhas.map((l) => formatarCelula(l[c.chave], c.formato))];
    const maior = Math.max(...textos.map((t) => t.length));
    ws.getColumn(i + 1).width = Math.min(Math.max(maior + 2, 10), 50);
  });

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
