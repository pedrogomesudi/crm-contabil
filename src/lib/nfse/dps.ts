import { create } from "xmlbuilder2";
import type { DadosDps } from "./tipos";

function valor2(n: number): string {
  return n.toFixed(2);
}

// Monta a DPS (Declaração de Prestação de Serviço) no layout nacional, espelhando
// a estrutura de uma NFS-e real autorizada (Uberlândia/MG, Simples Nacional).
export function montarDps(d: DadosDps): { xml: string; idDps: string } {
  const tpAmb = d.config.ambiente === "producao" ? "1" : "2";
  // Id da DPS: "DPS" + cod município(7) + tipoInsc(1: 2=CNPJ) + inscrição(14) + série(5) + nDPS(15).
  const idDps =
    "DPS" +
    d.config.codigoMunicipio.padStart(7, "0") +
    "2" +
    d.config.cnpj.padStart(14, "0") +
    d.serie.padStart(5, "0") +
    d.numeroDps.padStart(15, "0");

  const infDPS = create({ version: "1.0", encoding: "UTF-8" })
    .ele("DPS", { xmlns: "http://www.sped.fazenda.gov.br/nfse", versao: "1.00" })
    .ele("infDPS", { Id: idDps })
    .ele("tpAmb")
    .txt(tpAmb)
    .up()
    .ele("dhEmi")
    .txt(new Date().toISOString())
    .up()
    .ele("verAplic")
    .txt("crm-contabil-1")
    .up()
    .ele("serie")
    .txt(d.serie.padStart(5, "0"))
    .up()
    .ele("nDPS")
    .txt(d.numeroDps)
    .up()
    .ele("dCompet")
    .txt(d.competencia)
    .up()
    .ele("tpEmit")
    .txt("1")
    .up()
    .ele("cLocEmi")
    .txt(d.config.codigoMunicipio)
    .up();

  // Prestador (emitente): identificado pelo CNPJ + regime tributário.
  const prest = infDPS.ele("prest").ele("CNPJ").txt(d.config.cnpj).up().ele("regTrib");
  if (d.config.simplesNacional) {
    prest.ele("opSimpNac").txt("3").up().ele("regApTribSN").txt("1").up().ele("regEspTrib").txt("0").up();
  } else {
    prest.ele("opSimpNac").txt("1").up().ele("regEspTrib").txt("0").up();
  }
  prest.up().up();

  // Tomador (cliente).
  const toma = infDPS
    .ele("toma")
    .ele(d.tomador.documento.length > 11 ? "CNPJ" : "CPF")
    .txt(d.tomador.documento)
    .up()
    .ele("xNome")
    .txt(d.tomador.razaoSocial)
    .up();
  if (d.tomador.email) toma.ele("email").txt(d.tomador.email).up();
  toma.up();

  // Serviço.
  infDPS
    .ele("serv")
    .ele("locPrest")
    .ele("cLocPrestacao")
    .txt(d.config.codigoMunicipio)
    .up()
    .up()
    .ele("cServ")
    .ele("cTribNac")
    .txt(d.config.codigoServicoNacional)
    .up()
    .ele("xDescServ")
    .txt(d.config.descricaoServico)
    .up()
    .up()
    .up();

  // Valores.
  const valores = infDPS
    .ele("valores")
    .ele("vServPrest")
    .ele("vServ")
    .txt(valor2(d.valor))
    .up()
    .up()
    .ele("trib");
  const tribMun = valores.ele("tribMun").ele("tribISSQN").txt("1").up();
  if (d.config.simplesNacional) {
    tribMun.ele("tpRetISSQN").txt("1").up().up();
    valores.ele("totTrib").ele("pTotTribSN").txt(valor2(d.config.pctTribSN)).up().up();
  } else {
    tribMun.ele("pAliq").txt(valor2(d.config.aliquotaIss)).up().up();
  }
  valores.up();

  const doc = infDPS.up().up(); // infDPS -> DPS
  return { xml: doc.end({ prettyPrint: false }), idDps };
}
