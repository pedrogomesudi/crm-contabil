import { describe, it, expect } from "vitest";
import { nivelEscalonamento, escaladoParaUsuario, type Cadeia } from "@/lib/obrigacoes/escalonamento";

describe("nivelEscalonamento", () => {
  it("classifica pelos limiares (7/15)", () => {
    expect(nivelEscalonamento(6, 7, 15)).toBe(0);
    expect(nivelEscalonamento(7, 7, 15)).toBe(1);
    expect(nivelEscalonamento(14, 7, 15)).toBe(1);
    expect(nivelEscalonamento(15, 7, 15)).toBe(2);
  });
});

describe("escaladoParaUsuario", () => {
  const cadeia: Cadeia = { liderId: "L", socioId: "S" };
  it("líder vê nível >= 1", () => {
    expect(escaladoParaUsuario(1, cadeia, "L")).toBe(true);
    expect(escaladoParaUsuario(2, cadeia, "L")).toBe(true);
    expect(escaladoParaUsuario(0, cadeia, "L")).toBe(false);
  });
  it("sócio só vê nível 2", () => {
    expect(escaladoParaUsuario(2, cadeia, "S")).toBe(true);
    expect(escaladoParaUsuario(1, cadeia, "S")).toBe(false);
  });
  it("sócio nulo não quebra; fora da cadeia não vê", () => {
    expect(escaladoParaUsuario(2, { liderId: "L", socioId: null }, "L")).toBe(true);
    expect(escaladoParaUsuario(2, { liderId: "L", socioId: null }, "X")).toBe(false);
    expect(escaladoParaUsuario(2, cadeia, "X")).toBe(false);
  });
});
