import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Paginacao } from "@/components/ui/Paginacao";

const render = (props: Partial<Parameters<typeof Paginacao>[0]> = {}) =>
  renderToStaticMarkup(<Paginacao pagina={1} total={650} porPagina={100} base="/clientes" {...props} />);

describe("Paginacao", () => {
  it("não aparece quando tudo cabe numa página", () => {
    expect(render({ total: 100 })).toBe("");
    expect(render({ total: 0 })).toBe("");
  });

  it("mostra o intervalo e o total — não só o número da página", () => {
    expect(render({ pagina: 2 })).toContain("101–200 de 650");
    expect(render({ pagina: 2 })).toContain("página 2 de 7");
  });

  it("na última página, o intervalo não ultrapassa o total", () => {
    expect(render({ pagina: 7 })).toContain("601–650 de 650");
  });

  it("preserva busca e filtro ao paginar (paginar não descarta o que foi filtrado)", () => {
    const html = render({ pagina: 2, params: { q: "padaria", status: "ativo" } });
    expect(html).toMatch(/href="\/clientes\?q=padaria&amp;status=ativo"/); // Anterior volta à 1
    expect(html).toMatch(/href="\/clientes\?q=padaria&amp;status=ativo&amp;pagina=3"/);
  });

  it("a página 1 não carrega ?pagina=1 na URL", () => {
    expect(render({ pagina: 2 })).toMatch(/href="\/clientes"/);
  });

  it("nas bordas, o botão indisponível não vira link", () => {
    const primeira = render({ pagina: 1 });
    expect(primeira).toMatch(/aria-disabled="true"[^>]*>\s*Anterior/);
    const ultima = render({ pagina: 7 });
    expect(ultima).toMatch(/aria-disabled="true"[^>]*>\s*Próxima/);
  });

  it("parâmetro vazio não suja a URL", () => {
    expect(render({ pagina: 2, params: { q: "", status: undefined } })).toMatch(/href="\/clientes"/);
  });
});
