import { describe, it, expect } from "vitest";
import { obrigacaoAplica, instanciasDaCompetencia, type ObrigacaoMatriz, type ClienteFiscal } from "@/lib/obrigacoes/geracao";
import type { RegraPrazo } from "@/lib/obrigacoes/prazo";

const regra: RegraPrazo = { periodicidade: "mensal", vencDia: 20, vencMesOffset: 1, vencMes: null, vencAnoOffset: 1, prazoInternoDiasUteis: 0, antecipa: true };
const base: ObrigacaoMatriz = { id: "o1", periodicidade: "mensal", aplicavelA: ["simples_sem_func", "simples_com_func"], condicaoFlags: [], condicaoModo: "any", ufs: [], cnaePrefixos: [], regra };
const cli = (p: ClienteFiscal["perfil"], extra: Partial<ClienteFiscal> = {}): ClienteFiscal => ({ perfil: p, uf: "SP", cnae: "6201500", flags: {}, ...extra });

describe("obrigacaoAplica", () => {
  it("casa por perfil", () => {
    expect(obrigacaoAplica(base, cli("simples_sem_func"))).toBe(true);
    expect(obrigacaoAplica(base, cli("mei"))).toBe(false);
  });
  it("flags any/all", () => {
    const o = { ...base, aplicavelA: ["*"], condicaoFlags: ["tem_folha"], condicaoModo: "any" as const };
    expect(obrigacaoAplica(o, cli("mei", { flags: { tem_folha: true } }))).toBe(true);
    expect(obrigacaoAplica(o, cli("mei", { flags: { tem_folha: false } }))).toBe(false);
  });
  it("filtra por UF (vazio = todas; restrito exclui outra)", () => {
    expect(obrigacaoAplica({ ...base, ufs: ["RJ"] }, cli("simples_sem_func", { uf: "SP" }))).toBe(false);
    expect(obrigacaoAplica({ ...base, ufs: ["SP"] }, cli("simples_sem_func", { uf: "SP" }))).toBe(true);
  });
  it("filtra por prefixo de CNAE", () => {
    expect(obrigacaoAplica({ ...base, cnaePrefixos: ["62"] }, cli("simples_sem_func", { cnae: "6201-5/00" }))).toBe(true);
    expect(obrigacaoAplica({ ...base, cnaePrefixos: ["47"] }, cli("simples_sem_func", { cnae: "6201-5/00" }))).toBe(false);
  });
});

describe("instanciasDaCompetencia", () => {
  const anual: ObrigacaoMatriz = { ...base, id: "a1", periodicidade: "anual", regra: { ...regra, periodicidade: "anual", vencDia: 31, vencMes: 3 } };
  const trimestral: ObrigacaoMatriz = { ...base, id: "t1", periodicidade: "trimestral", regra: { ...regra, periodicidade: "trimestral" } };
  it("mensal gera todo mês", () => {
    const r = instanciasDaCompetencia([base], cli("simples_sem_func"), 2026, 7);
    expect(r.map((x) => x.competencia)).toEqual(["2026-07-01"]);
    expect(r[0]!.vencimentoLegal).toBe("2026-08-20");
  });
  it("anual só em janeiro, competência do exercício anterior", () => {
    expect(instanciasDaCompetencia([anual], cli("simples_sem_func"), 2026, 7)).toEqual([]);
    const jan = instanciasDaCompetencia([anual], cli("simples_sem_func"), 2027, 1);
    expect(jan[0]!.competencia).toBe("2026-01-01");
  });
  it("trimestral só em 3/6/9/12", () => {
    expect(instanciasDaCompetencia([trimestral], cli("simples_sem_func"), 2026, 7)).toEqual([]);
    const set = instanciasDaCompetencia([trimestral], cli("simples_sem_func"), 2026, 9);
    expect(set[0]!.competencia).toBe("2026-07-01"); // início do 3º trimestre
  });
});
