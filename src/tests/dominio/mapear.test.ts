import { describe, it, expect } from "vitest";
import { mapearRegime, mapearStatus, tipoPessoaPorDoc, combinarFontes } from "@/lib/dominio/mapear";
import type { EmpresaDominio, ContatoDominio } from "@/lib/dominio/tipos";

describe("mapearRegime", () => {
  it("mapeia os regimes conhecidos", () => {
    expect(mapearRegime("Microempresa").regime).toBe("Simples");
    expect(mapearRegime("Lucro Presumido").regime).toBe("Presumido");
    expect(mapearRegime("Lucro Real").regime).toBe("Real");
  });
  it("gera pendência para imune/isenta", () => {
    const r = mapearRegime("Imune do IRPJ");
    expect(r.regime).toBeNull();
    expect(r.pendencia).toMatch(/regime/i);
  });
});

describe("tipoPessoaPorDoc", () => {
  it("14 díg => PJ, 11 díg => PF, outro => null", () => {
    expect(tipoPessoaPorDoc("11222333000181")).toBe("PJ");
    expect(tipoPessoaPorDoc("52998224725")).toBe("PF");
    expect(tipoPessoaPorDoc("123")).toBeNull();
  });
});

describe("mapearStatus", () => {
  it("Inativa => inativo; resto => ativo", () => {
    expect(mapearStatus("Inativa")).toBe("inativo");
    expect(mapearStatus("Ativa")).toBe("ativo");
    expect(mapearStatus("Ativa - Sem movimento")).toBe("ativo");
  });
});

describe("combinarFontes", () => {
  const empresas: EmpresaDominio[] = [
    {
      codigo: 1,
      razaoSocial: "ACME LTDA",
      cnpj: "11222333000181",
      status: "Ativa",
      cnae: "8211300",
      regimeDominio: "Lucro Presumido",
      inscricaoEstadual: null,
    },
    {
      codigo: 2,
      razaoSocial: "BETA ME",
      cnpj: "11222333000262",
      status: "Inativa",
      cnae: null,
      regimeDominio: "Imune do IRPJ",
      inscricaoEstadual: null,
    },
  ];
  const contatos: ContatoDominio[] = [
    {
      codigo: 7,
      nome: "ACME LTDA",
      apelido: "ACME",
      cnpj: "11222333000181",
      endereco: { cidade: "UBERLANDIA" },
      email: "a@ex.com",
      telefone: "34 1",
    },
  ];
  it("junta por CNPJ: empresa base + contato enriquece; classifica pendências", () => {
    const r = combinarFontes(empresas, contatos);
    const acme = r.find((c) => c.cpf_cnpj === "11222333000181")!;
    expect(acme).toMatchObject({
      tipo_pessoa: "PJ",
      regime_tributario: "Presumido",
      status: "ativo",
      cnae: "8211300",
      nome_fantasia: "ACME",
      email: "a@ex.com",
      dominio_codigo: "7",
    });
    expect(acme.endereco).toMatchObject({ cidade: "UBERLANDIA" });
    const beta = r.find((c) => c.cpf_cnpj === "11222333000262")!;
    expect(beta.regime_tributario).toBeNull();
    expect(beta.pendencias.length).toBeGreaterThan(0);
  });

  it("documento PF (CPF válido) vira PF + Isento/PF, nunca PF + Simples (respeita o CHECK)", () => {
    const r = combinarFontes(
      [
        {
          codigo: 9,
          razaoSocial: "FULANO DE TAL",
          cnpj: "52998224725", // CPF válido
          status: "Ativa",
          cnae: null,
          regimeDominio: "Microempresa",
          inscricaoEstadual: null,
        },
      ],
      [],
    );
    expect(r[0]).toMatchObject({ tipo_pessoa: "PF", regime_tributario: "Isento/PF" });
    expect(r[0]?.pendencias).toHaveLength(0);
  });

  it("documento inválido (DV errado) não vira cadastro silencioso — gera pendência", () => {
    const r = combinarFontes(
      [
        {
          codigo: 5,
          razaoSocial: "CNPJ RUIM",
          cnpj: "11222333000100", // CNPJ com DV inválido
          status: "Ativa",
          cnae: null,
          regimeDominio: "Microempresa",
          inscricaoEstadual: null,
        },
      ],
      [],
    );
    expect(r[0]?.regime_tributario).toBeNull();
    expect(r[0]?.pendencias.length).toBeGreaterThan(0);
  });

  it("cliente só no Honorários (sem empresa) não some — vira pendência", () => {
    const r = combinarFontes(
      [],
      [
        {
          codigo: 3,
          nome: "ORFAO LTDA",
          apelido: "ORFAO",
          cnpj: "11444777000161", // CNPJ válido, mas sem empresa correspondente
          endereco: { cidade: "UBERLANDIA" },
          email: "o@ex.com",
          telefone: null,
        },
      ],
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ cpf_cnpj: "11444777000161", dominio_codigo: "3" });
    expect(r[0]?.pendencias.length).toBeGreaterThan(0);
  });
});
