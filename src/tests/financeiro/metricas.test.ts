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
    // A: sempre ativo, 300
    {
      dataInicio: null,
      dataSaida: null,
      honorarioSaida: null,
      vigencias: [{ vigenteDe: "1900-01-01", valor: 300, estimada: false }],
    },
    // B: novo em fev, 200
    {
      dataInicio: "2026-02-10",
      dataSaida: null,
      honorarioSaida: null,
      vigencias: [{ vigenteDe: "2026-02-01", valor: 200, estimada: false }],
    },
    // C: saiu em fev; pagava 100 enquanto ativo
    {
      dataInicio: "2025-12-01",
      dataSaida: "2026-02-15",
      honorarioSaida: 100,
      vigencias: [{ vigenteDe: "2025-12-01", valor: 100, estimada: false }],
    },
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
    const r = calcularMetricas(
      [
        {
          dataInicio: "2026-03-05",
          dataSaida: null,
          honorarioSaida: null,
          vigencias: [{ vigenteDe: "2026-03-01", valor: 100, estimada: false }],
        },
      ],
      ["2026-03"],
    );
    expect(r.serie[0]).toMatchObject({ base: 0, novos: 1, churnPct: 0 });
  });
});

describe("calcularMetricas com vigências", () => {
  it("o MRR de cada mês usa o honorário daquele mês, não o atual", () => {
    // Cliente entrou em 2025-10 pagando 500; passou a 800 em março de 2026.
    const clientes: ClienteMetrica[] = [
      {
        dataInicio: "2025-10-01",
        dataSaida: null,
        honorarioSaida: null,
        vigencias: [
          { vigenteDe: "2025-10-01", valor: 500, estimada: false },
          { vigenteDe: "2026-03-01", valor: 800, estimada: false },
        ],
      },
    ];
    const { serie } = calcularMetricas(clientes, ["2026-02", "2026-03"]);
    // Antes desta mudança, ambos dariam 800 — a aproximação que a tela admitia.
    expect(serie[0]!.mrr).toBe(500);
    expect(serie[1]!.mrr).toBe(800);
  });

  it("marca o mês como estimado quando o valor veio de vigência estimada", () => {
    const clientes: ClienteMetrica[] = [
      {
        dataInicio: "2025-10-01",
        dataSaida: null,
        honorarioSaida: null,
        vigencias: [{ vigenteDe: "2025-10-01", valor: 500, estimada: true }],
      },
    ];
    const { serie } = calcularMetricas(clientes, ["2026-02"]);
    expect(serie[0]!.estimado).toBe(true);
  });

  it("um cliente que ainda não entrou não marca o mês como estimado", () => {
    // B entra em fevereiro. Em janeiro ele não soma nada ao MRR, logo não pode
    // contaminar o selo de janeiro só porque sua vigência começa depois.
    const clientes: ClienteMetrica[] = [
      {
        dataInicio: "2025-01-01",
        dataSaida: null,
        honorarioSaida: null,
        vigencias: [{ vigenteDe: "2025-01-01", valor: 300, estimada: false }],
      },
      {
        dataInicio: "2026-02-10",
        dataSaida: null,
        honorarioSaida: null,
        vigencias: [{ vigenteDe: "2026-02-01", valor: 200, estimada: false }],
      },
    ];
    const { serie } = calcularMetricas(clientes, ["2026-01"]);
    expect(serie[0]!.mrr).toBe(300);
    expect(serie[0]!.estimado).toBe(false);
  });
});
