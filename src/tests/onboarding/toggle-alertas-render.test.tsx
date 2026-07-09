import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/onboarding/alertas-actions", () => ({ definirAlertasAtivos: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { ToggleAlertas } from "@/app/(app)/configuracoes/onboarding/ToggleAlertas";

describe("ToggleAlertas", () => {
  it("mostra o estado ligado", () => {
    const html = renderToStaticMarkup(<ToggleAlertas ativoInicial={true} />);
    expect(html).toContain("Notificações de prazo");
    expect(html).toContain("ligadas");
  });
  it("mostra o estado desligado", () => {
    const html = renderToStaticMarkup(<ToggleAlertas ativoInicial={false} />);
    expect(html).toContain("desligadas");
  });
});
