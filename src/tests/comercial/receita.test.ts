import { describe, it, expect } from "vitest";
import { receitaPorOrigem, totalReceita } from "@/lib/comercial/receita";

const linhas = [
  { origem: "Indicação João", valorGanho: 5000, propostaMensal: 500, propostaUnico: 0 },
  { origem: "Indicação João", valorGanho: 7400, propostaMensal: 1000, propostaUnico: 900 },
  { origem: "Google", valorGanho: 6800, propostaMensal: 800, propostaUnico: 0 },
  { origem: "  ", valorGanho: 2000, propostaMensal: 0, propostaUnico: 0 },
  { origem: null, valorGanho: 300, propostaMensal: 0, propostaUnico: 0 },
];

describe("receitaPorOrigem", () => {
  const fontes = receitaPorOrigem(linhas);
  it("agrupa por origem e soma cada coluna; vazia → 'Sem origem'", () => {
    const joao = fontes.find((f) => f.origem === "Indicação João");
    expect(joao).toEqual({
      origem: "Indicação João",
      ganhos: 2,
      valorGanho: 12400,
      propostaMensal: 1500,
      propostaUnico: 900,
    });
    const sem = fontes.find((f) => f.origem === "Sem origem");
    expect(sem).toEqual({ origem: "Sem origem", ganhos: 2, valorGanho: 2300, propostaMensal: 0, propostaUnico: 0 });
  });
  it("ordena por valorGanho desc", () => {
    expect(fontes.map((f) => f.origem)).toEqual(["Indicação João", "Google", "Sem origem"]);
  });
});

describe("totalReceita", () => {
  it("soma todas as fontes", () => {
    expect(totalReceita(receitaPorOrigem(linhas))).toEqual({
      ganhos: 5,
      valorGanho: 21500,
      propostaMensal: 2300,
      propostaUnico: 900,
    });
  });
});
