import { describe, it, expect } from "vitest";
import { mapearReceita, mapearReceitaWs, mesclarDados, lerOptante } from "@/lib/receita/brasilapi";

describe("mapearReceita", () => {
  it("extrai razão social, situação e endereço completo", () => {
    const r = mapearReceita({
      razao_social: "DGX GESTAO E NEGOCIOS LTDA",
      nome_fantasia: "DGX",
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
    expect(r.nomeFantasia).toBe("DGX");
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
      fantasia: "JORDANA ACADEMY",
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
    expect(r.nomeFantasia).toBe("JORDANA ACADEMY");
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

describe("mesclarDados", () => {
  it("primário sem logradouro é completado pelo secundário", () => {
    const primario = {
      razaoSocial: "LEONEL BATISTA SOARES",
      nomeFantasia: null,
      situacao: "ATIVA",
      optanteSimples: null,
      endereco: { bairro: "MORUMBI", cep: "38407162", cidade: "UBERLANDIA", uf: "MG" },
    };
    const secundario = {
      razaoSocial: "LEONEL BATISTA SOARES",
      nomeFantasia: null,
      situacao: "ATIVA",
      optanteSimples: null,
      endereco: {
        logradouro: "RUA INGA",
        numero: "127",
        complemento: "SALA 1",
        bairro: "MORUMBI",
        cep: "38407162",
        cidade: "UBERLANDIA",
        uf: "MG",
      },
    };
    const r = mesclarDados(primario, secundario);
    expect(r.endereco.logradouro).toBe("RUA INGA");
    expect(r.endereco.numero).toBe("127");
    expect(r.endereco.complemento).toBe("SALA 1");
    expect(r.endereco.bairro).toBe("MORUMBI"); // mantido do primário
  });

  it("primário vence onde tem valor", () => {
    const r = mesclarDados(
      { razaoSocial: "A", nomeFantasia: null, situacao: null, optanteSimples: null, endereco: { logradouro: "RUA A" } },
      {
        razaoSocial: "B",
        nomeFantasia: "FANT",
        situacao: "ATIVA",
        optanteSimples: true,
        endereco: { logradouro: "RUA B", numero: "9" },
      },
    );
    expect(r.razaoSocial).toBe("A");
    expect(r.situacao).toBe("ATIVA"); // primário null → usa secundário
    expect(r.endereco.logradouro).toBe("RUA A"); // primário vence
    expect(r.endereco.numero).toBe("9"); // secundário completa
    expect(r.optanteSimples).toBe(true); // primário null → usa secundário
  });
});

describe("lerOptante", () => {
  it("optante do Simples → true", () => {
    expect(lerOptante({ opcao_pelo_simples: true, opcao_pelo_mei: false })).toBe(true);
  });
  it("optante do MEI (sem Simples) → true", () => {
    expect(lerOptante({ opcao_pelo_simples: false, opcao_pelo_mei: true })).toBe(true);
  });
  it("não optante → false", () => {
    expect(lerOptante({ opcao_pelo_simples: false, opcao_pelo_mei: false })).toBe(false);
  });
  it("ausência de ambos → null", () => {
    expect(lerOptante({})).toBeNull();
  });
});

describe("mapearReceita — optante", () => {
  it("mapeia opcao_pelo_simples para optanteSimples", () => {
    expect(mapearReceita({ razao_social: "X", opcao_pelo_simples: true }).optanteSimples).toBe(true);
  });
});
