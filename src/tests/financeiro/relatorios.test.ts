import { describe, it, expect } from "vitest";
import { faixaAging, pctInadimplencia, diasAtraso, situacaoAtraso } from "@/lib/financeiro/relatorios";

describe("faixaAging", () => {
  it("classifica por dias de atraso", () => {
    expect(faixaAging(0)).toBe("a_vencer");
    expect(faixaAging(-5)).toBe("a_vencer");
    expect(faixaAging(1)).toBe("d1_30");
    expect(faixaAging(30)).toBe("d1_30");
    expect(faixaAging(31)).toBe("d31_60");
    expect(faixaAging(60)).toBe("d31_60");
    expect(faixaAging(61)).toBe("d61_90");
    expect(faixaAging(90)).toBe("d61_90");
    expect(faixaAging(91)).toBe("d90_mais");
  });
});

describe("pctInadimplencia", () => {
  it("percentual do vencido sobre a carteira; carteira 0 => 0", () => {
    expect(pctInadimplencia(50, 200)).toBe(25);
    expect(pctInadimplencia(0, 0)).toBe(0);
    expect(pctInadimplencia(10, 0)).toBe(0);
  });
});

describe("diasAtraso", () => {
  it("conta dias entre vencimento e hoje (positivo = vencido)", () => {
    expect(diasAtraso("2026-08-10", "2026-08-23")).toBe(13);
    expect(diasAtraso("2026-08-23", "2026-08-23")).toBe(0);
    expect(diasAtraso("2026-09-05", "2026-08-23")).toBe(-13);
  });
  it("data inválida => 0", () => {
    expect(diasAtraso("", "2026-08-23")).toBe(0);
  });
});

describe("situacaoAtraso", () => {
  it("a vencer quando vencimento >= hoje", () => {
    expect(situacaoAtraso("2026-08-23", "2026-08-23")).toBe("A vencer");
    expect(situacaoAtraso("2026-09-05", "2026-08-23")).toBe("A vencer");
  });
  it("vencido há N dias, com plural correto", () => {
    expect(situacaoAtraso("2026-08-22", "2026-08-23")).toBe("Vencido há 1 dia");
    expect(situacaoAtraso("2026-08-10", "2026-08-23")).toBe("Vencido há 13 dias");
  });
});
