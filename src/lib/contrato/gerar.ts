import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

// Preenche o template .docx com o mapa tag→valor, preservando a formatação.
// Tags ausentes no mapa viram string vazia (nullGetter).
export function gerarDocx(template: Buffer, dados: Record<string, string>): Buffer {
  const zip = new PizZip(template);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });
  doc.render(dados);
  return doc.getZip().generate({ type: "nodebuffer" });
}

// Converte .docx -> PDF via Gotenberg (/forms/libreoffice/convert). Retorna null
// (degradação graciosa) se a URL não estiver configurada ou a conversão falhar.
export async function converterPdf(docx: Buffer): Promise<Buffer | null> {
  const base = process.env.GOTENBERG_URL;
  if (!base) return null;
  try {
    const form = new FormData();
    form.append("files", new Blob([new Uint8Array(docx)]), "contrato.docx");
    const resp = await fetch(`${base}/forms/libreoffice/convert`, { method: "POST", body: form });
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch {
    return null;
  }
}
