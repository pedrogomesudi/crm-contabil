import { describe, it, expect } from "vitest";
import { montarDRE, type CategoriaDRE } from "@/lib/financeiro/dre";

const cats: CategoriaDRE[] = [
  { id: "r1", nome: "Honorários", natureza: "RECEITA", grupo: "OPERACIONAL", ordem_dre: 1 },
  { id: "d2", nome: "Aluguel", natureza: "DESPESA", grupo: "OPERACIONAL", ordem_dre: 3 },
  { id: "d1", nome: "Salários", natureza: "DESPESA", grupo: "OPERACIONAL", ordem_dre: 2 },
  { id: "rn", nome: "Rendimentos", natureza: "RECEITA", grupo: "NAO_OPERACIONAL", ordem_dre: 4 },
  { id: "z", nome: "Zerada", natureza: "DESPESA", grupo: "OPERACIONAL", ordem_dre: 5 },
];

describe("montarDRE", () => {
  const dre = montarDRE(cats, { r1: 10000, d1: 4000, d2: 1000, rn: 200 });
  it("agrupa, ordena por ordem_dre e descarta zeradas", () => {
    expect(dre.receitaOperacional.linhas).toEqual([{ nome: "Honorários", valor: 10000 }]);
    expect(dre.despesaOperacional.linhas.map((l) => l.nome)).toEqual(["Salários", "Aluguel"]);
    expect(dre.despesaOperacional.total).toBe(5000);
  });
  it("resultados", () => {
    expect(dre.resultadoOperacional).toBe(5000);
    expect(dre.receitaNaoOperacional.total).toBe(200);
    expect(dre.despesaNaoOperacional.linhas).toEqual([]);
    expect(dre.resultadoLiquido).toBe(5200);
  });
});
