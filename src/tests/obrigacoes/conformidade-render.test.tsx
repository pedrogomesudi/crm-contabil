import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/obrigacoes/conformidade-actions", () => ({ relatorioConformidade: vi.fn() }));
vi.mock("@/app/(app)/exportar/actions", () => ({ exportar: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { RelatorioConformidade } from "@/app/(app)/obrigacoes/conformidade/RelatorioConformidade";
import type { RelatorioConformidade as Rel } from "@/app/(app)/obrigacoes/conformidade-actions";

const dados: Rel = {
  geral: {
    total: 4,
    noPrazo: 1,
    comAtraso: 1,
    pendenteVencida: 1,
    pendenteNoPrazo: 0,
    dispensada: 1,
    pctConformidade: 33,
  },
  porCliente: [
    {
      clienteNome: "ACME LTDA",
      resumo: {
        total: 4,
        noPrazo: 1,
        comAtraso: 1,
        pendenteVencida: 1,
        pendenteNoPrazo: 0,
        dispensada: 1,
        pctConformidade: 33,
      },
    },
  ],
};

describe("RelatorioConformidade", () => {
  it("mostra o % geral e a linha do cliente", () => {
    const html = renderToStaticMarkup(<RelatorioConformidade ano={2026} mes={7} dados={dados} />);
    expect(html).toContain("33%");
    expect(html).toContain("ACME LTDA");
    expect(html).toContain("XLSX"); // exportação nos 3 formatos (RF-075)
  });
});
