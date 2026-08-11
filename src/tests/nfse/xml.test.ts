import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import { descomprimirXmlNfse } from "@/lib/nfse/xml";

describe("descomprimirXmlNfse", () => {
  it("descomprime gzip+base64 (formato de armazenamento) de volta ao XML", () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><NFSe><valor>747.39</valor></NFSe>';
    const armazenado = gzipSync(Buffer.from(xml, "utf8")).toString("base64");
    expect(descomprimirXmlNfse(armazenado)).toBe(xml);
  });

  it("conteúdo não-gzip (legado gravado cru) é devolvido como veio", () => {
    const xml = '<?xml version="1.0"?><NFSe/>';
    expect(descomprimirXmlNfse(xml)).toBe(xml);
  });

  it("o formato armazenado começa com o cabeçalho gzip em base64 (H4sI)", () => {
    const armazenado = gzipSync(Buffer.from("<x/>", "utf8")).toString("base64");
    expect(armazenado.startsWith("H4sI")).toBe(true);
    expect(descomprimirXmlNfse(armazenado)).toBe("<x/>");
  });
});
