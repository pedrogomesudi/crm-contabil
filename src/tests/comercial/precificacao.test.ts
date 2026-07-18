import { describe, it, expect } from "vitest";
import {
  acrescimoFator,
  multiplicador,
  calcularHonorario,
  paraConfigPreco,
  type ConfigPreco,
} from "@/lib/comercial/precificacao";

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
      {
        regime: "Simples",
        faturamento: 10000,
        funcionarios: 0,
        notas: 0,
        complexidadeId: null,
        servicoIds: [],
        descontoPct: 90,
      },
      cfg,
    );
    // base 500; ×1 = 500; desconto limitado a 20% = 100 → 400; piso 400 → 400.
    expect(r.mensal).toBeCloseTo(400);
  });
  it("regime sem base cai em 0 e o piso garante o mínimo", () => {
    const r = calcularHonorario(
      {
        regime: "Inexistente",
        faturamento: 0,
        funcionarios: 0,
        notas: 0,
        complexidadeId: null,
        servicoIds: [],
        descontoPct: 0,
      },
      cfg,
    );
    expect(r.mensal).toBeCloseTo(400); // 0 → piso
  });
});

describe("paraConfigPreco", () => {
  const entrada = {
    regimes: [{ regime: "Simples", valorBase: 500 }],
    fatores: [
      { fator: "faturamento", modo: "faixas", valorUnitario: 0, franquia: 0, faixas: [{ ate: null, valor: 100 }] },
      { fator: "funcionarios", modo: "unidade", valorUnitario: 25, franquia: 5, faixas: [] },
      { fator: "notas", modo: "faixas", valorUnitario: 0, franquia: 0, faixas: [] },
    ],
    complexidades: [{ id: "c1", multiplicador: 1.2 }],
    servicos: [{ id: "s1", valor: 200, recorrencia: "mensal" }],
    global: { valorMinimo: 400, descontoMaximoPct: 20 },
  };
  it("monta o ConfigPreco que o motor consome", () => {
    const cfg = paraConfigPreco(entrada);
    expect(cfg.baseRegime).toEqual({ Simples: 500 });
    expect(cfg.faturamento.modo).toBe("faixas");
    expect(cfg.funcionarios.modo).toBe("unidade");
    expect(cfg.funcionarios.valorUnitario).toBe(25);
    expect(cfg.servicos[0]).toEqual({ id: "s1", valor: 200, recorrencia: "mensal" });
    expect(cfg.valorMinimo).toBe(400);
    expect(cfg.descontoMaximoPct).toBe(20);
  });
  it("fator ausente vira um Fator neutro (faixas vazias)", () => {
    const cfg = paraConfigPreco({ ...entrada, fatores: [] });
    expect(cfg.faturamento).toEqual({ modo: "faixas", valorUnitario: 0, franquia: 0, faixas: [] });
  });
  it("recorrência/modo desconhecidos caem em padrão seguro", () => {
    const cfg = paraConfigPreco({
      ...entrada,
      fatores: [{ fator: "faturamento", modo: "xxx", valorUnitario: 0, franquia: 0, faixas: [] }],
      servicos: [{ id: "s1", valor: 10, recorrencia: "xxx" }],
    });
    expect(cfg.faturamento.modo).toBe("faixas"); // modo desconhecido → faixas
    expect(cfg.servicos[0]!.recorrencia).toBe("unico"); // ≠ 'mensal' → unico
  });
});
