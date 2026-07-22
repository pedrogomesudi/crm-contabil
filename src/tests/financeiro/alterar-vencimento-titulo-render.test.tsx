import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AlterarVencimentoTitulo } from "@/components/financeiro/AlterarVencimentoTitulo";

describe("AlterarVencimentoTitulo", () => {
  it("mostra o botão 'Alterar vencimento'", () => {
    const html = renderToStaticMarkup(
      <AlterarVencimentoTitulo tituloId="t1" vencimento="2026-07-10" onMudou={() => {}} />,
    );
    expect(html).toContain("Alterar vencimento");
  });
});
