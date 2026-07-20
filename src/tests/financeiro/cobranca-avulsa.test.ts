import { describe, it, expect } from "vitest";
import { validarCobrancaAvulsa, competenciaDoVencimento } from "@/lib/financeiro/cobranca-avulsa";

const ok = { clienteId: "c1", valor: 100, vencimento: "2026-08-10", categoriaId: "cat1" };

describe("competenciaDoVencimento", () => {
  it("usa o mês do vencimento no dia 01", () => {
    expect(competenciaDoVencimento("2026-08-10")).toBe("2026-08-01");
  });
});

describe("validarCobrancaAvulsa", () => {
  it("aceita entrada completa", () => {
    expect(validarCobrancaAvulsa(ok)).toEqual({ ok: true });
  });
  it("recusa sem cliente", () => {
    const r = validarCobrancaAvulsa({ ...ok, clienteId: "" });
    expect(r.ok).toBe(false);
  });
  it("recusa valor zero ou negativo", () => {
    expect(validarCobrancaAvulsa({ ...ok, valor: 0 }).ok).toBe(false);
    expect(validarCobrancaAvulsa({ ...ok, valor: -5 }).ok).toBe(false);
  });
  it("recusa sem categoria", () => {
    expect(validarCobrancaAvulsa({ ...ok, categoriaId: "" }).ok).toBe(false);
  });
  it("recusa vencimento fora de YYYY-MM-DD", () => {
    expect(validarCobrancaAvulsa({ ...ok, vencimento: "10/08/2026" }).ok).toBe(false);
  });
});
