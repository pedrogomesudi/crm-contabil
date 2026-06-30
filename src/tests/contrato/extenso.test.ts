import { describe, it, expect } from "vitest";
import { reaisPorExtenso } from "@/lib/contrato/extenso";

describe("reaisPorExtenso", () => {
  it("inclui 'reais' e o valor em palavras", () => {
    expect(reaisPorExtenso(1500).toLowerCase()).toContain("reais");
    expect(reaisPorExtenso(1).toLowerCase()).toContain("um real");
  });
  it("inclui centavos quando há fração", () => {
    expect(reaisPorExtenso(1452.5).toLowerCase()).toContain("centavos");
  });
  it("valor zero ou inválido vira string vazia", () => {
    expect(reaisPorExtenso(0)).toBe("");
    expect(reaisPorExtenso(NaN)).toBe("");
  });
});
