import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/obrigacoes/actions", () => ({ salvarConfigEscalonamento: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { ConfigEscalonamento } from "@/app/(app)/configuracoes/obrigacoes/ConfigEscalonamento";

describe("ConfigEscalonamento", () => {
  it("renderiza o checkbox e os limiares", () => {
    const html = renderToStaticMarkup(<ConfigEscalonamento inicial={{ ativo: true, diasLider: 7, diasSocio: 15 }} />);
    expect(html).toContain("Escalonamento de atrasos");
    expect(html).toContain("líder");
    expect(html).toContain("sócio");
  });
});
