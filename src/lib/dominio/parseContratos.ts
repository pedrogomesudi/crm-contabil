import type { FolhaXls } from "./biff";
import type { ContratoDominio } from "./tipos";
import { serialParaISO, comoNumero } from "./tipos";

const txt = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};
const data = (v: unknown): string | null => (typeof v === "number" ? serialParaISO(v) : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

export function parseContratos(folha: FolhaXls): ContratoDominio[] {
  const out: ContratoDominio[] = [];
  for (const linha of folha.celulas) {
    const cod = comoNumero(linha[0]);
    if (cod === null) continue;
    out.push({
      codigoCliente: cod,
      clienteNome: txt(linha[1]) ?? "",
      tipoContrato: txt(linha[7]) ?? "",
      emissao: data(linha[9]),
      inicioContrato: data(linha[11]),
      inicioFaturamento: data(linha[12]),
      diaVencimento: linha[14] != null ? String(linha[14]).trim() : null,
      encerradoEm: data(linha[20]),
      valorOriginal: num(linha[21]),
      valorAtual: num(linha[22]),
    });
  }
  return out;
}
