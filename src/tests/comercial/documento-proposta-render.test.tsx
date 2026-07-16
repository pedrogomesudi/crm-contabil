import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DocumentoProposta } from "@/app/(app)/comercial/propostas/[id]/documento/DocumentoProposta";
import type { PropostaView } from "@/app/(app)/comercial/propostas-actions";

const proposta: PropostaView = {
  id: "p1",
  numero: 7,
  status: "enviada",
  validade: "2026-08-01",
  observacoes: "Pagamento até dia 10.",
  oportunidadeId: "o1",
  prospectNome: "ACME LTDA",
  contatoNome: "João",
  itens: [
    { id: "i1", descricao: "Honorário mensal", valor: 500, recorrencia: "mensal", ordem: 0 },
    { id: "i2", descricao: "Abertura", valor: 900, recorrencia: "unico", ordem: 1 },
  ],
  pagamento: {
    pixChave: "12345",
    banco: "Inter",
    agencia: "0001",
    conta: "99",
    titular: "Contabilidade X",
    documento: "00.000.000/0001-00",
  },
  responsavel: { nome: null, email: null, telefone: null },
};

describe("DocumentoProposta", () => {
  it("renderiza cabeçalho, prospect, totais e pagamento", () => {
    const marca = { nome: "Contabilidade X", cnpj: "11.222.333/0001-81", enderecoLinha: "Uberlândia/MG" };
    const html = renderToStaticMarkup(
      <DocumentoProposta proposta={proposta} hoje="2026-07-08" marca={marca} logoUrl={null} />,
    );
    expect(html).toContain("Proposta de Honorários");
    expect(html).toContain("ACME LTDA");
    expect(html).toContain("Contabilidade X");
    expect(html).toContain("CNPJ 11.222.333/0001-81");
    expect(html).toContain("Dados para pagamento");
  });
});
