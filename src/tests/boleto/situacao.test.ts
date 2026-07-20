import { describe, it, expect } from "vitest";
import { interpretarSituacaoInter } from "@/lib/boleto/inter";

describe("interpretarSituacaoInter", () => {
  it("pago para RECEBIDO, lê valor e data", () => {
    const r = interpretarSituacaoInter("cod1", {
      cobranca: { situacao: "RECEBIDO", valorTotalRecebido: 5, dataSituacao: "2026-07-20" },
    });
    expect(r).toEqual({ provedorBoletoId: "cod1", pago: true, valorPago: 5, pagoEm: "2026-07-20" });
  });
  it("pago para MARCADO_RECEBIDO e PAGO", () => {
    expect(interpretarSituacaoInter("c", { cobranca: { situacao: "MARCADO_RECEBIDO" } })?.pago).toBe(true);
    expect(interpretarSituacaoInter("c", { cobranca: { situacao: "PAGO" } })?.pago).toBe(true);
  });
  it("null para A_RECEBER ou sem cobranca", () => {
    expect(interpretarSituacaoInter("c", { cobranca: { situacao: "A_RECEBER" } })).toBeNull();
    expect(interpretarSituacaoInter("c", {})).toBeNull();
  });
});
