import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/tipos-documento/actions", () => ({
  criarTipoDoc: vi.fn(),
  moverTipoDoc: vi.fn(),
  alternarAtivoTipoDoc: vi.fn(),
  removerTipoDoc: vi.fn(),
  definirRetencaoTipo: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { TiposDocumentoLista } from "@/app/(app)/configuracoes/tipos-documento/TiposDocumentoLista";

describe("TiposDocumentoLista", () => {
  it("lista os tipos, a retenção e o formulário de adicionar", () => {
    const html = renderToStaticMarkup(
      <TiposDocumentoLista
        tipos={[{ id: "t1", nome: "Balancete", departamento: "contabil", retencaoMeses: 24, ordem: 0, ativo: true }]}
        global={60}
      />,
    );
    expect(html).toContain("Balancete");
    expect(html).toContain("Adicionar tipo");
    expect(html).toContain("retenção");
  });
});
