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
    codigoServicoNacional: "170201",
    descricaoServico: "Honorarios",
    aliquotaIss: 2,
    pctTribSN: 6,
    simplesNacional: true,
    ambiente: "homologacao",
  },
  tomador: {
    documento: "98765432000188",
    razaoSocial: "CLIENTE LTDA",
    endereco: { cep: "38400-000", logradouro: "RUA X", numero: "10", bairro: "CENTRO" },
  },
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

  it("reflete o Simples Nacional (opSimpNac=3, sem pAliq, com pTotTribSN)", () => {
    const { xml } = montarDps(dados);
    expect(xml).toContain("<opSimpNac>3</opSimpNac>");
    expect(xml).toContain("<cTribNac>170201</cTribNac>");
    expect(xml).toContain("<pTotTribSN>6.00</pTotTribSN>");
    expect(xml).not.toContain("<pAliq>");
  });

  it("usa pAliq quando não é Simples", () => {
    const { xml } = montarDps({ ...dados, config: { ...dados.config, simplesNacional: false } });
    expect(xml).toContain("<opSimpNac>1</opSimpNac>");
    expect(xml).toContain("<pAliq>2.00</pAliq>");
    expect(xml).not.toContain("<pTotTribSN>");
  });

  it("formata dhEmi com offset -03:00 e sem milissegundos", () => {
    const { xml } = montarDps(dados);
    expect(xml).toMatch(/<dhEmi>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00<\/dhEmi>/);
    expect(xml).not.toContain(".000");
  });

  it("inclui o endereço do tomador (end) com CEP só dígitos", () => {
    const { xml } = montarDps(dados);
    expect(xml).toContain("<end>");
    expect(xml).toContain("<CEP>38400000</CEP>");
    expect(xml).toContain("<xLgr>RUA X</xLgr>");
  });

  it("usa tpAmb=1 em produção", () => {
    const { xml } = montarDps({ ...dados, config: { ...dados.config, ambiente: "producao" } });
    expect(xml).toContain("<tpAmb>1</tpAmb>");
  });
});
