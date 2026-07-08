import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/(app)/financeiro/orcamento/actions", () => ({
  listarOrcamento: vi.fn(),
  salvarOrcamento: vi.fn(),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { GradeOrcamento } from "@/app/(app)/financeiro/orcamento/GradeOrcamento";

const cats = [
  { id: "a", nome: "Honorários", natureza: "RECEITA" as const, ordem_dre: 1 },
  { id: "b", nome: "Folha", natureza: "DESPESA" as const, ordem_dre: 1 },
];

describe("GradeOrcamento", () => {
  it("renderiza os grupos e categorias sem lançar", () => {
    const html = renderToStaticMarkup(<GradeOrcamento ano={2026} categorias={cats} valores={{ a: { 1: 100 } }} />);
    expect(html).toContain("RECEITAS");
    expect(html).toContain("Honorários");
    expect(html).toContain("Folha");
  });
});
