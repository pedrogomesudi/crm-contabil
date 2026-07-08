import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/onboarding/template-actions", () => ({ salvarTemplate: vi.fn(), criarBloco: vi.fn(), salvarBloco: vi.fn(), removerBloco: vi.fn(), moverBloco: vi.fn(), moverItem: vi.fn(), salvarTemplateItem: vi.fn(), removerTemplateItem: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { EditorTemplate } from "@/app/(app)/configuracoes/onboarding/EditorTemplate";

const template = {
  id: "t1",
  slug: "s",
  nome: "Padrão",
  descricao: null,
  ativo: true,
  blocos: [
    {
      id: "b1",
      ordem: 1,
      nome: "Formalização",
      prazoBlocoDias: 3,
      itens: [
        { id: "i1", blocoId: "b1", codigo: "1.1", titulo: "Contrato", descricao: null, tipo: "padrao" as const, responsavelPapel: "admin", prazoDias: 0, aplicavelA: ["*"], condicaoFlags: [], condicaoModo: "all" as const, bloqueante: true, anexoObrigatorio: true, alertaRisco: null, ordem: 1, dependeDe: [], campoDestino: null },
      ],
    },
  ],
};

describe("EditorTemplate", () => {
  it("renderiza blocos e itens", () => {
    const html = renderToStaticMarkup(<EditorTemplate template={template} />);
    expect(html).toContain("Formalização");
    expect(html).toContain("Contrato");
    expect(html).toContain("+ bloco");
  });
});
