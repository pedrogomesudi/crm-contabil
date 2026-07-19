import { describe, it, expect } from "vitest";
import { passosContrato, rotuloStatusAssinatura } from "@/lib/comercial/contratoProposta";

const base = {
  oportunidadeId: "op1",
  clienteId: null,
  contratoDocId: null,
  assinaturaStatus: null,
  propostaAceita: true,
};

describe("passosContrato", () => {
  it("sem cliente: converter é o passo atual e linka para a conversão; os demais pendentes sem href", () => {
    const p = passosContrato(base);
    expect(p.map((x) => x.situacao)).toEqual(["atual", "pendente", "pendente"]);
    expect(p[0]!.href).toBe("/clientes/novo?oportunidade=op1");
    expect(p[1]!.href).toBeNull();
  });
  it("com cliente, sem contrato: gerar é o atual e linka para a tela do cliente", () => {
    const p = passosContrato({ ...base, clienteId: "cli1" });
    expect(p.map((x) => x.situacao)).toEqual(["feito", "atual", "pendente"]);
    expect(p[0]!.href).toBe("/clientes/cli1");
    expect(p[1]!.href).toBe("/clientes/cli1");
  });
  it("com contrato, enviado: assinar é o atual com o status por extenso", () => {
    const p = passosContrato({ ...base, clienteId: "cli1", contratoDocId: "doc1", assinaturaStatus: "enviado" });
    expect(p.map((x) => x.situacao)).toEqual(["feito", "feito", "atual"]);
    expect(p[2]!.detalhe).toBe("Enviado — aguardando assinatura");
  });
  it("assinatura finalizada: todos feitos", () => {
    const p = passosContrato({ ...base, clienteId: "cli1", contratoDocId: "doc1", assinaturaStatus: "finalizado" });
    expect(p.map((x) => x.situacao)).toEqual(["feito", "feito", "feito"]);
  });
});

describe("rotuloStatusAssinatura", () => {
  it("mapeia os status", () => {
    expect(rotuloStatusAssinatura(null)).toBe("Não enviado");
    expect(rotuloStatusAssinatura("finalizado")).toBe("Assinado");
    expect(rotuloStatusAssinatura("recusado")).toBe("Recusado");
  });
});
