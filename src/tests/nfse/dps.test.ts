import { describe, it, expect } from "vitest";
import { montarDps } from "@/lib/nfse/dps";
import type { DadosDps } from "@/lib/nfse/tipos";

const dados: DadosDps = {
  config: {
    cnpj: "12345678000199",
    inscricaoMunicipal: "123456",
    razaoSocial: "ESCRITORIO LTDA",
    codigoMunicipio: "3170206",
    uf: "MG",
    itemLc116: "17.19",
    codigoTributacaoMunicipal: "1719",
    aliquotaIss: 2,
    naturezaOperacao: "1",
    simplesNacional: true,
    ambiente: "homologacao",
  },
  tomador: { documento: "98765432000188", razaoSocial: "CLIENTE LTDA", endereco: { cep: "38400000" } },
  valor: 500,
  competencia: "2026-07-01",
  serie: "1",
  numeroDps: "1",
};

describe("montarDps", () => {
  it("monta a DPS com infDPS[@Id], tpAmb de homologação, prestador, tomador e valor", () => {
    const { xml, idDps } = montarDps(dados);
    expect(idDps).toMatch(/^DPS/);
    expect(xml).toContain(`Id="${idDps}"`);
    expect(xml).toContain("<tpAmb>2</tpAmb>"); // homologação
    expect(xml).toContain("12345678000199"); // CNPJ prestador
    expect(xml).toContain("98765432000188"); // tomador
    expect(xml).toContain("<vServ>500.00</vServ>");
  });

  it("usa tpAmb=1 em produção", () => {
    const { xml } = montarDps({ ...dados, config: { ...dados.config, ambiente: "producao" } });
    expect(xml).toContain("<tpAmb>1</tpAmb>");
  });
});
