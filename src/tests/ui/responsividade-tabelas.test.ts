import { describe, it, expect } from "vitest";
import { arquivosTsx, lerSemComentarios } from "./_fonte";

// Uma <table> sem rolagem horizontal estoura a tela no celular. Esta varredura corrige o
// passado E impede o futuro: tabela nova sem wrapper falha aqui, não em produção.
describe("toda tabela rola na horizontal", () => {
  it("nenhum arquivo tem <table> sem wrapper de rolagem", () => {
    const semRolagem = arquivosTsx()
      .filter((f) => {
        const src = lerSemComentarios(f);
        if (!src.includes("<table")) return false;
        // TabelaCartao traz overflow-x-auto dentro de si (tarefa posterior deste plano).
        return !/overflow-x-auto|overflow-auto|TabelaCartao/.test(src);
      })
      .map((f) => f.replace("src/", ""));
    expect(semRolagem, `tabelas sem rolagem horizontal:\n  ${semRolagem.join("\n  ")}`).toEqual([]);
  });
});
