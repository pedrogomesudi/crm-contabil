import { describe, it, expect } from "vitest";
import { consolidarRelacionadas, validarNovaMatriz } from "@/lib/clientes/vinculos";

describe("consolidarRelacionadas", () => {
  it("dedup por clienteId e acumula tipos", () => {
    const r = consolidarRelacionadas("self", [
      { tipo: "grupo", empresas: [{ clienteId: "b", nome: "B" }] },
      { tipo: "socio", empresas: [{ clienteId: "b", nome: "B" }, { clienteId: "c", nome: "C" }] },
    ]);
    expect(r).toEqual([
      { clienteId: "b", nome: "B", tipos: ["grupo", "socio"] },
      { clienteId: "c", nome: "C", tipos: ["socio"] },
    ]);
  });

  it("exclui o próprio cliente", () => {
    const r = consolidarRelacionadas("self", [
      { tipo: "grupo", empresas: [{ clienteId: "self", nome: "Eu" }, { clienteId: "b", nome: "B" }] },
    ]);
    expect(r).toEqual([{ clienteId: "b", nome: "B", tipos: ["grupo"] }]);
  });

  it("lista vazia quando não há fontes", () => {
    expect(consolidarRelacionadas("self", [])).toEqual([]);
  });
});

describe("validarNovaMatriz", () => {
  it("recusa o próprio cliente como matriz", () => {
    expect(validarNovaMatriz("a", "a", false)).toBe("Um cliente não pode ser a própria matriz.");
  });
  it("recusa uma filial como matriz", () => {
    expect(validarNovaMatriz("a", "b", true)).toBe("O cliente escolhido já é uma filial; escolha a matriz dele.");
  });
  it("aceita uma matriz válida", () => {
    expect(validarNovaMatriz("a", "b", false)).toBeNull();
  });
});
