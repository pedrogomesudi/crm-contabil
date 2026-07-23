import { describe, it, expect } from "vitest";
import { estadoRevisao, diffMatriz, MESES_VALIDADE_REVISAO, type LinhaComparavel } from "@/lib/obrigacoes/curadoria";
import { MATRIZ_PADRAO, type ObrigacaoSeed } from "@/lib/obrigacoes/seed";

describe("estadoRevisao", () => {
  it("sem data, nunca foi revisada", () => {
    expect(estadoRevisao(null, "2026-07-23")).toBe("nunca");
  });

  it("revisada ontem está em dia", () => {
    expect(estadoRevisao("2026-07-22", "2026-07-23")).toBe("em_dia");
  });

  it("no dia exato em que completa 12 meses, vence", () => {
    expect(estadoRevisao("2025-07-23", "2026-07-23")).toBe("vencida");
    // Um dia antes ainda vale — o limite é fechado no dia do aniversário.
    expect(estadoRevisao("2025-07-23", "2026-07-22")).toBe("em_dia");
  });

  it("o limiar é o declarado, não um número solto no código", () => {
    expect(MESES_VALIDADE_REVISAO).toBe(12);
  });

  it("data inválida cai em 'nunca' — melhor pedir conferência do que afirmar validade", () => {
    expect(estadoRevisao("data-torta", "2026-07-23")).toBe("nunca");
  });
});

const seed = (over: Partial<ObrigacaoSeed> & { codigo: string }): ObrigacaoSeed => ({
  nome: over.codigo,
  descricao: null,
  esfera: "federal",
  periodicidade: "mensal",
  aplicavelA: ["*"],
  condicaoFlags: [],
  condicaoModo: "any",
  ufs: [],
  cnaePrefixos: [],
  vencDia: 15,
  vencMesOffset: 1,
  vencMes: null,
  vencAnoOffset: 1,
  prazoInternoDiasUteis: 0,
  antecipa: true,
  ordem: 10,
  baseLegal: "IN de teste",
  fonteUrl: null,
  observacaoCuradoria: null,
  ...over,
});

const doBanco = (o: ObrigacaoSeed, over: Partial<LinhaComparavel> = {}): LinhaComparavel => ({
  codigo: o.codigo,
  esfera: o.esfera,
  periodicidade: o.periodicidade,
  aplicavelA: o.aplicavelA,
  condicaoFlags: o.condicaoFlags,
  condicaoModo: o.condicaoModo,
  ufs: o.ufs,
  cnaePrefixos: o.cnaePrefixos,
  vencDia: o.vencDia,
  vencMesOffset: o.vencMesOffset,
  vencMes: o.vencMes,
  vencAnoOffset: o.vencAnoOffset,
  antecipa: o.antecipa,
  baseLegal: o.baseLegal,
  ...over,
});

describe("diffMatriz", () => {
  it("matrizes iguais não acusam nada", () => {
    const p = seed({ codigo: "X" });
    expect(diffMatriz([doBanco(p)], [p])).toEqual({ ausentes: [], divergentes: [] });
  });

  it("prazo divergente aparece com os dois valores — o caso do DCTFWeb", () => {
    const p = seed({ codigo: "DCTFWEB", vencDia: 15 });
    const { divergentes } = diffMatriz([doBanco(p, { vencDia: 20 })], [p]);
    expect(divergentes).toEqual([{ codigo: "DCTFWEB", campo: "vencDia", noBanco: 20, noPadrao: 15 }]);
  });

  it("preferência do escritório não é divergência (ativa, ordem, folga interna)", () => {
    const p = seed({ codigo: "X", ordem: 10, prazoInternoDiasUteis: 0 });
    // O banco desligou a obrigação e deu 3 dias de folga: decisão do escritório, não da lei.
    const linha = { ...doBanco(p), ativa: false, ordem: 999, prazoInternoDiasUteis: 3 } as LinhaComparavel;
    expect(diffMatriz([linha], [p]).divergentes).toEqual([]);
  });

  it("ordem de UF ou de flag não é diferença", () => {
    const p = seed({ codigo: "X", ufs: ["SP", "RJ"], condicaoFlags: ["tem_folha", "contribui_icms"] });
    const linha = doBanco(p, { ufs: ["RJ", "SP"], condicaoFlags: ["contribui_icms", "tem_folha"] });
    expect(diffMatriz([linha], [p]).divergentes).toEqual([]);
  });

  it("código do padrão que falta no banco entra em ausentes, não em divergentes", () => {
    const p = seed({ codigo: "NOVA" });
    expect(diffMatriz([], [p])).toEqual({ ausentes: ["NOVA"], divergentes: [] });
  });

  it("obrigação criada pelo escritório não vira divergência — o padrão não opina sobre ela", () => {
    const p = seed({ codigo: "X" });
    const propria = doBanco(seed({ codigo: "ISS-MUNICIPAL" }));
    expect(diffMatriz([doBanco(p), propria], [p]).divergentes).toEqual([]);
  });

  it("base legal ausente no banco diverge do padrão que a define", () => {
    const p = seed({ codigo: "X", baseLegal: "IN RFB nº 2.005/2021" });
    const { divergentes } = diffMatriz([doBanco(p, { baseLegal: null })], [p]);
    expect(divergentes).toHaveLength(1);
    expect(divergentes[0]!.campo).toBe("baseLegal");
  });
});

describe("MATRIZ_PADRAO curada", () => {
  it("toda obrigação padrão declara a base legal", () => {
    for (const o of MATRIZ_PADRAO) {
      expect(o.baseLegal.trim().length, o.codigo).toBeGreaterThan(0);
    }
  });

  // O prazo foi 15, virou 25 (IN 2.237/2024) e hoje é o ÚLTIMO DIA ÚTIL (IN 2.248/2025).
  // Citar a IN instituidora não basta — é o alerta que este teste guarda.
  it("DCTFWeb vence no último dia útil do mês seguinte (IN RFB 2.248/2025)", () => {
    const d = MATRIZ_PADRAO.find((o) => o.codigo === "DCTFWEB");
    expect(d?.vencDia).toBe(31); // com clamp + antecipa = último dia útil
    expect(d?.antecipa).toBe(true);
    expect(d?.baseLegal).toContain("2.248/2025");
  });

  it("onde a norma não cabe no modelo de vencimento, há observação registrada", () => {
    // EFD-Contribuições vence no 10º DIA ÚTIL; o modelo só sabe dia fixo.
    const efd = MATRIZ_PADRAO.find((o) => o.codigo === "EFD-CONTRIB");
    expect(efd?.observacaoCuradoria).toMatch(/dia útil/i);
  });

  it("obrigação que depende de análise caso a caso nasce DESLIGADA, não ausente", () => {
    // DIRBI só é devida por quem usa benefício fiscal; DeSTDA, por parte do Simples com ICMS.
    // Entram documentadas — ligá-las sem análise encheria o calendário de quem não deve nada.
    for (const codigo of ["DIRBI", "DESTDA"]) {
      const o = MATRIZ_PADRAO.find((x) => x.codigo === codigo);
      expect(o, codigo).toBeDefined();
      expect(o?.ativa, codigo).toBe(false);
      expect(o?.observacaoCuradoria, codigo).toMatch(/desligada/i);
    }
  });

  it("as obrigações extintas não voltam para a matriz", () => {
    // DIRF acabou para fatos geradores a partir de 2025 (eSocial + EFD-Reinf assumiram);
    // RAIS e CAGED foram absorvidos pelo eSocial. Incluí-las seria criar prazo inexistente.
    const codigos = MATRIZ_PADRAO.map((o) => o.codigo);
    for (const extinta of ["DIRF", "RAIS", "CAGED"]) expect(codigos).not.toContain(extinta);
  });

  it("toda obrigação filtrada por CNAE diz isso na observação", () => {
    for (const o of MATRIZ_PADRAO.filter((x) => x.cnaePrefixos.length > 0)) {
      expect(o.observacaoCuradoria, o.codigo).toMatch(/cnae/i);
    }
  });
});
