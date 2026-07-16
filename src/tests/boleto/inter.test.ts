import { describe, it, expect } from "vitest";
import {
  baseUrlInter,
  corpoTokenInter,
  tipoPessoaPorDoc,
  corpoCobrancaInter,
  parsearConsultaInter,
  interpretarWebhookInter,
} from "@/lib/boleto/inter";
import type { DadosEmissao } from "@/lib/boleto/tipos";

const dados: DadosEmissao = {
  valor: 100,
  vencimento: "2026-08-01",
  pagadorNome: "ACME",
  pagadorDocumento: "12345678000199",
  pagadorEmail: "a@b.com",
  descricao: "Honorário",
  seuNumero: "T-1",
  pagadorEndereco: {
    cep: "38400000",
    logradouro: "Rua X",
    numero: "10",
    bairro: "Centro",
    cidade: "Uberlândia",
    uf: "MG",
  },
};

describe("inter puras", () => {
  it("baseUrlInter", () => {
    expect(baseUrlInter("producao")).toEqual({
      oauth: "https://cdpj.partners.bancointer.com.br/oauth/v2/token",
      cobranca: "https://cdpj.partners.bancointer.com.br/cobranca/v3",
    });
    expect(baseUrlInter("sandbox").oauth).toBe("https://cdpj-sandbox.partners.uatinter.co/oauth/v2/token");
  });
  it("corpoTokenInter", () => {
    expect(corpoTokenInter("cid", "sec")).toEqual({
      grant_type: "client_credentials",
      client_id: "cid",
      client_secret: "sec",
      scope: "boleto-cobranca.read boleto-cobranca.write",
    });
  });
  it("tipoPessoaPorDoc", () => {
    expect(tipoPessoaPorDoc("12345678901")).toBe("FISICA");
    expect(tipoPessoaPorDoc("12.345.678/0001-99")).toBe("JURIDICA");
  });
  it("corpoCobrancaInter com endereço", () => {
    const c = corpoCobrancaInter(dados) as { valorNominal: number; pagador: Record<string, unknown> };
    expect(c.valorNominal).toBe(100);
    expect(c.pagador).toMatchObject({
      cpfCnpj: "12345678000199",
      tipoPessoa: "JURIDICA",
      nome: "ACME",
      email: "a@b.com",
      cep: "38400000",
      endereco: "Rua X",
      numero: "10",
      bairro: "Centro",
      cidade: "Uberlândia",
      uf: "MG",
    });
  });
  it("corpoCobrancaInter sem endereço → strings vazias", () => {
    const c = corpoCobrancaInter({ ...dados, pagadorEndereco: null, pagadorEmail: null }) as {
      pagador: Record<string, unknown>;
    };
    expect(c.pagador).toMatchObject({ cep: "", endereco: "", cidade: "" });
    expect(c.pagador.email).toBeUndefined();
  });
  it("parsearConsultaInter", () => {
    expect(
      parsearConsultaInter("cod-1", {
        boleto: { linhaDigitavel: "123", nossoNumero: "9" },
        pix: { pixCopiaECola: "pixcc" },
      }),
    ).toEqual({
      provedorBoletoId: "cod-1",
      nossoNumero: "9",
      linhaDigitavel: "123",
      pixCopiaCola: "pixcc",
      urlPdf: null,
    });
  });
  it("interpretarWebhookInter: recebido", () => {
    expect(
      interpretarWebhookInter({
        codigoSolicitacao: "cod-1",
        situacao: "RECEBIDO",
        valorNominal: 100,
        dataHoraSituacao: "2026-08-02T10:00:00Z",
      }),
    ).toEqual({ provedorBoletoId: "cod-1", pago: true, valorPago: 100, pagoEm: "2026-08-02T10:00:00Z" });
  });
  it("interpretarWebhookInter: situação irrelevante / inválido → null", () => {
    expect(interpretarWebhookInter({ codigoSolicitacao: "cod-1", situacao: "EM_PROCESSAMENTO" })).toBe(null);
    expect(interpretarWebhookInter("nada")).toBe(null);
  });
});
