import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/followup/actions", () => ({
  salvarConfigFollowup: vi.fn(),
  criarEtapaFollowup: vi.fn(),
  salvarEtapaFollowup: vi.fn(),
  removerEtapaFollowup: vi.fn(),
  reordenarEtapasFollowup: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { FormFollowup } from "@/app/(app)/configuracoes/followup/FormFollowup";
import type { FollowupView } from "@/app/(app)/configuracoes/followup/actions";

const cfg: FollowupView = {
  config: { canal: "email", ativo: false },
  etapas: [{ id: "e1", diasOffset: 3, assunto: "Sobre a proposta", template: "Olá {prospect}", ordem: 1, ativa: true }],
};

describe("FormFollowup", () => {
  it("renderiza canal, interruptor e etapas", () => {
    const html = renderToStaticMarkup(<FormFollowup cfg={cfg} />);
    expect(html).toContain("Canal");
    expect(html).toContain("Ativo");
    expect(html).toContain("Sobre a proposta");
    expect(html).toContain("Adicionar etapa");
    expect(html).toContain("{prospect}"); // legenda das variáveis
  });
});
