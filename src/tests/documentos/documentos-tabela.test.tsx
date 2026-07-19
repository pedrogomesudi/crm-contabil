import { describe, it, expect, vi } from "vitest";
vi.mock("@/components/documentos/BotaoBaixar", () => ({ BotaoBaixar: () => null }));
vi.mock("@/components/documentos/BotaoExcluirDocumento", () => ({ BotaoExcluirDocumento: () => null }));
vi.mock("@/components/assinatura/StatusAssinatura", () => ({ StatusAssinatura: () => null }));
vi.mock("@/components/assinatura/EnviarAssinatura", () => ({ EnviarAssinatura: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { DocumentosTabela } from "@/components/documentos/DocumentosTabela";

const doc = {
  id: "d1",
  nome: "guia.pdf",
  origem: "escritorio",
  enviado_em: "2026-07-19T00:00:00Z",
  visto: null,
  tipo: "Guia",
  departamento: "fiscal",
  competencia: "2026-07-01",
  ehContrato: false,
  assinatura: null,
  substitui_id: null,
  anteriores: [],
};

describe("DocumentosTabela", () => {
  it("mostra colunas de departamento e competência", () => {
    const html = renderToStaticMarkup(
      <DocumentosTabela docs={[doc]} clienteId="c1" clienteNome="X" clienteEmail="x@x" podeGerenciar ehAdmin={false} />,
    );
    expect(html).toContain("Departamento");
    expect(html).toContain("Competência");
    expect(html).toContain("Guia");
    expect(html).toContain("07/2026");
    expect(html).toContain("Fiscal");
  });

  it("mostra o selo de versões quando há anteriores", () => {
    const anterior = { ...doc, id: "d0", nome: "guia-v1.pdf" };
    const atual = { ...doc, id: "d1", nome: "guia-v2.pdf", substitui_id: "d0", anteriores: [anterior] };
    const html = renderToStaticMarkup(
      <DocumentosTabela
        docs={[atual]}
        clienteId="c1"
        clienteNome="X"
        clienteEmail="x@x"
        podeGerenciar
        ehAdmin={false}
      />,
    );
    expect(html).toContain("guia-v2.pdf");
    expect(html).toContain("versões");
    expect(html).toContain("guia-v1.pdf");
  });
});
