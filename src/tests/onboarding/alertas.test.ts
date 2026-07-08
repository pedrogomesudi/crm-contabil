import { describe, it, expect } from "vitest";
import { classificarAlerta, ordemSeveridade } from "@/lib/onboarding/alertas";

describe("classificarAlerta", () => {
  const hoje = "2026-07-10";
  it("hoje e dentro da janela → em_breve", () => {
    expect(classificarAlerta("2026-07-10", hoje)).toBe("em_breve");
    expect(classificarAlerta("2026-07-13", hoje)).toBe("em_breve");
  });
  it("fora da janela → null", () => {
    expect(classificarAlerta("2026-07-14", hoje)).toBe(null);
  });
  it("vencido até 7 dias", () => {
    expect(classificarAlerta("2026-07-09", hoje)).toBe("vencido");
    expect(classificarAlerta("2026-07-03", hoje)).toBe("vencido");
  });
  it("vencido há +7 dias → critico", () => {
    expect(classificarAlerta("2026-07-02", hoje)).toBe("critico");
  });
  it("prazo inválido → null", () => {
    expect(classificarAlerta("xyz", hoje)).toBe(null);
  });
});

describe("ordemSeveridade", () => {
  it("critico < vencido < em_breve", () => {
    expect(ordemSeveridade("critico")).toBeLessThan(ordemSeveridade("vencido"));
    expect(ordemSeveridade("vencido")).toBeLessThan(ordemSeveridade("em_breve"));
  });
});
