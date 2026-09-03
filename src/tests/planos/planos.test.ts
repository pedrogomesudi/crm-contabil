import { describe, it, expect } from "vitest";
import { moduloAtivo, planoAtinge, planoDe, planoMinimoDoModulo, PLANO_PADRAO } from "@/lib/planos/planos";

describe("planoAtinge", () => {
  it("igual ou superior libera", () => {
    expect(planoAtinge("financeiro", "financeiro")).toBe(true);
    expect(planoAtinge("contabil", "financeiro")).toBe(true);
    expect(planoAtinge("relacionamento", "financeiro")).toBe(false);
  });
});

describe("planoDe", () => {
  it("valor inválido cai no padrão (mais completo, não esconde nada)", () => {
    expect(planoDe(null)).toBe(PLANO_PADRAO);
    expect(planoDe("xpto")).toBe("contabil");
    expect(planoDe("relacionamento")).toBe("relacionamento");
  });
});

describe("moduloAtivo", () => {
  it("Contratos vê só a base", () => {
    expect(moduloAtivo("contratos", "clientes")).toBe(true);
    expect(moduloAtivo("contratos", "documentos")).toBe(true);
    expect(moduloAtivo("contratos", "comunicados")).toBe(false);
    expect(moduloAtivo("contratos", "financeiro")).toBe(false);
    expect(moduloAtivo("contratos", "nfse")).toBe(false);
  });
  it("Relacionamento libera comunicados, atendimento e NFS-e — não financeiro", () => {
    expect(moduloAtivo("relacionamento", "comunicados")).toBe(true);
    expect(moduloAtivo("relacionamento", "atendimento")).toBe(true);
    expect(moduloAtivo("relacionamento", "nfse")).toBe(true);
    expect(moduloAtivo("relacionamento", "financeiro")).toBe(false);
    expect(moduloAtivo("relacionamento", "obrigacoes")).toBe(false);
  });
  it("Financeiro libera o financeiro, mas não o fiscal (obrigações/legalização)", () => {
    expect(moduloAtivo("financeiro", "financeiro")).toBe(true);
    expect(moduloAtivo("financeiro", "nfse")).toBe(true);
    expect(moduloAtivo("financeiro", "obrigacoes")).toBe(false);
    expect(moduloAtivo("financeiro", "legalizacao")).toBe(false);
    expect(moduloAtivo("financeiro", "tarefas")).toBe(false);
  });
  it("Contábil libera tudo (obrigações, legalização, tarefas, timesheet)", () => {
    for (const m of ["obrigacoes", "vencimentos", "alertas_receita", "legalizacao", "tarefas", "timesheet"] as const) {
      expect(moduloAtivo("contabil", m)).toBe(true);
    }
  });
  it("Enterprise inclui tudo do Contábil", () => {
    expect(moduloAtivo("enterprise", "obrigacoes")).toBe(true);
    expect(moduloAtivo("enterprise", "financeiro")).toBe(true);
  });
});

describe("planoMinimoDoModulo", () => {
  it("reflete o mapa aprovado", () => {
    expect(planoMinimoDoModulo("comercial")).toBe("contratos");
    expect(planoMinimoDoModulo("atendimento")).toBe("relacionamento");
    expect(planoMinimoDoModulo("financeiro")).toBe("financeiro");
    expect(planoMinimoDoModulo("legalizacao")).toBe("contabil");
  });
});
