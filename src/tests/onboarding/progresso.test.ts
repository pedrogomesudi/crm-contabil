import { describe, it, expect } from "vitest";
import { progressoOnboarding, agruparPorCategoria, proximoPrazo, type ItemOnb } from "@/lib/onboarding/progresso";

const item = (over: Partial<ItemOnb>): ItemOnb => ({ id: "x", categoria: "documento", nome: "Doc", obrigatorio: true, ordem: 0, status: "pendente", prazo: null, ...over });

describe("progressoOnboarding", () => {
  it("vazio", () => {
    expect(progressoOnboarding([])).toEqual({ total: 0, concluidos: 0, obrigatoriosPendentes: 0, pct: 0, concluido: false });
  });
  it("parcial", () => {
    const p = progressoOnboarding([item({ status: "concluido" }), item({ status: "pendente" })]);
    expect(p).toMatchObject({ total: 2, concluidos: 1, obrigatoriosPendentes: 1, pct: 50, concluido: false });
  });
  it("concluído quando todos obrigatórios ok/dispensado", () => {
    const p = progressoOnboarding([item({ status: "concluido" }), item({ obrigatorio: false, status: "pendente" }), item({ status: "dispensado" })]);
    expect(p.concluido).toBe(true);
  });
});

describe("agruparPorCategoria", () => {
  it("ordem das categorias + ordem interna", () => {
    const g = agruparPorCategoria([item({ categoria: "acesso", ordem: 2 }), item({ categoria: "documento", ordem: 1 }), item({ categoria: "acesso", ordem: 1 })]);
    expect(g.map((x) => x.categoria)).toEqual(["documento", "acesso"]);
    expect(g[1].itens.map((i) => i.ordem)).toEqual([1, 2]);
  });
});

describe("proximoPrazo", () => {
  it("menor prazo entre pendentes", () => {
    expect(proximoPrazo([item({ status: "pendente", prazo: "2026-08-10" }), item({ status: "concluido", prazo: "2026-07-01" }), item({ status: "pendente", prazo: "2026-07-20" })])).toBe("2026-07-20");
  });
  it("sem prazos pendentes → null", () => {
    expect(proximoPrazo([item({ status: "concluido", prazo: "2026-07-01" })])).toBe(null);
  });
});
