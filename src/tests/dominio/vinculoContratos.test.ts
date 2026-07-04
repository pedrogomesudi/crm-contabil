import { describe, it, expect } from "vitest";
import { normalizarRazao, vincularContratosPorNome } from "@/lib/dominio/vinculoContratos";
import type { ContratoDominio } from "@/lib/dominio/tipos";

function contrato(clienteNome: string, valorAtual = 100): ContratoDominio {
  return {
    codigoCliente: 0,
    clienteNome,
    tipoContrato: "HONORARIOS CONTABEIS",
    emissao: null,
    inicioContrato: null,
    inicioFaturamento: null,
    diaVencimento: null,
    encerradoEm: null,
    valorOriginal: valorAtual,
    valorAtual,
  };
}

describe("normalizarRazao", () => {
  it("remove acentos, sufixos societários, números/CNPJ embutido e pontuação", () => {
    expect(normalizarRazao("AGROALVES REPRESENTAÇÕES LTDA")).toBe("AGROALVES REPRESENTACOES");
    expect(normalizarRazao("50.565.165 RENATO DELA TORRE E SILVA")).toBe("RENATO DELA TORRE E SILVA");
    expect(normalizarRazao("Fusion Consultoria ME")).toBe("FUSION CONSULTORIA");
  });
});

describe("vincularContratosPorNome", () => {
  const empresas = [
    { cpfCnpj: "11111111111111", razaoSocial: "AGROALVES REPRESENTACOES LTDA" },
    { cpfCnpj: "22222222222222", razaoSocial: "Fusion Consultoria ME" },
  ];

  it("vincula por nome normalizado e agrupa por CNPJ", () => {
    const { porCnpj, naoCasados, ambiguos } = vincularContratosPorNome(
      [contrato("AGROALVES REPRESENTAÇÕES LTDA", 250), contrato("FUSION CONSULTORIA", 300)],
      empresas,
    );
    expect(porCnpj.get("11111111111111")?.[0]?.valorAtual).toBe(250);
    expect(porCnpj.get("22222222222222")?.[0]?.valorAtual).toBe(300);
    expect(naoCasados).toEqual([]);
    expect(ambiguos).toEqual([]);
  });

  it("lista os contratos que não casam com nenhuma empresa", () => {
    const { porCnpj, naoCasados } = vincularContratosPorNome([contrato("EMPRESA INEXISTENTE LTDA")], empresas);
    expect(porCnpj.size).toBe(0);
    expect(naoCasados).toEqual(["EMPRESA INEXISTENTE LTDA"]);
  });

  it("não vincula nomes ambíguos (mesma razão normalizada, CNPJs diferentes)", () => {
    const comHomonimo = [
      { cpfCnpj: "33333333333333", razaoSocial: "SILVA CONSULTORIA LTDA" },
      { cpfCnpj: "44444444444444", razaoSocial: "Silva Consultoria ME" },
    ];
    const { porCnpj, ambiguos } = vincularContratosPorNome([contrato("SILVA CONSULTORIA")], comHomonimo);
    expect(porCnpj.size).toBe(0);
    expect(ambiguos).toEqual(["SILVA CONSULTORIA"]);
  });

  it("agrupa múltiplos contratos do mesmo cliente sob o mesmo CNPJ", () => {
    const { porCnpj } = vincularContratosPorNome(
      [contrato("AGROALVES REPRESENTACOES LTDA", 100), contrato("AGROALVES REPRESENTACOES LTDA", 50)],
      empresas,
    );
    expect(porCnpj.get("11111111111111")).toHaveLength(2);
  });
});
