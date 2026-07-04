import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LogoSaldo } from "@/components/marca/LogoSaldo";

describe("LogoSaldo", () => {
  it("renderiza o símbolo (svg) e o wordmark por padrão", () => {
    const html = renderToStaticMarkup(<LogoSaldo />);
    expect(html).toContain("<svg");
    expect(html).toContain("Saldo");
  });
  it("variante simbolo não traz o wordmark", () => {
    const html = renderToStaticMarkup(<LogoSaldo variante="simbolo" />);
    expect(html).toContain("<svg");
    expect(html).not.toContain("Saldo");
  });
});
