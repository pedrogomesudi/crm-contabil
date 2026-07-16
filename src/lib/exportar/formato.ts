import { formatarData, formatarMoeda } from "@/lib/format";
import type { FormatoCelula } from "@/lib/exportar/tipos";

export const VAZIO = "—";

// Texto de uma célula para CSV/PDF. O XLSX não passa por aqui: lá o valor vai
// nativo (número/data) com numFmt, senão o Excel não soma nem ordena.
export function formatarCelula(valor: unknown, formato: FormatoCelula): string {
  if (valor === null || valor === undefined || valor === "") return VAZIO;

  switch (formato) {
    case "moeda":
      return typeof valor === "number" ? formatarMoeda(valor) : String(valor);
    case "data":
      return formatarData(String(valor));
    case "percent":
      return typeof valor === "number" ? `${valor.toLocaleString("pt-BR")}%` : String(valor);
    case "numero":
      return typeof valor === "number" ? valor.toLocaleString("pt-BR") : String(valor);
    default:
      return String(valor);
  }
}
