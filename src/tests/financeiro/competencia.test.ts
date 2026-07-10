import { describe, it, expect } from "vitest";
import { mesAnterior } from "@/lib/financeiro/competencia";

describe("mesAnterior", () => {
  it("devolve o mês anterior no formato YYYY-MM", () => {
    expect(mesAnterior("2026-07-10")).toBe("2026-06");
    expect(mesAnterior("2026-03-01")).toBe("2026-02");
    expect(mesAnterior("2026-08-31")).toBe("2026-07");
  });
  it("vira o ano corretamente em janeiro", () => {
    expect(mesAnterior("2026-01-15")).toBe("2025-12");
    expect(mesAnterior("2026-01-01")).toBe("2025-12");
  });
  it("não depende do dia do mês", () => {
    expect(mesAnterior("2026-05-01")).toBe(mesAnterior("2026-05-28"));
  });
});
