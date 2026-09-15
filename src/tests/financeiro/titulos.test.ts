import { describe, it, expect } from "vitest";
import { saldoTitulo, ehVencido, consolidadoNoGrupo } from "@/lib/financeiro/titulos";

describe("saldoTitulo", () => {
  it("saldo = valor - baixado, nunca negativo", () => {
    expect(saldoTitulo(500, 0)).toBe(500);
    expect(saldoTitulo(500, 200)).toBe(300);
    expect(saldoTitulo(500, 500)).toBe(0);
    expect(saldoTitulo(500, 600)).toBe(0);
  });
});

describe("ehVencido", () => {
  it("vencido: vencimento no passado e ainda há saldo aberto", () => {
    expect(ehVencido("2000-01-01", "ABERTO", 100)).toBe(true);
  });
  it("não vencido: baixado, cancelado ou sem saldo", () => {
    expect(ehVencido("2000-01-01", "BAIXADO", 0)).toBe(false);
    expect(ehVencido("2000-01-01", "CANCELADO", 100)).toBe(false);
    expect(ehVencido("2999-01-01", "ABERTO", 100)).toBe(false);
  });
});

describe("consolidadoNoGrupo", () => {
  it("mensalidade de cliente em grupo consolida na titular", () => {
    expect(consolidadoNoGrupo({ grupoCobrancaId: "g1", origem: "MENSALIDADE" })).toBe(true);
  });
  it("avulsa de cliente em grupo é individual (não consolida)", () => {
    expect(consolidadoNoGrupo({ grupoCobrancaId: "g1", origem: "RECEITA_AVULSA" })).toBe(false);
    expect(consolidadoNoGrupo({ grupoCobrancaId: "g1", origem: "DECIMO_TERCEIRO" })).toBe(false);
  });
  it("cliente fora de grupo nunca consolida", () => {
    expect(consolidadoNoGrupo({ grupoCobrancaId: null, origem: "MENSALIDADE" })).toBe(false);
  });
});
