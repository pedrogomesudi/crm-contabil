import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/tipos-documento/actions", () => ({
  criarTipoDoc: vi.fn(),
  moverTipoDoc: vi.fn(),
  alternarAtivoTipoDoc: vi.fn(),
  removerTipoDoc: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { TiposDocumentoLista } from "@/app/(app)/configuracoes/tipos-documento/TiposDocumentoLista";

describe("TiposDocumentoLista", () => {
  it("lista os tipos e o formulário de adicionar", () => {
    const html = renderToStaticMarkup(
      <TiposDocumentoLista
        tipos={[{ id: "t1", nome: "Balancete", departamento: "contabil", ordem: 0, ativo: true }]}
      />,
    );
    expect(html).toContain("Balancete");
    expect(html).toContain("Adicionar tipo");
  });
});
