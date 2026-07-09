import { describe, it, expect } from "vitest";
import { cutoffCompetencia } from "@/lib/obrigacoes/geracao";

describe("cutoffCompetencia", () => {
  it("usa a competência inicial quando existe", () => {
    expect(cutoffCompetencia("2026-03-01", "2025-01-15")).toBe("2026-03-01");
  });
  it("cai para o mês da data de início quando não há competência inicial", () => {
    expect(cutoffCompetencia(null, "2026-03-15")).toBe("2026-03-01");
  });
  it("sem nenhum → null (sem restrição)", () => {
    expect(cutoffCompetencia(null, null)).toBeNull();
  });
});
