import { describe, it, expect } from "vitest";
import { montarTermoHtml, type DadosTermo } from "@/lib/legalizacao/termo";

const base: DadosTermo = {
  tipo: "transferencia_saida",
  cliente: "Padaria X",
  marca: { nome: "Contabilidade Y", cnpj: null, enderecoLinha: "" },
  itens: ["Livros contábeis"],
  data: "2026-07-19",
  responsavel: "Pedro",
};

describe("montarTermoHtml com arquivos", () => {
  it("com arquivos, renderiza a segunda seção", () => {
    const html = montarTermoHtml({ ...base, arquivos: ["guia-07-2026.pdf", "balancete.pdf"] });
    expect(html).toContain("Documentos incluídos no pacote");
    expect(html).toContain("guia-07-2026.pdf");
    expect(html).toContain("Livros contábeis");
  });
  it("sem arquivos, não renderiza a segunda seção (não-regressão)", () => {
    const html = montarTermoHtml(base);
    expect(html).not.toContain("Documentos incluídos no pacote");
  });
});
