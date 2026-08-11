import { describe, it, expect } from "vitest";
import { parsearNfseXml } from "@/lib/nfse/danfse-parse";
import { gerarDanfsePdf } from "@/lib/nfse/danfse-gerar";

const XML = `<?xml version="1.0" encoding="utf-8"?><NFSe versao="1.01" xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS31702062253627128000146000000000050226080519065368"><xLocPrestacao>Uberlândia</xLocPrestacao><nNFSe>502</nNFSe><xTribNac>Datilografia e congêneres.</xTribNac><ambGer>1</ambGer><nDFSe>12966801</nDFSe><emit><CNPJ>53627128000146</CNPJ><xNome>ELEVARE ADVISORY LTDA</xNome><enderNac><xLgr>RUA BELKINA</xLgr><nro>130</nro><xBairro>JARDIM COLINA</xBairro><cMun>Uberlândia</cMun><UF>MG</UF><CEP>38411342</CEP></enderNac></emit><valores><vLiq>100.00</vLiq></valores><DPS versao="1.00"><infDPS Id="DPS3170"><dhEmi>2026-08-07T18:44:15-03:00</dhEmi><dCompet>2026-07-01</dCompet><toma><CNPJ>14649763000172</CNPJ><xNome>AREIA TERRA SANTA COMERCIO LTDA</xNome><end><endNac><cMun>Uberaba</cMun><CEP>38550970</CEP></endNac><xLgr>RODOVIA BR 352</xLgr><nro>S/N</nro><xBairro>ZONA RURAL</xBairro></end><email>areia@example.com</email></toma><serv><cServ><cTribNac>170201</cTribNac><xDescServ>Honorarios</xDescServ></cServ></serv><valores><vServPrest><vServ>100.00</vServ></vServPrest><trib><totTrib><pTotTribSN>6.00</pTotTribSN></totTrib></trib></valores></infDPS></DPS></infNFSe></NFSe>`;

describe("gerarDanfsePdf", () => {
  it("gera um PDF válido a partir do XML", async () => {
    const pdf = await gerarDanfsePdf(parsearNfseXml(XML));
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  });
});
