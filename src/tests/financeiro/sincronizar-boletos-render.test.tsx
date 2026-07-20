import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { ContasReceber } from "@/components/financeiro/ContasReceber";

describe("ContasReceber — sincronização", () => {
  it("mostra o botão de sincronizar boletos", () => {
    const html = renderToStaticMarkup(<ContasReceber contas={[]} automacaoInicial={false} />);
    expect(html).toContain("Sincronizar boletos pagos (Inter)");
  });
});
