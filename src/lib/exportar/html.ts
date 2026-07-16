import { formatarCelula } from "@/lib/exportar/formato";
import type { RelatorioExportavel } from "@/lib/exportar/tipos";

// Tudo que vem do banco é escapado: o HTML vai para o Gotenberg e não deve
// executar nem interpretar marcação vinda de dado do usuário.
const escapar = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const TD = "padding:4px 8px;border-bottom:1px solid #eee";
const ALINHA = (formato: string) => (formato === "texto" || formato === "data" ? "left" : "right");

export function paraHtml(rel: RelatorioExportavel): string {
  const cabecalho = rel.colunas
    .map(
      (c) =>
        `<th style="${TD};text-align:${ALINHA(c.formato)};color:#666">${escapar(c.rotulo)}</th>`,
    )
    .join("");

  const corpo =
    rel.linhas.length === 0
      ? `<tr><td colspan="${rel.colunas.length}" style="${TD};color:#888">Nenhum registro.</td></tr>`
      : rel.linhas
          .map(
            (l) =>
              "<tr>" +
              rel.colunas
                .map(
                  (c) =>
                    `<td style="${TD};text-align:${ALINHA(c.formato)}">${escapar(formatarCelula(l[c.chave], c.formato))}</td>`,
                )
                .join("") +
              "</tr>",
          )
          .join("");

  const rodape = rel.totais
    ? "<tfoot><tr>" +
      rel.colunas
        .map(
          (c) =>
            `<td style="${TD};text-align:${ALINHA(c.formato)};font-weight:bold;border-top:2px solid #333">` +
            `${escapar(formatarCelula(rel.totais![c.chave], c.formato))}</td>`,
        )
        .join("") +
      "</tr></tfoot>"
    : "";

  return (
    '<html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;color:#222">' +
    `<h1 style="font-size:18px;margin-bottom:2px">${escapar(rel.titulo)}</h1>` +
    (rel.subtitulo
      ? `<p style="font-size:12px;color:#666;margin-top:0">${escapar(rel.subtitulo)}</p>`
      : "") +
    '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
    `<thead><tr>${cabecalho}</tr></thead><tbody>${corpo}</tbody>${rodape}` +
    "</table></body></html>"
  );
}
