import { describe, it, expect } from "vitest";
import { slugify, alvoTroca } from "@/lib/onboarding/template-util";

describe("slugify", () => {
  it("acentos, espaços e símbolos", () => {
    expect(slugify("Abertura Simples")).toBe("abertura-simples");
    expect(slugify("Alteração de Quadro!")).toBe("alteracao-de-quadro");
    expect(slugify("  Baixa / Encerramento  ")).toBe("baixa-encerramento");
  });
});

describe("alvoTroca", () => {
  const itens = [
    { id: "a", ordem: 1 },
    { id: "b", ordem: 5 },
    { id: "c", ordem: 9 },
  ];
  it("meio: cima/baixo", () => {
    expect(alvoTroca(itens, "b", "cima")).toBe("a");
    expect(alvoTroca(itens, "b", "baixo")).toBe("c");
  });
  it("bordas → null", () => {
    expect(alvoTroca(itens, "a", "cima")).toBe(null);
    expect(alvoTroca(itens, "c", "baixo")).toBe(null);
  });
  it("id ausente → null", () => {
    expect(alvoTroca(itens, "x", "cima")).toBe(null);
  });
});
