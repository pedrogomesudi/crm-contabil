import { formatarCelula } from "@/lib/exportar/formato";
import type { RelatorioExportavel } from "@/lib/exportar/tipos";

// BOM UTF-8: sem ele o Excel em pt-BR abre o arquivo em latin-1 e quebra os acentos.
export const BOM = "﻿";
const SEP = ";"; // separador do Excel em pt-BR (a vírgula é decimal)

// Aspas duplas quando o campo tem o separador, aspas ou quebra de linha (RFC 4180).
function escapar(texto: string): string {
  return /[;"\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function paraCsv(rel: RelatorioExportavel): string {
  const linha = (valores: string[]) => valores.map(escapar).join(SEP);

  const partes = [
    linha(rel.colunas.map((c) => c.rotulo)),
    ...rel.linhas.map((l) => linha(rel.colunas.map((c) => formatarCelula(l[c.chave], c.formato)))),
  ];
  if (rel.totais) {
    const totais = rel.totais;
    partes.push(linha(rel.colunas.map((c) => formatarCelula(totais[c.chave], c.formato))));
  }
  return BOM + partes.join("\n");
}
