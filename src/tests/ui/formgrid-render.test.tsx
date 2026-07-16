import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FormGrid, FormCampo } from "@/components/ui/FormGrid";

describe("FormGrid", () => {
  it("é um grid de 12 colunas", () => {
    expect(renderToStaticMarkup(<FormGrid>x</FormGrid>)).toContain("md:grid-cols-12");
  });

  it("colapsa para 1 coluna no mobile (hoje 40 grids espremem em 2)", () => {
    expect(renderToStaticMarkup(<FormGrid>x</FormGrid>)).toContain("grid-cols-1");
  });
});

describe("FormCampo", () => {
  it("aplica o span pedido só a partir de md", () => {
    const html = renderToStaticMarkup(
      <FormCampo label="UF" span={1}>
        <input name="uf" />
      </FormCampo>,
    );
    expect(html).toContain("md:col-span-1");
  });

  it("preserva o contrato do campo: label associado e o controle intacto", () => {
    const html = renderToStaticMarkup(
      <FormCampo label="CEP" span={2} hint="só números">
        <input name="cep" defaultValue="38400000" />
      </FormCampo>,
    );
    expect(html).toContain("CEP");
    expect(html).toContain('name="cep"');
    expect(html).toContain('value="38400000"');
    expect(html).toContain("só números");
  });
});
