import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TabelaErros } from "@/components/observabilidade/TabelaErros";

const ev = {
  id: "e1",
  criadoEm: "2026-07-22T12:00:00Z",
  mensagem: "boom",
  rota: "/financeiro",
  metodo: "POST",
  digest: "abc",
  stack: "Error: boom\n at x",
};

describe("TabelaErros", () => {
  it("mostra a mensagem, a rota e o método de um erro", () => {
    const html = renderToStaticMarkup(<TabelaErros eventos={[ev]} />);
    expect(html).toContain("boom");
    expect(html).toContain("/financeiro");
    expect(html).toContain("POST");
  });
});
