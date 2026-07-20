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

// O Inter exige o header x-conta-corrente no padrão [1-9]\d*: só dígitos e SEM
// zeros à esquerda. "0545835844" é rejeitado (400); vira "545835844".
export function normalizarContaCorrenteInter(cc: string): string {
  return String(cc ?? "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");
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

export function precisaReconsultarInter(b: BoletoEmitido): boolean {
  return b.linhaDigitavel === null && b.pixCopiaCola === null;
}

// A exportação de PDF do Inter devolve o arquivo em base64 no campo `pdf`.
export function extrairPdfBase64Inter(resp: Record<string, unknown>): string | null {
  const p = resp.pdf;
  return typeof p === "string" && p.length > 0 ? p : null;
}

// A consulta de webhook do Inter devolve a URL cadastrada no campo `webhookUrl`.
export function extrairWebhookUrlInter(resp: Record<string, unknown>): string | null {
  const u = resp.webhookUrl;
  return typeof u === "string" && u.length > 0 ? u : null;
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

// Interpreta a situação vinda do GET /cobrancas/{cod} (reconciliação/sincronização).
export function interpretarSituacaoInter(cod: string, resp: Record<string, unknown>): EventoPagamento | null {
  const cob =
    typeof resp.cobranca === "object" && resp.cobranca !== null ? (resp.cobranca as Record<string, unknown>) : null;
  const situacao = cob?.situacao;
  if (situacao !== "RECEBIDO" && situacao !== "MARCADO_RECEBIDO" && situacao !== "PAGO") return null;
  const valor = cob && typeof cob.valorTotalRecebido === "number" ? (cob.valorTotalRecebido as number) : null;
  const data = cob && typeof cob.dataSituacao === "string" ? (cob.dataSituacao as string) : null;
  return { provedorBoletoId: cod, pago: true, valorPago: valor, pagoEm: data };
}

export function criarAdaptadorInter(
  clientId: string,
  clientSecret: string,
  contaCorrente: string,
  certPem: string,
  keyPem: string,
  ambiente: "sandbox" | "producao",
  esperar: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): ProvedorBoleto {
  const urls = baseUrlInter(ambiente);
  const contaHeader = normalizarContaCorrenteInter(contaCorrente);
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
    method: "GET" | "POST" | "PUT",
    path: string,
    tk: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    const r = await fetch(`${urls.cobranca}${path}`, {
      method,
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json", "x-conta-corrente": contaHeader },
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
      let emitido = parsearConsultaInter(cod, await req("GET", `/cobrancas/${cod}`, tk));
      // A cobrança do Inter processa async: no GET imediato a linha/PIX podem vir nulos.
      // Reconsulta uma vez após uma pausa curta antes de gravar um boleto "vazio".
      if (precisaReconsultarInter(emitido)) {
        await esperar(1500);
        emitido = parsearConsultaInter(cod, await req("GET", `/cobrancas/${cod}`, tk));
      }
      return emitido;
    },
    interpretarWebhook(payload: unknown): EventoPagamento | null {
      return interpretarWebhookInter(payload);
    },
    async pdf(codigoSolicitacao: string): Promise<string | null> {
      const tk = await obterToken();
      const j = await req("GET", `/cobrancas/${codigoSolicitacao}/pdf`, tk);
      return extrairPdfBase64Inter(j);
    },
    async registrarWebhook(url: string): Promise<void> {
      const tk = await obterToken();
      await req("PUT", "/cobrancas/webhook", tk, { webhookUrl: url });
    },
    async consultarWebhook(): Promise<string | null> {
      const tk = await obterToken();
      const j = await req("GET", "/cobrancas/webhook", tk);
      return extrairWebhookUrlInter(j);
    },
    async consultarPagamento(codigoSolicitacao: string): Promise<EventoPagamento | null> {
      const tk = await obterToken();
      const j = await req("GET", `/cobrancas/${codigoSolicitacao}`, tk);
      return interpretarSituacaoInter(codigoSolicitacao, j);
    },
  };
}
