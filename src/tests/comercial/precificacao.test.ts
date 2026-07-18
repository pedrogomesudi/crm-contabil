import { describe, it, expect } from "vitest";
import { acrescimoFator, multiplicador, calcularHonorario, type ConfigPreco } from "@/lib/comercial/precificacao";

const faixas = {
  modo: "faixas" as const,
  valorUnitario: 0,
  franquia: 0,
  faixas: [
    { ate: 50000, valor: 0 },
    { ate: 200000, valor: 150 },
    { ate: null, valor: 400 },
  ],
};
const unidade = { modo: "unidade" as const, valorUnitario: 25, franquia: 5, faixas: [] };
const semAcrescimo = { modo: "faixas" as const, valorUnitario: 0, franquia: 0, faixas: [{ ate: null, valor: 0 }] };

describe("acrescimoFator", () => {
  it("faixas: pega a primeira faixa cuja 'ate' cobre o valor; a última (∞) é o resto", () => {
    expect(acrescimoFator(faixas, 30000)).toBe(0);
    expect(acrescimoFator(faixas, 120000)).toBe(150);
    expect(acrescimoFator(faixas, 900000)).toBe(400);
  });
  it("unidade: valorUnitario × (valor acima da franquia)", () => {
    expect(acrescimoFator(unidade, 3)).toBe(0); // abaixo da franquia
    expect(acrescimoFator(unidade, 8)).toBe(75); // (8-5)*25
  });
});

describe("multiplicador", () => {
  it("acha pelo id; 1 se não houver", () => {
    const cs = [{ id: "c1", multiplicador: 1.2 }];
    expect(multiplicador(cs, "c1")).toBe(1.2);
    expect(multiplicador(cs, null)).toBe(1);
    expect(multiplicador(cs, "x")).toBe(1);
  });
});

const cfg: ConfigPreco = {
  baseRegime: { Simples: 500, Presumido: 800 },
  faturamento: faixas,
  funcionarios: unidade,
  notas: semAcrescimo,
  complexidades: [{ id: "media", multiplicador: 1.2 }],
  servicos: [
    { id: "folha", valor: 200, recorrencia: "mensal" },
    { id: "abertura", valor: 900, recorrencia: "unico" },
  ],
  valorMinimo: 400,
  descontoMaximoPct: 20,
};

describe("calcularHonorario", () => {
  it("compõe base + acréscimos × complexidade + serviços − desconto, com piso depois", () => {
    const r = calcularHonorario(
      {
        regime: "Simples",
        faturamento: 120000,
        funcionarios: 8,
        notas: 0,
        complexidadeId: "media",
        servicoIds: ["folha", "abertura"],
        descontoPct: 10,
      },
      cfg,
    );
    // base 500 + fat 150 + func (8-5)*25=75 + notas 0 = 725; ×1.2 = 870; + folha 200 = 1070;
    // desconto 10% = 107 → 963; piso 400 não incide. unico = 900.
    expect(r.mensal).toBeCloseTo(963);
    expect(r.unico).toBeCloseTo(900);
  });
  it("desconto respeita o teto e o piso é o chão final", () => {
    const r = calcularHonorario(
      { regime: "Simples", faturamento: 10000, funcionarios: 0, notas: 0, complexidadeId: null, servicoIds: [], descontoPct: 90 },
      cfg,
    );
    // base 500; ×1 = 500; desconto limitado a 20% = 100 → 400; piso 400 → 400.
    expect(r.mensal).toBeCloseTo(400);
  });
  it("regime sem base cai em 0 e o piso garante o mínimo", () => {
    const r = calcularHonorario(
      { regime: "Inexistente", faturamento: 0, funcionarios: 0, notas: 0, complexidadeId: null, servicoIds: [], descontoPct: 0 },
      cfg,
    );
    expect(r.mensal).toBeCloseTo(400); // 0 → piso
  });
});
