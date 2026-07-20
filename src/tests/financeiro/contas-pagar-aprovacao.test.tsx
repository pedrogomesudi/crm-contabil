import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/financeiro/contas-a-pagar/actions", () => ({
  listarTitulosPagar: vi.fn(async () => []),
  gerarDespesasRecorrentes: vi.fn(),
  registrarPagamento: vi.fn(),
  aprovarTitulo: vi.fn(),
  lancarDespesa: vi.fn(),
}));
import { renderToStaticMarkup } from "react-dom/server";
import { ContasPagar } from "@/components/financeiro/ContasPagar";

describe("ContasPagar com aprovação", () => {
  it("renderiza sem quebrar com papel/perfil (admin)", () => {
    const html = renderToStaticMarkup(
      <ContasPagar contas={[]} fornecedores={[]} categorias={[]} papel="admin" perfilId="u1" />,
    );
    expect(html).toContain("Lançar despesa");
  });
});
