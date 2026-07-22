import { describe, it, expect } from "vitest";
import { validarNovaVencimento } from "@/lib/boleto/vencimento";

const HOJE = "2026-07-22";

describe("validarNovaVencimento", () => {
  it("aceita data futura diferente da atual", () => {
    expect(validarNovaVencimento("2026-08-10", "2026-07-30", HOJE)).toEqual({ ok: true });
  });

  it("aceita a própria data de hoje", () => {
    expect(validarNovaVencimento(HOJE, "2026-07-30", HOJE)).toEqual({ ok: true });
  });

  it("rejeita data anterior a hoje", () => {
    expect(validarNovaVencimento("2026-07-21", "2026-07-30", HOJE)).toEqual({
      erro: "A nova data não pode ser anterior a hoje.",
    });
  });

  it("rejeita data igual à atual", () => {
    expect(validarNovaVencimento("2026-07-30", "2026-07-30", HOJE)).toEqual({
      erro: "A nova data é igual à atual.",
    });
  });

  it("rejeita formato inválido", () => {
    expect(validarNovaVencimento("30/07/2026", "2026-07-30", HOJE)).toEqual({ erro: "Data inválida." });
    expect(validarNovaVencimento("2026-7-3", "2026-07-30", HOJE)).toEqual({ erro: "Data inválida." });
  });

  it("rejeita data inexistente no calendário", () => {
    expect(validarNovaVencimento("2026-13-40", "2026-07-30", HOJE)).toEqual({ erro: "Data inválida." });
    expect(validarNovaVencimento("2026-02-30", "2026-07-30", HOJE)).toEqual({ erro: "Data inválida." });
  });
});
