import { describe, it, expect } from "vitest";
import { ACERVO_PADRAO, montarTermoHtml } from "@/lib/legalizacao/termo";

const base = {
  cliente: "Padaria X Ltda",
  marca: { nome: "Contab Y", cnpj: "11.222.333/0001-81", enderecoLinha: "Uberlândia/MG" },
  itens: ["Livros contábeis", "Guias pagas"],
  data: "2026-07-12",
  responsavel: "Ana",
};

describe("ACERVO_PADRAO", () => {
  it("tem itens", () => {
    expect(ACERVO_PADRAO.length).toBeGreaterThan(3);
  });
});

describe("montarTermoHtml", () => {
  it("entrada = recebimento; contém cliente, marca e itens", () => {
    const h = montarTermoHtml({ ...base, tipo: "transferencia_entrada" });
    expect(h).toMatch(/Recebimento/i);
    expect(h).toContain("Padaria X Ltda");
    expect(h).toContain("Contab Y");
    expect(h).toContain("Livros contábeis");
  });
  it("saída = entrega", () => {
    expect(montarTermoHtml({ ...base, tipo: "transferencia_saida" })).toMatch(/Entrega/i);
  });
  it("escapa HTML dos itens", () => {
    const h = montarTermoHtml({ ...base, tipo: "transferencia_entrada", itens: ["<script>x</script> & cia"] });
    expect(h).not.toMatch(/<script>x/);
    expect(h).toContain("&amp; cia");
  });
});
