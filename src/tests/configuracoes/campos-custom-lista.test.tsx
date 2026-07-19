import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/campos-custom/actions", () => ({
  criarCampo: vi.fn(),
  moverCampo: vi.fn(),
  alternarAtivo: vi.fn(),
  removerCampo: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { CamposCustomLista } from "@/app/(app)/configuracoes/campos-custom/CamposCustomLista";

describe("CamposCustomLista", () => {
  it("lista os campos e o formulário de adicionar", () => {
    const html = renderToStaticMarkup(
      <CamposCustomLista
        campos={[
          { id: "f1", nome: "Segmento", tipo: "lista", obrigatorio: true, opcoes: ["A"], ordem: 0, ativo: true },
        ]}
      />,
    );
    expect(html).toContain("Segmento");
    expect(html).toContain("Adicionar campo");
  });
});
