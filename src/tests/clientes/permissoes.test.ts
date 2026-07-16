import { describe, it, expect } from "vitest";
import { podeExcluirCliente, podeConfigurarNfse, podeGerenciarVencimentos } from "@/lib/clientes/permissoes";

describe("podeExcluirCliente", () => {
  it("permite apenas admin", () => {
    expect(podeExcluirCliente("admin")).toBe(true);
  });
  it("nega os demais papéis e undefined", () => {
    expect(podeExcluirCliente("financeiro")).toBe(false);
    expect(podeExcluirCliente("assistente")).toBe(false);
    expect(podeExcluirCliente("contador")).toBe(false);
    expect(podeExcluirCliente(undefined)).toBe(false);
  });
});

describe("podeConfigurarNfse", () => {
  it("permite apenas admin", () => {
    expect(podeConfigurarNfse("admin")).toBe(true);
    expect(podeConfigurarNfse("financeiro")).toBe(false);
    expect(podeConfigurarNfse("contador")).toBe(false);
    expect(podeConfigurarNfse(undefined)).toBe(false);
  });
});

describe("podeGerenciarVencimentos", () => {
  it("permite admin, assistente e contador", () => {
    expect(podeGerenciarVencimentos("admin")).toBe(true);
    expect(podeGerenciarVencimentos("assistente")).toBe(true);
    expect(podeGerenciarVencimentos("contador")).toBe(true);
  });
  it("nega financeiro e indefinido", () => {
    expect(podeGerenciarVencimentos("financeiro")).toBe(false);
    expect(podeGerenciarVencimentos(undefined)).toBe(false);
  });
});
