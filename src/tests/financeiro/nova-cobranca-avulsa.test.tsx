import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NovaCobrancaAvulsa } from "@/components/financeiro/NovaCobrancaAvulsa";

const clientes = [{ id: "c1", nome: "Padaria X" }];
const categorias = [{ id: "cat1", nome: "Serviços avulsos" }];

describe("NovaCobrancaAvulsa", () => {
  it("mostra os campos, a categoria e o checkbox de boleto", () => {
    const html = renderToStaticMarkup(
      <NovaCobrancaAvulsa
        clientes={clientes}
        categorias={categorias}
        competenciaInicial="2026-07"
        onCriado={vi.fn()}
      />,
    );
    expect(html).toContain("Nova cobrança avulsa");
    expect(html).toContain("Padaria X");
    expect(html).toContain("Serviços avulsos");
    expect(html).toContain("Emitir boleto agora");
    expect(html).toContain("Criar cobrança");
  });

  it("tem o campo de competência com o mês selecionado como padrão", () => {
    const html = renderToStaticMarkup(
      <NovaCobrancaAvulsa
        clientes={clientes}
        categorias={categorias}
        competenciaInicial="2026-07"
        onCriado={vi.fn()}
      />,
    );
    expect(html).toContain("Competência (mês dos serviços prestados)");
    expect(html).toContain('value="2026-07"');
  });
});
