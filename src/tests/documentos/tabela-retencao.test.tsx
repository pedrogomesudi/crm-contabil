import { describe, it, expect, vi } from "vitest";
vi.mock("@/components/documentos/BotaoBaixar", () => ({ BotaoBaixar: () => null }));
vi.mock("@/components/documentos/BotaoExpurgar", () => ({ BotaoExpurgar: () => null }));
import { renderToStaticMarkup } from "react-dom/server";
import { TabelaRetencao } from "@/components/documentos/TabelaRetencao";

const d = {
  id: "d1",
  nome: "guia.pdf",
  clienteId: "c1",
  clienteNome: "Padaria X",
  tipo: "Guia",
  competencia: "2019-07-01",
  venceEm: "2024-07-01",
};

describe("TabelaRetencao", () => {
  it("mostra o vencido com vence_em", () => {
    const html = renderToStaticMarkup(<TabelaRetencao docs={[d]} />);
    expect(html).toContain("guia.pdf");
    expect(html).toContain("Padaria X");
    expect(html).toContain("Vence");
  });
  it("vazio", () => {
    expect(renderToStaticMarkup(<TabelaRetencao docs={[]} />)).toContain("Nenhum documento vencido");
  });
});
