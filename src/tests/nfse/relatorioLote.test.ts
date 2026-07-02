import { describe, it, expect } from "vitest";
import { montarCsv } from "@/lib/nfse/relatorioLote";
import type { LinhaRelatorio } from "@/lib/nfse/tipos";

const linhas: LinhaRelatorio[] = [
  {
    cliente: "ACME LTDA",
    documento: "12345678000199",
    competencia: "2026-07-01",
    valor: 500,
    resultado: "Autorizada",
    numero: "10",
    chave: "3170...",
    motivo: "",
  },
  {
    cliente: 'BETA, "X" S.A.',
    documento: "98765432000188",
    competencia: "2026-07-01",
    valor: 300,
    resultado: "Rejeitada",
    numero: "",
    chave: "",
    motivo: "E1235 falha no schema",
  },
];

describe("montarCsv", () => {
  it("gera cabeçalho + linhas e escapa vírgula/aspas", () => {
    const csv = montarCsv(linhas);
    const linhasCsv = csv.trim().split("\n");
    expect(linhasCsv[0]).toBe("Cliente,CNPJ/CPF,Competência,Valor,Resultado,Número,Chave de acesso,Motivo");
    expect(linhasCsv[1]).toContain("ACME LTDA,12345678000199,2026-07-01,500.00,Autorizada,10,3170...,");
    expect(linhasCsv[2]).toContain('"BETA, ""X"" S.A."');
    expect(linhasCsv[2]).toContain("E1235 falha no schema");
  });

  it("neutraliza fórmula (CSV injection) prefixando com aspa simples", () => {
    const csv = montarCsv([
      { cliente: "=1+1", documento: "x", competencia: "2026-07-01", valor: 0, resultado: "@SUM(A1)", numero: "", chave: "", motivo: "-2+3" },
    ]);
    const l = csv.trim().split("\n")[1]!;
    expect(l).toContain("'=1+1");
    expect(l).toContain("'@SUM(A1)");
    expect(l).toContain("'-2+3");
    expect(l).not.toMatch(/(^|,)=1\+1/);
  });
});
