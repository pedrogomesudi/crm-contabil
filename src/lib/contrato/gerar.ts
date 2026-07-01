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
  const out = doc.getZip();
  // Preenche tags {..} também nas relações externas (docxtemplater só processa o
  // document.xml). É o que faz o mailto: do e-mail linkado apontar para o valor real.
  const relsPath = "word/_rels/document.xml.rels";
  const rels = out.file(relsPath);
  if (rels) {
    const txt = rels.asText().replace(/\{(\w+)\}/g, (_m, k: string) => dados[k] ?? "");
    out.file(relsPath, txt);
  }
  return out.generate({ type: "nodebuffer" });
}

// Converte .docx -> PDF via Gotenberg (/forms/libreoffice/convert). Retorna null
// (degradação graciosa) se a URL não estiver configurada ou a conversão falhar.
// Timeout evita que uma indisponibilidade do serviço trave a geração.
export async function converterPdf(docx: Buffer): Promise<Buffer | null> {
  const base = process.env.GOTENBERG_URL;
  if (!base) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const form = new FormData();
    form.append("files", new Blob([new Uint8Array(docx)]), "contrato.docx");
    const resp = await fetch(`${base}/forms/libreoffice/convert`, {
      method: "POST",
      body: form,
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      console.error("converterPdf: Gotenberg respondeu", resp.status);
      return null;
    }
    return Buffer.from(await resp.arrayBuffer());
  } catch (e) {
    console.error("converterPdf:", e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
