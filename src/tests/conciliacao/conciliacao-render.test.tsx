import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/financeiro/conciliacao/actions", () => ({
  importarMovimentos: vi.fn(),
  jaImportados: vi.fn(),
  listarMovimentos: vi.fn(),
}));
vi.mock("@/app/(app)/financeiro/conciliacao/conciliar-actions", () => ({
  candidatosDoMovimento: vi.fn(),
  conciliarComBaixa: vi.fn(),
  conciliarComTitulo: vi.fn(),
  criarLancamento: vi.fn(),
  ignorarMovimento: vi.fn(),
  reabrirMovimento: vi.fn(),
  conciliarAutomaticos: vi.fn(),
}));
import { renderToStaticMarkup } from "react-dom/server";
import { Conciliacao } from "@/app/(app)/financeiro/conciliacao/Conciliacao";
import type { MovimentoView } from "@/app/(app)/financeiro/conciliacao/actions";

const movs: MovimentoView[] = [
  { id: "1", data: "2026-07-01", descricao: "PIX RECEBIDO", valor: 1500, status: "pendente" },
];

describe("Conciliacao", () => {
  it("renderiza seletor de conta, upload e a lista", () => {
    const html = renderToStaticMarkup(
      <Conciliacao
        contas={[{ id: "c1", nome: "Nubank" }]}
        inicio="2026-07-01"
        fim="2026-07-31"
        contaInicial="c1"
        movimentosIni={movs}
        categorias={[]}
        clientes={[]}
        fornecedores={[]}
      />,
    );
    expect(html).toContain("Nubank");
    expect(html).toContain("PIX RECEBIDO");
    expect(html).toContain("Importar extrato");
  });
});
