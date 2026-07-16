"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { converterPdfHtml } from "@/lib/contrato/gerar";
import { paraCsv } from "@/lib/exportar/csv";
import { paraHtml } from "@/lib/exportar/html";
import { paraXlsx } from "@/lib/exportar/xlsx";
import {
  MIME,
  nomeArquivo,
  type ArquivoExportado,
  type FormatoExportacao,
  type RelatorioExportavel,
} from "@/lib/exportar/tipos";
import { PAPEIS_EQUIPE, type PapelEquipe } from "@/lib/tipos";

const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

// A tela monta o RelatorioExportavel — ela tem os dados e já aplicou o gate de
// papel do relatório. Aqui o gate é só "é da equipe e está ativo": esta action
// não busca nada, apenas serializa o que a tela já podia ver.
export async function exportar(
  rel: RelatorioExportavel,
  formato: FormatoExportacao,
): Promise<ArquivoExportado | { erro: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !PAPEIS_EQUIPE.includes(perfil.papel as PapelEquipe)) {
    return { erro: "Sem permissão para exportar." };
  }

  const data = hoje();

  if (formato === "xlsx") {
    const buf = await paraXlsx(rel);
    return {
      base64: buf.toString("base64"),
      nome: nomeArquivo(rel.titulo, "xlsx", data),
      mime: MIME.xlsx,
    };
  }

  if (formato === "csv") {
    const buf = Buffer.from(paraCsv(rel), "utf8");
    return {
      base64: buf.toString("base64"),
      nome: nomeArquivo(rel.titulo, "csv", data),
      mime: MIME.csv,
    };
  }

  const html = paraHtml(rel);
  const pdf = await converterPdfHtml(html);
  if (pdf) {
    return {
      base64: pdf.toString("base64"),
      nome: nomeArquivo(rel.titulo, "pdf", data),
      mime: MIME.pdf,
    };
  }
  // Degradação graciosa: sem GOTENBERG_URL, entrega o HTML — ainda é o relatório.
  return {
    base64: Buffer.from(html, "utf8").toString("base64"),
    nome: nomeArquivo(rel.titulo, "pdf", data).replace(/\.pdf$/, ".html"),
    mime: "text/html",
  };
}
