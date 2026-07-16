import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/financeiro/conciliacao/conciliar-actions", () => ({
  candidatosDoMovimento: vi.fn(),
  conciliarComBaixa: vi.fn(),
  conciliarComTitulo: vi.fn(),
  criarLancamento: vi.fn(),
  ignorarMovimento: vi.fn(),
  reabrirMovimento: vi.fn(),
}));
import { renderToStaticMarkup } from "react-dom/server";
import { AcaoMovimento } from "@/app/(app)/financeiro/conciliacao/AcaoMovimento";

describe("AcaoMovimento", () => {
  it("linha pendente mostra Conciliar", () => {
    const html = renderToStaticMarkup(
      <AcaoMovimento
        mov={{ id: "1", data: "2026-08-20", descricao: "PIX", valor: 300, status: "pendente" }}
        categorias={[]}
        clientes={[]}
        fornecedores={[]}
        onDone={() => {}}
      />,
    );
    expect(html).toContain("Conciliar");
  });
  it("linha conciliada mostra Reabrir", () => {
    const html = renderToStaticMarkup(
      <AcaoMovimento
        mov={{ id: "1", data: "2026-08-20", descricao: "PIX", valor: 300, status: "conciliada" }}
        categorias={[]}
        clientes={[]}
        fornecedores={[]}
        onDone={() => {}}
      />,
    );
    expect(html).toContain("Reabrir");
  });
});
