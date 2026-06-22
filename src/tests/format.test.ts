import { describe, it, expect } from "vitest";
import { parseValorBR } from "@/lib/format";

describe("parseValorBR", () => {
  it("formato BR com milhar", () => expect(parseValorBR("1.500,50")).toBe(1500.5));
  it("BR sem milhar", () => expect(parseValorBR("1500,50")).toBe(1500.5));
  it("ponto decimal", () => expect(parseValorBR("1500.50")).toBe(1500.5));
  it("inteiro", () => expect(parseValorBR("1500")).toBe(1500));
  it("vazio => null", () => expect(parseValorBR("  ")).toBeNull());
  it("inválido => NaN", () => expect(Number.isNaN(parseValorBR("abc"))).toBe(true));
});
