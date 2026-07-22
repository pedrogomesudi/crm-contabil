import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BoletoTitulo } from "@/components/financeiro/BoletoTitulo";

const base = {
  id: "b1",
  numero: 7,
  provedor: "inter",
  vencimento: "2026-08-10",
  linhaDigitavel: "0001",
  pixCopiaCola: null,
  status: "emitido",
};

describe("BoletoTitulo — 2ª via em PDF", () => {
  it("boleto Inter (sem urlPdf) mostra 'Baixar PDF (2ª via)'", () => {
    const html = renderToStaticMarkup(
      <BoletoTitulo tituloId="t1" boleto={{ ...base, urlPdf: null }} onMudou={() => {}} />,
    );
    expect(html).toContain("Baixar PDF (2ª via)");
  });
  it("boleto com urlPdf (Asaas) mostra o link 'PDF' e não o botão novo", () => {
    const html = renderToStaticMarkup(
      <BoletoTitulo tituloId="t1" boleto={{ ...base, urlPdf: "https://x/y.pdf" }} onMudou={() => {}} />,
    );
    expect(html).toContain(">PDF<");
    expect(html).not.toContain("Baixar PDF (2ª via)");
  });
});
