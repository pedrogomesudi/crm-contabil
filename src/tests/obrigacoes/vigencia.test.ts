import { describe, it, expect } from "vitest";
import { regimeEm, type VigenciaRegime } from "@/lib/obrigacoes/vigencia";

const vigencias: VigenciaRegime[] = [
  { vigenteDe: "2025-10-01", regime: "Simples" },
  { vigenteDe: "2026-03-01", regime: "Presumido" },
];

describe("regimeEm", () => {
  it("usa o regime vigente na competência", () => {
    expect(regimeEm(vigencias, "2026-02")).toBe("Simples");
    expect(regimeEm(vigencias, "2026-03")).toBe("Presumido");
    expect(regimeEm(vigencias, "2026-09")).toBe("Presumido");
  });
  it("antes da primeira vigência, extrapola a primeira", () => {
    expect(regimeEm(vigencias, "2025-01")).toBe("Simples");
  });
  it("lista vazia devolve null (o chamador usa o regime atual)", () => {
    expect(regimeEm([], "2026-03")).toBeNull();
  });
});
