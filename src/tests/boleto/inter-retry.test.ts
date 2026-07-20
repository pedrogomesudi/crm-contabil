import { describe, it, expect } from "vitest";
import { precisaReconsultarInter, corpoCobrancaInter, normalizarContaCorrenteInter } from "@/lib/boleto/inter";
import type { BoletoEmitido } from "@/lib/boleto/tipos";

const bo = (linha: string | null, pix: string | null): BoletoEmitido => ({
  provedorBoletoId: "x",
  nossoNumero: null,
  linhaDigitavel: linha,
  pixCopiaCola: pix,
  urlPdf: null,
});

describe("precisaReconsultarInter", () => {
  it("true só quando linha e pix são ambos nulos", () => {
    expect(precisaReconsultarInter(bo(null, null))).toBe(true);
    expect(precisaReconsultarInter(bo("0001", null))).toBe(false);
    expect(precisaReconsultarInter(bo(null, "pix"))).toBe(false);
  });
});

describe("normalizarContaCorrenteInter", () => {
  it("remove zeros à esquerda (padrão [1-9]\\d* do Inter)", () => {
    expect(normalizarContaCorrenteInter("0545835844")).toBe("545835844");
  });
  it("mantém conta sem zero à esquerda", () => {
    expect(normalizarContaCorrenteInter("545835844")).toBe("545835844");
  });
  it("remove não-dígitos (traço/espaço)", () => {
    expect(normalizarContaCorrenteInter("054583-5844")).toBe("545835844");
  });
});

describe("corpoCobrancaInter", () => {
  it("mapeia valor, vencimento e pagador (sanidade)", () => {
    const corpo = corpoCobrancaInter({
      seuNumero: "42",
      valor: 10.5,
      vencimento: "2026-08-01",
      pagadorNome: "Fulano",
      pagadorDocumento: "12345678901",
      pagadorEmail: null,
      descricao: "Teste",
      pagadorEndereco: null,
    });
    expect(corpo.valorNominal).toBe(10.5);
    expect(corpo.dataVencimento).toBe("2026-08-01");
    expect((corpo.pagador as { tipoPessoa: string }).tipoPessoa).toBe("FISICA");
  });
});
