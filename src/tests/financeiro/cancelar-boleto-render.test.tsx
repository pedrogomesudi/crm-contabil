import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BoletoTitulo } from "@/components/financeiro/BoletoTitulo";

const base = { id: "b1", numero: 7, provedor: "inter", linhaDigitavel: "0001", pixCopiaCola: null, urlPdf: null };

describe("BoletoTitulo — cancelar", () => {
  it("boleto emitido mostra 'Cancelar boleto'", () => {
    const html = renderToStaticMarkup(
      <BoletoTitulo tituloId="t1" boleto={{ ...base, status: "emitido" }} onMudou={() => {}} />,
    );
    expect(html).toContain("Cancelar boleto");
  });
  it("boleto pago não mostra 'Cancelar boleto'", () => {
    const html = renderToStaticMarkup(
      <BoletoTitulo tituloId="t1" boleto={{ ...base, status: "pago" }} onMudou={() => {}} />,
    );
    expect(html).not.toContain("Cancelar boleto");
  });
});
