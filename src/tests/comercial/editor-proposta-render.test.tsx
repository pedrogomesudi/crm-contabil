import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/comercial/propostas-actions", () => ({ salvarProposta: vi.fn(), definirStatusProposta: vi.fn() }));
vi.mock("@/app/(app)/comercial/propostas/[id]/gerar-actions", () => ({ gerarDocumentoProposta: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { EditorProposta } from "@/app/(app)/comercial/propostas/[id]/EditorProposta";
import type { PropostaView } from "@/app/(app)/comercial/propostas-actions";

const proposta: PropostaView = {
  id: "p1",
  numero: 1,
  status: "rascunho",
  validade: null,
  observacoes: null,
  oportunidadeId: "o1",
  prospectNome: "ACME",
  contatoNome: "João",
  itens: [{ id: "i1", descricao: "Honorário mensal", valor: 500, recorrencia: "mensal", ordem: 0 }],
  pagamento: { pixChave: null, banco: null, agencia: null, conta: null, titular: null, documento: null },
  responsavel: { nome: null, email: null, telefone: null },
};

describe("EditorProposta", () => {
  it("renderiza itens e total", () => {
    const html = renderToStaticMarkup(
      <EditorProposta proposta={proposta} responsavelPadrao={{ nome: "Pedro", email: "p@e.com" }} />,
    );
    expect(html).toContain("Honorário mensal");
    expect(html).toContain("Ver documento");
    expect(html).toContain("Mensal");
  });
});
