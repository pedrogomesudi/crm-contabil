import { describe, it, expect } from "vitest";
import { normalizarFiltro, aplicarFiltroStatus } from "@/lib/clientes/filtroStatus";

// Duble do PostgrestFilterBuilder: registra as chamadas e devolve a si mesmo.
function fakeBuilder() {
  const calls: unknown[][] = [];
  const b = {
    calls,
    eq(...a: unknown[]) {
      calls.push(["eq", ...a]);
      return b;
    },
    is(...a: unknown[]) {
      calls.push(["is", ...a]);
      return b;
    },
    not(...a: unknown[]) {
      calls.push(["not", ...a]);
      return b;
    },
  };
  return b;
}

describe("normalizarFiltro", () => {
  it("aceita os valores válidos", () => {
    expect(normalizarFiltro("ativo")).toBe("ativo");
    expect(normalizarFiltro("inativo")).toBe("inativo");
    expect(normalizarFiltro("excluido")).toBe("excluido");
    expect(normalizarFiltro("")).toBe("");
  });
  it("mapeia inválido/ausente para ''", () => {
    expect(normalizarFiltro("qualquer")).toBe("");
    expect(normalizarFiltro(undefined)).toBe("");
  });
});

describe("aplicarFiltroStatus", () => {
  it("'' esconde excluídos", () => {
    const b = fakeBuilder();
    aplicarFiltroStatus(b, "");
    expect(b.calls).toEqual([["is", "excluido_em", null]]);
  });
  it("'ativo' filtra status e esconde excluídos", () => {
    const b = fakeBuilder();
    aplicarFiltroStatus(b, "ativo");
    expect(b.calls).toEqual([
      ["eq", "status", "ativo"],
      ["is", "excluido_em", null],
    ]);
  });
  it("'inativo' filtra status e esconde excluídos", () => {
    const b = fakeBuilder();
    aplicarFiltroStatus(b, "inativo");
    expect(b.calls).toEqual([
      ["eq", "status", "inativo"],
      ["is", "excluido_em", null],
    ]);
  });
  it("'excluido' traz só os excluídos", () => {
    const b = fakeBuilder();
    aplicarFiltroStatus(b, "excluido");
    expect(b.calls).toEqual([["not", "excluido_em", "is", null]]);
  });
});
