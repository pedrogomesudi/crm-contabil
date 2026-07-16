import { describe, it, expect } from "vitest";
import {
  baseUrlAsaas,
  headersAsaas,
  corpoClienteAsaas,
  corpoCobrancaAsaas,
  parsearCobrancaAsaas,
  interpretarWebhookAsaas,
} from "@/lib/boleto/asaas";
import type { DadosEmissao } from "@/lib/boleto/tipos";

const dados: DadosEmissao = {
  valor: 100,
  vencimento: "2026-08-01",
  pagadorNome: "ACME",
  pagadorDocumento: "12345678000199",
  pagadorEmail: "a@b.com",
  descricao: "Honorário julho",
  seuNumero: "T-1",
};

describe("asaas puras", () => {
  it("baseUrlAsaas", () => {
    expect(baseUrlAsaas("producao")).toBe("https://api.asaas.com/v3");
    expect(baseUrlAsaas("sandbox")).toBe("https://api-sandbox.asaas.com/v3");
  });
  it("headersAsaas", () => {
    expect(headersAsaas("k")).toEqual({
      access_token: "k",
      "Content-Type": "application/json",
      "User-Agent": "SALDO CRM",
    });
  });
  it("corpoClienteAsaas com e sem email", () => {
    expect(corpoClienteAsaas(dados)).toEqual({ name: "ACME", cpfCnpj: "12345678000199", email: "a@b.com" });
    expect(corpoClienteAsaas({ ...dados, pagadorEmail: null })).toEqual({ name: "ACME", cpfCnpj: "12345678000199" });
  });
  it("corpoCobrancaAsaas", () => {
    expect(corpoCobrancaAsaas("cus_1", dados)).toEqual({
      customer: "cus_1",
      billingType: "BOLETO",
      value: 100,
      dueDate: "2026-08-01",
      description: "Honorário julho",
      externalReference: "T-1",
    });
  });
  it("parsearCobrancaAsaas com identif+pix", () => {
    expect(
      parsearCobrancaAsaas(
        { id: "pay_1", bankSlipUrl: "http://slip" },
        { identificationField: "123", nossoNumero: "9" },
        { payload: "pixcc" },
      ),
    ).toEqual({
      provedorBoletoId: "pay_1",
      nossoNumero: "9",
      linhaDigitavel: "123",
      pixCopiaCola: "pixcc",
      urlPdf: "http://slip",
    });
  });
  it("parsearCobrancaAsaas sem identif/pix", () => {
    expect(parsearCobrancaAsaas({ id: "pay_2", invoiceUrl: "http://inv" }, null, null)).toEqual({
      provedorBoletoId: "pay_2",
      nossoNumero: null,
      linhaDigitavel: null,
      pixCopiaCola: null,
      urlPdf: "http://inv",
    });
  });
  it("interpretarWebhookAsaas: pago", () => {
    expect(
      interpretarWebhookAsaas({
        event: "PAYMENT_RECEIVED",
        payment: { id: "pay_1", value: 100, paymentDate: "2026-08-02" },
      }),
    ).toEqual({ provedorBoletoId: "pay_1", pago: true, valorPago: 100, pagoEm: "2026-08-02" });
  });
  it("interpretarWebhookAsaas: evento irrelevante → null", () => {
    expect(interpretarWebhookAsaas({ event: "PAYMENT_CREATED", payment: { id: "x" } })).toBe(null);
  });
  it("interpretarWebhookAsaas: payload inválido → null", () => {
    expect(interpretarWebhookAsaas("nada")).toBe(null);
    expect(interpretarWebhookAsaas({ event: "PAYMENT_RECEIVED" })).toBe(null);
  });
});
