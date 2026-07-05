import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Campo } from "@/components/ui/Campo";
import { Input } from "@/components/ui/Input";
import { Iniciais } from "@/components/ui/Iniciais";
import { EmptyState } from "@/components/ui/EmptyState";

describe("primitivos", () => {
  it("Campo mostra o label e a mensagem de erro", () => {
    const html = renderToStaticMarkup(
      <Campo label="E-mail" erro="Obrigatório">
        <Input id="email" />
      </Campo>,
    );
    expect(html).toContain("<label");
    expect(html).toContain("E-mail");
    expect(html).toContain("Obrigatório");
  });
  it("Iniciais mostra as iniciais do nome", () => {
    expect(renderToStaticMarkup(<Iniciais nome="Moura Purcell" />)).toContain("MP");
  });
  it("EmptyState renderiza título", () => {
    expect(renderToStaticMarkup(<EmptyState titulo="Nada aqui" />)).toContain("Nada aqui");
  });
});
