import { describe, it, expect } from "vitest";
import { podeGerenciarFinanceiro, podeLerCatalogo } from "@/lib/financeiro/permissoes";

describe("podeGerenciarFinanceiro", () => {
  it("permite admin e financeiro", () => {
    expect(podeGerenciarFinanceiro("admin")).toBe(true);
    expect(podeGerenciarFinanceiro("financeiro")).toBe(true);
  });
  it("nega contador, assistente e undefined", () => {
    expect(podeGerenciarFinanceiro("contador")).toBe(false);
    expect(podeGerenciarFinanceiro("assistente")).toBe(false);
    expect(podeGerenciarFinanceiro(undefined)).toBe(false);
  });
});

describe("podeLerCatalogo", () => {
  it("permite admin, financeiro e contador", () => {
    expect(podeLerCatalogo("admin")).toBe(true);
    expect(podeLerCatalogo("financeiro")).toBe(true);
    expect(podeLerCatalogo("contador")).toBe(true);
  });
  it("nega assistente e undefined", () => {
    expect(podeLerCatalogo("assistente")).toBe(false);
    expect(podeLerCatalogo(undefined)).toBe(false);
  });
});
