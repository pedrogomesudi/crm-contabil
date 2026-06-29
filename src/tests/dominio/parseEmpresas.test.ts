import { describe, it, expect } from "vitest";
import { parseEmpresas } from "@/lib/dominio/parseEmpresas";
import type { FolhaXls } from "@/lib/dominio/biff";

const folha: FolhaXls = {
  nome: "F",
  celulas: [
    [null, null, null, null, null, null, null, null, "Página: 1/4"],
    [null],
    [null],
    [null],
    [
      "Cód.",
      "Empresa",
      "CNPJ",
      "Status",
      "CNAE Principal",
      "Regime Tributário ",
      "Apuração",
      "Últ. Vigência",
      "Inscrição Estadual",
    ],
    [1, "ACME LTDA", "11.222.333/0001-81", "Ativa", "8211300", "Lucro Presumido", "Competência", "07/2024", ""],
    [2, "BETA ME", "11222333000262", "Inativa", "9999999", "Microempresa", "Competência", "06/2023", "123456"],
  ],
};

describe("parseEmpresas", () => {
  it("extrai empresas com CNPJ só-dígitos e campos-chave", () => {
    const r = parseEmpresas(folha);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({
      codigo: 1,
      razaoSocial: "ACME LTDA",
      cnpj: "11222333000181",
      status: "Ativa",
      regimeDominio: "Lucro Presumido",
      cnae: "8211300",
      inscricaoEstadual: null,
    });
    expect(r[1]).toMatchObject({
      codigo: 2,
      cnpj: "11222333000262",
      status: "Inativa",
      regimeDominio: "Microempresa",
      inscricaoEstadual: "123456",
    });
  });
});
