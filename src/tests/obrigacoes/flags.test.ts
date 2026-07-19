import { describe, it, expect } from "vitest";
import { resolverFlag } from "@/lib/obrigacoes/flags";

describe("resolverFlag", () => {
  it("explícito true vence a derivação", () => expect(resolverFlag(true, false)).toBe(true));
  it("explícito false vence a derivação", () => expect(resolverFlag(false, true)).toBe(false));
  it("null cai no derivado", () => {
    expect(resolverFlag(null, true)).toBe(true);
    expect(resolverFlag(null, false)).toBe(false);
  });
});
