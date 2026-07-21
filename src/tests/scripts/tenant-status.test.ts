import { describe, it, expect } from "vitest";
import { compararVersao, classificar, resumo } from "../../../scripts/_tenant-status.mjs";

describe("compararVersao", () => {
  it("compara semver numericamente", () => {
    expect(compararVersao("6.63.0", "6.62.0")).toBeGreaterThan(0);
    expect(compararVersao("6.62.0", "6.63.0")).toBeLessThan(0);
    expect(compararVersao("6.63.0", "6.63.0")).toBe(0);
  });
  it("tolera prefixo v e comparação de minor de dois dígitos", () => {
    expect(compararVersao("v6.63.0", "6.63.0")).toBe(0);
    expect(compararVersao("6.9.0", "6.10.0")).toBeLessThan(0);
  });
});

describe("classificar", () => {
  it("sem resposta => fora do ar", () => {
    expect(classificar({ ok: false, versao: null }, "6.63.0")).toBe("fora do ar");
  });
  it("versão abaixo do esperado => desatualizado", () => {
    expect(classificar({ ok: true, versao: "6.62.0" }, "6.63.0")).toBe("desatualizado");
  });
  it("versão no esperado (ou acima) => atualizado", () => {
    expect(classificar({ ok: true, versao: "6.63.0" }, "6.63.0")).toBe("atualizado");
  });
  it("sem esperado => ok", () => {
    expect(classificar({ ok: true, versao: "6.63.0" }, null)).toBe("ok");
  });
});

describe("resumo", () => {
  it("conta fora do ar e desatualizados", () => {
    const r = resumo([{ status: "atualizado" }, { status: "fora do ar" }, { status: "desatualizado" }]);
    expect(r).toEqual({ total: 3, fora: 1, desatualizados: 1 });
  });
});
