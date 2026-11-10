import { describe, it, expect } from "vitest";
import { estadoContratoCliente, LABEL_CONTRATO } from "@/lib/clientes/contrato-status";

const env = (status: string) => ({ status });

describe("estadoContratoCliente", () => {
  it("sem envelope e sem documento assinado: nada", () => {
    expect(estadoContratoCliente([], false)).toBe("nenhum");
  });

  it("envelope finalizado: assinado", () => {
    expect(estadoContratoCliente([env("finalizado")], false)).toBe("assinado");
  });

  it("envelope só enviado: enviado", () => {
    expect(estadoContratoCliente([env("enviado")], false)).toBe("enviado");
  });

  // `parcial` é o cliente já tendo assinado e a Elevare não. Colapsar isso em "Enviado"
  // escondia 18 contratos prontos para a contratada assinar — ninguém via que estavam na fila.
  it("envelope parcial: assinado pelo cliente, não apenas enviado", () => {
    expect(estadoContratoCliente([env("parcial")], false)).toBe("assinado_cliente");
  });

  it("parcial vence enviado: basta um envelope em que o cliente já assinou", () => {
    expect(estadoContratoCliente([env("enviado"), env("parcial")], false)).toBe("assinado_cliente");
  });

  it("finalizado vence parcial", () => {
    expect(estadoContratoCliente([env("parcial"), env("finalizado")], false)).toBe("assinado");
  });

  it("documento em papel vence parcial", () => {
    expect(estadoContratoCliente([env("parcial")], true)).toBe("assinado");
  });

  it("documento de contrato assinado anexado vale como assinado, mesmo sem ClickSign", () => {
    expect(estadoContratoCliente([], true)).toBe("assinado");
  });

  it("documento assinado vence envelope ainda pendente (assinaram em papel enquanto o envelope rodava)", () => {
    expect(estadoContratoCliente([env("enviado")], true)).toBe("assinado");
  });

  it("finalizado vence enviado quando há vários envelopes", () => {
    expect(estadoContratoCliente([env("enviado"), env("finalizado")], false)).toBe("assinado");
  });

  it("recusado aparece como recusado — não pode se passar por 'nada'", () => {
    expect(estadoContratoCliente([env("recusado")], false)).toBe("recusado");
  });

  it("reenvio depois de recusa mostra o reenvio em andamento", () => {
    expect(estadoContratoCliente([env("recusado"), env("enviado")], false)).toBe("enviado");
  });

  it("envelope cancelado não é envio pendente nem recusa: volta a 'nada'", () => {
    expect(estadoContratoCliente([env("cancelado")], false)).toBe("nenhum");
  });

  it("status desconhecido não quebra nem inventa estado", () => {
    expect(estadoContratoCliente([env("coisa_nova")], false)).toBe("nenhum");
  });

  it("todo estado tem rótulo em português", () => {
    for (const e of ["assinado", "enviado", "recusado", "nenhum"] as const) {
      expect(LABEL_CONTRATO[e]).toBeTruthy();
    }
  });
});
