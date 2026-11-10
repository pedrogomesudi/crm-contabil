import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Badge } from "@/components/ui/Badge";

describe("Badge", () => {
  it("a variante atencao usa o token da marca, não o amber do Tailwind", () => {
    const html = renderToStaticMarkup(<Badge variante="atencao">Em constituição</Badge>);
    expect(html).not.toContain("amber");
    expect(html).toContain("atencao");
  });

  // "Assinado pelo cliente" e "Enviado" são pendências diferentes: uma espera a gente, a outra
  // espera o cliente. Enquanto dividiam o mesmo estilo, 18 contratos ficaram parados sem
  // ninguém notar. Se alguém voltar a igualá-los, este teste cai.
  it("acao e atencao não podem renderizar igual", () => {
    const acao = renderToStaticMarkup(<Badge variante="acao">Assinado pelo cliente</Badge>);
    const atencao = renderToStaticMarkup(<Badge variante="atencao">Enviado</Badge>);
    expect(acao.replace("Assinado pelo cliente", "")).not.toBe(atencao.replace("Enviado", ""));
  });

  it("acao é preenchida com o token sólido da marca, não com amber", () => {
    const html = renderToStaticMarkup(<Badge variante="acao">Assinado pelo cliente</Badge>);
    expect(html).not.toContain("amber");
    expect(html).toContain("bg-atencao-solido");
  });

  it("as outras variantes seguem inalteradas", () => {
    expect(renderToStaticMarkup(<Badge variante="positivo">ok</Badge>)).toContain("verde");
    expect(renderToStaticMarkup(<Badge variante="ia">IA</Badge>)).toContain("violeta");
  });
});
