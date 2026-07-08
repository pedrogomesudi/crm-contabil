import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/(app)/financeiro/orcado-realizado/actions", () => ({
  dashboardOrcadoRealizado: vi.fn(),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { DashboardComparativo } from "@/app/(app)/financeiro/orcado-realizado/DashboardComparativo";
import type { Comparativo } from "@/lib/financeiro/orcado-realizado";

const comparativo: Comparativo = {
  grupos: [
    { natureza: "RECEITA", linhas: [{ categoriaId: "h", nome: "Honorários", natureza: "RECEITA", orcado: 100, realizado: 120, varAbs: 20, varPct: 20 }], totalOrcado: 100, totalRealizado: 120, varAbs: 20, varPct: 20 },
    { natureza: "DESPESA", linhas: [{ categoriaId: "f", nome: "Folha", natureza: "DESPESA", orcado: 50, realizado: 60, varAbs: 10, varPct: 20 }], totalOrcado: 50, totalRealizado: 60, varAbs: 10, varPct: 20 },
  ],
  resultado: { orcado: 50, realizado: 60, varAbs: 10, varPct: 20 },
  serieReceita: Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, orcado: 100, realizado: 120 })),
};

describe("DashboardComparativo", () => {
  it("renderiza cartões, categorias e resultado sem lançar", () => {
    const html = renderToStaticMarkup(
      <DashboardComparativo ano={2026} tipo="mes" indice={7} base="competencia" categorias={[]} comparativo={comparativo} />,
    );
    expect(html).toContain("Receitas");
    expect(html).toContain("Honorários");
    expect(html).toContain("Resultado");
  });
});
