import { describe, it, expect } from "vitest";
import { requerAprovacao, podeAprovar } from "@/lib/financeiro/aprovacao";

describe("requerAprovacao", () => {
  it("sem alçada nunca requer", () => expect(requerAprovacao(9999, null)).toBe(false));
  it("acima da alçada requer", () => expect(requerAprovacao(1001, 1000)).toBe(true));
  it("igual ou abaixo não requer", () => {
    expect(requerAprovacao(1000, 1000)).toBe(false);
    expect(requerAprovacao(500, 1000)).toBe(false);
  });
});

describe("podeAprovar", () => {
  it("não-admin nunca aprova", () => expect(podeAprovar("financeiro", "u1", "u2")).toBe(false));
  it("admin não aprova a própria (segregação)", () => expect(podeAprovar("admin", "u1", "u1")).toBe(false));
  it("admin diferente do lançador aprova", () => expect(podeAprovar("admin", "u1", "u2")).toBe(true));
  it("criadoPor null: admin aprova", () => expect(podeAprovar("admin", "u1", null)).toBe(true));
});
