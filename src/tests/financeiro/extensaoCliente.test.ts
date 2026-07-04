import { describe, it, expect } from "vitest";
import { normalizarExtensaoFinanceira } from "@/lib/financeiro/extensaoCliente";

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

describe("normalizarExtensaoFinanceira", () => {
  it("aceita valores válidos", () => {
    const r = normalizarExtensaoFinanceira(
      fd({ dia_vencimento: "10", qtd_funcionarios: "5", faixa_faturamento: "ATE_360K", data_saida: "" }),
    );
    expect(r).toEqual({
      dia_vencimento: 10,
      qtd_funcionarios: 5,
      faixa_faturamento: "ATE_360K",
      data_saida: null,
    });
  });
  it("rejeita dia de vencimento fora de 1..28", () => {
    const r = normalizarExtensaoFinanceira(fd({ dia_vencimento: "31" }));
    expect(r).toHaveProperty("erro");
  });
  it("rejeita faixa inválida", () => {
    const r = normalizarExtensaoFinanceira(fd({ faixa_faturamento: "XPTO" }));
    expect(r).toHaveProperty("erro");
  });
  it("trata campos vazios como null", () => {
    const r = normalizarExtensaoFinanceira(fd({}));
    expect(r).toEqual({
      dia_vencimento: null,
      qtd_funcionarios: null,
      faixa_faturamento: null,
      data_saida: null,
    });
  });
});
