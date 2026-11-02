import { describe, it, expect } from "vitest";
import { identificacaoBoleto, linhasObservacaoBoleto, empacotarLinhas } from "@/lib/boleto/emissao";

describe("identificacaoBoleto", () => {
  it("mensalidade: razão social e competência", () => {
    expect(identificacaoBoleto("GOMES ADVOCACIA", "MENSALIDADE", "2026-10-01")).toBe(
      "GOMES ADVOCACIA — competência 10/2026",
    );
  });

  it("décimo terceiro: honorário de encerramento anual, sem competência", () => {
    expect(identificacaoBoleto("GOMES ADVOCACIA", "DECIMO_TERCEIRO", "2026-12-01")).toBe(
      "GOMES ADVOCACIA — honorário de encerramento anual",
    );
  });

  it("avulso não recebe observação", () => {
    expect(identificacaoBoleto("GOMES ADVOCACIA", "RECEITA_AVULSA", "2026-10-01")).toBe(null);
  });

  it("mensalidade sem competência não inventa texto", () => {
    expect(identificacaoBoleto("GOMES ADVOCACIA", "MENSALIDADE", null)).toBe(null);
  });

  it("aceita competência já no formato YYYY-MM", () => {
    expect(identificacaoBoleto("ACME", "MENSALIDADE", "2026-01")).toBe("ACME — competência 01/2026");
  });
});

describe("linhasObservacaoBoleto", () => {
  it("uma linha quando cabe", () => {
    expect(linhasObservacaoBoleto("ACME LTDA", "MENSALIDADE", "2026-10-01")).toEqual([
      "ACME LTDA — competência 10/2026",
    ]);
  });

  it("quebra em duas linhas em vez de truncar a razão social", () => {
    const longa = "A".repeat(70);
    expect(linhasObservacaoBoleto(longa, "MENSALIDADE", "2026-10-01")).toEqual([longa, "Competência 10/2026"]);
  });

  it("décimo terceiro comprido também quebra", () => {
    const longa = "A".repeat(60);
    expect(linhasObservacaoBoleto(longa, "DECIMO_TERCEIRO", "2026-12-01")).toEqual([
      longa,
      "Honorário de encerramento anual",
    ]);
  });

  it("avulso sai sem nenhuma linha", () => {
    expect(linhasObservacaoBoleto("ACME", "RECEITA_AVULSA", "2026-10-01")).toEqual([]);
  });
});

describe("empacotarLinhas", () => {
  it("junta vários itens por linha, separados por vírgula", () => {
    expect(empacotarLinhas(["A — competência 10/2026", "B — competência 10/2026"])).toEqual([
      "A — competência 10/2026, B — competência 10/2026",
    ]);
  });

  it("abre linha nova quando a vírgula não cabe", () => {
    const r = empacotarLinhas([`${"A".repeat(50)}`, `${"B".repeat(50)}`]);
    expect(r).toHaveLength(2);
    expect(r[0]).toBe("A".repeat(50));
  });

  it("nenhuma linha passa do limite de caracteres", () => {
    const itens = Array.from({ length: 14 }, (_, i) => `EMPRESA ${i} PARTICIPACOES LTDA — competência 10/2026`);
    for (const l of empacotarLinhas(itens)) expect(l.length).toBeLessThanOrEqual(78);
  });

  it("o que não cabe nas 5 linhas do Inter vira resumo, em vez de desaparecer", () => {
    const itens = Array.from({ length: 14 }, () => "X".repeat(60));
    const r = empacotarLinhas(itens);
    expect(r).toHaveLength(5);
    expect(r[4]).toMatch(/e mais \d+ empresas$/);
  });

  it("resumo no singular com um excedente", () => {
    const itens = Array.from({ length: 6 }, () => "X".repeat(70));
    expect(empacotarLinhas(itens, 5)[4]).toBe("e mais 2 empresas");
  });

  it("o corte é em empresa inteira — nenhum nome aparece pela metade", () => {
    const itens = Array.from({ length: 14 }, (_, i) => `EMPRESA ${i} PARTICIPACOES LTDA — competência 10/2026`);
    const r = empacotarLinhas(itens);
    const impressas = r
      .join(", ")
      .replace(/, e mais \d+ empresas?$/, "")
      .split(", ");
    for (const nome of impressas) expect(itens).toContain(nome);
  });

  it("lista vazia não gera linha", () => {
    expect(empacotarLinhas([])).toEqual([]);
  });
});
