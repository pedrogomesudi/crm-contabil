import { describe, it, expect } from "vitest";
import { resumoPipeline, cicloMedioDias } from "@/lib/comercial/metricas";
import type { Etapa } from "@/lib/comercial/funil";

const ETAPAS: Etapa[] = [
  { id: "e1", rotulo: "Novo", ordem: 1, cor: "#000", probabilidade: 0.2 },
  { id: "e2", rotulo: "Proposta", ordem: 2, cor: "#000", probabilidade: 0.5 },
];

const ops = [
  { etapa: "e1", valorEstimado: 100, criadoEm: "2026-07-01T00:00:00.000Z", fechadoEm: null },
  { etapa: "e2", valorEstimado: 200, criadoEm: "2026-07-01T00:00:00.000Z", fechadoEm: null },
  {
    etapa: "ganho",
    valorEstimado: 1000,
    criadoEm: "2026-07-01T00:00:00.000Z",
    fechadoEm: "2026-07-11T00:00:00.000Z", // 10 dias
  },
  {
    etapa: "perdido",
    valorEstimado: 300,
    criadoEm: "2026-07-01T00:00:00.000Z",
    fechadoEm: "2026-07-05T00:00:00.000Z",
  },
];

describe("cicloMedioDias", () => {
  it("média de dias criado→fechado só dos ganhos", () => {
    expect(cicloMedioDias(ops)).toBe(10);
    expect(cicloMedioDias([])).toBe(0);
  });
});

describe("resumoPipeline", () => {
  const r = resumoPipeline(ops, ETAPAS);
  it("valor em pipeline = soma das ativas", () => {
    expect(r.valorPipeline).toBe(300); // 100 + 200
  });
  it("ponderado = Σ valor × probabilidade da etapa", () => {
    expect(r.valorPonderado).toBeCloseTo(120); // 100*0.2 + 200*0.5
  });
  it("taxa de conversão sobre todos os fechados", () => {
    expect(r.taxaConversao).toBeCloseTo(0.5); // 1 ganho / (1 ganho + 1 perdido)
  });
  it("ciclo médio", () => {
    expect(r.cicloMedioDias).toBe(10);
  });
});
