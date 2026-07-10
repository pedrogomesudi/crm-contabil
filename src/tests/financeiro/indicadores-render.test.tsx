import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Indicadores } from "@/app/(app)/financeiro/indicadores/Indicadores";
import type { ResumoMetricas } from "@/lib/financeiro/metricas";

const resumo: ResumoMetricas = {
  serie: [{ mes: "2026-07", base: 99, novos: 1, churn: 0, liquido: 1, ativosFim: 100, churnPct: 0, churnReceita: 0, mrr: 36000, ticketMedio: 360, estimado: false }],
  atual: { mrr: 36000, ticketMedio: 360, ativos: 100, churnPct: 0, churnReceita: 0 },
};

describe("Indicadores", () => {
  it("mostra o cabeçalho da tabela e a linha do mês", () => {
    const html = renderToStaticMarkup(<Indicadores resumo={resumo} />);
    expect(html).toContain("Churn %");
    expect(html).toContain("2026-07");
  });
});
