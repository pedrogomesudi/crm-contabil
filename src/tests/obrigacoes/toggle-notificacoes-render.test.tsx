import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/obrigacoes/actions", () => ({ definirNotificacaoRiscos: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { ToggleNotificacoes } from "@/app/(app)/configuracoes/obrigacoes/ToggleNotificacoes";

describe("ToggleNotificacoes", () => {
  it("mostra o estado ligado", () => {
    const html = renderToStaticMarkup(<ToggleNotificacoes ativoInicial={true} />);
    expect(html).toContain("Badge de riscos no menu");
    expect(html).toContain("ligado");
  });
  it("mostra o estado desligado", () => {
    const html = renderToStaticMarkup(<ToggleNotificacoes ativoInicial={false} />);
    expect(html).toContain("desligado");
  });
});
