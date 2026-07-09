import { describe, it, expect } from "vitest";
import { mesesAte } from "@/lib/obrigacoes/retroativo";

describe("mesesAte", () => {
  it("lista o intervalo inclusive", () => {
    expect(mesesAte(2026, 4, 2026, 7)).toEqual([
      { ano: 2026, mes: 4 },
      { ano: 2026, mes: 5 },
      { ano: 2026, mes: 6 },
      { ano: 2026, mes: 7 },
    ]);
  });
  it("atravessa a virada de ano", () => {
    expect(mesesAte(2025, 11, 2026, 1)).toEqual([
      { ano: 2025, mes: 11 },
      { ano: 2025, mes: 12 },
      { ano: 2026, mes: 1 },
    ]);
  });
  it("início depois do fim → só o fim", () => {
    expect(mesesAte(2026, 9, 2026, 7)).toEqual([{ ano: 2026, mes: 7 }]);
  });
  it("limita aos últimos `max` meses", () => {
    const r = mesesAte(2020, 1, 2026, 1, 24);
    expect(r.length).toBe(24);
    expect(r[r.length - 1]).toEqual({ ano: 2026, mes: 1 });
  });
});
