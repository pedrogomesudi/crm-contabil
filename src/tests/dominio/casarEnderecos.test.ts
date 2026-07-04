import { describe, it, expect } from "vitest";
import { casarEnderecos } from "@/lib/dominio/casarEnderecos";
import type { EnderecoImportado } from "@/lib/dominio/parseEnderecos";

const lista: EnderecoImportado[] = [
  { cnpj: "11111111111111", endereco: { logradouro: "RUA A" } }, // cliente vazio
  { cnpj: "22222222222222", endereco: { logradouro: "RUA B" } }, // cliente já com endereço
  { cnpj: "33333333333333", endereco: { logradouro: "RUA C" } }, // sem cliente
];
const clientes = [
  { cpf_cnpj: "11111111111111", temEndereco: false },
  { cpf_cnpj: "22222222222222", temEndereco: true },
];

describe("casarEnderecos", () => {
  it("sem sobrescrever: preenche só os vazios; mantém os que já têm", () => {
    const r = casarEnderecos(lista, clientes, false);
    expect(r.paraGravar).toEqual([{ cpf_cnpj: "11111111111111", endereco: { logradouro: "RUA A" } }]);
    expect(r.vaziosPreenchidos).toBe(1);
    expect(r.jaComEnderecoMantidos).toBe(1);
    expect(r.jaComEnderecoAtualizados).toBe(0);
    expect(r.semClienteNoArquivo).toBe(1);
  });

  it("sobrescrever: grava também os que já tinham endereço", () => {
    const r = casarEnderecos(lista, clientes, true);
    expect(r.paraGravar).toHaveLength(2);
    expect(r.vaziosPreenchidos).toBe(1);
    expect(r.jaComEnderecoAtualizados).toBe(1);
    expect(r.jaComEnderecoMantidos).toBe(0);
    expect(r.semClienteNoArquivo).toBe(1);
  });
});
