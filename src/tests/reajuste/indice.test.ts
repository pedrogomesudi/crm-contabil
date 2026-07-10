import { describe, it, expect } from "vitest";
import {
  variacaoSalarioMinimo,
  variacaoAcumulada,
  aplicarPercentual,
  type PontoSerie,
} from "@/lib/reajuste/indice";

const p = (data: string, valor: string): PontoSerie => ({ data, valor });

describe("variacaoSalarioMinimo", () => {
  it("usa a razão jan/N ÷ dez/(N-1) - 1 (dado real: 1518 -> 1621)", () => {
    const serie = [p("01/12/2025", "1518.00"), p("01/01/2026", "1621.00")];
    expect(variacaoSalarioMinimo(serie, 2026)).toBeCloseTo(6.7852, 3);
  });
  it("ignora meses fora de dez/(N-1) e jan/N", () => {
    const serie = [p("01/11/2025", "1500.00"), p("01/12/2025", "1518.00"), p("01/01/2026", "1621.00")];
    expect(variacaoSalarioMinimo(serie, 2026)).toBeCloseTo(6.7852, 3);
  });
  it("lança quando falta o valor de dezembro ou de janeiro", () => {
    expect(() => variacaoSalarioMinimo([p("01/01/2026", "1621.00")], 2026)).toThrow();
  });
});

describe("variacaoAcumulada", () => {
  it("faz o produtório das variações mensais (dois meses de 1% => 2,01%)", () => {
    expect(variacaoAcumulada([p("01/01/2026", "1.00"), p("01/02/2026", "1.00")])).toBeCloseTo(2.01, 4);
  });
  it("lida com variação negativa (0,5% e -0,5% => -0,0025%)", () => {
    expect(variacaoAcumulada([p("01/01/2026", "0.50"), p("01/02/2026", "-0.50")])).toBeCloseTo(-0.0025, 4);
  });
  it("série vazia => 0", () => {
    expect(variacaoAcumulada([])).toBe(0);
  });
});

describe("aplicarPercentual", () => {
  it("aplica e arredonda a 2 casas", () => {
    expect(aplicarPercentual(500, 6.7852)).toBe(533.93);
  });
  it("percentual 0 mantém o valor", () => {
    expect(aplicarPercentual(500, 0)).toBe(500);
  });
});
