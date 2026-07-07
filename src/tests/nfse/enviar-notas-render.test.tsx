import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/(app)/nfse/lote/envio", () => ({
  listarNotasParaEnvio: vi.fn(),
  enviarNotaWhatsapp: vi.fn(),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { EnviarNotasWhatsapp } from "@/components/nfse/EnviarNotasWhatsapp";

describe("EnviarNotasWhatsapp", () => {
  it("renderiza sem lançar", () => {
    const html = renderToStaticMarkup(<EnviarNotasWhatsapp />);
    expect(html).toContain("Enviar notas");
  });
});
