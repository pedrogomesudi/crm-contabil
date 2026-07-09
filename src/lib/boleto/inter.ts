import type { DadosEmissao, BoletoEmitido, EventoPagamento } from "./tipos";

export function baseUrlInter(ambiente: "sandbox" | "producao"): { oauth: string; cobranca: string } {
  const host = ambiente === "producao" ? "https://cdpj.partners.bancointer.com.br" : "https://cdpj-sandbox.partners.uatinter.co";
  return { oauth: `${host}/oauth/v2/token`, cobranca: `${host}/cobranca/v3` };
}

export function corpoTokenInter(clientId: string, clientSecret: string): Record<string, string> {
  return { grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret, scope: "boleto-cobranca.read boleto-cobranca.write" };
}

export function tipoPessoaPorDoc(documento: string): "FISICA" | "JURIDICA" {
  return documento.replace(/\D/g, "").length === 11 ? "FISICA" : "JURIDICA";
}

export function corpoCobrancaInter(dados: DadosEmissao): Record<string, unknown> {
  const e = dados.pagadorEndereco ?? null;
  const pagador: Record<string, unknown> = {
    cpfCnpj: dados.pagadorDocumento,
    tipoPessoa: tipoPessoaPorDoc(dados.pagadorDocumento),
    nome: dados.pagadorNome,
    cep: e?.cep ?? "",
    endereco: e?.logradouro ?? "",
    numero: e?.numero ?? "",
    bairro: e?.bairro ?? "",
    cidade: e?.cidade ?? "",
    uf: e?.uf ?? "",
  };
  if (dados.pagadorEmail) pagador.email = dados.pagadorEmail;
  return { seuNumero: dados.seuNumero, valorNominal: dados.valor, dataVencimento: dados.vencimento, numDiasAgenda: 60, pagador };
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export function parsearConsultaInter(codigoSolicitacao: string, consulta: Record<string, unknown>): BoletoEmitido {
  const boleto = (typeof consulta.boleto === "object" && consulta.boleto !== null ? consulta.boleto : {}) as Record<string, unknown>;
  const pix = (typeof consulta.pix === "object" && consulta.pix !== null ? consulta.pix : {}) as Record<string, unknown>;
  return {
    provedorBoletoId: codigoSolicitacao,
    nossoNumero: str(boleto.nossoNumero),
    linhaDigitavel: str(boleto.linhaDigitavel),
    pixCopiaCola: str(pix.pixCopiaECola),
    urlPdf: null,
  };
}

export function interpretarWebhookInter(payload: unknown): EventoPagamento | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.codigoSolicitacao !== "string" || typeof p.situacao !== "string") return null;
  if (p.situacao !== "RECEBIDO" && p.situacao !== "MARCADO_RECEBIDO" && p.situacao !== "PAGO") return null;
  return {
    provedorBoletoId: p.codigoSolicitacao,
    pago: true,
    valorPago: typeof p.valorNominal === "number" ? p.valorNominal : null,
    pagoEm: typeof p.dataHoraSituacao === "string" ? p.dataHoraSituacao : null,
  };
}
