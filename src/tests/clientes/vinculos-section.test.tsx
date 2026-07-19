import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/clientes/[id]/vinculos-actions", () => ({
  definirGrupo: vi.fn(),
  criarGrupo: vi.fn(),
  definirMatriz: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { VinculosSection } from "@/components/clientes/VinculosSection";

describe("VinculosSection", () => {
  it("renderiza grupo, matriz/filial e empresas relacionadas", () => {
    const html = renderToStaticMarkup(
      <VinculosSection
        clienteId="a"
        podeEditar
        grupo={{ id: "g1", nome: "Grupo Alfa" }}
        gruposDisponiveis={[{ id: "g1", nome: "Grupo Alfa" }]}
        matriz={null}
        filiais={[{ id: "f1", razao_social: "Filial Um" }]}
        candidatosMatriz={[]}
        relacionadas={[{ clienteId: "f1", nome: "Filial Um", tipos: ["filial"] }]}
      />,
    );
    expect(html).toContain("Vínculos");
    expect(html).toContain("Grupo Alfa");
    expect(html).toContain("Filial Um");
  });

  it("estado vazio: sem grupo e como matriz sem filiais", () => {
    const html = renderToStaticMarkup(
      <VinculosSection
        clienteId="a"
        podeEditar
        grupo={null}
        gruposDisponiveis={[]}
        matriz={null}
        filiais={[]}
        candidatosMatriz={[]}
        relacionadas={[]}
      />,
    );
    expect(html).toContain("sem grupo");
    expect(html).toContain("Matriz");
  });
});
