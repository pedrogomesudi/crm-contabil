import { describe, it, expect } from "vitest";
import { slugModelo } from "@/lib/legalizacao/modelo";

describe("slugModelo", () => {
  it("kebab sem acento", () => {
    expect(slugModelo("Abertura Simples Nacional", [])).toBe("abertura-simples-nacional");
  });
  it("resolve colisão", () => {
    expect(slugModelo("Baixa", ["baixa"])).toBe("baixa-2");
    expect(slugModelo("Baixa", ["baixa", "baixa-2"])).toBe("baixa-3");
  });
  it("fallback quando vazio", () => {
    expect(slugModelo("", [])).toMatch(/^modelo/);
  });
});
