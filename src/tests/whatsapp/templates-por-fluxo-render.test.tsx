import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/whatsapp/actions", () => ({
  salvarTemplateFluxo: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { TemplatesPorFluxo } from "@/components/whatsapp/TemplatesPorFluxo";

describe("TemplatesPorFluxo", () => {
  it("lista os fluxos, o contrato de parâmetros e o estado", () => {
    const html = renderToStaticMarkup(
      <TemplatesPorFluxo
        configurados={{ regua: { nome: "cobranca", idioma: "pt_BR" } }}
        disponiveis={[{ nome: "cobranca", idioma: "pt_BR", status: "aprovado" }]}
        erroListagem={null}
      />,
    );
    expect(html).toContain("Templates por fluxo");
    expect(html).toContain("Régua de cobrança");
    expect(html).toContain("{{1}}"); // contrato de parâmetros
    expect(html).toContain("cliente");
    expect(html).toContain("aprovado");
  });

  it("fluxo sem template configurado aparece como não configurado", () => {
    const html = renderToStaticMarkup(
      <TemplatesPorFluxo configurados={{}} disponiveis={[]} erroListagem={null} />,
    );
    expect(html).toContain("não configurado");
  });

  it("template configurado que a Meta reprovou aparece como reprovado", () => {
    const html = renderToStaticMarkup(
      <TemplatesPorFluxo
        configurados={{ regua: { nome: "velho", idioma: "pt_BR" } }}
        disponiveis={[{ nome: "velho", idioma: "pt_BR", status: "reprovado" }]}
        erroListagem={null}
      />,
    );
    expect(html).toContain("reprovado");
  });

  it("falha da listagem explica e oferece digitar à mão", () => {
    const html = renderToStaticMarkup(
      <TemplatesPorFluxo
        configurados={{}}
        disponiveis={[]}
        erroListagem="Não foi possível listar os templates (HTTP 403)."
      />,
    );
    expect(html).toContain("HTTP 403");
    expect(html).toMatch(/à mão|manual/i);
  });
});
