import { describe, it, expect } from "vitest";
import { montarDadosContrato, type ClienteContrato } from "@/lib/contrato/dados";

const completo: ClienteContrato = {
  razao_social: "ACME LTDA",
  cpf_cnpj: "11222333000181",
  endereco: { logradouro: "Rua A", numero: "10", bairro: "Centro", cidade: "Uberlândia", uf: "MG", cep: "38400000" },
  email: "a@ex.com",
  telefone: "34 99999-0000",
  responsavel_nome: "Fulano de Tal",
  representante: {
    nacionalidade: "brasileiro",
    estado_civil: "casado",
    profissao: "empresário",
    rg: "MG-1",
    cpf: "52998224725",
  },
};

describe("montarDadosContrato", () => {
  it("monta e formata todas as tags", () => {
    const { dados } = montarDadosContrato(completo, 1500, "2026-07-01");
    expect(dados.razao_social).toBe("ACME LTDA");
    expect(dados.cnpj).toBe("11.222.333/0001-81");
    expect(dados.endereco).toContain("Rua A");
    expect(dados.endereco).toContain("Uberlândia/MG");
    expect(dados.cep).toBe("38400-000");
    expect(dados.rep_nome).toBe("Fulano de Tal");
    expect(dados.rep_cpf).toBe("529.982.247-25");
    expect(dados.honorario).toBe("R$ 1.500,00");
    expect((dados.honorario_extenso ?? "").toLowerCase()).toContain("reais");
    expect(dados.vigencia_inicio).toBe("01/07/2026"); // sem deslocamento de fuso
  });
  it("lista campos faltando e devolve string vazia para eles", () => {
    const semRep: ClienteContrato = { ...completo, representante: null, responsavel_nome: null };
    const { dados, faltando } = montarDadosContrato(semRep, null, "2026-07-01");
    expect(dados.rep_cpf).toBe("");
    expect(dados.honorario).toBe("");
    expect(faltando).toContain("Honorário");
    expect(faltando).toContain("Nome do representante");
  });
});
