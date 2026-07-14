import { describe, it, expect } from "vitest";
import { proximaData, deveGerar, rotuloRegra } from "@/lib/tarefas/recorrencia";

describe("proximaData", () => {
  it("mensal: avança um mês mantendo o dia", () => {
    expect(proximaData("2026-01-05", { periodicidade: "mensal", diaMes: 5 })).toBe("2026-02-05");
  });

  it("mensal dia 31: em fevereiro cai no último dia (não pula o mês)", () => {
    expect(proximaData("2026-01-31", { periodicidade: "mensal", diaMes: 31 })).toBe("2026-02-28");
  });

  it("mensal: volta ao dia 31 no mês seguinte que o tem", () => {
    expect(proximaData("2026-02-28", { periodicidade: "mensal", diaMes: 31 })).toBe("2026-03-31");
  });

  it("mensal: vira o ano", () => {
    expect(proximaData("2026-12-10", { periodicidade: "mensal", diaMes: 10 })).toBe("2027-01-10");
  });

  it("semanal: soma 7 dias", () => {
    expect(proximaData("2026-07-14", { periodicidade: "semanal", diaSemana: 2 })).toBe("2026-07-21");
  });

  it("trimestral: soma 3 meses", () => {
    expect(proximaData("2026-01-10", { periodicidade: "trimestral", diaMes: 10 })).toBe("2026-04-10");
  });

  it("anual: soma 1 ano", () => {
    expect(proximaData("2026-03-31", { periodicidade: "anual", diaMes: 31, mes: 3 })).toBe("2027-03-31");
  });

  it("fevereiro de ano bissexto tem 29", () => {
    expect(proximaData("2028-01-31", { periodicidade: "mensal", diaMes: 31 })).toBe("2028-02-29");
  });
});

describe("deveGerar", () => {
  it("gera quando entra na janela de antecedência", () => {
    expect(deveGerar("2026-07-20", 3, "2026-07-17")).toBe(true);
    expect(deveGerar("2026-07-20", 3, "2026-07-16")).toBe(false);
  });

  it("gera o que já está atrasado (o cron pode ter falhado ontem)", () => {
    expect(deveGerar("2026-07-10", 3, "2026-07-17")).toBe(true);
  });
});

describe("rotuloRegra", () => {
  it("descreve a regra em português", () => {
    expect(rotuloRegra({ periodicidade: "mensal", diaMes: 5 })).toBe("Todo dia 5");
    expect(rotuloRegra({ periodicidade: "semanal", diaSemana: 1 })).toBe("Toda segunda-feira");
    expect(rotuloRegra({ periodicidade: "anual", diaMes: 31, mes: 3 })).toBe("Todo ano em 31/03");
  });
});
