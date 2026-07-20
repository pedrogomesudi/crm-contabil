import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BaixarBoletoPdf } from "@/app/(portal)/portal/boletos/BaixarBoletoPdf";

describe("BaixarBoletoPdf", () => {
  it("mostra o botão de baixar o PDF", () => {
    const html = renderToStaticMarkup(<BaixarBoletoPdf id="b1" />);
    expect(html).toContain("baixar boleto (PDF)");
  });
});
