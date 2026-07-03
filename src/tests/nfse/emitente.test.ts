import { describe, it, expect } from "vitest";
import { emitenteParaConfig } from "@/lib/nfse/emitente";

const emitente = {
  codigo_municipio: "3170206",
  codigo_servico_nacional: "170201",
  aliquota_iss: 2,
  pct_trib_sn: 6,
  simples_nacional: true,
  descricao_servico_padrao: "Consultoria",
  ambiente: "producao",
};
const cliente = {
  cpf_cnpj: "53.627.128/0001-46",
  inscricao_municipal: "66277400",
  razao_social: "ELEVARE ADVISORY LTDA",
  endereco: { uf: "MG", cidade: "Uberlandia" },
};

describe("emitenteParaConfig", () => {
  it("monta o ConfigFiscal com CNPJ só dígitos e campos do emitente", () => {
    const c = emitenteParaConfig(emitente, cliente, "Servico X");
    expect(c.cnpj).toBe("53627128000146");
    expect(c.codigoMunicipio).toBe("3170206");
    expect(c.codigoServicoNacional).toBe("170201");
    expect(c.descricaoServico).toBe("Servico X");
    expect(c.aliquotaIss).toBe(2);
    expect(c.pctTribSN).toBe(6);
    expect(c.simplesNacional).toBe(true);
    expect(c.ambiente).toBe("producao");
  });
  it("usa a descrição padrão do emitente quando a descrição da nota é vazia", () => {
    const c = emitenteParaConfig(emitente, cliente, "");
    expect(c.descricaoServico).toBe("Consultoria");
  });
  it("normaliza ambiente inválido para homologacao", () => {
    const c = emitenteParaConfig({ ...emitente, ambiente: "x" }, cliente, "s");
    expect(c.ambiente).toBe("homologacao");
  });
});
