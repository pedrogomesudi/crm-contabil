import { describe, it, expect } from "vitest";
import { iniciais, badgeRegime, badgeStatusTitulo, badgeStatusNfse } from "@/lib/ui/apresentacao";

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

describe("badgeStatusTitulo", () => {
  it("mapeia o status do título para a variante do Badge", () => {
    expect(badgeStatusTitulo("BAIXADO")).toBe("positivo");
    expect(badgeStatusTitulo("BAIXADO_PARCIAL")).toBe("atencao");
    expect(badgeStatusTitulo("VENCIDO")).toBe("negativo");
    expect(badgeStatusTitulo("ABERTO")).toBe("neutro");
    expect(badgeStatusTitulo("CANCELADO")).toBe("neutro");
    expect(badgeStatusTitulo("qualquer")).toBe("neutro");
  });
});

describe("badgeStatusNfse", () => {
  it("mapeia o status da nota para a variante do Badge (case-insensitive)", () => {
    expect(badgeStatusNfse("autorizada")).toBe("positivo");
    expect(badgeStatusNfse("AUTORIZADA")).toBe("positivo");
    expect(badgeStatusNfse("cancelada")).toBe("neutro");
    expect(badgeStatusNfse("rejeitada")).toBe("negativo");
    expect(badgeStatusNfse("erro")).toBe("negativo");
    expect(badgeStatusNfse("processando")).toBe("atencao");
    expect(badgeStatusNfse("pendente")).toBe("atencao");
    expect(badgeStatusNfse("qualquer")).toBe("neutro");
  });
});
