import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/onboarding/template-actions", () => ({
  criarTemplate: vi.fn(),
  salvarTemplate: vi.fn(),
  excluirTemplate: vi.fn(),
  semearTemplatePadrao: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { GerenciadorTemplates } from "@/app/(app)/configuracoes/onboarding/GerenciadorTemplates";

describe("GerenciadorTemplates", () => {
  it("vazio mostra semear", () => {
    const html = renderToStaticMarkup(<GerenciadorTemplates templates={[]} />);
    expect(html).toContain("Semear template padrão");
  });
  it("lista templates", () => {
    const html = renderToStaticMarkup(
      <GerenciadorTemplates
        templates={[
          { id: "t1", nome: "Onboarding padrão", descricao: null, ativo: true, blocos: 7, itens: 36, processos: 1 },
        ]}
      />,
    );
    expect(html).toContain("Onboarding padrão");
    expect(html).toContain("Novo template");
  });
});
