import { describe, it, expect } from "vitest";
import { periodoBounds, metricasFunil } from "@/lib/comercial/metricas";
import type { Etapa } from "@/lib/comercial/funil";

const ETAPAS: Etapa[] = [
  { id: "e1", rotulo: "Novo", ordem: 1, cor: "#000", probabilidade: 0.2 },
  { id: "e2", rotulo: "Contato feito", ordem: 2, cor: "#000", probabilidade: 0.4 },
  { id: "e3", rotulo: "Proposta enviada", ordem: 3, cor: "#000", probabilidade: 0.6 },
  { id: "e4", rotulo: "Negociação", ordem: 4, cor: "#000", probabilidade: 0.8 },
];

describe("periodoBounds", () => {
  it("mês atual", () => {
    const r = periodoBounds("mes", "2026-07-08", 0);
    expect(r.inicio).toBe("2026-07-01T00:00:00.000Z");
    expect(r.fim).toBe("2026-08-01T00:00:00.000Z");
    expect(r.rotulo).toBe("Julho 2026");
  });
  it("mês anterior cruza o ano", () => {
    const r = periodoBounds("mes", "2026-01-10", -1);
    expect(r.inicio).toBe("2025-12-01T00:00:00.000Z");
    expect(r.rotulo).toBe("Dezembro 2025");
  });
  it("trimestre", () => {
    const r = periodoBounds("trimestre", "2026-07-08", 0);
    expect(r.inicio).toBe("2026-07-01T00:00:00.000Z");
    expect(r.fim).toBe("2026-10-01T00:00:00.000Z");
    expect(r.rotulo).toBe("3º trimestre 2026");
  });
  it("semestre", () => {
    const r = periodoBounds("semestre", "2026-07-08", 0);
    expect(r.inicio).toBe("2026-07-01T00:00:00.000Z");
    expect(r.fim).toBe("2027-01-01T00:00:00.000Z");
    expect(r.rotulo).toBe("2º semestre 2026");
  });
  it("ano com offset", () => {
    const r = periodoBounds("ano", "2026-07-08", -1);
    expect(r.inicio).toBe("2025-01-01T00:00:00.000Z");
    expect(r.fim).toBe("2026-01-01T00:00:00.000Z");
    expect(r.rotulo).toBe("2025");
  });
});

describe("metricasFunil", () => {
  const ops = [
    { etapa: "e1", valorEstimado: 300, responsavelNome: "Ana", motivoPerda: null, fechadoEm: null },
    { etapa: "e3", valorEstimado: 500, responsavelNome: "Ana", motivoPerda: null, fechadoEm: null },
    {
      etapa: "ganho",
      valorEstimado: 1000,
      responsavelNome: "Ana",
      motivoPerda: null,
      fechadoEm: "2026-07-10T00:00:00.000Z",
    },
    {
      etapa: "perdido",
      valorEstimado: 200,
      responsavelNome: "Beto",
      motivoPerda: "Preço",
      fechadoEm: "2026-07-12T00:00:00.000Z",
    },
    {
      etapa: "ganho",
      valorEstimado: 400,
      responsavelNome: "Beto",
      motivoPerda: null,
      fechadoEm: "2026-06-30T00:00:00.000Z",
    },
  ];
  const m = metricasFunil(ops, ETAPAS, "2026-07-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z");
  it("pipeline ignora período", () => {
    expect(m.pipeline.total).toEqual({ qtd: 2, total: 800 });
    expect(m.pipeline.porEtapa.e3).toEqual({ qtd: 1, total: 500 });
    expect(m.pipeline.porEtapa.e4).toEqual({ qtd: 0, total: 0 });
  });
  it("fechados no período + taxa", () => {
    expect(m.periodo.ganhos).toEqual({ qtd: 1, valor: 1000 });
    expect(m.periodo.perdidos).toEqual({ qtd: 1, valor: 200 });
    expect(m.periodo.taxaConversao).toBeCloseTo(0.5);
  });
  it("por responsável e motivos", () => {
    const ana = m.periodo.porResponsavel.find((r) => r.nome === "Ana");
    expect(ana).toEqual({ nome: "Ana", ganhos: 1, perdidos: 0, valorGanho: 1000 });
    expect(m.periodo.motivosPerda).toEqual([{ motivo: "Preço", qtd: 1 }]);
  });
});
