import { describe, it, expect } from "vitest";
import { DEPARTAMENTOS } from "@/lib/clientes/departamentos";
import { podeGerenciarResponsaveis } from "@/lib/clientes/permissoes";

describe("DEPARTAMENTOS", () => {
  it("cobre os quatro departamentos do enum", () => {
    expect(DEPARTAMENTOS.map((d) => d.valor)).toEqual(["contabil", "fiscal", "pessoal", "societario"]);
    expect(DEPARTAMENTOS.every((d) => d.rotulo.length > 0)).toBe(true);
  });
});

describe("podeGerenciarResponsaveis", () => {
  it("admin e assistente podem", () => {
    expect(podeGerenciarResponsaveis("admin")).toBe(true);
    expect(podeGerenciarResponsaveis("assistente")).toBe(true);
  });
  it("contador e financeiro não (gerência/redistribuição em massa)", () => {
    expect(podeGerenciarResponsaveis("contador")).toBe(false);
    expect(podeGerenciarResponsaveis("financeiro")).toBe(false);
    expect(podeGerenciarResponsaveis(undefined)).toBe(false);
  });
});
