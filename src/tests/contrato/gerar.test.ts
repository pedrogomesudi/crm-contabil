import { describe, it, expect, vi, afterEach } from "vitest";
import PizZip from "pizzip";
import { gerarDocx, converterPdf, converterPdfHtml } from "@/lib/contrato/gerar";

// Constrói um .docx mínimo válido com tags, em memória.
function miniDocx(corpo: string): Buffer {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t xml:space="preserve">${corpo}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return zip.generate({ type: "nodebuffer" });
}

function textoDe(docx: Buffer): string {
  const xml = new PizZip(docx).file("word/document.xml")!.asText();
  return xml.replace(/<[^>]+>/g, "");
}

describe("gerarDocx", () => {
  it("substitui as tags pelos valores", () => {
    const tpl = miniDocx("Cliente: {razao_social} - CNPJ {cnpj}");
    const out = gerarDocx(tpl, { razao_social: "ACME LTDA", cnpj: "11.222.333/0001-81" });
    expect(textoDe(out)).toBe("Cliente: ACME LTDA - CNPJ 11.222.333/0001-81");
  });
  it("tag sem valor no mapa vira vazio (nullGetter)", () => {
    const tpl = miniDocx("X{ausente}Y");
    expect(textoDe(gerarDocx(tpl, {}))).toBe("XY");
  });
  it("preenche tags no document.xml.rels (mailto: do e-mail linkado)", () => {
    const zip = new PizZip(miniDocx("{email}"));
    zip.file(
      "word/_rels/document.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId100" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="mailto:{email}" TargetMode="External"/></Relationships>`,
    );
    const out = gerarDocx(zip.generate({ type: "nodebuffer" }), { email: "a@ex.com" });
    const rels = new PizZip(out).file("word/_rels/document.xml.rels")!.asText();
    expect(rels).toContain("mailto:a@ex.com");
    expect(rels).not.toContain("{email}");
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("converterPdf", () => {
  it("retorna null quando GOTENBERG_URL não está definida", async () => {
    vi.stubEnv("GOTENBERG_URL", "");
    expect(await converterPdf(Buffer.from("x"))).toBeNull();
  });
  it("POSTa ao Gotenberg e retorna o PDF", async () => {
    vi.stubEnv("GOTENBERG_URL", "http://gotenberg:3000");
    const fakePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(fakePdf, { status: 200 })),
    );
    const out = await converterPdf(Buffer.from("docx"));
    expect(out).not.toBeNull();
    expect(out!.subarray(0, 4).toString()).toBe("%PDF");
  });
  it("retorna null se o Gotenberg falhar", async () => {
    vi.stubEnv("GOTENBERG_URL", "http://gotenberg:3000");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("erro", { status: 503 })),
    );
    expect(await converterPdf(Buffer.from("docx"))).toBeNull();
  });
});

describe("converterPdfHtml", () => {
  it("retorna null sem GOTENBERG_URL", async () => {
    vi.stubEnv("GOTENBERG_URL", "");
    expect(await converterPdfHtml("<p>oi</p>")).toBeNull();
  });
  it("POSTa o HTML ao Gotenberg e retorna o PDF", async () => {
    vi.stubEnv("GOTENBERG_URL", "http://gotenberg:3000");
    const fakePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(fakePdf, { status: 200 })),
    );
    const out = await converterPdfHtml("<p>oi</p>");
    expect(out).not.toBeNull();
    expect(out!.subarray(0, 4).toString()).toBe("%PDF");
  });
});
