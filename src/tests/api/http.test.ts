import { describe, it, expect } from "vitest";
import { normalizarPaginacao } from "@/lib/api/http";

describe("normalizarPaginacao", () => {
  it("default 50/0 quando ausente", () => {
    expect(normalizarPaginacao(null, null)).toEqual({ limit: 50, offset: 0 });
  });
  it("respeita valores válidos", () => {
    expect(normalizarPaginacao("30", "60")).toEqual({ limit: 30, offset: 60 });
  });
  it("limita o limit a 200", () => {
    expect(normalizarPaginacao("9999", "0").limit).toBe(200);
  });
  it("valores inválidos/negativos caem no default", () => {
    expect(normalizarPaginacao("abc", "-5")).toEqual({ limit: 50, offset: 0 });
  });
});
