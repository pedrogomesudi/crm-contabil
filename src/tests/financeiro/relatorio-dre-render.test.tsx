import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/financeiro/relatorios/dre/dre-actions", () => ({ relatorioDRE: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { RelatorioDRE } from "@/app/(app)/financeiro/relatorios/dre/RelatorioDRE";
import type { DRE } from "@/lib/financeiro/dre";

const dre: DRE = {
  receitaOperacional: { linhas: [{ nome: "Honorários", valor: 10000 }], total: 10000 },
  despesaOperacional: { linhas: [{ nome: "Salários", valor: 4000 }], total: 4000 },
  resultadoOperacional: 6000,
  receitaNaoOperacional: { linhas: [], total: 0 },
  despesaNaoOperacional: { linhas: [], total: 0 },
  resultadoLiquido: 6000,
};

describe("RelatorioDRE", () => {
  it("renderiza os resultados", () => {
    const html = renderToStaticMarkup(<RelatorioDRE ano={2026} tipo="mes" indice={7} base="competencia" dre={dre} />);
    expect(html).toContain("Resultado operacional");
    expect(html).toContain("Resultado líquido");
    expect(html).toContain("Honorários");
  });
});
