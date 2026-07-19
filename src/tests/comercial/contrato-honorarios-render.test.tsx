import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ContratoHonorarios } from "@/app/(app)/comercial/propostas/[id]/ContratoHonorarios";
import { passosContrato } from "@/lib/comercial/contratoProposta";

const estado = {
  oportunidadeId: "op1",
  clienteId: "cli1",
  contratoDocId: "doc1",
  assinaturaStatus: "enviado",
  propostaAceita: true,
};

describe("ContratoHonorarios", () => {
  it("renderiza os três passos e o status da assinatura", () => {
    const html = renderToStaticMarkup(
      <ContratoHonorarios passos={passosContrato(estado)} propostaAceita concluido={false} />,
    );
    expect(html).toContain("Contrato de honorários");
    expect(html).toContain("Converter em cliente");
    expect(html).toContain("Gerar contrato");
    expect(html).toContain("Enviar para assinatura");
    expect(html).toContain("Enviado — aguardando assinatura");
  });
  it("nota quando a proposta não está aceita", () => {
    const html = renderToStaticMarkup(
      <ContratoHonorarios
        passos={passosContrato({ ...estado, clienteId: null, contratoDocId: null, assinaturaStatus: null })}
        propostaAceita={false}
        concluido={false}
      />,
    );
    expect(html).toContain("Marque a proposta como aceita");
  });
});
