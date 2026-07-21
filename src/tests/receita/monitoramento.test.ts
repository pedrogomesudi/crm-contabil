import { describe, it, expect } from "vitest";
import { detectarMudancas } from "@/lib/receita/monitoramento";

const est = (situacao: string | null, optanteSimples: boolean | null = null) => ({ situacao, optanteSimples });

describe("detectarMudancas — situação", () => {
  it("1ª observação ATIVA não gera alerta", () => {
    expect(detectarMudancas(est(null), est("ATIVA"))).toEqual([]);
  });
  it("1ª observação INAPTA gera alerta (de '—')", () => {
    const r = detectarMudancas(est(null), est("INAPTA"));
    expect(r).toEqual([{ tipo: "situacao", de: "—", para: "INAPTA" }]);
  });
  it("transição ATIVA→INAPTA gera alerta", () => {
    expect(detectarMudancas(est("ATIVA"), est("INAPTA"))).toEqual([{ tipo: "situacao", de: "ATIVA", para: "INAPTA" }]);
  });
  it("sem mudança não gera alerta", () => {
    expect(detectarMudancas(est("INAPTA"), est("INAPTA"))).toEqual([]);
  });
  it("ignora diferença só de caixa/espaço", () => {
    expect(detectarMudancas(est("ativa "), est("ATIVA"))).toEqual([]);
  });
});

describe("detectarMudancas — Simples", () => {
  it("exclusão do Simples (true→false) gera alerta", () => {
    expect(detectarMudancas(est("ATIVA", true), est("ATIVA", false))).toEqual([
      { tipo: "simples", de: "Sim", para: "Não" },
    ]);
  });
  it("primeira observação do Simples (baseline) não gera alerta", () => {
    expect(detectarMudancas(est("ATIVA", null), est("ATIVA", true))).toEqual([]);
  });
  it("sem mudança no Simples não gera alerta", () => {
    expect(detectarMudancas(est("ATIVA", true), est("ATIVA", true))).toEqual([]);
  });
});
