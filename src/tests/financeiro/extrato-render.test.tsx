import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/exportar/actions", () => ({ exportar: vi.fn() }));
vi.mock("@/app/(app)/financeiro/relatorios/extrato/extrato-actions", () => ({
  listarLancamentos: vi.fn(),
  listarBaixas: vi.fn(),
}));
import { renderToStaticMarkup } from "react-dom/server";
import { Extrato } from "@/app/(app)/financeiro/relatorios/extrato/Extrato";
import type { LancamentoRow } from "@/app/(app)/financeiro/relatorios/extrato/extrato-actions";

const lanc: LancamentoRow[] = [
  {
    id: "1",
    cliente: "ACME LTDA",
    tipo: "RECEBER",
    descricao: "Mensalidade",
    categoria: "Honorários",
    competencia: "2026-07-01",
    vencimento: "2026-07-10",
    valor: 300,
    baixado: 0,
    status: "ABERTO",
  },
];

describe("Extrato", () => {
  it("renderiza alternador, tabela e exportar", () => {
    const html = renderToStaticMarkup(
      <Extrato
        categorias={[{ id: "c1", nome: "Honorários" }]}
        inicio="2026-07-01"
        fim="2026-07-31"
        lancamentosIni={lanc}
      />,
    );
    expect(html).toContain("Lançamentos");
    expect(html).toContain("ACME LTDA");
    expect(html).toContain("XLSX"); // exportação nos 3 formatos (RF-075)
  });
});
