import { describe, it, expect } from "vitest";
import {
  corValida,
  rotuloValido,
  proximaOrdem,
  pctParaProb,
  probParaPct,
  moverNaOrdem,
} from "@/lib/comercial/funilConfig";

describe("corValida", () => {
  it("aceita hex #RRGGBB, rejeita o resto", () => {
    expect(corValida("#8C938E")).toBe(true);
    expect(corValida("#abc123")).toBe(true);
    expect(corValida("8C938E")).toBe(false);
    expect(corValida("#FFF")).toBe(false);
    expect(corValida("vermelho")).toBe(false);
  });
});

describe("rotuloValido", () => {
  it("não vazio e ≤ 40", () => {
    expect(rotuloValido("Novo")).toBe(true);
    expect(rotuloValido("   ")).toBe(false);
    expect(rotuloValido("x".repeat(41))).toBe(false);
  });
});

describe("proximaOrdem", () => {
  it("max+1, ou 1 se vazio", () => {
    expect(proximaOrdem([{ ordem: 1 }, { ordem: 4 }])).toBe(5);
    expect(proximaOrdem([])).toBe(1);
  });
});

describe("pct/prob", () => {
  it("converte nos dois sentidos", () => {
    expect(pctParaProb(60)).toBeCloseTo(0.6);
    expect(probParaPct(0.2)).toBe(20);
    expect(probParaPct(0.155)).toBe(16); // arredonda
  });
});

describe("moverNaOrdem", () => {
  it("troca com o vizinho; bordas não mudam", () => {
    expect(moverNaOrdem(["a", "b", "c"], "b", "cima")).toEqual(["b", "a", "c"]);
    expect(moverNaOrdem(["a", "b", "c"], "b", "baixo")).toEqual(["a", "c", "b"]);
    expect(moverNaOrdem(["a", "b", "c"], "a", "cima")).toEqual(["a", "b", "c"]);
    expect(moverNaOrdem(["a", "b", "c"], "c", "baixo")).toEqual(["a", "b", "c"]);
  });
});
