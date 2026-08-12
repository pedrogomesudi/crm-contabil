import { describe, it, expect } from "vitest";
import { parsearNfseXml } from "@/lib/nfse/danfse-parse";
import { montarDanfseHtml } from "@/lib/nfse/danfse-html";

const XML = `<?xml version="1.0" encoding="utf-8"?><NFSe versao="1.01" xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS31702062253627128000146000000000050226080519065368"><xLocEmi>Uberlândia</xLocEmi><xLocPrestacao>Uberlândia</xLocPrestacao><xLocIncid>Uberlândia</xLocIncid><nNFSe>502</nNFSe><xTribNac>Datilografia e congêneres.</xTribNac><ambGer>1</ambGer><dhProc>2026-08-07T18:46:15-03:00</dhProc><nDFSe>12966801</nDFSe><emit><CNPJ>53627128000146</CNPJ><xNome>ELEVARE ADVISORY LTDA</xNome><enderNac><xLgr>RUA BELKINA</xLgr><nro>130</nro><xBairro>JARDIM COLINA</xBairro><cMun>3170206</cMun><UF>MG</UF><CEP>38411342</CEP></enderNac></emit><valores><vLiq>100.00</vLiq></valores><DPS versao="1.00"><infDPS Id="DPS3170"><tpAmb>1</tpAmb><dhEmi>2026-08-07T18:44:15-03:00</dhEmi><serie>00001</serie><nDPS>1251</nDPS><dCompet>2026-07-01</dCompet><prest><CNPJ>53627128000146</CNPJ><regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN></regTrib></prest><toma><CNPJ>14649763000172</CNPJ><xNome>AREIA TERRA SANTA COMERCIO LTDA</xNome><end><endNac><cMun>3119302</cMun><CEP>38550970</CEP></endNac><xLgr>RODOVIA BR 352</xLgr><nro>S/N</nro><xBairro>ZONA RURAL</xBairro></end><email>areia@example.com</email></toma><serv><cServ><cTribNac>170201</cTribNac><xDescServ>Honorarios</xDescServ></cServ></serv><valores><vServPrest><vServ>100.00</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib><pTotTribSN>6.00</pTotTribSN></totTrib></trib></valores></infDPS></DPS></infNFSe></NFSe>`;

describe("montarDanfseHtml", () => {
  const html = montarDanfseHtml(parsearNfseXml(XML), "");

  it("é um HTML com as seções oficiais v2.0", () => {
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("DANFSe v2.0");
    expect(html).toMatch(/Chave de Acesso da NFS-e/i);
    expect(html).toMatch(/Emitente da NFS-e/i);
    expect(html).toMatch(/Prestador \/ Fornecedor/i);
    expect(html).toMatch(/Tomador \/ Adquirente/i);
    expect(html).toMatch(/Serviço Prestado/i);
    expect(html).toMatch(/Tributação Municipal/i);
    expect(html).toMatch(/Tributação IBS\/CBS/i);
    expect(html).toMatch(/Valor Total da NFS-e/i);
  });
  it("inclui os dados da nota", () => {
    expect(html).toContain("ELEVARE ADVISORY LTDA");
    expect(html).toContain("AREIA TERRA SANTA COMERCIO LTDA");
    expect(html).toContain("53.627.128/0001-46");
    expect(html).toContain("R$ 100,00");
    expect(html).toContain("31702062253627128000146000000000050226080519065368");
  });
  it("escapa HTML de valores textuais", () => {
    const perigo = montarDanfseHtml(
      {
        ...parsearNfseXml(XML),
        servico: { codigoNac: "", codigoMun: "", descricao: "<script>x</script>", descricaoNacional: "" },
      },
      "",
    );
    expect(perigo).not.toContain("<script>x</script>");
    expect(perigo).toContain("&lt;script&gt;");
  });
});
