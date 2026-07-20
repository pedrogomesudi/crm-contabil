import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AvisoSuspensao } from "@/components/portal/AvisoSuspensao";

describe("AvisoSuspensao", () => {
  it("banner cita pendência financeira e os boletos", () => {
    const html = renderToStaticMarkup(<AvisoSuspensao variante="banner" />);
    expect(html).toContain("suspenso");
    expect(html).toContain("boletos");
  });
  it("bloqueio nomeia o recurso travado", () => {
    const html = renderToStaticMarkup(<AvisoSuspensao variante="bloqueio" recurso="Documentos" />);
    expect(html).toContain("Documentos");
    expect(html).toContain("boletos");
  });
});
