import { describe, it, expect } from "vitest";
import { mapearReceita, mapearReceitaWs } from "@/lib/receita/brasilapi";

describe("mapearReceita", () => {
  it("extrai razão social, situação e endereço completo", () => {
    const r = mapearReceita({
      razao_social: "DGX GESTAO E NEGOCIOS LTDA",
      descricao_situacao_cadastral: "ATIVA",
      logradouro: "BELKINA DE CARVALHO CUNHA",
      numero: "130",
      complemento: "",
      bairro: "MORADA DA COLINA",
      cep: "38411342",
      municipio: "UBERLANDIA",
      uf: "MG",
    });
    expect(r.razaoSocial).toBe("DGX GESTAO E NEGOCIOS LTDA");
    expect(r.situacao).toBe("ATIVA");
    expect(r.endereco).toEqual({
      logradouro: "BELKINA DE CARVALHO CUNHA",
      numero: "130",
      bairro: "MORADA DA COLINA",
      cidade: "UBERLANDIA",
      uf: "MG",
      cep: "38411342",
    });
  });

  it("omite campos de endereço vazios e inclui complemento quando houver", () => {
    const r = mapearReceita({
      razao_social: "X LTDA",
      logradouro: "RUA A",
      complemento: "SALA 2",
      municipio: "UBERLANDIA",
      uf: "MG",
      numero: "",
      bairro: "",
      cep: "",
    });
    expect(r.endereco).toEqual({ logradouro: "RUA A", complemento: "SALA 2", cidade: "UBERLANDIA", uf: "MG" });
  });

  it("razão social ausente vira null (não sobrescreve com vazio)", () => {
    const r = mapearReceita({ razao_social: "  " });
    expect(r.razaoSocial).toBeNull();
  });
});

describe("mapearReceitaWs (fonte alternativa)", () => {
  it("mapeia nome→razão e endereço; normaliza CEP para dígitos", () => {
    const r = mapearReceitaWs({
      nome: "JORDANA FERNANDES ACADEMY LTDA",
      situacao: "ATIVA",
      logradouro: "AV DOS VINHEDOS",
      numero: "21",
      complemento: "SALA 102",
      bairro: "KARAIBA",
      municipio: "UBERLANDIA",
      uf: "MG",
      cep: "38.411-217",
    });
    expect(r.razaoSocial).toBe("JORDANA FERNANDES ACADEMY LTDA");
    expect(r.situacao).toBe("ATIVA");
    expect(r.endereco).toEqual({
      logradouro: "AV DOS VINHEDOS",
      numero: "21",
      complemento: "SALA 102",
      bairro: "KARAIBA",
      cidade: "UBERLANDIA",
      uf: "MG",
      cep: "38411217",
    });
  });
});
