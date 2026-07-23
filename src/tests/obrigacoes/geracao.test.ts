import { describe, it, expect } from "vitest";
import {
  obrigacaoAplica,
  instanciasDaCompetencia,
  vigenteNaCompetencia,
  type ObrigacaoMatriz,
  type ClienteFiscal,
} from "@/lib/obrigacoes/geracao";
import type { RegraPrazo } from "@/lib/obrigacoes/prazo";

const regra: RegraPrazo = {
  periodicidade: "mensal",
  vencDia: 20,
  vencMesOffset: 1,
  vencMes: null,
  vencAnoOffset: 1,
  prazoInternoDiasUteis: 0,
  antecipa: true,
};
const base: ObrigacaoMatriz = {
  id: "o1",
  periodicidade: "mensal",
  aplicavelA: ["simples_sem_func", "simples_com_func"],
  condicaoFlags: [],
  condicaoModo: "any",
  ufs: [],
  cnaePrefixos: [],
  regra,
};
const cli = (p: ClienteFiscal["perfil"], extra: Partial<ClienteFiscal> = {}): ClienteFiscal => ({
  perfil: p,
  uf: "SP",
  cnae: "6201500",
  flags: {},
  ...extra,
});

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
    expect(obrigacaoAplica({ ...base, cnaePrefixos: ["62"] }, cli("simples_sem_func", { cnae: "6201-5/00" }))).toBe(
      true,
    );
    expect(obrigacaoAplica({ ...base, cnaePrefixos: ["47"] }, cli("simples_sem_func", { cnae: "6201-5/00" }))).toBe(
      false,
    );
  });
});

describe("instanciasDaCompetencia", () => {
  const anual: ObrigacaoMatriz = {
    ...base,
    id: "a1",
    periodicidade: "anual",
    regra: { ...regra, periodicidade: "anual", vencDia: 31, vencMes: 3 },
  };
  const trimestral: ObrigacaoMatriz = {
    ...base,
    id: "t1",
    periodicidade: "trimestral",
    regra: { ...regra, periodicidade: "trimestral" },
  };
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

// Vigência: a obrigação tem começo e fim. Sem isso, a matriz geraria a EFD-Contribuições
// para sempre — inclusive depois de 2027, quando PIS/COFINS deixam de existir.
describe("vigência da obrigação", () => {
  it("sem vigência declarada, gera como sempre (as 16 linhas de hoje não mudam)", () => {
    expect(vigenteNaCompetencia({}, "2030-01-01")).toBe(true);
    expect(instanciasDaCompetencia([base], cli("simples_sem_func"), 2030, 5)).toHaveLength(1);
  });

  it("competência posterior ao fim não gera — obrigação extinta some do calendário", () => {
    const extinta = { ...base, vigenteAte: "2026-12-31" };
    expect(instanciasDaCompetencia([extinta], cli("simples_sem_func"), 2027, 1)).toEqual([]);
  });

  it("competência anterior ao início não gera — obrigação futura não aparece antes da hora", () => {
    const futura = { ...base, vigenteDe: "2027-01-01" };
    expect(instanciasDaCompetencia([futura], cli("simples_sem_func"), 2026, 12)).toEqual([]);
  });

  it("no mês exato do limite, ainda gera dos dois lados", () => {
    const janela = { ...base, vigenteDe: "2026-01-01", vigenteAte: "2026-12-31" };
    expect(instanciasDaCompetencia([janela], cli("simples_sem_func"), 2026, 1)).toHaveLength(1);
    expect(instanciasDaCompetencia([janela], cli("simples_sem_func"), 2026, 12)).toHaveLength(1);
  });

  it("compara COMPETÊNCIA, não vencimento", () => {
    // Competência 12/2026 vence em 01/2027; a obrigação vigente até 12/2026 ainda é devida,
    // porque o que conta é o período do fato gerador.
    const ate2026 = { ...base, vigenteAte: "2026-12-31" };
    const dez = instanciasDaCompetencia([ate2026], cli("simples_sem_func"), 2026, 12);
    expect(dez).toHaveLength(1);
    expect(dez[0]!.competencia).toBe("2026-12-01");
    expect(dez[0]!.vencimentoLegal.startsWith("2027")).toBe(true);
  });
});
