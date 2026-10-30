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
//
// As asserções são estruturais, não por substring do arquivo inteiro: `css.toContain(...)`
// passaria mesmo que a regra tivesse saído do @media (max-width: 767px), perdido o prefixo
// `.tabela-cartao`, ou sobrado num comentário — e fora do media query o cartão valeria
// também no desktop. Por isso recortamos o bloco do media query e asserimos dentro dele.
describe("CSS do cartão", () => {
  const css = readFileSync("src/app/globals.css", "utf8");

  // Recorta o bloco do media query: assertar no arquivo inteiro deixaria passar uma regra que
  // saiu de dentro dele — e fora do media query o cartão valeria também no desktop.
  function blocoCartao(conteudo: string): string {
    const i = conteudo.indexOf("@media (max-width: 767px)");
    if (i === -1) throw new Error("bloco @media do cartão não encontrado em globals.css");
    // da abertura até a chave que fecha o media query, contando aninhamento
    let nivel = 0;
    for (let j = conteudo.indexOf("{", i); j < conteudo.length; j++) {
      if (conteudo[j] === "{") nivel++;
      else if (conteudo[j] === "}" && --nivel === 0) return conteudo.slice(i, j + 1);
    }
    throw new Error("bloco @media do cartão não fecha");
  }

  const bloco = blocoCartao(css);

  it("vira cartão abaixo de 768px — o mesmo breakpoint da Sidebar", () => {
    expect(css).toContain("@media (max-width: 767px)");
    expect(bloco).toContain(".tabela-cartao");
  });

  it("não vive fora do media query — senão o cartão valeria também no desktop", () => {
    const antes = css.slice(0, css.indexOf("@media (max-width: 767px)"));
    expect(antes).not.toContain(".tabela-cartao");
  });

  it("o cabeçalho some dentro do bloco, com o prefixo da classe", () => {
    expect(bloco).toContain(".tabela-cartao thead");
  });

  it("usa o rótulo da célula como etiqueta do valor, dentro do bloco", () => {
    expect(bloco).toContain(".tabela-cartao td[data-rotulo]::before");
    expect(bloco).toContain("attr(data-rotulo)");
  });

  it("célula sem rótulo não mostra etiqueta vazia", () => {
    expect(bloco).toContain("[data-rotulo]::before");
  });

  it("a linha de estado vazio (colSpan) não vira lista de rótulos", () => {
    expect(bloco).toContain(".tabela-cartao tr:has(td[colspan])");
  });

  it("célula de colspan com data-rotulo por engano não mostra etiqueta sobre a mensagem vazia", () => {
    expect(bloco).toContain(".tabela-cartao td[colspan][data-rotulo]::before");
    // precisa anular o content do rótulo, não apenas existir
    const regra = bloco.match(/\.tabela-cartao td\[colspan\]\[data-rotulo\]::before\s*\{[^}]*\}/);
    expect(regra?.[0]).toContain("content: none");
  });
});
