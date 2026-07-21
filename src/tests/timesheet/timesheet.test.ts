import { describe, it, expect } from "vitest";
import { duracaoSessao, formatarHoras, parseDuracao, LIMITE_SESSAO_MIN } from "@/lib/timesheet/apontamento";
import {
  custoHoraNaData,
  custoDoApontamento,
  margem,
  mesesNoPeriodo,
  ordenarPorMargem,
  type LinhaRentab,
} from "@/lib/timesheet/rentabilidade";

describe("cronômetro", () => {
  it("conta os minutos da sessão", () => {
    expect(duracaoSessao("2026-07-14T09:00:00Z", "2026-07-14T10:30:00Z").minutos).toBe(90);
  });

  it("marca como suspeita a sessão acima de 8h (cronômetro esquecido a noite toda)", () => {
    const r = duracaoSessao("2026-07-14T09:00:00Z", "2026-07-15T00:00:00Z");
    expect(r.minutos).toBeGreaterThan(LIMITE_SESSAO_MIN);
    expect(r.suspeita).toBe(true);
  });

  it("não marca como suspeita a sessão normal", () => {
    expect(duracaoSessao("2026-07-14T09:00:00Z", "2026-07-14T12:00:00Z").suspeita).toBe(false);
  });
});

describe("duração", () => {
  it("formata e faz parse nos formatos que a pessoa realmente digita", () => {
    expect(formatarHoras(90)).toBe("1h30");
    expect(formatarHoras(60)).toBe("1h00");
    expect(formatarHoras(0)).toBe("0h00");
    expect(parseDuracao("1h30")).toBe(90);
    expect(parseDuracao("1:30")).toBe(90);
    expect(parseDuracao("90")).toBe(90);
    expect(parseDuracao("abc")).toBeNull();
    expect(parseDuracao("")).toBeNull();
  });
});

describe("custo por vigência", () => {
  const vigencias = [
    { custoHora: 50, inicio: "2026-01-01", fim: "2026-05-31" },
    { custoHora: 70, inicio: "2026-06-01", fim: null },
  ];

  it("usa o custo VIGENTE NA DATA DO APONTAMENTO, não o de hoje", () => {
    expect(custoHoraNaData(vigencias, "2026-03-10")).toBe(50);
    expect(custoHoraNaData(vigencias, "2026-07-10")).toBe(70);
  });

  it("sem vigência na data, devolve null — o chamador sinaliza, não silencia", () => {
    expect(custoHoraNaData(vigencias, "2025-12-31")).toBeNull();
    expect(custoHoraNaData([], "2026-07-10")).toBeNull();
  });

  it("custo do apontamento é proporcional aos minutos", () => {
    expect(custoDoApontamento(90, 60)).toBe(90);
    expect(custoDoApontamento(90, null)).toBe(0);
  });
});

describe("margem", () => {
  const linha = (over: Partial<LinhaRentab>): LinhaRentab => ({
    clienteId: "c",
    clienteNome: "Cliente",
    regime: null,
    porte: null,
    minutos: 600,
    custo: 500,
    recebido: 1000,
    contratado: 1000,
    semApontamento: false,
    semCusto: false,
    ...over,
  });

  it("calcula margem em R$, % e receita por hora", () => {
    const m = margem(linha({}));
    expect(m.valor).toBe(500);
    expect(m.pct).toBe(50);
    expect(m.porHora).toBe(100);
  });

  it("recebido zero não vira Infinity nem NaN", () => {
    const m = margem(linha({ recebido: 0 }));
    expect(m.valor).toBe(-500);
    expect(m.pct).toBeNull();
  });

  it("sem horas apontadas, receita por hora é nula (não divide por zero)", () => {
    expect(margem(linha({ minutos: 0, custo: 0 })).porHora).toBeNull();
  });

  it("ordena pior margem primeiro — o relatório existe para achar cliente ruim", () => {
    const bom = linha({ clienteId: "bom", recebido: 2000, custo: 100 });
    const ruim = linha({ clienteId: "ruim", recebido: 300, custo: 900 });
    expect(ordenarPorMargem([bom, ruim]).map((l) => l.clienteId)).toEqual(["ruim", "bom"]);
  });
});

describe("mesesNoPeriodo", () => {
  it("conta os meses do período para o honorário contratado", () => {
    expect(mesesNoPeriodo("2026-01-01", "2026-03-31")).toBe(3);
    expect(mesesNoPeriodo("2026-01-01", "2026-01-31")).toBe(1);
    expect(mesesNoPeriodo("2026-11-01", "2027-02-28")).toBe(4);
  });
});
