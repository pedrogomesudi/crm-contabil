import { describe, it, expect, vi } from "vitest";
vi.mock("@/components/documentos/BotaoBaixar", () => ({ BotaoBaixar: () => null }));
import { renderToStaticMarkup } from "react-dom/server";
import { TabelaResultadosBusca } from "@/components/documentos/TabelaResultadosBusca";

const doc = {
  id: "d1",
  nome: "guia.pdf",
  clienteId: "c1",
  clienteNome: "Padaria X",
  tipo: "Guia",
  departamento: "fiscal",
  competencia: "2026-07-01",
  enviado_em: "2026-07-19T00:00:00Z",
  textoStatus: "ok",
};

describe("TabelaResultadosBusca", () => {
  it("mostra nome, cliente e competência", () => {
    const html = renderToStaticMarkup(<TabelaResultadosBusca docs={[doc]} />);
    expect(html).toContain("guia.pdf");
    expect(html).toContain("Padaria X");
    expect(html).toContain("07/2026");
    expect(html).toContain("Fiscal");
  });
  it("sinaliza digitalização sem texto pesquisável", () => {
    const html = renderToStaticMarkup(<TabelaResultadosBusca docs={[{ ...doc, textoStatus: "vazio" }]} />);
    expect(html).toContain("sem texto pesquisável");
  });
  it("estado vazio", () => {
    const html = renderToStaticMarkup(<TabelaResultadosBusca docs={[]} />);
    expect(html).toContain("Nenhum documento");
  });
});
