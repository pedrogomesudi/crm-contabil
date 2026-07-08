import { describe, it, expect } from "vitest";
import { sugerirPerfil, somarDias, itemAplica, materializarProcesso, progressoProcesso, type TemplateBloco } from "@/lib/onboarding/processo";

describe("sugerirPerfil", () => {
  it("PF / MEI / Simples s-c func / Presumido", () => {
    expect(sugerirPerfil("PF", "Isento/PF", null)).toBe("pf");
    expect(sugerirPerfil("MEI", "MEI", 0)).toBe("mei");
    expect(sugerirPerfil("PJ", "Simples", 0)).toBe("simples_sem_func");
    expect(sugerirPerfil("PJ", "Simples", 3)).toBe("simples_com_func");
    expect(sugerirPerfil("PJ", "Presumido", 5)).toBe("presumido_real");
    expect(sugerirPerfil("PJ", "Real", null)).toBe("presumido_real");
  });
});

describe("somarDias", () => {
  it("soma dias corridos com virada de mês/ano", () => {
    expect(somarDias("2026-07-01", 0)).toBe("2026-07-01");
    expect(somarDias("2026-01-30", 3)).toBe("2026-02-02");
    expect(somarDias("2026-12-30", 5)).toBe("2027-01-04");
  });
});

describe("itemAplica", () => {
  const base = { aplicavelA: ["simples_com_func", "presumido_real"], condicaoFlags: [] as string[], condicaoModo: "all" as const };
  it("perfil na lista / fora / curinga", () => {
    expect(itemAplica(base, "simples_com_func", {})).toBe(true);
    expect(itemAplica(base, "mei", {})).toBe(false);
    expect(itemAplica({ ...base, aplicavelA: ["*"] }, "mei", {})).toBe(true);
  });
  it("condição all / any", () => {
    const all = { aplicavelA: ["*"], condicaoFlags: ["possui_contador_anterior"], condicaoModo: "all" as const };
    expect(itemAplica(all, "mei", { possui_contador_anterior: true })).toBe(true);
    expect(itemAplica(all, "mei", { possui_contador_anterior: false })).toBe(false);
    const any = { aplicavelA: ["*"], condicaoFlags: ["possui_funcionarios", "possui_prolabore"], condicaoModo: "any" as const };
    expect(itemAplica(any, "mei", { possui_prolabore: true })).toBe(true);
    expect(itemAplica(any, "mei", {})).toBe(false);
  });
});

describe("materializarProcesso", () => {
  const blocos: TemplateBloco[] = [
    { ordem: 1, nome: "Formalização", prazoBlocoDias: 3, itens: [
      { codigo: "1.1", titulo: "Contrato", descricao: null, tipo: "padrao", responsavelPapel: "admin", prazoDias: 0, aplicavelA: ["*"], condicaoFlags: [], condicaoModo: "all", bloqueante: true, anexoObrigatorio: true, alertaRisco: null, ordem: 1 },
      { codigo: "1.2", titulo: "Contador anterior", descricao: null, tipo: "padrao", responsavelPapel: "contador", prazoDias: 2, aplicavelA: ["simples_com_func"], condicaoFlags: ["possui_contador_anterior"], condicaoModo: "all", bloqueante: false, anexoObrigatorio: true, alertaRisco: null, ordem: 2 },
    ] },
  ];
  it("filtra por perfil+condição e calcula prazo absoluto", () => {
    const semCont = materializarProcesso(blocos, "simples_com_func", { possui_contador_anterior: false }, "2026-07-01");
    expect(semCont.map((i) => i.codigo)).toEqual(["1.1"]);
    expect(semCont[0]!.prazo).toBe("2026-07-01");
    const comCont = materializarProcesso(blocos, "simples_com_func", { possui_contador_anterior: true }, "2026-07-01");
    expect(comCont.map((i) => i.codigo)).toEqual(["1.1", "1.2"]);
    expect(comCont[1]!.prazo).toBe("2026-07-03");
    expect(comCont[1]!.blocoNome).toBe("Formalização");
  });
});

describe("progressoProcesso", () => {
  it("progresso e próximo prazo", () => {
    const p = progressoProcesso([
      { status: "concluido", prazo: "2026-07-01", bloqueante: true },
      { status: "pendente", prazo: "2026-08-10", bloqueante: true },
      { status: "pendente", prazo: "2026-07-20", bloqueante: false },
    ]);
    expect(p).toMatchObject({ total: 3, concluidos: 1, bloqueantesPendentes: 1, pct: 33, concluido: false, proximoPrazo: "2026-07-20" });
  });
});
