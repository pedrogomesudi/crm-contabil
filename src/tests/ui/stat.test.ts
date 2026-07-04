import { describe, it, expect } from "vitest";
import { corValorStat } from "@/lib/ui/stat";

describe("corValorStat", () => {
  it("mapeia variante → classe de cor", () => {
    expect(corValorStat("positivo")).toBe("text-verde");
    expect(corValorStat("destaque")).toBe("text-violeta");
    expect(corValorStat("negativo")).toBe("text-negativo");
    expect(corValorStat("neutro")).toBe("text-texto");
  });
});
