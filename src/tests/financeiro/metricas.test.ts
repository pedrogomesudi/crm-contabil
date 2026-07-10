import { describe, it, expect } from "vitest";
import { mesesJanela, calcularMetricas, type ClienteMetrica } from "@/lib/financeiro/metricas";

describe("mesesJanela", () => {
  it("gera N meses em ordem cronológica terminando no ref", () => {
    expect(mesesJanela("2026-03", 3)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
  it("cruza a virada de ano", () => {
    expect(mesesJanela("2026-01", 3)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

describe("calcularMetricas", () => {
  const clientes: ClienteMetrica[] = [
    { dataInicio: null, dataSaida: null, honorario: 300, honorarioSaida: null }, // A: sempre ativo
    { dataInicio: "2026-02-10", dataSaida: null, honorario: 200, honorarioSaida: null }, // B: novo em fev
    { dataInicio: "2025-12-01", dataSaida: "2026-02-15", honorario: 0, honorarioSaida: 100 }, // C: saiu em fev
  ];
  const meses = mesesJanela("2026-03", 3); // jan, fev, mar
  const { serie, atual } = calcularMetricas(clientes, meses);
  const [jan, fev, mar] = serie;

  it("janeiro: base 2, sem novos/churn, MRR 400", () => {
    expect(jan).toMatchObject({ mes: "2026-01", base: 2, novos: 0, churn: 0, ativosFim: 2, mrr: 400, ticketMedio: 200, churnPct: 0, churnReceita: 0 });
  });
  it("fevereiro: 1 novo, 1 churn (50%), churn receita 100 (honorário fotografado)", () => {
    expect(fev).toMatchObject({ mes: "2026-02", base: 2, novos: 1, churn: 1, liquido: 0, ativosFim: 2, mrr: 500, ticketMedio: 250, churnPct: 50, churnReceita: 100 });
  });
  it("março: base 2 (A,B), sem eventos, MRR 500", () => {
    expect(mar).toMatchObject({ mes: "2026-03", base: 2, novos: 0, churn: 0, ativosFim: 2, mrr: 500, ticketMedio: 250, churnPct: 0 });
  });
  it("atual = último mês da série", () => {
    expect(atual).toEqual({ mrr: 500, ticketMedio: 250, ativos: 2, churnPct: 0, churnReceita: 0 });
  });
  it("churn % é 0 quando a base do mês é 0", () => {
    const r = calcularMetricas([{ dataInicio: "2026-03-05", dataSaida: null, honorario: 100, honorarioSaida: null }], ["2026-03"]);
    expect(r.serie[0]).toMatchObject({ base: 0, novos: 1, churnPct: 0 });
  });
});
