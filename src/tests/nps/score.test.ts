import { describe, it, expect } from "vitest";
import { resumirNps } from "@/lib/nps/score";

describe("resumirNps", () => {
  it("classifica promotor (9-10), neutro (7-8) e detrator (0-6)", () => {
    const r = resumirNps([10, 9, 8, 7, 6, 0]);
    expect([r.promotores, r.neutros, r.detratores]).toEqual([2, 2, 2]);
    expect(r.total).toBe(6);
  });
  it("score = %promotores - %detratores", () => {
    // 2 prom / 2 neu / 2 det de 6 → 33% - 33% = 0
    expect(resumirNps([10, 9, 8, 7, 6, 0]).score).toBe(0);
  });
  it("total zero não divide por zero — score 0", () => {
    const r = resumirNps([]);
    expect([r.total, r.score]).toEqual([0, 0]);
  });
  it("só promotores → score 100", () => {
    expect(resumirNps([9, 10, 9]).score).toBe(100);
  });
  it("só detratores → score -100", () => {
    expect(resumirNps([0, 3, 6]).score).toBe(-100);
  });
});
