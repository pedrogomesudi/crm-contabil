import { describe, it, expect } from "vitest";
import { podeCancelarBoleto, podeCancelarTitulo } from "@/lib/boleto/cancelamento";

describe("podeCancelarBoleto", () => {
  it("só emitido", () => {
    expect(podeCancelarBoleto("emitido")).toBe(true);
    expect(podeCancelarBoleto("pago")).toBe(false);
    expect(podeCancelarBoleto("cancelado")).toBe(false);
  });
});

describe("podeCancelarTitulo", () => {
  it("ABERTO/VENCIDO sem baixa sim", () => {
    expect(podeCancelarTitulo("ABERTO", 0)).toBe(true);
    expect(podeCancelarTitulo("VENCIDO", 0)).toBe(true);
  });
  it("com baixa ou já baixado/cancelado não", () => {
    expect(podeCancelarTitulo("ABERTO", 50)).toBe(false);
    expect(podeCancelarTitulo("BAIXADO", 0)).toBe(false);
    expect(podeCancelarTitulo("BAIXADO_PARCIAL", 0)).toBe(false);
    expect(podeCancelarTitulo("CANCELADO", 0)).toBe(false);
  });
});
