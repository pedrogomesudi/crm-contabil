import { XMLParser } from "fast-xml-parser";

// Extrai do XML autorizado da NFS-e nacional (padrão SEFIN Nacional) os campos necessários
// para desenhar o DANFSe conforme o layout oficial. Puro: recebe o XML já descomprimido.

export type EnderecoDanfse = {
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string; // nome (resolvido) ou código quando não resolvido
  codigoIbge: string; // cMun do XML
  uf: string;
  cep: string;
};

export type PessoaDanfse = { nome: string; documento: string; endereco: EnderecoDanfse; email: string };

export type DadosDanfse = {
  numero: string; // nNFSe
  chave: string; // 50 dígitos (Id do infNFSe sem "NFS")
  dfe: string; // nDFSe
  competencia: string; // dCompet
  dataEmissaoNfse: string; // dhProc
  dataEmissaoDps: string; // infDPS/dhEmi
  serieDps: string;
  numeroDps: string;
  producao: boolean;
  ambGer: string; // ambiente gerador (código)
  tpAmb: string; // tipo de ambiente (código)
  ufEmitente: string;
  localEmissao: string; // xLocEmi
  localPrestacao: string; // xLocPrestacao
  municipioIncidencia: string; // xLocIncid
  prestador: PessoaDanfse & { optanteSN: string; regimeApuracaoSN: string; telefone: string };
  tomador: PessoaDanfse;
  servico: { codigoNac: string; codigoMun: string; descricao: string; descricaoNacional: string };
  issqn: { tributacao: string; retencao: string; regimeEspecial: string };
  valores: { servico: number; liquido: number; aliqAproxTrib: number | null };
};

const s = (v: unknown): string => (v == null ? "" : String(v));
const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const doc = (o: Record<string, unknown> | undefined): string => s(o?.CNPJ ?? o?.CPF ?? o?.NIF ?? "");

// Código de tributação nacional 170201 -> 17.02.01
const fmtCodNac = (c: string) => {
  const x = c.replace(/\D/g, "");
  return x.length === 6 ? `${x.slice(0, 2)}.${x.slice(2, 4)}.${x.slice(4, 6)}` : c;
};

const OPT_SN: Record<string, string> = {
  "1": "Não optante",
  "2": "Optante - Microempreendedor Individual (MEI)",
  "3": "Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)",
};
const REG_AP_SN: Record<string, string> = {
  "1": "Regime de apuração dos tributos federais e municipal pelo Simples Nacional",
  "2": "Regime de apuração dos tributos federais e municipal pelo Simples Nacional, exceto o ISSQN",
  "3": "Tributação normal (fora do Simples Nacional)",
};
const TRIB_ISSQN: Record<string, string> = {
  "1": "Operação Tributável",
  "2": "Imunidade",
  "3": "Exportação de Serviço",
  "4": "Não Incidência",
};
const RET_ISSQN: Record<string, string> = {
  "1": "Não Retido",
  "2": "Retido pelo Tomador",
  "3": "Retido pelo Intermediário",
};

function endereco(raw: Record<string, unknown> | undefined, nac: Record<string, unknown> | undefined): EnderecoDanfse {
  const cMun = s(nac?.cMun ?? raw?.cMun);
  return {
    logradouro: s(raw?.xLgr),
    numero: s(raw?.nro),
    bairro: s(raw?.xBairro),
    municipio: cMun,
    codigoIbge: cMun,
    uf: s(nac?.UF ?? raw?.UF),
    cep: s(nac?.CEP ?? raw?.CEP),
  };
}

export function parsearNfseXml(xml: string): DadosDanfse {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false });
  const raiz = parser.parse(xml) as Record<string, unknown>;
  const nfse = (raiz.NFSe ?? {}) as Record<string, unknown>;
  const inf = (nfse.infNFSe ?? {}) as Record<string, unknown>;
  const emit = (inf.emit ?? {}) as Record<string, unknown>;
  const emitEnd = (emit.enderNac ?? {}) as Record<string, unknown>;
  const dps = (inf.DPS ?? {}) as Record<string, unknown>;
  const infDps = (dps.infDPS ?? {}) as Record<string, unknown>;
  const prest = (infDps.prest ?? {}) as Record<string, unknown>;
  const regTrib = (prest.regTrib ?? {}) as Record<string, unknown>;
  const toma = (infDps.toma ?? {}) as Record<string, unknown>;
  const tomaEnd = (toma.end ?? {}) as Record<string, unknown>;
  const tomaEndNac = (tomaEnd.endNac ?? {}) as Record<string, unknown>;
  const serv = (infDps.serv ?? {}) as Record<string, unknown>;
  const cServ = (serv.cServ ?? {}) as Record<string, unknown>;
  const valoresInf = (inf.valores ?? {}) as Record<string, unknown>;
  const valoresDps = (infDps.valores ?? {}) as Record<string, unknown>;
  const vServPrest = (valoresDps.vServPrest ?? {}) as Record<string, unknown>;
  const trib = (valoresDps.trib ?? {}) as Record<string, unknown>;
  const tribMun = (trib.tribMun ?? {}) as Record<string, unknown>;
  const totTrib = (trib.totTrib ?? {}) as Record<string, unknown>;

  const chave = s(inf["@_Id"]).replace(/^NFS/, "");
  const pTot = totTrib.pTotTribSN != null ? n(totTrib.pTotTribSN) : null;

  return {
    numero: s(inf.nNFSe),
    chave,
    dfe: s(inf.nDFSe),
    competencia: s(infDps.dCompet),
    dataEmissaoNfse: s(inf.dhProc),
    dataEmissaoDps: s(infDps.dhEmi),
    serieDps: s(infDps.serie),
    numeroDps: s(infDps.nDPS),
    // Produção/homologação = tipo de ambiente (tpAmb): 1=produção, 2=homologação. O ambGer
    // é o ambiente gerador (quem emitiu), NÃO o indicador de produção — só marca homologação
    // quando tpAmb é explicitamente 2.
    producao: s(infDps.tpAmb) !== "2",
    ambGer: s(inf.ambGer),
    tpAmb: s(infDps.tpAmb),
    ufEmitente: s(emitEnd.UF),
    localEmissao: s(inf.xLocEmi),
    localPrestacao: s(inf.xLocPrestacao),
    municipioIncidencia: s(inf.xLocIncid ?? inf.xLocPrestacao),
    prestador: {
      nome: s(emit.xNome),
      documento: s(emit.CNPJ ?? emit.CPF),
      // O nome do município vem de xLocEmi (o endereço só traz o código IBGE).
      endereco: { ...endereco(emitEnd, emitEnd), municipio: s(inf.xLocEmi) || s(emitEnd.cMun) },
      email: "",
      telefone: "",
      optanteSN: OPT_SN[s(regTrib.opSimpNac)] ?? "-",
      regimeApuracaoSN: REG_AP_SN[s(regTrib.regApTribSN)] ?? "-",
    },
    tomador: {
      nome: s(toma.xNome),
      documento: doc(toma),
      endereco: endereco(tomaEnd, tomaEndNac),
      email: s(toma.email),
    },
    servico: {
      codigoNac: fmtCodNac(s(cServ.cTribNac)),
      codigoMun: s(cServ.cTribMun),
      descricao: s(cServ.xDescServ),
      descricaoNacional: s(inf.xTribNac),
    },
    issqn: {
      tributacao: TRIB_ISSQN[s(tribMun.tribISSQN)] ?? "-",
      retencao: RET_ISSQN[s(tribMun.tpRetISSQN)] ?? "-",
      regimeEspecial: s(tribMun.tpRegEsp) === "" ? "Nenhum" : s(tribMun.tpRegEsp),
    },
    valores: {
      servico: n(vServPrest.vServ),
      liquido: n(valoresInf.vLiq ?? vServPrest.vServ),
      aliqAproxTrib: pTot,
    },
  };
}
