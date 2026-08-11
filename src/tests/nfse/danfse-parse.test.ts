import { describe, it, expect } from "vitest";
import { parsearNfseXml } from "@/lib/nfse/danfse-parse";

const XML = `<?xml version="1.0" encoding="utf-8"?><NFSe versao="1.01" xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS31702062253627128000146000000000050226080519065368"><xLocEmi>Uberlândia</xLocEmi><xLocPrestacao>Uberlândia</xLocPrestacao><xLocIncid>Uberlândia</xLocIncid><nNFSe>502</nNFSe><xTribNac>Datilografia, digitação e congêneres.</xTribNac><ambGer>1</ambGer><cStat>100</cStat><dhProc>2026-08-07T18:46:15-03:00</dhProc><nDFSe>12966801</nDFSe><emit><CNPJ>53627128000146</CNPJ><xNome>ELEVARE ADVISORY LTDA</xNome><enderNac><xLgr>RUA BELKINA</xLgr><nro>130</nro><xBairro>JARDIM COLINA</xBairro><cMun>3170206</cMun><UF>MG</UF><CEP>38411342</CEP></enderNac></emit><valores><vLiq>100.00</vLiq></valores><DPS versao="1.00"><infDPS Id="DPS3170..."><tpAmb>1</tpAmb><dhEmi>2026-08-07T18:44:15-03:00</dhEmi><serie>00001</serie><nDPS>1251</nDPS><dCompet>2026-07-01</dCompet><prest><CNPJ>53627128000146</CNPJ><regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN></regTrib></prest><toma><CNPJ>14649763000172</CNPJ><xNome>AREIA TERRA SANTA COMERCIO DE AGREGADOS LTDA</xNome><end><endNac><cMun>3119302</cMun><CEP>38550970</CEP></endNac><xLgr>RODOVIA BR 352</xLgr><nro>S/N</nro><xBairro>ZONA RURAL</xBairro></end><email>areia@example.com</email></toma><serv><cServ><cTribNac>170201</cTribNac><xDescServ>Honorarios</xDescServ></cServ></serv><valores><vServPrest><vServ>100.00</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib><pTotTribSN>6.00</pTotTribSN></totTrib></trib></valores></infDPS></DPS></infNFSe></NFSe>`;

describe("parsearNfseXml", () => {
  const d = parsearNfseXml(XML);

  it("número, chave, nDFSe e DPS", () => {
    expect(d.numero).toBe("502");
    expect(d.chave).toHaveLength(50);
    expect(d.dfe).toBe("12966801");
    expect(d.numeroDps).toBe("1251");
    expect(d.serieDps).toBe("00001");
  });
  it("prestador com regime do Simples", () => {
    expect(d.prestador.nome).toBe("ELEVARE ADVISORY LTDA");
    expect(d.prestador.documento).toBe("53627128000146");
    expect(d.prestador.optanteSN).toContain("Optante");
    expect(d.prestador.regimeApuracaoSN).toContain("Simples Nacional");
  });
  it("tomador", () => {
    expect(d.tomador.nome).toBe("AREIA TERRA SANTA COMERCIO DE AGREGADOS LTDA");
    expect(d.tomador.documento).toBe("14649763000172");
    expect(d.tomador.email).toBe("areia@example.com");
  });
  it("serviço (código nacional formatado) e ISSQN", () => {
    expect(d.servico.descricao).toBe("Honorarios");
    expect(d.servico.codigoNac).toBe("17.02.01");
    expect(d.issqn.tributacao).toBe("Operação Tributável");
    expect(d.issqn.retencao).toBe("Não Retido");
  });
  it("valores, competência e ambiente", () => {
    expect(d.valores.servico).toBe(100);
    expect(d.valores.liquido).toBe(100);
    expect(d.valores.aliqAproxTrib).toBe(6);
    expect(d.competencia).toBe("2026-07-01");
    expect(d.producao).toBe(true);
  });
});
