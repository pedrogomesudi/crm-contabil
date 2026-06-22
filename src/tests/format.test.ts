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
});
