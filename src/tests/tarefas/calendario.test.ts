import { describe, it, expect } from "vitest";
import { gradeDoMes, mesAnterior, mesSeguinte } from "@/lib/tarefas/calendario";

describe("gradeDoMes", () => {
  it("começa no domingo anterior ao dia 1", () => {
    // 2026-07-01 é uma quarta-feira; a grade abre no domingo 2026-06-28.
    const g = gradeDoMes(2026, 7);
    expect(g[0]?.data).toBe("2026-06-28");
    expect(g[0]?.doMes).toBe(false);
  });

  it("tem tamanho múltiplo de 7 e termina no sábado", () => {
    const g = gradeDoMes(2026, 7);
    expect(g.length % 7).toBe(0);
    expect(g.at(-1)?.data).toBe("2026-08-01");
  });

  it("marca corretamente os dias do mês", () => {
    const g = gradeDoMes(2026, 7);
    expect(g.filter((c) => c.doMes)).toHaveLength(31);
  });

  it("fevereiro de ano bissexto tem 29 dias", () => {
    expect(gradeDoMes(2028, 2).filter((c) => c.doMes)).toHaveLength(29);
  });
});

describe("navegação de mês", () => {
  it("vira o ano para trás e para frente", () => {
    expect(mesSeguinte(2026, 12)).toEqual({ ano: 2027, mes: 1 });
    expect(mesAnterior(2026, 1)).toEqual({ ano: 2025, mes: 12 });
  });
});
