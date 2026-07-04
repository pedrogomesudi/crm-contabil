import { describe, it, expect } from "vitest";
import { mapearReceita } from "@/lib/receita/brasilapi";

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
