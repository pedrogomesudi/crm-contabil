import { describe, it, expect } from "vitest";
import { parseValorBR, formatarData } from "@/lib/format";

describe("formatarData", () => {
  it("formata ISO para dd/mm/aaaa", () =>
    expect(formatarData("2026-06-22T12:00:00Z")).toBe("22/06/2026"));
  it("null => —", () => expect(formatarData(null)).toBe("—"));
  it("inválida => —", () => expect(formatarData("xyz")).toBe("—"));
});

describe("parseValorBR", () => {
  it("formato BR com milhar", () => expect(parseValorBR("1.500,50")).toBe(1500.5));
  it("BR sem milhar", () => expect(parseValorBR("1500,50")).toBe(1500.5));
  it("ponto decimal", () => expect(parseValorBR("1500.50")).toBe(1500.5));
  it("inteiro", () => expect(parseValorBR("1500")).toBe(1500));
  it("milhar sem vírgula => 1500 (não 1.5)", () => expect(parseValorBR("1.500")).toBe(1500));
  it("milhar grande", () => expect(parseValorBR("1.234.567,89")).toBe(1234567.89));
  it("prefixo R$", () => expect(parseValorBR("R$ 1.500,50")).toBe(1500.5));
  it("negativo", () => expect(parseValorBR("-50,00")).toBe(-50));
  it("vazio => null", () => expect(parseValorBR("  ")).toBeNull());
  it("inválido => NaN", () => expect(Number.isNaN(parseValorBR("abc"))).toBe(true));
  it("notação científica => NaN", () => expect(Number.isNaN(parseValorBR("1e3"))).toBe(true));
  it("hexadecimal => NaN", () => expect(Number.isNaN(parseValorBR("0x10"))).toBe(true));
  it("sinal + => NaN", () => expect(Number.isNaN(parseValorBR("+50"))).toBe(true));
  it("milhar quebrado => NaN", () => expect(Number.isNaN(parseValorBR("1.234.56"))).toBe(true));
  it("-0 normaliza para 0", () => expect(Object.is(parseValorBR("-0,00"), 0)).toBe(true));
});

import { formatarDocumento, formatarCep, formatarMoeda } from "@/lib/format";

describe("formatadores de contrato", () => {
  it("formata CNPJ (14 díg) e CPF (11 díg)", () => {
    expect(formatarDocumento("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarDocumento("52998224725")).toBe("529.982.247-25");
    expect(formatarDocumento("123")).toBe("123"); // tamanho inesperado: devolve cru
  });
  it("formata CEP de 8 dígitos no padrão NN.NNN-NNN", () => {
    expect(formatarCep("38407162")).toBe("38.407-162");
    expect(formatarCep("")).toBe("");
  });
  it("formata moeda em BRL", () => {
    expect(formatarMoeda(1500)).toBe("R$ 1.500,00");
    expect(formatarMoeda(1452.5)).toBe("R$ 1.452,50");
  });
});
