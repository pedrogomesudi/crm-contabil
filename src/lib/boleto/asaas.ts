import type { DadosEmissao, BoletoEmitido, EventoPagamento } from "./tipos";

export function baseUrlAsaas(ambiente: "sandbox" | "producao"): string {
  return ambiente === "producao" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
}

export function headersAsaas(apiKey: string): Record<string, string> {
  return { access_token: apiKey, "Content-Type": "application/json", "User-Agent": "SALDO CRM" };
}

export function corpoClienteAsaas(dados: DadosEmissao): { name: string; cpfCnpj: string; email?: string } {
  const c: { name: string; cpfCnpj: string; email?: string } = { name: dados.pagadorNome, cpfCnpj: dados.pagadorDocumento };
  if (dados.pagadorEmail) c.email = dados.pagadorEmail;
  return c;
}

export function corpoCobrancaAsaas(customerId: string, dados: DadosEmissao): { customer: string; billingType: "BOLETO"; value: number; dueDate: string; description: string; externalReference: string } {
  return { customer: customerId, billingType: "BOLETO", value: dados.valor, dueDate: dados.vencimento, description: dados.descricao, externalReference: dados.seuNumero };
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export function parsearCobrancaAsaas(pagamento: Record<string, unknown>, identif: Record<string, unknown> | null, pix: Record<string, unknown> | null): BoletoEmitido {
  return {
    provedorBoletoId: String(pagamento.id ?? ""),
    nossoNumero: identif ? str(identif.nossoNumero) : null,
    linhaDigitavel: identif ? str(identif.identificationField) : null,
    pixCopiaCola: pix ? str(pix.payload) : null,
    urlPdf: str(pagamento.bankSlipUrl) ?? str(pagamento.invoiceUrl),
  };
}

export function interpretarWebhookAsaas(payload: unknown): EventoPagamento | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.event !== "string") return null;
  if (typeof p.payment !== "object" || p.payment === null) return null;
  if (p.event !== "PAYMENT_RECEIVED" && p.event !== "PAYMENT_CONFIRMED") return null;
  const pay = p.payment as Record<string, unknown>;
  return {
    provedorBoletoId: String(pay.id ?? ""),
    pago: true,
    valorPago: typeof pay.value === "number" ? pay.value : null,
    pagoEm: typeof pay.paymentDate === "string" ? pay.paymentDate : null,
  };
}
