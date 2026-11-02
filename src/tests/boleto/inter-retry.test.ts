import { describe, it, expect } from "vitest";
import { precisaReconsultarInter, corpoCobrancaInter, normalizarContaCorrenteInter } from "@/lib/boleto/inter";
import type { BoletoEmitido } from "@/lib/boleto/tipos";

const bo = (linha: string | null, pix: string | null, nosso: string | null = "123"): BoletoEmitido => ({
  provedorBoletoId: "x",
  nossoNumero: nosso,
  linhaDigitavel: linha,
  pixCopiaCola: pix,
  urlPdf: null,
});

describe("precisaReconsultarInter", () => {
  it("completo não reconsulta", () => {
    expect(precisaReconsultarInter(bo("0001", "pix"))).toBe(false);
  });

  it("nada preenchido reconsulta", () => {
    expect(precisaReconsultarInter(bo(null, null, null))).toBe(true);
  });

  // Este é o caso que foi para produção: o Inter devolveu o PIX pronto e a linha digitável
  // ainda não. Com a condição em `&&`, não havia reconsulta e o boleto era gravado sem linha
  // — inútil para enviar ao cliente. Três boletos de grupo nasceram assim em 02/11/2026.
  it("PIX pronto mas linha digitável ausente RECONSULTA", () => {
    expect(precisaReconsultarInter(bo(null, "pix"))).toBe(true);
  });

  it("linha pronta mas nosso número ausente reconsulta", () => {
    expect(precisaReconsultarInter(bo("0001", "pix", null))).toBe(true);
  });

  // Conta sem PIX habilitado: a linha digitável e o nosso número bastam. Exigir o PIX aqui
  // faria toda emissão esperar as tentativas extras à toa — custo real num lote de 137.
  it("sem PIX, mas com linha e nosso número, não reconsulta", () => {
    expect(precisaReconsultarInter(bo("0001", null))).toBe(false);
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
