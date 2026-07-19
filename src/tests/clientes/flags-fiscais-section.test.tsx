import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/clientes/[id]/flags-actions", () => ({ salvarFlagFiscal: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { FlagsFiscaisSection } from "@/components/clientes/FlagsFiscaisSection";

describe("FlagsFiscaisSection", () => {
  it("renderiza as três flags tri-state e o valor derivado", () => {
    const html = renderToStaticMarkup(
      <FlagsFiscaisSection
        clienteId="c1"
        podeEditar
        valores={{ folha: null, icms: true, iss: null }}
        derivados={{ folha: true, icms: false, iss: false }}
      />,
    );
    expect(html).toContain("Flags fiscais");
    expect(html).toContain("Contribui ICMS");
    expect(html).toContain("Auto");
  });
});
