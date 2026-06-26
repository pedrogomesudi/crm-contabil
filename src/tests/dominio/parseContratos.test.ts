import { describe, it, expect } from "vitest";
import { parseContratos } from "@/lib/dominio/parseContratos";
import type { FolhaXls } from "@/lib/dominio/biff";

const L = (o: Record<number, string | number>): (string | number | null)[] => {
  const a: (string | number | null)[] = Array(23).fill(null);
  for (const k of Object.keys(o)) a[Number(k)] = o[Number(k)]!;
  return a;
};
const folha: FolhaXls = {
  nome: "F",
  celulas: [
    ["RELAÇÃO DE CONTRATOS"],
    [null],
    [null],
    [null],
    L({ 0: "Código", 1: "Cliente", 7: "Tipo de contrato", 21: "Valor", 22: "Valor" }),
    L({ 9: "contrato", 11: "contrato", 21: "original", 22: "atual" }),
    L({
      0: 1,
      1: "ACME LTDA",
      7: "HONORARIOS CONTABEIS",
      9: 45931,
      11: 45931,
      12: 45931,
      14: "10",
      21: 200,
      22: 250,
    }),
  ],
};

describe("parseContratos", () => {
  it("extrai contratos e converte datas seriais", () => {
    const r = parseContratos(folha);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      codigoCliente: 1,
      clienteNome: "ACME LTDA",
      tipoContrato: "HONORARIOS CONTABEIS",
      emissao: "2025-10-01",
      inicioContrato: "2025-10-01",
      inicioFaturamento: "2025-10-01",
      diaVencimento: "10",
      valorOriginal: 200,
      valorAtual: 250,
      encerradoEm: null,
    });
  });
});
