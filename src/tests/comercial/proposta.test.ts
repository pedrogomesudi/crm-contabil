import { describe, it, expect } from "vitest";
import { totaisProposta } from "@/lib/comercial/proposta";

describe("totaisProposta", () => {
  it("soma por recorrência", () => {
    expect(
      totaisProposta([
        { valor: 300, recorrencia: "mensal" },
        { valor: 200, recorrencia: "mensal" },
        { valor: 1000, recorrencia: "unico" },
      ]),
    ).toEqual({ mensal: 500, unico: 1000 });
  });
  it("lista vazia → zeros", () => {
    expect(totaisProposta([])).toEqual({ mensal: 0, unico: 0 });
  });
});
