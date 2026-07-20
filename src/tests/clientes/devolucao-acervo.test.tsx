import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/clientes/[id]/acervo-actions", () => ({ gerarPacoteDevolucao: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { DevolucaoAcervo } from "@/components/clientes/DevolucaoAcervo";

describe("DevolucaoAcervo", () => {
  it("mostra o botão de gerar o pacote", () => {
    const html = renderToStaticMarkup(<DevolucaoAcervo clienteId="c1" />);
    expect(html).toContain("Devolução de acervo");
    expect(html).toContain("Gerar pacote");
  });
});
