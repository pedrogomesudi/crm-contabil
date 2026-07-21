import { describe, it, expect } from "vitest";
import { tituloAvulsoSchema, baixaSchema } from "@/lib/validation/api-escrita";

describe("tituloAvulsoSchema", () => {
  it("aceita payload válido", () => {
    const r = tituloAvulsoSchema.safeParse({
      clienteId: "11111111-1111-4111-8111-111111111111",
      valor: 100,
      vencimento: "2026-08-10",
      categoriaId: "22222222-2222-4222-8222-222222222222",
      descricao: "Serviço avulso",
    });
    expect(r.success).toBe(true);
  });
  it("rejeita valor não positivo e data inválida", () => {
    expect(tituloAvulsoSchema.safeParse({ clienteId: "x", valor: 0, vencimento: "10/08" }).success).toBe(false);
  });
});

describe("baixaSchema", () => {
  it("aplica defaults de juros/multa/desconto", () => {
    const r = baixaSchema.safeParse({
      tituloId: "11111111-1111-4111-8111-111111111111",
      valorRecebido: 50,
      dataRecebimento: "2026-08-01",
      contaBancariaId: "33333333-3333-4333-8333-333333333333",
      formaPagamento: "pix",
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.juros).toBe(0);
  });
});
