import { describe, it, expect } from "vitest";
import { nomeEntradaZip } from "@/lib/documentos/acervo";

describe("nomeEntradaZip", () => {
  it("saneia e prefixa por índice (único)", () => {
    expect(nomeEntradaZip("Relatório Anual.pdf", 0)).toBe("1-Relatorio_Anual.pdf");
    expect(nomeEntradaZip("Relatório Anual.pdf", 1)).toBe("2-Relatorio_Anual.pdf");
  });
  it("nome vazio vira 'arquivo'", () => {
    expect(nomeEntradaZip("///", 4)).toBe("5-arquivo");
  });
});
