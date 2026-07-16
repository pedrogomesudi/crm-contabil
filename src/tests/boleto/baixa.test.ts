import { describe, it, expect } from "vitest";
import { dadosBaixaBoleto } from "@/lib/boleto/baixa";

describe("dadosBaixaBoleto", () => {
  it("usa a data do evento (só a parte da data) e o valor pago", () => {
    expect(
      dadosBaixaBoleto(
        { provedorBoletoId: "p1", pago: true, valorPago: 300, pagoEm: "2026-08-02T10:00:00Z" },
        250,
        "2026-08-05",
      ),
    ).toEqual({ dataRecebimento: "2026-08-02", valorRecebido: 300 });
  });
  it("sem data/valor → hoje e valor do boleto", () => {
    expect(
      dadosBaixaBoleto({ provedorBoletoId: "p1", pago: true, valorPago: null, pagoEm: null }, 250, "2026-08-05"),
    ).toEqual({ dataRecebimento: "2026-08-05", valorRecebido: 250 });
  });
});
