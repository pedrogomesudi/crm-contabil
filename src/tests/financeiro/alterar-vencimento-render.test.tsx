import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BoletoTitulo } from "@/components/financeiro/BoletoTitulo";

const base = {
  id: "b1",
  numero: 7,
  vencimento: "2026-08-10",
  provedor: "inter",
  linhaDigitavel: "0001",
  pixCopiaCola: null,
  urlPdf: null,
};

describe("BoletoTitulo — alterar vencimento", () => {
  it("boleto emitido mostra 'Alterar vencimento'", () => {
    const html = renderToStaticMarkup(
      <BoletoTitulo tituloId="t1" boleto={{ ...base, status: "emitido" }} onMudou={() => {}} />,
    );
    expect(html).toContain("Alterar vencimento");
  });

  it("boleto pago não mostra 'Alterar vencimento'", () => {
    const html = renderToStaticMarkup(
      <BoletoTitulo tituloId="t1" boleto={{ ...base, status: "pago" }} onMudou={() => {}} />,
    );
    expect(html).not.toContain("Alterar vencimento");
  });
});
