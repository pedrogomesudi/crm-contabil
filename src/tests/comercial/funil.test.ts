import { describe, it, expect } from "vitest";
import { rotuloEtapa, etapaAdjacente, resumoFunil, diasNaEtapa, corDias, type Etapa } from "@/lib/comercial/funil";

const ETAPAS: Etapa[] = [
  { id: "e1", rotulo: "Novo", ordem: 1, cor: "#000", probabilidade: 0.2 },
  { id: "e2", rotulo: "Contato feito", ordem: 2, cor: "#000", probabilidade: 0.4 },
  { id: "e3", rotulo: "Proposta enviada", ordem: 3, cor: "#000", probabilidade: 0.6 },
];

describe("rotuloEtapa", () => {
  it("etapa ativa → rótulo da lista; terminal → Ganho/Perdido", () => {
    expect(rotuloEtapa("e2", ETAPAS)).toBe("Contato feito");
    expect(rotuloEtapa("ganho", ETAPAS)).toBe("Ganho");
    expect(rotuloEtapa("perdido", ETAPAS)).toBe("Perdido");
    expect(rotuloEtapa("inexistente", ETAPAS)).toBe("—");
  });
});

describe("etapaAdjacente", () => {
  it("anda na ordem das etapas ativas; extremos → null", () => {
    expect(etapaAdjacente("e2", ETAPAS, "anterior")).toBe("e1");
    expect(etapaAdjacente("e2", ETAPAS, "proxima")).toBe("e3");
    expect(etapaAdjacente("e1", ETAPAS, "anterior")).toBeNull();
    expect(etapaAdjacente("e3", ETAPAS, "proxima")).toBeNull();
  });
});

describe("resumoFunil", () => {
  it("agrega qtd e total por etapa ativa", () => {
    const r = resumoFunil(
      [
        { etapa: "e1", valorEstimado: 100 },
        { etapa: "e1", valorEstimado: 50 },
        { etapa: "e3", valorEstimado: 200 },
        { etapa: "ganho", valorEstimado: 999 }, // terminal: ignorado
      ],
      ETAPAS,
    );
    expect(r["e1"]).toEqual({ qtd: 2, total: 150 });
    expect(r["e3"]).toEqual({ qtd: 1, total: 200 });
    expect(r["e2"]).toEqual({ qtd: 0, total: 0 });
  });
});

describe("diasNaEtapa / corDias", () => {
  it("conta dias inteiros entre etapa_desde e agora", () => {
    expect(diasNaEtapa("2026-07-10T12:00:00Z", "2026-07-12T12:00:00Z")).toBe(2);
    expect(diasNaEtapa("2026-07-12T12:00:00Z", "2026-07-12T18:00:00Z")).toBe(0);
  });
  it("cor semântica por faixa", () => {
    expect(corDias(1)).toBe("recente");
    expect(corDias(6)).toBe("atencao");
    expect(corDias(15)).toBe("parado");
  });
});
