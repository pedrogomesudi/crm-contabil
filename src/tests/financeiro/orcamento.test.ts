import { describe, it, expect } from "vitest";
import { achatarValores, somaLinha, somaColuna } from "@/lib/financeiro/orcamento";

describe("achatarValores", () => {
  it("emite uma célula por mês definido (1-12)", () => {
    expect(achatarValores({ a: { 1: 10, 3: 20.005 }, b: { 12: 5 } })).toEqual([
      { categoriaId: "a", mes: 1, valor: 10 },
      { categoriaId: "a", mes: 3, valor: 20.01 },
      { categoriaId: "b", mes: 12, valor: 5 },
    ]);
  });
  it("ignora meses fora de 1-12", () => {
    expect(achatarValores({ a: { 0: 9, 13: 9 } })).toEqual([]);
  });
});

describe("somaLinha", () => {
  it("soma os 12 meses (ausente = 0)", () => {
    expect(somaLinha({ a: { 1: 100, 2: 50 } }, "a")).toBe(150);
    expect(somaLinha({}, "x")).toBe(0);
  });
});

describe("somaColuna", () => {
  it("soma o mês sobre as categorias", () => {
    expect(somaColuna({ a: { 1: 10 }, b: { 1: 5 }, c: {} }, ["a", "b", "c"], 1)).toBe(15);
  });
});
