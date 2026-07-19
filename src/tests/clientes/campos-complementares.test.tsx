import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CamposComplementares } from "@/components/clientes/CamposComplementares";

describe("CamposComplementares", () => {
  it("renderiza um controle por campo, pré-preenchendo o valor atual", () => {
    const html = renderToStaticMarkup(
      <CamposComplementares
        campos={[
          { id: "seg", nome: "Segmento", tipo: "lista", obrigatorio: true, opcoes: ["Comércio", "Serviço"] },
          { id: "fat", nome: "Faturamento", tipo: "numero", obrigatorio: false, opcoes: [] },
        ]}
        valores={{ fat: 5000 }}
      />,
    );
    expect(html).toContain("Segmento");
    expect(html).toContain("Comércio");
    expect(html).toContain('name="custom_fat"');
    expect(html).toContain("5000");
  });

  it("nada renderiza quando não há campos", () => {
    const html = renderToStaticMarkup(<CamposComplementares campos={[]} valores={{}} />);
    expect(html).toBe("");
  });
});
