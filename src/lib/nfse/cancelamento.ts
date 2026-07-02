import { create } from "xmlbuilder2";
import { assinarXmlDsig } from "./assinatura";
import { montarCorpoDps, postJsonMtls } from "./envio";
import type { DadosCancelamento, ResultadoEvento } from "./tipos";

function dhBrasilia(): string {
  const bras = new Date(Date.now() - 3 * 3600 * 1000 - 120_000);
  return bras.toISOString().replace(/\.\d{3}Z$/, "-03:00");
}

// Evento de cancelamento (código 101101), layout nacional de registro de evento.
// O conjunto exato de campos é validado na homologação (isolado aqui).
export function montarEventoCancelamento(d: DadosCancelamento): { xml: string; idEvento: string } {
  const tpAmb = d.ambiente === "producao" ? "1" : "2";
  // Id do pedido de registro de evento (TSIdPedRegEvt):
  // "PRE" + chNFSe(50) + tipoEvento(6) + nSeqEvento(3). Cancelamento = 101101.
  const idEvento = "PRE" + d.chave + "101101" + "001";
  const doc = create({ version: "1.0", encoding: "UTF-8" }).ele("pedRegEvento", {
    xmlns: "http://www.sped.fazenda.gov.br/nfse",
    versao: "1.00",
  });
  const inf = doc.ele("infPedReg", { Id: idEvento });
  inf.ele("tpAmb").txt(tpAmb);
  inf.ele("dhEvento").txt(dhBrasilia());
  inf.ele("CNPJAutor").txt(d.cnpj);
  inf.ele("chNFSe").txt(d.chave);
  inf.ele("nPedRegEvento").txt("1");
  const e = inf.ele("e101101");
  e.ele("descEvento").txt("Cancelamento de NFS-e");
  e.ele("cMotivo").txt(d.cMotivo);
  e.ele("xMotivo").txt(d.xMotivo);
  return { xml: doc.end({ prettyPrint: false }), idEvento };
}

export function assinarEvento(xml: string, idEvento: string, cert: { certPem: string; keyPem: string }): string {
  return assinarXmlDsig(xml, idEvento, "infPedReg", cert);
}

export function parseRespostaEvento(status: number, corpo: Record<string, unknown>): ResultadoEvento {
  const ret = (corpo.retEvento ?? {}) as { cStat?: string; xMotivo?: string; idEvento?: string };
  // cStat de sucesso de registro de evento (faixa 1xx). Confirmado na homologação.
  if (status >= 200 && status < 300 && ret.cStat && /^1\d\d$/.test(ret.cStat)) {
    return { aceito: true, idEvento: ret.idEvento, mensagens: ret.xMotivo ? [ret.xMotivo] : undefined };
  }
  // Erros em formatos conhecidos (a Sefin usa `erro` singular); por fim, o corpo cru.
  type Erro = { codigo?: string; Codigo?: string; descricao?: string; Descricao?: string; mensagem?: string; complemento?: string };
  const lista =
    (Array.isArray(corpo.erro) && (corpo.erro as Erro[])) ||
    (Array.isArray(corpo.erros) && (corpo.erros as Erro[])) ||
    (Array.isArray(corpo.mensagens) && (corpo.mensagens as Erro[])) ||
    (Array.isArray(corpo.Errors) && (corpo.Errors as Erro[])) ||
    [];
  const mensagens = lista
    .map((x) =>
      `${x.codigo ?? x.Codigo ?? ""} ${x.descricao ?? x.Descricao ?? x.mensagem ?? ""} ${x.complemento ?? ""}`.trim(),
    )
    .filter(Boolean);
  if (!mensagens.length) {
    if (ret.xMotivo) mensagens.push(`${ret.cStat ?? status} ${ret.xMotivo}`);
    else mensagens.push(`HTTP ${status}: ${JSON.stringify(corpo).slice(0, 600)}`);
  }
  return { aceito: false, mensagens };
}

export async function enviarCancelamento(
  xmlAssinado: string,
  chave: string,
  cert: { pfx: Buffer; senha: string },
  ambiente: "homologacao" | "producao",
): Promise<ResultadoEvento> {
  const { status, json } = await postJsonMtls(
    `/nfse/${chave}/eventos`,
    { pedidoRegistroEventoXmlGZipB64: montarCorpoDps(xmlAssinado) },
    cert,
    ambiente,
  );
  return parseRespostaEvento(status, json);
}
