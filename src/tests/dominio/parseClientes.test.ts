import { describe, it, expect } from "vitest";
import { parseClientes } from "@/lib/dominio/parseClientes";
import type { FolhaXls } from "@/lib/dominio/biff";

const folha: FolhaXls = {
  nome: "F",
  celulas: [
    ["ACME CONTABILIDADE", null, null, null, null, null, null, null, null, null, "Página:", null, null, "1/22"],
    ["C.N.P.J.:", null, "99999999000199", null, null, null, null, null, null, null, "Emissão:"], // header do escritório — ignorar
    ["CLIENTES"],
    ["Código:", 1, null, null, null, "País:", "BRASIL"],
    ["Apelido:", "FULANO", null, null, null, "CEP:", "38407162"],
    ["Nome:", "FULANO DE TAL LTDA", null, null, null, "Telefone:", "34 999990000"],
    ["Endereço:", "Rua", null, "DAS FLORES", null, "E-mail:", "f@ex.com"],
    ["Número:", 127, null, null, null, "Inscrição:", "11222333000181"],
    ["Bairro:", "CENTRO", null, null, null, null],
    ["Município:", "UBERLANDIA", null, null, null, null],
    ["UF:", "MINAS GERAIS", null, null, null, null],
    // segunda ficha
    ["Código:", 2, null, null, null, null],
    ["Nome:", "BETA SERVICOS LTDA", null, null, null, "Inscrição:", "11222333000262"],
  ],
};

describe("parseClientes", () => {
  it("extrai fichas, usa Inscrição como documento e compõe endereço", () => {
    const r = parseClientes(folha);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({
      codigo: 1,
      nome: "FULANO DE TAL LTDA",
      apelido: "FULANO",
      cnpj: "11222333000181",
      email: "f@ex.com",
      telefone: "34 999990000",
    });
    expect(r[0]?.endereco).toMatchObject({
      logradouro: "Rua DAS FLORES",
      numero: "127",
      bairro: "CENTRO",
      cidade: "UBERLANDIA",
      uf: "MINAS GERAIS",
      cep: "38407162",
      pais: "BRASIL",
    });
    expect(r[0]?.cnpj).not.toBe("99999999000199"); // nunca o CNPJ do escritório
    expect(r[1]).toMatchObject({ codigo: 2, nome: "BETA SERVICOS LTDA", cnpj: "11222333000262" });
  });
});
