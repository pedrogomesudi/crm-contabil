import { describe, it, expect } from "vitest";
import { agruparRentabilidade } from "@/lib/timesheet/segmento";

const linhas = [
  { minutos: 60, custo: 10, recebido: 100, contratado: 50, regime: "Simples", porte: "ME" },
  { minutos: 120, custo: 20, recebido: 200, contratado: 80, regime: "Simples", porte: "EPP" },
  { minutos: 30, custo: 5, recebido: 50, contratado: 0, regime: "Presumido", porte: "ME" },
  { minutos: 0, custo: 0, recebido: 0, contratado: 0, regime: null, porte: null },
];

describe("agruparRentabilidade", () => {
  it("agrupa por regime, soma e ordena por recebido desc", () => {
    expect(agruparRentabilidade(linhas, "regime")).toEqual([
      { grupo: "Simples", minutos: 180, custo: 30, recebido: 300, contratado: 130 },
      { grupo: "Presumido", minutos: 30, custo: 5, recebido: 50, contratado: 0 },
      { grupo: "Não classificado", minutos: 0, custo: 0, recebido: 0, contratado: 0 },
    ]);
  });
  it("agrupa por porte; null vira 'Não classificado'", () => {
    const g = agruparRentabilidade(linhas, "porte");
    expect(g.map((x) => x.grupo)).toEqual(["ME", "EPP", "Não classificado"]);
    expect(g.find((x) => x.grupo === "ME")).toEqual({
      grupo: "ME",
      minutos: 90,
      custo: 15,
      recebido: 150,
      contratado: 50,
    });
  });
});
