import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/comercial/propostas-actions", () => ({ salvarProposta: vi.fn(), definirStatusProposta: vi.fn() }));
vi.mock("@/app/(app)/comercial/propostas/[id]/gerar-actions", () => ({ gerarDocumentoProposta: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { EditorProposta } from "@/app/(app)/comercial/propostas/[id]/EditorProposta";
import type { PropostaView } from "@/app/(app)/comercial/propostas-actions";
import type { ConfigPreco } from "@/lib/comercial/precificacao";

const config: ConfigPreco = {
  baseRegime: {},
  faturamento: { modo: "faixas", valorUnitario: 0, franquia: 0, faixas: [] },
  funcionarios: { modo: "faixas", valorUnitario: 0, franquia: 0, faixas: [] },
  notas: { modo: "faixas", valorUnitario: 0, franquia: 0, faixas: [] },
  complexidades: [],
  servicos: [],
  valorMinimo: 0,
  descontoMaximoPct: 0,
};

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
      <EditorProposta
        proposta={proposta}
        responsavelPadrao={{ nome: "Pedro", email: "p@e.com" }}
        config={config}
        complexidades={[]}
        servicos={[]}
      />,
    );
    expect(html).toContain("Honorário mensal");
    expect(html).toContain("Ver documento");
    expect(html).toContain("Mensal");
    expect(html).toContain("Calcular honorários");
  });
});
