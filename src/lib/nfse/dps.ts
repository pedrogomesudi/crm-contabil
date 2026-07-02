import { create } from "xmlbuilder2";
import type { DadosDps } from "./tipos";

function valor2(n: number): string {
  return n.toFixed(2);
}

// dhEmi no formato exigido pelo schema nacional: offset -03:00 (Brasília, sem
// horário de verão) e sem milissegundos. Recua 2 min ("margem") para absorver
// desvio de relógio do servidor e evitar E0008 (dhEmi posterior ao processamento).
const MARGEM_DHEMI_MS = 120_000;
function dhEmiBrasilia(): string {
  const bras = new Date(Date.now() - 3 * 3600 * 1000 - MARGEM_DHEMI_MS);
  return bras.toISOString().replace(/\.\d{3}Z$/, "-03:00");
}

// Monta a DPS no layout nacional, espelhando uma NFS-e real autorizada
// (Uberlândia/MG, Simples Nacional).
export function montarDps(d: DadosDps): { xml: string; idDps: string } {
  const tpAmb = d.config.ambiente === "producao" ? "1" : "2";
  const idDps =
    "DPS" +
    d.config.codigoMunicipio.padStart(7, "0") +
    "2" +
    d.config.cnpj.padStart(14, "0") +
    d.serie.padStart(5, "0") +
    d.numeroDps.padStart(15, "0");

  const dps = create({ version: "1.0", encoding: "UTF-8" }).ele("DPS", {
    xmlns: "http://www.sped.fazenda.gov.br/nfse",
    versao: "1.00",
  });
  const inf = dps.ele("infDPS", { Id: idDps });
  inf.ele("tpAmb").txt(tpAmb);
  inf.ele("dhEmi").txt(dhEmiBrasilia());
  inf.ele("verAplic").txt("crm-contabil-1");
  inf.ele("serie").txt(d.serie.padStart(5, "0"));
  inf.ele("nDPS").txt(d.numeroDps);
  inf.ele("dCompet").txt(d.competencia);
  inf.ele("tpEmit").txt("1");
  inf.ele("cLocEmi").txt(d.config.codigoMunicipio);

  // Prestador (emitente): CNPJ + regime tributário.
  const prest = inf.ele("prest");
  prest.ele("CNPJ").txt(d.config.cnpj);
  const regTrib = prest.ele("regTrib");
  if (d.config.simplesNacional) {
    regTrib.ele("opSimpNac").txt("3");
    regTrib.ele("regApTribSN").txt("1");
    regTrib.ele("regEspTrib").txt("0");
  } else {
    regTrib.ele("opSimpNac").txt("1");
    regTrib.ele("regEspTrib").txt("0");
  }

  // Tomador (cliente): documento, nome, endereço (se houver) e e-mail.
  const toma = inf.ele("toma");
  toma.ele(d.tomador.documento.length > 11 ? "CNPJ" : "CPF").txt(d.tomador.documento);
  toma.ele("xNome").txt(d.tomador.razaoSocial);
  const e = d.tomador.endereco;
  if (e?.cep && e?.logradouro) {
    const end = toma.ele("end");
    const endNac = end.ele("endNac");
    endNac.ele("cMun").txt(d.config.codigoMunicipio); // IBGE do município do tomador
    endNac.ele("CEP").txt(String(e.cep).replace(/\D/g, ""));
    end.ele("xLgr").txt(e.logradouro);
    end.ele("nro").txt(e.numero || "S/N");
    end.ele("xBairro").txt(e.bairro || "Centro");
  }
  if (d.tomador.email) toma.ele("email").txt(d.tomador.email);

  // Serviço.
  const serv = inf.ele("serv");
  serv.ele("locPrest").ele("cLocPrestacao").txt(d.config.codigoMunicipio);
  const cServ = serv.ele("cServ");
  cServ.ele("cTribNac").txt(d.config.codigoServicoNacional);
  cServ.ele("xDescServ").txt(d.config.descricaoServico);

  // Valores.
  const valores = inf.ele("valores");
  valores.ele("vServPrest").ele("vServ").txt(valor2(d.valor));
  const trib = valores.ele("trib");
  const tribMun = trib.ele("tribMun");
  tribMun.ele("tribISSQN").txt("1");
  if (d.config.simplesNacional) {
    tribMun.ele("tpRetISSQN").txt("1");
    trib.ele("totTrib").ele("pTotTribSN").txt(valor2(d.config.pctTribSN));
  } else {
    tribMun.ele("pAliq").txt(valor2(d.config.aliquotaIss));
  }

  return { xml: dps.end({ prettyPrint: false }), idDps };
}
