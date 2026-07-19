import { describe, it, expect } from "vitest";
import { mesesEfetivos, descreverRetencao } from "@/lib/documentos/retencao";

describe("mesesEfetivos", () => {
  it("o tipo vence o global", () => expect(mesesEfetivos(24, 60)).toBe(24));
  it("null cai no global", () => expect(mesesEfetivos(null, 60)).toBe(60));
});

describe("descreverRetencao", () => {
  it("com prazo do tipo", () => expect(descreverRetencao(24, 60)).toBe("24 meses"));
  it("sem prazo do tipo usa o global (padrão)", () => expect(descreverRetencao(null, 60)).toBe("60 meses (padrão)"));
});
