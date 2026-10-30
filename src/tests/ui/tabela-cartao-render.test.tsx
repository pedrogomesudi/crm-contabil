import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { TabelaCartao } from "@/components/ui/TabelaCartao";

describe("TabelaCartao", () => {
  it("aplica a classe que o CSS do cartão procura", () => {
    const html = renderToStaticMarkup(
      <TabelaCartao>
        <table>
          <tbody>
            <tr>
              <td data-rotulo="Cliente">Padaria</td>
            </tr>
          </tbody>
        </table>
      </TabelaCartao>,
    );
    expect(html).toContain("tabela-cartao");
  });

  it("mantém rolagem horizontal, para o tablet deitado que ainda vê tabela", () => {
    const html = renderToStaticMarkup(
      <TabelaCartao>
        <table />
      </TabelaCartao>,
    );
    expect(html).toContain("overflow-x-auto");
  });

  it("não engole classes de quem a usa", () => {
    const html = renderToStaticMarkup(
      <TabelaCartao className="mt-4">
        <table />
      </TabelaCartao>,
    );
    expect(html).toContain("mt-4");
    expect(html).toContain("tabela-cartao");
  });
});

// O CSS é a metade invisível do recurso: sem ele a classe não faz nada. Como Tailwind 4 não
// gera classe interpolada, estas regras vivem no globals.css e são verificadas aqui.
describe("CSS do cartão", () => {
  const css = readFileSync("src/app/globals.css", "utf8");

  it("vira cartão abaixo de 768px — o mesmo breakpoint da Sidebar", () => {
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain(".tabela-cartao");
  });

  it("usa o rótulo da célula como etiqueta do valor", () => {
    expect(css).toContain("attr(data-rotulo)");
  });

  it("célula sem rótulo não mostra etiqueta vazia", () => {
    expect(css).toContain("[data-rotulo]::before");
  });

  it("a linha de estado vazio (colSpan) não vira lista de rótulos", () => {
    expect(css).toContain("td[colspan]");
  });
});
