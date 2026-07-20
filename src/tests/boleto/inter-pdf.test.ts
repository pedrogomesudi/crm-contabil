import { describe, it, expect } from "vitest";
import { extrairPdfBase64Inter } from "@/lib/boleto/inter";

describe("extrairPdfBase64Inter", () => {
  it("retorna o base64 quando presente", () => {
    expect(extrairPdfBase64Inter({ pdf: "JVBERi0xLjQK" })).toBe("JVBERi0xLjQK");
  });
  it("retorna null quando ausente", () => {
    expect(extrairPdfBase64Inter({})).toBeNull();
  });
  it("retorna null quando vazio ou tipo errado", () => {
    expect(extrairPdfBase64Inter({ pdf: "" })).toBeNull();
    expect(extrairPdfBase64Inter({ pdf: 123 as unknown as string })).toBeNull();
  });
});
