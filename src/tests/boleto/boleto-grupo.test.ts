import { describe, it, expect } from "vitest";
import { montarDadosBoletoGrupo } from "@/app/(app)/financeiro/contas-a-receber/boleto-grupo";
import type { MembroGrupo } from "@/lib/financeiro/grupo-cobranca";

const titular = {
  razaoSocial: "MATRIZ LTDA",
  cpfCnpj: "12.345.678/0001-90",
  email: "m@x.com",
  endereco: { cep: "38400000", logradouro: "RUA A", numero: "1", bairro: "B", cidade: "UBERLANDIA", uf: "MG" },
};
const membros: MembroGrupo[] = [
  { clienteId: "1", razaoSocial: "MATRIZ LTDA", cpfCnpj: "12345678000190", honorario: 200 },
  { clienteId: "2", razaoSocial: "FILIAL LTDA", cpfCnpj: "12345678000271", honorario: 150 },
];

describe("montarDadosBoletoGrupo", () => {
  const d = montarDadosBoletoGrupo(titular, membros, "Grupo X", 42, "2026-09-10");
  it("pagador = titular, documento só dígitos", () => {
    expect(d.pagadorNome).toBe("MATRIZ LTDA");
    expect(d.pagadorDocumento).toBe("12345678000190");
  });
  it("valor = soma dos honorários", () => {
    expect(d.valor).toBe(350);
  });
  it("observações listam razão + CNPJ de cada empresa", () => {
    expect(d.observacoes).toEqual(["MATRIZ LTDA — 12.345.678/0001-90", "FILIAL LTDA — 12.345.678/0002-71"]);
  });
  it("seuNumero e vencimento corretos", () => {
    expect(d.seuNumero).toBe("42");
    expect(d.vencimento).toBe("2026-09-10");
  });
  it("endereço do pagador preenchido (CEP só dígitos)", () => {
    expect(d.pagadorEndereco?.cidade).toBe("UBERLANDIA");
    expect(d.pagadorEndereco?.cep).toBe("38400000");
  });
});
