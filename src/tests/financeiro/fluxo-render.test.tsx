import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/exportar/actions", () => ({ exportar: vi.fn() }));
vi.mock("@/app/(app)/financeiro/relatorios/fluxo/fluxo-actions", () => ({
  relatorioFluxo: vi.fn(),
}));
import { renderToStaticMarkup } from "react-dom/server";
import { FluxoCaixaView } from "@/app/(app)/financeiro/relatorios/fluxo/FluxoCaixa";
import type { FluxoCaixa } from "@/lib/financeiro/fluxo-caixa";

const fluxo: FluxoCaixa = {
  entradas: {
    titulo: "Entradas",
    linhas: [{ categoriaId: "r1", nome: "Honorários", valores: [1000, ...Array(11).fill(0)], total: 1000 }],
    totais: [1000, ...Array(11).fill(0)],
    total: 1000,
  },
  saidas: { titulo: "Saídas", linhas: [], totais: Array(12).fill(0), total: 0 },
  resultadoMes: [1000, ...Array(11).fill(0)],
  saldoAcumulado: Array(12).fill(1000),
  saldoInicial: 0,
};

describe("FluxoCaixaView", () => {
  it("renderiza seletor de ano, categoria, saldo acumulado e exportar", () => {
    const html = renderToStaticMarkup(<FluxoCaixaView ano={2026} fluxo={fluxo} mesAtual={7} />);
    expect(html).toContain("2026");
    expect(html).toContain("Honorários");
    expect(html).toContain("Saldo acumulado");
    expect(html).toContain("XLSX"); // exportação nos 3 formatos (RF-075)
  });
});
