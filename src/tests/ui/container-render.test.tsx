import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Container } from "@/components/ui/Container";

describe("Container", () => {
  it("centraliza sempre (o conteúdo hoje fica colado à esquerda)", () => {
    expect(renderToStaticMarkup(<Container>x</Container>)).toContain("mx-auto");
  });
  it("padrão é a régua média", () => {
    expect(renderToStaticMarkup(<Container>x</Container>)).toContain("max-w-[1280px]");
  });
  it("estreita para formulários focados", () => {
    expect(renderToStaticMarkup(<Container largura="estreita">x</Container>)).toContain("max-w-[720px]");
  });
  it("larga é fluida (tabelões e calendário)", () => {
    const html = renderToStaticMarkup(<Container largura="larga">x</Container>);
    expect(html).toContain("max-w-full");
  });
});
