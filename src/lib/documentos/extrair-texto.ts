import { extractText, getDocumentProxy } from "unpdf";

export type ResultadoExtracao = { texto: string; status: "ok" | "vazio" };

// Normaliza espaços e decide o status a partir do texto bruto — puro/testável.
export function classificarTexto(bruto: string): ResultadoExtracao {
  const texto = bruto.replace(/\s+/g, " ").trim();
  return texto ? { texto, status: "ok" } : { texto: "", status: "vazio" };
}

// Extrai a camada de texto de um PDF digital. PDF escaneado devolve status 'vazio'.
// Erros do unpdf sobem para o chamador (que grava texto_status='erro').
export async function extrairTextoPdf(bytes: Uint8Array): Promise<ResultadoExtracao> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return classificarTexto(Array.isArray(text) ? text.join(" ") : text);
}
