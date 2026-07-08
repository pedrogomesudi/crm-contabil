import { describe, it, expect } from "vitest";
import { mesesDoPeriodo, variacao, montarComparativo } from "@/lib/financeiro/orcado-realizado";

describe("mesesDoPeriodo", () => {
  it("mês / trimestre / semestre / ano", () => {
    expect(mesesDoPeriodo("mes", 2026, 4)).toEqual([{ ano: 2026, mes: 4 }]);
    expect(mesesDoPeriodo("trimestre", 2026, 2).map((m) => m.mes)).toEqual([4, 5, 6]);
    expect(mesesDoPeriodo("semestre", 2026, 2).map((m) => m.mes)).toEqual([7, 8, 9, 10, 11, 12]);
    expect(mesesDoPeriodo("ano", 2026, 1).map((m) => m.mes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe("variacao", () => {
  it("normal", () => expect(variacao(100, 130)).toEqual({ abs: 30, pct: 30 }));
  it("orçado zero → pct null", () => expect(variacao(0, 50)).toEqual({ abs: 50, pct: null }));
  it("abaixo → negativo", () => expect(variacao(100, 80)).toEqual({ abs: -20, pct: -20 }));
});

describe("montarComparativo", () => {
  const categorias = [
    { id: "hon", nome: "Honorários", natureza: "RECEITA" as const, ordem_dre: 1 },
    { id: "folha", nome: "Folha", natureza: "DESPESA" as const, ordem_dre: 1 },
  ];
  const orcamento = { hon: { 4: 100, 5: 100, 6: 100 }, folha: { 4: 50, 5: 50, 6: 50 } };
  const realizado = [
    { categoriaId: "hon", ano: 2026, mes: 4, valor: 120 },
    { categoriaId: "folha", ano: 2026, mes: 4, valor: 60 },
    { categoriaId: "hon", ano: 2026, mes: 7, valor: 999 }, // fora do período (T2), entra só na série
  ];
  const meses = mesesDoPeriodo("trimestre", 2026, 2);
  const comp = montarComparativo(categorias, orcamento, realizado, meses, 2026);

  it("agrega o período por categoria", () => {
    const rec = comp.grupos.find((g) => g.natureza === "RECEITA")!;
    expect(rec.linhas[0]).toMatchObject({ categoriaId: "hon", orcado: 300, realizado: 120, varAbs: -180 });
    expect(rec.totalOrcado).toBe(300);
    expect(rec.totalRealizado).toBe(120);
  });
  it("resultado = receita - despesa", () => {
    expect(comp.resultado.orcado).toBe(150); // 300 - 150
    expect(comp.resultado.realizado).toBe(60); // 120 - 60
  });
  it("série de 12 meses só de receita (inclui mês fora do período)", () => {
    expect(comp.serieReceita).toHaveLength(12);
    expect(comp.serieReceita[3]).toEqual({ mes: 4, orcado: 100, realizado: 120 });
    expect(comp.serieReceita[6]).toEqual({ mes: 7, orcado: 0, realizado: 999 });
  });
});
