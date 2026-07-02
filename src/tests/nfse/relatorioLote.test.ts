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
});
