import { describe, it, expect } from "vitest";
import { reconciliarClientes, type ClienteExistente } from "@/lib/dominio/reconciliar";
import type { ClienteNormalizado } from "@/lib/dominio/mapear";

const norm = (over: Partial<ClienteNormalizado>): ClienteNormalizado => ({
  cpf_cnpj: "11222333000181",
  tipo_pessoa: "PJ",
  razao_social: "ACME LTDA",
  nome_fantasia: null,
  regime_tributario: "Simples",
  status: "ativo",
  cnae: null,
  inscricao_estadual: null,
  endereco: null,
  email: null,
  telefone: null,
  dominio_codigo: null,
  pendencias: [],
  ...over,
});

describe("reconciliarClientes", () => {
  it("classifica novo / atualizado / inalterado / pendencia", () => {
    const existentes: ClienteExistente[] = [
      {
        cpf_cnpj: "11222333000181",
        razao_social: "ACME LTDA",
        regime_tributario: "Simples",
        status: "ativo",
        email: "old@ex.com",
        telefone: null,
      },
      {
        cpf_cnpj: "11222333000262",
        razao_social: "BETA",
        regime_tributario: "Presumido",
        status: "ativo",
        email: null,
        telefone: null,
      },
    ];
    const novos = [
      norm({ cpf_cnpj: "11222333000181", email: "new@ex.com" }), // atualizado (email)
      norm({ cpf_cnpj: "11222333000262", razao_social: "BETA", regime_tributario: "Presumido" }), // inalterado
      norm({ cpf_cnpj: "99999999000199", razao_social: "NOVA" }), // novo
      norm({ cpf_cnpj: "00000000000000", pendencias: ["x"] }), // pendencia
    ];
    const r = reconciliarClientes(novos, existentes);
    const classe = (cnpj: string) => r.find((i) => i.cliente.cpf_cnpj === cnpj)!.classe;
    expect(classe("11222333000181")).toBe("atualizado");
    expect(r.find((i) => i.cliente.cpf_cnpj === "11222333000181")!.diff.email).toEqual(["old@ex.com", "new@ex.com"]);
    expect(classe("11222333000262")).toBe("inalterado");
    expect(classe("99999999000199")).toBe("novo");
    expect(classe("00000000000000")).toBe("pendencia");
  });
});
