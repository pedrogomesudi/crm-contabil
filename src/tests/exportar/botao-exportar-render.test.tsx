import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/exportar/actions", () => ({ exportar: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { BotaoExportar } from "@/components/ui/BotaoExportar";
import type { RelatorioExportavel } from "@/lib/exportar/tipos";

const rel: RelatorioExportavel = {
  titulo: "Rentabilidade",
  colunas: [{ chave: "cliente", rotulo: "Cliente", formato: "texto" }],
  linhas: [{ cliente: "Acme Ltda" }],
};

describe("BotaoExportar", () => {
  it("oferece os três formatos", () => {
    const html = renderToStaticMarkup(<BotaoExportar relatorio={rel} />);
    expect(html).toContain("XLSX");
    expect(html).toContain("PDF");
    expect(html).toContain("CSV");
  });
});
