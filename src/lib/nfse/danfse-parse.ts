import { XMLParser } from "fast-xml-parser";

// Extrai do XML autorizado da NFS-e nacional (padrão SEFIN Nacional) os campos necessários
// para desenhar o DANFSe. Puro: recebe o XML já descomprimido e devolve os dados.

export type EnderecoDanfse = {
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
};

export type DadosDanfse = {
  numero: string; // nNFSe
  chave: string; // 50 dígitos (Id do infNFSe sem o prefixo "NFS")
  dfe: string; // nDFSe
  dataEmissao: string; // dhEmi (ISO)
  competencia: string; // dCompet (YYYY-MM-DD)
  producao: boolean; // ambiente de produção?
  localPrestacao: string;
  prestador: { nome: string; cnpj: string; endereco: EnderecoDanfse };
  tomador: { nome: string; documento: string; endereco: EnderecoDanfse; email: string };
  servico: { codigo: string; descricao: string; descricaoNacional: string };
  valores: { servico: number; liquido: number; aliqAproxTrib: number | null };
};

const s = (v: unknown): string => (v == null ? "" : String(v));
const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
// CNPJ/CPF pode vir sob a tag CNPJ ou CPF.
const doc = (o: Record<string, unknown> | undefined): string => s(o?.CNPJ ?? o?.CPF ?? o?.NIF ?? "");

function endereco(raw: Record<string, unknown> | undefined, nac: Record<string, unknown> | undefined): EnderecoDanfse {
  return {
    logradouro: s(raw?.xLgr),
    numero: s(raw?.nro),
    bairro: s(raw?.xBairro),
    municipio: s(nac?.cMun ?? raw?.cMun),
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
  const toma = (infDps.toma ?? {}) as Record<string, unknown>;
  const tomaEnd = (toma.end ?? {}) as Record<string, unknown>;
  const tomaEndNac = (tomaEnd.endNac ?? {}) as Record<string, unknown>;
  const serv = (infDps.serv ?? {}) as Record<string, unknown>;
  const cServ = (serv.cServ ?? {}) as Record<string, unknown>;
  const valoresInf = (inf.valores ?? {}) as Record<string, unknown>;
  const valoresDps = (infDps.valores ?? {}) as Record<string, unknown>;
  const vServPrest = (valoresDps.vServPrest ?? {}) as Record<string, unknown>;
  const trib = (valoresDps.trib ?? {}) as Record<string, unknown>;
  const totTrib = (trib.totTrib ?? {}) as Record<string, unknown>;

  const idRaw = s(inf["@_Id"]);
  const chave = idRaw.replace(/^NFS/, "");
  const pTot = totTrib.pTotTribSN != null ? n(totTrib.pTotTribSN) : null;

  return {
    numero: s(inf.nNFSe),
    chave,
    dfe: s(inf.nDFSe),
    dataEmissao: s(infDps.dhEmi ?? inf.dhProc),
    competencia: s(infDps.dCompet),
    producao: s(inf.ambGer ?? infDps.tpAmb) === "1",
    localPrestacao: s(inf.xLocPrestacao ?? inf.xLocEmi),
    prestador: {
      nome: s(emit.xNome),
      cnpj: s(emit.CNPJ),
      endereco: endereco(emitEnd, emitEnd),
    },
    tomador: {
      nome: s(toma.xNome),
      documento: doc(toma),
      endereco: endereco(tomaEnd, tomaEndNac),
      email: s(toma.email),
    },
    servico: {
      codigo: s(cServ.cTribNac),
      descricao: s(cServ.xDescServ),
      descricaoNacional: s(inf.xTribNac),
    },
    valores: {
      servico: n(vServPrest.vServ),
      liquido: n(valoresInf.vLiq ?? vServPrest.vServ),
      aliqAproxTrib: pTot,
    },
  };
}
