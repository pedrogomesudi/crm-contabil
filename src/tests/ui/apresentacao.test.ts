import { describe, it, expect } from "vitest";
import { iniciais, badgeRegime } from "@/lib/ui/apresentacao";

describe("iniciais", () => {
  it("2 iniciais de nomes compostos; 1 palavra → 2 letras; vazio → ?", () => {
    expect(iniciais("Moura Purcell Holding")).toBe("MP");
    expect(iniciais("uberdados")).toBe("UB");
    expect(iniciais("")).toBe("?");
    expect(iniciais("  ")).toBe("?");
  });
});

describe("badgeRegime", () => {
  it("mapeia o regime para a variante do Badge", () => {
    expect(badgeRegime("Simples Nacional")).toBe("positivo");
    expect(badgeRegime("Lucro Presumido")).toBe("ia");
    expect(badgeRegime("Lucro Real")).toBe("neutro");
    expect(badgeRegime("MEI")).toBe("atencao");
    expect(badgeRegime(null)).toBe("neutro");
  });
});
