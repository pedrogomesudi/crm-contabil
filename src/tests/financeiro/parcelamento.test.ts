import { describe, it, expect } from "vitest";
import { parcelas, somarMeses } from "@/lib/financeiro/parcelamento";

describe("somarMeses", () => {
  it("soma meses mantendo o dia; clampa fim de mês", () => {
    expect(somarMeses("2026-01-15", 1)).toBe("2026-02-15");
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2026-11-10", 2)).toBe("2027-01-10");
  });
});

describe("parcelas", () => {
  it("rateia com ajuste do centavo na última; vencimentos e competências mensais", () => {
    const p = parcelas(100, 3, "2026-01-10", "2026-01-01");
    expect(p).toHaveLength(3);
    expect(p.map((x) => x.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(p.reduce((s, x) => s + x.valor, 0)).toBeCloseTo(100, 2);
    expect(p[0]).toMatchObject({ parcela: 1, vencimento: "2026-01-10", competencia: "2026-01-01" });
    expect(p[1]).toMatchObject({ parcela: 2, vencimento: "2026-02-10", competencia: "2026-02-01" });
    expect(p[2]).toMatchObject({ parcela: 3, vencimento: "2026-03-10", competencia: "2026-03-01" });
  });
});
