import { describe, it, expect } from "vitest";
import { classificarTexto } from "@/lib/documentos/extrair-texto";

describe("classificarTexto", () => {
  it("texto normal vira status ok com espaços colapsados", () => {
    const r = classificarTexto("  Contrato   de\n\nprestação\t de serviços ");
    expect(r.status).toBe("ok");
    expect(r.texto).toBe("Contrato de prestação de serviços");
  });
  it("só espaços/quebras vira vazio (provável digitalização)", () => {
    expect(classificarTexto("   \n\t  ").status).toBe("vazio");
  });
  it("string vazia vira vazio", () => {
    const r = classificarTexto("");
    expect(r.status).toBe("vazio");
    expect(r.texto).toBe("");
  });
  it("preserva o conteúdo ao normalizar", () => {
    expect(classificarTexto("Nota Fiscal 123 — R$ 1.000,00").texto).toBe("Nota Fiscal 123 — R$ 1.000,00");
  });
});
