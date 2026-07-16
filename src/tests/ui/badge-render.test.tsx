import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Badge } from "@/components/ui/Badge";

describe("Badge", () => {
  it("a variante atencao usa o token da marca, não o amber do Tailwind", () => {
    const html = renderToStaticMarkup(<Badge variante="atencao">Em constituição</Badge>);
    expect(html).not.toContain("amber");
    expect(html).toContain("atencao");
  });

  it("as outras variantes seguem inalteradas", () => {
    expect(renderToStaticMarkup(<Badge variante="positivo">ok</Badge>)).toContain("verde");
    expect(renderToStaticMarkup(<Badge variante="ia">IA</Badge>)).toContain("violeta");
  });
});
