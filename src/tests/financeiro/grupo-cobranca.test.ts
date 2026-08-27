import { describe, it, expect } from "vitest";
import { somarHonorariosGrupo, montarObservacoesGrupo, type MembroGrupo } from "@/lib/financeiro/grupo-cobranca";

const m = (razao: string, cnpj: string, hon: number): MembroGrupo => ({
  clienteId: razao,
  razaoSocial: razao,
  cpfCnpj: cnpj,
  honorario: hon,
});

describe("somarHonorariosGrupo", () => {
  it("soma os honorários (2 casas)", () => {
    expect(somarHonorariosGrupo([m("A", "1", 200), m("B", "2", 300.15)])).toBe(500.15);
  });
  it("vazio = 0", () => {
    expect(somarHonorariosGrupo([])).toBe(0);
  });
});

describe("montarObservacoesGrupo", () => {
  it("uma linha por empresa, CNPJ formatado", () => {
    expect(montarObservacoesGrupo([m("ACME LTDA", "12345678000190", 100)])).toEqual(["ACME LTDA — 12.345.678/0001-90"]);
  });
  it("no limite não resume", () => {
    const membros = Array.from({ length: 5 }, (_, i) => m(`E${i}`, "12345678000190", 100));
    expect(montarObservacoesGrupo(membros, 5)).toHaveLength(5);
  });
  it("acima do limite resume o excedente", () => {
    const membros = Array.from({ length: 7 }, (_, i) => m(`E${i}`, "12345678000190", 100));
    const r = montarObservacoesGrupo(membros, 5);
    expect(r).toHaveLength(5);
    expect(r[4]).toBe("e mais 3 empresas");
  });
  it("resumo no singular com 1 excedente", () => {
    const membros = Array.from({ length: 6 }, (_, i) => m(`E${i}`, "12345678000190", 100));
    expect(montarObservacoesGrupo(membros, 5)[4]).toBe("e mais 2 empresas");
    expect(
      montarObservacoesGrupo(
        Array.from({ length: 3 }, (_, i) => m(`E${i}`, "1", 1)),
        2,
      )[1],
    ).toBe("e mais 2 empresas");
  });
});
