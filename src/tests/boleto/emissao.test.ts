import { describe, it, expect } from "vitest";
import { dadosEmissaoDeTitulo } from "@/lib/boleto/emissao";

const titulo = { valor: 300, vencimento: "2026-08-10", descricao: "Honorário 07/2026" };
const cliente = {
  razaoSocial: "ACME LTDA",
  cpfCnpj: "12.345.678/0001-99",
  email: "a@b.com",
  endereco: { cep: "38.400-000", logradouro: "Rua X", numero: "10", bairro: "Centro", cidade: "Uberlândia", uf: "MG" },
};

describe("dadosEmissaoDeTitulo", () => {
  it("mapeia com endereço e limpa dígitos", () => {
    const d = dadosEmissaoDeTitulo(titulo, cliente, 7);
    expect(d).toEqual({
      valor: 300,
      vencimento: "2026-08-10",
      pagadorNome: "ACME LTDA",
      pagadorDocumento: "12345678000199",
      pagadorEmail: "a@b.com",
      descricao: "Honorário 07/2026",
      seuNumero: "7",
      pagadorEndereco: {
        cep: "38400000",
        logradouro: "Rua X",
        numero: "10",
        bairro: "Centro",
        cidade: "Uberlândia",
        uf: "MG",
      },
    });
  });
  it("sem endereço → null e descrição padrão", () => {
    const d = dadosEmissaoDeTitulo({ ...titulo, descricao: null }, { ...cliente, endereco: null }, 8);
    expect(d.pagadorEndereco).toBe(null);
    expect(d.descricao).toBe("Honorários");
  });
});
