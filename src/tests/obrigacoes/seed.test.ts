import { describe, it, expect } from "vitest";
import { MATRIZ_PADRAO } from "@/lib/obrigacoes/seed";

describe("MATRIZ_PADRAO", () => {
  it("tem códigos únicos e campos coerentes", () => {
    const codigos = MATRIZ_PADRAO.map((o) => o.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    for (const o of MATRIZ_PADRAO) {
      expect(o.vencDia).toBeGreaterThanOrEqual(1);
      expect(o.vencDia).toBeLessThanOrEqual(31);
      if (o.periodicidade === "anual") expect(o.vencMes).not.toBeNull();
    }
  });
  it("inclui PGDAS-D mensal para Simples", () => {
    const p = MATRIZ_PADRAO.find((o) => o.codigo === "PGDAS-D");
    expect(p?.periodicidade).toBe("mensal");
    expect(p?.aplicavelA).toContain("simples_sem_func");
  });
});
