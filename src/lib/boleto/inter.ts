import type { DadosEmissao, BoletoEmitido, EventoPagamento, ProvedorBoleto } from "./tipos";
import { Agent } from "undici";

export function baseUrlInter(ambiente: "sandbox" | "producao"): { oauth: string; cobranca: string } {
  const host =
    ambiente === "producao" ? "https://cdpj.partners.bancointer.com.br" : "https://cdpj-sandbox.partners.uatinter.co";
  return { oauth: `${host}/oauth/v2/token`, cobranca: `${host}/cobranca/v3` };
}

export function corpoTokenInter(clientId: string, clientSecret: string): Record<string, string> {
  return {
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "boleto-cobranca.read boleto-cobranca.write",
  };
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
  return {
    seuNumero: dados.seuNumero,
    valorNominal: dados.valor,
    dataVencimento: dados.vencimento,
    numDiasAgenda: 60,
    pagador,
  };
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export function parsearConsultaInter(codigoSolicitacao: string, consulta: Record<string, unknown>): BoletoEmitido {
  const boleto = (typeof consulta.boleto === "object" && consulta.boleto !== null ? consulta.boleto : {}) as Record<
    string,
    unknown
  >;
  const pix = (typeof consulta.pix === "object" && consulta.pix !== null ? consulta.pix : {}) as Record<
    string,
    unknown
  >;
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

export function criarAdaptadorInter(
  clientId: string,
  clientSecret: string,
  contaCorrente: string,
  certPem: string,
  keyPem: string,
  ambiente: "sandbox" | "producao",
): ProvedorBoleto {
  const urls = baseUrlInter(ambiente);
  const dispatcher = new Agent({ connect: { cert: certPem, key: keyPem } });
  let token: { valor: string; expiraEm: number } | null = null;

  async function obterToken(): Promise<string> {
    const agora = Date.now();
    if (token && token.expiraEm > agora + 30000) return token.valor;
    const body = new URLSearchParams(corpoTokenInter(clientId, clientSecret)).toString();
    const r = await fetch(urls.oauth, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      dispatcher,
    } as RequestInit & { dispatcher: Agent });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) throw new Error(`Inter token ${r.status}: ${JSON.stringify(j)}`);
    const exp = typeof j.expires_in === "number" ? j.expires_in : 3600;
    token = { valor: String(j.access_token ?? ""), expiraEm: agora + exp * 1000 };
    return token.valor;
  }

  async function req(
    method: "GET" | "POST",
    path: string,
    tk: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    const r = await fetch(`${urls.cobranca}${path}`, {
      method,
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json", "x-conta-corrente": contaCorrente },
      body: body === undefined ? undefined : JSON.stringify(body),
      dispatcher,
    } as RequestInit & { dispatcher: Agent });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) throw new Error(`Inter ${r.status}: ${JSON.stringify(j)}`);
    return j;
  }

  return {
    async emitir(dados: DadosEmissao): Promise<BoletoEmitido> {
      const tk = await obterToken();
      const criada = await req("POST", "/cobrancas", tk, corpoCobrancaInter(dados));
      const cod = String(criada.codigoSolicitacao ?? "");
      const consulta = await req("GET", `/cobrancas/${cod}`, tk);
      return parsearConsultaInter(cod, consulta);
    },
    interpretarWebhook(payload: unknown): EventoPagamento | null {
      return interpretarWebhookInter(payload);
    },
  };
}
