import { describe, it, expect } from "vitest";
import { etapaAdjacente, resumoFunil, rotuloEtapa, ETAPAS_ATIVAS } from "@/lib/comercial/funil";

describe("etapaAdjacente", () => {
  it("navega entre ativas", () => {
    expect(etapaAdjacente("contato", "anterior")).toBe("novo");
    expect(etapaAdjacente("proposta", "proxima")).toBe("negociacao");
  });
  it("bordas → null", () => {
    expect(etapaAdjacente("novo", "anterior")).toBe(null);
    expect(etapaAdjacente("negociacao", "proxima")).toBe(null);
  });
  it("terminais → null", () => {
    expect(etapaAdjacente("ganho", "anterior")).toBe(null);
    expect(etapaAdjacente("perdido", "proxima")).toBe(null);
  });
});

describe("resumoFunil", () => {
  it("conta e soma por etapa, null=0", () => {
    const r = resumoFunil([
      { etapa: "novo", valorEstimado: 300 },
      { etapa: "novo", valorEstimado: null },
      { etapa: "proposta", valorEstimado: 500 },
      { etapa: "ganho", valorEstimado: 999 },
    ]);
    expect(r.novo).toEqual({ qtd: 2, total: 300 });
    expect(r.proposta).toEqual({ qtd: 1, total: 500 });
    expect(r.negociacao).toEqual({ qtd: 0, total: 0 });
    expect(r.ganho).toBeUndefined();
  });
});

describe("rotuloEtapa / ETAPAS_ATIVAS", () => {
  it("rótulos", () => {
    expect(rotuloEtapa("negociacao")).toBe("Negociação");
    expect(ETAPAS_ATIVAS.map((e) => e.chave)).toEqual(["novo", "contato", "proposta", "negociacao"]);
  });
});
