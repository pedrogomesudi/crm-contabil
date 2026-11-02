import { describe, it, expect } from "vitest";
import { abreviarRazoesSociais } from "@/lib/financeiro/grupo-cobranca";

describe("abreviarRazoesSociais", () => {
  it("fica só com o primeiro nome da razão social", () => {
    expect(abreviarRazoesSociais(["BRAVE AGRONEGOCIOS LTDA", "DOMOS AGRONEGOCIOS LTDA"])).toEqual(["BRAVE", "DOMOS"]);
  });

  it("estende só as empresas que colidem, até distinguir", () => {
    expect(
      abreviarRazoesSociais([
        "CONSTROI PARTICIPACOES LTDA",
        "CONSTROI INCORPORADORA E LOTEADORA LTDA",
        "ATOS GESTAO E PARTICIPACOES LTDA",
      ]),
    ).toEqual(["CONSTROI PARTICIPACOES", "CONSTROI INCORPORADORA", "ATOS"]);
  });

  it("colisão que só se resolve no terceiro nome", () => {
    expect(abreviarRazoesSociais(["UNA GESTAO LTDA", "UNA GESTAO PARTICIPACOES LTDA"])).toEqual([
      "UNA GESTAO LTDA",
      "UNA GESTAO PARTICIPACOES",
    ]);
  });

  it("razões idênticas não entram em laço infinito", () => {
    expect(abreviarRazoesSociais(["ACME LTDA", "ACME LTDA"])).toEqual(["ACME LTDA", "ACME LTDA"]);
  });

  it("normaliza espaço duplicado do cadastro", () => {
    expect(abreviarRazoesSociais(["LAGOA  EMPREENDIMENTOS LTDA"])).toEqual(["LAGOA"]);
  });

  it("não compara caixa alta com minúscula ao detectar colisão", () => {
    expect(abreviarRazoesSociais(["Alfa Comercio Ltda", "ALFA SERVICOS LTDA"])).toEqual([
      "Alfa Comercio",
      "ALFA SERVICOS",
    ]);
  });

  it("lista vazia devolve lista vazia", () => {
    expect(abreviarRazoesSociais([])).toEqual([]);
  });
});
