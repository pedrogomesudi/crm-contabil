import { describe, it, expect } from "vitest";
import { totalPaginas, paginaValida, intervaloPagina } from "@/lib/ui/paginacao";

describe("totalPaginas", () => {
  it("arredonda para cima", () => {
    expect(totalPaginas(0, 100)).toBe(1); // sem resultado ainda é "página 1 de 1"
    expect(totalPaginas(1, 100)).toBe(1);
    expect(totalPaginas(100, 100)).toBe(1);
    expect(totalPaginas(101, 100)).toBe(2);
    expect(totalPaginas(650, 100)).toBe(7);
  });
});

describe("paginaValida", () => {
  it("fora do intervalo volta para a borda mais próxima", () => {
    expect(paginaValida("0", 7)).toBe(1);
    expect(paginaValida("-3", 7)).toBe(1);
    expect(paginaValida("99", 7)).toBe(7);
  });
  it("lixo na URL não derruba a tela", () => {
    expect(paginaValida(undefined, 7)).toBe(1);
    expect(paginaValida("abc", 7)).toBe(1);
    expect(paginaValida("2x", 7)).toBe(1);
    expect(paginaValida("1e9", 7)).toBe(1);
  });
  it("página válida passa", () => {
    expect(paginaValida("3", 7)).toBe(3);
  });
});

describe("intervaloPagina", () => {
  it("traduz página em range do Supabase (inclusivo dos dois lados)", () => {
    expect(intervaloPagina(1, 100)).toEqual({ de: 0, ate: 99 });
    expect(intervaloPagina(2, 100)).toEqual({ de: 100, ate: 199 });
    expect(intervaloPagina(7, 100)).toEqual({ de: 600, ate: 699 });
  });
});
