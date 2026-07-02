import { create } from "xmlbuilder2";
import type { DadosDps } from "./tipos";

function valor2(n: number): string {
  return n.toFixed(2);
}

// Monta a DPS (Declaração de Prestação de Serviço) no layout nacional. Cobre os
// grupos obrigatórios do MVP (prestador PJ, tomador, um serviço, valores). O
// conjunto exato de campos é validado contra o XSD/produção restrita (T11);
// ajustes de layout ficam concentrados aqui.
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

  const doc = create({ version: "1.0", encoding: "UTF-8" })
    .ele("DPS", { xmlns: "http://www.sped.fazenda.gov.br/nfse" })
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
    .txt(d.serie)
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
    .up()
    // Prestador (emitente)
    .ele("prest")
    .ele("CNPJ")
    .txt(d.config.cnpj)
    .up()
    .ele("IM")
    .txt(d.config.inscricaoMunicipal)
    .up()
    .ele("xNome")
    .txt(d.config.razaoSocial)
    .up()
    .ele("regTrib")
    .ele("opSimpNac")
    .txt(d.config.simplesNacional ? "1" : "2")
    .up()
    .up()
    .up()
    // Tomador (cliente)
    .ele("toma")
    .ele(d.tomador.documento.length > 11 ? "CNPJ" : "CPF")
    .txt(d.tomador.documento)
    .up()
    .ele("xNome")
    .txt(d.tomador.razaoSocial)
    .up()
    .up()
    // Serviço
    .ele("serv")
    .ele("locPrest")
    .ele("cLocPrestacao")
    .txt(d.config.codigoMunicipio)
    .up()
    .up()
    .ele("cServ")
    .ele("cTribNac")
    .txt(d.config.itemLc116.replace(".", ""))
    .up()
    .ele("cTribMun")
    .txt(d.config.codigoTributacaoMunicipal)
    .up()
    .up()
    .up()
    // Valores
    .ele("valores")
    .ele("vServPrest")
    .ele("vServ")
    .txt(valor2(d.valor))
    .up()
    .up()
    .ele("trib")
    .ele("tribMun")
    .ele("tribISSQN")
    .txt("1")
    .up()
    .ele("pAliq")
    .txt(valor2(d.config.aliquotaIss))
    .up()
    .up()
    .up()
    .up()
    .up() // infDPS
    .up(); // DPS

  return { xml: doc.end({ prettyPrint: false }), idDps };
}
